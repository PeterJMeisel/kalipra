import { useEffect, useMemo, useRef, useState } from 'react'
import data from './data/livsmedel.json'
import fineli from './data/fineli.json'
import usda from './data/usda.json'
import { bmi, BMR_FORMULAS, energyNeed, goalPlan, kcalToKj, normalizeFormula, PAL_OPTIONS } from './core/energy'
import { FoodDatabase, SOURCES, summarizeDiary, type FoodData } from './core/foods'
import { formatNumber, type NutrientKey } from './core/nutrients'
import { AGE_GROUP_LABEL, ageGroup } from './core/references'
import { calculationsFor, currentWeight, linkDraft, loadState, mergeImport, newId, parseState, saveState, subsetPersons, type AppState } from './core/storage'
import { KNOWN_CONDITIONS, splitClient, toClient, type Calculation, type Client, type Diary, type Person } from './core/types'
import { sortWeights } from './core/weights'
import { ClientForm } from './ui/ClientForm'
import { DiaryEditor } from './ui/DiaryEditor'
import { Results } from './ui/Results'
import { Assessment, PersonPicker } from './ui/Malnutrition'

const db = new FoodDatabase([data as unknown as FoodData, fineli as unknown as FoodData, usda as unknown as FoodData])
const SUMMARY_KEYS: NutrientKey[] = ['ENERC|kcal', 'PROT', 'FAT', 'CHO', 'FIBT', 'FASAT', 'SUGFR', 'VITA', 'VITD', 'VITE',
  'THIACLHCL', 'RIBF', 'NIAEQ', 'VITB6', 'FOL', 'VITB12', 'VITC', 'CA', 'P', 'K', 'MG', 'FE', 'ZN', 'ID', 'SE', 'NACL']

type View = 'start' | 'ny' | 'berakning' | 'undernaring' | 'koppla-ny' | 'oversikt'
type Tab = 'registrering' | 'resultat' | 'uppgifter'

const now = () => new Date().toISOString()
const dateText = (iso?: string) =>
  iso ? new Date(iso).toLocaleString('sv-SE', { dateStyle: 'medium', timeStyle: 'short' }) : '–'
const dayText = (iso: string) => new Date(iso).toLocaleDateString('sv-SE', { year: 'numeric', month: 'short', day: 'numeric' })
const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`

export default function App() {
  const [state, setState] = useState<AppState>(() => loadState())
  const [view, setView] = useState<View>('start')
  const [calcId, setCalcId] = useState<string | null>(null)
  const [tab, setTab] = useState<Tab>('registrering')
  /** Ny beräkning: 'lista' = patientlistan (eller vald patient), 'ny' = formulär för ny patient */
  const [nyMode, setNyMode] = useState<'lista' | 'ny'>('lista')
  const [nyPersonId, setNyPersonId] = useState<string | null>(null)
  /** Undernäringsbedömning: null = okopplad bedömning */
  const [assessPersonId, setAssessPersonId] = useState<string | null>(null)
  const [linking, setLinking] = useState(false)
  /** Exportläge i patientlistan: valda patienter */
  const [exportSel, setExportSel] = useState<Set<string> | null>(null)
  const [saved, setSaved] = useState(true)
  const [message, setMessage] = useState('')
  const [theme, setTheme] = useState<'light' | 'dark'>(() => {
    try { return localStorage.getItem('kalipra.theme') === 'dark' ? 'dark' : 'light' } catch { return 'light' }
  })
  useEffect(() => {
    document.documentElement.setAttribute('data-kalipra-theme', theme)
    try { localStorage.setItem('kalipra.theme', theme) } catch { /* lagring kan saknas */ }
  }, [theme])
  const fileRef = useRef<HTMLInputElement>(null)

  useEffect(() => { setSaved(saveState(state)) }, [state])
  useEffect(() => { window.scrollTo(0, 0) }, [view])

  function go(v: View) {
    setMessage('')
    setLinking(false)
    setExportSel(null)
    setView(v)
  }

  const personById = (id: string | null) => state.persons.find(p => p.id === id) ?? null
  const calculation = state.calculations.find(c => c.id === calcId) ?? null
  const calcPerson = calculation ? personById(calculation.personId) : null
  const client: Client | null = calculation && calcPerson ? toClient(calcPerson, calculation) : null
  const diary: Diary | null = calculation ? { clientId: calculation.id, days: calculation.days, entries: calculation.entries } : null
  const personCalcs = calcPerson ? calculationsFor(state, calcPerson.id) : []

  function open(id: string, startTab: Tab = 'resultat') {
    setCalcId(id)
    setTab(startTab)
    go('berakning')
  }
  function startNewCalc(personId: string | null) {
    setNyMode('lista')
    setNyPersonId(personId)
    go('ny')
  }

  /** Skapar person + första beräkning. Returnerar id:n. */
  function createPerson(form: Omit<Client, 'id' | 'createdAt'>): { personId: string; calcId: string } {
    const { person, calc } = splitClient(form)
    const p: Person = { ...person, id: newId(), createdAt: now(), updatedAt: now() }
    const c: Calculation = { ...calc, id: newId(), personId: p.id, createdAt: now(), updatedAt: now(), days: 1, entries: [] }
    setState(s => ({ ...s, persons: [...s.persons, p], calculations: [...s.calculations, c] }))
    return { personId: p.id, calcId: c.id }
  }
  function createCalcFor(personId: string, form: Omit<Client, 'id' | 'createdAt'>) {
    const { person, calc } = splitClient(form)
    const c: Calculation = { ...calc, id: newId(), personId, createdAt: now(), updatedAt: now(), days: 1, entries: [] }
    setState(s => ({
      ...s,
      persons: s.persons.map(p => (p.id === personId ? { ...p, ...person, updatedAt: now() } : p)),
      calculations: [...s.calculations, c],
    }))
    open(c.id, 'registrering')
  }
  function patchPerson(id: string, patch: Partial<Person>) {
    setState(s => ({ ...s, persons: s.persons.map(p => (p.id === id ? { ...p, ...patch, updatedAt: now() } : p)) }))
  }
  function patchCalc(id: string, patch: Partial<Calculation>) {
    setState(s => ({ ...s, calculations: s.calculations.map(c => (c.id === id ? { ...c, ...patch, updatedAt: now() } : c)) }))
  }
  function updateFromForm(form: Omit<Client, 'id' | 'createdAt'>) {
    if (!calculation) return
    const { person, calc } = splitClient(form)
    patchPerson(calculation.personId, person)
    patchCalc(calculation.id, calc)
    setTab('resultat')
  }
  function deleteCalc(id: string) {
    setState(s => ({ ...s, calculations: s.calculations.filter(c => c.id !== id) }))
    setCalcId(null)
    startNewCalc(null)
    setNyMode('lista')
  }
  function setDiary(d: Diary) {
    patchCalc(d.clientId, { days: d.days, entries: d.entries })
  }

  async function exportPatients(personIds: string[]) {
    const ps = state.persons.filter(p => personIds.includes(p.id))
    const name = ps.length === 1
      ? `kalipra-${ps[0].code.replace(/[^\wåäöÅÄÖ-]+/g, '_')}-${now().slice(0, 10)}`
      : `kalipra-${ps.length}-patienter-${now().slice(0, 10)}`
    const json = JSON.stringify(subsetPersons(state, personIds), null, 2)
    try {
      const a = document.createElement('a')
      a.href = URL.createObjectURL(new Blob([json], { type: 'application/json' }))
      a.download = `${name}.json`
      a.click()
    } catch { /* nedladdning kan vara blockerad */ }
    try {
      await navigator.clipboard.writeText(json)
      setMessage(`${plural(ps.length, 'patient', 'patienter')} exporterad${ps.length === 1 ? '' : 'e'} till fil. Innehållet finns också i urklipp.`)
    } catch {
      setMessage(`${plural(ps.length, 'patient', 'patienter')} exporterad${ps.length === 1 ? '' : 'e'} till fil.`)
    }
  }

  async function importFile(file: File) {
    try {
      const imported = parseState(await file.text())
      const existing = new Set(state.persons.map(p => p.id))
      const newPatients = imported.persons.filter(p => !existing.has(p.id)).length
      const { state: next } = mergeImport(state, imported)
      setState(next)
      setNyMode('lista'); setNyPersonId(null); setView('ny')
      setMessage(`Hämtade ${plural(imported.persons.length, 'patient', 'patienter')} med ${plural(imported.calculations.length, 'beräkning', 'beräkningar')} från filen`
        + ` (${newPatients} nya, ${imported.persons.length - newPatients} uppdaterade).`)
    } catch (e) {
      setNyMode('lista'); setNyPersonId(null); setView('ny')
      setMessage(e instanceof Error && e.message.includes('giltig') ? e.message : 'Filen kunde inte läsas. Välj en fil som har exporterats från Kalipra.')
    }
    if (fileRef.current) fileRef.current.value = ''
  }

  /* Undernäringsbedömning */
  const assessPerson = personById(assessPersonId)
  const assessLatestCalc = assessPerson ? calculationsFor(state, assessPerson.id)[0] : undefined
  function linkToExisting(personId: string) {
    const r = linkDraft(state, personId)
    setState(r.state)
    setAssessPersonId(personId)
    setLinking(false)
    const code = personById(personId)?.code ?? ''
    setMessage(`Bedömningen är kopplad till ${code}.` + (r.skippedWeights ? ` ${plural(r.skippedWeights, 'vikt', 'vikter')} hoppades över eftersom ${code} redan har en vikt samma datum.` : ''))
  }
  function linkToNew(form: Omit<Client, 'id' | 'createdAt'>) {
    const { personId } = createPerson(form)
    setState(s => linkDraft(s, personId).state)
    setAssessPersonId(personId)
    setView('undernaring')
    setMessage(`Bedömningen är kopplad till ${form.code}.`)
  }

  const calc = useMemo(() => {
    if (!client || !diary) return null
    const formula = normalizeFormula(client.bmrFormula)
    const need = energyNeed(client.sex, client.age, client.weightKg, client.heightCm, client.pal, formula)
    const plan = client.goal ? goalPlan(client.sex, client.age, client.weightKg, client.heightCm, client.pal, client.goal, formula) : null
    const summary = summarizeDiary(db, diary.entries, diary.days, SUMMARY_KEYS)
    return { need, plan, summary }
  }, [client, diary])

  const nyPerson = personById(nyPersonId)
  const nyPrefill: Client | undefined = nyPerson
    ? (() => {
        const last = calculationsFor(state, nyPerson.id)[0]
        const w = sortWeights(nyPerson.weights ?? []).at(-1)
        const base = last ?? { weightKg: w?.kg ?? 70, pal: 1.2, goal: null, bmrFormula: undefined }
        return { ...toClient(nyPerson, { ...(last ?? { id: '', personId: nyPerson.id, createdAt: now(), days: 1, entries: [] }), ...base } as Calculation), weightKg: w && (!last || w.date >= last.createdAt.slice(0, 10)) ? w.kg : base.weightKg }
      })()
    : undefined

  const navOn = (v: View[]) => (v.includes(view) ? 'on' : '')

  return (
    <div className="app">
      <input ref={fileRef} type="file" accept="application/json,.json" hidden
        onChange={e => e.target.files?.[0] && importFile(e.target.files[0])} />
      <header className="top">
        <button className="brand" onClick={() => go('start')} aria-label="Till startsidan">
          <Logo size={34} />
          <span>Kalipra<span className="tag">Verktyg för dietister</span></span>
        </button>
        <div className="topright">
          {view !== 'start' && (
            <nav className="topnav">
              <button className={navOn(['ny'])} onClick={() => startNewCalc(null)}>Ny beräkning</button>
              <button className={navOn(['oversikt'])} onClick={() => go('oversikt')}>Patientöversikt</button>
              <button className={navOn(['undernaring', 'koppla-ny'])} onClick={() => go('undernaring')}>Bedöm undernäring</button>
            </nav>
          )}
          <button type="button" className="themeswitch" role="switch" aria-checked={theme === 'dark'} aria-label="Mörkt läge"
            title={theme === 'dark' ? 'Mörkt läge på' : 'Mörkt läge av'} onClick={() => setTheme(t => (t === 'dark' ? 'light' : 'dark'))}>
            <svg className="ic sun" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="4" fill="none" stroke="currentColor" strokeWidth="2" /><path d="M12 2.5v2M12 19.5v2M2.5 12h2M19.5 12h2M5.3 5.3l1.4 1.4M17.3 17.3l1.4 1.4M5.3 18.7l1.4-1.4M17.3 6.7l1.4-1.4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" /></svg>
            <span className="track"><span className="knob" /></span>
            <svg className="ic moon" viewBox="0 0 24 24" aria-hidden="true"><path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z" fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" /></svg>
          </button>
        </div>
      </header>

      {!saved && <p className="savewarn">Webbläsaren tillåter inte lokal lagring här. Exportera beräkningen till fil för att behålla den.</p>}

      {view === 'start' && (
        <main className="start">
          <div className="starthero">
            <div className="startlogo"><Logo size={96} /></div>
            <h1>Kalipra</h1>
            <p className="lead">Verktyg för dietister</p>
          </div>
          <div className="bigchoices">
            <button className="bigbtn primary" onClick={() => startNewCalc(null)}>
              <svg viewBox="0 0 48 48" aria-hidden="true"><circle cx="24" cy="24" r="21" fill="none" stroke="currentColor" strokeWidth="3" /><path d="M24 14v20M14 24h20" stroke="currentColor" strokeWidth="3.5" strokeLinecap="round" /></svg>
              <span className="bt">Ny beräkning</span>
              <span className="bs">För en ny eller befintlig patient</span>
            </button>
            <button className="bigbtn" onClick={() => go('oversikt')}>
              <svg viewBox="0 0 48 48" aria-hidden="true"><circle cx="18" cy="16" r="7" fill="none" stroke="currentColor" strokeWidth="3" /><path d="M5 40c1.5-8 6.5-12 13-12s11.5 4 13 12" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" /><path d="M32 14h11M32 22h11M36 30h7" stroke="currentColor" strokeWidth="3" strokeLinecap="round" /></svg>
              <span className="bt">Patientöversikt</span>
            </button>
            <button className="bigbtn" onClick={() => go('undernaring')}>
              <svg viewBox="0 0 48 48" aria-hidden="true"><path d="M8 40h32" stroke="currentColor" strokeWidth="3" strokeLinecap="round" /><path d="M24 8v20" stroke="currentColor" strokeWidth="3" strokeLinecap="round" /><path d="M10 18h28l-4 14H14z" fill="none" stroke="currentColor" strokeWidth="3" strokeLinejoin="round" /><circle cx="24" cy="8" r="3" fill="currentColor" /></svg>
              <span className="bt">Bedöm undernäring</span>
            </button>
          </div>
          <p className="source center">Livsmedelsdata: {db.sources.map(s => `${SOURCES[s.id].credit}, hämtad ${new Date(s.fetched).toLocaleDateString('sv-SE')}`).join(' · ')}. Referensvärden: NNR 2023.</p>
        </main>
      )}

      {view === 'ny' && (
        <main className="main narrow">
          <h1>Ny beräkning</h1>
          {nyMode === 'ny' && (
            <>
              <p><button type="button" className="linkback" onClick={() => setNyMode('lista')}>← Tillbaka till patientlistan</button></p>
              <h2 className="sub">Ny patient</h2>
              <ClientForm key="ny" onSave={f => open(createPerson(f).calcId, 'registrering')} onCancel={() => setNyMode('lista')} />
            </>
          )}
          {nyMode === 'lista' && !nyPerson && (
            <>
              <button className="newpatient" onClick={() => { setMessage(''); setExportSel(null); setNyMode('ny') }}>
                <svg viewBox="0 0 48 48" aria-hidden="true"><circle cx="24" cy="24" r="21" fill="none" stroke="currentColor" strokeWidth="3" /><path d="M24 14v20M14 24h20" stroke="currentColor" strokeWidth="3.5" strokeLinecap="round" /></svg>
                <span>Ny patient</span>
              </button>
              <div className="loadactions">
                <button onClick={() => fileRef.current?.click()}>Hämta patient från fil …</button>
                {state.persons.length > 0 && !exportSel && <button onClick={() => { setMessage(''); setExportSel(new Set()) }}>Exportera patient …</button>}
              </div>
              {exportSel && (
                <div className="exportbar">
                  <span>Kryssa i de patienter du vill exportera.</span>
                  <button className="small" onClick={() => setExportSel(exportSel.size === state.persons.length ? new Set() : new Set(state.persons.map(p => p.id)))}>
                    {exportSel.size === state.persons.length ? 'Avmarkera alla' : 'Markera alla'}
                  </button>
                  <button className="small primary" disabled={exportSel.size === 0} onClick={() => { exportPatients([...exportSel]); setExportSel(null) }}>
                    Exportera {exportSel.size > 0 ? `(${exportSel.size})` : ''}
                  </button>
                  <button className="small" onClick={() => setExportSel(null)}>Avbryt</button>
                </div>
              )}
              {message && <p className="msg">{message}</p>}
              <h2 className="sub">Mina patienter</h2>
              {state.persons.length === 0
                ? <p className="empty">Inga patienter ännu. Börja med <strong>Ny patient</strong>.</p>
                : <PersonPicker weightOf={p => currentWeight(state, p.id)?.kg} persons={state.persons} actionLabel="Välj"
                    detail={p => plural(state.calculations.filter(c => c.personId === p.id).length, 'kostberäkning', 'kostberäkningar')}
                    onPick={id => { setMessage(''); setNyPersonId(id) }}
                    selected={exportSel ?? undefined}
                    onToggle={id => setExportSel(prev => { const n = new Set(prev); if (n.has(id)) n.delete(id); else n.add(id); return n })} />}
            </>
          )}
          {nyMode === 'lista' && nyPerson && nyPrefill && (
            <>
              <p className="msg">Ny beräkning för <strong>{nyPerson.code}</strong>. Uppgifterna är hämtade från senaste beräkningen – ändra det som är nytt, t.ex. vikt.{' '}
                <button type="button" className="small" onClick={() => setNyPersonId(null)}>Tillbaka till patientlistan</button></p>
              <SavedCalcs calcs={calculationsFor(state, nyPerson.id)} onOpen={id => open(id)} />
              <h2 className="sub">Ny beräkning</h2>
              <ClientForm key={nyPerson.id} initial={nyPrefill} submitLabel="Skapa beräkning" onSave={f => createCalcFor(nyPerson.id, f)} onCancel={() => setNyPersonId(null)} />
            </>
          )}
        </main>
      )}

      {view === 'undernaring' && (
        <main className="main">
          <section className="clienthead">
            <div className="chtop">
              <div>
                <h1>Bedöm undernäring</h1>
                {assessPerson ? (
                  <p className="facts">Kopplad till <strong>{assessPerson.code}</strong> · {assessPerson.sex === 'kvinna' ? 'Kvinna' : 'Man'}, {assessPerson.age} år · {formatNumber(assessPerson.heightCm, 0)} cm</p>
                ) : (
                  <p className="facts">Ingen patient kopplad. Du kan göra bedömningen direkt och koppla den till en patient när du vill.</p>
                )}
              </div>
              <div className="actions">
                {assessPerson ? (
                  <>
                    <button className="small primary" onClick={() => (assessLatestCalc ? open(assessLatestCalc.id, 'registrering') : startNewCalc(assessPerson.id))}>Kostregistrering →</button>
                    <button className="small" onClick={() => { setAssessPersonId(null); setMessage('') }}>Ny bedömning</button>
                  </>
                ) : (
                  <>
                    <button className="small primary" onClick={() => setLinking(l => !l)} aria-expanded={linking}>Koppla till befintlig patient</button>
                    <button className="small" onClick={() => go('koppla-ny')}>Koppla till ny patient</button>
                  </>
                )}
              </div>
            </div>
            {message && <p className="msg">{message}</p>}
            {linking && !assessPerson && (
              <div className="linkpicker">
                <PersonPicker weightOf={p => currentWeight(state, p.id)?.kg} persons={state.persons} actionLabel="Koppla"
                  detail={p => plural(p.weights?.length ?? 0, 'vägning', 'vägningar')}
                  onPick={linkToExisting} />
              </div>
            )}
          </section>
          {assessPerson ? (
            <Assessment
              key={assessPerson.id}
              data={{ weights: assessPerson.weights ?? [], health: assessPerson.health, heightCm: assessPerson.heightCm }}
              onChange={patch => patchPerson(assessPerson.id, { ...(patch.weights ? { weights: patch.weights } : {}), ...(patch.health ? { health: patch.health } : {}) })}
              calcWeightKg={assessLatestCalc?.weightKg}
              onUseLatestWeight={kg => assessLatestCalc && patchCalc(assessLatestCalc.id, { weightKg: kg })}
            />
          ) : (
            <Assessment
              key="draft"
              data={state.draft}
              askHeight
              onChange={patch => setState(s => ({ ...s, draft: { ...s.draft, ...patch, health: patch.health ?? s.draft.health } }))}
            />
          )}
          {assessPerson && <p className="note">Ändringar sparas direkt och gäller även patientens beräkningar.</p>}
        </main>
      )}

      {view === 'koppla-ny' && (
        <main className="main narrow">
          <h1>Koppla till ny patient</h1>
          <p className="lead">Vikterna och hälsotillstånden från bedömningen följer med. Patienten sparas med en beräkning, så du kan lägga in kostregistrering senare.</p>
          <ClientForm submitLabel="Skapa patient och koppla" onSave={linkToNew} onCancel={() => go('undernaring')}
            prefill={{ heightCm: state.draft.heightCm, weightKg: sortWeights(state.draft.weights).at(-1)?.kg, health: state.draft.health }} />
        </main>
      )}

      {view === 'oversikt' && (
        <main className="main narrow">
          <h1>Patientöversikt</h1>
          <p className="empty">Den här delen byggs i en senare version.</p>
          <div className="actions"><button onClick={() => go('start')}>Till startsidan</button></div>
        </main>
      )}

      {view === 'berakning' && client && diary && calc && calculation && calcPerson && (
        <main className="main">
          <section className="clienthead">
            <div className="chtop">
              <div>
                <h1>{client.code}</h1>
                <p className="facts">
                  {client.sex === 'kvinna' ? 'Kvinna' : 'Man'}, {client.age} år ({AGE_GROUP_LABEL[ageGroup(client.age)]}) · {formatNumber(client.weightKg, 1)} kg · {formatNumber(client.heightCm, 0)} cm · BMI {formatNumber(bmi(client.weightKg, client.heightCm), 1)} · PAL {formatNumber(client.pal, 2)}
                </p>
                {conditionLabels(client).length > 0 && (
                  <ul className="chips" aria-label="Hälsotillstånd">
                    {conditionLabels(client).map(c => <li key={c}>{c}</li>)}
                  </ul>
                )}
              </div>
              <div className="actions">
                <button className="small" onClick={() => startNewCalc(calcPerson.id)}>+ Ny beräkning</button>
                <button className="small" onClick={() => { setAssessPersonId(calcPerson.id); go('undernaring') }}>Bedöm undernäring</button>
                <button className="small" onClick={() => exportPatients([calcPerson.id])}>Exportera patient</button>
              </div>
            </div>
            <div className="calcpick">
              {personCalcs.length > 1 ? (
                <label>
                  Beräkning
                  <select value={calculation.id} onChange={e => open(e.target.value, tab)}>
                    {personCalcs.map((c, i) => <option key={c.id} value={c.id}>{dayText(c.createdAt)} – {formatNumber(c.weightKg, 1)} kg{i === 0 ? ' (senaste)' : ''}</option>)}
                  </select>
                </label>
              ) : (
                <span>Beräkning från {dayText(calculation.createdAt)}</span>
              )}
            </div>
            {message && <p className="msg">{message}</p>}
            <EnergySplit
              bmrKcal={calc.need.bmrKcal}
              totalKcal={calc.need.teeKcal}
              pal={client.pal}
              formula={BMR_FORMULAS.find(f => f.value === normalizeFormula(client.bmrFormula))!.short}
              weightKg={client.weightKg}
            />
            {calc.plan && (
              <div className="goalbox2">
                <span className="gl">Totalt energibehov vid målvikt ({formatNumber(calc.plan.targetWeightKg, 1)} kg)</span>
                <span className="gv">
                  {formatNumber(calc.plan.targetNeed.teeKcal, 0)} kcal{' '}
                  <span className="diff">({calc.plan.differenceKcal < 0 ? '−' : '+'}{formatNumber(Math.abs(calc.plan.differenceKcal), 0)} kcal/dag)</span>
                </span>
                <small>
                  {formatNumber(calc.plan.targetNeed.teeMJ * 1000, 0)} kJ ({calc.plan.differenceKcal < 0 ? '−' : '+'}{formatNumber(Math.abs(kcalToKj(calc.plan.differenceKcal)), 0)} kJ/dag)
                  {' '}· BMR vid målvikt {formatNumber(calc.plan.targetNeed.bmrKcal, 0)} kcal
                  {' '}· {calc.plan.direction === 'nedgång' ? 'underskott' : calc.plan.direction === 'uppgång' ? 'överskott' : 'ingen skillnad'} jämfört med nu
                </small>
              </div>
            )}
          </section>

          <nav className="tabs" role="tablist">
            {([['registrering', 'Kostregistrering'], ['resultat', 'Resultat'], ['uppgifter', 'Uppgifter']] as [Tab, string][]).map(([k, l]) => (
              <button key={k} role="tab" aria-selected={tab === k} className={tab === k ? 'on' : ''} onClick={() => setTab(k)}>{l}</button>
            ))}
          </nav>

          <section className="panel">
            {tab === 'registrering' && <DiaryEditor key={calculation.id} db={db} diary={diary} onChange={setDiary} />}
            {tab === 'resultat' && <Results client={client} summary={calc.summary} need={calc.need} plan={calc.plan} hasEntries={diary.entries.length > 0} />}
            {tab === 'uppgifter' && (
              <>
                <ClientForm key={calculation.id} initial={client} onSave={updateFromForm} />
                <details className="pallist">
                  <summary>Om PAL-nivåerna</summary>
                  <ul>{PAL_OPTIONS.map(o => <li key={o.value}><strong>{formatNumber(o.value, 1)}</strong> {o.label}{o.note ? ` – ${o.note}` : ''}</li>)}</ul>
                </details>
                <DeleteCalc text={`${client.code}, beräkning från ${dayText(calculation.createdAt)}`} onDelete={() => deleteCalc(calculation.id)} />
              </>
            )}
          </section>
        </main>
      )}
    </div>
  )
}

function SavedCalcs({ calcs, onOpen }: { calcs: Calculation[]; onOpen: (id: string) => void }) {
  if (calcs.length === 0) return null
  return (
    <>
      <h2 className="sub">Tidigare beräkningar</h2>
      <ul className="savedlist">
        {calcs.map(c => (
          <li key={c.id}>
            <button onClick={() => onOpen(c.id)}>
              <span className="ccode">Beräkning från {dayText(c.createdAt)}</span>
              <span className="cmeta">{formatNumber(c.weightKg, 1)} kg · PAL {formatNumber(c.pal, 1)} · {plural(c.entries.length, 'livsmedel', 'livsmedel')} registrerade</span>
              <span className="cdate">Ändrad {dateText(c.updatedAt ?? c.createdAt)}</span>
              <span className="open" aria-hidden="true">Öppna →</span>
            </button>
          </li>
        ))}
      </ul>
    </>
  )
}

/** Kalipras logga – samma utseende överallt (även appikon och fliksymbol). */
function Logo({ size }: { size: number }) {
  return (
    <svg className="logo" width={size} height={size} viewBox="0 0 64 64" role="img" aria-label="Kalipra">
      <rect width="64" height="64" rx="14" fill="#3B2A4A" />
      <g transform="translate(8 8) scale(.75)">
        <circle cx="32" cy="32" r="29" fill="none" stroke="#FFFFFF" strokeWidth="4" />
        <path d="M32 10 A22 22 0 0 1 54 32 L32 32 Z" fill="#FFFFFF" />
        <path d="M54 32 A22 22 0 0 1 20.5 50.8 L32 32 Z" fill="#FFFFFF" opacity=".55" />
        <path d="M20.5 50.8 A22 22 0 0 1 32 10 L32 32 Z" fill="#E8A33D" />
      </g>
    </svg>
  )
}

function EnergySplit({ bmrKcal, totalKcal, pal, formula, weightKg }: {
  bmrKcal: number; totalKcal: number; pal: number; formula: string; weightKg: number
}) {
  const activity = totalKcal - bmrKcal
  const bmrPct = (bmrKcal / totalKcal) * 100
  const kj = (kcal: number) => formatNumber(kcalToKj(kcal), 0)
  return (
    <section className="split" aria-label="Energibehov uppdelat på BMR och aktivitet">
      <div className="splithead">
        <span>Totalt energibehov nu ({formatNumber(weightKg, 1)} kg)</span>
        <strong>{formatNumber(totalKcal, 0)} kcal <small>{kj(totalKcal)} kJ</small></strong>
      </div>
      <div className="splitbar" aria-hidden="true">
        <div className="sb-bmr" style={{ width: `${bmrPct}%` }} />
        <div className="sb-act" style={{ width: `${100 - bmrPct}%` }} />
      </div>
      <div className="splitlegend">
        <span><i className="sw-bmr" />BMR, vila ({formula}): <strong>{formatNumber(bmrKcal, 0)} kcal</strong> · {kj(bmrKcal)} kJ · {formatNumber(bmrPct, 0)} %</span>
        <span><i className="sw-act" />Aktivitet (PAL {formatNumber(pal, 2)}): <strong>{formatNumber(activity, 0)} kcal</strong> · {kj(activity)} kJ · {formatNumber(100 - bmrPct, 0)} %</span>
      </div>
      <small className="muted">Totalt = BMR × PAL = {formatNumber(bmrKcal, 0)} × {formatNumber(pal, 2)}</small>
    </section>
  )
}

function conditionLabels(c: Client): string[] {
  const h = c.health
  if (!h) return []
  return h.conditions.filter(x => KNOWN_CONDITIONS.includes(x)).map(x => {
    if (x === 'Kronisk njursjukdom' && h.ckdStage) return `${x}, stadium ${h.ckdStage}`
    if (x === 'Amputation' && h.amputations.length) {
      return `Amputation: ${h.amputations.map(a => `${a.limb === 'arm' ? 'arm' : 'ben'} ${a.side} (${a.level.toLowerCase()})`).join(', ')}`
    }
    return x
  })
}

function DeleteCalc({ text, onDelete }: { text: string; onDelete: () => void }) {
  const [ask, setAsk] = useState(false)
  return (
    <div className="danger">
      {ask ? (
        <>
          <span>Ta bort {text} och dess kostregistrering? Patienten och andra beräkningar finns kvar. Det går inte att ångra.</span>
          <button className="dangerbtn" onClick={onDelete}>Ja, ta bort</button>
          <button onClick={() => setAsk(false)}>Avbryt</button>
        </>
      ) : (
        <button className="linkbtn" onClick={() => setAsk(true)}>Ta bort beräkning</button>
      )}
    </div>
  )
}
