import { useState } from 'react'
import { bmi } from '../core/energy'
import { formatNumber } from '../core/nutrients'
import { newId } from '../core/storage'
import { emptyHealth, KNOWN_CONDITIONS, LIMITS, type Health, type Person, type Sex, type WeightEntry } from '../core/types'
import { autoField, change, changeWithin, periodText, solveBody, sortWeights, totalChange, type BodyField, type WeightChange } from '../core/weights'
import { HealthSection } from './HealthSection'
import { DatePicker } from './DatePicker'
import { EditCell, WeightChart } from './WeightLog'
import { assessGlim, bmiLimits, glimJournal, suggestEtiology, type GlimAnswers, type MuscleLoss, type Stage } from '../core/glim'

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
  /** Markeringsläge: kryssrutor i stället för att öppna klienten */
  selected?: Set<string>
  onToggle?: (id: string) => void
  /** Aktuell vikt i kg att visa per klient */
  weightOf?: (p: Person) => number | undefined
  /** Behåll ordningen i persons (annars senast ändrad först) */
  keepOrder?: boolean
}

export function PersonPicker({ persons, detail, actionLabel, onPick, selected, onToggle, weightOf, keepOrder }: PickerProps) {
  const meta = (p: Person) => {
    const kg = weightOf?.(p)
    return `${p.sex === 'kvinna' ? 'Kvinna' : 'Man'}, ${p.age} år · ${kg !== undefined ? `${formatNumber(kg, 1)} kg · ` : ''}${formatNumber(p.heightCm, 0)} cm`
  }
  const [q, setQ] = useState('')
  const list = [...persons]
    .sort((a, b) => (keepOrder ? 0 : (b.updatedAt ?? b.createdAt).localeCompare(a.updatedAt ?? a.createdAt)))
    .filter(p => p.code.toLowerCase().includes(q.trim().toLowerCase()))
  if (persons.length === 0) return <p className="empty">Det finns inga sparade klienter ännu.</p>
  return (
    <>
      {persons.length > 6 && (
        <input className="filter" type="search" placeholder="Sök på kod …" value={q} onChange={e => setQ(e.target.value)} aria-label="Sök klient" />
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
        {list.length === 0 && <li className="muted">Ingen klient matchar sökningen.</li>}
      </ul>
    </>
  )
}

/* ---------- Själva bedömningen: vikter och hälsotillstånd ---------- */

export type AssessmentData = { weights: WeightEntry[]; health?: Health; heightCm?: number; age?: number; sex?: Sex; glim?: GlimAnswers }

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
  const [showGraph, setShowGraph] = useState(false)
  const hasHeight = weights.some(w => w.heightCm) || !!data.heightCm
  const glimMissing = {
    age: data.age === undefined,
    weight: weights.length === 0,
    height: !hasHeight,
  }
  const glimBlocked = glimMissing.age || glimMissing.weight || glimMissing.height
  // Visa vad som saknas efter att användaren bett om ett förslag på diagnos
  const [showMissing, setShowMissing] = useState(false)
  const [showJournal, setShowJournal] = useState(false)
  const flag = (missing: boolean) => (showMissing && missing ? ' missing' : '')

  function suggestDiagnosis() {
    setShowMissing(glimBlocked || weights.length < 2)
    if (glimBlocked) {
      setShowJournal(false)
      const first = glimMissing.age ? 'a-age' : glimMissing.height ? 'w-height' : 'w-kg'
      setTimeout(() => {
        const el = document.getElementById(first)
        el?.scrollIntoView({ behavior: 'smooth', block: 'center' })
        el?.focus({ preventScroll: true })
      }, 0)
      return
    }
    setShowJournal(true)
    setTimeout(() => document.getElementById('glim-journal')?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 0)
  }
  const [ageText, setAgeText] = useState(data.age ? String(data.age) : '')
  const age = data.age

  function setAge(t: string) {
    setAgeText(t)
    const v = Number(t.trim())
    onChange({ age: t.trim() && Number.isInteger(v) && v >= 18 && v <= LIMITS.maxAge ? v : undefined })
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

  /** Ändrar en vägning (klick i tabellen). Ogiltiga värden ignoreras med felmeddelande. */
  function update(w: WeightEntry, p: { date?: string; kg?: number }) {
    const d = p.date ?? w.date
    const kg = 'kg' in p ? p.kg : w.kg
    if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) return setError('Ange datum.')
    if (d > today()) return setError('Datumet kan inte vara i framtiden.')
    if (weights.some(x => x.id !== w.id && x.date === d)) return setError('Det finns redan en vikt för det datumet.')
    if (kg === undefined || !(kg >= 8 && kg <= LIMITS.maxWeightKg)) return setError(`Vikten ska vara 8–${LIMITS.maxWeightKg} kg.`)
    setError('')
    onChange({ weights: sortWeights(weights.map(x => (x.id === w.id ? { ...x, date: d, kg: Math.round(kg * 10) / 10 } : x))) })
  }

  function add(e: React.FormEvent) {
    e.preventDefault()
    const h = parse(vals.h)
    const w = parse(vals.w) ?? solveBody('w', { h, b: parse(vals.b) })
    if (age === undefined) return setError(`Ange klientens nuvarande ålder (18–${LIMITS.maxAge} år).`)
    if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return setError('Ange datum.')
    if (date > today()) return setError('Datumet kan inte vara i framtiden.')
    if (h !== undefined && !(h >= 70 && h <= LIMITS.maxHeightCm)) return setError(`Ange längd i cm (70–${LIMITS.maxHeightCm}).`)
    if (w === undefined) return setError('Ange vikt, eller längd och BMI så räknas vikten ut.')
    if (!(w >= 8 && w <= LIMITS.maxWeightKg)) return setError(`Vikten ska vara 8–${LIMITS.maxWeightKg} kg.`)
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

  // Visa bara perioder som har en jämförelse, och hoppa över dem som ger samma jämförelse som en längre period
  const total = totalChange(weights)
  const periods = ([
    { label: 'Senaste 3 månaderna', c: changeWithin(weights, 3) },
    { label: 'Senaste 6 månaderna', c: changeWithin(weights, 6) },
    { label: total ? `Hela perioden (${periodText(total.fromDate, total.toDate)})` : 'Hela perioden', c: total },
  ].filter(p => p.c) as { label: string; c: WeightChange }[])
    .filter((p, i, all) => {
      const isTotal = i === all.length - 1 && p.c === total
      if (isTotal) return true
      // Samma startvikt som hela perioden eller som en kortare period: visas redan
      if (total && p.c.fromDate === total.fromDate) return false
      return !all.slice(0, i).some(q => q.c.fromDate === p.c.fromDate)
    })

  return (
    <div className="assess">
      <section>
        <div className="agerow">
          <label className={`field${flag(glimMissing.age)}`}>
            <span>Nuvarande ålder (år) <abbr title="obligatoriskt">*</abbr></span>
            <input id="a-age" inputMode="numeric" value={ageText} onChange={e => setAge(e.target.value)} aria-required="true" aria-invalid={age === undefined && ageText.trim() !== ''} placeholder="t.ex. 72" />
          </label>
        </div>
        <div className="wlog-head">
          <h3>Vikter</h3>
          {weights.length >= 2 && <button type="button" className={`small ${showGraph ? 'on' : ''}`} aria-pressed={showGraph} onClick={() => setShowGraph(g => !g)}>{showGraph ? 'Dölj graf' : 'Se graf'}</button>}
        </div>
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
              <div className={showGraph ? 'wchangerow' : undefined}>
                {showGraph && <WeightChart weights={weights} />}
              <div className="wchanges">
                {periods.map(p => (
                  <div key={p.label} className={`wchange${p.c.deltaKg < 0 ? ' down' : ''}`}>
                    <span className="wl">{p.label}</span>
                    <strong>{signed(p.c.deltaPct, 1)} %</strong>
                    <span className="ws">{signed(p.c.deltaKg, 1)} kg</span>
                    <span className="ws">{dateText(p.c.fromDate)} → {dateText(p.c.toDate)}</span>
                  </div>
                ))}
              </div>
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
                      <td data-l="Datum"><EditCell text={dateText(w.date)} value={w.date} type="date" label={`Datum för vikten ${dateText(w.date)}`} onSave={v => update(w, { date: v })} /></td>
                      <td data-l="Längd" className="num">{w.heightCm ? `${formatNumber(w.heightCm, 1)} cm` : '–'}</td>
                      <td data-l="Vikt" className="num"><EditCell text={`${formatNumber(w.kg, 1)} kg`} value={formatNumber(w.kg, 1)} strong label={`Vikt ${dateText(w.date)}`} onSave={v => update(w, { kg: parse(v) })} /></td>
                      <td data-l="BMI" className="num">{(w.heightCm ?? heightCm) ? <EditCell text={formatNumber(bmi(w.kg, (w.heightCm ?? heightCm)!), 1)} value={formatNumber(bmi(w.kg, (w.heightCm ?? heightCm)!), 1)} label={`BMI ${dateText(w.date)}`} onSave={v => { const b = parse(v); if (b !== undefined) update(w, { kg: b * ((w.heightCm ?? heightCm)! / 100) ** 2 }) }} /> : '–'}</td>
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

      <GlimPanel
        weights={weights}
        heightCm={heightCm}
        age={age}
        health={health}
        answers={data.glim ?? {}}
        onAnswers={glim => onChange({ glim })}
        showJournal={showJournal && !glimBlocked}
      />
      <div className="glimstart">
        <button type="button" className="primary big" onClick={suggestDiagnosis}>Ge förslag på GLIM-diagnos</button>
      </div>
      {showMissing && (glimBlocked || weights.length < 2) && (
        <div className={`missingbox${glimBlocked ? '' : ' soft'}`} role="alert">
          <strong>{glimBlocked ? 'Det här saknas för en GLIM-diagnos:' : 'Viktförlusten kan inte bedömas:'}</strong>
          <ul>
            {glimMissing.age && <li><a href="#a-age">Nuvarande ålder</a></li>}
            {glimMissing.height && <li><a href="#w-height">Längd</a></li>}
            {glimMissing.weight && <li><a href="#w-kg">Vikt med datum</a></li>}
            {weights.length < 2 && <li><a href="#w-kg">Vikthistorik – minst två vägningar med datum</a></li>}
          </ul>
        </div>
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

function GlimPanel({ weights, heightCm, age, health, answers, onAnswers, showJournal }: {
  weights: WeightEntry[]
  heightCm?: number
  age?: number
  health: Health
  answers: GlimAnswers
  onAnswers: (a: GlimAnswers) => void
  showJournal: boolean
}) {
  const [copied, setCopied] = useState(false)
  const r = assessGlim({ weights, heightCm, age, answers })
  const sug = suggestEtiology(health.conditions, weights)
  const set = (patch: Partial<GlimAnswers>) => onAnswers({ ...answers, ...patch })
  const limits = age !== undefined ? bmiLimits(age, answers.asian) : null
  const mark = (on: boolean) => <span className={`gmark${on ? ' on' : ''}`} aria-hidden="true">{on ? '✓' : '–'}</span>
  const journal = showJournal && age !== undefined
    ? glimJournal({ result: r, answers, age, conditions: health.conditions, date: today() })
    : ''

  async function copy() {
    try { await navigator.clipboard.writeText(journal); setCopied(true); setTimeout(() => setCopied(false), 2000) } catch { setCopied(false) }
  }

  const reasons = (list: string[]) => list.length > 0 && (
    <div className="gsuggest">
      <span className="gsl">Underlag</span>
      <ul>{list.map(t => <li key={t}>{t}</li>)}</ul>
    </div>
  )

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
                  {[
                    r.loss6 && r.loss6.pct > 0 ? `Senaste 6 mån: ${formatNumber(r.loss6.pct, 1)} % (från ${formatNumber(r.loss6.fromKg, 1)} kg)` : null,
                    r.lossLong && r.lossLong.pct > 0 ? `Längre tillbaka: ${formatNumber(r.lossLong.pct, 1)} % (från ${formatNumber(r.lossLong.fromKg, 1)} kg)` : null,
                  ].filter(Boolean).join(' · ') || 'Ingen viktförlust'}
                </span>
              )}
            </div>
          </div>
          <div className={`gcrit${r.bmiCriterion ? ' met' : ''}${limits && r.bmi !== null ? '' : ' gmissing'}`}>
            {mark(r.bmiCriterion > 0)}
            <div>
              <strong>Lågt BMI</strong>
              {limits ? <span>{`< ${formatNumber(limits[0], 1)} (${age! >= 70 ? '≥ 70 år' : 'under 70 år'})`}</span> : <span className="gval gneed">Saknas: ålder</span>}
              {r.bmi !== null ? <span className="gval">BMI {formatNumber(r.bmi, 1)}</span> : <span className="gval gneed">Saknas: vikt och längd</span>}
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
          <label className={`gcrit check${answers.intake ? ' met' : ''}${!answers.intake && sug.intake.length ? ' suggested' : ''}`}>
            <input type="checkbox" checked={!!answers.intake} onChange={e => set({ intake: e.target.checked })} />
            <div>
              <strong>Minskat intag eller upptag</strong>
              <span>≤ 50 % av energibehovet &gt; 1 vecka, minskat intag &gt; 2 veckor, eller kroniskt tillstånd i mag–tarmkanalen som påverkar digestion/absorption</span>
              {reasons(sug.intake)}
            </div>
          </label>
          <label className={`gcrit check${answers.inflammation ? ' met' : ''}${!answers.inflammation && sug.inflammation.length ? ' suggested' : ''}`}>
            <input type="checkbox" checked={!!answers.inflammation} onChange={e => set({ inflammation: e.target.checked })} />
            <div>
              <strong>Inflammation/kronisk sjukdom</strong>
              <span>Akut sjukdom eller skada (t.ex. stor infektion, brännskada, trauma) eller kronisk sjukdom (t.ex. hjärtsvikt, KOL, njur- eller leversjukdom, cancer)</span>
              {reasons(sug.inflammation)}
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

      {journal && (
        <div className="journal" id="glim-journal">
          <div className="jhead">
            <h4>Förslag på journaltext</h4>
            <button type="button" className="small" onClick={copy}>{copied ? 'Kopierat' : 'Kopiera'}</button>
          </div>
          <textarea readOnly value={journal} rows={journal.split('\n').reduce((n, l) => n + Math.ceil((l.length || 1) / 80), 1)} aria-label="Förslag på journaltext" onFocus={e => e.currentTarget.select()} />
        </div>
      )}
      <p className="note">Kriterier enligt GLIM (Cederholm m.fl. 2018), Karolinska Universitetssjukhusets flödesschema 2020-04-21.</p>
    </section>
  )
}
