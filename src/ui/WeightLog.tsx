import { useEffect, useRef, useState } from 'react'
import { bmi } from '../core/energy'
import { formatNumber } from '../core/nutrients'
import { newId } from '../core/storage'
import { LIMITS, type WeightEntry } from '../core/types'
import { change, sortWeights } from '../core/weights'
import { DatePicker } from './DatePicker'

const today = () => new Date().toLocaleDateString('sv-SE')
const dateText = (d: string) => new Date(d + 'T12:00:00').toLocaleDateString('sv-SE', { year: 'numeric', month: 'short', day: 'numeric' })
const signed = (n: number, d: number) => `${n > 0 ? '+' : n < 0 ? '−' : '±'}${formatNumber(Math.abs(n), d)}`

/** Vikthistorik i Klientdata: samma vägningar som i undernäringsbedömningen. */
export function WeightLog({ weights, heightCm, onChange, title = 'Vikthistorik', graphButton = true, summary, footer, formClass = '', kgId }: {
  weights: WeightEntry[] | undefined
  heightCm: number | undefined
  onChange: (w: WeightEntry[]) => void
  title?: string
  /** Knappen Se graf (Klientdata). I Bedöm undernäring visas grafen i summary i stället. */
  graphButton?: boolean
  /** Visas mellan formuläret och tabellen (t.ex. viktförändring med graf) */
  summary?: React.ReactNode
  footer?: React.ReactNode
  formClass?: string
  kgId?: string
}) {
  const sorted = sortWeights(weights ?? [])
  const newestFirst = [...sorted].reverse()
  const [date, setDate] = useState(today())
  const [kgText, setKgText] = useState('')
  const [error, setError] = useState('')
  const [showGraph, setShowGraph] = useState(false)

  const num = (t: string) => Number(t.replace(',', '.').replace(/\s/g, ''))
  /** Ändrar en vägning (datum eller vikt). Ogiltiga värden ignoreras med felmeddelande. */
  function update(w: WeightEntry, p: { date?: string; kg?: number }) {
    const date = p.date ?? w.date
    const kg = p.kg ?? w.kg
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return setError('Ange datum.')
    if (date > today()) return setError('Datumet kan inte vara i framtiden.')
    if (sorted.some(x => x.id !== w.id && x.date === date)) return setError('Det finns redan en vikt för det datumet.')
    if (!(kg >= 8 && kg <= LIMITS.maxWeightKg)) return setError(`Vikten ska vara 8–${LIMITS.maxWeightKg} kg.`)
    setError('')
    onChange(sortWeights(sorted.map(x => (x.id === w.id ? { ...x, date, kg: Math.round(kg * 10) / 10 } : x))))
  }

  function add(e: React.FormEvent) {
    e.preventDefault()
    const kg = Number(kgText.replace(',', '.').replace(/\s/g, ''))
    if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return setError('Ange datum.')
    if (date > today()) return setError('Datumet kan inte vara i framtiden.')
    if (!kgText.trim() || !(kg >= 8 && kg <= LIMITS.maxWeightKg)) return setError(`Vikten ska vara 8–${LIMITS.maxWeightKg} kg.`)
    if (sorted.some(x => x.date === date)) return setError('Det finns redan en vikt för det datumet. Ta bort den först om du vill ändra.')
    onChange(sortWeights([...sorted, { id: newId(), date, kg: Math.round(kg * 10) / 10 }]))
    setKgText('')
    setError('')
  }

  return (
    <section className="pd-card wlog">
      <div className="wlog-head">
        <h2>{title}</h2>
        {graphButton && sorted.length >= 2 && <button type="button" className={`small ${showGraph ? 'on' : ''}`} aria-pressed={showGraph} onClick={() => setShowGraph(g => !g)}>{showGraph ? 'Dölj graf' : 'Se graf'}</button>}
      </div>
      <form className={`weightadd${formClass}`} onSubmit={add} noValidate>
        <div className="field">
          <span>Datum</span>
          <DatePicker id="wl-date" value={date} onChange={setDate} max={today()} />
        </div>
        <label className="field">
          <span>Vikt (kg)</span>
          <input id={kgId} inputMode="decimal" value={kgText} onChange={e => setKgText(e.target.value)} placeholder="t.ex. 72,4" />
        </label>
        <button type="submit" className="primary">Lägg till</button>
      </form>
      {error && <p className="error" role="alert">{error}</p>}
      {summary}
      {sorted.length === 0 ? <p className="empty">Inga vikter ännu.</p> : (
        <table className="ref stack wtable">
          <thead><tr><th>Datum</th><th className="num">Vikt</th><th className="num">BMI</th><th className="num">Sedan föregående</th><th></th></tr></thead>
          <tbody>
            {newestFirst.map((w, i) => {
              const prev = newestFirst[i + 1]
              const c = prev ? change(prev, w) : null
              const h = w.heightCm ?? heightCm
              return (
                <tr key={w.id}>
                  <td data-l="Datum"><EditCell text={dateText(w.date)} value={w.date} type="date" label={`Datum för vikten ${dateText(w.date)}`} onSave={v => update(w, { date: v })} /></td>
                  <td data-l="Vikt" className="num"><EditCell text={`${formatNumber(w.kg, 1)} kg`} value={formatNumber(w.kg, 1)} strong label={`Vikt ${dateText(w.date)}`} onSave={v => update(w, { kg: num(v) })} /></td>
                  <td data-l="BMI" className="num">{h ? <EditCell text={formatNumber(bmi(w.kg, h), 1)} value={formatNumber(bmi(w.kg, h), 1)} label={`BMI ${dateText(w.date)}`} onSave={v => update(w, { kg: num(v) * (h / 100) ** 2 })} /> : '–'}</td>
                  <td data-l="Sedan föregående" className="num">{c ? `${signed(c.deltaKg, 1)} kg (${signed(c.deltaPct, 1)} %)` : '–'}</td>
                  <td className="del"><button type="button" className="linkbtn" aria-label={`Ta bort vikten ${dateText(w.date)}`} onClick={() => onChange(sorted.filter(x => x.id !== w.id))}>Ta bort</button></td>
                </tr>
              )
            })}
          </tbody>
        </table>
      )}
      {graphButton && showGraph && sorted.length >= 2 && <WeightChart weights={sorted} />}
      {footer}
    </section>
  )
}

/** Linjediagram över vikten. Tidsaxeln är proportionell mot datum. */
export function WeightChart({ weights }: { weights: WeightEntry[] }) {
  const ref = useRef<HTMLDivElement>(null)
  const [W, setW] = useState(600)
  const [hover, setHover] = useState<number | null>(null)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const ro = new ResizeObserver(() => setW(el.clientWidth || 600))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])
  const H = 230, L = 48, R = 16, T = 26, B = 30
  const t = (d: string) => new Date(d + 'T12:00:00').getTime()
  const t0 = t(weights[0].date), t1 = t(weights[weights.length - 1].date)
  const kgs = weights.map(w => w.kg)
  let lo = Math.min(...kgs), hi = Math.max(...kgs)
  const pad = Math.max(1, (hi - lo) * 0.15)
  lo = Math.floor(lo - pad); hi = Math.ceil(hi + pad)
  const x = (d: string) => L + (t1 === t0 ? 0.5 : (t(d) - t0) / (t1 - t0)) * (W - L - R)
  const y = (kg: number) => T + (1 - (kg - lo) / (hi - lo)) * (H - T - B)
  const step = (hi - lo) <= 6 ? 1 : (hi - lo) <= 15 ? 2 : (hi - lo) <= 40 ? 5 : 10
  const ticks: number[] = []
  for (let v = Math.ceil(lo / step) * step; v <= hi; v += step) ticks.push(v)
  const pts = weights.map(w => `${x(w.date)},${y(w.kg)}`).join(' ')
  const short = (d: string) => new Date(d + 'T12:00:00').toLocaleDateString('sv-SE', { day: 'numeric', month: 'short', year: '2-digit' })
  const first = weights[0], last = weights[weights.length - 1]
  const h = hover !== null ? weights[hover] : null
  return (
    <div className="wchart" ref={ref}>
      <svg width={W} height={H} role="img" aria-label={`Vikt från ${short(first.date)} (${formatNumber(first.kg, 1)} kg) till ${short(last.date)} (${formatNumber(last.kg, 1)} kg)`}>
        {ticks.map(v => (
          <g key={v}>
            <line x1={L} x2={W - R} y1={y(v)} y2={y(v)} className="wc-grid" />
            <text x={L - 8} y={y(v)} className="wc-tick" textAnchor="end" dominantBaseline="middle">{formatNumber(v, 0)}</text>
          </g>
        ))}
        <text x={L} y={H - 8} className="wc-tick" textAnchor="start">{short(first.date)}</text>
        {W > 380 && <text x={W - R} y={H - 8} className="wc-tick" textAnchor="end">{short(last.date)}</text>}
        <text x={L - 8} y={4} className="wc-tick" textAnchor="end" dominantBaseline="hanging">kg</text>
        <polyline points={pts} className="wc-line" />
        {weights.map((w, i) => (
          <g key={w.id} onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)}>
            <circle cx={x(w.date)} cy={y(w.kg)} r={14} fill="transparent" />
            <circle cx={x(w.date)} cy={y(w.kg)} r={hover === i ? 6 : 4.5} className="wc-dot" />
          </g>
        ))}
      </svg>
      {h && (
        <div className="wc-tip" style={{ left: Math.min(Math.max(x(h.date), 70), W - 70), top: y(h.kg) - 12 }}>
          <strong>{formatNumber(h.kg, 1)} kg</strong> · {short(h.date)}
        </div>
      )}
    </div>
  )
}

/** Värde som visas som text och blir ett fält när man klickar på det. Sparas vid Enter eller när fältet lämnas. */
export function EditCell({ text, value, type = 'text', strong, label, onSave }: {
  text: string; value: string; type?: 'text' | 'date'; strong?: boolean; label: string; onSave: (v: string) => void
}) {
  const [editing, setEditing] = useState(false)
  if (!editing) return (
    <button type="button" className="wl-cell" title="Klicka för att ändra" aria-label={`${label}: ${text}. Ändra`} onClick={() => setEditing(true)}>
      {strong ? <strong>{text}</strong> : text}
    </button>
  )
  const done = (el: HTMLInputElement, save: boolean) => {
    setEditing(false)
    if (save && el.value.trim() && el.value !== value) onSave(el.value.trim())
  }
  return (
    <input className={`wl-input ${type}`} type={type} inputMode={type === 'text' ? 'decimal' : undefined} defaultValue={value} autoFocus aria-label={label}
      max={type === 'date' ? today() : undefined}
      onBlur={e => done(e.currentTarget, true)}
      onKeyDown={e => { if (e.key === 'Enter') e.currentTarget.blur(); if (e.key === 'Escape') done(e.currentTarget, false) }} />
  )
}
