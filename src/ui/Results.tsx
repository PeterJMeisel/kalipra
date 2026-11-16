import type { DiarySummary } from '../core/foods'
import { energyDistribution, formatNumber, NUTRIENTS, type NutrientKey } from '../core/nutrients'
import { macroReferences, microReferences, microStatus, type Range } from '../core/references'
import { sortMeals, type Client } from '../core/types'
import { kcalToKj, type EnergyNeed, type GoalPlan } from '../core/energy'

type Props = {
  client: Client
  summary: DiarySummary
  need: EnergyNeed
  plan: GoalPlan | null
  hasEntries: boolean
}

type Status = 'ok' | 'near' | 'low' | 'high'
const STATUS_TEXT: Record<Status, string> = { ok: 'Inom', near: 'Nära', low: 'Under', high: 'Över' }

function rangeStatus(v: number, r: Range): Status {
  if (r.min !== undefined && v < r.min) return 'low'
  if (r.max !== undefined && v > r.max) return 'high'
  return 'ok'
}
function rangeText(r: Range, unit = ''): string {
  const f = (n: number) => formatNumber(n, Number.isInteger(n) ? 0 : 1)
  if (r.min !== undefined && r.max !== undefined) return `${f(r.min)}–${f(r.max)}${unit}`
  if (r.min !== undefined) return `minst ${f(r.min)}${unit}`
  return `högst ${f(r.max!)}${unit}`
}

export function Results({ client, summary, need, plan, hasEntries }: Props) {
  if (!hasEntries) {
    return <p className="empty">Ingen kostregistrering ännu.</p>
  }
  const t = summary.perDay
  const v = (k: NutrientKey) => t[k] ?? 0
  const kcal = v('ENERC|kcal')
  const kj = v('ENERC|kJ')
  const goalKcal = plan && plan.direction !== 'bibehåll' ? plan.targetNeed.teeKcal : null
  const compareKcal = goalKcal ?? need.teeKcal
  const pctOfNeed = (kcal / compareKcal) * 100
  const e = energyDistribution(t)
  const macro = macroReferences(client.age, client.sex)
  const conditions = client.health?.conditions ?? []
  const highlight = new Map<NutrientKey, string>()
  // Godkänt (rad 9 i att göra-listan): hypertoni → NNR:s maxgräns för salt, raden lyfts fram
  if (conditions.includes('Hypertoni')) highlight.set('NACL', 'Hypertoni')
  const micro = microReferences(client.age, client.sex, need.teeMJ)
    .sort((a, b) => Number(highlight.has(b.key)) - Number(highlight.has(a.key)))
  const intakeMJ = kj / 1000
  const fiberPerMJ = intakeMJ > 0 ? v('FIBT') / intakeMJ : 0
  const proteinPerKg = v('PROT') / client.weightKg

  const macroRows: { label: string; pct: number; grams?: number; ref: Range }[] = [
    { label: 'Protein', pct: e.protein, grams: v('PROT'), ref: macro.protein },
    { label: 'Fett', pct: e.fat, grams: v('FAT'), ref: macro.fat },
    { label: '– varav mättat', pct: e.saturated, grams: v('FASAT'), ref: macro.saturated },
    { label: '– varav enkelomättat', pct: e.monounsaturated, grams: v('FAMS'), ref: macro.monounsaturated },
    { label: '– varav fleromättat', pct: e.polyunsaturated, grams: v('FAPU'), ref: macro.polyunsaturated },
    { label: 'Kolhydrater (inkl. fiber)', pct: e.carbohydrate, grams: v('CHO'), ref: macro.carbohydrate },
    { label: '– varav fritt socker', pct: e.freeSugar, grams: v('SUGFR'), ref: macro.freeSugar },
  ]
  if (e.alcohol > 0.05) macroRows.push({ label: 'Alkohol', pct: e.alcohol, grams: v('ALC'), ref: { max: 0 } })

  const missingKeys = Object.keys(summary.missing) as NutrientKey[]

  return (
    <div className="results">
      <section className="energyhero" aria-label="Energiintag">
        <div className="big">
          <span className="lbl">Intag, snitt per dag{summary.daysCounted > 1 ? ` (${summary.daysCounted} dagar)` : ''}</span>
          <span className="val">{formatNumber(kcal, 0)}<small> kcal</small></span>
          <span className="sub">{formatNumber(kj, 0)} kJ · {formatNumber(intakeMJ, 1)} MJ</span>
        </div>
        <div className="meter" aria-hidden="true">
          <div className="fill" style={{ width: `${Math.min(pctOfNeed, 150) / 1.5}%` }} />
          <div className="mark" style={{ left: `${100 / 1.5}%` }} />
        </div>
        <p className="cmp">
          <strong>{formatNumber(pctOfNeed, 0)} %</strong> av {goalKcal ? `energibehovet vid målvikt ${formatNumber(plan!.targetWeightKg, 1)} kg` : 'beräknat energibehov'} ({formatNumber(compareKcal, 0)} kcal · {formatNumber(kcalToKj(compareKcal), 0)} kJ).
          {goalKcal && <> Energibehov vid nuvarande vikt: {formatNumber(need.teeKcal, 0)} kcal.</>}
          {' '}Skillnad: {kcal - compareKcal >= 0 ? '+' : '−'}{formatNumber(Math.abs(kcal - compareKcal), 0)} kcal/dag.
        </p>
      </section>

      <section>
        <h3>Energifördelning</h3>
        <table className="ref stack">
          <thead><tr><th>Näringsämne</th><th className="num">Gram</th><th className="num">E%</th><th>Rekommendation</th><th>Läge</th></tr></thead>
          <tbody>
            {macroRows.map(r => {
              const st = rangeStatus(r.pct, r.ref)
              return (
                <tr key={r.label} className={r.label.startsWith('–') ? 'subrow' : ''}>
                  <td data-l="Näringsämne">{r.label}</td>
                  <td data-l="Gram" className="num">{r.grams !== undefined ? formatNumber(r.grams, 1) : ''}</td>
                  <td data-l="E%" className="num"><strong>{formatNumber(r.pct, 1)}</strong></td>
                  <td data-l="Rekommendation">{r.label === 'Alkohol' ? 'Ingen säker nivå' : rangeText(r.ref, ' E%')}</td>
                  <td data-l="Läge"><span className={`pill ${st}`}>{STATUS_TEXT[st]}</span></td>
                </tr>
              )
            })}
            <tr>
              <td data-l="Näringsämne">Protein per kg kroppsvikt</td>
              <td data-l="Gram" className="num">{formatNumber(proteinPerKg, 2)}</td>
              <td data-l="E%" className="num"></td>
              <td data-l="Rekommendation">RI {formatNumber(macro.proteinGPerKg, 2)} g/kg</td>
              <td data-l="Läge"><span className={`pill ${proteinPerKg >= macro.proteinGPerKg ? 'ok' : 'low'}`}>{proteinPerKg >= macro.proteinGPerKg ? 'Inom' : 'Under'}</span></td>
            </tr>
            <tr>
              <td data-l="Näringsämne">Fiber</td>
              <td data-l="Gram" className="num">{formatNumber(v('FIBT'), 1)}</td>
              <td data-l="E%" className="num"></td>
              <td data-l="Rekommendation">{rangeText(macro.fiberGPerMJ, ' g/MJ')} (nu {formatNumber(fiberPerMJ, 1)} g/MJ)</td>
              <td data-l="Läge"><span className={`pill ${rangeStatus(fiberPerMJ, { min: macro.fiberGPerMJ.min })}`}>{STATUS_TEXT[rangeStatus(fiberPerMJ, { min: macro.fiberGPerMJ.min })]}</span></td>
            </tr>
          </tbody>
        </table>
      </section>

      <section>
        <h3>Vitaminer, mineraler och salt</h3>
        <p className="note">Jämfört med NNR 2023 för {client.sex === 'kvinna' ? 'kvinnor' : 'män'} {client.age} år. RI = rekommenderat intag, AI = tillräckligt intag.</p>
        <div className="microlist">
          {micro.map(m => {
            const d = NUTRIENTS[m.key]
            const val = v(m.key)
            const pct = m.value > 0 ? (val / m.value) * 100 : 0
            const st: Status = microStatus(m, val)
            return (
              <div className={`micro${highlight.has(m.key) ? ' hl' : ''}`} key={m.key}>
                {highlight.has(m.key) && <span className="hltag">Viktig vid {highlight.get(m.key)!.toLowerCase()}</span>}
                <div className="mhead">
                  <span className="mname">{d.label}</span>
                  <span className="mval">{formatNumber(val, d.decimals)} {d.unit}</span>
                </div>
                <div className={`bar ${st}`} aria-hidden="true">
                  <div style={{ width: `${Math.min(pct, 100)}%` }} />
                </div>
                <div className="mfoot">
                  <span>{m.kind === 'max' ? 'Högst' : m.kind} {formatNumber(m.value, Number.isInteger(m.value * 10 ** d.decimals) ? d.decimals : 2)} {d.unit}</span>
                  <span className={`pct ${st}`}>{formatNumber(pct, 0)} %</span>
                </div>
                {m.note && <small className="mnote">{m.note}</small>}
              </div>
            )
          })}
        </div>
      </section>

      <section>
        <h3>Fördelning över måltider</h3>
        <table className="ref">
          <tbody>
            {sortMeals(Object.keys(summary.perMeal)).map(m => {
              const mk = summary.perMeal[m]!['ENERC|kcal'] ?? 0
              return (
                <tr key={m}>
                  <td>{m}</td>
                  <td className="num">{formatNumber(mk, 0)} kcal</td>
                  <td className="num">{formatNumber(kcal > 0 ? (mk / kcal) * 100 : 0, 0)} %</td>
                  <td className="wide"><div className="hbar"><div style={{ width: `${kcal > 0 ? (mk / kcal) * 100 : 0}%` }} /></div></td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </section>

      {missingKeys.length > 0 && (
        <section className="missing">
          <h3>Saknade värden</h3>
          <p className="note">Livsmedel som saknar värden:</p>
          <ul>
            {missingKeys.map(k => <li key={k}><strong>{NUTRIENTS[k].label}:</strong> {summary.missing[k]!.join(', ')}</li>)}
          </ul>
        </section>
      )}
    </div>
  )
}
