// Gör om USDA FoodData Central "SR Legacy" (CSV) till Kalipras format i src/data/usda.json.
// Ladda ner "SR Legacy – CSV" från https://fdc.nal.usda.gov/download-datasets, packa upp och kör:
//   node scripts/convert-usda.mjs <mapp-med-food.csv-och-food_nutrient.csv>
// Data: USDA FoodData Central, public domain (CC0 1.0). Källan ska anges.
import { readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

const dir = process.argv[2]
if (!dir) throw new Error('Ange mappen med SR Legacy-filerna')

// Samma nycklar och ordning som Livsmedelsverket-filen.
const KEYS = ['ENERC|kcal', 'ENERC|kJ', 'PROT', 'FAT', 'CHO', 'FIBT', 'SUGAR', 'SUGAD', 'SUGFR',
  'FASAT', 'FAMS', 'FAPU', 'F18:2', 'F18:3', 'F20:5', 'F22:6', 'ALC', 'WATER', 'WHOLET', 'CHORL',
  'NACL', 'NA', 'VITA', 'VITD', 'VITE', 'VITC', 'THIACLHCL', 'RIBF', 'NIAEQ', 'VITB6', 'FOL',
  'VITB12', 'CA', 'FE', 'ZN', 'SE', 'P', 'MG', 'K', 'ID']

// USDA nutrient_id → nyckel. Kolhydrater, energi i kJ, salt och niacinekvivalenter räknas fram nedan.
const DIRECT = {
  1008: 'ENERC|kcal', 1062: 'ENERC|kJ', 1003: 'PROT', 1004: 'FAT', 1079: 'FIBT', 2000: 'SUGAR',
  1235: 'SUGAD', 1258: 'FASAT', 1292: 'FAMS', 1293: 'FAPU', 1269: 'F18:2', 1270: 'F18:3',
  1278: 'F20:5', 1272: 'F22:6', 1018: 'ALC', 1051: 'WATER', 1253: 'CHORL', 1093: 'NA',
  1106: 'VITA', 1114: 'VITD', 1109: 'VITE', 1162: 'VITC', 1165: 'THIACLHCL', 1166: 'RIBF',
  1175: 'VITB6', 1177: 'FOL', 1178: 'VITB12', 1087: 'CA', 1089: 'FE', 1095: 'ZN', 1103: 'SE',
  1091: 'P', 1090: 'MG', 1092: 'K', 1100: 'ID',
}
const CHO_DIFF = 1005 // kolhydrater "by difference" (inkl. fiber)
const NIACIN = 1167 // förformat niacin, mg
const TRP = 1210 // tryptofan, g

function parseCsv(text) {
  const rows = []
  let row = [], field = '', q = false
  for (let i = 0; i < text.length; i++) {
    const c = text[i]
    if (q) {
      if (c === '"') { if (text[i + 1] === '"') { field += '"'; i++ } else q = false }
      else field += c
    } else if (c === '"') q = true
    else if (c === ',') { row.push(field); field = '' }
    else if (c === '\n') { row.push(field); rows.push(row); row = []; field = '' }
    else if (c !== '\r') field += c
  }
  if (field || row.length) { row.push(field); rows.push(row) }
  return rows
}

const round = v => (v === 0 ? 0 : Number(v.toPrecision(4)))

const foodRows = parseCsv(await readFile(join(dir, 'food.csv'), 'utf8')).slice(1)
const nutRows = parseCsv(await readFile(join(dir, 'food_nutrient.csv'), 'utf8')).slice(1)

const raw = new Map() // fdc_id → Map(nutrient_id → amount)
for (const r of nutRows) {
  const id = Number(r[1]), nid = Number(r[2]), amount = r[3]
  if (amount === '') continue
  let m = raw.get(id)
  if (!m) raw.set(id, (m = new Map()))
  m.set(nid, Number(amount))
}

const foods = []
for (const r of foodRows) {
  const id = Number(r[0])
  const m = raw.get(id) ?? new Map()
  const v = {}
  for (const [nid, key] of Object.entries(DIRECT)) if (m.has(Number(nid))) v[key] = m.get(Number(nid))
  if (v['ENERC|kJ'] == null && v['ENERC|kcal'] != null) v['ENERC|kJ'] = v['ENERC|kcal'] * 4.184
  // Tillgängliga kolhydrater som hos Livsmedelsverket: "by difference" minus fiber.
  if (m.has(CHO_DIFF)) v.CHO = Math.max(0, m.get(CHO_DIFF) - (v.FIBT ?? 0))
  if (v.NA != null) v.NACL = (v.NA * 2.5) / 1000
  // Niacinekvivalenter = niacin + tryptofan (mg) / 60. Saknas tryptofan lämnas värdet tomt.
  if (m.has(NIACIN) && m.has(TRP)) v.NIAEQ = m.get(NIACIN) + (m.get(TRP) * 1000) / 60
  foods.push([id, r[2], 1, KEYS.map(k => (v[k] == null ? null : round(v[k])))])
}

const units = { 'ENERC|kcal': 'kcal', 'ENERC|kJ': 'kJ', VITA: 'RAE/µg', NIAEQ: 'NE/mg' }
const out = {
  id: 'usda',
  source: 'USDA FoodData Central, SR Legacy (public domain, CC0 1.0)',
  fetched: new Date().toISOString(),
  keys: KEYS,
  units,
  foods,
}
await writeFile(new URL('../src/data/usda.json', import.meta.url), JSON.stringify(out))
console.log(`Klart: ${foods.length} livsmedel sparade i src/data/usda.json`)
