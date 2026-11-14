import { useEffect, useMemo, useState } from 'react'
import data from './data/livsmedel.json'
import { bmi, energyNeed, goalPlan, kcalToKj, PAL_OPTIONS } from './core/energy'
import { FoodDatabase, summarizeDiary, type FoodData } from './core/foods'
import { formatNumber, type NutrientKey } from './core/nutrients'
import { AGE_GROUP_LABEL, ageGroup } from './core/references'
import { loadState, newId, parseState, saveState, type AppState } from './core/storage'
import type { Client, Diary } from './core/types'
import { ClientForm } from './ui/ClientForm'
import { DiaryEditor } from './ui/DiaryEditor'
import { Results } from './ui/Results'

const db = new FoodDatabase(data as unknown as FoodData)
const SUMMARY_KEYS: NutrientKey[] = ['ENERC|kcal', 'PROT', 'FAT', 'CHO', 'FIBT', 'FASAT', 'SUGFR', 'VITA', 'VITD', 'VITE',
  'THIACLHCL', 'RIBF', 'NIAEQ', 'VITB6', 'FOL', 'VITB12', 'VITC', 'CA', 'P', 'K', 'MG', 'FE', 'ZN', 'ID', 'SE', 'NACL']

type Tab = 'registrering' | 'resultat' | 'uppgifter'

export default function App() {
  const [state, setState] = useState<AppState>(() => loadState())
  const [selectedId, setSelectedId] = useState<string | null>(() => loadState().clients[0]?.id ?? null)
  const [creating, setCreating] = useState(false)
  const [tab, setTab] = useState<Tab>('registrering')
  const [saved, setSaved] = useState(true)
  const [dataMsg, setDataMsg] = useState('')

  useEffect(() => { setSaved(saveState(state)) }, [state])

  const client = state.clients.find(c => c.id === selectedId) ?? null
  const diary: Diary | null = client ? state.diaries[client.id] ?? { clientId: client.id, days: 1, entries: [] } : null

  function createClient(c: Omit<Client, 'id' | 'createdAt'>) {
    const nc: Client = { ...c, id: newId(), createdAt: new Date().toISOString() }
    setState(s => ({ ...s, clients: [...s.clients, nc], diaries: { ...s.diaries, [nc.id]: { clientId: nc.id, days: 1, entries: [] } } }))
    setSelectedId(nc.id)
    setCreating(false)
    setTab('registrering')
  }
  function updateClient(c: Omit<Client, 'id' | 'createdAt'>) {
    if (!client) return
    setState(s => ({ ...s, clients: s.clients.map(x => (x.id === client.id ? { ...x, ...c } : x)) }))
    setTab('resultat')
  }
  function deleteClient(id: string) {
    setState(s => {
      const diaries = { ...s.diaries }
      delete diaries[id]
      return { ...s, clients: s.clients.filter(c => c.id !== id), diaries }
    })
    setSelectedId(state.clients.find(c => c.id !== id)?.id ?? null)
  }
  function setDiary(d: Diary) {
    setState(s => ({ ...s, diaries: { ...s.diaries, [d.clientId]: d } }))
  }

  async function exportData() {
    const json = JSON.stringify(state, null, 2)
    try {
      const a = document.createElement('a')
      a.href = URL.createObjectURL(new Blob([json], { type: 'application/json' }))
      a.download = `kostberakning-${new Date().toISOString().slice(0, 10)}.json`
      a.click()
    } catch { /* nedladdning kan vara blockerad */ }
    try {
      await navigator.clipboard.writeText(json)
      setDataMsg('Exporterad. Datan finns också kopierad till urklipp.')
    } catch {
      setDataMsg('Exporten startad som nedladdning.')
    }
  }
  async function importData(file: File) {
    try {
      const next = parseState(await file.text())
      setState(next)
      setSelectedId(next.clients[0]?.id ?? null)
      setDataMsg(`Importerade ${next.clients.length} klienter.`)
    } catch (e) {
      setDataMsg(e instanceof Error ? e.message : 'Kunde inte läsa filen.')
    }
  }

  const calc = useMemo(() => {
    if (!client || !diary) return null
    const need = energyNeed(client.sex, client.age, client.weightKg, client.heightCm, client.pal)
    const plan = client.goal ? goalPlan(client.sex, client.age, client.weightKg, client.heightCm, client.pal, client.goal) : null
    const summary = summarizeDiary(db, diary.entries, diary.days, SUMMARY_KEYS)
    return { need, plan, summary }
  }, [client, diary])

  const showForm = creating || !client

  return (
    <div className="app">
      <header className="top">
        <div className="brand">
          <svg viewBox="0 0 32 32" aria-hidden="true"><circle cx="16" cy="16" r="14" fill="none" stroke="currentColor" strokeWidth="2.5" /><path d="M16 2a14 14 0 0 1 14 14H16z" fill="currentColor" /><path d="M16 16 6.1 25.9A14 14 0 0 1 2 16z" fill="currentColor" opacity=".45" /></svg>
          <span>Kostberäkning</span>
        </div>
        <span className={`savestate ${saved ? '' : 'warn'}`}>{saved ? 'Sparas i den här webbläsaren' : 'Kan inte spara lokalt – exportera för att behålla datan'}</span>
      </header>

      <div className="layout">
        <aside className="side">
          <div className="sidehead">
            <h2>Klienter</h2>
            <button className="primary small" onClick={() => { setCreating(true); setSelectedId(null) }}>+ Ny klient</button>
          </div>
          {state.clients.length === 0 ? (
            <p className="muted">Inga klienter ännu.</p>
          ) : (
            <ul className="clients">
              {state.clients.map(c => (
                <li key={c.id}>
                  <button className={c.id === selectedId && !creating ? 'on' : ''} onClick={() => { setSelectedId(c.id); setCreating(false) }}>
                    <span className="ccode">{c.code}</span>
                    <small>{c.sex === 'kvinna' ? 'K' : 'M'} · {c.age} år · {formatNumber(c.weightKg, 0)} kg</small>
                  </button>
                </li>
              ))}
            </ul>
          )}
          <div className="datatools">
            <button className="small" onClick={exportData} disabled={state.clients.length === 0}>Exportera</button>
            <label className="small filebtn">Importera<input type="file" accept="application/json,.json" onChange={e => e.target.files?.[0] && importData(e.target.files[0])} /></label>
            {dataMsg && <small className="muted">{dataMsg}</small>}
          </div>
          <p className="source">Livsmedelsdata: Livsmedelsverkets livsmedelsdatabas (CC BY 4.0), hämtad {new Date(db.fetched).toLocaleDateString('sv-SE')}, {db.foods.length} livsmedel. Referensvärden: NNR 2023.</p>
        </aside>

        <main className="main">
          {showForm ? (
            <section className="panel">
              <h1>Ny klient</h1>
              <p className="lead">Fyll i grunduppgifter. Energibehovet beräknas med Henrys ekvationer (2005), samma som NNR 2023 använder.</p>
              <ClientForm onSave={createClient} onCancel={state.clients.length ? () => { setCreating(false); setSelectedId(state.clients[0].id) } : undefined} />
            </section>
          ) : client && diary && calc && (
            <>
              <section className="clienthead">
                <div>
                  <h1>{client.code}</h1>
                  <p className="facts">
                    {client.sex === 'kvinna' ? 'Kvinna' : 'Man'}, {client.age} år ({AGE_GROUP_LABEL[ageGroup(client.age)]}) · {formatNumber(client.weightKg, 1)} kg · {formatNumber(client.heightCm, 0)} cm · BMI {formatNumber(bmi(client.weightKg, client.heightCm), 1)} · PAL {formatNumber(client.pal, 2)}
                  </p>
                </div>
                <dl className="needs">
                  <div><dt>BMR</dt><dd>{formatNumber(calc.need.bmrKcal, 0)} kcal<small>{formatNumber(calc.need.bmrMJ, 1)} MJ</small></dd></div>
                  <div><dt>Energibehov</dt><dd>{formatNumber(calc.need.teeKcal, 0)} kcal<small>{formatNumber(calc.need.teeMJ * 1000, 0)} kJ</small></dd></div>
                  {calc.plan && calc.plan.direction !== 'bibehåll' && (
                    <div className="goal">
                      <dt>Mål: {calc.plan.direction} till {formatNumber(client.goal!.targetWeightKg, 1)} kg</dt>
                      <dd>{formatNumber(calc.plan.targetIntakeKcal, 0)} kcal<small>{formatNumber(kcalToKj(calc.plan.targetIntakeKcal), 0)} kJ</small></dd>
                    </div>
                  )}
                </dl>
                {calc.plan && calc.plan.direction !== 'bibehåll' && (
                  <p className="goalline">
                    {calc.plan.dailyAdjustmentKcal < 0 ? 'Underskott' : 'Överskott'} {formatNumber(Math.abs(calc.plan.dailyAdjustmentKcal), 0)} kcal/dag
                    ({formatNumber(client.goal!.paceKgPerWeek, 2)} kg/vecka) · {formatNumber(Math.abs(calc.plan.deltaKg), 1)} kg på cirka {formatNumber(calc.plan.weeksToGoal!, 0)} veckor ·
                    behov vid målvikt {formatNumber(calc.plan.maintenanceAtTargetKcal, 0)} kcal.
                    <span className="muted"> Förenklad modell: 7 700 kcal per kg, utan hänsyn till metabol anpassning.</span>
                    {calc.plan.targetIntakeKcal < calc.need.bmrKcal && <strong className="warntext"> Målintaget ligger under BMR.</strong>}
                  </p>
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
            </>
          )}
        </main>
      </div>
    </div>
  )
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
        <button className="linkbtn" onClick={() => setAsk(true)}>Ta bort klient</button>
      )}
    </div>
  )
}

