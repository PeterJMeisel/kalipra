/**
 * Ordning för nutritionsprodukter i livsmedelssöket utan sökord: kosttillägg först, sedan sondnäring.
 * Vanligast använda produkttyperna högst upp; inom varje grupp står motsvarande produkter från
 * Fresenius Kabi, Nutricia och Nestlé bredvid varandra. Produkter som inte matchar någon grupp
 * (t.ex. metabola specialprodukter) kommer sist i bokstavsordning.
 */
const KOST: RegExp[][] = [
  [/^Fresubin ENERGY Drink/, /^Nutridrink( –|$)/, /^Resource Activ/],
  [/^Fresubin ENERGY FIBRE Drink/, /^Nutridrink Multi Fibre/],
  [/^Fresubin PROTEIN ENERGY Drink/, /^Nutridrink Protein( –|$)/, /^Resource Protein/],
  [/^Fresubin 2 KCAL Drink/, /^Nutridrink Protein 2\.0/, /^Resource 2\.0( –|$)/],
  [/^Fresubin 2 KCAL FIBRE Drink/, /^Resource 2\.0\+fibre/],
  [/^Fresubin PRO Drink/, /^Fresubin PRO FIBRE COMPACT/, /^Nutridrink Compact( –|$)/, /^Nutridrink Compact Protein/, /^Nutridrink Compact Fibre/, /^Resource Ultra 125/],
  [/^Fresubin 3\.2 KCAL/],
  [/^Fresubin JUCY/, /^Nutridrink Jucy/, /^Resource Ultra Fruit/, /^ProvideXtra/],
  [/^Fresubin YODRINK/],
  [/^Fresubin PLANT-BASED Drink/, /^Nutridrink PlantBased/],
  [/^Fresubin 2 KCAL CRÈME/, /^Fresubin YOCRÈME/, /^Fresubin DESSERT/],
  [/^Fresubin 5 KCAL Shot/, /^Calogen/, /^Resource Addera/, /^Fantomalt/, /^Duocal/],
  [/^Fresubin PROTEIN POWDER/, /^Protifar/, /^OptiXpress/],
  [/^Calshake/, /^Scandishake/],
  [/^Fresubin THICKENED/, /^Nutilis/, /^ThickenUp/],
  [/^Cubitan/],
  [/^Diben Drink/, /^Diasip/],
  [/^Renalive/, /^Renilon/],
  [/^Frebini ENERGY (FIBRE )?Drink/, /^Fortini/, /^Resource MiniMax/, /^Infatrini/, /^Infasource/],
  [/^PreOp/, /^Oral Impact/, /^Souvenaid/, /^Modulen/],
]
const SOND: RegExp[][] = [
  [/^Fresubin ORIGINAL$/, /^Nutrison$/, /^Isosource Standard$/],
  [/^Fresubin ORIGINAL FIBRE$/, /^Nutrison Multi Fibre/, /^Isosource Standard Fibre/],
  [/^Fresubin ENERGY$/, /^Nutrison Energy( OpTri.*)?$/i, /^Isosource Energy$/],
  [/^Fresubin ENERGY FIBRE$/, /^Nutrison Energy Multi Fibre/, /^Isosource Energy Fibre/],
  [/^Fresubin HP ENERGY/, /^Fresubin 2 KCAL HP/, /^Nutrison Protein Plus/, /^Isosource Protein/, /^Peptamen 2\.0/],
  [/^Fresubin 1[02]00 COMPLETE/, /^Nutrison Complete/],
  [/^Fresubin INTENSIVE/, /^Nutrison Protein Intense/, /^Peptamen Intense/],
  [/^Survimed/, /^Nutrison Advanced Peptisorb/, /^Peptamen (AF|HN|Neutral)/],
  [/^Diben($| 1,5)/, /^Nutrison Diason/],
  [/^Fresubin SOYA/, /^Nutrison Plant/i],
  [/^NutriChef/, /^Compleat Mix/],
  [/^Novasource/, /^Nutrison Advanced Cubison/],
  [/^Frebini/, /^Nutrini/, /^Isosource Junior/, /^Compleat paediatric/, /^MiniMax/, /^Peptamen Junior/],
]

function rank(groups: RegExp[][], name: string): number {
  for (let g = 0; g < groups.length; g++) {
    const i = groups[g].findIndex(re => re.test(name))
    if (i >= 0) return g * 100 + i
  }
  return 1e6
}

/** Sorteringsnyckel: kosttillägg (0–) före sondnäring (1e7–), därefter rang och namn. */
export function nutritionRank(name: string, group: string): number {
  return group === 'sond' ? 1e7 + rank(SOND, name) : rank(KOST, name)
}
