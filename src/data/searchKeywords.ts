// Product search shared by the catalogue pickers: a normaliser for English / Arabic text, trade keywords in both languages
// per product family (so «انفرتر», «لوح», "breaker" or "lithium" find the right products even though catalogue names are
// brand + model), and a ranking that puts the family the user asked for first.
import type { ResolvedCatalog } from '../engine/catalogContext'

// ---------------------------------------------------------------- normaliser
const DIACRITICS = /[\u0610-\u061A\u064B-\u065F\u0670\u06D6-\u06ED\u0640]/g // harakat, tanween, shadda, sukun, Quranic marks, tatweel
const INVISIBLE = /[\u200B-\u200F\u202A-\u202E\u2066-\u2069\uFEFF]/g // zero-width and bidi controls (RLM, isolates …)

/**
 * Search form of a text: lower-case, NFKC (mm² → mm2, Arabic presentation forms → letters), no Arabic diacritics or tatweel,
 * أ/إ/آ/ٱ → ا, ة → ه, ى → ي, Arabic-Indic digits → Western, bidi marks removed, single spaces.
 */
export function normalizeSearch(s: string): string {
  return (s ?? '').normalize('NFKC').toLowerCase()
    .replace(INVISIBLE, '')
    .replace(DIACRITICS, '')
    .replace(/[أإآٱ]/g, 'ا').replace(/ة/g, 'ه').replace(/ى/g, 'ي')
    .replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x660))
    .replace(/[۰-۹]/g, (d) => String(d.charCodeAt(0) - 0x6f0))
    .replace(/٫/g, '.').replace(/٬/g, ',')
    .replace(/\s+/g, ' ').trim()
}

/**
 * Query → normalised words. A leading Arabic article «ال» is dropped («البطارية» finds «كابل بطارية»), and a number glued to a
 * unit is split ("5kw" → "5", "kw") so it matches "5 kW".
 */
export function searchWords(q: string): string[] {
  const out: string[] = []
  for (const raw of (q ?? '').trim().split(/\s+/)) {
    if (!raw) continue
    // Article check before alef unification: «ألواح» (a root alef) keeps its first letters, «الألواح» loses «ال»
    const bare = raw.replace(DIACRITICS, '')
    const w = normalizeSearch(bare.startsWith('ال') && bare.length >= 5 ? bare.slice(2) : bare)
    for (const part of w.split(/(?<=\d)(?=[^\d\s.,])|(?<=[^\d\s.,])(?=\d)/)) if (part) out.push(part)
  }
  return out
}

// ---------------------------------------------------------------- product families (EN + AR trade words)
export const FAMILIES = {
  panel: ['panel', 'panels', 'module', 'modules', 'pv', 'solar', 'لوح', 'ألواح', 'لوح شمسي', 'ألواح شمسية', 'شمسي', 'شمسية', 'طاقة شمسية', 'بانل'],
  inverter: ['inverter', 'inverters', 'invertor', 'انفرتر', 'إنفرتر', 'انفيرتر', 'إنفيرتر', 'عاكس', 'عاكسات'],
  battery: ['battery', 'batteries', 'batt', 'storage', 'بطارية', 'بطاريات', 'تخزين'],
  lithium: ['lithium', 'li-ion', 'lifepo4', 'lfp', 'nmc', 'ليثيوم'],
  leadAcid: ['lead acid', 'lead-acid', 'gel', 'agm', 'flooded', 'جل', 'رصاص', 'رصاص حمضي', 'سائلة'],
  controller: ['charge controller', 'controller', 'regulator', 'solar charger', 'mppt', 'pwm', 'منظم', 'منظم شحن', 'منظمات', 'كنترولر', 'شاحن شمسي'],
  breaker: ['breaker', 'breakers', 'circuit breaker', 'mcb', 'mccb', 'rccb', 'rcd', 'قاطع', 'قواطع', 'بريكر'],
  fuse: ['fuse', 'fuses', 'فيوز', 'فيوزات', 'مصهر', 'مصاهر'],
  cable: ['cable', 'cables', 'wire', 'wires', 'wiring', 'كابل', 'كابلات', 'كيبل', 'سلك', 'أسلاك'],
  connector: ['connector', 'connectors', 'mc4', 'lug', 'موصل', 'موصلات', 'كوس'],
  conduit: ['conduit', 'trunking', 'pipe', 'مواسير', 'ماسورة', 'مجاري'],
  isolator: ['isolator', 'disconnect', 'switch', 'عازل', 'مفتاح فصل', 'فاصل'],
  spd: ['spd', 'surge', 'surge protector', 'lightning', 'arrester', 'واقي', 'واقي صواعق', 'صواعق', 'واقي الجهد'],
  mounting: ['mounting', 'mount', 'structure', 'rail', 'rails', 'clamp', 'clamps', 'bracket', 'frame', 'هيكل', 'هياكل', 'قاعدة', 'سكة', 'مشبك', 'حامل', 'تثبيت'],
  earthing: ['earthing', 'earth', 'grounding', 'تأريض', 'أرضي', 'ارضي'],
  combiner: ['combiner', 'combiner box', 'junction box', 'صندوق تجميع', 'تجميع'],
  changeover: ['ats', 'changeover', 'change-over', 'transfer switch', 'مفتاح تحويل', 'تحويل'],
  board: ['board', 'distribution board', 'db', 'لوحة', 'لوحة توزيع'],
  monitoring: ['monitoring', 'wifi', 'wi-fi', 'dongle', 'meter', 'مراقبة', 'عداد'],
  batteryKit: ['rack', 'cabinet', 'stand', 'busbar', 'bms', 'رف', 'كابينة', 'حامل'],
  generator: ['generator', 'genset', 'diesel', 'مولد', 'ديزل', 'جنريتر'],
  labour: ['labour', 'labor', 'installation', 'install', 'تركيب', 'عمالة'],
  consumables: ['consumables', 'ties', 'labels', 'مستهلكات'],
} as const
export type Family = keyof typeof FAMILIES
export type ProductKind = 'panels' | 'inverters' | 'batteries' | 'controllers' | 'items'

/** Balance-of-system items by id (catalogue ids are `<family>-<rating>`, see items.ts). First match wins. */
const ID_FAMILY: [RegExp, Family[]][] = [
  [/^(dc|batt|ac)-cable-/, ['cable']], [/^earth-cable/, ['cable', 'earthing']], [/^bms-cable/, ['batteryKit']],
  [/^(mc4|cable-lug)/, ['connector']], [/^conduit/, ['conduit']],
  [/^combiner/, ['combiner']], [/^(pv|pv-array|batt)-fuse-/, ['fuse']], [/^dc-isolator-/, ['isolator']],
  [/^spd-/, ['spd']], [/^lightning-arrest/, ['spd', 'earthing']],
  [/^ac-mcc?b-|^rcd-/, ['breaker']], [/^db-board/, ['board']], [/^(changeover|ats)-/, ['changeover']],
  [/^(ct-meter|wifi-dongle)/, ['monitoring']], [/^earth-/, ['earthing']],
  [/^(battery-rack|battery-stand|busbar)/, ['batteryKit']], [/^generator/, ['generator']], [/^cable-ties/, ['consumables']],
  [/^(rail|mid-clamp|end-clamp|l-foot|tile-hook|triangle-frame|ballast|ground-structure)/, ['mounting']],
]
/** Fallback by BOM category (own products `my-…` and anything not matched by id). */
const CATEGORY_FAMILY: Record<string, Family[]> = {
  'PV Modules': ['panel'], Inverter: ['inverter'], Battery: ['batteryKit'], Mounting: ['mounting'], Cabling: ['cable'],
  Earthing: ['earthing'], Monitoring: ['monitoring'], Generator: ['generator'], Services: ['labour'],
}

/** Families a product belongs to: by kind (panels, inverters, batteries + chemistry, controllers), else by item id, else by category. */
export function productFamilies(kind: ProductKind, id: string, category: string, chemistry?: string): Family[] {
  if (kind === 'panels') return ['panel']
  if (kind === 'inverters') return ['inverter']
  if (kind === 'controllers') return ['controller']
  if (kind === 'batteries') return ['battery', ...(chemistry === 'LiFePO4' || chemistry === 'NMC' ? ['lithium' as const] : chemistry ? ['leadAcid' as const] : [])]
  const hit = ID_FAMILY.find(([re]) => re.test(id))
  return hit ? hit[1] : CATEGORY_FAMILY[category] ?? []
}
const famCache = new Map<string, string>()
const familyText = (fs: Family[]) => {
  const k = fs.join('|')
  let s = famCache.get(k)
  if (s == null) { s = normalizeSearch(fs.flatMap((f) => FAMILIES[f]).join(' · ')); famCache.set(k, s) }
  return s
}

// ---------------------------------------------------------------- ranking
/** Normalised text of one product, by field: family keywords, name, spec (+ id), category labels. */
export interface SearchFields { fam: string; name: string; spec: string; cat: string }
const FIELDS = ['fam', 'name', 'spec', 'cat'] as const // order = rank: family / name hits first, then spec, then category

export function searchFields(x: { kind: ProductKind; id: string; category: string; chemistry?: string; name: string; nameAr?: string; spec?: string; specAr?: string; catLabels?: (string | undefined)[] }): SearchFields {
  return {
    fam: familyText(productFamilies(x.kind, x.id, x.category, x.chemistry)),
    name: normalizeSearch([x.name, x.nameAr].filter(Boolean).join(' · ')),
    spec: normalizeSearch([x.spec, x.specAr, x.id].filter(Boolean).join(' · ')),
    cat: normalizeSearch([x.category, ...(x.catLabels ?? [])].filter(Boolean).join(' · ')),
  }
}

const NUM = /^\d+(?:[.,]\d+)?$/
/** A number matches a whole number only: "6" finds "6 kW" and "6.5 kW", not "16 kW" or "60 A". */
function contains(hay: string, w: string): boolean {
  if (!NUM.test(w)) return hay.includes(w)
  for (let i = hay.indexOf(w); i >= 0; i = hay.indexOf(w, i + 1)) {
    const before = hay[i - 1] ?? '', after = hay[i + w.length] ?? ''
    if (!/[\d.,]/.test(before) && !/\d/.test(after)) return true
  }
  return false
}

/** Rank of a product for the query words (lower = better), or null when a word matches nowhere. Every word must match, any order. */
export function matchScore(f: SearchFields, words: string[]): number | null {
  let score = 0
  for (const w of words) {
    const k = FIELDS.findIndex((field) => contains(f[field], w))
    if (k < 0) return null
    score += k
  }
  return score
}

/** Items matching every word of the query, best first (family / name hits, then spec, then category; ties keep the list order). */
export function rankSearch<T>(items: T[], fields: (x: T) => SearchFields, query: string): T[] {
  const words = searchWords(query)
  if (!words.length) return items
  const scored: { x: T; s: number; i: number }[] = []
  items.forEach((x, i) => { const s = matchScore(fields(x), words); if (s != null) scored.push({ x, s, i }) })
  return scored.sort((a, b) => a.s - b.s || a.i - b.i).map((e) => e.x)
}

// ---------------------------------------------------------------- catalogue picker entries ("Add from catalogue")
/** A product of the company price list as it becomes a quote line (names and specs in both languages, the company's unit cost). */
export interface CatalogEntry {
  kind: ProductKind; id: string; own: boolean; category: string; name: string; nameAr?: string; spec: string; specAr?: string; unit: string; priceUsd: number
  search: SearchFields
}
const TYPE_AR: Record<string, string> = { hybrid: 'هجين', offgrid: 'منفصل عن الشبكة', gridtie: 'متصل بالشبكة' }
const CHEM_AR: Record<string, string> = { LiFePO4: 'ليثيوم حديد فوسفات (LiFePO4)', NMC: 'ليثيوم NMC', AGM: 'رصاص حمضي AGM', Gel: 'رصاص حمضي جل', Flooded: 'رصاص حمضي سائل' }
const OWN = 'my-'

/**
 * Every product the company stocks (hidden ones left out), shaped like the BOM lines the engine writes for the same product.
 * `catLabels` gives the category's display names (both languages) so a category name finds its products too.
 */
export function catalogEntries(c: ResolvedCatalog, catLabels: (category: string) => (string | undefined)[]): CatalogEntry[] {
  const vis = <T extends { id: string }>(xs: T[]) => xs.filter((x) => !c.hidden.has(x.id))
  const out: (Omit<CatalogEntry, 'search'> & { chemistry?: string })[] = [
    ...vis(c.panels).map((x) => ({ kind: 'panels' as const, id: x.id, own: x.id.startsWith(OWN), category: 'PV Modules', unit: 'pcs', priceUsd: x.approxPriceUsd,
      name: `${x.brand} ${x.model}`, spec: `${x.watts} W · ${x.technology}${x.bifacial ? ' bifacial' : ''} · Voc ${x.voc} V`,
      nameAr: `${x.brand} ${x.model}`, specAr: `${x.watts} W · ${x.technology === 'poly' ? 'متعدد البلورات' : x.technology}${x.bifacial ? ' · ثنائي الوجه' : ''} · Voc ${x.voc} V` })),
    ...vis(c.inverters).map((x) => ({ kind: 'inverters' as const, id: x.id, own: x.id.startsWith(OWN), category: 'Inverter', unit: 'pcs', priceUsd: x.approxPriceUsd,
      name: `${x.brand} ${x.model}`, spec: `${x.ratedAcKw} kW ${x.type} · ${x.phase}-ph · ${x.mpptCount} MPPT`,
      nameAr: `${x.brand} ${x.model}`, specAr: `${TYPE_AR[x.type] ?? x.type} · ${x.phase === 3 ? 'ثلاثي الأطوار' : 'أحادي الطور'} · ${x.ratedAcKw} kW · ${x.mpptCount} MPPT` })),
    ...vis(c.batteries).map((x) => ({ kind: 'batteries' as const, id: x.id, own: x.id.startsWith(OWN), category: 'Battery', unit: 'pcs', priceUsd: x.approxPriceUsd, chemistry: x.chemistry,
      name: `${x.brand} ${x.model}`, spec: `${x.nominalVoltage} V ${x.capacityAh} Ah · ${x.energyKwh} kWh ${x.chemistry}`,
      nameAr: `${x.brand} ${x.model}`, specAr: `${CHEM_AR[x.chemistry] ?? x.chemistry} · ${x.nominalVoltage} V ${x.capacityAh} Ah · ${x.energyKwh} kWh` })),
    ...vis(c.chargeControllers).map((x) => ({ kind: 'controllers' as const, id: x.id, own: x.id.startsWith(OWN), category: 'Inverter', unit: 'pcs', priceUsd: x.approxPriceUsd,
      name: `${x.brand} ${x.model}`, spec: `${x.maxChargeA} A ${x.type ?? 'MPPT'} · ${x.maxPvVoltage} V PV`,
      nameAr: `${x.brand} ${x.model}`, specAr: `منظم شحن ${x.type ?? 'MPPT'} \u200F${x.maxChargeA} A · ${x.maxPvVoltage} V` })),
    ...vis(c.items).map((x) => ({ kind: 'items' as const, id: x.id, own: x.id.startsWith(OWN), category: x.category || 'Accessories', unit: x.unit || 'pcs', priceUsd: x.approxPriceUsd,
      name: x.name, spec: x.spec ?? '', nameAr: x.nameAr, specAr: x.specAr })),
  ]
  return out.map(({ chemistry, ...e }) => ({ ...e, search: searchFields({ ...e, chemistry, catLabels: catLabels(e.category) }) }))
}
