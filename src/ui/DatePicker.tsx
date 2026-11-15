import { useEffect, useRef, useState } from 'react'

const MONTHS = ['januari', 'februari', 'mars', 'april', 'maj', 'juni', 'juli', 'augusti', 'september', 'oktober', 'november', 'december']
const MONTHS_SHORT = ['jan', 'feb', 'mar', 'apr', 'maj', 'jun', 'jul', 'aug', 'sep', 'okt', 'nov', 'dec']
const WEEKDAYS = ['mån', 'tis', 'ons', 'tor', 'fre', 'lör', 'sön']

type View = 'dag' | 'manad' | 'ar'

type Props = {
  id?: string
  /** Datum som ÅÅÅÅ-MM-DD */
  value: string
  onChange: (date: string) => void
  /** Senaste valbara datum (ÅÅÅÅ-MM-DD) */
  max?: string
  label?: string
}

const pad = (n: number) => String(n).padStart(2, '0')
const iso = (y: number, m: number, d: number) => `${y}-${pad(m + 1)}-${pad(d)}`

/** Datumväljare med kalender: bläddra mellan månader, zooma ut till månader och år. */
export function DatePicker({ id, value, onChange, max, label = 'Datum' }: Props) {
  const [open, setOpen] = useState(false)
  const [view, setView] = useState<View>('dag')
  const initial = parseIso(value) ?? parseIso(max ?? '') ?? todayParts()
  const [year, setYear] = useState(initial.y)
  const [month, setMonth] = useState(initial.m)
  const root = useRef<HTMLDivElement>(null)
  const maxParts = parseIso(max ?? '')

  useEffect(() => {
    if (!open) return
    const onDoc = (e: MouseEvent) => { if (root.current && !root.current.contains(e.target as Node)) setOpen(false) }
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false) }
    document.addEventListener('mousedown', onDoc)
    document.addEventListener('keydown', onKey)
    return () => { document.removeEventListener('mousedown', onDoc); document.removeEventListener('keydown', onKey) }
  }, [open])

  function toggle() {
    const p = parseIso(value) ?? maxParts ?? todayParts()
    setYear(p.y); setMonth(p.m); setView('dag'); setOpen(o => !o)
  }

  const afterMax = (y: number, m: number, d = 1) => !!max && iso(y, m, d) > max
  const monthAfterMax = (y: number, m: number) => !!maxParts && (y > maxParts.y || (y === maxParts.y && m > maxParts.m))

  function step(delta: number) {
    if (view === 'dag') {
      const t = month + delta
      setYear(year + Math.floor(t / 12)); setMonth(((t % 12) + 12) % 12)
    } else if (view === 'manad') setYear(year + delta)
    else setYear(year + delta * 12)
  }

  const nextDisabled = view === 'dag' ? monthAfterMax(month === 11 ? year + 1 : year, (month + 1) % 12)
    : view === 'manad' ? !!maxParts && year + 1 > maxParts.y
      : !!maxParts && decadeStart(year) + 12 > maxParts.y

  // Dagarna i månaden, med tomma rutor så att veckan börjar på måndag
  const first = new Date(Date.UTC(year, month, 1)).getUTCDay()
  const lead = (first + 6) % 7
  const daysInMonth = new Date(Date.UTC(year, month + 1, 0)).getUTCDate()
  const cells: (number | null)[] = [...Array(lead).fill(null), ...Array.from({ length: daysInMonth }, (_, i) => i + 1)]
  const today = todayIso()
  const start = decadeStart(year)

  return (
    <div className="datepicker" ref={root}>
      <button type="button" id={id} className="datebtn" aria-haspopup="dialog" aria-expanded={open} aria-label={`${label}: ${value ? dateLong(value) : 'inget valt'}`} onClick={toggle}>
        <span>{value ? dateLong(value) : 'Välj datum'}</span>
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M3 10h18M8 3v4M16 3v4" /></svg>
      </button>
      {open && (
        <div className="calendar" role="dialog" aria-label="Välj datum">
          <div className="calhead">
            <button type="button" className="calnav" aria-label="Föregående" onClick={() => step(-1)}>‹</button>
            {view === 'dag' && <button type="button" className="caltitle" onClick={() => setView('manad')} aria-label="Visa månader">{MONTHS[month]} {year}</button>}
            {view === 'manad' && <button type="button" className="caltitle" onClick={() => setView('ar')} aria-label="Visa år">{year}</button>}
            {view === 'ar' && <span className="caltitle static">{start}–{start + 11}</span>}
            <button type="button" className="calnav" aria-label="Nästa" disabled={nextDisabled} onClick={() => step(1)}>›</button>
          </div>

          {view === 'dag' && (
            <div className="calgrid days">
              {WEEKDAYS.map(w => <span key={w} className="wd" aria-hidden="true">{w}</span>)}
              {cells.map((d, i) => d === null ? <span key={`e${i}`} /> : (
                <button
                  key={d}
                  type="button"
                  className={`${iso(year, month, d) === value ? 'sel' : ''}${iso(year, month, d) === today ? ' today' : ''}`}
                  disabled={afterMax(year, month, d)}
                  aria-label={dateLong(iso(year, month, d))}
                  aria-pressed={iso(year, month, d) === value}
                  onClick={() => { onChange(iso(year, month, d)); setOpen(false) }}
                >{d}</button>
              ))}
            </div>
          )}

          {view === 'manad' && (
            <div className="calgrid months">
              {MONTHS_SHORT.map((m, i) => (
                <button key={m} type="button" className={parseIso(value)?.y === year && parseIso(value)?.m === i ? 'sel' : ''} disabled={monthAfterMax(year, i)} aria-label={`${MONTHS[i]} ${year}`} onClick={() => { setMonth(i); setView('dag') }}>{m}</button>
              ))}
            </div>
          )}

          {view === 'ar' && (
            <div className="calgrid months">
              {Array.from({ length: 12 }, (_, i) => start + i).map(y => (
                <button key={y} type="button" className={parseIso(value)?.y === y ? 'sel' : ''} disabled={!!maxParts && y > maxParts.y} onClick={() => { setYear(y); setView('manad') }}>{y}</button>
              ))}
            </div>
          )}

          <div className="calfoot">
            <button type="button" className="linkbtn" onClick={() => { onChange(max && today > max ? max : today); setOpen(false) }}>Idag</button>
          </div>
        </div>
      )}
    </div>
  )
}

function decadeStart(y: number) { return y - (((y % 12) + 12) % 12) }

function parseIso(s: string): { y: number; m: number; d: number } | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s)
  return m ? { y: +m[1], m: +m[2] - 1, d: +m[3] } : null
}

function todayParts() { const d = new Date(); return { y: d.getFullYear(), m: d.getMonth(), d: d.getDate() } }
function todayIso() { const t = todayParts(); return iso(t.y, t.m, t.d) }

function dateLong(s: string): string {
  const p = parseIso(s)
  return p ? `${p.d} ${MONTHS[p.m]} ${p.y}` : s
}
