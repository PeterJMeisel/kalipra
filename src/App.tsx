import { useEffect, useMemo, useRef, useState } from 'react'
import data from './data/livsmedel.json'
import fineli from './data/fineli.json'
import usda from './data/usda.json'
import nutrition from './data/nutrition.json'
import { bmi, BMR_FORMULAS, energyNeed, goalPlan, kcalToKj, normalizeFormula, PAL_OPTIONS, withExtraEnergy } from './core/energy'
import { reproEnergyMJ, reproFrom } from './core/references'
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
import { Workspace } from './ui/Workspace'

const db = new FoodDatabase([data as unknown as FoodData, fineli as unknown as FoodData, usda as unknown as FoodData, nutrition as unknown as FoodData])
const SUMMARY_KEYS: NutrientKey[] = ['ENERC|kcal', 'PROT', 'FAT', 'CHO', 'FIBT', 'FASAT', 'SUGFR', 'VITA', 'VITD', 'VITE',
  'THIACLHCL', 'RIBF', 'NIAEQ', 'VITB6', 'FOL', 'VITB12', 'VITC', 'CA', 'P', 'K', 'MG', 'FE', 'ZN', 'ID', 'SE', 'NACL']

const ACTIVE_KEY = 'kalipra.activePatient'
const ANON_KEY = 'kalipra.anonCalc'
const emptyAnon = (): Calculation => ({ id: 'anon', personId: '', createdAt: new Date().toISOString(), weightKg: 70, pal: 1.2, goal: null, days: 1, entries: [] })
/** Startinnehåll för en ny kostregistrering. */
const startDiary = () => ({ days: 1, entries: [] })
type View = 'start' | 'ny' | 'berakning' | 'undernaring' | 'koppla-ny' | 'oversikt' | 'patienter'
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
  const [activeId, setActiveId] = useState<string | null>(() => {
    try { return localStorage.getItem(ACTIVE_KEY) } catch { return null }
  })
  const [pickNew, setPickNew] = useState(false)
  const [anonMode, setAnonMode] = useState(false)
  /** Patientlistan öppnad från kostregistrering utan patient: registreringen följer med till vald patient. */
  const [carryAnon, setCarryAnon] = useState(false)
  const [anon, setAnon] = useState<Calculation>(() => {
    try { const a = JSON.parse(localStorage.getItem(ANON_KEY) ?? 'null'); if (a && Array.isArray(a.entries)) return a } catch { /* ignorera */ }
    return emptyAnon()
  })
  useEffect(() => { try { localStorage.setItem(ANON_KEY, JSON.stringify(anon)) } catch { /* ignorera */ } }, [anon])
  useEffect(() => {
    try { if (activeId) localStorage.setItem(ACTIVE_KEY, activeId); else localStorage.removeItem(ACTIVE_KEY) } catch { /* ignorera */ }
  }, [activeId])

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
  const activePerson = personById(activeId)

  /** Laddar patienten: den visas i bannern och används av Patientöversikt och Bedöm undernäring. */
  function activate(personId: string) {
    setAnonMode(false)
    setActiveId(personId)
    const t = now()
    setState(s => ({ ...s, persons: s.persons.map(p => (p.id === personId ? { ...p, lastOpenedAt: t } : p)) }))
  }
  function openPatientList() {
    setCarryAnon(anonMode && view === 'oversikt' && anon.entries.length > 0)
    setPickNew(false)
    go('patienter')
  }

  function open(id: string, startTab: Tab = 'resultat') {
    const c = state.calculations.find(x => x.id === id)
    if (c) activate(c.personId)
    setCalcId(id)
    setTab(startTab)
    go('berakning')
  }
  /** Öppnar patienten i översikten: senaste beräkningen, eller en ny om det inte finns någon. */
  function openOverview(personId: string) {
    if (carryAnon) { attachAnon(personId, 70); return }
    setAnonMode(false)
    activate(personId)
    go('oversikt')
    const last = calculationsFor(state, personId)[0]
    if (last) { setCalcId(last.id); return }
    const p = personById(personId)
    const w = p ? sortWeights(p.weights ?? []).at(-1)?.kg : undefined
    const c: Calculation = { id: newId(), personId, createdAt: now(), updatedAt: now(), weightKg: w ?? 70, pal: 1.2, goal: null, days: 1, entries: [] }
    setState(s => ({ ...s, calculations: [...s.calculations, c] }))
    setCalcId(c.id)
    setMessage(w === undefined ? 'Ny beräkning skapad. Kontrollera vikten under fliken Patient.' : `Ny beräkning skapad med senaste vikten ${formatNumber(w, 1)} kg.`)
  }
  /** Skapar en beräkning för patienten med kostregistreringen som gjordes utan patient. */
  function attachAnon(personId: string, weightKg: number) {
    const p = personById(personId)
    const last = calculationsFor(state, personId)[0]
    const c: Calculation = { id: newId(), personId, createdAt: now(), updatedAt: now(), weightKg: currentWeight(state, personId)?.kg ?? last?.weightKg ?? weightKg, pal: last?.pal ?? 1.2, goal: null, bmrFormula: last?.bmrFormula, days: anon.days, entries: anon.entries }
    setState(s => ({ ...s, calculations: [...s.calculations, c] }))
    setAnon(emptyAnon())
    setCarryAnon(false)
    activate(personId)
    go('oversikt')
    setCalcId(c.id)
    setMessage(`Kostregistreringen är kopplad till ${p?.code ?? 'patienten'}.`)
  }
  /** Ny beräkning: direkt till kostregistreringen. Med laddad patient skapas en ny beräkning för den, annars registreras utan patient. */
  function newCalculation() {
    if (activePerson) {
      const last = calculationsFor(state, activePerson.id)[0]
      const w = currentWeight(state, activePerson.id)?.kg ?? last?.weightKg ?? 70
      const c: Calculation = { id: newId(), personId: activePerson.id, createdAt: now(), updatedAt: now(), weightKg: w, pal: last?.pal ?? 1.2, goal: null, bmrFormula: last?.bmrFormula, ...startDiary() }
      setState(s => ({ ...s, calculations: [...s.calculations, c] }))
      activate(activePerson.id)
      setAnonMode(false)
      setCalcId(c.id)
      go('oversikt')
    } else {
      setAnon({ ...emptyAnon(), ...startDiary() })
      setAnonMode(true)
      setCalcId(null)
      go('oversikt')
    }
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
    const c: Calculation = { ...calc, id: newId(), personId: p.id, createdAt: now(), updatedAt: now(), ...startDiary() }
    setState(s => ({ ...s, persons: [...s.persons, { ...p, lastOpenedAt: now() }], calculations: [...s.calculations, c] }))
    setActiveId(p.id)
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
      setPickNew(false); setView('patienter')
      setMessage(`Hämtade ${plural(imported.persons.length, 'patient', 'patienter')} med ${plural(imported.calculations.length, 'beräkning', 'beräkningar')} från filen`
        + ` (${newPatients} nya, ${imported.persons.length - newPatients} uppdaterade).`)
    } catch (e) {
      setPickNew(false); setView('patienter')
      setMessage(e instanceof Error && e.message.includes('giltig') ? e.message : 'Filen kunde inte läsas. Välj en fil som har exporterats från Kalipra.')
    }
    if (fileRef.current) fileRef.current.value = ''
  }

  /* Undernäringsbedömning */
  const assessPerson = personById(assessPersonId)
  const assessLatestCalc = assessPerson ? calculationsFor(state, assessPerson.id)[0] : undefined
  function linkToExisting(personId: string) {
    activate(personId)
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
    const repro = reproFrom(client.health, client.sex)
    const baseNeed = energyNeed(client.sex, client.age, client.weightKg, client.heightCm, client.pal, formula)
    const need = repro ? withExtraEnergy(baseNeed, reproEnergyMJ(repro), repro.kind === 'gravid' ? `graviditet (trimester ${repro.trimester})` : 'amning') : baseNeed
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

  const activeWeight = activePerson ? (currentWeight(state, activePerson.id)?.kg ?? calculationsFor(state, activePerson.id)[0]?.weightKg) : undefined
  const activeBmi = activePerson && activeWeight && activePerson.heightCm ? bmi(activeWeight, activePerson.heightCm) : null
  const sortedPersons = [...state.persons].sort((a, b) =>
    (b.lastOpenedAt ?? b.updatedAt ?? b.createdAt).localeCompare(a.lastOpenedAt ?? a.updatedAt ?? a.createdAt))

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
        <div className="patientbar" aria-label="Laddad patient">
          {activePerson ? (
            <span className="pb-info">
              <span className="pb-code">{activePerson.code}</span>
              <span className="pb-facts">{activePerson.age} år{activeBmi !== null && <> · BMI {formatNumber(activeBmi, 1)}</>}</span>
            </span>
          ) : (
            <span className="pb-none">Ingen patient vald</span>
          )}
          <button type="button" className={`pb-btn ${view === 'patienter' ? 'on' : ''}`} onClick={openPatientList}>
            Välj patient
          </button>
        </div>
        <div className="topright">
          {view !== 'start' && (
            <nav className="topnav">
              <button className={view === 'oversikt' && anonMode ? 'on' : ''} onClick={newCalculation}>Ny beräkning</button>
              <button className={view === 'oversikt' && !anonMode ? 'on' : ''} onClick={() => (activePerson ? openOverview(activePerson.id) : openPatientList())}>Patientöversikt</button>
              <button className={navOn(['undernaring', 'koppla-ny'])} onClick={() => { if (activePerson) setAssessPersonId(activePerson.id); go('undernaring') }}>Bedöm undernäring</button>
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

      {view === 'patienter' && (
        <main className="main narrow">
          <h1>Välj patient</h1>
          {pickNew ? (
            <>
              <p><button type="button" className="linkback" onClick={() => setPickNew(false)}>← Tillbaka till patientlistan</button></p>
              <h2 className="sub">Ny patient</h2>
              <ClientForm key="ny-patient" submitLabel="Skapa patient" onCancel={() => setPickNew(false)}
                onSave={f => {
                  const r = createPerson(f)
                  setAnonMode(false)
                  if (carryAnon) {
                    setState(s => ({ ...s, calculations: s.calculations.map(c => (c.id === r.calcId ? { ...c, days: anon.days, entries: anon.entries } : c)) }))
                    setAnon(emptyAnon()); setCarryAnon(false)
                    go('oversikt'); setCalcId(r.calcId); setMessage(`Kostregistreringen är kopplad till ${f.code}.`)
                  } else { go('oversikt'); setCalcId(r.calcId) }
                }} />
            </>
          ) : (
            <>
              <div className="loadactions pl-actions">
                <button className="primary" onClick={() => { setMessage(''); setPickNew(true) }}>+ Ny patient</button>
                <button onClick={() => fileRef.current?.click()}>Importera patienter …</button>
                {state.persons.length > 0 && !exportSel && <button onClick={() => { setMessage(''); setExportSel(new Set()) }}>Exportera …</button>}
                {activePerson && <button onClick={() => { setActiveId(null); setCalcId(null); setAssessPersonId(null); setMessage('Ingen patient är laddad.') }}>Stäng patient</button>}
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
              {carryAnon && <p className="msg">Kostregistreringen du har gjort ({plural(anon.entries.length, 'livsmedel', 'livsmedel')}) kopplas till den patient du väljer eller skapar.{' '}
                <button type="button" className="small" onClick={() => setCarryAnon(false)}>Koppla inte</button></p>}
              {message && <p className="msg">{message}</p>}
              <h2 className="sub">Mina patienter <span className="muted">· senast öppnad först</span></h2>
              {sortedPersons.length === 0
                ? <p className="empty">Inga patienter ännu. Skapa en ny patient eller importera från fil.</p>
                : <PersonPicker weightOf={p => currentWeight(state, p.id)?.kg} persons={sortedPersons} actionLabel="Ladda" keepOrder
                    detail={p => (p.id === activeId ? 'Laddad nu · ' : '') + (p.lastOpenedAt ? `öppnad ${dayText(p.lastOpenedAt)}` : `skapad ${dayText(p.createdAt)}`)}
                    onPick={id => openOverview(id)}
                    selected={exportSel ?? undefined}
                    onToggle={id => setExportSel(prev => { const n = new Set(prev); if (n.has(id)) n.delete(id); else n.add(id); return n })} />}
            </>
          )}
        </main>
      )}

      {view === 'start' && (
        <main className="start">
          <div className="starthero">
            <div className="startlogo"><Logo size={96} /></div>
            <h1>Kalipra</h1>
            <p className="lead">Verktyg för dietister</p>
          </div>
          <div className="bigchoices">
            <button className="bigbtn primary" onClick={newCalculation}>
              <svg viewBox="0 0 48 48" aria-hidden="true"><circle cx="24" cy="24" r="21" fill="none" stroke="currentColor" strokeWidth="3" /><path d="M24 14v20M14 24h20" stroke="currentColor" strokeWidth="3.5" strokeLinecap="round" /></svg>
              <span className="bt">Ny beräkning</span>
            </button>
            <button className="bigbtn" onClick={() => (activePerson ? openOverview(activePerson.id) : openPatientList())}>
              <svg viewBox="0 0 48 48" aria-hidden="true"><circle cx="18" cy="16" r="7" fill="none" stroke="currentColor" strokeWidth="3" /><path d="M5 40c1.5-8 6.5-12 13-12s11.5 4 13 12" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" /><path d="M32 14h11M32 22h11M36 30h7" stroke="currentColor" strokeWidth="3" strokeLinecap="round" /></svg>
              <span className="bt">Patientöversikt</span>
            </button>
            <button className="bigbtn" onClick={() => { if (activePerson) setAssessPersonId(activePerson.id); go('undernaring') }}>
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
                ? <p className="empty">Inga patienter ännu.</p>
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
                  <p className="facts">Ingen patient kopplad.</p>
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
              data={{ weights: assessPerson.weights ?? [], health: assessPerson.health, heightCm: assessPerson.heightCm, age: assessPerson.age, sex: assessPerson.sex, glim: assessPerson.glim }}
              onChange={patch => patchPerson(assessPerson.id, { ...(patch.weights ? { weights: patch.weights } : {}), ...(patch.health ? { health: patch.health } : {}), ...(patch.heightCm ? { heightCm: patch.heightCm } : {}), ...(patch.glim ? { glim: patch.glim } : {}), ...(patch.age ? { age: patch.age } : {}), ...(patch.sex ? { sex: patch.sex } : {}) })}
              calcWeightKg={assessLatestCalc?.weightKg}
              onUseLatestWeight={kg => assessLatestCalc && patchCalc(assessLatestCalc.id, { weightKg: kg })}
            />
          ) : (
            <Assessment
              key="draft"
              data={state.draft}
              onChange={patch => setState(s => ({ ...s, draft: { ...s.draft, ...patch, health: patch.health ?? s.draft.health } }))}
            />
          )}
        </main>
      )}

      {view === 'koppla-ny' && (
        <main className="main narrow">
          <h1>Koppla till ny patient</h1>
          <ClientForm submitLabel="Skapa patient och koppla" onSave={linkToNew} onCancel={() => go('undernaring')}
            prefill={{ age: state.draft.age, sex: state.draft.sex, heightCm: state.draft.heightCm, weightKg: sortWeights(state.draft.weights).at(-1)?.kg, health: state.draft.health }} />
        </main>
      )}

      {view === 'oversikt' && anonMode && (
        <main className="main wsmain">
          <section className="clienthead ws-head">
            <div className="chtop">
              <div>
                <h1>Kostregistrering</h1>
                <p className="facts">Ingen patient vald – intaget visas utan behov och rekommendationer.</p>
              </div>
              <div className="actions">
                <button className="small primary" onClick={openPatientList}>Välj patient</button>
              </div>
            </div>
          </section>
          <Workspace key="anon" db={db} person={null} calc={anon} onPatchPerson={() => {}}
            onPatchCalc={p => setAnon(a => ({ ...a, ...p }))} onPickPatient={openPatientList} />
        </main>
      )}

      {view === 'oversikt' && !anonMode && !(calculation && calcPerson) && (
        <main className="main narrow">
          <h1>Patientöversikt</h1>
          {message && <p className="msg">{message}</p>}
          {state.persons.length === 0 ? (
            <>
              <p className="empty">Inga patienter ännu.</p>
              <div className="actions">
                <button className="primary" onClick={() => startNewCalc(null)}>Ny beräkning</button>
                <button onClick={() => fileRef.current?.click()}>Hämta patient från fil …</button>
              </div>
            </>
          ) : (
            <>
              <p className="note">Välj patient att öppna i översikten.</p>
              <PersonPicker weightOf={p => currentWeight(state, p.id)?.kg} persons={state.persons} actionLabel="Öppna"
                detail={p => plural(state.calculations.filter(c => c.personId === p.id).length, 'kostberäkning', 'kostberäkningar')}
                onPick={openOverview} />
            </>
          )}
        </main>
      )}

      {view === 'oversikt' && !anonMode && calculation && calcPerson && (
        <main className="main wsmain">
          <section className="clienthead ws-head">
            <div className="chtop">
              <div>
                <h1>{calcPerson.code}</h1>
                <p className="facts">
                  {calcPerson.sex === 'kvinna' ? 'Kvinna' : 'Man'}, {calcPerson.age} år · {formatNumber(calculation.weightKg, 1)} kg · {formatNumber(calcPerson.heightCm, 0)} cm · BMI {formatNumber(bmi(calculation.weightKg, calcPerson.heightCm), 1)} · PAL {formatNumber(calculation.pal, 2)}
                </p>
              </div>
              <div className="actions">
                {personCalcs.length > 1 && (
                  <select aria-label="Beräkning" value={calculation.id} onChange={e => setCalcId(e.target.value)}>
                    {personCalcs.map((c, i) => <option key={c.id} value={c.id}>{dayText(c.createdAt)}{i === 0 ? ' (senaste)' : ''}</option>)}
                  </select>
                )}
                <button className="small" onClick={() => open(calculation.id, 'resultat')}>Fullständigt resultat →</button>
                <button className="small" onClick={() => { setAssessPersonId(calcPerson.id); go('undernaring') }}>Bedöm undernäring</button>
                <button className="small" onClick={openPatientList}>Byt patient</button>
              </div>
            </div>
            {message && <p className="msg">{message}</p>}
          </section>
          <Workspace
            key={calculation.id}
            db={db}
            person={calcPerson}
            calc={calculation}
            onPatchPerson={p => patchPerson(calcPerson.id, p)}
            onPatchCalc={p => patchCalc(calculation.id, p)}
          />
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
