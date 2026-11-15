import { useState } from 'react'
import { bmi } from '../core/energy'
import { formatNumber } from '../core/nutrients'
import { newId } from '../core/storage'
import { emptyHealth, KNOWN_CONDITIONS, type Client, type Health, type WeightEntry } from '../core/types'
import { change, changeWithin, sortWeights, totalChange, type WeightChange } from '../core/weights'
import { HealthSection } from './HealthSection'

const today = () => new Date().toLocaleDateString('sv-SE')
const dateText = (d: string) => new Date(d + 'T12:00:00').toLocaleDateString('sv-SE', { year: 'numeric', month: 'short', day: 'numeric' })
const signed = (n: number, d: number) => `${n > 0 ? '+' : n < 0 ? '−' : '±'}${formatNumber(Math.abs(n), d)}`

/* ---------- Välj person ---------- */

type PickerProps = {
  clients: Client[]
  onPick: (id: string) => void
  onNew: () => void
}

export function PersonPicker({ clients, onPick, onNew }: PickerProps) {
  const [q, setQ] = useState('')
  const list = [...clients]
    .sort((a, b) => (b.updatedAt ?? b.createdAt).localeCompare(a.updatedAt ?? a.createdAt))
    .filter(c => c.code.toLowerCase().includes(q.trim().toLowerCase()))
  return (
    <>
      <p className="lead">Koppla bedömningen till en person. Personens kostregistrering och hälsotillstånd följer med åt båda hållen.</p>
      <div className="loadactions">
        <button className="primary" onClick={onNew}>+ Ny person</button>
      </div>
      <h2 className="sub">Välj befintlig person</h2>
      {clients.length === 0 ? (
        <p className="empty">Inga personer ännu. Skapa en ny person för att börja.</p>
      ) : (
        <>
          {clients.length > 6 && (
            <input className="filter" type="search" placeholder="Sök på kod …" value={q} onChange={e => setQ(e.target.value)} aria-label="Sök person" />
          )}
          <ul className="savedlist">
            {list.map(c => {
              const n = c.weights?.length ?? 0
              return (
                <li key={c.id}>
                  <button onClick={() => onPick(c.id)}>
                    <span className="ccode">{c.code}</span>
                    <span className="cmeta">{c.sex === 'kvinna' ? 'Kvinna' : 'Man'}, {c.age} år · {formatNumber(c.weightKg, 1)} kg · {formatNumber(c.heightCm, 0)} cm</span>
                    <span className="cdate">{n === 0 ? 'Inga vägningar' : `${n} vägning${n === 1 ? '' : 'ar'}`}</span>
                    <span className="open" aria-hidden="true">Bedöm →</span>
                  </button>
                </li>
              )
            })}
            {list.length === 0 && <li className="muted">Ingen person matchar sökningen.</li>}
          </ul>
        </>
      )}
    </>
  )
}

/* ---------- Bedömning för en person ---------- */

type AssessmentProps = {
  client: Client
  onUpdate: (patch: Partial<Client>) => void
  onOpenDiary: () => void
  onChangePerson: () => void
}

export function Assessment({ client, onUpdate, onOpenDiary, onChangePerson }: AssessmentProps) {
  const [date, setDate] = useState(today())
  const [kg, setKg] = useState('')
  const [error, setError] = useState('')
  const [healthOpen, setHealthOpen] = useState(false)

  const weights = sortWeights(client.weights ?? [])
  const newestFirst = [...weights].reverse()
  const latest = weights[weights.length - 1]
  const health: Health = (() => {
    const h = { ...emptyHealth(), ...client.health }
    return { ...h, conditions: h.conditions.filter(c => KNOWN_CONDITIONS.includes(c)) }
  })()

  function add(e: React.FormEvent) {
    e.preventDefault()
    const v = Number(kg.replace(',', '.'))
    if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return setError('Ange datum.')
    if (date > today()) return setError('Datumet kan inte vara i framtiden.')
    if (!(v >= 8 && v <= 400)) return setError('Ange vikt i kg (8–400).')
    if (weights.some(w => w.date === date)) return setError('Det finns redan en vikt för det datumet. Ta bort den först om du vill ändra.')
    const entry: WeightEntry = { id: newId(), date, kg: v }
    onUpdate({ weights: [...weights, entry] })
    setKg('')
    setError('')
  }

  const total = totalChange(weights)
  const periods: { label: string; c: WeightChange | null }[] = [
    { label: 'Senaste 3 månaderna', c: changeWithin(weights, 3) },
    { label: 'Senaste 6 månaderna', c: changeWithin(weights, 6) },
    { label: 'Hela perioden', c: total },
  ]

  return (
    <div className="assess">
      <section className="clienthead">
        <div className="chtop">
          <div>
            <h1>{client.code}</h1>
            <p className="facts">
              {client.sex === 'kvinna' ? 'Kvinna' : 'Man'}, {client.age} år · {formatNumber(client.heightCm, 0)} cm · nuvarande vikt i beräkningen {formatNumber(client.weightKg, 1)} kg
            </p>
          </div>
          <div className="actions">
            <button className="small primary" onClick={onOpenDiary}>Kostregistrering →</button>
            <button className="small" onClick={onChangePerson}>Byt person</button>
          </div>
        </div>
      </section>

      <section>
        <h3>Vikter</h3>
        <form className="weightadd" onSubmit={add} noValidate>
          <label className="field">
            <span>Datum</span>
            <input id="w-date" type="date" value={date} max={today()} onChange={e => setDate(e.target.value)} />
          </label>
          <label className="field">
            <span>Vikt (kg)</span>
            <input id="w-kg" inputMode="decimal" value={kg} onChange={e => setKg(e.target.value)} placeholder="t.ex. 72,4" />
          </label>
          <button type="submit" className="primary">Lägg till vikt</button>
        </form>
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
              <thead><tr><th>Datum</th><th className="num">Vikt</th><th className="num">BMI</th><th className="num">Sedan föregående</th><th></th></tr></thead>
              <tbody>
                {newestFirst.map((w, i) => {
                  const prev = newestFirst[i + 1]
                  const c = prev ? change(prev, w) : null
                  return (
                    <tr key={w.id}>
                      <td data-l="Datum">{dateText(w.date)}</td>
                      <td data-l="Vikt" className="num"><strong>{formatNumber(w.kg, 1)} kg</strong></td>
                      <td data-l="BMI" className="num">{formatNumber(bmi(w.kg, client.heightCm), 1)}</td>
                      <td data-l="Sedan föregående" className="num">{c ? `${signed(c.deltaKg, 1)} kg (${signed(c.deltaPct, 1)} %)` : '–'}</td>
                      <td className="del"><button type="button" className="linkbtn" aria-label={`Ta bort vikten ${dateText(w.date)}`} onClick={() => onUpdate({ weights: weights.filter(x => x.id !== w.id) })}>Ta bort</button></td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
            {latest && Math.abs(latest.kg - client.weightKg) >= 0.05 && (
              <p className="msg">
                Senaste vägningen ({formatNumber(latest.kg, 1)} kg, {dateText(latest.date)}) skiljer sig från vikten i beräkningen ({formatNumber(client.weightKg, 1)} kg).{' '}
                <button type="button" className="small" onClick={() => onUpdate({ weightKg: latest.kg })}>Använd {formatNumber(latest.kg, 1)} kg i beräkningen</button>
              </p>
            )}
            <p className="note">Bedömningskriterier för undernäring läggs till i ett senare steg.</p>
          </>
        )}
      </section>

      <section className="assesshealth">
        <HealthSection health={health} onChange={h => onUpdate({ health: h })} open={healthOpen} onToggle={() => setHealthOpen(o => !o)} />
        <p className="note">Ändringar sparas direkt och gäller även personens kostberäkning.</p>
      </section>
    </div>
  )
}
