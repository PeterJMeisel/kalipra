import { useState } from 'react'
import { PAL_OPTIONS } from '../core/energy'
import { MIN_SUPPORTED_AGE } from '../core/references'
import type { Client, Sex } from '../core/types'

type Props = {
  initial?: Client
  onSave: (c: Omit<Client, 'id' | 'createdAt'>) => void
  onCancel?: () => void
}

const PACES = [0.25, 0.5, 0.75, 1]

export function ClientForm({ initial, onSave, onCancel }: Props) {
  const [code, setCode] = useState(initial?.code ?? '')
  const [age, setAge] = useState(String(initial?.age ?? ''))
  const [sex, setSex] = useState<Sex>(initial?.sex ?? 'kvinna')
  const [weight, setWeight] = useState(String(initial?.weightKg ?? ''))
  const [height, setHeight] = useState(String(initial?.heightCm ?? ''))
  const [pal, setPal] = useState(String(initial?.pal ?? 1.6))
  const [hasGoal, setHasGoal] = useState(!!initial?.goal)
  const [target, setTarget] = useState(String(initial?.goal?.targetWeightKg ?? ''))
  const [pace, setPace] = useState(String(initial?.goal?.paceKgPerWeek ?? 0.5))
  const [error, setError] = useState('')

  const num = (s: string) => Number(s.replace(',', '.'))
  const palIsPreset = PAL_OPTIONS.some(o => String(o.value) === pal)

  function submit(e: React.FormEvent) {
    e.preventDefault()
    const a = num(age), w = num(weight), h = num(height), p = num(pal)
    if (!code.trim()) return setError('Ange en kod eller ett alias för klienten.')
    if (!Number.isFinite(a) || a < MIN_SUPPORTED_AGE || a > 120) return setError(`Ålder måste vara mellan ${MIN_SUPPORTED_AGE} och 120 år.`)
    if (!(w >= 8 && w <= 400)) return setError('Ange vikt i kg (8–400).')
    if (!(h >= 70 && h <= 250)) return setError('Ange längd i cm (70–250).')
    if (!(p >= 1 && p <= 2.5)) return setError('PAL måste vara mellan 1,0 och 2,5.')
    let goal = null
    if (hasGoal) {
      const t = num(target), pc = num(pace)
      if (!(t >= 8 && t <= 400)) return setError('Ange målvikt i kg.')
      if (!(pc > 0 && pc <= 1.5)) return setError('Takten måste vara mellan 0,1 och 1,5 kg per vecka.')
      goal = { targetWeightKg: t, paceKgPerWeek: pc }
    }
    onSave({ code: code.trim(), age: Math.floor(a), sex, weightKg: w, heightCm: h, pal: p, goal })
  }

  return (
    <form className="form" onSubmit={submit} noValidate>
      <div className="grid2">
        <label className="field span2">
          <span>Kod / alias</span>
          <input id="cf-code" value={code} onChange={e => setCode(e.target.value)} placeholder="t.ex. K-2026-014" autoComplete="off" />
          <small>Använd en kod i stället för namn – programmet behöver inga personuppgifter.</small>
        </label>
        <label className="field">
          <span>Ålder (år)</span>
          <input id="cf-age" inputMode="numeric" value={age} onChange={e => setAge(e.target.value)} />
        </label>
        <fieldset className="field">
          <span>Kön</span>
          <div className="seg">
            {(['kvinna', 'man'] as Sex[]).map(s => (
              <button type="button" key={s} className={sex === s ? 'on' : ''} onClick={() => setSex(s)}>
                {s === 'kvinna' ? 'Kvinna' : 'Man'}
              </button>
            ))}
          </div>
        </fieldset>
        <label className="field">
          <span>Vikt (kg)</span>
          <input id="cf-weight" inputMode="decimal" value={weight} onChange={e => setWeight(e.target.value)} />
        </label>
        <label className="field">
          <span>Längd (cm)</span>
          <input id="cf-height" inputMode="decimal" value={height} onChange={e => setHeight(e.target.value)} />
        </label>
        <label className="field span2">
          <span>Fysisk aktivitetsnivå (PAL)</span>
          <select id="cf-pal" value={palIsPreset ? pal : 'custom'} onChange={e => setPal(e.target.value === 'custom' ? '1.5' : e.target.value)}>
            {PAL_OPTIONS.map(o => (
              <option key={o.value} value={String(o.value)}>
                {o.value.toLocaleString('sv-SE', { minimumFractionDigits: 1 })} – {o.label}
              </option>
            ))}
            <option value="custom">Eget värde …</option>
          </select>
          {!palIsPreset && (
            <input id="cf-pal-custom" inputMode="decimal" value={pal} onChange={e => setPal(e.target.value)} aria-label="Eget PAL-värde" />
          )}
          <small>{PAL_OPTIONS.find(o => String(o.value) === pal)?.note ?? 'Eget värde'}</small>
        </label>
      </div>

      <label className="check">
        <input type="checkbox" checked={hasGoal} onChange={e => setHasGoal(e.target.checked)} />
        <span>Viktmål (kalorirestriktion eller -tillägg)</span>
      </label>
      {hasGoal && (
        <div className="grid2 goalbox">
          <label className="field">
            <span>Målvikt (kg)</span>
            <input id="cf-target" inputMode="decimal" value={target} onChange={e => setTarget(e.target.value)} />
          </label>
          <label className="field">
            <span>Takt (kg per vecka)</span>
            <div className="seg">
              {PACES.map(p => (
                <button type="button" key={p} className={num(pace) === p ? 'on' : ''} onClick={() => setPace(String(p))}>
                  {p.toLocaleString('sv-SE')}
                </button>
              ))}
            </div>
            <input id="cf-pace" inputMode="decimal" value={pace} onChange={e => setPace(e.target.value)} aria-label="Takt, kg per vecka" />
          </label>
        </div>
      )}

      {error && <p className="error" role="alert">{error}</p>}
      <div className="actions">
        <button type="submit" className="primary">{initial ? 'Spara ändringar' : 'Skapa klient'}</button>
        {onCancel && <button type="button" onClick={onCancel}>Avbryt</button>}
      </div>
    </form>
  )
}
