import { useState } from 'react'
import { bmi } from '../core/energy'
import { formatNumber } from '../core/nutrients'
import { newId } from '../core/storage'
import { emptyHealth, KNOWN_CONDITIONS, type Health, type Person, type WeightEntry } from '../core/types'
import { autoField, change, changeWithin, solveBody, sortWeights, totalChange, type BodyField, type WeightChange } from '../core/weights'
import { HealthSection } from './HealthSection'

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

export type AssessmentData = { weights: WeightEntry[]; health?: Health; heightCm?: number }

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
    <label className={`field${auto === f && vals[f] ? ' autocalc' : ''}`}>
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
        <h3>Vikter</h3>
        <form className="weightadd" onSubmit={add} noValidate>
          <label className="field">
            <span>Datum</span>
            <input id="w-date" type="date" value={date} max={today()} onChange={e => setDate(e.target.value)} />
          </label>
          {field('h', 'w-height', 'Längd (cm)', 't.ex. 168')}
          {field('w', 'w-kg', 'Vikt (kg)', 't.ex. 72,4')}
          {field('b', 'w-bmi', 'BMI', 't.ex. 24,5')}
          <button type="submit" className="primary">Lägg till</button>
        </form>
        <p className="hint">Fyll i två av längd, vikt och BMI – det tredje räknas ut.</p>
        {error && <p className="error" role="alert">{error}</p>}

        {weights.length === 0 ? (
          <p className="empty">Inga vikter ännu. Lägg in vikter med datum, gärna även äldre uppgifter, så räknas viktförändringen ut.</p>
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
            <p className="note">Bedömningskriterier för undernäring läggs till i ett senare steg.</p>
          </>
        )}
      </section>

      <section className="assesshealth">
        <HealthSection health={health} onChange={h => onChange({ health: h })} open={healthOpen} onToggle={() => setHealthOpen(o => !o)} />
      </section>
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
