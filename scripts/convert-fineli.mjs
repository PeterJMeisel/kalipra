// Gör om Finelis öppna datapaket (Basic package, CSV) till Kalipras format i src/data/fineli.json.
// Ladda ner paketet från https://fineli.fi/fineli/sv/avoin-data, packa upp och kör:
//   node scripts/convert-fineli.mjs <mapp-med-component_value.csv>
// Data: Fineli, THL – Institutet för hälsa och välfärd. Licens CC BY 4.0, källan ska anges.
import { readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

const dir = process.argv[2]
if (!dir) throw new Error('Ange mappen med Fineli-filerna')

// Samma nycklar och ordning som Livsmedelsverket-filen.
const KEYS = ['ENERC|kcal', 'ENERC|kJ', 'PROT', 'FAT', 'CHO', 'FIBT', 'SUGAR', 'SUGAD', 'SUGFR',
  'FASAT', 'FAMS', 'FAPU', 'F18:2', 'F18:3', 'F20:5', 'F22:6', 'ALC', 'WATER', 'WHOLET', 'CHORL',
  'NACL', 'NA', 'VITA', 'VITD', 'VITE', 'VITC', 'THIACLHCL', 'RIBF', 'NIAEQ', 'VITB6', 'FOL',
  'VITB12', 'CA', 'FE', 'ZN', 'SE', 'P', 'MG', 'K', 'ID']

// Fineli EUFDNAME → [nyckel, faktor till Kalipras enhet]
const MAP = {
  ENERC: ['ENERC|kJ', 1], PROT: ['PROT', 1], FAT: ['FAT', 1], CHOAVL: ['CHO', 1], FIBC: ['FIBT', 1],
  SUGAR: ['SUGAR', 1], FASAT: ['FASAT', 1], FAMCIS: ['FAMS', 1], FAPU: ['FAPU', 1],
  F18D2CN6: ['F18:2', 0.001], F18D3N3: ['F18:3', 0.001], F20D5N3: ['F20:5', 0.001], F22D6N3: ['F22:6', 0.001],
  ALC: ['ALC', 1], CHOLE: ['CHORL', 1], NACL: ['NACL', 0.001], NA: ['NA', 1], VITA: ['VITA', 1],
  VITD: ['VITD', 1], VITE: ['VITE', 1], VITC: ['VITC', 1], THIA: ['THIACLHCL', 1], RIBF: ['RIBF', 1],
  NIAEQ: ['NIAEQ', 1], VITPYRID: ['VITB6', 1], FOL: ['FOL', 1], VITB12: ['VITB12', 1], CA: ['CA', 1],
  FE: ['FE', 1], ZN: ['ZN', 1], SE: ['SE', 1], P: ['P', 1], MG: ['MG', 1], K: ['K', 1], ID: ['ID', 1],
}

// Filerna är ISO-8859-1, semikolonseparerade, med decimalkomma.
const read = async f => new TextDecoder('latin1').decode(await readFile(join(dir, f)))
const rows = text => text.split(/\r?\n/).filter(Boolean).slice(1).map(l => l.split(';'))
const round = v => (v === 0 ? 0 : Number(v.toPrecision(4)))
// "FRUKTSOCKER, FRUKTOS" → "Fruktsocker, fruktos"
const nice = s => { const l = s.trim().toLocaleLowerCase('sv-SE'); return l.charAt(0).toLocaleUpperCase('sv-SE') + l.slice(1) }

const names = new Map(rows(await read('foodname_SV.csv')).map(r => [Number(r[0]), r[1]]))
const values = new Map()
for (const [id, code, best] of rows(await read('component_value.csv'))) {
  const m = MAP[code]
  if (!m || best === '' || best == null) continue
  let v = values.get(Number(id))
  if (!v) values.set(Number(id), (v = {}))
  v[m[0]] = Number(best.replace(',', '.')) * m[1]
}

const foods = []
for (const [id] of rows(await read('food.csv'))) {
  const n = Number(id)
  const v = values.get(n) ?? {}
  if (v['ENERC|kJ'] != null) v['ENERC|kcal'] = v['ENERC|kJ'] / 4.184
  foods.push([n, nice(names.get(n) ?? `Fineli ${n}`), 1, KEYS.map(k => (v[k] == null || Number.isNaN(v[k]) ? null : round(v[k])))])
}

const out = {
  id: 'fineli',
  source: 'Fineli, THL – Institutet för hälsa och välfärd, Finland, release 20 (CC BY 4.0)',
  fetched: new Date().toISOString(),
  keys: KEYS,
  units: { 'ENERC|kcal': 'kcal', 'ENERC|kJ': 'kJ', VITA: 'RAE/µg', NIAEQ: 'NE/mg' },
  foods,
}
await writeFile(new URL('../src/data/fineli.json', import.meta.url), JSON.stringify(out))
console.log(`Klart: ${foods.length} livsmedel sparade i src/data/fineli.json`)
