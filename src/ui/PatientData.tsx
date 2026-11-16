import { useState } from 'react'
import { bmi, BMR_FORMULAS, normalizeFormula, PAL_OPTIONS } from '../core/energy'
import { formatNumber } from '../core/nutrients'
import { emptyHealth, type Calculation, type Health, type Person } from '../core/types'
import { HealthSection } from './HealthSection'

type Props = {
  person: Person
  /** Beräkningen som vikt, PAL och BMR-formel hör till (senaste eller den som är öppen) */
  calc: Calculation | null
  onPatchPerson: (p: Partial<Person>) => void
  onPatchCalc: (p: Partial<Calculation>) => void
  onDone: () => void
  /** Referenspatienten (ingen patient vald) */
  isReference?: boolean
}

/** Patientdata: justera patientens uppgifter och hälsotillstånd. Ändringar sparas direkt. */
export function PatientData({ person, calc, onPatchPerson, onPatchCalc, onDone, isReference = false }: Props) {
  const [healthOpen, setHealthOpen] = useState(true)
  const weight = calc?.weightKg
  const b = weight ? bmi(weight, person.heightCm) : null
  const num = (value: number | undefined, onSet: (n: number) => void, label: string, decimals: number) => (
    <input inputMode="decimal" key={`${label}-${value}`} defaultValue={value !== undefined ? formatNumber(value, decimals) : ''} aria-label={label}
      onBlur={e => { const n = Number(e.target.value.replace(',', '.').replace(/\s/g, '')); if (n > 0) onSet(n); else if (value !== undefined) e.target.value = formatNumber(value, decimals) }} />
  )
  const pal = calc?.pal ?? 1.2
  const palKnown = PAL_OPTIONS.some(o => Math.abs(o.value - pal) < 0.001)
  return (
    <main className="main narrow pd">
      <h1>Patientdata</h1>
      {isReference && <p className="muted">Ingen patient vald – det här är referenspatienten som kostregistreringen räknas mot. Ändringar gäller tills programmet startas om; då börjar den om som kvinna 45 år, BMI 23,5, PAL 1,2 utan hälsotillstånd.</p>}
      <section className="pd-card">
        <div className="pd-grid">
          <label>Kod / alias
            <input defaultValue={person.code} key={`code-${person.code}`} aria-label="Kod / alias"
              onBlur={e => { const v = e.target.value.trim(); if (v) onPatchPerson({ code: v }); else e.target.value = person.code }} />
          </label>
          <label>Ålder (år){num(person.age, n => onPatchPerson({ age: Math.round(n) }), 'Ålder i år', 0)}</label>
          <label>Kön
            <select value={person.sex} onChange={e => onPatchPerson({ sex: e.target.value as Person['sex'] })}>
              <option value="kvinna">Kvinna</option>
              <option value="man">Man</option>
            </select>
          </label>
          <label>Längd (cm){num(person.heightCm, n => onPatchPerson({ heightCm: n }), 'Längd i cm', 0)}</label>
          <label>Vikt (kg){calc ? num(weight, n => onPatchCalc({ weightKg: n }), 'Vikt i kg', 1) : <span className="muted">Ingen beräkning</span>}</label>
          <label>BMI<output>{b !== null ? formatNumber(b, 1) : '–'}</output></label>
        </div>
        {calc && (
          <div className="pd-grid two">
            <label>Fysisk aktivitet (PAL)
              <select value={palKnown ? String(pal) : 'egen'} onChange={e => e.target.value !== 'egen' && onPatchCalc({ pal: Number(e.target.value) })}>
                {PAL_OPTIONS.map(o => <option key={o.value} value={String(o.value)}>{formatNumber(o.value, 1)} – {o.label}</option>)}
                {!palKnown && <option value="egen">{formatNumber(pal, 2)} (eget värde)</option>}
              </select>
            </label>
            <label>Formel för BMR
              <select value={normalizeFormula(calc.bmrFormula)} onChange={e => onPatchCalc({ bmrFormula: e.target.value as Calculation['bmrFormula'] })}>
                {BMR_FORMULAS.filter(f => !f.adultsOnly || person.age >= 18).map(f => <option key={f.value} value={f.value}>{f.label}</option>)}
              </select>
            </label>
          </div>
        )}
      </section>
      <HealthSection health={person.health ?? emptyHealth()} onChange={(h: Health) => onPatchPerson({ health: h })}
        open={healthOpen} onToggle={() => setHealthOpen(o => !o)} />
      <div className="actions">
        <button className="primary" onClick={onDone}>Klar</button>
      </div>
    </main>
  )
}
