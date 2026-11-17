import { useEffect, useState } from 'react'
import type { MicroReference } from '../core/references'
import type { NutrientKey } from '../core/nutrients'

/** Övrig information ur tillverkarnas produktblad (scripts/nutrition/build_nutrition.py → nutrition-details.json). */
type Detail = {
  id: number
  name: string
  product: string
  flavour: string | null
  manufacturer: string
  category?: string | null
  basis: 'ml' | 'g'
  url: string
  laktos?: number
  vatten_per_100?: number
  osmolaritet?: number
  osmolalitet?: number
  egenskaper?: string[]
  ofullständig?: boolean
  annan_källa?: { källa: string; url: string; hämtad: string; not: string }
  iddsi?: { nivå: string; namn?: string; not?: string; tabell?: { produkt: string; kylskåpskall: number | string; rumstempererad: number | string }[]; källa?: string; källa_url?: string; källa_not?: string; källa_utgivare?: string; källa_hämtad?: string }
  'näringsdeklaration'?: Record<string, { enhet: string; värde: string }>
  fettkälla?: string
  proteinkälla?: string
  kolhydratkälla?: string
  fiberkälla?: string
  energifördelning?: string
  text?: Record<string, string>
}

let cache: Promise<{ fetched: string; products: Detail[] }> | null = null
function loadDetails() {
  cache ??= import('../data/nutrition-details.json').then(m => m.default as unknown as { fetched: string; products: Detail[] })
  return cache
}

const SECTIONS: [string, string][] = [
  ['produktinformation', 'Produktinformation'],
  ['dosering', 'Dosering'],
  ['viktigt', 'Viktigt'],
  ['anvisning', 'Anvisning'],
  ['ingredienser', 'Ingredienser'],
  ['smaker', 'Smaker och förpackningar'],
]

/** Radetikett i produktbladet → näringsämne med referensvärde, och referensens basenhet (mg eller µg). */
const RDI_ROWS: [RegExp, NutrientKey, 'mg' | 'µg'][] = [
  [/^Vitamin A/i, 'VITA', 'µg'], [/^Vitamin D/i, 'VITD', 'µg'], [/^Vitamin E/i, 'VITE', 'mg'], [/^Vitamin C/i, 'VITC', 'mg'],
  [/^(Tiamin|Vitamin B1\b)/i, 'THIACLHCL', 'mg'], [/^(Riboflavin|Vitamin B2\b)/i, 'RIBF', 'mg'], [/^Niacin/i, 'NIAEQ', 'mg'],
  [/^Vitamin B6/i, 'VITB6', 'mg'], [/^(Folsyra|Folat)/i, 'FOL', 'µg'], [/^Vitamin B12/i, 'VITB12', 'µg'],
  [/^Kalium/i, 'K', 'mg'], [/^Kalcium/i, 'CA', 'mg'], [/^Fosfor/i, 'P', 'mg'], [/^Magnesium/i, 'MG', 'mg'],
  [/^Järn/i, 'FE', 'mg'], [/^Zink/i, 'ZN', 'mg'], [/^Selen/i, 'SE', 'µg'], [/^Jod/i, 'ID', 'µg'],
]
const UNIT_FACTOR: Record<string, number> = { g: 1e6, mg: 1e3, 'µg': 1, 'μg': 1, mcg: 1 }
/** Procent av klientens RDI (RI eller AI) för en rad, eller null om ämnet saknar referens. */
function rdiPct(label: string, r: { enhet: string; värde: string } | undefined, refs: MicroReference[] | undefined): number | null {
  if (!r || !refs) return null
  const hit = RDI_ROWS.find(([re]) => re.test(label))
  if (!hit) return null
  const ref = refs.find(m => m.key === hit[1] && m.kind !== 'max')
  const f = UNIT_FACTOR[r.enhet.split(' ')[0]]
  const v = Number(r.värde.replace(/[<≤]/g, '').split('/')[0].replace(',', '.'))
  if (!ref || !f || !Number.isFinite(v) || ref.value <= 0) return null
  return (v * f) / (ref.value * (hit[2] === 'mg' ? 1e3 : 1)) * 100
}

const fmtCell = (v: string) => {
  const [a, b] = v.split('\u2003')
  return b ? <>{a}<span className="ps-rdi">{b}</span></> : a
}

const flavourName = (d: Detail) => d.flavour ?? 'Neutral/ingen smak'
/** Tar bort upprepad inledning som "Fresubin 2 KCAL Drink, smak Jordgubb:" eller "Jordgubb:" när smaken redan står framför. */
const stripLead = (t: string, d: Detail) => (d.flavour
  ? t.replace(new RegExp(`^.{0,80}?smak ${d.flavour.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}:\\s*`, 'i'), '').replace(new RegExp(`^${d.flavour.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}:\\s*`, 'i'), '')
  : t)

/** Produktfaktablad för en nutritionsprodukt. Alla smaker av samma produkt visas i samma blad; skillnader visas per smak. */
export function ProductSheet({ foodNumber, onClose, refs }: { foodNumber: number; onClose: () => void; refs?: MicroReference[] }) {
  const [data, setData] = useState<{ fetched: string; products: Detail[] } | null>(null)
  useEffect(() => { loadDetails().then(setData) }, [])
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const me = data?.products.find(p => p.id === foodNumber)
  const group = me && data ? data.products.filter(p => p.manufacturer === me.manufacturer && p.product === me.product) : []
  const multi = group.length > 1

  // Rader i näringsdeklarationen i bladets ordning, plus vatten och osmolalitet
  const labels: string[] = []
  for (const g of group) for (const l of Object.keys(g['näringsdeklaration'] ?? {})) if (!labels.includes(l)) labels.push(l)
  const cell = (g: Detail, l: string) => {
    const r = g['näringsdeklaration']?.[l]
    if (!r) return '–'
    const pct = rdiPct(l, r, refs)
    return `${r.värde} ${r.enhet}` + (pct !== null ? `\u2003${Math.round(pct)} % av RDI` : '')
  }
  type Row = [string, (g: Detail) => string]
  const allExtra: Row[] = [
    [`Vatten (per 100 ${me?.basis ?? 'ml'})`, (g: Detail) => (g.vatten_per_100 !== undefined ? `${String(g.vatten_per_100).replace('.', ',')} ml` : '–')],
  ]
  const extraRows = allExtra.filter(([, f]) => group.some(g => f(g) !== '–'))

  const egenskaper = [...new Set(group.flatMap(g => g.egenskaper ?? []))]

  return (
    <div className="ps-overlay" role="dialog" aria-modal="true" aria-label="Produktfaktablad" onClick={onClose}>
      <div className="ps-panel" onClick={e => e.stopPropagation()}>
        <button type="button" className="ps-close" onClick={onClose} aria-label="Stäng">×</button>
        {!data && <p className="muted">Laddar produktfaktablad …</p>}
        {data && !me && <p className="muted">Det finns inget produktfaktablad för den här produkten.</p>}
        {me && (
          <>
            <p className="ps-kicker">Produktfaktablad · {me.manufacturer}{me.category ? ` · ${me.category}` : ''}</p>
            <h2 className="ps-title">{me.product}</h2>
            {multi && <p className="ps-flavours">Smaker: {group.map(flavourName).join(', ')}</p>}
            {egenskaper.length > 0 && <div className="ps-chips">{egenskaper.map(e => <span key={e} className="ps-chip">{e}</span>)}</div>}

            {me.iddsi && (
              <div className="ps-iddsi" aria-label={`IDDSI nivå ${me.iddsi.nivå}`}>
                <div className="ps-iddsi-badge"><span>IDDSI</span><strong>{me.iddsi.nivå}</strong></div>
                <div>
                  <p className="ps-iddsi-title">IDDSI nivå {me.iddsi.nivå}{me.iddsi.namn ? ` – ${me.iddsi.namn}` : ''}</p>
                  {me.iddsi.not && <p className="ps-iddsi-note">{me.iddsi.not}</p>}
                  {me.iddsi.tabell && me.iddsi.tabell.length > 0 && (me.iddsi.not || me.iddsi.tabell.length > 1) && (
                    <table className="ps-iddsi-table">
                      <thead><tr><th></th><th>Kylskåpskall</th><th>Rumstempererad</th></tr></thead>
                      <tbody>{me.iddsi.tabell.map(r => <tr key={r.produkt} className={r.produkt === me.flavour ? 'me' : ''}><th scope="row">{r.produkt}</th><td>{r.kylskåpskall}</td><td>{r.rumstempererad}</td></tr>)}</tbody>
                    </table>
                  )}
                  {me.iddsi.källa && <p className="ps-iddsi-note">Källa: se längst ner.</p>}
                </div>
              </div>
            )}

            {me.ofullständig && (
              <p className="ps-warn">Vissa näringsvärden saknas eller kunde inte läsas ut ur produktbladet. Se tillverkarens produktblad (länk längst ner).</p>
            )}

            <h3 className="ps-h">Näringsvärden per 100 {me.basis}</h3>
            {refs && <p className="muted ps-note">% av RDI = andel av klientens referensvärde (RI eller AI enligt NNR 2023) i 100 {me.basis}.</p>}
            {multi && <p className="muted ps-note">Värden som skiljer sig mellan smakerna visas per smak och är markerade.</p>}
            <div className="ps-tablewrap">
              <table className="ps-table">
                {multi && (
                  <thead><tr><th></th>{group.map(g => <th key={g.id} className={g.id === me.id ? 'me' : ''}>{flavourName(g)}</th>)}</tr></thead>
                )}
                <tbody>
                  {[...labels.map(l => [l, (g: Detail) => cell(g, l)] as [string, (g: Detail) => string]), ...extraRows].map(([l, f]) => {
                    const vals = group.map(f)
                    const same = vals.every(v => v === vals[0])
                    return (
                      <tr key={l} className={/^(varav|därav|av vilka|–)/i.test(l) ? 'sub' : ''}>
                        <th scope="row">{l}</th>
                        {same ? <td colSpan={group.length}>{fmtCell(vals[0])}</td> : vals.map((v, i) => <td key={group[i].id} className="diff">{fmtCell(v)}</td>)}
                      </tr>
                    )
                  })}
                  {(me.osmolaritet || me.osmolalitet) && (
                    <tr><th scope="row">Osmolaritet / osmolalitet</th><td colSpan={group.length}>{[me.osmolaritet && `${me.osmolaritet} mosmol/l`, me.osmolalitet && `${me.osmolalitet} mosmol/kg H₂O`].filter(Boolean).join(' · ')}</td></tr>
                  )}
                </tbody>
              </table>
            </div>

            {(me.energifördelning || me.fettkälla || me.proteinkälla || me.kolhydratkälla || me.fiberkälla) && (
              <dl className="ps-dl">
                {me.energifördelning && <><dt>Energifördelning</dt><dd>{me.energifördelning}</dd></>}
                {me.proteinkälla && <><dt>Proteinkälla</dt><dd>{me.proteinkälla}</dd></>}
                {me.fettkälla && <><dt>Fettkälla</dt><dd>{me.fettkälla}</dd></>}
                {me.kolhydratkälla && <><dt>Kolhydratkälla</dt><dd>{me.kolhydratkälla}</dd></>}
                {me.fiberkälla && <><dt>Fiberkälla</dt><dd>{me.fiberkälla}</dd></>}
              </dl>
            )}

            {SECTIONS.map(([key, title]) => {
              const vals = group.map(g => g.text?.[key]).filter((v): v is string => !!v)
              if (!vals.length) return null
              const same = vals.every(v => v === vals[0])
              return (
                <section key={key} className="ps-sec">
                  <h3 className="ps-h">{title}</h3>
                  {same || !multi ? <p>{vals[0]}</p> : (
                    <ul className="ps-perflavour">
                      {group.map(g => g.text?.[key] && <li key={g.id}><strong>{flavourName(g)}:</strong> {stripLead(g.text[key], g)}</li>)}
                    </ul>
                  )}
                </section>
              )
            })}

            <p className="ps-foot">
              <a href={me.url} target="_blank" rel="noopener noreferrer">Tillverkarens produktblad (PDF)</a>
              <span className="muted"> · Uppgifterna är hämtade ur produktbladet {data?.fetched}. Kontrollera mot originalet vid behov.</span>
            </p>
            {me.annan_källa && (
              <p className="ps-foot">
                Vissa värden: <a href={me.annan_källa.url} target="_blank" rel="noopener noreferrer">{me.annan_källa.källa}</a>
                <span className="muted"> · Hämtat {me.annan_källa.hämtad}. {me.annan_källa.not}</span>
              </p>
            )}
            {me.iddsi?.källa && (
              <p className="ps-foot">
                IDDSI: <a href={me.iddsi.källa_url} target="_blank" rel="noopener noreferrer">{me.iddsi.källa}</a>
                <span className="muted"> · {me.iddsi.källa_utgivare}. Hämtat {me.iddsi.källa_hämtad}. {me.iddsi.källa_not}</span>
              </p>
            )}
          </>
        )}
      </div>
    </div>
  )
}
