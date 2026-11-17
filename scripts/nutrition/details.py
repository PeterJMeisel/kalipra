"""Samlar all övrig information ur produktbladen (utöver näringsvärdena i nutrition.json).

Per produkt/smak: vatteninnehåll, osmolaritet/osmolalitet, alla rader i näringsdeklarationen
(även sådant Kalipra inte räknar på, t.ex. vitamin K, biotin, klorid, koppar), egenskaper
(glutenfri, låglaktos, fiberfri ...), produktinformation, dosering, viktigt, anvisning,
ingredienser, smaker/förpackningar, fett-/protein-/kolhydratkällor och energifördelning.

Fullständig text för varje blad finns kvar i fk/, fks/ och nes/ (*.txt).
"""
import re

NUMV = r'[<≤]?\s?\d+(?:[,.]\d+)?(?:\s?/\s?\d+(?:[,.]\d+)?)?'
UNITS = r'(?:kcal|\(kcal\)|kJ|g|mg|µg|μg|mcg|%|µg RE°?|μg RE°?|mg α ?-?TE°*|mg/mg NE°*|mg NE|mosmol/l|mosmol/kg ?H2O|mosmol/H2O|mOsm/L|mOsm/kg H2?0|mOsm/kg H2O|ml)'

FLAGS = [
    ('glutenfri', r'glutenfri'),
    ('laktosfri', r'laktosfri|laktos- och glutenfri'),
    ('låglaktos', r'låglaktos'),
    ('fiberfri', r'fiberfri|utan fiber'),
    ('fibrer', r'med fiber|fiberberikad|innehåller fiber|med kostfiber'),
    ('MCT', r'\bMCT\b|medellånga fettsyror'),
    ('vegetabilisk/växtbaserad', r'växtbaserad|plant ?based|vegansk'),
    ('mjölkproteinfri', r'mjölkproteinfri|fri från mjölkprotein|fri från mjölk|aminosyrabaserad specialnäring'),
    ('sojafri', r'sojafri'),
    ('näringsmässigt komplett', r'näringsmässigt komplett|lämplig som enda näringskälla'),
    ('ej komplett', r'inte lämplig som enda näringskälla|ej lämplig som enda näringskälla|ej näringsmässigt komplett'),
    ('sondnäring', r'sondnäring|sondmatning|via sond'),
]

SECTION_HEADS = [
    ('produktinformation', r'^Produktinformation'),
    ('dosering', r'^Dosering'),
    ('viktigt', r'^Viktigt'),
    ('anvisning', r'^Anvisning|^Tillredning|^Bruksanvisning'),
    ('ingredienser', r'^Ingredienser'),
    ('smaker', r'^Smaker|^Förpackning|^Artikelnummer'),
    ('allergener', r'^Allergen'),
    ('referenser', r'^\d\)|^Referenser'),
]


def _num(s):
    s = s.replace('≤', '').replace('<', '').replace(' ', '').replace(',', '.')
    try:
        return float(s.split('/')[0])
    except ValueError:
        return None


def water(txt):
    m = re.search(r'Vatten(?:mängd|innehåll)?\s*(?:per 100 (?:ml|g))?\s*:?\s*(\d+(?:[,.]\d+)?)\s*(?:ml|g)', txt, re.I)
    if m:
        return _num(m.group(1))
    m = re.search(r'(?:^|\s{2,})[–-]?\s*Vatten(?:halt)?\s+(?:ml|g)(?:/100 ml)?\s{2,}(\d+(?:[,.]\d+)?)', txt, re.M | re.I)
    return _num(m.group(1)) if m else None


def osmo(txt):
    out = {}
    for key, pat in (('osmolaritet', r'Osmolaritet[^\n]*?\s(\d{3,4})\b'), ('osmolalitet', r'Osmolalitet[^\n]*?\s(\d{3,4})\b')):
        m = re.search(pat, txt, re.I)
        if m:
            out[key] = int(m.group(1))
    m = re.search(r'(\d{2,4})\s*mOsm/kg', txt)
    if m and 'osmolalitet' not in out:
        out['osmolalitet'] = int(m.group(1))
    m = re.search(r'(\d{2,4})\s*mOsm/L', txt, re.I)
    if m and 'osmolaritet' not in out:
        out['osmolaritet'] = int(m.group(1))
    return out


def table_rows_cells(txt):
    """Som table_rows men kolumnbaserat över hela radbredden (Nutricias blad har tabellen långt till höger)."""
    unit_re = re.compile('^(?:' + UNITS + r'|g \(E ?%\)|mg \(mmol\)|Kcal)$')
    val_re = re.compile(r'^(' + NUMV + r')')
    rows = {}
    for ln in txt.split('\n'):
        c = [x for x in re.split(r'\s{2,}', ln.strip()) if x]
        for i in range(0, len(c) - 1):
            if not unit_re.match(c[i]):
                continue
            m = val_re.match(c[i + 1])
            if not m:
                continue
            if i == 0 and c[i].lower() != 'kcal':
                continue
            label = 'Energi' if i == 0 else re.sub(r'\s+', ' ', c[i - 1]).strip(' –-')
            if c[i] not in ('kJ', 'kcal', 'Kcal') and (not re.match(r'[A-Za-zÅÄÖåäöµμα]', label) or len(label) > 45) or re.search(r'per 100|\d+\s*x\s*\d', label):
                continue
            label = re.sub(r'^(varav|därav)\s+', r'\1 ', label)
            if c[i] in ('kJ', 'kcal', 'Kcal') or label.lower().startswith('energi'):
                label = 'Energi (kJ)' if c[i] == 'kJ' else 'Energi'
                c[i] = 'kcal' if c[i] == 'Kcal' else c[i]
            if label not in rows:
                # "mg (mmol)": första värdet är mg
                rows[label] = {'enhet': re.sub(r' \(.*\)$', '', c[i]).replace('μ', 'µ'), 'värde': m.group(1).replace(' ', '')}
    return rows


def table_rows(txt):
    """Alla rader 'etikett  enhet  värde' i näringsdeklarationen (första värdet = per 100 ml/g)."""
    rows = {}
    pat = re.compile(r'(?:^|\s{2,})(?P<label>[–\-]?\s*[A-Za-zÅÄÖåäöµμαß][^\n]*?)\s{1,}(?P<unit>' + UNITS + r')\s{2,}(?P<val>' + NUMV + r')')
    for ln in txt.split('\n'):
        for mm in pat.finditer(ln[:130]):
            label = re.sub(r'\s+', ' ', mm.group('label')).strip(' –-')
            if len(label) > 45 or label.lower().startswith(('per ', 'innehåll', 'smak ')) or re.search(r'\d+\s*x\s*\d|per 100', label):
                continue
            label = re.sub(r'^varav\s+', 'varav ', label)
            if mm.group('unit') == 'kJ' or label.lower().startswith(('energivärde', 'energifördelning')):
                label = 'Energi' if mm.group('unit') != 'kJ' else 'Energi (kJ)'
            if label not in rows:
                rows[label] = {'enhet': mm.group('unit').replace('μ', 'µ'), 'värde': mm.group('val').replace(' ', '')}
    # "(kcal)  (200)" i Fresenius-bladen
    if not any(r['enhet'] == 'kcal' for r in rows.values()):
        m = re.search(r'\(kcal\)\s{2,}\((\d+(?:[,.]\d+)?)\)', txt)
        if m:
            items = list(rows.items())
            idx = next((i for i, (k, _) in enumerate(items) if k == 'Energi (kJ)'), 0)
            items.insert(idx + 1 if items and items[idx][0] == 'Energi (kJ)' else 0, ('Energi (kcal)', {'enhet': 'kcal', 'värde': m.group(1)}))
            rows = dict(items)
    return rows


IDDSI_NAMN = {0: 'tunnflytande', 1: 'mycket lätt trögflytande', 2: 'lätt trögflytande', 3: 'måttligt trögflytande',
              4: 'mycket trögflytande', 5: 'finfördelad och mjuk', 6: 'mjuk och lättuggad', 7: 'normal'}


def iddsi(txt):
    """IDDSI-nivå enligt bladet. Returnerar {'nivå': '4', 'namn': ..., 'tabell': [{produkt, kylskåpskall, rumstempererad}], 'not': ...}."""
    out = {}
    lines = txt.split('\n')
    # Nutricias tabell: Produkt | IDDSI-nivå kylskåpskall | IDDSI-nivå rumstempererad
    for i, ln in enumerate(lines):
        if ln.count('IDDSI-nivå') >= 1 and 'Produkt' in ln:
            col = ln.index('Produkt') - 4
            rows, pending = [], []
            for l2 in lines[i + 1:i + 40]:
                if 'Testning' in l2 or 'IDDSI ramverk' in l2:
                    break
                part = l2[col:] if len(l2) > col else ''
                c = [x for x in re.split(r'\s{2,}', part.strip()) if x]
                if len(c) >= 2 and re.fullmatch(r'\d', c[-1]) and re.fullmatch(r'\d', c[-2]):
                    name = ' '.join(c[:-2] or pending)
                    if c[:-2] and pending:
                        name = ' '.join(pending + c[:-2])
                    if name and name not in ('Kylskåpskall Rumstempererad',):
                        rows.append({'produkt': name, 'kylskåpskall': int(c[-2]), 'rumstempererad': int(c[-1])})
                    pending = []
                elif c and not re.search(r'Kylskåpskall|Rumstempererad|\.\s', part) and len(' '.join(c)) < 40:
                    pending.append(' '.join(c))
            if rows:
                out['tabell'] = rows
                levels = sorted({r['kylskåpskall'] for r in rows} | {r['rumstempererad'] for r in rows})
                out['nivå'] = '–'.join(str(x) for x in (levels if len(levels) <= 1 else [levels[0], levels[-1]]))
                if any(r['kylskåpskall'] != r['rumstempererad'] for r in rows):
                    out['not'] = 'Nivån beror på temperaturen (kylskåpskall/rumstempererad).'
            break
    if 'nivå' not in out:
        flat = re.sub(r'\s+', ' ', txt)
        m = (re.search(r'IDDSI[^.]{0,30}?nivå\s*(\d)\s*(?:–|-)\s*(\d)', flat, re.I)
             or re.search(r'IDDSI\W{0,4}(?:\d\s+)?nivå\s*(\d)()', flat, re.I)
             or re.search(r'IDDSI-(\d)()\b', flat))
        # Förtjockningsmedel med doseringstabell "NIVÅ 1 … NIVÅ 4"
        lv = sorted({int(x) for x in re.findall(r'NIVÅ (\d)\s', txt)})
        if not m and len(lv) > 1 and 'IDDSI' in txt:
            out['nivå'] = f'{lv[0]}–{lv[-1]}'
            out['not'] = 'Nivån beror på doseringen.'
        if m:
            out['nivå'] = m.group(1) + (f'–{m.group(2)}' if m.group(2) else '')
            if m.group(2):
                out['not'] = 'Nivån beror på doseringen.'
    if 'nivå' in out and '–' not in out['nivå']:
        out['namn'] = IDDSI_NAMN[int(out['nivå'])]
    return out or None


def galactosemia_ok(txt):
    """True om bladet säger att produkten är lämplig vid galaktosemi (inte "ej/inte lämplig", inte kontraindikation).
    Texten är i kolumnlayout, så ordet före "lämplig" kan stå sist i samma kolumn på raden ovanför."""
    lines = txt.split('\n')
    cell_re = re.compile(r'\S+(?: \S+)*')
    for i, ln in enumerate(lines):
        for m in re.finditer(r'galaktosemi', ln, re.I):
            cell = next((c for c in cell_re.finditer(ln) if c.start() <= m.start() < c.end()), None)
            if not cell:
                continue
            before = ln[cell.start():m.start()]
            if re.search(r'kontraindikation|(ej|inte)\s+(lämplig|avsedd)', before, re.I):
                continue
            if not re.search(r'lämplig', before, re.I):
                # "lämplig" kan stå på raden ovanför i samma kolumn
                if i == 0:
                    continue
                prev = next((c for c in cell_re.finditer(lines[i - 1]) if c.start() < cell.start() + 30 and c.end() > cell.start()), None)
                if not prev or not re.search(r'lämplig[^.]*$', prev.group(0), re.I) or re.search(r'(ej|inte)\s+lämplig[^.]*$|kontraindikation', prev.group(0), re.I):
                    continue
                return True
            # "lämplig" står först i cellen: kolla om raden ovanför i samma kolumn slutar med Ej/Inte
            if re.match(r'\s*(för|till|vid)?\s*(patienter|personer)?.*?lämplig', before, re.I) and before.lower().lstrip().startswith(('lämplig', 'för', 'till', 'patienter', 'personer', 'med')):
                if i > 0:
                    prev = next((c for c in cell_re.finditer(lines[i - 1]) if c.start() <= cell.start() + 3 and c.end() >= cell.start()), None)
                    if prev and re.search(r'\b(ej|inte)\s*$', prev.group(0), re.I):
                        continue
            return True
    return False


# Ovanliga sjukdomar som produkten är anpassad för (ur bladets indikation)
RARE = [  # (namn, ord – skiftlägesokänsligt, förkortning – skiftlägeskänslig)
    ('fenylketonuri (PKU)', r'fenylketonuri|hyperfenylalanin', r'\bPKU\b'),
    ('tyrosinemi', r'tyrosinemi', r'\bTYR\b'),
    ('homocystinuri', r'homocystinuri', r'\bHCU\b'),
    ('lönnsirapssjukdom (MSUD)', r'lönnsirap|maple syrup', r'\bMSUD\b'),
    ('glutarsyrauri typ 1', r'glutar(syra|acid)uri', r'\bGA-?1\b'),
    ('isovaleriansyraemi', r'isovalerian', r'\bIVA\b'),
    ('metylmalon-/propionsyraemi', r'metylmalon|propion(syra|acid)emi', r'\bMMA\b'),
    ('ureacykeldefekter', r'ureacykel', r'\bUCD\b'),
    ('hyperlysinemi', r'hyperlysin', r'HYPER-LYS'),
    ('epilepsi (ketogen kost)', r'ketogen', r'(?!)'),
]


def flags(txt):
    low = txt.lower()
    out = [name for name, pat in FLAGS if re.search(pat, low)]
    # Ovanlig sjukdom: den som nämns oftast (blad nämner ibland andra produkter i serien)
    hits = {name: len(re.findall(word, txt, re.I)) + len(re.findall(abbr, txt)) for name, word, abbr in RARE}
    top = max(hits.values())
    if top:
        out += [f'anpassad för {n}' for n, c in hits.items() if c == top]
    if galactosemia_ok(txt):
        out.append('anpassad för galaktosemi')
    return out


def right_column_sections(txt, split=None):
    """Delar högerkolumnen (fk-bladen) i rubriker: produktinformation, dosering, viktigt, anvisning, ingredienser, smaker."""
    lines = txt.split('\n')
    if split is None:
        pos = [ln.find('Produktinformation') for ln in lines if 'Produktinformation' in ln]
        split = min(pos) if pos else 95
    right = []
    for ln in lines:
        r = ln[split:].strip() if len(ln) > split else ''
        right.append(r)
    sec, cur = {}, None
    for r in right:
        if not r:
            continue
        for key, pat in SECTION_HEADS:
            if re.match(pat, r):
                cur = key
                r = re.sub(pat + r':?\s*', '', r)
                break
        if cur and cur != 'referenser' and r:
            sec.setdefault(cur, []).append(r)
    return {k: re.sub(r'\s+', ' ', ' '.join(v)).strip().lstrip(':').strip() for k, v in sec.items() if v}


def left_extras(txt):
    out = {}
    for key, pat in (('fettkälla', r'Fettkälla:?\s*(.+)'), ('proteinkälla', r'Proteinkälla:?\s*(.+)'),
                     ('kolhydratkälla', r'Kolhydratkälla:?\s*(.+)'), ('fiberkälla', r'Fiberkälla:?\s*(.+)')):
        m = re.search(pat, txt)
        if m:
            v = re.split(r'\s{3,}', m.group(1).strip())[0]
            out[key] = re.split(r'\.?\s*(?:Kost)?(?:Fett|Protein|Kolhydrat|Fiber)källa:', v)[0].strip()
    m = re.search(r'Energifördelning[^\n]*\n\s*(.+)', txt)
    if m:
        out['energifördelning'] = re.split(r'\s{3,}', m.group(1).strip())[0]
    return out


def column_block(txt, head):
    """Text i samma kolumn under en rubrik (t.ex. INGREDIENSER i Nestlés blad)."""
    lines = txt.split('\n')
    for i, ln in enumerate(lines):
        m = re.search(head, ln, re.I)
        if not m:
            continue
        col = m.start()
        out, blank = [], 0
        first = ln[m.end():].strip(' :')
        if first:
            out.append(first)
        for nxt in lines[i + 1:i + 40]:
            part = nxt[max(0, col - 2):].strip() if len(nxt) > col - 2 else ''
            if not part:
                blank += 1
                if blank >= 2 and out:
                    break
                continue
            blank = 0
            if re.match(r'[A-ZÅÄÖ]{5,}\b', part) and out:
                break
            out.append(re.split(r'\s{3,}', part)[0])
        if out:
            return re.sub(r'\s+', ' ', ' '.join(out)).replace('- ', '').strip()
    return None


def details_for(txt, whole_sheet=None, wide=False):
    """txt = texten för en produkt/smak (ett block); whole_sheet = hela bladet för egenskaper och sektioner."""
    sheet = whole_sheet or txt
    d = {
        'vatten_per_100': water(txt) if water(txt) is not None else water(sheet),
        **osmo(txt or sheet),
        'egenskaper': flags(sheet),
        'iddsi': iddsi(txt) or iddsi(sheet),
        'näringsdeklaration': table_rows_cells(txt) if wide else table_rows(txt),
        **left_extras(txt or sheet),
    }
    # Sektionerna tas ur produktens eget block (en smak) så att texten inte upprepas för alla smaker
    src = txt if txt and 'Produktinformation' in txt else sheet
    secs = right_column_sections(src) if 'Produktinformation' in src else {}
    if 'ingredienser' not in secs:
        ing = column_block(sheet, r'INGREDIENSER|Ingredienser:?')
        if ing:
            secs['ingredienser'] = ing
    if secs:
        d['text'] = secs
    return {k: v for k, v in d.items() if v not in (None, {}, [], '')}
