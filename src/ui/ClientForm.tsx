import { useState } from 'react'
import { BMR_FORMULAS, normalizeFormula, PAL_OPTIONS, type BmrFormula } from '../core/energy'
import { MIN_SUPPORTED_AGE } from '../core/references'
import {
  ARM_LEVELS, CONDITION_GROUPS, emptyHealth, LEG_LEVELS,
  type Amputation, type Client, type Health, type LimbSide, type Sex,
} from '../core/types'

type Props = {
  initial?: Client
  onSave: (c: Omit<Client, 'id' | 'createdAt'>) => void
  onCancel?: () => void
}

const SIDES: LimbSide[] = ['vänster', 'höger']

export function ClientForm({ initial, onSave, onCancel }: Props) {
  const [healthOpen, setHealthOpen] = useState(false)
  const [code, setCode] = useState(initial?.code ?? '')
  const [age, setAge] = useState(String(initial?.age ?? ''))
  const [sex, setSex] = useState<Sex>(initial?.sex ?? 'kvinna')
  const [weight, setWeight] = useState(initial ? String(initial.weightKg).replace('.', ',') : '')
  const [height, setHeight] = useState(initial ? String(initial.heightCm).replace('.', ',') : '')
  const [pal, setPal] = useState(String(initial?.pal ?? 1.2))
  const [formula, setFormula] = useState<BmrFormula>(normalizeFormula(initial?.bmrFormula))
  const [hasGoal, setHasGoal] = useState(!!initial?.goal)
  const [target, setTarget] = useState(initial?.goal ? String(initial.goal.targetWeightKg).replace('.', ',') : '')
  const [health, setHealth] = useState<Health>(() => ({ ...emptyHealth(), ...initial?.health }))
  const [error, setError] = useState('')

  const num = (s: string) => Number(s.replace(',', '.'))
  const palIsPreset = PAL_OPTIONS.some(o => String(o.value) === pal)
  const has = (c: string) => health.conditions.includes(c)

  function toggle(c: string) {
    setHealth(h => {
      const on = h.conditions.includes(c)
      const next = { ...h, conditions: on ? h.conditions.filter(x => x !== c) : [...h.conditions, c] }
      if (c === 'Amputation' && on) next.amputations = []
      if (c === 'Kronisk njursjukdom' && !on && !next.ckdStage) next.ckdStage = 3
      return next
    })
  }

  function amputation(limb: 'arm' | 'ben', side: LimbSide): Amputation | undefined {
    return health.amputations.find(a => a.limb === limb && a.side === side)
  }
  function setAmputation(limb: 'arm' | 'ben', side: LimbSide, level: string | null) {
    setHealth(h => {
      const rest = h.amputations.filter(a => !(a.limb === limb && a.side === side))
      return { ...h, amputations: level ? [...rest, { limb, side, level }] : rest }
    })
  }

  function submit(e: React.FormEvent) {
    e.preventDefault()
    const a = num(age), w = num(weight), h = num(height), p = num(pal)
    const fail = (msg: string, health = false) => { if (health) setHealthOpen(true); setError(msg) }
    if (!code.trim()) return fail('Ange en kod eller ett alias för personen.')
    if (!Number.isFinite(a) || a < MIN_SUPPORTED_AGE || a > 120) return fail(`Ålder måste vara mellan ${MIN_SUPPORTED_AGE} och 120 år.`)
    if (!(w >= 8 && w <= 400)) return fail('Ange nuvarande vikt i kg (8–400).')
    if (!(h >= 70 && h <= 250)) return fail('Ange längd i cm (70–250).')
    if (!(p >= 1 && p <= 2.5)) return fail('PAL måste vara mellan 1,0 och 2,5.')
    let goal = null
    if (hasGoal) {
      const t = num(target)
      if (!(t >= 8 && t <= 400)) return fail('Ange målvikt i kg.')
      goal = { targetWeightKg: t }
    }
    if (has('Amputation') && health.amputations.length === 0) {
      return fail('Välj vilka kroppsdelar som är amputerade, eller kryssa ur Amputation.', true)
    }
    onSave({
      code: code.trim(), age: Math.floor(a), sex, weightKg: w, heightCm: h, pal: p, bmrFormula: formula, goal,
      health: {
        ...health,
        ckdStage: has('Kronisk njursjukdom') ? health.ckdStage : undefined,
        allergyText: has('Födoämnesallergi') ? health.allergyText?.trim() || undefined : undefined,
      },
    })
  }

  const count = health.conditions.length

  return (
    <form className="form" onSubmit={submit} noValidate>
      <div className="formsection">
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
            <span>Nuvarande vikt (kg)</span>
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
          <label className="field span2">
            <span>Formel för energibehov (BMR)</span>
            <select id="cf-formula" value={formula} onChange={e => setFormula(e.target.value as BmrFormula)}>
              {BMR_FORMULAS.map(f => <option key={f.value} value={f.value}>{f.label}</option>)}
            </select>
            <small>{BMR_FORMULAS.find(f => f.value === formula)!.note} Energibehov = BMR × PAL.</small>
            {BMR_FORMULAS.find(f => f.value === formula)!.adultsOnly && Number(age) > 0 && Number(age) < 18 && (
              <small className="warntext">Formeln är framtagen för vuxna. För barn och ungdomar rekommenderas Henry.</small>
            )}
          </label>
        </div>

        <label className="check">
          <input type="checkbox" checked={hasGoal} onChange={e => setHasGoal(e.target.checked)} />
          <span>Viktmål</span>
        </label>
        {hasGoal && (
          <div className="grid2 goalbox">
            <label className="field">
              <span>Målvikt (kg)</span>
              <input id="cf-target" inputMode="decimal" value={target} onChange={e => setTarget(e.target.value)} />
              <small>Energibehovet vid målvikten visas bredvid nuvarande behov.</small>
            </label>
          </div>
        )}
      </div>

      <div className="healthpanel">
        <button type="button" className="healthtoggle" aria-expanded={healthOpen} aria-controls="halsotillstand" onClick={() => setHealthOpen(o => !o)}>
          <span>Hälsotillstånd{count > 0 && <span className="count">{count}</span>}</span>
          <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true"><path d="M6 9l6 6 6-6" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" /></svg>
        </button>
        {count > 0 && !healthOpen && <p className="healthsummary">{health.conditions.join(', ')}</p>}
      <div id="halsotillstand" hidden={!healthOpen} className="formsection healthbody">
        <p className="note">Kryssa i diagnoser och tillstånd som kan påverka nutritionen. Vissa ändrar hur resultatet visas, t.ex. lyfts saltraden fram vid hypertoni.</p>
        <div className="condgroups">
          {CONDITION_GROUPS.map(g => (
            <fieldset key={g.group} className="condgroup">
              <legend>{g.group}</legend>
              {g.items.map(c => (
                <div key={c}>
                  <label className="cond">
                    <input type="checkbox" checked={has(c)} onChange={() => toggle(c)} />
                    <span>{c}</span>
                  </label>
                  {c === 'Kronisk njursjukdom' && has(c) && (
                    <label className="subfield">
                      Stadium
                      <select value={health.ckdStage ?? 3} onChange={e => setHealth(h => ({ ...h, ckdStage: Number(e.target.value) }))}>
                        {[1, 2, 3, 4, 5].map(n => <option key={n} value={n}>{n}</option>)}
                      </select>
                    </label>
                  )}
                  {c === 'Födoämnesallergi' && has(c) && (
                    <input className="subfield" placeholder="Vilka? t.ex. jordnöt, ägg" value={health.allergyText ?? ''}
                      onChange={e => setHealth(h => ({ ...h, allergyText: e.target.value }))} aria-label="Vilka födoämnesallergier" />
                  )}
                </div>
              ))}
            </fieldset>
          ))}
        </div>

        {has('Amputation') && (
          <fieldset className="amputation">
            <legend>Amputation – välj de kroppsdelar som är amputerade</legend>
            <div className="ampgrid">
              {(['arm', 'ben'] as const).map(limb => SIDES.map(side => {
                const current = amputation(limb, side)
                const levels = limb === 'arm' ? ARM_LEVELS : LEG_LEVELS
                return (
                  <div className="ampcell" key={limb + side}>
                    <label className="check small">
                      <input type="checkbox" checked={!!current} onChange={e => setAmputation(limb, side, e.target.checked ? levels[0] : null)} />
                      <span>{limb === 'arm' ? 'Arm' : 'Ben'}, {side}</span>
                    </label>
                    {current && (
                      <select aria-label={`Nivå, ${limb} ${side}`} value={current.level} onChange={e => setAmputation(limb, side, e.target.value)}>
                        {levels.map(l => <option key={l}>{l}</option>)}
                      </select>
                    )}
                  </div>
                )
              }))}
            </div>
            <small className="muted">Energibehovet räknas på faktisk vikt. Korrigerat BMI läggs till när procentsatserna per kroppsdel och längd före amputation är bedömda.</small>
          </fieldset>
        )}

      </div>
      </div>

      {error && <p className="error" role="alert">{error}</p>}
      <div className="actions">
        <button type="submit" className="primary">{initial ? 'Spara ändringar' : 'Skapa beräkning'}</button>
        {onCancel && <button type="button" onClick={onCancel}>Avbryt</button>}
      </div>
    </form>
  )
}
