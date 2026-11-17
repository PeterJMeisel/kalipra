"""Bygger src/data/nutrition.json (sondnäring och kosttillägg) av tolkade produktblad.

Användning: python3 build_nutrition.py <utfil>
Kataloger: fk/ (Fresubin konsumentsajt), fks/ (Fresenius Kabi vårdsajt), nes/ (Nestlé Health Science).
"""
import json, os, re, sys, glob
from datetime import date
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
from parse_fk import parse_file
from parse_nes import parse_text
from details import details_for

KEYS = ['ENERC|kcal', 'ENERC|kJ', 'PROT', 'FAT', 'CHO', 'FIBT', 'SUGAR', 'FASAT', 'FAMS', 'FAPU',
        'ALC', 'NACL', 'NA', 'VITA', 'VITD', 'VITE', 'VITC', 'THIACLHCL', 'RIBF', 'NIAEQ', 'VITB6',
        'FOL', 'VITB12', 'CA', 'FE', 'ZN', 'SE', 'P', 'MG', 'K', 'ID', 'SUGFR', 'WATER']

# Nestlés kombinerade blad: andra värdet (efter /) gäller fibervarianten
COMBINED = {
    'isosource-energy-energy-fibre': ['Isosource Energy', 'Isosource Energy Fibre'],
    'isosource-protein-protein-fibre': ['Isosource Protein', 'Isosource Protein Fibre'],
    'isosource-standard-standard-fibre': ['Isosource Standard', 'Isosource Standard Fibre'],
}
CATEGORY_FKS = 'Sondnäring'


def clean(t):
    t = t.replace('®', '').replace('™', '').replace('­', '')
    return re.sub(r'\s+', ' ', t).strip()


def check(v):
    kcal = v.get('ENERC|kcal')
    if not kcal:
        return False
    calc = v.get('PROT', 0) * 4 + v.get('FAT', 0) * 9 + v.get('CHO', 0) * 4 + v.get('FIBT', 0) * 2
    return abs(calc - kcal) / kcal < 0.05


def fk_products():
    out, seen = [], set()
    for folder, cat in (('fks', CATEGORY_FKS), ('fk', None)):
        meta = json.load(open(os.path.join(HERE, folder, 'meta.json')))
        for slug, m in meta.items():
            path = os.path.join(HERE, folder, slug + '.txt')
            if not os.path.exists(path):
                continue
            title = clean(m['title'])
            for b in parse_file(path):
                name = title + (f" – {clean(b['flavour'])}" if b.get('flavour') else '')
                if name.lower() in seen:
                    continue
                seen.add(name.lower())
                out.append(dict(manufacturer='Fresenius Kabi', product=title, flavour=b.get('flavour'),
                                name=name, basis=b['basis'] or 'ml', category=cat, url=m['url'],
                                values=b['values'], _txt=open(path, encoding='utf-8', errors='replace').read(),
                                _block=b.get('text', '')))
    return out


def nes_products():
    out = []
    meta = json.load(open(os.path.join(HERE, 'nes', 'meta.json')))
    for slug, m in meta.items():
        if 'produktguide' in slug or 'produkt-versikt' in slug:
            continue
        txt = open(os.path.join(HERE, 'nes', slug + '.txt'), encoding='utf-8', errors='replace').read()
        names = COMBINED.get(slug, [clean(m['title'])])
        basis, res, prepared = parse_text(txt, len(names))
        for i, nm in enumerate(names):
            out.append(dict(manufacturer='Nestlé Health Science', product=nm, flavour=None, name=nm,
                            basis=basis, category=None, url=m['url'], values=res[i],
                            prepared=prepared or None, _txt=txt))
    return out


def free_sugar(p, txt):
    """Fritt socker = sockerarter minus laktos (laktos från mjölkråvara räknas inte som fritt socker enligt NNR).
    Laktos tas från näringsdeklarationen ("varav laktos"); saknas raden men bladet säger laktosfri räknas laktos = 0.
    Övriga sockerarter i nutritionsprodukter är tillsatta (sackaros, glukossirap m.m.) och räknas som fritt socker."""
    v = p['values']
    sugar = v.get('SUGAR')
    if sugar is None:
        return None
    lact = v.get('LACT')
    if lact is None:
        if re.search(r'laktosfri|laktos- och glutenfri|fri från laktos', txt, re.I) and not re.search(r'med laktos', txt, re.I):
            lact = 0.0
        else:
            return None
    return round(max(0.0, sugar - lact), 2)


def main(dst):
    prods = fk_products() + nes_products()
    for p in prods:
        p['values']['SUGFR'] = free_sugar(p, p.get('_txt', ''))
        p['details'] = details_for(p.get('_block') or p.get('_txt', ''), p.get('_txt', ''))
        w = p['details'].get('vatten_per_100')
        if w is not None and p['basis'] == 'ml':
            p['values']['WATER'] = w
    bad = [p['name'] for p in prods if not check(p['values'])]
    if bad:
        print('Kontrollera:', bad)
    foods, meta = [], []
    for i, p in enumerate(prods, start=1):
        v = p['values']
        foods.append([i, p['name'], 1, [v.get(k) for k in KEYS]])
        meta.append({k: p[k] for k in ('manufacturer', 'product', 'flavour', 'basis', 'category', 'url')}
                    | ({'lactose': v['LACT']} if v.get('LACT') is not None else {})

                    | ({'prepared': [p['prepared'].get(k) for k in KEYS]} if p.get('prepared') else {}))
    data = {
        'id': 'nutrition',
        'source': 'Tillverkarnas produktblad (Fresenius Kabi, Nestlé Health Science), hämtade '
                  + date.today().isoformat(),
        'fetched': date.today().isoformat(),
        'keys': KEYS,
        'units': {'ENERC|kcal': 'kcal', 'ENERC|kJ': 'kJ', 'VITA': 'RE/µg', 'NIAEQ': 'NE/mg'},
        'note': 'Värden per 100 ml eller 100 g enligt products[i].basis. Pulver: per 100 g pulver; '
                'products[i].prepared = per 100 ml tillredd när bladet anger det. '
                'SUGFR (fritt socker) = sockerarter minus laktos enligt produktbladet; products[i].lactose = laktos (g). '
                'WATER = vattenmängd enligt bladet. Övrig information ur bladen: nutrition-details.json.',
        'foods': foods,
        'products': meta,
    }
    json.dump(data, open(dst, 'w'), ensure_ascii=False, separators=(',', ':'))
    # Övrig information ur bladen i en egen fil (laddas inte in i appen ännu)
    det = {'note': 'Övrig information ur tillverkarnas produktblad, samma ordning/id som foods i nutrition.json. '
                   'Fullständig text finns i scripts/nutrition/{fk,fks,nes}/*.txt.',
           'fetched': date.today().isoformat(),
           'products': [{'id': i, 'name': p['name'], 'manufacturer': p['manufacturer'], 'url': p['url'], **p.get('details', {})}
                        for i, p in enumerate(prods, start=1)]}
    json.dump(det, open(os.path.join(os.path.dirname(dst), 'nutrition-details.json'), 'w'), ensure_ascii=False, indent=1)
    by = {}
    for p in prods:
        by[p['manufacturer']] = by.get(p['manufacturer'], 0) + 1
    print(len(prods), 'produkter/smaker', by, 'basis g:', sum(p['basis'] == 'g' for p in prods))


if __name__ == '__main__':
    main(sys.argv[1])
