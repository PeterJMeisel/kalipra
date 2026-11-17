import { useEffect, useState } from 'react'

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

const flavourName = (d: Detail) => d.flavour ?? 'Neutral/ingen smak'
/** Tar bort upprepad inledning som "Fresubin 2 KCAL Drink, smak Jordgubb:" eller "Jordgubb:" när smaken redan står framför. */
const stripLead = (t: string, d: Detail) => (d.flavour
  ? t.replace(new RegExp(`^.{0,80}?smak ${d.flavour.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}:\\s*`, 'i'), '').replace(new RegExp(`^${d.flavour.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}:\\s*`, 'i'), '')
  : t)

/** Produktfaktablad för en nutritionsprodukt. Alla smaker av samma produkt visas i samma blad; skillnader visas per smak. */
export function ProductSheet({ foodNumber, onClose }: { foodNumber: number; onClose: () => void }) {
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
    return r ? `${r.värde} ${r.enhet}` : '–'
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

            <h3 className="ps-h">Näringsvärden per 100 {me.basis}</h3>
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
                        {same ? <td colSpan={group.length}>{vals[0]}</td> : vals.map((v, i) => <td key={group[i].id} className="diff">{v}</td>)}
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
              <span className="muted"> · Uppgifterna är hämtade automatiskt ur produktbladet {data?.fetched}. Kontrollera mot originalet vid behov.</span>
            </p>
          </>
        )}
      </div>
    </div>
  )
}
