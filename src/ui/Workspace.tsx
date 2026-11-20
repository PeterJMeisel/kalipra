import { weightOn } from '../core/weights'
import { useEffect, useMemo, useRef, useState } from 'react'
import { loadSources, saveSources, SOURCES, summarizeDiary, type Food, type FoodDatabase, type SourceId } from '../core/foods'
import { energyDistribution, formatNumber, NUTRIENTS, type NutrientKey, type NutrientTotals } from '../core/nutrients'
import { fiberReference, fluidReference, macroReferences, microReferences, microStatus, reproEnergyMJ, reproFrom, REPRO_LABEL, type Range, type Repro } from '../core/references'
import { energyNeed, normalizeFormula, withExtraEnergy, type EnergyNeed } from '../core/energy'
import { mealName, sortMeals, type Calculation, type DiaryEntry, type Meal, type Person } from '../core/types'
import { newId } from '../core/storage'
import { addDayDates, ensureDayDates, removeDayDates, setDayDate, shortDate, todayISO } from '../core/dates'
import { SourceTag } from './DiaryEditor'
import { ProductSheet } from './ProductSheet'
import { nutritionRank } from '../core/nutritionOrder'
import { measureFor, measuresFor, type Measure } from '../core/measures'

const SUMMARY_KEYS: NutrientKey[] = ['ENERC|kcal', 'ENERC|kJ', 'PROT', 'FAT', 'CHO', 'FIBT', 'WATER', 'FASAT', 'FAMS', 'FAPU', 'SUGFR', 'SUGAR', 'ALC',
  'VITA', 'VITD', 'VITE', 'THIACLHCL', 'RIBF', 'NIAEQ', 'VITB6', 'FOL', 'VITB12', 'VITC', 'CA', 'P', 'K', 'MG', 'FE', 'ZN', 'ID', 'SE', 'NACL']

/** Livsmedel som innehåller socker men saknar värde för fritt socker (Fineli, USDA, nutritionsprodukter). */
function noFreeSugar(db: FoodDatabase, list: DiaryEntry[]): string[] {
  const names = new Set<string>()
  for (const e of list) {
    const f = db.get(e.foodNumber, e.source)
    if (f && f.per100g.SUGFR === undefined && (f.per100g.SUGAR ?? 0) > 0) names.add(f.name)
  }
  return [...names]
}

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
  function addEntry(food: Food, qty: number, m: Measure) {
    setEntries([...entries, { id: newId(), day: currentDay, meal, foodNumber: food.number, ...(food.source !== 'lmv' ? { source: food.source } : {}),
      grams: qty * m.factor, ...(m.factor !== 1 || m.id !== food.unit ? { measure: m.id, qty } : {}) }])
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
  // Datum per dag: fylls i automatiskt om de saknas (äldre beräkningar)
  const today = todayISO()
  const dd = useMemo(() => ensureDayDates(calc.days, calc.dayDates, calc.dayDatesManual, today), [calc.days, calc.dayDates, calc.dayDatesManual, today])
  useEffect(() => {
    if (calc.dayDates?.length !== calc.days || calc.dayDates.some((x, i) => x !== dd.dates[i])) onPatchCalc({ dayDates: dd.dates, dayDatesManual: dd.manual })
  }, [dd]) // eslint-disable-line react-hooks/exhaustive-deps
  const [sheetFor, setSheetFor] = useState<number | null>(null)
  const [dateError, setDateError] = useState<string | null>(null)
  function pickDate(date: string) {
    const r = setDayDate(dd, currentDay - 1, date)
    if ('error' in r) { setDateError(r.error); return }
    setDateError(null)
    onPatchCalc({ dayDates: r.dates, dayDatesManual: r.manual })
  }
  function addDay() {
    if (calc.days >= 14) return
    const nd = addDayDates(dd, today)
    onPatchCalc({ days: calc.days + 1, mealCounts: [...allCounts(), 1], dayDates: nd.dates, dayDatesManual: nd.manual })
    setDay(calc.days + 1)
    setMeal(mealName(1))
  }
  /** Tar bort den markerade dagen; senare dagar flyttas upp ett steg (Dag 3 blir Dag 2 osv). */
  function removeDay() {
    const d = currentDay
    const count = entries.filter(e => e.day === d).length
    if (count && armed !== `day:${d}`) { setArmed(`day:${d}`); return }
    setArmed(null)
    const nd = removeDayDates(dd, d - 1)
    const counts = allCounts()
    counts.splice(d - 1, 1)
    onPatchCalc({
      days: calc.days - 1,
      entries: entries.filter(e => e.day !== d).map(e => (e.day > d ? { ...e, day: e.day - 1 } : e)),
      mealCounts: counts, dayDates: nd.dates, dayDatesManual: nd.manual,
    })
    setDay(Math.max(1, Math.min(d, calc.days - 1)))
    setMeal(mealName(1))
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

  // Vikt för behoven: finns vägningar används vikten som gäller kostregistreringens datum (läget Dag: markerad dag;
  // läget Dagar: medel av vikterna för de dagar som har registreringar). Utan vägningar: vikten i beräkningen.
  const hasWeights = (person?.weights?.length ?? 0) > 0
  const weightForDay = (d: number) => weightOn(person?.weights, dd.dates[d - 1] ?? today)?.kg ?? calc.weightKg
  const regDays = [...new Set(entries.map(e => e.day))]
  const weightKg = !hasWeights ? calc.weightKg
    : scope === 'dagar' && regDays.length > 0 ? Math.round(regDays.reduce((a, d) => a + weightForDay(d), 0) / regDays.length * 10) / 10
    : weightForDay(currentDay)
  const repro = person ? reproFrom(person.health, person.sex) : null
  const need = useMemo(() => person ? needFor(person, { ...calc, weightKg }) : null,
    [person, weightKg, calc.pal, calc.bmrFormula, repro?.kind, repro && 'trimester' in repro ? repro.trimester : repro && 'period' in repro ? repro.period : null])
  // Läget Dag visar bara den dag som är markerad i kostregistreringen (inte snitt över dagarna)
  const daySummary = useMemo(() => summarizeDiary(db, entries.filter(e => e.day === currentDay), 1, SUMMARY_KEYS), [db, entries, currentDay])
  const scoped = useMemo(() => ({ totals: daySummary.perDay, needKcal: need?.teeKcal ?? 0, needMJ: need?.teeMJ ?? 0, label: `dag ${currentDay}`, noFreeSugar: noFreeSugar(db, entries.filter(e => e.day === currentDay)) }), [daySummary, need, currentDay, db, entries])
  // Läget Dagar: genomsnitt över de dagar som har registreringar (tomma dagar räknas inte)
  const filledDays = new Set(entries.map(e => e.day)).size
  const avgSummary = useMemo(() => summarizeDiary(db, entries, Math.max(1, filledDays), SUMMARY_KEYS), [db, entries, filledDays])
  const avgScoped = useMemo(() => ({ totals: avgSummary.perDay, needKcal: need?.teeKcal ?? 0, needMJ: need?.teeMJ ?? 0, label: `snitt över ${filledDays} ${filledDays === 1 ? 'dag' : 'dagar'}`, noFreeSugar: noFreeSugar(db, entries) }), [avgSummary, need, filledDays, db, entries])
  // Fliken Måltid: bara den måltid som är vald, jämförd med en lika stor andel av dagsbehovet
  const mealShare = 1 / Math.max(1, meals.length)
  const mealScoped = useMemo(() => ({
    totals: daySummary.perMeal[meal] ?? {}, needKcal: (need?.teeKcal ?? 0) * mealShare, needMJ: (need?.teeMJ ?? 0) * mealShare,
    label: `${meal.toLowerCase()}, dag ${currentDay}`, share: mealShare, noFreeSugar: noFreeSugar(db, entries.filter(e => e.day === currentDay && e.meal === meal)), dayKcal: daySummary.perDay['ENERC|kcal'] ?? 0,
    note: `${meal}, dag ${currentDay}. Jämförs med ${formatNumber(mealShare * 100, 0)} % av dagsbehovet och RDI (jämnt fördelat på ${meals.length} ${meals.length === 1 ? 'måltid' : 'måltider'}).`,
  }), [daySummary, meal, need, mealShare, currentDay, meals.length, db, entries])
  const view = scope === 'dagar' ? avgScoped : bottomTab === 'maltid' ? mealScoped : scoped

  const kcalOf = (list: DiaryEntry[]) => list.reduce((s, e) => s + ((db.get(e.foodNumber, e.source)?.per100g['ENERC|kcal'] ?? 0) * e.grams) / 100, 0)

  return (
    <div className="ws">
      {sheetFor !== null && <ProductSheet foodNumber={sheetFor} onClose={() => setSheetFor(null)} refs={person && need ? microReferences(person.age, person.sex, need.teeMJ, repro) : undefined} />}
      <section className="ws-meals panelbox" aria-label="Registrerade livsmedel per måltid">
        <div className="ws-daytabs" role="tablist" aria-label="Dag">
          {Array.from({ length: calc.days }, (_, i) => i + 1).map(d => {
            return (
              <button key={d} role="tab" aria-selected={currentDay === d} className={currentDay === d ? 'on' : ''} onClick={() => { setDay(d); setDateError(null) }}>
                Dag {d}
              </button>
            )
          })}
          {calc.days < 14 && <button type="button" className="ws-add" onClick={addDay}>+ Lägg till dag</button>}
          {calc.days > 1 && (
            <button type="button" className={`ws-remove ${armed === `day:${currentDay}` ? 'armed' : ''}`} onClick={removeDay}>
              {armed === `day:${currentDay}` ? `Ta bort Dag ${currentDay}, Klicka igen` : 'Ta bort dag'}
            </button>
          )}
          <label className="ws-date">Datum
            <input type="date" lang="sv-SE" value={dd.dates[currentDay - 1] ?? ''} onChange={e => e.target.value && pickDate(e.target.value)} />
          </label>
          {dateError && <span className="ws-dateerr" role="alert">{dateError}</span>}
        </div>
        <div className="ws-mealtabs" role="tablist" aria-label="Måltid">
          {meals.map(m => (
            <button key={m} role="tab" aria-selected={meal === m} className={meal === m ? 'on' : ''} onClick={() => setMeal(m)}>{m}</button>
          ))}
          <button type="button" className="ws-add" onClick={addMeal}>+ Lägg till måltid</button>
          {meals.length > 1 && (
            <button type="button" className={`ws-remove ${armed === `meal:${currentDay}:${meal}` ? 'armed' : ''}`} onClick={() => removeMeal(meal)}>
              {armed === `meal:${currentDay}:${meal}` ? `Ta bort ${meal}, Klicka igen` : 'Ta bort måltid'}
            </button>
          )}
        </div>
        <div className="ws-tablewrap">
          {mealEntries.length === 0 ? (
            <p className="empty">Inget registrerat för {meal.toLowerCase()}, dag {currentDay}. Lägg till livsmedel från listan till höger.</p>
          ) : (
            <table className="entries ws-entries">
              <thead><tr><th>Livsmedel</th><th className="num">Mängd</th><th>Enhet</th><th></th></tr></thead>
              <tbody>
                {mealEntries.map(e => {
                  const f = db.get(e.foodNumber, e.source)
                  return (
                    <tr key={e.id}>
                      <td className="name">{f?.name ?? `Okänt livsmedel (${e.foodNumber})`}{f?.source === 'nutrition' && <button type="button" className="ws-sheetlink" onClick={() => setSheetFor(f.number)}>Produktblad</button>}</td>
                      <AmountCell entry={e} food={f} onChange={patch => setEntries(entries.map(x => (x.id === e.id ? { ...x, ...patch } : x)))} />
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
        <FoodPicker db={db} meal={meal} onAdd={addEntry} onShowSheet={setSheetFor} />
      </section>

      <section className="ws-bottom panelbox" aria-label="Näring i förhållande till rekommendationer">
        <nav className="ws-tabs" role="tablist">
          <button role="tab" aria-selected={bottomTab === 'rdi'} className={bottomTab === 'rdi' ? 'on' : ''} onClick={() => setBottomTab('rdi')}>Överblick</button>
          <button role="tab" aria-selected={bottomTab === 'efordelning'} className={bottomTab === 'efordelning' ? 'on' : ''} onClick={() => setBottomTab('efordelning')}>Energifördelning</button>
          {scope === 'dag' && <button role="tab" aria-selected={bottomTab === 'maltid'} className={bottomTab === 'maltid' ? 'on' : ''} onClick={() => setBottomTab('maltid')}>Måltid</button>}
          <button role="tab" aria-selected={bottomTab === 'jamfor'} className={bottomTab === 'jamfor' ? 'on' : ''} onClick={() => setBottomTab('jamfor')}>{scope === 'dag' ? 'Måltider' : 'Per dag'}</button>
          <span className="ws-scope" role="radiogroup" aria-label="Visa för">
            <button role="radio" aria-checked={scope === 'dag'} className={scope === 'dag' ? 'on' : ''} onClick={() => setScope('dag')}>Dag</button>
            <button role="radio" aria-checked={scope === 'dagar'} className={scope === 'dagar' ? 'on' : ''} onClick={() => { setScope('dagar'); if (bottomTab === 'maltid') setBottomTab('rdi') }}>Dagar</button>
          </span>
        </nav>
        {(bottomTab === 'rdi' || (bottomTab === 'maltid' && scope === 'dag')) && (person && need
          ? <RdiView person={person} repro={repro} weightKg={weightKg} weightFromLog={hasWeights} pal={calc.pal} need={need} scoped={view} />
          : <IntakeView scoped={view} />)}
        {bottomTab === 'efordelning' && <MacroView person={person} totals={view.totals} teeMJ={need?.teeMJ} />}
        {bottomTab === 'jamfor' && scope === 'dag' && <MealsCompareView meals={meals} summary={daySummary} entries={dayEntries} day={currentDay} person={person} repro={repro} weightKg={weightKg} need={need} />}
        {bottomTab === 'jamfor' && scope === 'dagar' && <DaysView db={db} entries={entries} days={calc.days} dates={dd.dates} person={person} repro={repro} weightKg={weightKg} need={need} />}
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

/** Mängd i en registrerad rad: tal + mått (meny när livsmedlet har flera mått). */
function AmountCell({ entry, food, onChange }: { entry: DiaryEntry; food: Food | undefined; onChange: (p: Partial<DiaryEntry>) => void }) {
  const m = food ? measureFor(food, entry.measure) : { id: 'g', label: 'g', factor: 1 }
  const qty = entry.qty ?? entry.grams / m.factor
  const all = food ? measuresFor(food) : [m]
  const fmt = (n: number) => String(Math.round(n * 100) / 100).replace('.', ',')
  return (
    <>
      <td className="num">
        <input key={`${m.id}:${qty}`} aria-label={`Mängd i ${m.label} för ${food?.name}`} inputMode="decimal" defaultValue={fmt(qty)}
          onBlur={ev => {
            const q = Number(ev.target.value.replace(',', '.'))
            if (q > 0) onChange({ grams: q * m.factor, ...(entry.measure ? { qty: q } : {}) })
            else ev.target.value = fmt(qty)
          }} />
      </td>
      <td className="unitcell">
        <MeasureSelect measures={all} value={m.id} label={food?.name ?? ''}
          onChange={id => {
            // Byte av mått behåller mängden i gram: 200 ml → 2 dl
            const n = all.find(x => x.id === id)!
            onChange({ measure: n.id, qty: entry.grams / n.factor })
          }} />
      </td>
    </>
  )
}

/** Måttet som text, eller en diskret meny när det finns flera. */
function MeasureSelect({ measures, value, label, onChange, always }: { measures: Measure[]; value: string; label: string; onChange: (id: string) => void; always?: boolean }) {
  if (measures.length < 2 && !always) return <span className="unit">{measures[0]?.label ?? 'g'}</span>
  return (
    <select className="unit-select" value={value} aria-label={`Mått för ${label}`} onChange={e => onChange(e.target.value)}>
      {measures.map(x => <option key={x.id} value={x.id}>{x.label}</option>)}
    </select>
  )
}

function FoodPicker({ db, meal, onAdd, onShowSheet }: { db: FoodDatabase; meal: Meal; onAdd: (f: Food, qty: number, m: Measure) => void; onShowSheet: (n: number) => void }) {
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
    // Utan sökord: kosttillägg och sedan sondnäring (vanligaste först, motsvarande produkter bredvid varandra), sedan övriga i bokstavsordning
    const byName = (a: Food, b: Food) => a.name.localeCompare(b.name, 'sv')
    const all = db.foods.filter(f => sources.includes(f.group))
    const nutr = all.filter(f => f.source === 'nutrition')
      .sort((a, b) => nutritionRank(a.name, a.group) - nutritionRank(b.name, b.group) || byName(a, b))
    const rest = all.filter(f => f.source !== 'nutrition').sort(byName)
    return [...nutr, ...rest].slice(0, Math.max(300, nutr.length + 100))
  }, [db, query, sources])

  function toggleSource(id: SourceId) {
    const next = sources.includes(id) ? sources.filter(s => s !== id) : available.filter(s => s === id || sources.includes(s))
    if (next.length === 0) return
    setSources(next)
    saveSources(next)
  }
  const [measureId, setMeasureId] = useState<string>('')
  const pickedMeasures = picked ? measuresFor(picked) : []
  function add() {
    const q = Number(grams.replace(',', '.'))
    if (!picked || !(q > 0)) return
    onAdd(picked, q, measureFor(picked, measureId))
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
              onClick={() => { setPicked(f); setMeasureId(''); setTimeout(() => gramsRef.current?.select(), 0) }}>
              <span>{multi && <SourceTag source={f.group} />}{f.name}</span>
              <small>{formatNumber(f.per100g['ENERC|kcal'] ?? 0, 0)} kcal/100 {f.unit}</small>
            </button>
            {f.source === 'nutrition' && <button type="button" className="ws-sheetlink ws-hitsheet" tabIndex={-1} onClick={() => onShowSheet(f.number)}>Produktblad</button>}
          </li>
        ))}
        {query.trim().length > 1 && hits.length === 0 && <li className="empty">Inga träffar.</li>}
      </ul>
      <div className="ws-addrow">
        <span className="pickedname">{picked ? picked.name : 'Välj ett livsmedel i listan'}
        </span>
        <input ref={gramsRef} className="ws-qty" inputMode="decimal" value={grams} onChange={e => setGrams(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') add() }} aria-label="Mängd" />
        <MeasureSelect always measures={picked ? pickedMeasures : [{ id: 'g', label: 'g', factor: 1 }]} value={picked ? measureFor(picked, measureId).id : 'g'}
          label={picked?.name ?? ''} onChange={setMeasureId} />
        <button type="button" className="primary" disabled={!picked} onClick={add} title={`Lägg till i ${meal.toLowerCase()}`}>Lägg till</button>
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

/** Energibehov per dag för en beräkning (BMR × PAL, plus tillägg vid graviditet/amning). */
export function needFor(person: Person, calc: Calculation): EnergyNeed {
  const repro = reproFrom(person.health, person.sex)
  const n = energyNeed(person.sex, person.age, calc.weightKg, person.heightCm, calc.pal, normalizeFormula(calc.bmrFormula))
  return repro ? withExtraEnergy(n, reproEnergyMJ(repro), repro.kind === 'gravid' ? `graviditet (trimester ${repro.trimester})` : 'amning') : n
}

/* ---------- Nertill: näring mot behov ---------- */

/** share = andel av dagsbehovet/RDI som intaget jämförs med (1 för en dag, t.ex. 1/3 för en av tre måltider) */
type Scoped = { totals: NutrientTotals; needKcal: number; needMJ: number; label: string; share?: number; note?: string; dayKcal?: number; noFreeSugar?: string[] }

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

/** Ruta för fett eller en fettkvalitet: E% och gram, stapel mot NNR:s intervall (E%). */
function FatBox({ label, e, g, range, isMeal, empty }: { label: string; e: number; g: number; range: Range; isMeal: boolean; empty: boolean }) {
  const lo = range.min, hi = range.max
  const st = isMeal || empty ? '' : lo !== undefined && e < lo ? 'low' : hi !== undefined && e > hi ? 'high' : ''
  // Skala: övre gränsen hamnar vid 2/3 av stapeln (som övriga rutor), annars 0–100 E%
  const scale = hi !== undefined ? hi * 1.5 : 100
  const pos = (x: number) => `${Math.min(Math.max(x / scale, 0), 1) * 100}%`
  const refText = lo !== undefined && hi !== undefined ? `${formatNumber(lo, 0)}–${formatNumber(hi, 0)} E%`
    : hi !== undefined ? `< ${formatNumber(hi, 0)} E%` : lo !== undefined ? `≥ ${formatNumber(lo, 0)} E%` : ''
  return (
    <div className="ws-kcalbox">
      <span className="lbl">{label}</span>
      <span className="val">{formatNumber(e, 0)} <small>E% · {formatNumber(g, 0)} g</small></span>
      <div className="meter" aria-hidden="true">
        <div className={`fill ${isMeal ? 'neutral' : st}`} style={{ width: pos(e) }} />
        {!isMeal && lo !== undefined && <div className="mark" style={{ left: pos(lo) }} />}
        {!isMeal && hi !== undefined && <div className="mark" style={{ left: pos(hi) }} />}
      </div>
      <span className="sub">{isMeal ? 'Andel av måltidens energi' : refText ? `Rekommendation ${refText}` : 'Ingen rekommendation'}</span>
    </div>
  )
}

function RdiView({ person, repro, weightKg, weightFromLog, pal, need, scoped }: {
  person: Person; repro: Repro | null; weightKg: number; weightFromLog: boolean; pal: number
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
  const macro = macroReferences(person.age, person.sex, repro, weightKg)
  const bmrPct = (need.bmrKcal / need.teeKcal) * 100
  const proteinPerKg = v('PROT') / weightKg
  const protRef = macro.proteinGPerKg * sh
  const micro = microReferences(person.age, person.sex, need.teeMJ, repro)
    .map(m => {
      const f = sh
      return { ...m, value: m.value * f, ar: m.ar !== undefined ? m.ar * f : undefined, ul: m.ul !== undefined ? m.ul * f : undefined, min: m.min !== undefined ? m.min * f : undefined }
    })

  return (
    <div className="ws-rdi">
      {scoped.note && <p className="muted ws-intakenote">{scoped.note}</p>}
      <div className="ws-kcalrow">
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
            {need.extraKcal ? <> · {need.extraLabel} +{formatNumber(need.extraKcal, 0)} kcal</> : repro?.kind === 'ammande' ? <> · amning efter 6 mån: inget fast tillägg</> : null} · vikt {formatNumber(weightKg, 1)} kg{weightFromLog ? ' (vikthistorik)' : ''} · PAL {formatNumber(pal, 2)}</span>
        </div>
        )}
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
        <div className="ws-kcalbox">
          <span className="lbl">Protein</span>
          {!isMeal ? (
            <>
              <span className="val">{formatNumber(proteinPerKg, 2)} <small>g/kg</small></span>
              <div className="meter" aria-hidden="true">
                <div className={`fill ${proteinPerKg >= protRef ? '' : 'low'}`} style={{ width: `${Math.min((proteinPerKg / protRef) * 100, 150) / 1.5}%` }} />
                <div className="mark" style={{ left: `${100 / 1.5}%` }} />
              </div>
              <span className="sub">Rekommendation ≥ {formatNumber(protRef, 2)} g/kg{macro.proteinAddG ? ` (inkl. +${formatNumber(macro.proteinAddG, 0)} g/dag)` : ''}</span>
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
          const fl = fluidReference(person.age, person.sex, weightKg)
          if (isMeal) return <ShareBox label="Vätska" value={ml} unit="ml" dayRef={fl.ml} refText={`riktvärde (${formatNumber(fl.ml, 0)} ml)`} />
          const okF = ml >= fl.ml
          return (
            <div className="ws-kcalbox">
              <span className="lbl">Vätska</span>
              <span className="val">{formatNumber(mlkg, 0)} <small>ml/kg · {formatNumber(ml, 0)} ml</small></span>
              <div className="meter" aria-hidden="true">
                <div className={`fill ${okF ? '' : 'low'}`} style={{ width: `${Math.min((ml / fl.ml) * 100, 150) / 1.5}%` }} />
                <div className="mark" style={{ left: `${100 / 1.5}%` }} />
              </div>
              <span className="sub">{fl.text.charAt(0).toUpperCase() + fl.text.slice(1)}</span>
            </div>
          )
        })()}
        {(() => {
          const g = v('FIBT')
          const fr = fiberReference(person.age, person.sex, need.teeMJ)
          const refG = fr.minG * sh
          const ok = g >= refG
          if (fr.minG === 0) return (
            <div className="ws-kcalbox">
              <span className="lbl">Fiber</span>
              <span className="val">{formatNumber(g, 1)} <small>g</small></span>
              <span className="sub">Rekommendation: {fr.text}</span>
            </div>
          )
          if (isMeal) return <ShareBox label="Fiber" value={g} unit="g" dayRef={fr.minG} refText={`rekommendation (${fr.text})`} />
          return (
            <div className="ws-kcalbox">
              <span className="lbl">Fiber</span>
              <span className="val">{formatNumber(g, 1)} <small>g</small></span>
              <div className="meter" aria-hidden="true">
                <div className={`fill ${ok ? '' : 'low'}`} style={{ width: `${Math.min((g / refG) * 100, 150) / 1.5}%` }} />
                <div className="mark" style={{ left: `${100 / 1.5}%` }} />
              </div>
              <span className="sub">Rekommendation {fr.text}</span>
            </div>
          )
        })()}
        {(() => {
          const g = v('NACL')
          const sr = micro.find(m => m.key === 'NACL')
          const maxG = sr?.value ?? 5.75
          const minG = sr?.min
          const st = sr ? microStatus(sr, g) : 'ok'
          const f2 = (n: number) => formatNumber(n, Number.isInteger(n) ? 0 : 2)
          if (isMeal) return <ShareBox label="Salt" value={g} unit="g" dayRef={maxG / sh} refText={`rekommendation (≤ ${f2(maxG / sh)} g)`} />
          return (
            <div className="ws-kcalbox">
              <span className="lbl">Salt</span>
              <span className="val">{formatNumber(g, 1)} <small>g</small></span>
              <div className="meter" aria-hidden="true">
                <div className={`fill ${st === 'high' ? 'high' : st === 'low' ? 'low' : ''}`} style={{ width: `${Math.min((g / maxG) * 100, 150) / 1.5}%` }} />
                {minG !== undefined && <div className="mark" style={{ left: `${(minG / maxG) * 100 / 1.5}%` }} />}
                <div className="mark" style={{ left: `${100 / 1.5}%` }} />
              </div>
              <span className="sub">Rekommendation {minG !== undefined ? `${f2(minG)}–${f2(maxG)} g` : `≤ ${f2(maxG)} g`}</span>
            </div>
          )
        })()}
      </div>

      <div className="ws-kcalrow ws-kcalrow2 ws-kcalrow4">
        {(() => {
          // Fett och fettkvalitet (E%), NNR 2023
          const ed = energyDistribution(scoped.totals)
          const rows: { label: string; e: number; g: number; range: Range }[] = [
            { label: 'Fett', e: ed.fat, g: v('FAT'), range: macro.fat },
            { label: 'Varav mättat', e: ed.saturated, g: v('FASAT'), range: macro.saturated },
            { label: 'Varav enkelomättat', e: ed.monounsaturated, g: v('FAMS'), range: macro.monounsaturated },
            { label: 'Varav fleromättat', e: ed.polyunsaturated, g: v('FAPU'), range: macro.polyunsaturated },
          ]
          return rows.map(r => <FatBox key={r.label} {...r} isMeal={isMeal} empty={ed.totalKj === 0} />)
        })()}
      </div>

      <div className="ws-kcalrow ws-kcalrow2">
        {(() => {
          // Kolhydrater, varav fritt socker och övriga sockerarter – var sin ruta
          const ed = energyDistribution(scoped.totals)
          const cho = v('CHO')
          const E = (g: number) => (ed.totalKj > 0 ? (g * 17 / ed.totalKj) * 100 : 0)
          const freeG = Math.min(v('SUGFR'), cho)
          const otherG = Math.max(0, Math.min(v('SUGAR'), cho) - freeG)
          const freeE = E(freeG)
          const otherE = E(otherG)
          const ref = macro.carbohydrate
          const lo = ref.min ?? 0, hi = ref.max ?? 100
          const st = isMeal || ed.totalKj === 0 ? '' : ed.carbohydrate < lo ? 'low' : ed.carbohydrate > hi ? 'high' : ''
          const freeMax = macro.freeSugar.max ?? 10
          const freeSt = isMeal ? 'neutral' : freeE > freeMax ? 'high' : ''
          const pctW = (e: number) => `${Math.min(Math.max(e, 0), 100)}%`
          return (
            <>
              <div className="ws-kcalbox">
                <span className="lbl">Kolhydrater</span>
                <span className="val">{formatNumber(ed.carbohydrate, 0)} <small>E% · {formatNumber(cho, 0)} g</small></span>
                <div className="meter" aria-hidden="true">
                  <div className={`fill ${isMeal ? 'neutral' : st}`} style={{ width: pctW(ed.carbohydrate) }} />
                  {!isMeal && <><div className="mark" style={{ left: `${lo}%` }} /><div className="mark" style={{ left: `${hi}%` }} /></>}
                </div>
                <span className="sub">{isMeal ? 'Andel av måltidens energi' : `Rekommendation ${formatNumber(lo, 0)}–${formatNumber(hi, 0)} E%`}</span>
              </div>
              <div className="ws-kcalbox">
                <span className="lbl">Varav fritt socker</span>
                <span className="val">{formatNumber(freeE, 0)} <small>E% · {formatNumber(freeG, 0)} g</small></span>
                <div className="meter" aria-hidden="true">
                  {isMeal || freeMax === 0
                    ? <div className={`fill ${isMeal ? 'neutral' : freeE > 0 ? 'high' : ''}`} style={{ width: pctW(freeE) }} />
                    : <><div className={`fill ${freeSt}`} style={{ width: `${Math.min(freeE / freeMax, 1.5) / 1.5 * 100}%` }} /><div className="mark" style={{ left: `${100 / 1.5}%` }} /></>}
                </div>
                {!isMeal && <span className="sub">{freeMax === 0 ? 'Bör undvikas' : `Rekommendation < ${formatNumber(freeMax, 0)} E%`}</span>}
                {(scoped.noFreeSugar?.length ?? 0) > 0 && <span className="sub ws-nofree" title={scoped.noFreeSugar!.join(', ')}>Fritt socker saknas för {scoped.noFreeSugar!.length} livsmedel (t.ex. {scoped.noFreeSugar![0]}) – deras socker räknas som övriga sockerarter.</span>}
              </div>
              <div className="ws-kcalbox">
                <span className="lbl">Övriga sockerarter</span>
                <span className="val">{formatNumber(otherE, 0)} <small>E% · {formatNumber(otherG, 0)} g</small></span>
                <div className="meter" aria-hidden="true"><div className="fill neutral" style={{ width: pctW(otherE) }} /></div>
                <span className="sub">Ingen rekommendation</span>
              </div>
            </>
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
            <div className="ws-micro" key={m.key} title={`${d.label}: ${formatNumber(val, d.decimals)} ${d.unit} av ${m.kind === 'max' ? '≤ ' : ''}${formatNumber(m.value, d.decimals)} ${d.unit}`}>
              <span className="mn">{d.label}</span>
              <div className={`bar ${st}`} aria-hidden="true">
                <div style={{ width: `${Math.min(p, 100)}%` }} />
              </div>
              <span className={`mp ${st}`}>{formatNumber(p, 0)} %</span>
              {detailed && (
                <span className="md">
                  {formatNumber(val, d.decimals)} {d.unit}{' '}
                  <span className="ref">({m.kind === 'max' ? '≤ ' : m.kind === 'AI' ? 'AI ' : 'RDI '}{formatNumber(m.value, d.decimals)} {d.unit}{m.kind === 'RI' && m.ar !== undefined && <>, AR {formatNumber(m.ar, d.decimals)} {d.unit}</>}{m.ul !== undefined && <>, UL {formatNumber(m.ul, d.decimals)} {d.unit}</>})</span>
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

function DaysView({ db, entries, days, dates, person, repro, weightKg, need }: {
  db: FoodDatabase; entries: DiaryEntry[]; days: number; dates: string[]; person: Person | null; repro: Repro | null
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
    ...perDay.map(d => ({ label: `Dag ${d.day}${dates[d.day - 1] ? ` · ${shortDate(dates[d.day - 1])}` : ''}`, name: `dag ${d.day}`, totals: d.totals, empty: d.count === 0, share: 1 })),
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
  if (r.min !== undefined) return `≥ ${f(r.min)} E%`
  if (r.max === undefined) return 'ingen rekommendation'
  if (r.max === 0) return 'bör undvikas'
  return `≤ ${f(r.max)} E%`
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
              <td>{isFiber ? (person && teeMJ ? fiberReference(person.age, person.sex, teeMJ).text : '≥ 25–35 g/dag') : r.label === 'Alkohol' ? 'Ingen säker nivå' : rangeText(r.ref)}</td>
            </tr>
          )
        })}
      </tbody>
    </table>
    </div>
  )
}

/* ---------- Nertill: måltidsfördelning ---------- */

