"""Bygger src/data/nutrition.json (sondnäring och kosttillägg) av tolkade produktblad.

Användning: python3 build_nutrition.py <utfil>
Kataloger: fk/ (Fresubin konsumentsajt), fks/ (Fresenius Kabi vårdsajt), nes/ (Nestlé Health Science),
nut/ (Nutricia vårdgivarsajt; pages.json = produktsidor med PDF-länkar).
"""
import json, os, re, sys, glob
from datetime import date
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
from parse_fk import parse_file
from parse_nes import parse_text
from parse_nut import parse_text as parse_nut
from details import details_for, IDDSI_NAMN
IDDSI_UK = json.load(open(os.path.join(HERE, 'iddsi_fk_uk.json')))

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


# Nutricia: material som inte är produktblad
NUT_SKIP = re.compile(r'(?i)produktguide|recept|beställningsmall|besta_cc|hur-fungerar|broschyr|patient|guide|sortiment')
# Uppenbara fel i Nutricias blad, rättade (ursprungsvärde i kommentaren)
NUT_FIX = {
    # Bladet anger fett 14,8 g/100 g; portionsvärdet 0,36 g per 30 g och 4 E% ger ca 1,2 g/100 g
    'Produktblad-PKU-GMPro-Delight-15-20-2026': {'FAT': 1.2},
}


def nut_name_from_stem(stem):
    n = re.sub(r'^(Produktblad|Produktfaktablad|Produkblad)[-_ ]*', '', stem)
    n = re.sub(r'[-_ ]*(20\d\d)(-\d+)?.*$|[-_]\d$|[-_]u?ppdaterad$', '', n)
    n = n.replace('_', ' ').replace('-', ' ').replace('MultiFibre', 'Multi Fibre')
    return re.sub(r'\s+', ' ', n).strip()


def nut_products():
    pages = json.load(open(os.path.join(HERE, 'nut', 'pages.json')))
    out, seen_stem, seen_name = [], set(), set()
    for pg in pages:
        found = []
        for u in pg['pdfs']:
            stem = re.sub(r'\.pdf$', '', u.rsplit('/', 1)[-1])
            path = os.path.join(HERE, 'nut', stem + '.txt')
            if NUT_SKIP.search(stem) or stem in seen_stem or not os.path.exists(path):
                continue
            txt = open(path, encoding='utf-8', errors='replace').read()
            basis, v = parse_nut(txt)
            v.update(NUT_FIX.get(stem, {}))
            if not check(v):
                print('Nutricia, tolkades inte:', stem)
                continue
            # Pulver: första kolumnen är per 100 g pulver även om bladet också nämner per 100 ml
            if basis == 'ml' and v['ENERC|kcal'] > 250 and re.search(r'pulver', txt, re.I):
                basis = 'g'
            seen_stem.add(stem)
            found.append((stem, u, txt, basis, v))
        for stem, u, txt, basis, v in found:
            name = clean(pg['title']) if len(found) == 1 else nut_name_from_stem(stem)
            # Kombinerade blad (pulver + LQ/Liquid): första kolumnen gäller pulvret, så namnet tas ur bladets rubrik
            if basis == 'g' and re.search(r'\bLQ\b|Liquid', name):
                name = clean(next(l for l in txt.split('\n') if l.strip()))
            key = ' '.join(sorted(re.findall(r'\w+', name.lower())))  # "PKU Anamix Junior" = "Anamix Junior PKU"
            if key in seen_name:
                continue
            seen_name.add(key)
            out.append(dict(manufacturer='Nutricia', product=name, flavour=None, name=name,
                            basis=basis, category=None, url=u, values=v, _txt=txt))
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


# Sondnäring (allt annat räknas som kosttillägg: näringsdrycker, puddingar, berikning, förtjockning m.m.)
SOND = re.compile(r'^(Nutrison|Nutrini(?!drink)|NutriniMax|Infatrini Peptisorb Sond|NutriChef|Compleat (Mix|Mix Protein|paediatric Mix)$|Isosource|MiniMax Barnsondnäring|Novasource|Peptamen)')


def category(p):
    if p.get('category') == 'Sondnäring' or SOND.match(p['product']):
        return 'Sondnäring'
    return 'Kosttillägg'


def main(dst):
    prods = fk_products() + nes_products() + nut_products()
    for p in prods:
        p['category'] = category(p)
    for p in prods:
        p['values']['SUGFR'] = free_sugar(p, p.get('_txt', ''))
        p['details'] = details_for(p.get('_block') or p.get('_txt', ''), p.get('_txt', ''), wide=p['manufacturer'] == 'Nutricia')
        # IDDSI från Fresenius Kabi UK:s tabell när det svenska bladet saknar nivå
        uk = IDDSI_UK['produkter'].get(p['product'])
        if p['manufacturer'] == 'Fresenius Kabi' and uk and p.get('flavour') in uk and not p['details'].get('iddsi'):
            own = uk[p['flavour']]
            nums = sorted({int(x) for v in own for x in re.findall(r'\d', v)})
            p['details']['iddsi'] = {
                'nivå': str(nums[0]) if len(nums) == 1 else f'{nums[0]}–{nums[-1]}',
                **({'namn': IDDSI_NAMN[nums[0]]} if len(nums) == 1 else {}),
                **({'not': 'Nivån beror på temperaturen (kylskåpskall/rumstempererad).'} if own[0] != own[1] else {}),
                'tabell': [{'produkt': f, 'kylskåpskall': v[0], 'rumstempererad': v[1]} for f, v in uk.items()],
                'källa': IDDSI_UK['källa'], 'källa_url': IDDSI_UK['url'], 'källa_not': IDDSI_UK['not'],
            }
        eg = p['details'].setdefault('egenskaper', [])
        # Diabetesanpassade produkter (enligt tillverkarens produktnamn/indikation)
        if re.match(r'(Diben|Diasip|Nutrison advanced Diason|Diason)', p['product'], re.I) and 'diabetesanpassad' not in eg:
            eg.append('diabetesanpassad')
        # Extra fiber: minst 1,5 g/100 ml (vätska) eller 3 g/100 g (pulver), eller fiber nämns på bladet
        fib = p['values'].get('FIBT') or 0
        if fib >= (1.5 if p['basis'] == 'ml' else 3) and 'fibrer' not in eg and 'fiberfri' not in eg:
            eg.append('fibrer')
        if 'fibrer' in eg and fib < 0.5:
            eg.remove('fibrer')
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
        'source': 'Tillverkarnas produktblad (Fresenius Kabi, Nestlé Health Science, Nutricia), hämtade '
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
                   'Fullständig text finns i scripts/nutrition/{fk,fks,nes,nut}/*.txt.',
           'fetched': date.today().isoformat(),
           'products': [{'id': i, 'name': p['name'], 'product': p['product'], 'flavour': p.get('flavour'), 'manufacturer': p['manufacturer'],
                         'category': p.get('category'), 'basis': p['basis'], 'url': p['url'],
                         **({'laktos': p['values']['LACT']} if p['values'].get('LACT') is not None else {}), **p.get('details', {})}
                        for i, p in enumerate(prods, start=1)]}
    json.dump(det, open(os.path.join(os.path.dirname(dst), 'nutrition-details.json'), 'w'), ensure_ascii=False, indent=1)
    by = {}
    for p in prods:
        by[p['manufacturer']] = by.get(p['manufacturer'], 0) + 1
    print(len(prods), 'produkter/smaker', by, 'basis g:', sum(p['basis'] == 'g' for p in prods))


if __name__ == '__main__':
    main(sys.argv[1])
