// Hämtar en ny ögonblicksbild av Livsmedelsverkets livsmedelsdatabas och sparar den
// i src/data/livsmedel.json. Kör med:  npm run update-data
// Kräver Node 18+ och internetuppkoppling. Data: CC BY 4.0, källa Livsmedelsverket.
import { writeFile } from 'node:fs/promises'

const BASE = 'https://dataportal.livsmedelsverket.se/livsmedel/api/v1'
// Nyckel = EuroFIR-kod, eventuellt "|enhet" när samma kod finns i flera enheter (energi).
const KEYS = ['ENERC|kcal', 'ENERC|kJ', 'PROT', 'FAT', 'CHO', 'FIBT', 'SUGAR', 'SUGAD', 'SUGFR',
  'FASAT', 'FAMS', 'FAPU', 'F18:2', 'F18:3', 'F20:5', 'F22:6', 'ALC', 'WATER', 'WHOLET', 'CHORL',
  'NACL', 'NA', 'VITA', 'VITD', 'VITE', 'VITC', 'THIACLHCL', 'RIBF', 'NIAEQ', 'VITB6', 'FOL',
  'VITB12', 'CA', 'FE', 'ZN', 'SE', 'P', 'MG', 'K', 'ID']

async function getJson(url) {
  for (let attempt = 1; ; attempt++) {
    try {
      const r = await fetch(url)
      if (!r.ok) throw new Error(`HTTP ${r.status}`)
      return await r.json()
    } catch (e) {
      if (attempt >= 3) throw new Error(`${url}: ${e.message}`)
      await new Promise(res => setTimeout(res, 500 * attempt))
    }
  }
}

const list = (await getJson(`${BASE}/livsmedel?offset=0&limit=5000&sprak=1`)).livsmedel
console.log(`Hämtar näringsvärden för ${list.length} livsmedel …`)
const units = {}
const foods = new Array(list.length)
let next = 0
let done = 0
async function worker() {
  while (next < list.length) {
    const idx = next++
    const item = list[idx]
    const nv = await getJson(`${BASE}/livsmedel/${item.nummer}/naringsvarden?sprak=1`)
    const vals = KEYS.map(key => {
      const [code, unit] = key.split('|')
      const m = nv.find(x => x.euroFIRkod === code && (!unit || x.enhet === unit))
      if (m && !units[key]) units[key] = m.enhet
      return m && m.varde != null ? m.varde : null
    })
    foods[idx] = [item.nummer, item.namn, item.livsmedelsTyp === 'Analyserat' ? 1 : 0, vals]
    if (++done % 250 === 0) console.log(`  ${done}/${list.length}`)
  }
}
await Promise.all(Array.from({ length: 8 }, worker))

const out = {
  source: 'Livsmedelsverkets livsmedelsdatabas (CC BY 4.0)',
  fetched: new Date().toISOString(),
  keys: KEYS,
  units,
  foods,
}
await writeFile(new URL('../src/data/livsmedel.json', import.meta.url), JSON.stringify(out))
console.log(`Klart: ${foods.length} livsmedel sparade i src/data/livsmedel.json`)
