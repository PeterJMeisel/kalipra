import { useEffect, useMemo, useRef, useState } from 'react'
import { loadSources, saveSources, SOURCES, summarizeDiary, type Food, type FoodDatabase, type SourceId } from '../core/foods'
import { energyDistribution, formatNumber, NUTRIENTS, type NutrientKey, type NutrientTotals } from '../core/nutrients'
import { macroReferences, microReferences, type Range } from '../core/references'
import { energyNeed, normalizeFormula, bmi } from '../core/energy'
import { emptyHealth, mealName, sortMeals, type Calculation, type DiaryEntry, type Health, type Meal, type Person } from '../core/types'
import { HealthSection } from './HealthSection'
import { newId } from '../core/storage'
import { SourceTag } from './DiaryEditor'

const SUMMARY_KEYS: NutrientKey[] = ['ENERC|kcal', 'ENERC|kJ', 'PROT', 'FAT', 'CHO', 'FIBT', 'FASAT', 'FAMS', 'FAPU', 'SUGFR', 'ALC',
  'VITA', 'VITD', 'VITE', 'THIACLHCL', 'RIBF', 'NIAEQ', 'VITB6', 'FOL', 'VITB12', 'VITC', 'CA', 'P', 'K', 'MG', 'FE', 'ZN', 'ID', 'SE', 'NACL']

type Props = {
  db: FoodDatabase
  /** null = kostregistrering utan patient: intag visas utan behov och RDI */
  person: Person | null
  calc: Calculation
  onPatchPerson: (patch: Partial<Person>) => void
  onPatchCalc: (patch: Partial<Calculation>) => void
  onPickPatient?: () => void
}


/** Patientöversikt: måltider till vänster, livsmedelssök/patient till höger, näring mot RDI nertill. */
export function Workspace({ db, person, calc, onPatchPerson, onPatchCalc, onPickPatient }: Props) {
  const [day, setDay] = useState(1)
  const [mealSel, setMeal] = useState<Meal>(mealName(1))
  const [rightTab, setRightTab] = useState<'livsmedel' | 'patient'>('livsmedel')
  const [bottomTab, setBottomTab] = useState<'rdi' | 'efordelning' | 'maltider'>('rdi')
  const [scope, setScope] = useState<'dag' | 'maltid'>('dag')

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
  function removeMeal(m: Meal) {
    const inMeal = entries.filter(e => e.day === currentDay && e.meal === m)
    if (inMeal.length && !confirm(`Ta bort ${m.toLowerCase()} på dag ${currentDay} och ${inMeal.length} registrerade livsmedel i den?`)) return
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
    if (count && !confirm(`Ta bort dag ${d} och ${count} registrerade livsmedel?`)) return
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
  const need = useMemo(
    () => (person ? energyNeed(person.sex, person.age, weightKg, person.heightCm, calc.pal, normalizeFormula(calc.bmrFormula)) : null),
    [person, weightKg, calc.pal, calc.bmrFormula],
  )
  const summary = useMemo(() => summarizeDiary(db, entries, calc.days, SUMMARY_KEYS), [db, entries, calc.days])

  /** Intag och behov för vald omfattning (dag eller vald måltid). */
  const scoped = useMemo(() => {
    if (scope === 'dag') return { totals: summary.perDay, needKcal: need?.teeKcal ?? 0, needMJ: need?.teeMJ ?? 0, label: `dag (snitt över ${summary.daysCounted} ${summary.daysCounted === 1 ? 'dag' : 'dagar'})` }
    const share = 1 / meals.length
    return {
      totals: summary.perMeal[meal] ?? {},
      needKcal: (need?.teeKcal ?? 0) * share,
      needMJ: (need?.teeMJ ?? 0) * share,
      label: `${meal.toLowerCase()} (${formatNumber(share * 100, 0)} % av dagsbehovet, jämnt fördelat på ${meals.length} måltider)`,
    }
  }, [scope, summary, need, meal, meals.length])

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
          {calc.days > 1 && <button type="button" className="ws-remove" onClick={removeDay} title={`Ta bort dag ${calc.days}`}>Ta bort dag {calc.days}</button>}
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
          {meals.length > 1 && <button type="button" className="ws-remove" onClick={() => removeMeal(meal)} title={`Ta bort ${meal.toLowerCase()}`}>Ta bort {meal.toLowerCase()}</button>}
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
            {meal}: <strong>{formatNumber(kcalOf(mealEntries), 0)} kcal</strong>
            <span className="sep">·</span> Dag {currentDay}: <strong>{formatNumber(kcalOf(dayEntries), 0)} kcal</strong>
          </span>
          <button type="button" className={`ws-copybtn ${copyOpen ? 'on' : ''}`} onClick={() => setCopyOpen(o => !o)}
            aria-expanded={copyOpen} disabled={mealEntries.length === 0 && !copyOpen}
            title={mealEntries.length === 0 ? 'Måltiden är tom' : `Kopiera ${meal.toLowerCase()} till en annan måltid`}>
            Kopiera {meal.toLowerCase()} …
          </button>
        </div>
      </section>

      <section className="ws-right panelbox" aria-label="Livsmedelssök och patientuppgifter">
        <nav className="ws-tabs" role="tablist">
          <button role="tab" aria-selected={rightTab === 'livsmedel'} className={rightTab === 'livsmedel' ? 'on' : ''} onClick={() => setRightTab('livsmedel')}>Livsmedelssök</button>
          <button role="tab" aria-selected={rightTab === 'patient'} className={rightTab === 'patient' ? 'on' : ''} onClick={() => setRightTab('patient')}>Patient</button>
        </nav>
        {rightTab === 'livsmedel'
          ? <FoodPicker db={db} meal={meal} onAdd={addEntry} />
          : person
            ? <PatientPanel person={person} calc={calc} onPatchPerson={onPatchPerson} onPatchCalc={onPatchCalc} />
            : (
              <div className="ws-nopatient">
                <p><strong>Ingen patient vald.</strong></p>
                <p className="muted">Intaget visas utan behov och rekommendationer. Välj en patient för att jämföra med behov, protein per kg och RDI.</p>
                {onPickPatient && <button className="primary" onClick={onPickPatient}>Välj patient</button>}
              </div>
            )}
      </section>

      <section className="ws-bottom panelbox" aria-label="Näring i förhållande till rekommendationer">
        <nav className="ws-tabs" role="tablist">
          <button role="tab" aria-selected={bottomTab === 'rdi'} className={bottomTab === 'rdi' ? 'on' : ''} onClick={() => setBottomTab('rdi')}>{person ? 'Näring mot behov' : 'Intag'}</button>
          <button role="tab" aria-selected={bottomTab === 'efordelning'} className={bottomTab === 'efordelning' ? 'on' : ''} onClick={() => setBottomTab('efordelning')}>Energifördelning</button>
          <button role="tab" aria-selected={bottomTab === 'maltider'} className={bottomTab === 'maltider' ? 'on' : ''} onClick={() => setBottomTab('maltider')}>Måltider</button>
          <span className="ws-scope" role="radiogroup" aria-label="Visa för">
            <button role="radio" aria-checked={scope === 'dag'} className={scope === 'dag' ? 'on' : ''} onClick={() => setScope('dag')}>Dag</button>
            <button role="radio" aria-checked={scope === 'maltid'} className={scope === 'maltid' ? 'on' : ''} onClick={() => setScope('maltid')}>Måltid</button>
          </span>
        </nav>
        {bottomTab === 'rdi' && (person && need
          ? <RdiView person={person} weightKg={weightKg} need={need} scoped={scoped} scope={scope} />
          : <IntakeView scoped={scoped} />)}
        {bottomTab === 'efordelning' && <MacroView person={person} totals={scoped.totals} />}
        {bottomTab === 'maltider' && <MealView summary={summary} />}
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
  const [toMeal, setToMeal] = useState<Meal | 'ny'>('ny')
  const dayOpts = Array.from({ length: days }, (_, i) => i + 1)
  const srcMeals = mealsFor(fromDay)
  const fm = srcMeals.includes(fromMeal) ? fromMeal : srcMeals[0]
  const n = entries.filter(e => e.day === fromDay && e.meal === fm).length
  const tm = toMeal === 'ny' || mealsFor(toDay).includes(toMeal) ? toMeal : 'ny'
  return (
    <div className="ws-copy" role="group" aria-label="Kopiera måltid">
      <span className="lbl">Kopiera</span>
      <select aria-label="Från dag" value={fromDay} onChange={e => setFromDay(Number(e.target.value))}>{dayOpts.map(d => <option key={d} value={d}>Dag {d}</option>)}</select>
      <select aria-label="Från måltid" value={fm} onChange={e => setFromMeal(e.target.value)}>{srcMeals.map(m => <option key={m} value={m}>{m}</option>)}</select>
      <span className="lbl">till</span>
      <select aria-label="Till dag" value={toDay} onChange={e => setToDay(Number(e.target.value))}>{dayOpts.map(d => <option key={d} value={d}>Dag {d}</option>)}</select>
      <select aria-label="Till måltid" value={tm} onChange={e => setToMeal(e.target.value)}>
        <option value="ny">Ny måltid</option>
        {mealsFor(toDay).filter(m => !(toDay === fromDay && m === fm)).map(m => <option key={m} value={m}>{m}</option>)}
      </select>
      <button type="button" className="primary small" disabled={n === 0} onClick={() => onCopy(fromDay, fm, toDay, tm)}>
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
      {multi && (
        <div className="ws-sources">
          {available.map(id => (
            <label key={id} className="check small">
              <input type="checkbox" checked={sources.includes(id)} disabled={sources.length === 1 && sources[0] === id} onChange={() => toggleSource(id)} />
              {SOURCES[id].label}
            </label>
          ))}
        </div>
      )}
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
    </div>
  )
}

/* ---------- Höger: patient ---------- */

function PatientPanel({ person, calc, onPatchPerson, onPatchCalc }: {
  person: Person; calc: Calculation
  onPatchPerson: (p: Partial<Person>) => void; onPatchCalc: (p: Partial<Calculation>) => void
}) {
  const [healthOpen, setHealthOpen] = useState(true)
  const b = bmi(calc.weightKg, person.heightCm)
  const numInput = (value: number, onSet: (n: number) => void, label: string, step = '0,1') => (
    <input inputMode="decimal" defaultValue={formatNumber(value, step === '1' ? 0 : 1)} aria-label={label}
      key={value} onBlur={e => { const n = Number(e.target.value.replace(',', '.')); if (n > 0) onSet(n) }} />
  )
  return (
    <div className="ws-patient">
      <div className="ws-pgrid">
        <label>Vikt (kg){numInput(calc.weightKg, n => onPatchCalc({ weightKg: n }), 'Vikt i kg')}</label>
        <label>Längd (cm){numInput(person.heightCm, n => onPatchPerson({ heightCm: n }), 'Längd i cm', '1')}</label>
        <label>BMI<output>{formatNumber(b, 1)}</output></label>
        <label>Ålder{numInput(person.age, n => onPatchPerson({ age: Math.round(n) }), 'Ålder i år', '1')}</label>
        <label>Kön
          <select value={person.sex} onChange={e => onPatchPerson({ sex: e.target.value as Person['sex'] })}>
            <option value="kvinna">Kvinna</option>
            <option value="man">Man</option>
          </select>
        </label>
        <label>PAL{numInput(calc.pal, n => onPatchCalc({ pal: n }), 'PAL')}</label>
      </div>
      <HealthSection health={person.health ?? emptyHealth()} onChange={(h: Health) => onPatchPerson({ health: h })}
        open={healthOpen} onToggle={() => setHealthOpen(o => !o)} />
    </div>
  )
}

/* ---------- Nertill: näring mot behov ---------- */

type Scoped = { totals: NutrientTotals; needKcal: number; needMJ: number; label: string }

function RdiView({ person, weightKg, need, scoped, scope }: {
  person: Person; weightKg: number
  need: { bmrKcal: number; teeKcal: number; teeMJ: number }
  scoped: Scoped; scope: 'dag' | 'maltid'
}) {
  const v = (k: NutrientKey) => scoped.totals[k] ?? 0
  const [detailed, setDetailed] = useState(() => { try { return localStorage.getItem('kalipra.microDetail') === '1' } catch { return false } })
  useEffect(() => { try { localStorage.setItem('kalipra.microDetail', detailed ? '1' : '0') } catch { /* ignorera */ } }, [detailed])
  const kcal = v('ENERC|kcal')
  const pct = scoped.needKcal > 0 ? (kcal / scoped.needKcal) * 100 : 0
  const bmrPct = (need.bmrKcal / need.teeKcal) * 100
  const macro = macroReferences(person.age, person.sex)
  const proteinPerKg = scope === 'dag' ? v('PROT') / weightKg : null
  const micro = microReferences(person.age, person.sex, need.teeMJ)
    .map(m => ({ ...m, value: scope === 'maltid' ? m.value * (scoped.needMJ / need.teeMJ) : m.value }))

  return (
    <div className="ws-rdi">
      <div className="ws-kcalrow">
        <div className="ws-kcalbox">
          <span className="lbl">Energi, {scoped.label}</span>
          <span className="val">{formatNumber(kcal, 0)} <small>av {formatNumber(scoped.needKcal, 0)} kcal</small></span>
          <div className="meter" aria-hidden="true">
            <div className="fill" style={{ width: `${Math.min(pct, 150) / 1.5}%` }} />
            <div className="mark" style={{ left: `${100 / 1.5}%` }} />
          </div>
          <span className="sub"><strong>{formatNumber(pct, 0)} %</strong> av behovet · skillnad {kcal - scoped.needKcal >= 0 ? '+' : '−'}{formatNumber(Math.abs(kcal - scoped.needKcal), 0)} kcal</span>
        </div>
        <div className="ws-kcalbox">
          <span className="lbl">Energibehov per dag ({formatNumber(weightKg, 1)} kg)</span>
          <span className="val">{formatNumber(need.teeKcal, 0)} <small>kcal</small></span>
          <div className="splitbar" aria-hidden="true">
            <div className="sb-bmr" style={{ width: `${bmrPct}%` }} />
            <div className="sb-act" style={{ width: `${100 - bmrPct}%` }} />
          </div>
          <span className="sub">BMR {formatNumber(need.bmrKcal, 0)} kcal · aktivitet {formatNumber(need.teeKcal - need.bmrKcal, 0)} kcal</span>
        </div>
        <div className="ws-kcalbox">
          <span className="lbl">Protein</span>
          {proteinPerKg !== null ? (
            <>
              <span className="val">{formatNumber(proteinPerKg, 2)} <small>g/kg och dag</small></span>
              <div className="meter" aria-hidden="true">
                <div className={`fill ${proteinPerKg >= macro.proteinGPerKg ? '' : 'low'}`} style={{ width: `${Math.min((proteinPerKg / macro.proteinGPerKg) * 100, 150) / 1.5}%` }} />
                <div className="mark" style={{ left: `${100 / 1.5}%` }} />
              </div>
              <span className="sub">Rekommendation minst {formatNumber(macro.proteinGPerKg, 2)} g/kg · {v('PROT') > 0 ? `${formatNumber(v('PROT'), 0)} g totalt` : 'inget registrerat'} · <span className={`pill ${proteinPerKg >= macro.proteinGPerKg ? 'ok' : 'low'}`}>{proteinPerKg >= macro.proteinGPerKg ? 'Inom' : 'Under'}</span></span>
            </>
          ) : (
            <>
              <span className="val">{formatNumber(v('PROT'), 1)} <small>g denna måltid</small></span>
              <span className="sub">g/kg beräknas per dag – växla till Dag.</span>
            </>
          )}
        </div>
      </div>

      <div className="ws-h4row">
        <h4 className="ws-h4">Vitaminer och mineraler i förhållande till {scope === 'dag' ? 'RDI (NNR 2023)' : 'måltidens andel av RDI'}</h4>
        <button type="button" className={`small ws-detailbtn ${detailed ? 'on' : ''}`} aria-pressed={detailed} onClick={() => setDetailed(x => !x)}>
          {detailed ? 'Enkel vy' : 'Detaljerad vy'}
        </button>
      </div>
      <div className={`ws-micros ${detailed ? 'detailed' : ''}`}>
        {micro.map(m => {
          const d = NUTRIENTS[m.key]
          const val = v(m.key)
          const p = m.value > 0 ? (val / m.value) * 100 : 0
          const st = m.kind === 'max' ? (val > m.value ? 'high' : 'ok') : p >= 100 ? 'ok' : p >= 67 ? 'near' : 'low'
          return (
            <div className="ws-micro" key={m.key} title={`${d.label}: ${formatNumber(val, d.decimals)} ${d.unit} av ${m.kind === 'max' ? 'högst ' : ''}${formatNumber(m.value, d.decimals)} ${d.unit}`}>
              <span className="mn">{d.label}</span>
              <div className={`bar ${st}`} aria-hidden="true">
                <div style={{ width: `${Math.min(p, 100)}%` }} />
              </div>
              <span className={`mp ${st}`}>{formatNumber(p, 0)} %</span>
              {detailed && (
                <span className="md">
                  {formatNumber(val, d.decimals)} {d.unit} <span className="ref">({m.kind === 'max' ? 'högst ' : 'RDI '}{formatNumber(m.value, d.decimals)} {d.unit})</span>
                </span>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

/* ---------- Nertill: intag utan patient ---------- */

const INTAKE_MICROS: NutrientKey[] = ['VITA', 'VITD', 'VITE', 'THIACLHCL', 'RIBF', 'NIAEQ', 'VITB6', 'FOL', 'VITB12', 'VITC', 'CA', 'P', 'K', 'MG', 'FE', 'ZN', 'ID', 'SE', 'NACL']

function IntakeView({ scoped }: { scoped: Scoped }) {
  const v = (k: NutrientKey) => scoped.totals[k] ?? 0
  const big: [string, number, string, number][] = [
    ['Energi', v('ENERC|kcal'), 'kcal', 0], ['Protein', v('PROT'), 'g', 1], ['Fett', v('FAT'), 'g', 1],
    ['Kolhydrater', v('CHO'), 'g', 1], ['Fiber', v('FIBT'), 'g', 1],
  ]
  return (
    <div className="ws-rdi">
      <p className="muted ws-intakenote">Intag, {scoped.label}. Välj en patient för att se behov och RDI.</p>
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

type Status = 'ok' | 'near' | 'low' | 'high'
const STATUS_TEXT: Record<Status, string> = { ok: 'Inom', near: 'Nära', low: 'Under', high: 'Över' }
const rangeStatus = (val: number, r: Range): Status => (r.min !== undefined && val < r.min ? 'low' : r.max !== undefined && val > r.max ? 'high' : 'ok')
const rangeText = (r: Range): string => {
  const f = (n: number) => formatNumber(n, Number.isInteger(n) ? 0 : 1)
  if (r.min !== undefined && r.max !== undefined) return `${f(r.min)}–${f(r.max)} E%`
  if (r.min !== undefined) return `minst ${f(r.min)} E%`
  return `högst ${f(r.max!)} E%`
}

function MacroView({ person, totals }: { person: Person | null; totals: NutrientTotals }) {
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
    <table className="ref ws-macro">
      <thead><tr><th>Näringsämne</th><th className="num">Gram</th><th className="num">E%</th><th>Rekommendation</th><th>Läge</th></tr></thead>
      <tbody>
        {rows.map(r => {
          const isFiber = r.label === 'Fiber'
          const st = isFiber ? null : rangeStatus(r.pct, r.ref)
          return (
            <tr key={r.label} className={r.label.startsWith('–') ? 'subrow' : ''}>
              <td>{r.label}</td>
              <td className="num">{formatNumber(r.grams, 1)}</td>
              <td className="num">{isFiber ? '' : <strong>{formatNumber(r.pct, 1)}</strong>}</td>
              <td>{isFiber ? `minst ${formatNumber(macro.fiberGPerMJ.min ?? 3, 0)} g/MJ` : r.label === 'Alkohol' ? 'Ingen säker nivå' : rangeText(r.ref)}</td>
              <td>{st && <span className={`pill ${st}`}>{STATUS_TEXT[st]}</span>}</td>
            </tr>
          )
        })}
      </tbody>
    </table>
  )
}

/* ---------- Nertill: måltidsfördelning ---------- */

function MealView({ summary }: { summary: ReturnType<typeof summarizeDiary> }) {
  const dayKcal = summary.perDay['ENERC|kcal'] ?? 0
  const meals = sortMeals(Object.keys(summary.perMeal))
  if (meals.length === 0) return <p className="empty">Ingen kostregistrering ännu.</p>
  return (
    <table className="ref">
      <tbody>
        {meals.map(m => {
          const mk = summary.perMeal[m]!['ENERC|kcal'] ?? 0
          const p = dayKcal > 0 ? (mk / dayKcal) * 100 : 0
          return (
            <tr key={m}>
              <td>{m}</td>
              <td className="num">{formatNumber(mk, 0)} kcal</td>
              <td className="num">{formatNumber(p, 0)} %</td>
              <td className="wide"><div className="hbar"><div style={{ width: `${p}%` }} /></div></td>
            </tr>
          )
        })}
      </tbody>
    </table>
  )
}
