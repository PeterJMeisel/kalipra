"""Tolkar Nutricias produktblad (pdftotext -layout).

Näringstabellen står oftast till höger om ingredienslistan, så raden letas upp via mönstret
<etikett>  <enhet>  <värde> var som helst på raden. Första värdekolumnen = per 100 ml/g.
Värden som "18,4 (18,5*)" eller "96,0 (4,18)" ger första talet.
"""
import re, os, sys
sys.path.insert(0, os.path.dirname(__file__))
from parse_fk import LABELS

UNIT = (r'(?:kcal|Kcal|kJ|KJ|g \(E ?%\)|g|mg \(mmol\)|mg NE \(mg\)|mg NE|mg/mg NE|mg a-TE|mg α-TE|mg α -TE|'
        r'µg RE|μg RE|mg|µg|μg|mcg|mOsmol/l|mOsm/l|mOsmol/kg H2O|mOsm/kg H2O|mosmol/l|ml)')
ROW = re.compile(r'(?:^|\s{2,})(?P<label>[–\-]{0,2}\s*[A-Za-zÅÄÖåäöµμαβ](?:[^ ]| (?! ))*?)?\s+(?P<unit>' + UNIT +
                 r')\s{2,}(?P<val>[<≤>]?\s?\d+(?:[,.]\d+)?)(?=[\s(*/]|[a-dA-D]|$)')
# Makrorader där enhetskolumnen är tom (enheten g underförstådd)
ROW_NOUNIT = re.compile(r'(?:^|\s{2,})(?P<label>(?:Fett|Kolhydrat|Protein|Kostfiber)(?: \([^)]*\))?)\s{2,}'
                        r'(?P<unit>)(?P<val>\d+(?:[,.]\d+)?)(?=[\s(*/]|[a-dA-D]|$)')


UNIT_RE = re.compile('^' + UNIT + '$')
VAL_RE = re.compile(r'^([<≤>]?\s?\d+(?:[,.]\d+)?)(?:[\s(*/]|[a-dA-D]|$)')
NOUNIT = re.compile(r'^(?:Fett|Kolhydrat|Protein|Kostfiber)(?: \([^)]*\))?$')


def cells(ln):
    """Delar raden i kolumner (2+ mellanslag) och hittar <etikett> <enhet> <värde> (eller makroetikett + värde)."""
    c = [x for x in re.split(r'\s{2,}', ln.strip()) if x]
    out = []
    for i, x in enumerate(c):
        if UNIT_RE.match(x) and i + 1 < len(c):
            m = VAL_RE.match(c[i + 1])
            if m:
                out.append({'label': c[i - 1] if i > 0 and not VAL_RE.match(c[i - 1]) else '', 'unit': x, 'val': m.group(1)})
        elif NOUNIT.match(x) and i + 1 < len(c):
            m = VAL_RE.match(c[i + 1])
            if m:
                out.append({'label': x, 'unit': '', 'val': m.group(1)})
    return out


def num(s):
    s = s.replace('≤', '').replace('<', '').replace('>', '').replace(' ', '').replace(',', '.')
    try:
        return float(s)
    except ValueError:
        return None


def parse_text(txt):
    vals = {}
    m = re.search(r'[Pp]er 100 (ml|g)', txt)
    basis = m.group(1) if m else ('g' if re.search(r'pulver|portionspåse', txt, re.I) else 'ml')
    for ln in txt.split('\n'):
        for mm in cells(ln):
            label = (mm['label'] or '').strip()
            label = re.sub(r'^[–\-]+\s*', '', label)
            unit = mm['unit'] or 'g'
            v = num(mm['val'])
            if v is None:
                continue
            ul = unit.lower()
            key = None
            if ul in ('kcal', 'kj'):
                if not label or label.lower().startswith('energi') or ',' in label or len(label) > 32:
                    key = 'ENERC|kcal' if ul == 'kcal' else 'ENERC|kJ'
            else:
                lab = re.sub(r'\s*\(.*?\)\s*', ' ', label).strip()
                lab = re.sub(r'^(varav|därav)\s+', r'\1 ', lab)
                if lab.lower().startswith('därav ') and 'laktos' not in lab.lower():
                    lab = 'varav ' + lab[6:]
                for pat, k in LABELS:
                    if re.search(pat, lab, 0 if k == 'FAT' else re.I):
                        key = k
                        break
            if not key or key in vals:
                continue
            if key == 'NACL' and ul == 'mg':
                v = v / 1000
            vals[key] = v
    return basis, vals
