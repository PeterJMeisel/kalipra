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
    ('med fiber', r'med fiber|fiberberikad|innehåller fiber'),
    ('med fiskolja', r'fiskolja'),
    ('MCT', r'\bMCT\b|medellånga fettsyror'),
    ('vegetabilisk/växtbaserad', r'växtbaserad|plant ?based|vegansk'),
    ('mjölkproteinfri', r'mjölkproteinfri|fri från mjölkprotein'),
    ('sojafri', r'sojafri'),
    ('näringsmässigt komplett', r'näringsmässigt komplett|lämplig som enda näringskälla'),
    ('ej komplett', r'inte lämplig som enda näringskälla|ej lämplig som enda näringskälla|ej näringsmässigt komplett'),
    ('sondnäring', r'sondnäring|sondmatning|via sond'),
    ('ej för galaktosemi', r'galaktosemi'),
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
            if label not in rows:
                rows[label] = {'enhet': mm.group('unit').replace('μ', 'µ'), 'värde': mm.group('val').replace(' ', '')}
    return rows


def flags(txt):
    low = txt.lower()
    return [name for name, pat in FLAGS if re.search(pat, low)]


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


def details_for(txt, whole_sheet=None):
    """txt = texten för en produkt/smak (ett block); whole_sheet = hela bladet för egenskaper och sektioner."""
    sheet = whole_sheet or txt
    d = {
        'vatten_per_100': water(txt) if water(txt) is not None else water(sheet),
        **osmo(txt or sheet),
        'egenskaper': flags(sheet),
        'näringsdeklaration': table_rows(txt),
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
