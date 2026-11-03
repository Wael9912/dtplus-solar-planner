// Catalogue search (data/searchKeywords): normaliser, EN/AR family keywords and ranking over the real catalogue —
// the queries from the owner review must return the right product family first in both languages. Also the load library ranking.
import { describe, it, expect } from 'vitest'
import { normalizeSearch, searchWords, rankSearch, catalogEntries, productFamilies, type CatalogEntry, type ProductKind } from '../src/data/searchKeywords'
import { resolveCatalog } from '../src/engine/catalogContext'
import { appliances, searchAppliances } from '../src/data/appliances'
import { en } from '../src/i18n/en'
import { ar } from '../src/i18n/ar'

const entries = catalogEntries(resolveCatalog(), (c) => [en.bom.cats[c], ar.bom.cats[c]])
const search = (q: string) => rankSearch(entries, (e) => e.search, q)
const familyOf = (e: CatalogEntry) => productFamilies(e.kind, e.id, e.category)

describe('normalizeSearch', () => {
  it('lower-cases and unifies Arabic letter forms', () => {
    expect(normalizeSearch('إنفرتر')).toBe('انفرتر')
    expect(normalizeSearch('أَلْوَاح')).toBe('الواح')
    expect(normalizeSearch('آلة')).toBe('اله')
    expect(normalizeSearch('بطاريّة')).toBe('بطاريه')
    expect(normalizeSearch('مبنى')).toBe('مبني')
    expect(normalizeSearch('بطـــارية')).toBe('بطاريه') // tatweel
    expect(normalizeSearch('Battery LiFePO4')).toBe('battery lifepo4')
  })
  it('turns Arabic-Indic digits into Western ones and drops bidi marks', () => {
    expect(normalizeSearch('٤٨ V')).toBe('48 v')
    expect(normalizeSearch('۱۲ A')).toBe('12 a')
    expect(normalizeSearch('فيوز ‏32 A')).toBe('فيوز 32 a')
    expect(normalizeSearch('16 mm²')).toBe('16 mm2')
  })
  it('splits query words (article, glued units)', () => {
    expect(searchWords('  البطارية   5kw ')).toEqual(['بطاريه', '5', 'kw'])
    expect(searchWords('ألواح')).toEqual(['الواح']) // root alef, not the article
    expect(searchWords('الألواح')).toEqual(['الواح'])
  })
})

describe('catalogue ranking', () => {
  const firstKind = (q: string): ProductKind | undefined => search(q)[0]?.kind
  const cases: [string, ProductKind][] = [
    ['انفرتر', 'inverters'], ['إنفرتر', 'inverters'], ['الانفرتر', 'inverters'], ['عاكس', 'inverters'], ['inverter', 'inverters'],
    ['لوح', 'panels'], ['ألواح', 'panels'], ['الواح', 'panels'], ['panel', 'panels'], ['module', 'panels'], ['solar panel', 'panels'],
    ['بطارية', 'batteries'], ['بطاريات', 'batteries'], ['البطارية', 'batteries'], ['battery', 'batteries'],
    ['lithium', 'batteries'], ['ليثيوم', 'batteries'], ['LiFePO4', 'batteries'],
    ['منظم شحن', 'controllers'], ['منظم', 'controllers'], ['charge controller', 'controllers'], ['mppt controller', 'controllers'],
  ]
  for (const [q, kind] of cases) it(`"${q}" → ${kind} first`, () => expect(firstKind(q)).toBe(kind))

  it('"battery" / «بطارية» list every battery before any cable or accessory', () => {
    for (const q of ['battery', 'بطارية']) {
      const r = search(q)
      const lastBattery = r.map((e) => e.kind).lastIndexOf('batteries')
      const firstOther = r.findIndex((e) => e.kind !== 'batteries')
      expect(lastBattery).toBeGreaterThan(0)
      expect(firstOther).toBeGreaterThan(lastBattery)
    }
  })
  it('"panel" lists every panel before accessories that mention panels', () => {
    const r = search('panel')
    expect(r.filter((e) => e.kind === 'panels').length).toBe(entries.filter((e) => e.kind === 'panels').length)
    expect(r.findIndex((e) => e.kind !== 'panels')).toBeGreaterThan(r.map((e) => e.kind).lastIndexOf('panels'))
  })

  const itemCases: [string, string][] = [
    ['breaker', 'breaker'], ['قاطع', 'breaker'], ['MCB', 'breaker'], ['mccb 250', 'breaker'],
    ['fuse', 'fuse'], ['فيوز', 'fuse'], ['مصهر', 'fuse'],
    ['cable', 'cable'], ['wire', 'cable'], ['كابل', 'cable'], ['سلك', 'cable'],
    ['isolator', 'isolator'], ['عازل', 'isolator'], ['مفتاح فصل', 'isolator'],
    ['SPD', 'spd'], ['surge', 'spd'], ['واقي صواعق', 'spd'],
    ['rail', 'mounting'], ['clamp', 'mounting'], ['هيكل', 'mounting'], ['قاعدة', 'mounting'], ['سكة', 'mounting'], ['مشبك', 'mounting'],
    ['earthing', 'earthing'], ['تأريض', 'earthing'],
    ['combiner', 'combiner'], ['صندوق تجميع', 'combiner'],
    ['ATS', 'changeover'], ['changeover', 'changeover'], ['مفتاح تحويل', 'changeover'],
  ]
  for (const [q, fam] of itemCases) it(`"${q}" → ${fam} items first`, () => {
    const r = search(q)
    expect(r.length).toBeGreaterThan(0)
    expect(familyOf(r[0])).toContain(fam)
  })

  it('all words must match, in any order', () => {
    const a = search('cable 16 dc').map((e) => e.id)
    const b = search('dc 16 cable').map((e) => e.id)
    expect(a).toEqual(b)
    expect(a[0]).toBe('dc-cable-16')
    expect(search('battery xyzzy')).toEqual([])
  })
  it('numbers match whole numbers ("6" is neither "16" nor "60")', () => {
    const ids = search('ac cable 6').map((e) => e.id)
    expect(ids).toContain('ac-cable-6')
    expect(ids).not.toContain('ac-cable-16')
  })
  it('Arabic-Indic digits and glued units work', () => {
    expect(search('كابل ١٦').map((e) => e.id)).toContain('dc-cable-16')
    const kw5 = search('5kw')
    expect(kw5[0].kind).toBe('inverters')
    expect(kw5[0].spec.startsWith('5 kW')).toBe(true)
    expect(kw5.some((e) => e.name.startsWith('Deye SUN-50K'))).toBe(false) // "5" is not "50"
  })
  it('an empty query keeps the list order', () => {
    expect(search('  ')).toBe(entries)
  })
})

describe('load library ranking (data/appliances)', () => {
  const first = (q: string) => searchAppliances(appliances, q)[0]?.id
  it('"fridge" / «ثلاجة» list the refrigerators before the chest freezer', () => {
    for (const q of ['fridge', 'Fridge', 'ثلاجة', 'refrigerator']) expect(first(q)).toBe('fridge_small')
    const ids = searchAppliances(appliances, 'fridge').map((a) => a.id)
    expect(ids.indexOf('fridge_large')).toBeLessThan(ids.indexOf('chest_freezer'))
    expect(ids).toContain('chest_freezer') // still found
  })
  it('a name that starts with the word comes first; number + unit in the name beats an alias', () => {
    expect(first('ref')).toBe('fridge_small')
    expect(first('1.5 hp')).toBe(searchAppliances(appliances, '1.5 hp').find((a) => /1\.5 HP/i.test(a.name))?.id)
    expect(searchAppliances(appliances, '1.5 ton').every((a) => /1\.5 ton/.test(a.name))).toBe(true)
  })
  it('keeps all-words matching', () => {
    expect(searchAppliances(appliances, 'split 1.5 ton inverter')[0].name).toBe('Split AC 1.5 ton inverter')
    expect(searchAppliances(appliances, 'fridge xyzzy')).toEqual([])
  })
})
