import { useState } from 'react'
import { PAL_OPTIONS } from '../core/energy'
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

type Section = 'uppgifter' | 'halsa'
const SIDES: LimbSide[] = ['vänster', 'höger']

export function ClientForm({ initial, onSave, onCancel }: Props) {
  const [section, setSection] = useState<Section>('uppgifter')
  const [code, setCode] = useState(initial?.code ?? '')
  const [age, setAge] = useState(String(initial?.age ?? ''))
  const [sex, setSex] = useState<Sex>(initial?.sex ?? 'kvinna')
  const [weight, setWeight] = useState(initial ? String(initial.weightKg).replace('.', ',') : '')
  const [height, setHeight] = useState(initial ? String(initial.heightCm).replace('.', ',') : '')
  const [pal, setPal] = useState(String(initial?.pal ?? 1.6))
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
    const fail = (msg: string, s: Section = 'uppgifter') => { setSection(s); setError(msg) }
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
      return fail('Välj vilka kroppsdelar som är amputerade, eller kryssa ur Amputation.', 'halsa')
    }
    onSave({
      code: code.trim(), age: Math.floor(a), sex, weightKg: w, heightCm: h, pal: p, goal,
      health: {
        ...health,
        ckdStage: has('Kronisk njursjukdom') ? health.ckdStage : undefined,
        allergyText: has('Födoämnesallergi') ? health.allergyText?.trim() || undefined : undefined,
        notes: health.notes?.trim() || undefined,
      },
    })
  }

  const count = health.conditions.length

  return (
    <form className="form" onSubmit={submit} noValidate>
      <div className="formtabs" role="tablist">
        <button type="button" role="tab" aria-selected={section === 'uppgifter'} className={section === 'uppgifter' ? 'on' : ''} onClick={() => setSection('uppgifter')}>
          Uppgifter
        </button>
        <button type="button" role="tab" aria-selected={section === 'halsa'} className={section === 'halsa' ? 'on' : ''} onClick={() => setSection('halsa')}>
          Hälsotillstånd{count > 0 && <span className="count">{count}</span>}
        </button>
      </div>

      <div hidden={section !== 'uppgifter'} className="formsection">
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

      <div hidden={section !== 'halsa'} className="formsection">
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

        <label className="field">
          <span>Övrigt om hälsotillståndet</span>
          <textarea rows={3} value={health.notes ?? ''} onChange={e => setHealth(h => ({ ...h, notes: e.target.value }))} />
        </label>
      </div>

      {error && <p className="error" role="alert">{error}</p>}
      <div className="actions">
        <button type="submit" className="primary">{initial ? 'Spara ändringar' : 'Skapa beräkning'}</button>
        {onCancel && <button type="button" onClick={onCancel}>Avbryt</button>}
      </div>
    </form>
  )
}
