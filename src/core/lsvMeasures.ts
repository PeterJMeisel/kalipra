// Livsmedelsverket, PM 2024 Volymvikter, viktförändringsfaktorer och avfall, tabell 1–13
// (lokal kopia i Kalipra-källdokument\Livsmedelsverket). Gram per enhet, ätbar del.
// Går före Finelis mått för samma enhet (prioritet: Livsmedelsverket först); övriga mått (Fineli, SPECS) finns kvar.
// Kopplat till Livsmedelsverkets livsmedel när PM:ets livsmedel är samma livsmedel i samma tillstånd.
// [enhet, gram, form] – form = hur livsmedlet var skuret/berett vid vägningen, eller vad ett styck är.
export type LsvM = ['st' | 'tsk' | 'msk' | 'dl', number, string?]
export const LSV: Record<number, LsvM[]> = {}
const add = (ids: number[], m: LsvM[]) => { for (const i of ids) LSV[i] = m }

// Tabell 1. Frukt och bär
add([612, 4026], [['tsk', 2, 'hackad'], ['msk', 7, 'hackad'], ['dl', 40, 'hackad']]) // Blandad frukt, torkad, hackad
add([601], [['st', 0.5, 'bär'], ['tsk', 4], ['msk', 10], ['dl', 64], ['dl', 55, 'hackade']]) // Blåbär, torkade
add([638], [['dl', 68, 'i bitar']]) // Fruktsallad, färsk, i bitar
add([5135], [['st', 4, 'bit'], ['msk', 13, 'i bitar'], ['dl', 82, 'i bitar']]) // Mango, frysvara, i bitar
add([6994], [['st', 3, 'bit'], ['dl', 47, 'i bitar'], ['tsk', 3, 'hackad'], ['msk', 8, 'hackad'], ['dl', 48, 'hackad']]) // Mango, torkad
add([579], [['st', 20, 'ätbar del'], ['tsk', 6], ['msk', 17], ['dl', 108]]) // Passionsfrukt, ätbar del
add([627, 628], [['st', 49, 'halva'], ['dl', 71]]) // Päronhalvor, konserverade
add([611], [['st', 1, 'skiva'], ['dl', 13, 'i skivor'], ['tsk', 1, 'hackat'], ['msk', 3, 'hackat'], ['dl', 20, 'hackat']]) // Äpple, torkat

// Tabell 2. Grönsaker, baljväxter, rotfrukter och svamp
add([324], [['msk', 11], ['dl', 63]]) // Bondbönor utan skal, kokta
add([4939, 7182], [['st', 20, 'bukett'], ['dl', 51, 'buketter'], ['dl', 48, 'hackad']]) // Broccoli, kokt
add([383], [['dl', 59]]) // Champinjoner, frysvara, skivade
add([487], [['tsk', 6, 'hackad'], ['msk', 18, 'hackad'], ['dl', 110, 'hackad']]) // Gurka, inlagd, hackad
add([385], [['tsk', 4, 'hackad'], ['msk', 10, 'hackad'], ['dl', 53, 'hackad']]) // Lök, frysvara, hackad
add([446, 6349], [['tsk', 5], ['msk', 12], ['dl', 70]]) // Lök, frysvara, stekt
add([4052], [['st', 2, 'blad'], ['dl', 7]]) // Mâchesallat
add([345, 495], [['st', 131, 'ätbar del']]) // Majskolv, ätbar del
add([347, 400], [['tsk', 4], ['msk', 11], ['dl', 69]]) // Majskorn, konserverade el. frysta
add([289], [['tsk', 3, 'finriven'], ['msk', 8, 'finriven'], ['dl', 41, 'finriven'], ['dl', 38, 'grovriven'], ['st', 2, 'skiva'], ['dl', 56, 'skivad']]) // Morot, rå
add([883], [['tsk', 3], ['msk', 9], ['dl', 60]]) // Mungbönor, kokta
add([2614], [['msk', 11], ['dl', 65]]) // Rödbetor, förkokta, stekta
add([2774], [['dl', 60]]) // Sommargrönsaker, kokta
add([420], [['st', 2], ['msk', 9], ['dl', 67]]) // Syltlök
add([411], [['st', 3, 'bit'], ['msk', 9, 'finhackade'], ['dl', 49, 'finhackade'], ['dl', 48, 'grovhackade']]) // Vaxbönor, kokta

// Tabell 3. Potatisprodukter och rätter
add([255], [['tsk', 3], ['msk', 10], ['dl', 59]]) // Krögarpytt, tillagad
add([231], [['tsk', 3, 'pressad'], ['msk', 8, 'pressad'], ['dl', 59, 'pressad']]) // Potatis, kokt, pressad
add([241], [['msk', 12, 'tärnad'], ['dl', 68, 'tärnad']]) // Potatis, råstekt, tärnad
add([242], [['tsk', 5, 'tärnad'], ['msk', 13, 'tärnad'], ['dl', 71, 'tärnad']]) // Potatis, stekt, tärnad

// Tabell 4. Bröd
add([171], [['st', 13, 'portionsbit']]) // Knäckebröd, rektangulärt portionsbröd
add([3819], [['st', 67]]) // Tekaka
add([3247], [['st', 1], ['msk', 3], ['dl', 18]]) // Krutonger
add([216], [['st', 10, 'portionsbit'], ['st', 32, 'hel kaka']]) // Hårt fibertunnbröd (Gene)

// Tabell 5. Flingor, matgryn och mjöl
add([830, 3136, 3564], [['tsk', 3], ['msk', 9], ['dl', 61]]) // Bulgur, tillagad
add([706], [['tsk', 0.8], ['msk', 2], ['dl', 13], ['dl', 28, 'krossade']]) // Cornflakes
add([727], [['tsk', 1], ['msk', 3], ['dl', 18]]) // Frukostflingor, frostade
add([728], [['msk', 2], ['dl', 13]]) // Frukostflingor, ringar
add([725], [['msk', 3], ['dl', 19]]) // Frukostflingor, specialflingor
add([6764, 6765, 6863], [['msk', 8], ['dl', 51]]) // Granola
add([3447], [['tsk', 0.8], ['msk', 2], ['dl', 14]]) // Havrefras
add([6999], [['tsk', 4], ['msk', 13], ['dl', 82]]) // Havreris, kokt
add([834, 7006], [['tsk', 4], ['msk', 10], ['dl', 61]]) // Hirs, kokt
add([726], [['tsk', 0.8], ['msk', 2], ['dl', 15]]) // Kalaspuffar
add([6146], [['tsk', 3], ['msk', 8], ['dl', 57]]) // Mathavre, kokt
add([712, 719, 721, 2024, 2025, 2027, 2030, 2031, 2032, 2033, 6086], [['msk', 7], ['dl', 46]]) // Müsli
add([6869], [['msk', 10], ['dl', 61, 'ljust'], ['dl', 64, 'mörkt']]) // Teffmjöl
add([710], [['st', 20]]) // Weetabix

// Tabell 6. Pastarätter
add([861], [['st', 11], ['dl', 102]]) // Ravioli, konserverad, tillagad

// Tabell 7. Fisk och skaldjur
add([1407, 1408], [['st', 12, 'ring']]) // Bläckfiskringar, panerade, friterade
add([1255, 3800, 6173, 6174, 6225], [['st', 123, 'portionsbit']]) // Lax, rå, portionsbit
add([1316], [['st', 112, 'portionsbit'], ['dl', 59, 'i bitar']]) // Lax, stekt utan fett
add([4608, 4609], [['st', 13, 'bit']]) // Sill, inlagd
add([1281], [['st', 11, 'bit']]) // Sill, matjessill
add([4610], [['st', 9, 'bit']]) // Sill, senapssill
add([1275], [['tsk', 3], ['msk', 9], ['dl', 61]]) // Tonfisk i olja
add([1246], [['st', 125, 'rygg']]) // Torskrygg, rå
add([1337], [['st', 109, 'rygg'], ['msk', 12], ['dl', 66]]) // Torskrygg, stekt utan fett

// Tabell 8. Kött, chark och kötträtter
add([1003], [['st', 20, 'skiva']]) // Bacon, rå, skivad
add([1004], [['st', 11, 'skiva'], ['dl', 38, 'strimlad']]) // Bacon, stekt
add([2104], [['tsk', 5], ['msk', 15], ['dl', 97]]) // Carbonarasås, tillagad
add([1496, 1497], [['st', 6, 'tunn skiva']]) // Cognacs medvurst, tunna skivor
add([1487, 1488], [['dl', 54, 'strimlad'], ['dl', 57, 'tärnad']]) // Falukorv, rå
add([1508], [['st', 60], ['st', 3, 'skiva'], ['dl', 61, 'skivad']]) // Grillkorv, rå
add([1191, 6009], [['st', 6, 'tunn skiva']]) // Kalkon, rökt, tunna skivor
add([1006], [['st', 50, 'skiva'], ['dl', 55, 'strimlad'], ['tsk', 3, 'tärnad'], ['msk', 9, 'tärnad'], ['dl', 56, 'tärnad']]) // Kassler, rå
add([6057], [['st', 42, 'skiva']]) // Kassler, bräckt, skivad
add([1474, 1477, 1478], [['msk', 15], ['dl', 97]]) // Leverpastej, bredbar
add([1475, 1476], [['st', 6, 'hyvlad skiva'], ['st', 15, 'skuren skiva']]) // Leverpastej, skivbar
add([991], [['st', 27, 'skiva']]) // Rimmad sida, rå, skivad
add([5969], [['st', 14, 'skiva'], ['dl', 48, 'strimlad']]) // Rimmad sida, stekt
add([1080], [['msk', 8], ['dl', 43]]) // Renskav, stekt
add([2101], [['tsk', 4], ['msk', 10], ['dl', 56]]) // Nötfärs, stekt utan fett

// Tabell 9. Mejeri, ost och ägg
add([1719, 7137, 7138], [['msk', 16], ['dl', 95]]) // Crème fraiche
add([7139, 7140], [['tsk', 6], ['msk', 16], ['dl', 98]]) // Crème fraiche, lätt
add([100], [['st', 42, 'skiva 1–1,5 cm']]) // Grilloumi, rå, skivad
add([2899], [['st', 39, 'skiva 1–1,5 cm'], ['st', 13, 'stav'], ['msk', 10, 'småbitar'], ['dl', 57, 'småbitar'], ['dl', 51, 'strimlad']]) // Grilloumi, stekt
add([6090, 6091], [['msk', 17], ['dl', 111]]) // Kvarg, smaksatt
add([1715], [['tsk', 5], ['msk', 15], ['dl', 103], ['msk', 8, 'vispad'], ['dl', 49, 'vispad']]) // Vispgrädde
add([7146], [['msk', 17], ['dl', 108]]) // Yoghurt, grekisk
add([147, 148, 7147, 7148], [['tsk', 6], ['msk', 18], ['dl', 115]]) // Yoghurt, smaksatt
add([6113], [['dl', 105]]) // Yoghurt, turkisk
add([2197], [['msk', 16], ['dl', 96]]) // Äggröra, tillagad

// Tabell 10. Majonnässallader, röror och andra tillbehör
add([58, 63, 2228, 2231], [['tsk', 5], ['msk', 15], ['dl', 96]]) // Bearnaisesås
add([3602], [['tsk', 5], ['msk', 16], ['dl', 100]]) // Tahini
add([1969, 7244, 7245], [['tsk', 6], ['msk', 18]]) // Tomatketchup
add([2003, 2004], [['tsk', 5], ['msk', 16], ['dl', 99]]) // Pesto
add([2107, 3873], [['tsk', 6], ['msk', 15], ['dl', 98]]) // Skagenröra
add([3871, 7157, 7158], [['tsk', 6], ['msk', 16], ['dl', 96]]) // Rödbetssallad
add([1809, 1810], [['tsk', 6], ['msk', 16], ['dl', 106]]) // Äpplemos
add([1811], [['tsk', 5], ['msk', 15], ['dl', 101]]) // Äpplemos, lågkalori

// Tabell 11. Vegetariska produkter och rätter
add([3820], [['tsk', 7], ['msk', 18], ['dl', 109]]) // Bruna bönor, kylvara, tillagade
add([439], [['st', 63]]) // Grönsaksbiffar, tillagade
add([5956], [['tsk', 6], ['msk', 18], ['dl', 105]]) // Havregurt, naturell
add([3051], [['tsk', 6], ['msk', 17], ['dl', 100]]) // Hummus
add([6264], [['dl', 59]]) // Sojaproteinbitar, råa
add([2068], [['msk', 6], ['dl', 45]]) // Sojaproteinfärs, rå
add([7136, 7144, 7145], [['msk', 16], ['dl', 101]]) // Soygurt, naturell
add([544], [['tsk', 5], ['msk', 16], ['dl', 96]]) // Tartex
add([750], [['st', 18]]) // Vårrullar, vegetariska, tillagade

// Tabell 12. Bullar, kakor, tårtor och efterrätter
add([1744], [['tsk', 6], ['msk', 17], ['dl', 109]]) // Blåbärs-/jordgubbskräm
add([1626], [['st', 2, 'medelstor'], ['tsk', 1, 'krossad'], ['msk', 4, 'krossad'], ['dl', 23, 'krossad']]) // Maränger
add([1624], [['st', 5, 'medelstor']]) // Pepparkakor

// Tabell 13. Snacks och övrigt
add([1887], [['tsk', 3], ['msk', 8], ['dl', 52]]) // Chokladdryckspulver
add([1586], [['st', 0.2], ['dl', 4]]) // Popcorn, poppade (10 st = 2 g)
