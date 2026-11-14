import { useMemo, useRef, useState } from 'react'
import type { Food, FoodDatabase } from '../core/foods'
import { formatNumber } from '../core/nutrients'
import { MEALS, type Diary, type DiaryEntry, type Meal } from '../core/types'
import { newId } from '../core/storage'

type Props = {
  db: FoodDatabase
  diary: Diary
  onChange: (d: Diary) => void
}

export function DiaryEditor({ db, diary, onChange }: Props) {
  const [day, setDay] = useState(1)
  const [meal, setMeal] = useState<Meal>('Frukost')
  const [query, setQuery] = useState('')
  const [picked, setPicked] = useState<Food | null>(null)
  const [grams, setGrams] = useState('100')
  const [active, setActive] = useState(0)
  const gramsRef = useRef<HTMLInputElement>(null)
  const queryRef = useRef<HTMLInputElement>(null)

  const hits = useMemo(() => (picked ? [] : db.search(query, 30)), [db, query, picked])
  const currentDay = Math.min(day, diary.days)
  const dayEntries = diary.entries.filter(e => e.day === currentDay)

  function setDays(n: number) {
    const days = Math.max(1, Math.min(14, n))
    onChange({ ...diary, days, entries: diary.entries.filter(e => e.day <= days) })
    if (day > days) setDay(days)
  }

  function pick(f: Food) {
    setPicked(f)
    setQuery(f.name)
    setTimeout(() => gramsRef.current?.select(), 0)
  }

  function add(e: React.FormEvent) {
    e.preventDefault()
    const g = Number(grams.replace(',', '.'))
    if (!picked || !(g > 0)) return
    const entry: DiaryEntry = { id: newId(), day: currentDay, meal, foodNumber: picked.number, grams: g }
    onChange({ ...diary, entries: [...diary.entries, entry] })
    setPicked(null)
    setQuery('')
    setGrams('100')
    queryRef.current?.focus()
  }

  function update(id: string, patch: Partial<DiaryEntry>) {
    onChange({ ...diary, entries: diary.entries.map(e => (e.id === id ? { ...e, ...patch } : e)) })
  }
  function remove(id: string) {
    onChange({ ...diary, entries: diary.entries.filter(e => e.id !== id) })
  }

  const dayKcal = dayEntries.reduce((s, e) => s + ((db.get(e.foodNumber)?.per100g['ENERC|kcal'] ?? 0) * e.grams) / 100, 0)

  return (
    <div className="diary">
      <div className="dayrow">
        <div className="days" role="tablist" aria-label="Registreringsdag">
          {Array.from({ length: diary.days }, (_, i) => i + 1).map(d => (
            <button key={d} role="tab" aria-selected={d === currentDay} className={d === currentDay ? 'on' : ''} onClick={() => setDay(d)}>
              Dag {d}
            </button>
          ))}
        </div>
        <label className="inline">
          Antal dagar
          <select value={diary.days} onChange={e => setDays(Number(e.target.value))}>
            {Array.from({ length: 14 }, (_, i) => i + 1).map(n => <option key={n} value={n}>{n}</option>)}
          </select>
        </label>
      </div>

      <form className="adder" onSubmit={add}>
        <label className="field meal">
          <span>Måltid</span>
          <select value={meal} onChange={e => setMeal(e.target.value as Meal)}>
            {MEALS.map(m => <option key={m}>{m}</option>)}
          </select>
        </label>
        <div className="field search">
          <span id="sok-label">Livsmedel</span>
          <input
            ref={queryRef}
            id="food-search"
            role="combobox"
            aria-labelledby="sok-label"
            aria-expanded={hits.length > 0}
            aria-controls="food-hits"
            autoComplete="off"
            value={query}
            placeholder="Sök, t.ex. havregryn eller mjölk 3"
            onChange={e => { setQuery(e.target.value); setPicked(null); setActive(0) }}
            onKeyDown={e => {
              if (!hits.length) return
              if (e.key === 'ArrowDown') { e.preventDefault(); setActive(a => Math.min(a + 1, hits.length - 1)) }
              if (e.key === 'ArrowUp') { e.preventDefault(); setActive(a => Math.max(a - 1, 0)) }
              if (e.key === 'Enter') { e.preventDefault(); pick(hits[active]) }
            }}
          />
          {hits.length > 0 && (
            <ul className="hits" id="food-hits" role="listbox">
              {hits.map((f, i) => (
                <li key={f.number} role="option" aria-selected={i === active}>
                  <button type="button" className={i === active ? 'on' : ''} onMouseDown={e => e.preventDefault()} onClick={() => pick(f)}>
                    <span>{f.name}</span>
                    <small>{formatNumber(f.per100g['ENERC|kcal'] ?? 0, 0)} kcal/100 g</small>
                  </button>
                </li>
              ))}
            </ul>
          )}
          {query.trim().length > 1 && !picked && hits.length === 0 && <small className="muted">Inga träffar.</small>}
        </div>
        <label className="field grams">
          <span>Mängd (g)</span>
          <input ref={gramsRef} id="food-grams" inputMode="decimal" value={grams} onChange={e => setGrams(e.target.value)} />
        </label>
        <button type="submit" className="primary" disabled={!picked}>Lägg till</button>
      </form>

      {dayEntries.length === 0 ? (
        <p className="empty">Inget registrerat för dag {currentDay} ännu. Sök upp ett livsmedel ovan för att börja.</p>
      ) : (
        MEALS.filter(m => dayEntries.some(e => e.meal === m)).map(m => (
          <section key={m} className="mealblock">
            <h4>{m}</h4>
            <table className="entries">
              <tbody>
                {dayEntries.filter(e => e.meal === m).map(e => {
                  const f = db.get(e.foodNumber)
                  const kcal = ((f?.per100g['ENERC|kcal'] ?? 0) * e.grams) / 100
                  return (
                    <tr key={e.id}>
                      <td className="name">{f?.name ?? `Okänt livsmedel (${e.foodNumber})`}</td>
                      <td className="num">
                        <input
                          aria-label={`Mängd i gram för ${f?.name}`}
                          inputMode="decimal"
                          defaultValue={String(e.grams).replace('.', ',')}
                          onBlur={ev => {
                            const g = Number(ev.target.value.replace(',', '.'))
                            if (g > 0) update(e.id, { grams: g })
                            else ev.target.value = String(e.grams).replace('.', ',')
                          }}
                        /> g
                      </td>
                      <td className="num kcal">{formatNumber(kcal, 0)} kcal</td>
                      <td className="del">
                        <button type="button" aria-label={`Ta bort ${f?.name}`} onClick={() => remove(e.id)}>×</button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </section>
        ))
      )}
      {dayEntries.length > 0 && (
        <p className="daytotal">Dag {currentDay}: <strong>{formatNumber(dayKcal, 0)} kcal</strong> · {formatNumber(dayKcal * 4.184 / 1000, 1)} MJ</p>
      )}
    </div>
  )
}
