import { useId } from 'react'
import { ARM_LEVELS, CONDITION_GROUPS, LEG_LEVELS, type Amputation, type Health, type LimbSide } from '../core/types'

type Props = {
  health: Health
  onChange: (h: Health) => void
  open: boolean
  onToggle: () => void
}

const SIDES: LimbSide[] = ['vänster', 'höger']

/** Utfällbar meny för hälsotillstånd – används både i beräkningsformuläret och i undernäringsbedömningen. */
export function HealthSection({ health, onChange, open, onToggle }: Props) {
  const id = useId()
  const has = (c: string) => health.conditions.includes(c)
  const count = health.conditions.length

  function toggle(c: string) {
    const on = has(c)
    const next: Health = { ...health, conditions: on ? health.conditions.filter(x => x !== c) : [...health.conditions, c] }
    if (c === 'Amputation' && on) next.amputations = []
    if (c === 'Kronisk njursjukdom') next.ckdStage = on ? undefined : (health.ckdStage ?? 3)
    onChange(next)
  }

  const amputation = (limb: 'arm' | 'ben', side: LimbSide): Amputation | undefined =>
    health.amputations.find(a => a.limb === limb && a.side === side)

  function setAmputation(limb: 'arm' | 'ben', side: LimbSide, level: string | null) {
    const rest = health.amputations.filter(a => !(a.limb === limb && a.side === side))
    onChange({ ...health, amputations: level ? [...rest, { limb, side, level }] : rest })
  }

  return (
    <div className="healthpanel">
      <button type="button" className="healthtoggle" aria-expanded={open} aria-controls={id} onClick={onToggle}>
        <span>Hälsotillstånd{count > 0 && <span className="count">{count}</span>}</span>
        <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true"><path d="M6 9l6 6 6-6" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" /></svg>
      </button>
      {count > 0 && !open && <p className="healthsummary">{health.conditions.join(', ')}</p>}
      <div id={id} hidden={!open} className="formsection healthbody">
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
                      <select value={health.ckdStage ?? 3} onChange={e => onChange({ ...health, ckdStage: Number(e.target.value) })}>
                        {[1, 2, 3, 4, 5].map(n => <option key={n} value={n}>{n}</option>)}
                      </select>
                    </label>
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
            {health.amputations.length === 0 && <small className="warntext">Välj minst en kroppsdel.</small>}
            <small className="muted">Energibehovet räknas på faktisk vikt. Korrigerat BMI läggs till när procentsatserna per kroppsdel och längd före amputation är bedömda.</small>
          </fieldset>
        )}
      </div>
    </div>
  )
}
