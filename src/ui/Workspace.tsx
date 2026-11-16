import { useEffect, useMemo, useRef, useState } from 'react'
import { loadSources, saveSources, SOURCES, summarizeDiary, type Food, type FoodDatabase, type SourceId } from '../core/foods'
import { energyDistribution, formatNumber, NUTRIENTS, type NutrientKey, type NutrientTotals } from '../core/nutrients'
import { fiberReference, macroReferences, microReferences, microStatus, reproEnergyMJ, reproFrom, REPRO_LABEL, type Range, type Repro } from '../core/references'
import { energyNeed, normalizeFormula, withExtraEnergy, type EnergyNeed } from '../core/energy'
import { mealName, sortMeals, type Calculation, type DiaryEntry, type Meal, type Person } from '../core/types'
import { newId } from '../core/storage'
import { SourceTag } from './DiaryEditor'

const SUMMARY_KEYS: NutrientKey[] = ['ENERC|kcal', 'ENERC|kJ', 'PROT', 'FAT', 'CHO', 'FIBT', 'WATER', 'FASAT', 'FAMS', 'FAPU', 'SUGFR', 'ALC',
  'VITA', 'VITD', 'VITE', 'THIACLHCL', 'RIBF', 'NIAEQ', 'VITB6', 'FOL', 'VITB12', 'VITC', 'CA', 'P', 'K', 'MG', 'FE', 'ZN', 'ID', 'SE', 'NACL']

type Props = {
  db: FoodDatabase
  /** null = kostregistrering utan klient: intag visas utan behov och RDI */
  person: Person | null
  calc: Calculation
  onPatchPerson: (patch: Partial<Person>) => void
  onPatchCalc: (patch: Partial<Calculation>) => void
  onPickPatient?: () => void
}


/** Klientöversikt: måltider till vänster, livsmedelssök/klient till höger, näring mot RDI nertill. */
export function Workspace({ db, person, calc, onPatchCalc }: Props) {
  const [day, setDay] = useState(1)
  const [mealSel, setMeal] = useState<Meal>(mealName(1))
  const [bottomTab, setBottomTab] = useState<'rdi' | 'efordelning' | 'jamfor' | 'maltid'>('rdi')
  const [scope, setScope] = useState<'dag' | 'dagar'>('dag')

  const currentDay = Math.min(day, calc.days)
  const entries = calc.entries
  // Måltid 1 … n per dag, plus eventuella äldre namngivna måltider i sparade beräkningar
  const mealNo = (m: string) => Number(/^Måltid (\d+)$/.exec(m)?.[1] ?? 0)
  const countFor = (d: number) => Math.max(1, calc.mealCounts?.[d - 1] ?? calc.meals ?? 1, ...entries.filter(e => e.day === d).map(e => mealNo(e.meal)))
  const mealsFor = (d: number) => sortMeals([
    ...Array.from({ length: countFor(d) }, (_, i) => mealName(i + 1)),
    ...entries.filter(e => e.day === d).map(e => e.meal),
  ])
  const meals = mealsFor(currentDay)
  const meal = meals.includes(mealSel) ? mealSel : meals[0]
  const mealEntries = entries.filter(e => e.day === currentDay && e.meal === meal)
  const dayEntries = entries.filter(e => e.day === currentDay)
  const allCounts = () => Array.from({ length: calc.days }, (_, i) => countFor(i + 1))

  function setEntries(next: DiaryEntry[]) {
    onPatchCalc({ entries: next })
  }
  function addEntry(food: Food, grams: number) {
    setEntries([...entries, { id: newId(), day: currentDay, meal, foodNumber: food.number, ...(food.source !== 'lmv' ? { source: food.source } : {}), grams }])
  }
  function addMeal(): Meal {
    const counts = allCounts()
    counts[currentDay - 1] += 1
    onPatchCalc({ mealCounts: counts })
    const m = mealName(counts[currentDay - 1])
    setMeal(m)
    return m
  }
  // Bekräftelse på knappen i stället för confirm() (blockeras i artefakter): första klick frågar, andra tar bort
  const [armed, setArmed] = useState<string | null>(null)
  useEffect(() => { if (!armed) return; const t = setTimeout(() => setArmed(null), 3000); return () => clearTimeout(t) }, [armed])
  function removeMeal(m: Meal) {
    const inMeal = entries.filter(e => e.day === currentDay && e.meal === m)
    const key = `meal:${currentDay}:${m}`
    if (inMeal.length && armed !== key) { setArmed(key); return }
    setArmed(null)
    // Numrerade måltider efter den borttagna flyttas ner ett steg (bara denna dag)
    const k = mealNo(m)
    const next = entries.filter(e => !(e.day === currentDay && e.meal === m)).map(e => {
      const j = mealNo(e.meal)
      return e.day === currentDay && k && j > k ? { ...e, meal: mealName(j - 1) } : e
    })
    const counts = allCounts()
    if (k) counts[currentDay - 1] = Math.max(1, counts[currentDay - 1] - 1)
    onPatchCalc({ entries: next, mealCounts: counts })
    setMeal(k > 1 ? mealName(k - 1) : mealName(1))
  }
  function addDay() {
    if (calc.days >= 14) return
    onPatchCalc({ days: calc.days + 1, mealCounts: [...allCounts(), 1] })
    setDay(calc.days + 1)
    setMeal(mealName(1))
  }
  function removeDay() {
    const d = calc.days
    const count = entries.filter(e => e.day === d).length
    if (count && armed !== `day:${d}`) { setArmed(`day:${d}`); return }
    setArmed(null)
    onPatchCalc({ days: d - 1, entries: entries.filter(e => e.day !== d), mealCounts: allCounts().slice(0, d - 1) })
    if (day >= d) setDay(d - 1)
  }
  /** Kopierar alla livsmedel i en måltid till en annan (befintlig eller ny) måltid. */
  function copyMeal(fromDay: number, fromMeal: Meal, toDay: number, toMeal: Meal | 'ny') {
    const src = entries.filter(e => e.day === fromDay && e.meal === fromMeal)
    if (!src.length) return
    const counts = allCounts()
    let target = toMeal
    if (toMeal === 'ny') {
      counts[toDay - 1] += 1
      target = mealName(counts[toDay - 1])
    }
    const copies = src.map(e => ({ ...e, id: newId(), day: toDay, meal: target as Meal }))
    onPatchCalc({ entries: [...entries, ...copies], mealCounts: counts })
    setDay(toDay)
    setMeal(target as Meal)
    setCopyOpen(false)
  }
  const [copyOpen, setCopyOpen] = useState(false)

  const weightKg = calc.weightKg
  const repro = person ? reproFrom(person.health, person.sex) : null
  const need = useMemo(() => {
    if (!person) return null
    const n = energyNeed(person.sex, person.age, weightKg, person.heightCm, calc.pal, normalizeFormula(calc.bmrFormula))
    return repro ? withExtraEnergy(n, reproEnergyMJ(repro), repro.kind === 'gravid' ? `graviditet (trimester ${repro.trimester})` : 'amning') : n
  }, [person, weightKg, calc.pal, calc.bmrFormula, repro?.kind, repro && 'trimester' in repro ? repro.trimester : repro && 'period' in repro ? repro.period : null])
  // Läget Dag visar bara den dag som är markerad i kostregistreringen (inte snitt över dagarna)
  const daySummary = useMemo(() => summarizeDiary(db, entries.filter(e => e.day === currentDay), 1, SUMMARY_KEYS), [db, entries, currentDay])
  const scoped = useMemo(() => ({ totals: daySummary.perDay, needKcal: need?.teeKcal ?? 0, needMJ: need?.teeMJ ?? 0, label: `dag ${currentDay}` }), [daySummary, need, currentDay])
  // Läget Dagar: genomsnitt över de dagar som har registreringar (tomma dagar räknas inte)
  const filledDays = new Set(entries.map(e => e.day)).size
  const avgSummary = useMemo(() => summarizeDiary(db, entries, Math.max(1, filledDays), SUMMARY_KEYS), [db, entries, filledDays])
  const avgScoped = useMemo(() => ({ totals: avgSummary.perDay, needKcal: need?.teeKcal ?? 0, needMJ: need?.teeMJ ?? 0, label: `snitt över ${filledDays} ${filledDays === 1 ? 'dag' : 'dagar'}` }), [avgSummary, need, filledDays])
  // Fliken Måltid: bara den måltid som är vald, jämförd med en lika stor andel av dagsbehovet
  const mealShare = 1 / Math.max(1, meals.length)
  const mealScoped = useMemo(() => ({
    totals: daySummary.perMeal[meal] ?? {}, needKcal: (need?.teeKcal ?? 0) * mealShare, needMJ: (need?.teeMJ ?? 0) * mealShare,
    label: `${meal.toLowerCase()}, dag ${currentDay}`, share: mealShare, dayKcal: daySummary.perDay['ENERC|kcal'] ?? 0,
    note: `${meal}, dag ${currentDay}. Jämförs med ${formatNumber(mealShare * 100, 0)} % av dagsbehovet och RDI (jämnt fördelat på ${meals.length} ${meals.length === 1 ? 'måltid' : 'måltider'}).`,
  }), [daySummary, meal, need, mealShare, currentDay, meals.length])
  const view = scope === 'dagar' ? avgScoped : bottomTab === 'maltid' ? mealScoped : scoped

  const kcalOf = (list: DiaryEntry[]) => list.reduce((s, e) => s + ((db.get(e.foodNumber, e.source)?.per100g['ENERC|kcal'] ?? 0) * e.grams) / 100, 0)

  return (
    <div className="ws">
      <section className="ws-meals panelbox" aria-label="Registrerade livsmedel per måltid">
        <div className="ws-daytabs" role="tablist" aria-label="Dag">
          {Array.from({ length: calc.days }, (_, i) => i + 1).map(d => {
            const n = entries.filter(e => e.day === d).length
            return (
              <button key={d} role="tab" aria-selected={currentDay === d} className={currentDay === d ? 'on' : ''} onClick={() => setDay(d)}>
                Dag {d}{n > 0 && <span className="count">{n}</span>}
              </button>
            )
          })}
          {calc.days < 14 && <button type="button" className="ws-add" onClick={addDay}>+ Lägg till dag</button>}
          {calc.days > 1 && (
            <button type="button" className={`ws-remove ${armed === `day:${calc.days}` ? 'armed' : ''}`} onClick={removeDay}>
              {armed === `day:${calc.days}` ? `Ta bort dag ${calc.days} med ${entries.filter(e => e.day === calc.days).length} livsmedel? Klicka igen` : `Ta bort dag ${calc.days}`}
            </button>
          )}
        </div>
        <div className="ws-mealtabs" role="tablist" aria-label="Måltid">
          {meals.map(m => {
            const n = dayEntries.filter(e => e.meal === m).length
            return (
              <button key={m} role="tab" aria-selected={meal === m} className={meal === m ? 'on' : ''} onClick={() => setMeal(m)}>
                {m}{n > 0 && <span className="count">{n}</span>}
              </button>
            )
          })}
          <button type="button" className="ws-add" onClick={addMeal}>+ Lägg till måltid</button>
          {meals.length > 1 && (
            <button type="button" className={`ws-remove ${armed === `meal:${currentDay}:${meal}` ? 'armed' : ''}`} onClick={() => removeMeal(meal)}>
              {armed === `meal:${currentDay}:${meal}` ? `Ta bort ${meal.toLowerCase()} med ${mealEntries.length} livsmedel? Klicka igen` : `Ta bort ${meal.toLowerCase()}`}
            </button>
          )}
        </div>
        <div className="ws-tablewrap">
          {mealEntries.length === 0 ? (
            <p className="empty">Inget registrerat för {meal.toLowerCase()}, dag {currentDay}. Lägg till livsmedel från listan till höger.</p>
          ) : (
            <table className="entries ws-entries">
              <thead><tr><th>Livsmedel</th><th className="num">Mängd</th><th className="num">kcal</th><th></th></tr></thead>
              <tbody>
                {mealEntries.map(e => {
                  const f = db.get(e.foodNumber, e.source)
                  const kcal = ((f?.per100g['ENERC|kcal'] ?? 0) * e.grams) / 100
                  return (
                    <tr key={e.id}>
                      <td className="name">{e.source && e.source !== 'lmv' && <SourceTag source={e.source} />}{f?.name ?? `Okänt livsmedel (${e.foodNumber})`}</td>
                      <td className="num">
                        <input aria-label={`Mängd i ${f?.unit === 'ml' ? 'ml' : 'gram'} för ${f?.name}`} inputMode="decimal" defaultValue={String(e.grams).replace('.', ',')}
                          onBlur={ev => {
                            const g = Number(ev.target.value.replace(',', '.'))
                            if (g > 0) setEntries(entries.map(x => (x.id === e.id ? { ...x, grams: g } : x)))
                            else ev.target.value = String(e.grams).replace('.', ',')
                          }} /> <span className="unit">{f?.unit ?? 'g'}</span>
                      </td>
                      <td className="num kcal">{formatNumber(kcal, 0)}</td>
                      <td className="del"><button type="button" aria-label={`Ta bort ${f?.name}`} onClick={() => setEntries(entries.filter(x => x.id !== e.id))}>×</button></td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          )}
        </div>
        {copyOpen && (
          <CopyMealPanel days={calc.days} mealsFor={mealsFor} entries={entries} fromDay={currentDay} fromMeal={meal}
            onCopy={copyMeal} onClose={() => setCopyOpen(false)} />
        )}
        <div className="ws-totals">
          <span>
            Måltid: <strong>{formatNumber(kcalOf(mealEntries), 0)} kcal</strong>
          </span>
          <button type="button" className={`ws-copybtn ${copyOpen ? 'on' : ''}`} onClick={() => setCopyOpen(o => !o)}
            aria-expanded={copyOpen} disabled={mealEntries.length === 0 && !copyOpen}
            title={mealEntries.length === 0 ? 'Måltiden är tom' : `Kopiera ${meal.toLowerCase()} till en annan måltid`}>
            Kopiera måltid
          </button>
        </div>
      </section>

      <section className="ws-right panelbox" aria-label="Livsmedelssök och klientuppgifter">
        <h3 className="ws-rtitle">Livsmedelssök</h3>
        <FoodPicker db={db} meal={meal} onAdd={addEntry} />
      </section>

      <section className="ws-bottom panelbox" aria-label="Näring i förhållande till rekommendationer">
        <nav className="ws-tabs" role="tablist">
          <button role="tab" aria-selected={bottomTab === 'rdi'} className={bottomTab === 'rdi' ? 'on' : ''} onClick={() => setBottomTab('rdi')}>Överblick</button>
          <button role="tab" aria-selected={bottomTab === 'efordelning'} className={bottomTab === 'efordelning' ? 'on' : ''} onClick={() => setBottomTab('efordelning')}>Energifördelning</button>
          <button role="tab" aria-selected={bottomTab === 'jamfor'} className={bottomTab === 'jamfor' ? 'on' : ''} onClick={() => setBottomTab('jamfor')}>{scope === 'dag' ? 'Måltider' : 'Per dag'}</button>
          {scope === 'dag' && <button role="tab" aria-selected={bottomTab === 'maltid'} className={bottomTab === 'maltid' ? 'on' : ''} onClick={() => setBottomTab('maltid')}>Måltid</button>}
          <span className="ws-scope" role="radiogroup" aria-label="Visa för">
            <button role="radio" aria-checked={scope === 'dag'} className={scope === 'dag' ? 'on' : ''} onClick={() => setScope('dag')}>Dag</button>
            <button role="radio" aria-checked={scope === 'dagar'} className={scope === 'dagar' ? 'on' : ''} onClick={() => { setScope('dagar'); if (bottomTab === 'maltid') setBottomTab('rdi') }}>Dagar</button>
          </span>
        </nav>
        {(bottomTab === 'rdi' || (bottomTab === 'maltid' && scope === 'dag')) && (person && need
          ? <RdiView person={person} repro={repro} weightKg={weightKg} need={need} scoped={view} />
          : <IntakeView scoped={view} />)}
        {bottomTab === 'efordelning' && <MacroView person={person} totals={view.totals} teeMJ={need?.teeMJ} />}
        {bottomTab === 'jamfor' && scope === 'dag' && <MealsCompareView meals={meals} summary={daySummary} entries={dayEntries} day={currentDay} person={person} repro={repro} weightKg={weightKg} need={need} />}
        {bottomTab === 'jamfor' && scope === 'dagar' && <DaysView db={db} entries={entries} days={calc.days} person={person} repro={repro} weightKg={weightKg} need={need} />}
      </section>
    </div>
  )
}

/* ---------- Kopiera måltid ---------- */

function CopyMealPanel({ days, mealsFor, entries, fromDay: d0, fromMeal: m0, onCopy, onClose }: {
  days: number; mealsFor: (d: number) => Meal[]; entries: DiaryEntry[]; fromDay: number; fromMeal: Meal
  onCopy: (fromDay: number, fromMeal: Meal, toDay: number, toMeal: Meal | 'ny') => void; onClose: () => void
}) {
  const [fromDay, setFromDay] = useState(d0)
  const [fromMeal, setFromMeal] = useState<Meal>(m0)
  const [toDay, setToDay] = useState(d0)
  // Målmåltiden måste väljas aktivt innan man kan kopiera
  const [toMeal, setToMeal] = useState<Meal | 'ny' | ''>('')
  const dayOpts = Array.from({ length: days }, (_, i) => i + 1)
  const srcMeals = mealsFor(fromDay)
  const fm = srcMeals.includes(fromMeal) ? fromMeal : srcMeals[0]
  const n = entries.filter(e => e.day === fromDay && e.meal === fm).length
  const tm = toMeal === 'ny' || toMeal === '' || mealsFor(toDay).includes(toMeal) ? toMeal : ''
  return (
    <div className="ws-copy" role="group" aria-label="Kopiera måltid">
      <span className="lbl">Kopiera</span>
      <select aria-label="Från dag" value={fromDay} onChange={e => setFromDay(Number(e.target.value))}>{dayOpts.map(d => <option key={d} value={d}>Dag {d}</option>)}</select>
      <select aria-label="Från måltid" value={fm} onChange={e => setFromMeal(e.target.value)}>{srcMeals.map(m => <option key={m} value={m}>{m}</option>)}</select>
      <span className="lbl">till</span>
      <select aria-label="Till dag" value={toDay} onChange={e => setToDay(Number(e.target.value))}>{dayOpts.map(d => <option key={d} value={d}>Dag {d}</option>)}</select>
      <select aria-label="Till måltid" value={tm} onChange={e => setToMeal(e.target.value)}>
        <option value="" disabled>Välj måltid</option>
        <option value="ny">Ny måltid</option>
        {mealsFor(toDay).filter(m => !(toDay === fromDay && m === fm)).map(m => <option key={m} value={m}>{m}</option>)}
      </select>
      <button type="button" className="primary small" disabled={n === 0 || tm === ''} onClick={() => tm !== '' && onCopy(fromDay, fm, toDay, tm)}>
        Kopiera {n > 0 ? `(${n} livsmedel)` : ''}
      </button>
      <button type="button" className="small" onClick={onClose}>Avbryt</button>
      {n === 0 && <span className="muted">Måltiden är tom.</span>}
    </div>
  )
}

/* ---------- Höger: livsmedelssök ---------- */

function FoodPicker({ db, meal, onAdd }: { db: FoodDatabase; meal: Meal; onAdd: (f: Food, grams: number) => void }) {
  const available = useMemo(() => db.sources.map(s => s.id), [db])
  const [sources, setSources] = useState<SourceId[]>(() => loadSources(available))
  const [query, setQuery] = useState('')
  const [picked, setPicked] = useState<Food | null>(null)
  const [grams, setGrams] = useState('100')
  const gramsRef = useRef<HTMLInputElement>(null)
  const multi = available.length > 1
  const [sourcesOpen, setSourcesOpen] = useState(false)

  // Som i Dietist Net: utan sökord visas listan i bokstavsordning.
  const hits = useMemo(() => {
    if (query.trim()) return db.search(query, 120, sources)
    return db.foods
      .filter(f => sources.includes(f.source))
      .sort((a, b) => a.name.localeCompare(b.name, 'sv'))
      .slice(0, 300)
  }, [db, query, sources])

  function toggleSource(id: SourceId) {
    const next = sources.includes(id) ? sources.filter(s => s !== id) : available.filter(s => s === id || sources.includes(s))
    if (next.length === 0) return
    setSources(next)
    saveSources(next)
  }
  function add() {
    const g = Number(grams.replace(',', '.'))
    if (!picked || !(g > 0)) return
    onAdd(picked, g)
    setPicked(null)
  }

  return (
    <div className="ws-picker">
      <input className="ws-search" type="search" placeholder="Sök livsmedel …" value={query}
        onChange={e => { setQuery(e.target.value); setPicked(null) }} aria-label="Sök livsmedel" />
      <ul className="ws-hits" role="listbox" aria-label="Sökträffar">
        {hits.map(f => (
          <li key={`${f.source}:${f.number}`} role="option" aria-selected={picked === f}>
            <button type="button" className={picked === f ? 'on' : ''}
              onClick={() => { setPicked(f); setTimeout(() => gramsRef.current?.select(), 0) }}>
              <span>{multi && <SourceTag source={f.source} />}{f.name}</span>
              <small>{formatNumber(f.per100g['ENERC|kcal'] ?? 0, 0)} kcal/100 {f.unit}</small>
            </button>
          </li>
        ))}
        {query.trim().length > 1 && hits.length === 0 && <li className="empty">Inga träffar.</li>}
      </ul>
      <div className="ws-addrow">
        <span className="pickedname">{picked ? picked.name : 'Välj ett livsmedel i listan'}</span>
        <label className="inline">{picked?.unit === 'ml' ? 'Ml' : 'Gram'}{' '}
          <input ref={gramsRef} inputMode="decimal" value={grams} onChange={e => setGrams(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') add() }} aria-label="Mängd" />
        </label>
        <button type="button" className="primary" disabled={!picked} onClick={add}>Lägg till {meal.toLowerCase()}</button>
      </div>
      {multi && (
        // Källor: diskret knapp längst ner; öppnas för att bocka i vilka databaser som ska sökas
        <div className="ws-srcwrap">
          <button type="button" className={`small ws-srcbtn ${sourcesOpen ? 'on' : ''}`} aria-expanded={sourcesOpen} onClick={() => setSourcesOpen(o => !o)}>
            Källor
          </button>
          {sourcesOpen && (
            <div className="ws-sources">
              {available.map(id => (
                <label key={id} className="check small">
                  <input type="checkbox" checked={sources.includes(id)} disabled={sources.length === 1 && sources[0] === id} onChange={() => toggleSource(id)} />
                  {SOURCES[id].label}
                </label>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

/* ---------- Nertill: näring mot behov ---------- */

/** share = andel av dagsbehovet/RDI som intaget jämförs med (1 för en dag, t.ex. 1/3 för en av tre måltider) */
type Scoped = { totals: NutrientTotals; needKcal: number; needMJ: number; label: string; share?: number; note?: string; dayKcal?: number }

/** Fliken Måltid: neutral ruta – mängd och stapel för andel av dagens rekommendation, ingen bedömning. */
function ShareBox({ label, value, unit, dayRef, refText }: { label: string; value: number; unit: string; dayRef: number; refText: string }) {
  const pct = dayRef > 0 ? (value / dayRef) * 100 : 0
  return (
    <div className="ws-kcalbox">
      <span className="lbl">{label}</span>
      <span className="val">{formatNumber(value, unit === 'ml' ? 0 : 1)} <small>{unit}</small></span>
      <div className="meter" aria-hidden="true"><div className="fill neutral" style={{ width: `${Math.min(pct, 100)}%` }} /></div>
      <span className="sub"><strong>{formatNumber(pct, 0)} %</strong> av dagens {refText}</span>
    </div>
  )
}

function RdiView({ person, repro, weightKg, need, scoped }: {
  person: Person; repro: Repro | null; weightKg: number
  need: EnergyNeed
  scoped: Scoped
}) {
  const v = (k: NutrientKey) => scoped.totals[k] ?? 0
  const sh = scoped.share ?? 1
  // Fliken Måltid (gäller även när dagen bara har en måltid)
  const isMeal = scoped.dayKcal !== undefined
  const [detailed, setDetailed] = useState(() => { try { return localStorage.getItem('kalipra.microDetail') === '1' } catch { return false } })
  useEffect(() => { try { localStorage.setItem('kalipra.microDetail', detailed ? '1' : '0') } catch { /* ignorera */ } }, [detailed])
  const kcal = v('ENERC|kcal')
  const pct = scoped.needKcal > 0 ? (kcal / scoped.needKcal) * 100 : 0
  const bmrPct = (need.bmrKcal / need.teeKcal) * 100
  const macro = macroReferences(person.age, person.sex, repro, weightKg)
  const proteinPerKg = v('PROT') / weightKg
  const protRef = macro.proteinGPerKg * sh
  const micro = microReferences(person.age, person.sex, need.teeMJ, repro)
    .map(m => {
      const f = sh
      return { ...m, value: m.value * f, ar: m.ar !== undefined ? m.ar * f : undefined, ul: m.ul !== undefined ? m.ul * f : undefined }
    })

  return (
    <div className="ws-rdi">
      {scoped.note && <p className="muted ws-intakenote">{scoped.note}</p>}
      <div className="ws-kcalrow">
        <div className="ws-kcalbox">
          <span className="lbl">Energi, {scoped.label}</span>
          {isMeal ? (() => {
            const pd = need.teeKcal > 0 ? (kcal / need.teeKcal) * 100 : 0
            return (
              <>
                <span className="val">{formatNumber(kcal, 0)} <small>kcal</small></span>
                <div className="meter" aria-hidden="true"><div className="fill neutral" style={{ width: `${Math.min(pd, 100)}%` }} /></div>
                <span className="sub"><strong>{formatNumber(pd, 0)} %</strong> av dagligt energibehov ({formatNumber(need.teeKcal, 0)} kcal)</span>
              </>
            )
          })() : (
            <>
              <span className="val">{formatNumber(kcal, 0)} <small>av {formatNumber(scoped.needKcal, 0)} kcal</small></span>
              <div className="meter" aria-hidden="true">
                <div className="fill" style={{ width: `${Math.min(pct, 150) / 1.5}%` }} />
                <div className="mark" style={{ left: `${100 / 1.5}%` }} />
              </div>
              <span className="sub"><strong>{formatNumber(pct, 0)} %</strong> av dagligt energibehov</span>
            </>
          )}
        </div>
        {scoped.dayKcal !== undefined ? (() => {
          // Fliken Måltid: hur stor del av dagens energibehov måltiden motsvarar
          const dk = need.teeKcal
          const part = dk > 0 ? (kcal / dk) * 100 : 0
          return (
            <div className="ws-kcalbox">
              <span className="lbl">Andel av dagens energibehov</span>
              <span className="val">{formatNumber(part, 0)} <small>%</small></span>
              <div className="meter" aria-hidden="true"><div className="fill" style={{ width: `${Math.min(part, 100)}%` }} /></div>
              <span className="sub">{formatNumber(kcal, 0)} av dagsbehovet {formatNumber(dk, 0)} kcal</span>
            </div>
          )
        })() : (
          <div className="ws-kcalbox">
          <span className="lbl">Energibehov per dag{repro ? ` (${REPRO_LABEL(repro)})` : ''}</span>
          <span className="val">{formatNumber(need.teeKcal, 0)} <small>kcal</small></span>
          <div className="splitbar" aria-hidden="true">
            <div className="sb-bmr" style={{ width: `${bmrPct}%` }} />
            <div className="sb-act" style={{ width: `${100 - bmrPct}%` }} />
          </div>
          <span className="sub">BMR {formatNumber(need.bmrKcal, 0)} kcal · aktivitet {formatNumber(need.teeKcal - need.bmrKcal - (need.extraKcal ?? 0), 0)} kcal
            {need.extraKcal ? <> · {need.extraLabel} +{formatNumber(need.extraKcal, 0)} kcal</> : repro?.kind === 'ammande' ? <> · amning efter 6 mån: inget fast tillägg</> : null}</span>
        </div>
        )}
        <div className="ws-kcalbox">
          <span className="lbl">Protein</span>
          {!isMeal ? (
            <>
              <span className="val">{formatNumber(proteinPerKg, 2)} <small>{isMeal ? 'g/kg' : 'g/kg och dag'}</small></span>
              <div className="meter" aria-hidden="true">
                <div className={`fill ${proteinPerKg >= protRef ? '' : 'low'}`} style={{ width: `${Math.min((proteinPerKg / protRef) * 100, 150) / 1.5}%` }} />
                <div className="mark" style={{ left: `${100 / 1.5}%` }} />
              </div>
              <span className="sub">Rekommendation minst {formatNumber(protRef, 2)} g/kg{macro.proteinAddG ? ` (inkl. +${formatNumber(macro.proteinAddG, 0)} g/dag)` : ''} · <span className={`pill ${proteinPerKg >= protRef ? 'ok' : 'low'}`}>{proteinPerKg >= protRef ? 'Inom' : 'Under'}</span></span>
            </>
          ) : (
            <>
              <span className="val">{formatNumber(v('PROT'), 1)} <small>g</small></span>
              <div className="meter" aria-hidden="true"><div className="fill neutral" style={{ width: `${Math.min((v('PROT') / (macro.proteinGPerKg * weightKg)) * 100, 100)}%` }} /></div>
              <span className="sub"><strong>{formatNumber((v('PROT') / (macro.proteinGPerKg * weightKg)) * 100, 0)} %</strong> av dagens proteinbehov ({formatNumber(macro.proteinGPerKg * weightKg, 0)} g)</span>
            </>
          )}
        </div>
      </div>

      <div className="ws-kcalrow ws-kcalrow2">
        {(() => {
          // Vätska: vatten i all registrerad mat och dryck (g ≈ ml)
          const ml = v('WATER')
          const mlkg = ml / weightKg
          const ref = 30 * sh
          if (isMeal) return <ShareBox label="Vätska" value={ml} unit="ml" dayRef={30 * weightKg} refText={`riktvärde (${formatNumber(30 * weightKg, 0)} ml)`} />
          return (
            <div className="ws-kcalbox">
              <span className="lbl">Vätska</span>
              <span className="val">{formatNumber(ml, 0)} <small>ml · {formatNumber(mlkg, 0)} ml/kg</small></span>
              <div className="meter" aria-hidden="true">
                <div className={`fill ${mlkg >= ref ? '' : 'low'}`} style={{ width: `${Math.min((mlkg / ref) * 100, 150) / 1.5}%` }} />
                <div className="mark" style={{ left: `${100 / 1.5}%` }} />
              </div>
              <span className="sub">Vatten i mat och dryck · riktvärde {formatNumber(ref, 0)} ml/kg ({formatNumber(ref * weightKg, 0)} ml)</span>
            </div>
          )
        })()}
        {(() => {
          const g = v('FIBT')
          const fr = fiberReference(person.age, person.sex, need.teeMJ)
          const refG = fr.minG * sh
          const ok = g >= refG
          if (isMeal) return <ShareBox label="Fiber" value={g} unit="g" dayRef={fr.minG} refText={`rekommendation (${fr.text})`} />
          return (
            <div className="ws-kcalbox">
              <span className="lbl">Fiber</span>
              <span className="val">{formatNumber(g, 1)} <small>g</small></span>
              <div className="meter" aria-hidden="true">
                <div className={`fill ${ok ? '' : 'low'}`} style={{ width: `${Math.min((g / refG) * 100, 150) / 1.5}%` }} />
                <div className="mark" style={{ left: `${100 / 1.5}%` }} />
              </div>
              <span className="sub">Rekommendation {fr.text} · <span className={`pill ${ok ? 'ok' : 'low'}`}>{ok ? 'Inom' : 'Under'}</span></span>
            </div>
          )
        })()}
        {(() => {
          const g = v('NACL')
          const maxG = micro.find(m => m.key === 'NACL')?.value ?? 6
          const over = g > maxG
          if (isMeal) return <ShareBox label="Salt" value={g} unit="g" dayRef={maxG / sh} refText={`högsta mängd (${formatNumber(maxG / sh, 0)} g)`} />
          return (
            <div className="ws-kcalbox">
              <span className="lbl">Salt</span>
              <span className="val">{formatNumber(g, 1)} <small>g</small></span>
              <div className="meter" aria-hidden="true">
                <div className={`fill ${over ? 'high' : ''}`} style={{ width: `${Math.min((g / maxG) * 100, 150) / 1.5}%` }} />
                <div className="mark" style={{ left: `${100 / 1.5}%` }} />
              </div>
              <span className="sub">Rekommendation högst {formatNumber(maxG, 0)} g · <span className={`pill ${over ? 'high' : 'ok'}`}>{over ? 'Över' : 'Inom'}</span></span>
            </div>
          )
        })()}
      </div>

      <div className="ws-h4row">
        <h4 className="ws-h4">{isMeal ? <>Vitaminer och mineraler <span className="muted">· mängd och andel av dagens RDI (NNR 2023)</span></> : `Vitaminer och mineraler i förhållande till RDI (NNR 2023${repro ? `, ${repro.kind}` : ''})`}</h4>
        {!isMeal && <button type="button" className={`small ws-detailbtn ${detailed ? 'on' : ''}`} aria-pressed={detailed} onClick={() => setDetailed(x => !x)}>
          {detailed ? 'Enkel vy' : 'Detaljerad vy'}
        </button>}
      </div>
      <div className={`ws-micros ${detailed && !isMeal ? 'detailed' : ''}`}>
        {micro.filter(m => m.key !== 'NACL').map(m => { // salt visas i egen ruta ovanför
          const d = NUTRIENTS[m.key]
          const val = v(m.key)
          const p = m.value > 0 ? (val / m.value) * 100 : 0
          const st = microStatus(m, val)
          if (isMeal) {
            // Fliken Måltid: exakt mängd och neutral andel av dagens RDI (ingen stapel, ingen färg)
            const dayRef = m.value / sh
            return (
              <div className="ws-micro ws-mealmicro" key={m.key}>
                <span className="mn">{d.label}</span>
                <span className="mv">{formatNumber(val, d.decimals)} {d.unit}</span>
                <span className="mp">{formatNumber(dayRef > 0 ? (val / dayRef) * 100 : 0, 0)} %</span>
              </div>
            )
          }
          return (
            <div className="ws-micro" key={m.key} title={`${d.label}: ${formatNumber(val, d.decimals)} ${d.unit} av ${m.kind === 'max' ? 'högst ' : ''}${formatNumber(m.value, d.decimals)} ${d.unit}`}>
              <span className="mn">{d.label}</span>
              <div className={`bar ${st}`} aria-hidden="true">
                <div style={{ width: `${Math.min(p, 100)}%` }} />
              </div>
              <span className={`mp ${st}`}>{formatNumber(p, 0)} %</span>
              {detailed && (
                <span className="md">
                  {formatNumber(val, d.decimals)} {d.unit}{' '}
                  <span className="ref">({m.kind === 'max' ? 'högst ' : m.kind === 'AI' ? 'AI ' : 'RDI '}{formatNumber(m.value, d.decimals)} {d.unit}{m.kind === 'RI' && m.ar !== undefined && <>, AR {formatNumber(m.ar, d.decimals)} {d.unit}</>}{m.ul !== undefined && <>, UL {formatNumber(m.ul, d.decimals)} {d.unit}</>})</span>
                </span>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

/* ---------- Nertill: jämförelse mellan dagar och mellan måltider ---------- */

/** En kolumn i jämförelsen. share = andel av dagsbehovet som kolumnen jämförs mot (1 för en dag). */
type CompareCol = { label: string; name: string; totals: NutrientTotals; empty: boolean; share: number; extra?: boolean }

function DaysView({ db, entries, days, person, repro, weightKg, need }: {
  db: FoodDatabase; entries: DiaryEntry[]; days: number; person: Person | null; repro: Repro | null
  weightKg: number; need: EnergyNeed | null
}) {
  const perDay = useMemo(
    () => Array.from({ length: days }, (_, i) => {
      const list = entries.filter(e => e.day === i + 1)
      return { day: i + 1, count: list.length, totals: summarizeDiary(db, list, 1, SUMMARY_KEYS).perDay }
    }),
    [db, entries, days],
  )
  // Snitt över de dagar som har registreringar (tomma dagar räknas inte)
  const filled = perDay.filter(d => d.count > 0)
  const avg: NutrientTotals = {}
  for (const d of filled) for (const [k, val] of Object.entries(d.totals) as [NutrientKey, number][]) avg[k] = (avg[k] ?? 0) + val / filled.length
  const cols: CompareCol[] = [
    ...perDay.map(d => ({ label: `Dag ${d.day}`, name: `dag ${d.day}`, totals: d.totals, empty: d.count === 0, share: 1 })),
    ...(filled.length > 1 ? [{ label: `Snitt (${filled.length} dagar)`, name: 'snitt', totals: avg, empty: false, share: 1, extra: true }] : []),
  ]
  if (entries.length === 0) return <p className="empty">Ingen kostregistrering ännu.</p>
  return <CompareView cols={cols} person={person} repro={repro} weightKg={weightKg} need={need} what="dagar" />
}

function MealsCompareView({ meals, summary, entries, day, person, repro, weightKg, need }: {
  meals: Meal[]; day: number; summary: ReturnType<typeof summarizeDiary>; entries: DiaryEntry[]; person: Person | null; repro: Repro | null
  weightKg: number; need: EnergyNeed | null
}) {
  if (entries.length === 0) return <p className="empty">Inget registrerat för dag {day}.</p>
  const share = 1 / Math.max(1, meals.length)
  const cols: CompareCol[] = [
    ...meals.map(m => ({ label: m, name: m.toLowerCase(), totals: summary.perMeal[m] ?? {}, empty: !summary.perMeal[m], share })),
    { label: 'Hela dagen', name: 'hela dagen', totals: summary.perDay, empty: false, share: 1, extra: true },
  ]
  return (
    <>
      <p className="muted ws-intakenote">
        Dag {day}. Varje måltid jämförs med {formatNumber(share * 100, 0)} % av dagsbehovet och RDI (jämnt fördelat på {meals.length} {meals.length === 1 ? 'måltid' : 'måltider'}).
      </p>
      <CompareView cols={cols} person={person} repro={repro} weightKg={weightKg} need={need} what="måltider" />
    </>
  )
}

/** Tabell (värmekarta) eller grupperat stapeldiagram för kolumnerna. Samma funktion för dagar och måltider. */
function CompareView({ cols, person, repro, weightKg, need, what }: {
  cols: CompareCol[]; person: Person | null; repro: Repro | null; weightKg: number; need: EnergyNeed | null; what: 'dagar' | 'måltider'
}) {
  const macro = person ? macroReferences(person.age, person.sex, repro, weightKg) : null
  const micro = person && need ? microReferences(person.age, person.sex, need.teeMJ, repro) : null
  const v = (t: NutrientTotals, k: NutrientKey) => t[k] ?? 0

  type Row = { label: string; cell: (t: NutrientTotals, share: number) => { main: string; sub?: string; st?: string } }
  const rows: Row[] = [
    { label: 'Energi', cell: (t, sh) => {
      const k = v(t, 'ENERC|kcal')
      if (!need) return { main: `${formatNumber(k, 0)} kcal` }
      const p = (k / (need.teeKcal * sh)) * 100
      return { main: `${formatNumber(k, 0)} kcal`, sub: `${formatNumber(p, 0)} % av behovet` }
    } },
    { label: 'Protein', cell: (t, sh) => {
      const g = v(t, 'PROT')
      if (!macro) return { main: `${formatNumber(g, 0)} g` }
      const gk = g / weightKg
      return { main: `${formatNumber(g, 0)} g`, sub: `${formatNumber(gk, 2)} g/kg`, st: gk >= macro.proteinGPerKg * sh ? 'ok' : 'low' }
    } },
    { label: 'Fett', cell: t => ({ main: `${formatNumber(v(t, 'FAT'), 0)} g`, sub: `${formatNumber(energyDistribution(t).fat, 0)} E%` }) },
    { label: 'Kolhydrater', cell: t => ({ main: `${formatNumber(v(t, 'CHO'), 0)} g`, sub: `${formatNumber(energyDistribution(t).carbohydrate, 0)} E%` }) },
    { label: 'Fiber', cell: t => ({ main: `${formatNumber(v(t, 'FIBT'), 1)} g` }) },
  ]
  const microKeys: NutrientKey[] = micro ? micro.map(m => m.key) : ['VITA', 'VITD', 'VITE', 'THIACLHCL', 'RIBF', 'NIAEQ', 'VITB6', 'FOL', 'VITB12', 'VITC', 'CA', 'P', 'K', 'MG', 'FE', 'ZN', 'ID', 'SE', 'NACL']

  const [mode, setMode] = useState<'diagram' | 'tabell'>(() => {
    try { return localStorage.getItem('kalipra.daysMode2') === 'diagram' ? 'diagram' : 'tabell' } catch { return 'tabell' }
  })
  useEffect(() => { try { localStorage.setItem('kalipra.daysMode2', mode) } catch { /* ignorera */ } }, [mode])

  // Underlag för diagrammet: procent av behov/rekommendation per kolumn (bara kolumner med registreringar, utan snitt/hela dagen)
  const series = cols.map((c, i) => ({ ...c, idx: i })).filter(c => !c.empty && !c.extra)
  const chartGroups: ChartGroup[] = []
  if (need && macro && micro) {
    chartGroups.push({ label: 'Energi', bars: series.map(c => ({ idx: c.idx, name: c.name, pct: (v(c.totals, 'ENERC|kcal') / (need.teeKcal * c.share)) * 100, st: 'energy', text: `${formatNumber(v(c.totals, 'ENERC|kcal'), 0)} kcal` })) })
    chartGroups.push({ label: 'Protein', bars: series.map(c => {
      const gk = v(c.totals, 'PROT') / weightKg
      return { idx: c.idx, name: c.name, pct: (gk / (macro.proteinGPerKg * c.share)) * 100, st: gk >= macro.proteinGPerKg * c.share ? 'ok' : 'low', text: `${formatNumber(gk, 2)} g/kg` }
    }) })
    for (const m of micro) {
      const d0 = NUTRIENTS[m.key]
      chartGroups.push({ label: d0.label, bars: series.map(c => {
        const val = v(c.totals, m.key)
        return { idx: c.idx, name: c.name, pct: m.value > 0 ? (val / (m.value * c.share)) * 100 : 0, st: microStatus(m, val / c.share), text: `${formatNumber(val, d0.decimals)} ${d0.unit}` }
      }) })
    }
  }
  const canChart = chartGroups.length > 0
  const legend = series.map(c => ({ idx: c.idx, label: c.label }))

  return (
    <div className="ws-daysview">
      {canChart && (
        <div className="dv-modes" role="radiogroup" aria-label="Visa som">
          <button role="radio" aria-checked={mode === 'tabell'} className={mode === 'tabell' ? 'on' : ''} onClick={() => setMode('tabell')}>Tabell</button>
          <button role="radio" aria-checked={mode === 'diagram'} className={mode === 'diagram' ? 'on' : ''} onClick={() => setMode('diagram')}>Diagram</button>
        </div>
      )}
      {canChart && mode === 'diagram' ? <DaysChart groups={chartGroups} legend={legend} what={what} /> : (
      <table className="ws-daystable">
        <colgroup><col className="dv-label" />{cols.map(c => <col key={c.label} />)}</colgroup>
        <thead><tr><th></th>{cols.map(c => <th key={c.label} className={c.extra ? 'avg' : ''}>{c.label}</th>)}</tr></thead>
        <tbody>
          {rows.map(r => (
            <tr key={r.label}>
              <th scope="row">{r.label}</th>
              {cols.map(c => {
                if (c.empty) return <td key={c.label} className="muted">–</td>
                const x = r.cell(c.totals, c.share)
                return <td key={c.label} className={`${x.st ? `hm ${x.st}` : ''} ${c.extra ? 'avg' : ''}`}><span className="dv-main">{x.main}</span>{x.sub && <span className="dv-sub">{x.sub}</span>}</td>
              })}
            </tr>
          ))}
          <tr className="sect"><th scope="row" colSpan={cols.length + 1}>Vitaminer och mineraler</th></tr>
          {microKeys.map(k => {
            const d = NUTRIENTS[k]
            const ref = micro?.find(m => m.key === k)
            return (
              <tr key={k}>
                <th scope="row">{d.label}</th>
                {cols.map(c => {
                  if (c.empty) return <td key={c.label} className="muted">–</td>
                  const val = v(c.totals, k)
                  if (!ref) return <td key={c.label} className={c.extra ? 'avg' : ''}>{formatNumber(val, d.decimals)} {d.unit}</td>
                  const st = microStatus(ref, val / c.share)
                  return (
                    <td key={c.label} className={`hm ${st} ${c.extra ? 'avg' : ''}`}>
                      <span className="dv-main">{formatNumber(val, d.decimals)} {d.unit}</span>
                      <span className="dv-sub">{formatNumber(ref.value > 0 ? Math.floor((val / (ref.value * c.share)) * 100) : 0, 0)} %</span>
                    </td>
                  )
                })}
              </tr>
            )
          })}
        </tbody>
      </table>
      )}
    </div>
  )
}

type ChartBar = { idx: number; name: string; pct: number; st: string; text: string }
type ChartGroup = { label: string; bars: ChartBar[] }

/** Serie­färger: kategoriska, fast ordning (dag/måltid 1 = första färgen). Högst 8 serier i diagrammet. */
const DAY_COLORS = 8

/** Grupperat stapeldiagram: en grupp per näringsämne, en stapel per dag (färg = dag). Hoptryckt skala 100–200 %. */
function DaysChart({ groups, legend, what }: { groups: ChartGroup[]; legend: { idx: number; label: string }[]; what: 'dagar' | 'måltider' }) {
  const [hover, setHover] = useState<{ g: string; b: ChartBar; x: number; y: number } | null>(null)
  const all = legend
  const shown = all.slice(0, DAY_COLORS).map(b => b.idx)
  const n = shown.length
  const barW = n <= 3 ? 12 : n <= 5 ? 9 : 7
  const gapBar = 2, gapGroup = 18
  const groupW = n * barW + (n - 1) * gapBar
  const left = 52, top = 12, plotH = 230, bottom = 80
  const width = left + groups.length * (groupW + gapGroup) + 8
  const height = top + plotH + bottom
  // Skala: 0–100 % i steg om 25 % (steghöjd S). Över 100 % är skalan hoptryckt: stegen 150 och 200 %
  // är värda 50 % men bara S/2 höga. Värden över 200 % går till toppen och får sitt värde utskrivet.
  const S = plotH / 5
  const MAX = 200
  const y = (p: number) => {
    const v = Math.max(0, Math.min(p, MAX))
    const h = v <= 100 ? (v / 25) * S : 4 * S + ((v - 100) / 50) * (S / 2)
    return top + plotH - h
  }
  const ticks = [0, 25, 50, 75, 100, 150, 200]
  const colorIdx = (idx: number) => shown.indexOf(idx)
  return (
    <div className="dv-chartbox">
      <div className="dv-legend" aria-label={what === 'dagar' ? 'Dagar' : 'Måltider'}>
        {all.slice(0, DAY_COLORS).map(l => <span key={l.idx}><i className={`dc${colorIdx(l.idx)}`} />{l.label}</span>)}
        {all.length > DAY_COLORS && <span className="muted">Diagrammet visar de första {DAY_COLORS} {what} – se tabellen för resten.</span>}
      </div>
      <div className="dv-chartwrap">
        <svg className="dv-chart" width={width} height={height} viewBox={`0 0 ${width} ${height}`} role="img"
          aria-label={`Intag per ${what === 'dagar' ? 'dag' : 'måltid'} i procent av behov och rekommendation`} onMouseLeave={() => setHover(null)}>
          <rect x={left} y={y(MAX)} width={width - 4 - left} height={y(100) - y(MAX)} className="overzone" />
          {ticks.map(t => (
            <g key={t}>
              <line x1={left} x2={width - 4} y1={y(t)} y2={y(t)} className={t === 100 ? 'ref' : 'grid'} />
              <text x={left - 6} y={y(t) + 4} className="tick" textAnchor="end">{t} %</text>
            </g>
          ))}
          {groups.map((g, gi) => {
            const gx = left + 8 + gi * (groupW + gapGroup)
            return (
              <g key={g.label}>
                {g.bars.filter(b => shown.includes(b.idx)).map((b, bi) => {
                  const x = gx + bi * (barW + gapBar)
                  const top0 = y(b.pct)
                  const h = Math.max(0, top + plotH - top0)
                  const r = Math.min(3, h, barW / 2)
                  return (
                    <g key={b.idx}>
                      <rect x={x - 1} y={top} width={barW + 2} height={plotH} fill="transparent"
                        onMouseEnter={() => setHover({ g: g.label, b, x: x + barW / 2, y: top0 })} />
                      <path className={`dvbar dc${colorIdx(b.idx)}`} pointerEvents="none"
                        d={h > 0 ? `M${x},${top + plotH} V${top0 + r} Q${x},${top0} ${x + r},${top0} H${x + barW - r} Q${x + barW},${top0} ${x + barW},${top0 + r} V${top + plotH} Z` : ''} />
                    </g>
                  )
                })}
                <text className="glabel" textAnchor="end" transform={`translate(${gx + groupW / 2 + 4},${top + plotH + 14}) rotate(-40)`}>{g.label}</text>
              </g>
            )
          })}
          <line x1={left} x2={width - 4} y1={top + plotH} y2={top + plotH} className="axis" />
        </svg>
        {hover && (
          // Rutan placeras ovanför stapeln, eller bredvid när stapeln når toppen (så att den inte klipps)
          <div className={`dv-tip ${hover.y < 60 ? 'side' : ''}`} style={hover.y < 60 ? { left: hover.x + 12, top: Math.max(4, hover.y) } : { left: hover.x, top: hover.y - 8 }}>
            <strong><i className={`dc${colorIdx(hover.b.idx)}`} />{hover.g}, {hover.b.name}</strong>
            <span>{formatNumber(Math.floor(hover.b.pct), 0)} % · {hover.b.text}</span>
          </div>
        )}
      </div>
    </div>
  )
}

/* ---------- Nertill: intag utan klient ---------- */

const INTAKE_MICROS: NutrientKey[] = ['VITA', 'VITD', 'VITE', 'THIACLHCL', 'RIBF', 'NIAEQ', 'VITB6', 'FOL', 'VITB12', 'VITC', 'CA', 'P', 'K', 'MG', 'FE', 'ZN', 'ID', 'SE', 'NACL']

function IntakeView({ scoped }: { scoped: Scoped }) {
  const v = (k: NutrientKey) => scoped.totals[k] ?? 0
  const big: [string, number, string, number][] = [
    ['Energi', v('ENERC|kcal'), 'kcal', 0], ['Protein', v('PROT'), 'g', 1], ['Fett', v('FAT'), 'g', 1],
    ['Kolhydrater', v('CHO'), 'g', 1], ['Fiber', v('FIBT'), 'g', 1],
  ]
  return (
    <div className="ws-rdi">
      <p className="muted ws-intakenote">Intag, {scoped.label}. Välj en klient för att se behov och RDI.</p>
      <div className="ws-intakerow">
        {big.map(([l, val, u, d]) => (
          <div className="ws-kcalbox" key={l}><span className="lbl">{l}</span><span className="val">{formatNumber(val, d)} <small>{u}</small></span></div>
        ))}
      </div>
      <h4 className="ws-h4">Vitaminer och mineraler</h4>
      <div className="ws-micros">
        {INTAKE_MICROS.map(k => {
          const d = NUTRIENTS[k]
          return (
            <div className="ws-micro ws-microval" key={k}>
              <span className="mn">{d.label}</span>
              <span className="mv">{formatNumber(v(k), d.decimals)} {d.unit}</span>
            </div>
          )
        })}
      </div>
    </div>
  )
}

/* ---------- Nertill: energifördelning ---------- */

const rangeText = (r: Range): string => {
  const f = (n: number) => formatNumber(n, Number.isInteger(n) ? 0 : 1)
  if (r.min !== undefined && r.max !== undefined) return `${f(r.min)}–${f(r.max)} E%`
  if (r.min !== undefined) return `minst ${f(r.min)} E%`
  return `högst ${f(r.max!)} E%`
}

/** Cirkeldiagram (ring) över energifördelningen mellan makronutrienterna. Fast färgordning. */
function EnergyPie({ parts }: { parts: { label: string; pct: number }[] }) {
  const shown = parts.filter(p => p.pct > 0.05)
  const total = shown.reduce((a, p) => a + p.pct, 0)
  const R = 70, r = 44, C = 80
  let a0 = -Math.PI / 2
  const arc = (a1: number, a2: number) => {
    const large = a2 - a1 > Math.PI ? 1 : 0
    const p = (rad: number, ang: number) => `${C + rad * Math.cos(ang)},${C + rad * Math.sin(ang)}`
    return `M${p(R, a1)} A${R},${R} 0 ${large} 1 ${p(R, a2)} L${p(r, a2)} A${r},${r} 0 ${large} 0 ${p(r, a1)} Z`
  }
  return (
    <div className="ef-pie">
      <svg viewBox="0 0 160 160" width="160" height="160" role="img" aria-label="Energifördelning i E%">
        {total <= 0 ? <circle cx={C} cy={C} r={(R + r) / 2} fill="none" stroke="var(--line)" strokeWidth={R - r} /> :
          shown.length === 1 ? <circle cx={C} cy={C} r={(R + r) / 2} fill="none" className={`efs ef${parts.indexOf(shown[0])}`} strokeWidth={R - r} /> :
          shown.map(p => {
            const a1 = a0, a2 = a0 + (p.pct / total) * Math.PI * 2
            a0 = a2
            return <path key={p.label} d={arc(a1, a2)} className={`ef${parts.indexOf(p)}`}><title>{`${p.label}: ${formatNumber(p.pct, 1)} E%`}</title></path>
          })}
      </svg>
      <ul className="ef-legend">
        {parts.map((p, i) => (p.pct > 0.05 || i < 3) && (
          <li key={p.label}><i className={`ef${i}`} />{p.label}<strong>{formatNumber(p.pct, 0)} E%</strong></li>
        ))}
      </ul>
    </div>
  )
}

function MacroView({ person, totals, teeMJ }: { person: Person | null; totals: NutrientTotals; teeMJ?: number }) {
  const v = (k: NutrientKey) => totals[k] ?? 0
  const e = energyDistribution(totals)
  const macro = macroReferences(person?.age ?? 40, person?.sex ?? 'kvinna')
  if (!person) {
    const rows: [string, number, number | null][] = [
      ['Protein', v('PROT'), e.protein], ['Fett', v('FAT'), e.fat], ['– varav mättat', v('FASAT'), e.saturated],
      ['Kolhydrater (inkl. fiber)', v('CHO'), e.carbohydrate], ['– varav fritt socker', v('SUGFR'), e.freeSugar], ['Fiber', v('FIBT'), null],
    ]
    if (e.alcohol > 0.05) rows.push(['Alkohol', v('ALC'), e.alcohol])
    return (
      <table className="ref ws-macro">
        <thead><tr><th>Näringsämne</th><th className="num">Gram</th><th className="num">E%</th></tr></thead>
        <tbody>{rows.map(([l, g, p]) => (
          <tr key={l} className={l.startsWith('–') ? 'subrow' : ''}><td>{l}</td><td className="num">{formatNumber(g, 1)}</td><td className="num">{p === null ? '' : <strong>{formatNumber(p, 1)}</strong>}</td></tr>
        ))}</tbody>
      </table>
    )
  }
  const pieParts = [{ label: 'Protein', pct: e.protein }, { label: 'Fett', pct: e.fat }, { label: 'Kolhydrater', pct: e.carbohydrate }, { label: 'Alkohol', pct: e.alcohol }]
  const rows: { label: string; pct: number; grams: number; ref: Range }[] = [
    { label: 'Protein', pct: e.protein, grams: v('PROT'), ref: macro.protein },
    { label: 'Fett', pct: e.fat, grams: v('FAT'), ref: macro.fat },
    { label: '– varav mättat', pct: e.saturated, grams: v('FASAT'), ref: macro.saturated },
    { label: 'Kolhydrater (inkl. fiber)', pct: e.carbohydrate, grams: v('CHO'), ref: macro.carbohydrate },
    { label: '– varav fritt socker', pct: e.freeSugar, grams: v('SUGFR'), ref: macro.freeSugar },
    { label: 'Fiber', pct: 0, grams: v('FIBT'), ref: {} as Range },
  ]
  if (e.alcohol > 0.05) rows.push({ label: 'Alkohol', pct: e.alcohol, grams: v('ALC'), ref: { max: 0 } })
  return (
    <div className="ef-wrap">
    <EnergyPie parts={pieParts} />
    <table className="ref ws-macro">
      <thead><tr><th>Näringsämne</th><th className="num">Gram</th><th className="num">E%</th><th>Rekommendation</th></tr></thead>
      <tbody>
        {rows.map(r => {
          const isFiber = r.label === 'Fiber'
          return (
            <tr key={r.label} className={r.label.startsWith('–') ? 'subrow' : ''}>
              <td>{r.label}</td>
              <td className="num">{formatNumber(r.grams, 1)}</td>
              <td className="num">{isFiber ? '' : <strong>{formatNumber(r.pct, 1)}</strong>}</td>
              <td>{isFiber ? (person && teeMJ ? fiberReference(person.age, person.sex, teeMJ).text : 'minst 25–35 g/dag') : r.label === 'Alkohol' ? 'Ingen säker nivå' : rangeText(r.ref)}</td>
            </tr>
          )
        })}
      </tbody>
    </table>
    </div>
  )
}

/* ---------- Nertill: måltidsfördelning ---------- */

