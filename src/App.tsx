import { useEffect, useMemo, useRef, useState } from 'react'
import data from './data/livsmedel.json'
import { bmi, BMR_FORMULAS, energyNeed, goalPlan, kcalToKj, normalizeFormula, PAL_OPTIONS } from './core/energy'
import { FoodDatabase, summarizeDiary, type FoodData } from './core/foods'
import { formatNumber, type NutrientKey } from './core/nutrients'
import { AGE_GROUP_LABEL, ageGroup } from './core/references'
import { loadState, mergeImport, newId, parseState, saveState, subset, type AppState } from './core/storage'
import type { Client, Diary } from './core/types'
import { ClientForm } from './ui/ClientForm'
import { DiaryEditor } from './ui/DiaryEditor'
import { Results } from './ui/Results'

const db = new FoodDatabase(data as unknown as FoodData)
const SUMMARY_KEYS: NutrientKey[] = ['ENERC|kcal', 'PROT', 'FAT', 'CHO', 'FIBT', 'FASAT', 'SUGFR', 'VITA', 'VITD', 'VITE',
  'THIACLHCL', 'RIBF', 'NIAEQ', 'VITB6', 'FOL', 'VITB12', 'VITC', 'CA', 'P', 'K', 'MG', 'FE', 'ZN', 'ID', 'SE', 'NACL']

type View = 'start' | 'ny' | 'ladda' | 'berakning' | 'undernaring'
type Tab = 'registrering' | 'resultat' | 'uppgifter'

const now = () => new Date().toISOString()
const dateText = (iso?: string) =>
  iso ? new Date(iso).toLocaleString('sv-SE', { dateStyle: 'medium', timeStyle: 'short' }) : '–'

export default function App() {
  const [state, setState] = useState<AppState>(() => loadState())
  const [view, setView] = useState<View>('start')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [tab, setTab] = useState<Tab>('registrering')
  const [saved, setSaved] = useState(true)
  const [message, setMessage] = useState('')
  const fileRef = useRef<HTMLInputElement>(null)

  useEffect(() => { setSaved(saveState(state)) }, [state])
  useEffect(() => { window.scrollTo(0, 0) }, [view])

  function go(v: View) {
    setMessage('')
    setView(v)
  }

  const client = state.clients.find(c => c.id === selectedId) ?? null
  const diary: Diary | null = client ? state.diaries[client.id] ?? { clientId: client.id, days: 1, entries: [] } : null

  function open(id: string, startTab: Tab = 'resultat') {
    setSelectedId(id)
    setTab(startTab)
    go('berakning')
  }

  function createClient(c: Omit<Client, 'id' | 'createdAt'>) {
    const nc: Client = { ...c, id: newId(), createdAt: now(), updatedAt: now() }
    setState(s => ({ ...s, clients: [...s.clients, nc], diaries: { ...s.diaries, [nc.id]: { clientId: nc.id, days: 1, entries: [] } } }))
    open(nc.id, 'registrering')
  }
  function updateClient(c: Omit<Client, 'id' | 'createdAt'>) {
    if (!client) return
    setState(s => ({ ...s, clients: s.clients.map(x => (x.id === client.id ? { ...x, ...c, updatedAt: now() } : x)) }))
    setTab('resultat')
  }
  function deleteClient(id: string) {
    setState(s => {
      const diaries = { ...s.diaries }
      delete diaries[id]
      return { ...s, clients: s.clients.filter(c => c.id !== id), diaries }
    })
    setSelectedId(null)
    go('ladda')
  }
  function setDiary(d: Diary) {
    setState(s => ({
      ...s,
      diaries: { ...s.diaries, [d.clientId]: d },
      clients: s.clients.map(c => (c.id === d.clientId ? { ...c, updatedAt: now() } : c)),
    }))
  }

  async function exportFile(ids: string[], name: string) {
    const json = JSON.stringify(subset(state, ids), null, 2)
    try {
      const a = document.createElement('a')
      a.href = URL.createObjectURL(new Blob([json], { type: 'application/json' }))
      a.download = `${name}.json`
      a.click()
    } catch { /* nedladdning kan vara blockerad */ }
    try {
      await navigator.clipboard.writeText(json)
      setMessage('Exporterad som fil. Innehållet finns också i urklipp.')
    } catch {
      setMessage('Exporterad som fil.')
    }
  }

  async function importFile(file: File) {
    try {
      const imported = parseState(await file.text())
      const { state: next, added, replaced } = mergeImport(state, imported)
      setState(next)
      if (imported.clients.length === 1) {
        open(imported.clients[0].id)
      } else {
        setView('ladda')
        setMessage(`Hämtade ${imported.clients.length} beräkningar från filen (${added} nya, ${replaced} ersatta).`)
      }
    } catch (e) {
      setView('ladda')
      setMessage(e instanceof Error && e.message.includes('giltig') ? e.message : 'Filen kunde inte läsas. Välj en fil som har exporterats från Kostberäkning.')
    }
    if (fileRef.current) fileRef.current.value = ''
  }

  const calc = useMemo(() => {
    if (!client || !diary) return null
    const formula = normalizeFormula(client.bmrFormula)
    const need = energyNeed(client.sex, client.age, client.weightKg, client.heightCm, client.pal, formula)
    const plan = client.goal ? goalPlan(client.sex, client.age, client.weightKg, client.heightCm, client.pal, client.goal, formula) : null
    const summary = summarizeDiary(db, diary.entries, diary.days, SUMMARY_KEYS)
    return { need, plan, summary }
  }, [client, diary])

  const fileInput = (
    <input ref={fileRef} type="file" accept="application/json,.json" hidden
      onChange={e => e.target.files?.[0] && importFile(e.target.files[0])} />
  )

  return (
    <div className="app">
      {fileInput}
      <header className="top">
        <button className="brand" onClick={() => go('start')} aria-label="Till startsidan">
          <svg viewBox="0 0 32 32" aria-hidden="true"><circle cx="16" cy="16" r="14" fill="none" stroke="currentColor" strokeWidth="2.5" /><path d="M16 2a14 14 0 0 1 14 14H16z" fill="currentColor" /><path d="M16 16 6.1 25.9A14 14 0 0 1 2 16z" fill="currentColor" opacity=".45" /></svg>
          <span>Kostberäkning</span>
        </button>
        {view !== 'start' && (
          <nav className="topnav">
            <button className={view === 'ny' ? 'on' : ''} onClick={() => go('ny')}>Ny beräkning</button>
            <button className={view === 'ladda' ? 'on' : ''} onClick={() => go('ladda')}>Ladda beräkning</button>
            <button className={view === 'undernaring' ? 'on' : ''} onClick={() => go('undernaring')}>Bedöm undernäring</button>
          </nav>
        )}
      </header>

      {!saved && <p className="savewarn">Webbläsaren tillåter inte lokal lagring här. Exportera beräkningen till fil för att behålla den.</p>}

      {view === 'start' && (
        <main className="start">
          <div className="starthero">
            <h1>Kostberäkning</h1>
            <p className="lead">Energibehov, kostregistrering och näringsintag jämfört med NNR 2023.</p>
          </div>
          <div className="bigchoices">
            <button className="bigbtn primary" onClick={() => go('ny')}>
              <svg viewBox="0 0 48 48" aria-hidden="true"><circle cx="24" cy="24" r="21" fill="none" stroke="currentColor" strokeWidth="3" /><path d="M24 14v20M14 24h20" stroke="currentColor" strokeWidth="3.5" strokeLinecap="round" /></svg>
              <span className="bt">Ny beräkning</span>
              <span className="bs">Skapa en ny person och börja registrera</span>
            </button>
            <button className="bigbtn" onClick={() => go('ladda')}>
              <svg viewBox="0 0 48 48" aria-hidden="true"><path d="M5 13a4 4 0 0 1 4-4h10l4 5h16a4 4 0 0 1 4 4v19a4 4 0 0 1-4 4H9a4 4 0 0 1-4-4z" fill="none" stroke="currentColor" strokeWidth="3" strokeLinejoin="round" /><path d="M24 22v11m-5-5 5 5 5-5" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" /></svg>
              <span className="bt">Ladda beräkning</span>
              <span className="bs">
                {state.clients.length > 0
                  ? `Öppna en sparad beräkning (${state.clients.length} st) eller hämta från fil`
                  : 'Hämta en beräkning från en exporterad fil'}
              </span>
            </button>
            <button className="bigbtn" onClick={() => go('undernaring')}>
              <svg viewBox="0 0 48 48" aria-hidden="true"><path d="M8 40h32" stroke="currentColor" strokeWidth="3" strokeLinecap="round" /><path d="M24 8v20" stroke="currentColor" strokeWidth="3" strokeLinecap="round" /><path d="M10 18h28l-4 14H14z" fill="none" stroke="currentColor" strokeWidth="3" strokeLinejoin="round" /><circle cx="24" cy="8" r="3" fill="currentColor" /></svg>
              <span className="bt">Bedöm undernäring</span>
              <span className="bs">Screening och bedömning av undernäring</span>
            </button>
          </div>
          <p className="source center">Livsmedelsdata: Livsmedelsverkets livsmedelsdatabas (CC BY 4.0), hämtad {new Date(db.fetched).toLocaleDateString('sv-SE')}. Referensvärden: NNR 2023.</p>
        </main>
      )}

      {view === 'ny' && (
        <main className="main narrow">
          <h1>Ny beräkning</h1>
          <p className="lead">Fyll i uppgifter om personen. Välj formel för energibehovet – Henry 2005 (som NNR 2023 använder), Mifflin–St Jeor eller reviderad Harris–Benedict.</p>
          <ClientForm onSave={createClient} onCancel={() => go('start')} />
        </main>
      )}

      {view === 'undernaring' && (
        <main className="main narrow">
          <h1>Bedöm undernäring</h1>
          <p className="empty">Den här delen byggs i en senare version.</p>
          <div className="actions"><button onClick={() => go('start')}>Till startsidan</button></div>
        </main>
      )}

      {view === 'ladda' && (
        <main className="main narrow">
          <h1>Ladda beräkning</h1>
          <LoadList
            clients={state.clients}
            onOpen={id => open(id)}
            onPickFile={() => fileRef.current?.click()}
            onExportAll={() => exportFile(state.clients.map(c => c.id), `kostberakning-alla-${now().slice(0, 10)}`)}
            message={message}
          />
        </main>
      )}

      {view === 'berakning' && client && diary && calc && (
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
              <button className="small" onClick={() => exportFile([client.id], `kostberakning-${client.code.replace(/[^\wåäöÅÄÖ-]+/g, '_')}`)}>Exportera till fil</button>
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
            {tab === 'registrering' && <DiaryEditor key={client.id} db={db} diary={diary} onChange={setDiary} />}
            {tab === 'resultat' && <Results client={client} summary={calc.summary} need={calc.need} plan={calc.plan} hasEntries={diary.entries.length > 0} />}
            {tab === 'uppgifter' && (
              <>
                <ClientForm key={client.id} initial={client} onSave={updateClient} />
                <details className="pallist">
                  <summary>Om PAL-nivåerna</summary>
                  <ul>{PAL_OPTIONS.map(o => <li key={o.value}><strong>{formatNumber(o.value, 1)}</strong> {o.label}{o.note ? ` – ${o.note}` : ''}</li>)}</ul>
                </details>
                <DeleteClient code={client.code} onDelete={() => deleteClient(client.id)} />
              </>
            )}
          </section>
        </main>
      )}
    </div>
  )
}

type LoadProps = {
  clients: Client[]
  onOpen: (id: string) => void
  onPickFile: () => void
  onExportAll: () => void
  message: string
}

function LoadList({ clients, onOpen, onPickFile, onExportAll, message }: LoadProps) {
  const [q, setQ] = useState('')
  const sorted = [...clients]
    .sort((a, b) => (b.updatedAt ?? b.createdAt).localeCompare(a.updatedAt ?? a.createdAt))
    .filter(c => c.code.toLowerCase().includes(q.trim().toLowerCase()))
  return (
    <>
      <div className="loadactions">
        <button className="primary" onClick={onPickFile}>Hämta från fil …</button>
        {clients.length > 0 && <button onClick={onExportAll}>Exportera alla till fil</button>}
      </div>
      {message && <p className="msg">{message}</p>}

      <h2 className="sub">Sparade på den här datorn</h2>
      {clients.length === 0 ? (
        <p className="empty">Inga sparade beräkningar ännu. Skapa en ny eller hämta från en exporterad fil.</p>
      ) : (
        <>
          {clients.length > 6 && (
            <input className="filter" type="search" placeholder="Sök på kod …" value={q} onChange={e => setQ(e.target.value)} aria-label="Sök bland sparade beräkningar" />
          )}
          <ul className="savedlist">
            {sorted.map(c => (
              <li key={c.id}>
                <button onClick={() => onOpen(c.id)}>
                  <span className="ccode">{c.code}</span>
                  <span className="cmeta">{c.sex === 'kvinna' ? 'Kvinna' : 'Man'}, {c.age} år · {formatNumber(c.weightKg, 1)} kg · {formatNumber(c.heightCm, 0)} cm</span>
                  <span className="cdate">Ändrad {dateText(c.updatedAt ?? c.createdAt)}</span>
                  <span className="open" aria-hidden="true">Öppna →</span>
                </button>
              </li>
            ))}
            {sorted.length === 0 && <li className="muted">Ingen beräkning matchar sökningen.</li>}
          </ul>
        </>
      )}
      <p className="note">Beräkningar sparas automatiskt i den här webbläsaren på den här datorn. Exportera till fil för att flytta dem till en annan dator eller spara en säkerhetskopia.</p>
    </>
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
  return h.conditions.map(x => {
    if (x === 'Kronisk njursjukdom' && h.ckdStage) return `${x}, stadium ${h.ckdStage}`
    if (x === 'Födoämnesallergi' && h.allergyText) return `${x}: ${h.allergyText}`
    if (x === 'Amputation' && h.amputations.length) {
      return `Amputation: ${h.amputations.map(a => `${a.limb === 'arm' ? 'arm' : 'ben'} ${a.side} (${a.level.toLowerCase()})`).join(', ')}`
    }
    return x
  })
}

function DeleteClient({ code, onDelete }: { code: string; onDelete: () => void }) {
  const [ask, setAsk] = useState(false)
  return (
    <div className="danger">
      {ask ? (
        <>
          <span>Ta bort {code} och all kostregistrering? Det går inte att ångra.</span>
          <button className="dangerbtn" onClick={onDelete}>Ja, ta bort</button>
          <button onClick={() => setAsk(false)}>Avbryt</button>
        </>
      ) : (
        <button className="linkbtn" onClick={() => setAsk(true)}>Ta bort beräkning</button>
      )}
    </div>
  )
}
