import { useState } from 'react'
import { bmi } from '../core/energy'
import { formatNumber } from '../core/nutrients'
import { newId } from '../core/storage'
import { emptyHealth, KNOWN_CONDITIONS, type Health, type Person, type WeightEntry } from '../core/types'
import { autoField, change, changeWithin, solveBody, sortWeights, totalChange, type BodyField, type WeightChange } from '../core/weights'
import { HealthSection } from './HealthSection'
import { DatePicker } from './DatePicker'
import { assessGlim, bmiLimits, INFLAMMATORY_CONDITIONS, MALABSORPTION_CONDITIONS, type GlimAnswers, type MuscleLoss, type Stage } from '../core/glim'

const today = () => new Date().toLocaleDateString('sv-SE')
const dateText = (d: string) => new Date(d + 'T12:00:00').toLocaleDateString('sv-SE', { year: 'numeric', month: 'short', day: 'numeric' })
const signed = (n: number, d: number) => `${n > 0 ? '+' : n < 0 ? '−' : '±'}${formatNumber(Math.abs(n), d)}`

/* ---------- Lista för att välja person ---------- */

type PickerProps = {
  persons: Person[]
  /** Kort rad per person, t.ex. antal beräkningar */
  detail: (p: Person) => string
  actionLabel: string
  onPick: (id: string) => void
  /** Markeringsläge: kryssrutor i stället för att öppna patienten */
  selected?: Set<string>
  onToggle?: (id: string) => void
  /** Aktuell vikt i kg att visa per patient */
  weightOf?: (p: Person) => number | undefined
}

export function PersonPicker({ persons, detail, actionLabel, onPick, selected, onToggle, weightOf }: PickerProps) {
  const meta = (p: Person) => {
    const kg = weightOf?.(p)
    return `${p.sex === 'kvinna' ? 'Kvinna' : 'Man'}, ${p.age} år · ${kg !== undefined ? `${formatNumber(kg, 1)} kg · ` : ''}${formatNumber(p.heightCm, 0)} cm`
  }
  const [q, setQ] = useState('')
  const list = [...persons]
    .sort((a, b) => (b.updatedAt ?? b.createdAt).localeCompare(a.updatedAt ?? a.createdAt))
    .filter(p => p.code.toLowerCase().includes(q.trim().toLowerCase()))
  if (persons.length === 0) return <p className="empty">Det finns inga sparade patienter ännu.</p>
  return (
    <>
      {persons.length > 6 && (
        <input className="filter" type="search" placeholder="Sök på kod …" value={q} onChange={e => setQ(e.target.value)} aria-label="Sök patient" />
      )}
      <ul className="savedlist">
        {list.map(p => (
          <li key={p.id}>
            {selected && onToggle ? (
              <label className={`selrow${selected.has(p.id) ? ' on' : ''}`}>
                <input type="checkbox" checked={selected.has(p.id)} onChange={() => onToggle(p.id)} />
                <span className="selbody">
                  <span className="ccode">{p.code}</span>
                  <span className="cmeta">{meta(p)}</span>
                  <span className="cdate">{detail(p)}</span>
                </span>
              </label>
            ) : (
              <button onClick={() => onPick(p.id)}>
                <span className="ccode">{p.code}</span>
                <span className="cmeta">{meta(p)}</span>
                <span className="cdate">{detail(p)}</span>
                <span className="open" aria-hidden="true">{actionLabel} →</span>
              </button>
            )}
          </li>
        ))}
        {list.length === 0 && <li className="muted">Ingen patient matchar sökningen.</li>}
      </ul>
    </>
  )
}

/* ---------- Själva bedömningen: vikter och hälsotillstånd ---------- */

export type AssessmentData = { weights: WeightEntry[]; health?: Health; heightCm?: number; age?: number; glim?: GlimAnswers }

type AssessmentProps = {
  data: AssessmentData
  onChange: (patch: Partial<AssessmentData>) => void
  /** Vikt i personens senaste beräkning, för jämförelse med senaste vägningen */
  calcWeightKg?: number
  onUseLatestWeight?: (kg: number) => void
}

export function Assessment({ data, onChange, calcWeightKg, onUseLatestWeight }: AssessmentProps) {
  const weights = sortWeights(data.weights)
  const newestFirst = [...weights].reverse()
  const latest = weights[weights.length - 1]
  const heightCm = latest?.heightCm ?? data.heightCm
  const health: Health = (() => {
    const h = { ...emptyHealth(), ...data.health }
    return { ...h, conditions: h.conditions.filter(c => KNOWN_CONDITIONS.includes(c)) }
  })()

  const [date, setDate] = useState(today())
  const [vals, setVals] = useState<Record<BodyField, string>>({ h: heightCm ? numText(heightCm, 1) : '', w: '', b: '' })
  // Fälten i den ordning de senast ändrats (senast först). En förifylld längd räknas som ifylld.
  const [recent, setRecent] = useState<BodyField[]>(heightCm ? ['h'] : [])
  const [error, setError] = useState('')
  const [healthOpen, setHealthOpen] = useState(false)
  const hasHeight = weights.some(w => w.heightCm) || !!data.heightCm
  const glimMissing = {
    age: data.age === undefined,
    weight: weights.length === 0,
    height: !hasHeight,
  }
  const glimBlocked = glimMissing.age || glimMissing.weight || glimMissing.height
  const [glimOpen, setGlimOpen] = useState(!!data.glim && !glimBlocked)
  // Visa vad som saknas efter att användaren försökt öppna GLIM-bedömningen
  const [showMissing, setShowMissing] = useState(false)
  const flag = (missing: boolean) => (showMissing && missing ? ' missing' : '')

  function openGlim() {
    if (glimOpen) return setGlimOpen(false)
    if (glimBlocked) {
      setShowMissing(true)
      const first = glimMissing.age ? 'a-age' : glimMissing.height ? 'w-height' : 'w-kg'
      setTimeout(() => {
        const el = document.getElementById(first)
        el?.scrollIntoView({ behavior: 'smooth', block: 'center' })
        el?.focus({ preventScroll: true })
      }, 0)
      return
    }
    setShowMissing(weights.length < 2)
    setGlimOpen(true)
  }
  const [ageText, setAgeText] = useState(data.age ? String(data.age) : '')
  const age = data.age

  function setAge(t: string) {
    setAgeText(t)
    const v = Number(t.trim())
    onChange({ age: t.trim() && Number.isInteger(v) && v >= 18 && v <= 120 ? v : undefined })
  }
  const auto = autoField(recent)

  function edit(field: BodyField, text: string) {
    const order = [field, ...recent.filter(f => f !== field)]
    const next = { ...vals, [field]: text }
    const target = autoField(order)
    if (target) {
      const v = solveBody(target, { h: parse(next.h), w: parse(next.w), b: parse(next.b) })
      next[target] = v === undefined ? '' : numText(v, 1)
    }
    setRecent(order)
    setVals(next)
  }

  function add(e: React.FormEvent) {
    e.preventDefault()
    const h = parse(vals.h)
    const w = parse(vals.w) ?? solveBody('w', { h, b: parse(vals.b) })
    if (age === undefined) return setError('Ange patientens nuvarande ålder (18–120 år).')
    if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return setError('Ange datum.')
    if (date > today()) return setError('Datumet kan inte vara i framtiden.')
    if (h !== undefined && !(h >= 70 && h <= 250)) return setError('Ange längd i cm (70–250).')
    if (w === undefined) return setError('Ange vikt, eller längd och BMI så räknas vikten ut.')
    if (!(w >= 8 && w <= 400)) return setError('Vikten ska vara 8–400 kg.')
    if (weights.some(x => x.date === date)) return setError('Det finns redan en vikt för det datumet. Ta bort den först om du vill ändra.')
    const kg = Math.round(w * 10) / 10
    const entry = { id: newId(), date, kg, ...(h !== undefined ? { heightCm: Math.round(h * 10) / 10 } : {}) }
    const nextWeights = sortWeights([...weights, entry])
    const newest = nextWeights[nextWeights.length - 1]
    onChange({ weights: nextWeights, ...(newest.id === entry.id && entry.heightCm ? { heightCm: entry.heightCm } : {}) })
    setVals({ h: vals.h, w: '', b: '' })
    setRecent(h !== undefined ? ['h'] : [])
    setError('')
  }

  const field = (f: BodyField, id: string, label: string, placeholder: string) => (
    <label className={`field${auto === f && vals[f] ? ' autocalc' : ''}${f === 'h' ? flag(glimMissing.height && !vals.h) : f === 'w' ? flag(glimMissing.weight && !vals.w) : ''}`}>
      <span>{label}{auto === f && vals[f] ? <em> · beräknad</em> : null}</span>
      <input id={id} inputMode="decimal" value={vals[f]} onChange={e => edit(f, e.target.value)} placeholder={placeholder} />
    </label>
  )

  const periods: { label: string; c: WeightChange | null }[] = [
    { label: 'Senaste 3 månaderna', c: changeWithin(weights, 3) },
    { label: 'Senaste 6 månaderna', c: changeWithin(weights, 6) },
    { label: 'Hela perioden', c: totalChange(weights) },
  ]

  return (
    <div className="assess">
      <section>
        <div className="agerow">
          <label className={`field${flag(glimMissing.age)}`}>
            <span>Nuvarande ålder (år) <abbr title="obligatoriskt">*</abbr></span>
            <input id="a-age" inputMode="numeric" value={ageText} onChange={e => setAge(e.target.value)} aria-required="true" aria-invalid={age === undefined && ageText.trim() !== ''} placeholder="t.ex. 72" />
          </label>
        </div>
        <h3>Vikter</h3>
        <form className={`weightadd${flag(glimMissing.weight || glimMissing.height || weights.length < 2)}`} onSubmit={add} noValidate>
          <div className="field">
            <span id="w-date-label">Datum</span>
            <DatePicker id="w-date" value={date} onChange={setDate} max={today()} />
          </div>
          {field('h', 'w-height', 'Längd (cm)', 't.ex. 168')}
          {field('w', 'w-kg', 'Vikt (kg)', 't.ex. 72,4')}
          {field('b', 'w-bmi', 'BMI', 't.ex. 24,5')}
          <button type="submit" className="primary">Lägg till</button>
        </form>
        {error && <p className="error" role="alert">{error}</p>}

        {weights.length === 0 ? (
          <p className="empty">Inga vikter ännu.</p>
        ) : (
          <>
            {weights.length >= 2 && (
              <div className="wchanges">
                {periods.map(p => (
                  <div key={p.label} className={`wchange${p.c && p.c.deltaKg < 0 ? ' down' : ''}`}>
                    <span className="wl">{p.label}</span>
                    {p.c ? (
                      <>
                        <strong>{signed(p.c.deltaPct, 1)} %</strong>
                        <span className="ws">{signed(p.c.deltaKg, 1)} kg på {p.c.days} dagar</span>
                        <span className="ws">{dateText(p.c.fromDate)} → {dateText(p.c.toDate)}</span>
                      </>
                    ) : (
                      <span className="ws">Ingen vägning inom perioden att jämföra med</span>
                    )}
                  </div>
                ))}
              </div>
            )}
            <table className="ref stack wtable">
              <thead><tr><th>Datum</th><th className="num">Längd</th><th className="num">Vikt</th><th className="num">BMI</th><th className="num">Sedan föregående</th><th></th></tr></thead>
              <tbody>
                {newestFirst.map((w, i) => {
                  const prev = newestFirst[i + 1]
                  const c = prev ? change(prev, w) : null
                  return (
                    <tr key={w.id}>
                      <td data-l="Datum">{dateText(w.date)}</td>
                      <td data-l="Längd" className="num">{w.heightCm ? `${formatNumber(w.heightCm, 1)} cm` : '–'}</td>
                      <td data-l="Vikt" className="num"><strong>{formatNumber(w.kg, 1)} kg</strong></td>
                      <td data-l="BMI" className="num">{(w.heightCm ?? heightCm) ? formatNumber(bmi(w.kg, (w.heightCm ?? heightCm)!), 1) : '–'}</td>
                      <td data-l="Sedan föregående" className="num">{c ? `${signed(c.deltaKg, 1)} kg (${signed(c.deltaPct, 1)} %)` : '–'}</td>
                      <td className="del"><button type="button" className="linkbtn" aria-label={`Ta bort vikten ${dateText(w.date)}`} onClick={() => onChange({ weights: weights.filter(x => x.id !== w.id) })}>Ta bort</button></td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
            {latest && calcWeightKg !== undefined && onUseLatestWeight && Math.abs(latest.kg - calcWeightKg) >= 0.05 && (
              <p className="msg">
                Senaste vägningen ({formatNumber(latest.kg, 1)} kg, {dateText(latest.date)}) skiljer sig från vikten i senaste beräkningen ({formatNumber(calcWeightKg, 1)} kg).{' '}
                <button type="button" className="small" onClick={() => onUseLatestWeight(latest.kg)}>Använd {formatNumber(latest.kg, 1)} kg i beräkningen</button>
              </p>
            )}
          </>
        )}
      </section>

      <section className="assesshealth">
        <HealthSection health={health} onChange={h => onChange({ health: h })} open={healthOpen} onToggle={() => setHealthOpen(o => !o)} />
      </section>

      <div className="glimstart">
        <button type="button" className="primary big" aria-expanded={glimOpen} onClick={openGlim}>
          {glimOpen ? 'Dölj GLIM-bedömningen' : 'Bedöm enligt GLIM'}
        </button>
      </div>
      {showMissing && (glimBlocked || weights.length < 2) && (
        <div className={`missingbox${glimBlocked ? '' : ' soft'}`} role="alert">
          <strong>{glimBlocked ? 'Det här saknas för en GLIM-bedömning:' : 'Viktförlusten kan inte bedömas:'}</strong>
          <ul>
            {glimMissing.age && <li><a href="#a-age">Nuvarande ålder</a></li>}
            {glimMissing.height && <li><a href="#w-height">Längd</a></li>}
            {glimMissing.weight && <li><a href="#w-kg">Vikt med datum</a></li>}
            {weights.length < 2 && <li><a href="#w-kg">Vikthistorik – minst två vägningar med datum</a></li>}
          </ul>
        </div>
      )}
      {glimOpen && !glimBlocked && age !== undefined && (
        <GlimPanel
          weights={weights}
          heightCm={heightCm}
          age={age}
          health={health}
          answers={data.glim ?? {}}
          onAnswers={glim => onChange({ glim })}
        />
      )}
    </div>
  )
}

function parse(t: string): number | undefined {
  const v = Number(t.trim().replace(',', '.'))
  return t.trim() && Number.isFinite(v) && v > 0 ? v : undefined
}

function numText(v: number, decimals: number): string {
  return String(Math.round(v * 10 ** decimals) / 10 ** decimals).replace('.', ',')
}

/* ---------- GLIM ---------- */

const STAGE_TEXT: Record<Stage, string> = { 0: 'Uppfylls inte', 1: 'Steg 1 – måttlig', 2: 'Steg 2 – svår' }

function GlimPanel({ weights, heightCm, age, health, answers, onAnswers }: {
  weights: WeightEntry[]
  heightCm?: number
  age: number
  health: Health
  answers: GlimAnswers
  onAnswers: (a: GlimAnswers) => void
}) {
  const r = assessGlim({ weights, heightCm, age, answers })
  const set = (patch: Partial<GlimAnswers>) => onAnswers({ ...answers, ...patch })
  const inflam = health.conditions.filter(c => INFLAMMATORY_CONDITIONS.includes(c))
  const malabs = health.conditions.filter(c => MALABSORPTION_CONDITIONS.includes(c))
  const limits = bmiLimits(age, answers.asian)
  const mark = (on: boolean) => <span className={`gmark${on ? ' on' : ''}`} aria-hidden="true">{on ? '✓' : '–'}</span>

  return (
    <section className="glim" aria-labelledby="glim-h">
      <h3 id="glim-h">GLIM – diagnos av undernäring</h3>


      <div className="glimcols">
        <fieldset>
          <legend>Fenotypiska kriterier</legend>
          <div className={`gcrit${r.weightCriterion ? ' met' : ''}${weights.length < 2 ? ' gmissing' : ''}`}>
            {mark(r.weightCriterion > 0)}
            <div>
              <strong>Ofrivillig viktförlust</strong>
              <span>&gt; 5 % senaste 6 mån eller &gt; 10 % längre tillbaka</span>
              {weights.length < 2 ? (
                <span className="gval gneed">Saknas: minst två vägningar med datum</span>
              ) : (
                <span className="gval">
                  Senaste 6 mån: {r.loss6 ? `${formatNumber(r.loss6.pct, 1)} % (från ${formatNumber(r.loss6.fromKg, 1)} kg)` : 'ingen vägning att jämföra med'}
                  {' · '}Längre tillbaka: {r.lossLong ? `${formatNumber(r.lossLong.pct, 1)} % (från ${formatNumber(r.lossLong.fromKg, 1)} kg)` : '–'}
                </span>
              )}
            </div>
          </div>
          <div className={`gcrit${r.bmiCriterion ? ' met' : ''}`}>
            {mark(r.bmiCriterion > 0)}
            <div>
              <strong>Lågt BMI</strong>
              <span>{`< ${formatNumber(limits[0], 1)} (${age >= 70 ? '≥ 70 år' : 'under 70 år'}, patienten är ${age} år)`}</span>
              <span className="gval">BMI: {r.bmi !== null ? formatNumber(r.bmi, 1) : 'saknas – ange vikt och längd'}</span>
            </div>
          </div>
          <div className={`gcrit${r.muscleCriterion ? ' met' : ''}`}>
            {mark(r.muscleCriterion > 0)}
            <div>
              <strong>Minskad muskelmassa</strong>
              <span>Uppmätt med validerad metod, jämfört med referensvärden</span>
              <div className={`seg${answers.muscle ? '' : ' unanswered'}`} role="radiogroup" aria-label="Minskad muskelmassa">
                {([['nej', 'Nej / ej mätt'], ['mild', 'Mild–måttlig'], ['svar', 'Svår']] as [MuscleLoss, string][]).map(([v, l]) => (
                  <button key={v} type="button" role="radio" aria-checked={answers.muscle === v} className={answers.muscle === v ? 'on' : ''} onClick={() => set({ muscle: v })}>{l}</button>
                ))}
              </div>
            </div>
          </div>
          <label className="check small">
            <input type="checkbox" checked={!!answers.asian} onChange={e => set({ asian: e.target.checked })} />
            Använd asiatiska gränsvärden för BMI
          </label>
        </fieldset>

        <fieldset>
          <legend>Etiologiska kriterier</legend>
          <label className={`gcrit check${answers.intake ? ' met' : ''}`}>
            <input type="checkbox" checked={!!answers.intake} onChange={e => set({ intake: e.target.checked })} />
            <div>
              <strong>Minskat intag eller upptag</strong>
              <span>≤ 50 % av energibehovet &gt; 1 vecka, minskat intag &gt; 2 veckor, eller kroniskt tillstånd i mag–tarmkanalen som påverkar digestion/absorption</span>
              {malabs.length > 0 && <span className="gval">Bland hälsotillstånden: {malabs.join(', ')}</span>}
            </div>
          </label>
          <label className={`gcrit check${answers.inflammation ? ' met' : ''}`}>
            <input type="checkbox" checked={!!answers.inflammation} onChange={e => set({ inflammation: e.target.checked })} />
            <div>
              <strong>Inflammation</strong>
              <span>Akut sjukdom eller skada (t.ex. stor infektion, brännskada, trauma) eller kronisk sjukdom (t.ex. hjärtsvikt, KOL, njur- eller leversjukdom, cancer). CRP kan stödja bedömningen.</span>
              {inflam.length > 0 && <span className="gval">Bland hälsotillstånden: {inflam.join(', ')}</span>}
            </div>
          </label>
        </fieldset>
      </div>

      <div className={`glimresult s${r.stage}${r.malnutrition ? ' yes' : ''}`} role="status">
        <div>
          <span className="gl">Resultat</span>
          <strong>{r.malnutrition ? (r.stage === 2 ? 'Svår undernäring (steg 2)' : 'Måttlig undernäring (steg 1)') : 'Kriterierna för undernäring är inte uppfyllda'}</strong>
          {!r.malnutrition && (
            <span className="gs">
              {r.phenotypic ? 'Fenotypiskt kriterium uppfyllt' : 'Inget fenotypiskt kriterium'} · {r.etiologic ? 'etiologiskt kriterium uppfyllt' : 'inget etiologiskt kriterium'}
            </span>
          )}
        </div>
        {r.malnutrition && (
          <ul className="gs">
            <li>Viktförlust: {STAGE_TEXT[r.weightCriterion]}</li>
            <li>BMI: {STAGE_TEXT[r.bmiCriterion]}</li>
            <li>Muskelmassa: {STAGE_TEXT[r.muscleCriterion]}</li>
          </ul>
        )}
      </div>
      <p className="note">Kriterier enligt GLIM (Cederholm m.fl. 2018), Karolinska Universitetssjukhusets flödesschema 2020-04-21.</p>
    </section>
  )
}
