import { useState } from 'react'
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
export function WeightLog({ weights, heightCm, onChange }: {
  weights: WeightEntry[] | undefined
  heightCm: number
  onChange: (w: WeightEntry[]) => void
}) {
  const sorted = sortWeights(weights ?? [])
  const newestFirst = [...sorted].reverse()
  const [date, setDate] = useState(today())
  const [kgText, setKgText] = useState('')
  const [error, setError] = useState('')

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
      <h2>Vikthistorik</h2>
      <form className="weightadd" onSubmit={add} noValidate>
        <div className="field">
          <span>Datum</span>
          <DatePicker id="wl-date" value={date} onChange={setDate} max={today()} />
        </div>
        <label className="field">
          <span>Vikt (kg)</span>
          <input inputMode="decimal" value={kgText} onChange={e => setKgText(e.target.value)} placeholder="t.ex. 72,4" />
        </label>
        <button type="submit" className="primary">Lägg till</button>
      </form>
      {error && <p className="error" role="alert">{error}</p>}
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
                  <td data-l="Datum">{dateText(w.date)}</td>
                  <td data-l="Vikt" className="num"><strong>{formatNumber(w.kg, 1)} kg</strong></td>
                  <td data-l="BMI" className="num">{h ? formatNumber(bmi(w.kg, h), 1) : '–'}</td>
                  <td data-l="Sedan föregående" className="num">{c ? `${signed(c.deltaKg, 1)} kg (${signed(c.deltaPct, 1)} %)` : '–'}</td>
                  <td className="del"><button type="button" className="linkbtn" aria-label={`Ta bort vikten ${dateText(w.date)}`} onClick={() => onChange(sorted.filter(x => x.id !== w.id))}>Ta bort</button></td>
                </tr>
              )
            })}
          </tbody>
        </table>
      )}
    </section>
  )
}
