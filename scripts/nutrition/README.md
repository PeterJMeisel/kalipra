# Nutritionsprodukter (sondnäring, kosttillägg)

`src/data/nutrition.json` byggs av tillverkarnas offentliga produktblad (PDF), listade i `sources.json`.

1. Ladda ner PDF:erna till `fk/`, `fks/`, `nes/` (namn = nyckeln i sources.json) och kör `pdftotext -layout` på varje.
2. `python3 build_nutrition.py ../../src/data/nutrition.json`

Värden anges per 100 ml eller 100 g (`products[i].basis`). Varje produkt kontrolleras mot
energi = 4·protein + 9·fett + 4·kolhydrat + 2·fiber (±5 %).

Nutricias produktblad kräver inloggning för vårdpersonal och ingår inte ännu.
Fritt socker (SUGFR) = sockerarter minus laktos ("varav laktos" i bladet; laktosfria produkter = 0).
