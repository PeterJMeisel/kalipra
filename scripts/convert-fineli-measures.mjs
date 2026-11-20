// Gör om Finelis hushållsmått och portioner (foodaddunit.csv i Finelis öppna datapaket, release 20)
// till src/data/fineli-measures.json. Gäller bara Fineli-livsmedel (samma FOODID).
//   node scripts/convert-fineli-measures.mjs <mapp-med-foodaddunit.csv>
// Data: Fineli, THL – Institutet för hälsa och välfärd. Licens CC BY 4.0, källan ska anges.
// Lokal kopia: Kalipra-källdokument\Fineli\Fineli_Rel20.zip (https://fineli.fi/fineli/sv/avoin-data).
import { readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

const dir = process.argv[2]
if (!dir) throw new Error('Ange mappen med Fineli-filerna')

// Fineli-kod → fält. Alla värden i gram per enhet.
// DL deciliter, RKL matsked, TL tesked, KPL_S/M/L litet/medelstort/stort stycke, KPL_VALM stycke enligt
// producent, PORTS/M/L liten/medelstor/stor portion.
const FIELD = { DL: 'dl', RKL: 'msk', TL: 'tsk', KPL_S: 'stS', KPL_M: 'stM', KPL_L: 'stL', KPL_VALM: 'stP', PORTS: 'pS', PORTM: 'pM', PORTL: 'pL' }

const text = new TextDecoder('latin1').decode(await readFile(join(dir, 'foodaddunit.csv')))
const foods = {}
for (const line of text.split(/\r?\n/).slice(1)) {
  if (!line) continue
  const [id, unit, mass] = line.split(';')
  const f = FIELD[unit]
  const g = Number(mass.replace(',', '.'))
  if (!f || !(g > 0)) continue
  ;(foods[id] ??= {})[f] = Math.round(g * 10) / 10
}

const out = {
  source: 'Fineli, THL – Institutet för hälsa och välfärd, Finland, release 20, foodaddunit.csv (CC BY 4.0)',
  foods,
}
await writeFile(new URL('../src/data/fineli-measures.json', import.meta.url), JSON.stringify(out))
console.log(`Klart: mått för ${Object.keys(foods).length} livsmedel sparade i src/data/fineli-measures.json`)
