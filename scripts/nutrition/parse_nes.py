"""Tolkar Nestlé Health Sciences produktblad (pdftotext -layout).

Raderna i näringsdeklarationen har formen  <etikett>  <enhet>  <värde>  där värdet kan vara
"5,7/5,0*" (andra värdet gäller en annan produkt eller smak enligt fotnot). Raden hittas via enheten,
var på raden den än står, så att text i spalterna bredvid inte stör.
"""
import re, glob, os, sys, json
sys.path.insert(0, os.path.dirname(__file__))
from parse_fk import LABELS

UNIT = r'(?:kcal|kJ|g|mg \(mmol\)|mg NE \(mg\)|mg a-TE|mg α-TE|μg RE|µg RE|mg|µg|μg|mcg|µg RE|μg RE|mg α-TE|mg α‑TE|mg a-TE|mg/mg NE|mg NE|g/100 ml|mmol|mOsm/L|mOsm/kg H20|mOsm/kg H2O)'
VAL = r'[<≤]?\s?\d[\d,.]*\*{0,3}(?:\s?/\s?[<≤]?\s?\d[\d,.]*\*{0,3})*'
ROW = re.compile(r'(?:^|\s{2,})(?P<label>(?:[–\-]\s*)?[A-Za-zÅÄÖåäöμα](?:[^ ]| (?! ))*?)?\s+(?P<unit>' + UNIT + r')\s{2,}(?P<val>' + VAL + r')(?:\s{2,}(?P<val2>' + VAL + r'))?(?=\s{2,}|\s*$)')


def split_vals(v):
    parts = [p.strip().rstrip('*').replace('≤', '').replace('<', '').strip() for p in v.split('/')]
    out = []
    for p in parts:
        try:
            out.append(float(p.replace(',', '.')))
        except ValueError:
            pass
    return out


def parse_text(txt, variants=1):
    """Returnerar per variant: dict nyckel -> värde (per 100 ml/g, första kolumnen)."""
    res = [dict() for _ in range(variants)]
    # Börja vid näringsdeklarationen om den finns
    m = re.search(r'N[ÄA]RINGS?DEKLARATION|NÄRINGSINNEHÅLL|Näringsinnehåll', txt)
    body = txt[m.start():] if m else txt
    head = body[:600]
    two = bool(re.search(r'[Pp]er\s+100 g', head))
    basis = 'g' if two or (re.search(r'per 100 g', txt) and not re.search(r'per 100 ml', txt)) else 'ml'
    prepared = {}
    for ln in body.split('\n'):
        for mm in ROW.finditer(ln):
            label = (mm.group('label') or '').strip().lstrip('–-').strip()
            if label.startswith('Ekvivalent'):
                label = 'Protein'
            unit = mm.group('unit')
            vals = split_vals(mm.group('val'))
            if not vals:
                continue
            key = None
            # Text i spalten till vänster (t.ex. ingredienslistan) kan hamna som "etikett" – räkna den som tom
            if label and (',' in label or len(label) > 32) and unit in ('kcal', 'kJ'):
                label = ''
            if unit == 'kcal' and (not label or label.startswith('Energi')):
                key = 'ENERC|kcal'
            elif unit == 'kJ' and (not label or label.startswith('Energi')):
                key = 'ENERC|kJ'
            else:
                lab = re.sub(r'\s*\(.*?\)\s*', ' ', label).strip()
                lab = re.sub(r'^varav\s+', 'varav ', lab)
                for pat, k in LABELS:
                    if re.search(pat, lab, 0 if k == 'FAT' else re.I):
                        key = k
                        break
                if key == 'NIAEQ':
                    # "mg/mg NE  1,2/3,0" -> NE är andra talet
                    if unit == 'mg/mg NE' and len(vals) >= 2:
                        vals = vals[1::2]
            if not key:
                continue
            if key == 'NACL' and unit == 'mg':
                vals = [v / 1000 for v in vals]
            if two and mm.group('val2') and key not in prepared:
                v2 = split_vals(mm.group('val2'))
                if v2:
                    prepared[key] = v2[0] / 1000 if key == 'NACL' and unit == 'mg' else v2[0]
            for i in range(variants):
                if key in res[i]:
                    continue
                res[i][key] = vals[i] if i < len(vals) else vals[0]
    return basis, res, prepared


if __name__ == '__main__':
    for f in sorted(glob.glob(sys.argv[1] + '/*.txt')):
        if 'produktguide' in f or 'produkt-versikt' in f:
            continue
        basis, r, prep = parse_text(open(f).read(), 2 if '/' in os.path.basename(f) else 1)
        v = r[0]
        kcal = v.get('ENERC|kcal')
        calc = v.get('PROT', 0) * 4 + v.get('FAT', 0) * 9 + v.get('CHO', 0) * 4 + v.get('FIBT', 0) * 2
        ok = kcal and abs(calc - kcal) / kcal < 0.05
        print(f'{os.path.basename(f)[:38]:38} {basis} n={len(v):2} kcal={kcal} calc={calc:.0f} P={v.get("PROT")} F={v.get("FAT")} C={v.get("CHO")} fib={v.get("FIBT")} {"" if ok else "<-- KOLLA"}')
