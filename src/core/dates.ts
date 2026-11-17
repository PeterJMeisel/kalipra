/**
 * Datum för kostregistreringens dagar (ISO yyyy-mm-dd, index 0 = dag 1).
 * Regler:
 * - En ny registrering får dagens datum.
 * - När en dag läggs till får den dagens datum och alla dagar med automatiskt datum flyttas bakåt en dag.
 * - Datum som användaren valt själv (manuella) flyttas aldrig automatiskt.
 * - Två dagar kan aldrig ha samma datum.
 */

export function todayISO(now = new Date()): string {
  const y = now.getFullYear(), m = String(now.getMonth() + 1).padStart(2, '0'), d = String(now.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

export function addDaysISO(iso: string, n: number): string {
  const [y, m, d] = iso.split('-').map(Number)
  const dt = new Date(Date.UTC(y, m - 1, d + n))
  return dt.toISOString().slice(0, 10)
}

/** Första lediga datum från och med `start`, bakåt i tiden. */
function freeBackFrom(start: string, used: Set<string>): string {
  let c = start
  while (used.has(c)) c = addDaysISO(c, -1)
  return c
}

export type DayDates = { dates: string[]; manual: boolean[] }

/** Fyller i saknade datum (äldre beräkningar): sista dagen = idag, de före bakåt en dag i taget. */
export function ensureDayDates(days: number, dates: (string | undefined)[] | undefined, manual: boolean[] | undefined, today: string): DayDates {
  const d = Array.from({ length: days }, (_, i) => dates?.[i])
  const m = Array.from({ length: days }, (_, i) => !!manual?.[i] && !!d[i])
  if (d.every(Boolean) && new Set(d).size === d.length) return { dates: d as string[], manual: m }
  const used = new Set<string>()
  // Behåll befintliga unika datum
  d.forEach((x, i) => { if (x && !used.has(x)) used.add(x); else d[i] = undefined })
  let cand = today
  for (let i = days - 1; i >= 0; i--) {
    if (d[i]) { cand = addDaysISO(d[i]!, -1); continue }
    const c = freeBackFrom(cand, used)
    d[i] = c; used.add(c); m[i] = false
    cand = addDaysISO(c, -1)
  }
  return { dates: d as string[], manual: m }
}

/** Lägger till en dag: den nya dagen får dagens datum, automatiska datum flyttas bakåt en dag. */
export function addDayDates(cur: DayDates, today: string): DayDates {
  const used = new Set(cur.dates.filter((_, i) => cur.manual[i]))
  const newDate = freeBackFrom(today, used)
  used.add(newDate)
  const dates = [...cur.dates]
  // Flytta automatiska datum bakåt en dag, nyaste först, utan att krocka med andra datum
  const order = dates.map((_, i) => i).filter(i => !cur.manual[i]).sort((a, b) => (dates[b] < dates[a] ? -1 : dates[b] > dates[a] ? 1 : b - a))
  for (const i of order) {
    const c = freeBackFrom(addDaysISO(dates[i], -1), used)
    dates[i] = c; used.add(c)
  }
  return { dates: [...dates, newDate], manual: [...cur.manual, false] }
}

/** Användaren väljer datum för en dag. Returnerar fel om datumet redan används av en annan dag. */
export function setDayDate(cur: DayDates, index: number, date: string): DayDates | { error: string } {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return { error: 'Ogiltigt datum.' }
  const other = cur.dates.findIndex((x, i) => i !== index && x === date)
  if (other >= 0) return { error: `Dag ${other + 1} har redan det datumet.` }
  const dates = [...cur.dates], manual = [...cur.manual]
  dates[index] = date; manual[index] = true
  return { dates, manual }
}

export function removeDayDates(cur: DayDates, index: number): DayDates {
  return { dates: cur.dates.filter((_, i) => i !== index), manual: cur.manual.filter((_, i) => i !== index) }
}

/** Kort datum för flikar, t.ex. "17 nov". */
export function shortDate(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(y, m - 1, d).toLocaleDateString('sv-SE', { day: 'numeric', month: 'short' }).replace('.', '')
}
