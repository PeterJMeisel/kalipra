"""Tolkar Fresenius Kabis produktblad (pdftotext -layout) till näringsvärden per 100 ml/g."""
import json, re, sys, glob, os

NUM = r'[≤<]?\s?\d+(?:[,.]\d+)?'

# Etikett i produktbladet -> Kalipra-nyckel. Ordningen spelar roll (mer specifika först).
LABELS = [
    (r'^(varav |därav )?laktos$', 'LACT'),
    (r'^(varav )?mättat|^(varav )?mättade', 'FASAT'),
    (r'enkelomättat|enkelomättade', 'FAMS'),
    (r'fleromättat|fleromättade', 'FAPU'),
    (r'^Fett\b', 'FAT'),
    (r'varav socker|sockerarter', 'SUGAR'),
    (r'^Kolhydrat', 'CHO'),
    (r'^(Kost)?[Ff]ib(er|rer)\b', 'FIBT'),
    (r'^Protein', 'PROT'),
    (r'^Salt', 'NACL'),
    (r'^Vitamin A', 'VITA'),
    (r'^Vitamin D', 'VITD'),
    (r'^Vitamin E', 'VITE'),
    (r'^Vitamin C', 'VITC'),
    (r'^(Tiamin|Vitamin B1\b)', 'THIACLHCL'),
    (r'^(Riboflavin|Vitamin B2\b)', 'RIBF'),
    (r'^Niacin', 'NIAEQ'),
    (r'^Vitamin B6', 'VITB6'),
    (r'^(Folsyra|Folat)', 'FOL'),
    (r'^Vitamin B12', 'VITB12'),
    (r'^Natrium', 'NA'),
    (r'^Kalium', 'K'),
    (r'^Kalcium', 'CA'),
    (r'^Fosfor', 'P'),
    (r'^Magnesium', 'MG'),
    (r'^Järn', 'FE'),
    (r'^Zink', 'ZN'),
    (r'^Selen', 'SE'),
    (r'^Jod', 'ID'),
    (r'^Alkohol', 'ALC'),
]


def num(s):
    s = s.replace('≤', '').replace('<', '').replace(' ', '').replace(',', '.')
    return float(s)


def parse_block(lines):
    """Ett block = en näringsdeklaration (en smak)."""
    vals, notes = {}, []
    basis = None
    for ln in lines:
        m = re.search(r'per 100 (ml|g)', ln)
        if m and basis is None:
            basis = m.group(1)
        # Bara vänsterkolumnen (näringstabellen står till vänster i bladen)
        left = ln[:115]
        s = left.strip()
        if not s:
            continue
        mkj = re.match(r'^(?:[A-Za-zåäöÅÄÖ() %]*\s+)?kJ\s{2,}(' + NUM + r')', s)
        if mkj and 'ENERC|kJ' not in vals and left.find('kJ') < 95:
            vals['ENERC|kJ'] = num(mkj.group(1))
            continue
        mkc = re.match(r'^(?:[A-Za-zåäöÅÄÖ() %]*\s+)?\(?(?:=\s*)?kcal\)?\s{2,}\(?(\d+(?:[,.]\d+)?)\)?', s)
        if mkc and 'ENERC|kcal' not in vals and left.find('kcal') < 95:
            vals['ENERC|kcal'] = num(mkc.group(1))
            continue
        if len(left) - len(left.lstrip()) > 8:
            continue
        lab = re.split(r'\s{2,}', s)
        label = lab[0]
        rest = s[len(label):]
        for pat, key in LABELS:
            if re.search(pat, label, re.I if key not in ('FAT',) else 0):
                if key in vals:
                    break
                if key == 'NIAEQ':
                    # "mg/mg NE  3/4" -> NE är andra värdet; "mg NE 2,7" -> enda värdet
                    m2 = re.search(r'(\d+(?:[,.]\d+)?)\s*/\s*(\d+(?:[,.]\d+)?)', rest)
                    if m2 and '/' in rest.split()[0] + rest:
                        vals[key] = num(m2.group(2)) if re.search(r'NE', rest) else num(m2.group(1))
                        break
                n = re.findall(NUM, rest)
                if n:
                    v = num(n[0])
                    unit = rest.strip().split()[0] if rest.strip() else ''
                    if key == 'NACL' and unit == 'mg':
                        v = v / 1000
                    if key in ('NA', 'K', 'CA', 'P', 'MG') and unit == 'g':
                        v = v * 1000
                    vals[key] = v
                break
    return basis, vals


def parse_file(path):
    txt = open(path, encoding='utf-8', errors='replace').read()
    # Dela upp på näringsdeklarationer
    parts = re.split(r'(?=^.*Näringsdeklaration)', txt, flags=re.M)
    blocks = []
    for p in parts:
        if 'Näringsdeklaration' not in p:
            continue
        lines = p.split('\n')
        flav = None
        for ln in lines[:12]:
            m = re.search(r'^\s*Smak\s+(.+?)(?:\s{2,}|$)', ln)
            if m:
                flav = m.group(1).strip()
                break
        if flav is None:
            for ln in lines[:12]:
                m = re.search(r'^\s*(\S.*?)\s{3,}per 100 (?:ml|g)', ln)
                if m and m.group(1).strip() not in ('Innehåll',):
                    flav = m.group(1).strip()
                    break
        basis, vals = parse_block(lines)
        blocks.append({'flavour': flav, 'basis': basis, 'values': vals, 'text': p})
    return blocks


if __name__ == '__main__':
    for f in sorted(glob.glob(sys.argv[1] + '/*.txt')):
        bl = parse_file(f)
        print(os.path.basename(f), [(b['flavour'], b['basis'], len(b['values'])) for b in bl])
