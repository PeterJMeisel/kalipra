"""Bygger src/data/nutrition.json (sondnäring och kosttillägg) av tolkade produktblad.

Användning: python3 build_nutrition.py <utfil>
Kataloger: fk/ (Fresubin konsumentsajt), fks/ (Fresenius Kabi vårdsajt), nes/ (Nestlé Health Science),
nut/ (Nutricia vårdgivarsajt; pages.json = produktsidor med PDF-länkar).
"""
import json, os, re, sys, glob, urllib.parse
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
    calc = (v.get('PROT') or 0) * 4 + (v.get('FAT') or 0) * 9 + (v.get('CHO') or 0) * 4 + (v.get('FIBT') or 0) * 2
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
NUT_SKIP = re.compile(r'(?i)produktguide|recept|beställningsmall|besta_cc|hur-fungerar|broschyr|patient|guide|sortiment|infoblad|tillredning|hygienrek|goda_råd|L-märkta|enkla-små|anvandartips|onepager')
# Blad som inte går igenom energikontrollen men tas med ändå; värden som inte går att lita på tas bort
# och produktbladet anger att uppgifter saknas (se tillverkarens blad).
NUT_INCOMPLETE = {
    'HYPER-LYS-Anamix-Infant': {},
    'Produktblad-Loprofin-aggersattning-2026': {},
}
# Uppenbara fel i Nutricias blad, rättade (ursprungsvärde i kommentaren)
NUT_FIX = {
    # Bladet anger fett 14,8 g/100 g; portionsvärdet 0,36 g per 30 g och 4 E% ger ca 1,2 g/100 g
    'Produktblad-PKU-GMPro-Delight-15-20-2026': {'FAT': 1.2},
    # Tabellens proteinrad (95 g) är summan av aminosyrorna; bladets text anger 79 g proteinekvivalenter (4·79 + 4·4 = 332 kcal)
    'Produktblad-XLYS-TRY-Glutaridon-–-GA1-2026': {'PROT': 79.0},
    # Bladets fiberrad anger 0 g; lösliga 46 g + olösliga 30 g = 76 g (stämmer med 220 kcal)
    'Produktblad-Stimulance-2026': {'FIBT': 76.0},
    # kcal-värdet hamnar utanför tabellen i textutdraget; värdet står i bladet
    'Produktblad-D-Mannose-1': {'ENERC|kcal': 398.0},
    'Produktblad-GTO-Oil-Lorenzos-Oil_k2': {'ENERC|kcal': 807.0},  # Lorenzo's Oil-kolumnen
    # Svenska bladets energi (182 kcal/767 kJ) stämmer inte och protein saknas; värden från Nutricia UK (övriga värden lika)
    'Produktblad-Loprofin-Frukostflingor-Loops-2026': {'ENERC|kcal': 359.0, 'ENERC|kJ': 1502.0, 'PROT': 0.32},
}
# Värden som hämtats från annan källa än det svenska bladet: visas i produktbladet med hänvisning,
# och raderna i näringsdeklarationen ersätts/läggs till
NUT_OTHER_SOURCE = {
    'Produktblad-Loprofin-Frukostflingor-Loops-2026': {
        'källa': 'Nutricia UK – Loprofin Cereal Loops',
        'url': 'https://www.nutricia.co.uk/hcp/products/loprofin-cereal-loops/',
        'hämtad': '2026-11-17',
        'not': 'Energi och protein är hämtade från Nutricia UK eftersom det svenska produktbladets energiuppgift '
               '(182 kcal) inte stämmer med näringsinnehållet. Övriga värden är desamma i båda källorna.',
        'rader': {'Energi (kJ)': ('kJ', '1502'), 'Energi': ('kcal', '359'), 'Protein': ('g', '0,32')},
    },
}
# Andra produkten i ett kombinerat blad (egen kolumn): stem -> (namn, värden, deklarationsrader)
NUT_SECOND_COLUMN = {
    'Produktblad-GTO-Oil-Lorenzos-Oil_k2': ('GTO Oil',
        {'ENERC|kcal': 819.0, 'ENERC|kJ': 3367.0, 'FAT': 91.0, 'FASAT': 3.8, 'FAMS': 83.4, 'FAPU': 3.8},
        {'Energi (kJ)': ('kJ', '3367'), 'Energi': ('kcal', '819'), 'Fett (100 E%)': ('g', '91'), 'mättat': ('g', '3,8'),
         'enkelomättat': ('g', '83,4'), 'fleromättat': ('g', '3,8'), 'C16:0/ Palmitinsyra': ('mg', '870'),
         'C17:0/ Margarinsyra': ('mg', '174'), 'C17:1/ Heptadecensyra': ('mg', '174'), 'C18:0/ Stearinsyra': ('mg', '2610'),
         'C18:1/ Oljesyra': ('mg', '79170'), 'C18:2/ Linolsyra': ('mg', '3480'), 'C18:3/ a-linolensyra': ('mg', '174'),
         'C20:1/ Gadoleinsyra': ('mg', '348')}),
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
            stem = re.sub(r'\.pdf$', '', urllib.parse.unquote(u.rsplit('/', 1)[-1]))
            path = os.path.join(HERE, 'nut', stem + '.txt')
            if NUT_SKIP.search(stem) or stem in seen_stem or not os.path.exists(path):
                continue
            txt = open(path, encoding='utf-8', errors='replace').read()
            basis, v = parse_nut(txt)
            v.update(NUT_FIX.get(stem, {}))
            # Ibland hamnar kJ-värdet på kcal-raden i textutdraget
            if not check(v) and v.get('ENERC|kcal') and check({**v, 'ENERC|kcal': v['ENERC|kcal'] / 4.184}):
                v['ENERC|kJ'], v['ENERC|kcal'] = v['ENERC|kcal'], round(v['ENERC|kcal'] / 4.184)
            incomplete = False
            if not check(v) and stem in NUT_INCOMPLETE:
                if not v.get('ENERC|kcal') and v.get('ENERC|kJ'):
                    v['ENERC|kcal'] = round(v['ENERC|kJ'] / 4.184)
                v.update(NUT_INCOMPLETE[stem])
                incomplete = True
            elif not check(v):
                print('Nutricia, tolkades inte:', stem)
                continue
            # Pulver: första kolumnen är per 100 g pulver även om bladet också nämner per 100 ml
            if basis == 'ml' and v['ENERC|kcal'] > 250 and re.search(r'pulver', txt, re.I):
                basis = 'g'
            seen_stem.add(stem)
            found.append((stem, u, txt, basis, v, incomplete))
        for stem, u, txt, basis, v, incomplete in found:
            name = clean(pg['title']) if len(found) == 1 else nut_name_from_stem(stem)
            # Kombinerade blad (pulver + LQ/Liquid): första kolumnen gäller pulvret, så namnet tas ur bladets rubrik
            if basis == 'g' and re.search(r'\bLQ\b|Liquid', name):
                head = next((clean(l) for l in txt.split('\n') if l.strip() and not re.search(r'\b20\d\d\b|^\d|^METABOLICS$', l.strip())), '')
                name = head if 3 < len(head) < 50 else name
            key = ' '.join(sorted(re.findall(r'\w+', name.lower())))  # "PKU Anamix Junior" = "Anamix Junior PKU"
            if key in seen_name:
                continue
            seen_name.add(key)
            out.append(dict(manufacturer='Nutricia', product=name, flavour=None, name=name,
                            basis=basis, category=None, url=u, values=v, _txt=txt, incomplete=incomplete, _stem=stem))
            if stem in NUT_SECOND_COLUMN:
                nm2, v2, _ = NUT_SECOND_COLUMN[stem]
                seen_name.add(' '.join(sorted(re.findall(r'\w+', nm2.lower()))))
                out.append(dict(manufacturer='Nutricia', product=nm2, flavour=None, name=nm2, basis=basis, category=None,
                                url=u, values=dict(v2), _txt=txt, incomplete=False, _stem=stem, _second=True))
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
    if re.match(r'(?i)Fresubin RENAL', p['product']):
        return 'Kosttillägg'  # näringsdryck som även kan ges som sondnäring
    if p.get('category') == 'Sondnäring' or SOND.match(p['product']) or re.match(r'(?i)nutrison', p['product']):
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
                'källa_utgivare': IDDSI_UK['utgivare'], 'källa_hämtad': IDDSI_UK['hämtad'],
            }
        eg = p['details'].setdefault('egenskaper', [])
        # Diabetesanpassade produkter (enligt tillverkarens produktnamn/indikation)
        if re.search(r'\b(Diben|Diasip|Diason)\b', p['product'], re.I) and 'diabetesanpassad' not in eg:
            eg.append('diabetesanpassad')
        # Njursjukdom utan dialys (lågt protein och sänkta elektrolyter enligt tillverkaren)
        if re.search(r'\b(Renalive LP|Renilon 4\.0|Fresubin Renal)\b', p['product'], re.I):
            eg.append('anpassad för njursjukdom utan dialys')
        if re.search(r'\bRenilon 7\.5\b', p['product'], re.I):
            eg.append('anpassad för njursjukdom med dialys')
        # Extra fiber: minst 1,5 g/100 ml (vätska) eller 3 g/100 g (pulver), eller fiber nämns på bladet
        fib = p['values'].get('FIBT') or 0
        if fib >= (1.5 if p['basis'] == 'ml' else 3) and 'fibrer' not in eg and 'fiberfri' not in eg:
            eg.append('fibrer')
        if 'fibrer' in eg and fib < 0.5:
            eg.remove('fibrer')
        if p.get('incomplete'):
            p['details']['ofullständig'] = True
        stem = p.get('_stem')
        if p.get('_second'):
            p['details']['näringsdeklaration'] = {k: {'enhet': e, 'värde': x} for k, (e, x) in NUT_SECOND_COLUMN[stem][2].items()}
        elif stem in NUT_OTHER_SOURCE:
            src = NUT_OTHER_SOURCE[stem]
            nd = p['details'].setdefault('näringsdeklaration', {})
            for k, (e, x) in src['rader'].items():
                if k in nd or 'Fiber' not in nd:
                    nd[k] = {'enhet': e, 'värde': x}
                else:  # ny rad läggs efter fiberraden
                    items = list(nd.items())
                    i = [a for a, _ in items].index('Fiber') + 1
                    nd = dict(items[:i] + [(k, {'enhet': e, 'värde': x})] + items[i:])
            p['details']['näringsdeklaration'] = nd
            p['details']['annan_källa'] = {k: src[k] for k in ('källa', 'url', 'hämtad', 'not')}
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
