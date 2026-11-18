import { useState } from 'react'
import { formatNumber } from '../core/nutrients'
import { emptyHealth, KNOWN_CONDITIONS, LIMITS, type Health, type Person, type Sex, type WeightEntry } from '../core/types'
import { changeWithin, periodText, sortWeights, totalChange, type WeightChange } from '../core/weights'
import { HealthSection } from './HealthSection'
import { WeightChart, WeightLog } from './WeightLog'
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
  const latest = weights[weights.length - 1]
  const heightCm = latest?.heightCm ?? data.heightCm
  const health: Health = (() => {
    const h = { ...emptyHealth(), ...data.health }
    return { ...h, conditions: h.conditions.filter(c => KNOWN_CONDITIONS.includes(c)) }
  })()

  const [healthOpen, setHealthOpen] = useState(false)
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
  const [heightText, setHeightText] = useState(heightCm ? numText(heightCm, 1) : '')
  function setHeight(t: string) {
    setHeightText(t)
    const v = parse(t)
    if (v !== undefined && v >= 70 && v <= LIMITS.maxHeightCm) onChange({ heightCm: Math.round(v * 10) / 10 })
  }
  const age = data.age

  function setAge(t: string) {
    setAgeText(t)
    const v = Number(t.trim())
    onChange({ age: t.trim() && Number.isInteger(v) && v >= 18 && v <= LIMITS.maxAge ? v : undefined })
  }





  // Viktförändring: alla tre perioder visas alltid. Röd bara när GLIM-kriteriet för viktförlust uppfylls
  // (> 5 % inom 6 månader, > 10 % över längre tid än 6 månader).
  const total = totalChange(weights)
  const totalOver6 = total ? changeWithin(weights, 6)?.fromDate !== total.fromDate : false
  const periods: { label: string; c: WeightChange | null; glim: boolean }[] = [
    { label: 'Senaste 3 månaderna', c: changeWithin(weights, 3), glim: false },
    { label: 'Senaste 6 månaderna', c: changeWithin(weights, 6), glim: false },
    { label: total ? `Hela perioden (${periodText(total.fromDate, total.toDate)})` : 'Hela perioden', c: total, glim: false },
  ]
  for (const p of periods) {
    if (!p.c) continue
    const loss = -p.c.deltaPct
    const longer = p.c === total && totalOver6
    p.glim = longer ? loss > 10 : loss > 5
  }
  const [showGraph, setShowGraph] = useState(false)

  return (
    <div className="assess">
      <section>
        <div className="agerow">
          <label className={`field${flag(glimMissing.age)}`}>
            <span>Nuvarande ålder (år) <abbr title="obligatoriskt">*</abbr></span>
            <input id="a-age" inputMode="numeric" value={ageText} onChange={e => setAge(e.target.value)} aria-required="true" aria-invalid={age === undefined && ageText.trim() !== ''} placeholder="t.ex. 72" />
          </label>
          <label className={`field${flag(glimMissing.height)}`}>
            <span>Längd (cm)</span>
            <input id="w-height" inputMode="decimal" value={heightText} onChange={e => setHeight(e.target.value)} placeholder="t.ex. 168" />
          </label>
        </div>
      </section>
      <WeightLog title="Lägg till vikt" graphButton={false} weights={weights} heightCm={heightCm}
        onChange={ws => onChange({ weights: ws })} kgId="w-kg"
        formClass={flag(glimMissing.weight || weights.length < 2)}
        footer={latest && calcWeightKg !== undefined && onUseLatestWeight && Math.abs(latest.kg - calcWeightKg) >= 0.05 && (
          <p className="msg">
            Senaste vägningen ({formatNumber(latest.kg, 1)} kg, {dateText(latest.date)}) skiljer sig från vikten i senaste beräkningen ({formatNumber(calcWeightKg, 1)} kg).{' '}
            <button type="button" className="small" onClick={() => onUseLatestWeight(latest.kg)}>Använd {formatNumber(latest.kg, 1)} kg i beräkningen</button>
          </p>
        )} />

      <section className="pd-card wsummarycard">
        <div className="wlog-head">
          <h2>Viktförändring</h2>
          <button type="button" className={`small ${showGraph && weights.length >= 2 ? 'on' : ''}`} aria-pressed={showGraph && weights.length >= 2} disabled={weights.length < 2}
            title={weights.length < 2 ? 'Grafen kräver minst två vikter' : undefined} onClick={() => setShowGraph(g => !g)}>{showGraph && weights.length >= 2 ? 'Dölj graf' : 'Se graf'}</button>
        </div>
        <div className={`wsummary${showGraph && weights.length >= 2 ? ' withgraph' : ''}`}>
          <div className="wperiods">
            {periods.map(p => (
              <div key={p.label} className={`wchange${p.glim ? ' down' : ''}${p.c ? '' : ' none'}`}>
                <span className="wl">{p.label}</span>
                <strong>{p.c ? `${signed(p.c.deltaPct, 1)} %` : '–'}</strong>
                <span className="ws">{p.c ? `${signed(p.c.deltaKg, 1)} kg · ${dateText(p.c.fromDate)} → ${dateText(p.c.toDate)}` : 'Ingen jämförelse'}</span>
              </div>
            ))}
          </div>
          {showGraph && weights.length >= 2 && <WeightChart weights={weights} />}
        </div>
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
