// Livsmedelsverkets livsmedel som får Finelis mått (foodaddunit.csv, release 20, CC BY 4.0) via ett
// motsvarande Fineli-livsmedel. Bara grupper med liten risk (godkänt av Peter 2026-11-21): frukt, bär,
// grönsaker, ägg, mjöl/gryn/kli, gröt och välling, nötter och frön, torkade baljväxter, torkad frukt.
// Samma tillstånd (rå/kokt/torkad) i båda. Styck enligt förpackning tas aldrig med (finska förpackningar).
// noSt: frysvaror utan styckmått. Nyckel: Livsmedelsverkets nummer → [Fineli-nummer, noSt].
export const LMV_FINELI: Record<number, [number, boolean?]> = {
  286: [313, true], // Grönsaksblandning m. morot palsternacka purjolök rotselleri frysvara ← Grönsaksblandning, djupfryst, sopprötter, morot, kålrot, rotselleri, purjolök
  287: [310], // Jordärtskocka ← Jordärtskocka
  288: [303], // Kålrot ← Kålrot
  289: [300], // Morot ← Morot
  290: [309], // Palsternacka ← Palsternacka
  291: [11589], // Pepparrot ← Pepparrot
  292: [311], // Rotselleri ← Rotselleri
  293: [308], // Rädisa ← Rädisa
  294: [305], // Rödbeta ← Rödbeta
  295: [34235], // Rättika ← Rättika
  298: [312], // Svartrot ← Svartrot
  300: [29229], // Morot konserv. u. lag ← Morot, kokt utan salt
  305: [3341], // Morot kokt m. salt ← Morot, kokt med salt
  316: [30382], // Rödbeta kokt u. salt ← Rödbeta, kokt utan salt
  320: [11057], // Avokado ← Avokado, skalad, kärnfri
  322: [322], // Blomkål ← Blomkål
  323: [322, true], // Blomkål frysvara ← Blomkål
  325: [324], // Broccoli ← Broccoli
  326: [324, true], // Broccoli frysvara ← Broccoli
  327: [327], // Brysselkål ← Rosenkål, brysselkål
  331: [372], // Gröna bönor ← Bönor, gröna brytbönor, färska
  332: [372, true], // Gröna bönor frysvara ← Bönor, gröna brytbönor, färska
  336: [30914], // Fänkål ← Fänkål
  337: [326], // Grönkål ← Grönkål, bladkål
  338: [326, true], // Grönkål frysvara ← Grönkål, bladkål
  339: [346], // Gurka ← Gurka
  340: [331], // Isbergssallat ← Isbergssallat, frasig, amerikansk sallat
  342: [32456], // Kronärtskocka ← Kronärtskocka
  343: [329], // Kålrabbi ← Kålrabbi
  344: [335], // Lök gul ← Lök, gul lök
  347: [363], // Majskorn frysvara ← Majskorn
  348: [360], // Mangold ← Mangold
  350: [387], // Paprika grön ← Paprika, grön
  351: [386], // Paprika röd ← Paprika, röd
  352: [333], // Persilja blad ← Persilja
  353: [350], // Pumpa ← Pumpa
  354: [337], // Purjolök ← Purjolök
  355: [321], // Rödkål ← Rödkål
  359: [34244], // Sockerärtor ← Sockerärt, färsk
  361: [34228], // Spenat frysvara ← Spenat, djupfryst
  362: [389], // Squash ← Squash, zucchini
  364: [352], // Tomat ← Tomat
  366: [364], // Trädgårdskrasse ← Trädgårdskrasse
  370: [320], // Vitkål ← Vitkål, huvudkål
  371: [393], // Vitlök ← Vitlök
  372: [362], // Aubergine ← Äggplanta, aubergine
  374: [370, true], // Gröna ärtor frysvara ← Ärter, gröna, färska
  377: [369], // Dill färsk ← Dill, färsk
  378: [392], // Gräslök ← Gräslök
  379: [11134], // Basilika färsk ← Basilika, färsk
  380: [31557], // Chilipeppar färsk ← Chili, grön, färsk
  381: [388], // Paprika gul ← Paprika, gul
  382: [387, true], // Paprika grön röd frysvara ← Paprika, grön
  385: [335, true], // Lök gul frysvara ← Lök, gul lök
  386: [32156], // Grönsaksblandning m. ärtor bönor majs morot typ amerikansk frysvara ← Grönsaksblandning, ärter-majs-morot, djupfryst
  387: [356], // Grönsaksblandning m. ärtor bönor morot blomkål typ sommargrönsaker frysvara ← Grönsaksblandning, morot, blomkål, ärter, bönor
  388: [32156], // Grönsaksblandning m. ärtor morot frysvara ← Grönsaksblandning, ärter-majs-morot, djupfryst
  389: [396], // Grönsaksblandning m. ärtor majs paprika frysvara ← Grönsaksblandning, djupfryst, ärter-majs-paprika
  392: [355], // Paprika grön gul röd ← Paprika, medelvärde
  395: [31547], // Gröna bönor konserv. u. lag ← Bönor, gröna bönor, kokta utan salt
  400: [3040], // Majskorn konserv. u. lag ← Majskorn, kokt utan salt
  434: [3346], // Blomkål kokt m. salt ← Blomkål, kokt med salt
  446: [3230], // Lök stekt m. olja el. flytande margarin salt ← Lök, stekt
  448: [32146], // Lök gul kokt m. salt ← Lök, kokt utan salt
  452: [32870], // Purjolök kokt m. salt ← Purjolök, kokt utan salt
  492: [33583], // Kronärtskocka kokt ← Kronärtskocka, kokt
  520: [31555], // Granatäpple ← Granatäpple, skalat
  522: [31552], // Guava ← Guava
  523: [448], // Hallon ← Hallon
  525: [449], // Hjortron ← Hjortron
  526: [447], // Jordgubbar ← Jordgubbe
  546: [11203], // Honungsmelon ← Honungsmelon, skalad
  547: [477], // Nätmelon ← Melon, nätmelon, cantaloupe, skalad
  549: [11055], // Vattenmelon ← Vattenmelon, skalad
  550: [11056], // Ananas ← Ananas, skalad
  551: [11045], // Apelsin ← Apelsin, skalad
  552: [11054], // Aprikos ← Aprikos, medelvärde, kärnfri
  553: [11049], // Banan ← Banan, skalad
  555: [442], // Blåbär ← Blåbär, skogsblåbär
  556: [442, true], // Blåbär frysvara ← Blåbär, skogsblåbär
  559: [11048], // Citron ← Citron, skalad
  560: [11046], // Småcitrus clementin mandarin tangerin satsumas ← Mandarin, skalad
  565: [11050], // Kiwi grön ← Kiwi, skalad
  566: [446], // Krusbär ← Krusbär
  570: [11052], // Surkörsbär ← Körsbär, kärnfri
  571: [11052], // Sötkörsbär ← Körsbär, kärnfri
  573: [440], // Lingon ← Lingon
  574: [34361], // Mango ← Mango skalad
  576: [11051], // Nektarin ← Persika/nektarin, skalad, kärnfri
  577: [34694], // Papaya ← Papaya, skalad
  579: [34680], // Passionsfrukt ← Passionsfrukt
  580: [11051], // Persika ← Persika/nektarin, skalad, kärnfri
  581: [33038], // Sharon ← Sharon, kaki, persimon
  582: [11053], // Plommon ← Plommon, kärnfri
  583: [11062], // Päron ← Päron, skalat
  584: [441], // Tranbär ← Tranbär
  585: [445], // Vinbär röda ← Rött vinbär
  586: [444], // Vinbär svarta ← Svart vinbär
  587: [423], // Vindruvor ← Vindruvor, medelvärde, kärnfria, gröna/mörka
  588: [28942], // Äpple m. skal ← Äpple, utländsk, med skal
  589: [11061], // Äpple u. skal ← Äpple, utländskt, skalat
  590: [448, true], // Hallon frysvara ← Hallon
  593: [447, true], // Jordgubbar frysvara ← Jordgubbe
  597: [448, true], // Hallon blåbär frysvara ← Hallon
  599: [409], // Aprikos torkad ← Aprikos, torkad
  604: [33070], // Fikon torkade ← Fikon, torkad
  608: [412], // Persika torkad ← Persika, torkad
  610: [428], // Russin ← Russin
  611: [401], // Äpple torkat ← Äpple, torkat
  612: [427], // Frukt torkad ← Blandad frukt, torkad
  613: [33060], // Papaya torkad ← Papaya, torkad
  654: [1568], // Risgrynsgröt lättmjölk fett ca 1% ← Risgrynsgröt, mjölk, salt
  655: [1568], // Risgrynsgröt ← Risgrynsgröt, mjölk, salt
  675: [1545], // Bovetegröt m. russin ← Bovetegröt, mjölk, salt
  676: [1266], // Grahamsgröt ← Grahamgröt, vatten, salt
  677: [1514], // Havregrynsgröt fullkorn ← Havregrynsgröt, lättmjölk, salt
  681: [1501], // Kornmjölsgröt ← Kornmjölsgröt, vatten, salt
  682: [1277], // Mannagrynsgröt ← Mannagrynsgröt, mjölk, salt
  683: [1032], // Kruskagröt fullkorn m. havregryn vetekli russin ← Kruskagröt, vatten, russin, salt
  695: [1512], // Havrevälling hemlagad ← Havrevälling, mjölk, salt
  696: [1276], // Mannagrynsvälling hemlagad ← Mannagrynsvälling, mjölk, salt
  704: [170], // Havrekli ← Kli, havrekli
  705: [151], // Korngryn ångprep. fullkorn ← Korngryn
  707: [175], // Vetekross ångprep. fullkorn ← Kross, vetekross av fullkorn
  708: [115], // Vetegroddar ← Vetegroddar
  709: [116], // Vetekli ← Kli, vetekli
  825: [161], // Bovete hela el. krossade korn ← Mjöl, bovetegryn/-mjöl
  827: [160], // Hirs hela el. krossade korn fullkorn ← Mjöl, hirsgryn/-mjöl
  828: [112], // Mannagryn ← Mannagryn
  881: [31218], // Kikärtor torkade ← Kikärter, torkade
  884: [399], // Linser torkade ← Linser, gröna/bruna, torkade
  887: [391], // Sojabönor torkade ← Sojabönor, torkade
  891: [371], // Gröna el. gula ärtor torkade ← Ärter, gröna, torkade
  1225: [858], // Ägg rått ← Ägg, utan skal
  1226: [851], // Äggula rå ← Äggula, 34 % av äggmassan
  1227: [852], // Äggvita rå ← Äggvita, 66 % av äggmassan
  1233: [8500], // Ägg stekt ← Ägg, stekt
  1557: [11086], // Cashewnötter rostade u. salt ← Nöt, cashew-nöt
  1558: [375], // Hasselnötter ← Nöt, hasselnöt
  1560: [378], // Jordnötter torkade ← Nöt, jordnöt
  1561: [378], // Jordnötter rostade ← Nöt, jordnöt
  1563: [377], // Kastanjer ← Kastanjer
  1564: [382], // Kokosflingor ← Kokosflingor
  1567: [30991], // Linfrö hela ← Linfrön, hela
  1568: [32464], // Paranötter ← Nött, paranöt
  1569: [33095], // Pekannötter ← Nöt, pecannöt
  1571: [31211], // Pumpafrö ← Pumpafrön
  1572: [385], // Sesamfrö m. skal ← Sesamfrön, med skal
  1573: [34245], // Sesamfrö u. skal ← Sesamfrön, vit, utan skal
  1574: [11212], // Solrosfrö ← Solrosfrön
  1576: [376], // Valnötter ← Nöt, valnöt
  1809: [472], // Äppelmos ← Äppelmos, osötat
  1810: [472], // Äppelmos lättsockrad ← Äppelmos, osötat
  1811: [472], // Äppelmos osötad el. sötningsm. ← Äppelmos, osötat
  1933: [29822], // Majsmjöl gult u. groddar ← Mjöl, majsmjöl, grovt, polentamjöl
  1934: [100], // Rågmjöl fullkorn ← Mjöl, rågmjöl, fullkornsmjöl
  1935: [28905], // Vetemjöl fullkorn grahamsmjöl ← Mjöl, fullkornsvetemjöl
  2123: [1514], // Havregrynsgröt fullkorn fiberhavregryn ← Havregrynsgröt, lättmjölk, salt
  2124: [30161], // Havregrynsgröt kokt m. mjölk ← Havregrynsgröt, fettfri mjölk, salt
  2162: [29510], // Palsternacka kokt m. salt ← Palsternacka, kokt utan salt
  2205: [8513], // Ägg kokt ← Ägg, kokt
  2269: [33023], // Ingefära färsk ← Ingefära, rot, rå
  2559: [34233], // Romansallat ← Romansallat
  2608: [3000], // Morot stekt el. wokad ← Morot, stekt
  2610: [34466], // Paprika stekt el. wokad ← Paprika, ugnstekt
  2612: [34518], // Purjolök stekt el. wokad ← Purjolök, stekt
  2617: [3200], // Kål stekt el. wokad ← Kål, stekt
  3071: [30968], // Pinjefrö ← Pinjefrö
  3139: [34872], // Nötter blandade rostade m. salt ← Nötter, blandning, utan salt, rostade
  3258: [33568], // Nötter blandade m. frukt bär ← Nötter och torkad frukt, blandning
  3522: [11505], // Bananchips ← Bananchips, torkad banan
  3759: [448], // Hallon importerade ← Hallon
  3822: [31225], // Röda linser torkade kokta m. salt ← Linser, röda, kokta
  3840: [858], // Ägg rått eko. ← Ägg, utan skal
  3841: [851], // Äggula rå eko. ← Äggula, 34 % av äggmassan
  4134: [34662], // Ägg stekt eko. ← Ägg, ekologisk, stekt
  4135: [8513], // Ägg kokt eko. ← Ägg, kokt
  4225: [11056, true], // Ananas frysvara ← Ananas, skalad
  4456: [455], // Havtorn ← Havtorn, finnbär
  4939: [3343], // Broccoli kokt u. salt frysvara ← Broccoli, kokt utan salt
  4941: [33456], // Spenat färsk ← Spenat
  4947: [34234], // Lök röd ← Rödlök
  5135: [34361, true], // Mango frysvara ← Mango skalad
  5861: [32729], // Sparris grön kokt m. salt ← Sparris, kokt utan salt
  5862: [3009], // Kålrot kokt ← Kålrot, kokt
  5863: [3349], // Brysselkål kokt ← Rosenkål, brysselkål, kokt med salt
  5864: [29511], // Rotselleri kokt ← Rotselleri, kokt utan salt
  5869: [28941], // Äpple Aroma rött ← Äpple, inhemsk, med skal
  5870: [28941], // Äpple Ingrid Marie rött ← Äpple, inhemsk, med skal
  5871: [28941], // Äpple Frida ← Äpple, inhemsk, med skal
  5872: [28942], // Äpple Golden delicious Granny Smith grönt ← Äpple, utländsk, med skal
  5975: [11057, true], // Avokado frysvara ← Avokado, skalad, kärnfri
  6157: [34847], // Chiafrö ← Chiafrön
  6159: [35220], // Hampafrö u. skal ← Hampfrö, utan skal
  6160: [35221], // Vallmofrö ← Vallmofrön
  6333: [423], // Vindruvor gröna ← Vindruvor, medelvärde, kärnfria, gröna/mörka
  6334: [423], // Vindruvor röda ← Vindruvor, medelvärde, kärnfria, gröna/mörka
  6349: [3230], // Lök stekt m. flytande matfett ← Lök, stekt
  6420: [34678], // Grönsaker ugnsstekta ← Grönsaker, ugnstekt, salt, olja
  6442: [34466], // Paprika grillad ← Paprika, ugnstekt
  6480: [152], // Kornflingor ångprep. fullkorn ← Kornflingor
  6481: [103], // Rågflingor ångprep. fullkorn ← Rågflingor
  6482: [114], // Veteflingor ångprep. fullkorn ← Veteflingor
  6678: [11050], // Kiwi gul ← Kiwi, skalad
  6806: [337, true], // Purjolök frysvara ← Purjolök
  6865: [31544], // Mjölblandning ljus glutenfri ← Mjöl, mjölblandning, ljus, naturligt glutenfri
  6994: [33065], // Mango torkad ← Mango, torkad
  7024: [32895], // Macadamianötter ← Nöt, macadamia nöt
  7042: [35596], // Blåbär amerikanska ← Amerikanska blåbär
  7047: [35591], // Odon ← Odon
  7048: [457], // Rönnbär ← Rönnbär
  7052: [29237], // Rågkli ← Kli, rågkli
  7053: [34236], // Ärtskott ← Ärtskott
  7182: [3347], // Broccoli kokt m. salt frysvara ← Broccoli, kokt med salt
  7193: [34238], // Koriander blad ← Koriander, färsk
  7267: [852], // Äggvita rå eko. ← Äggvita, 66 % av äggmassan
}
