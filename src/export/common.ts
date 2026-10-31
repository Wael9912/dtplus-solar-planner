// Shared helpers for the PDF and Excel exports: human-readable names, dates, quantities and the derived facts both documents print.
import type { Project, Results, Battery, BomLine, LoadItem, Check, CompanySettings, StepKey, CableResult } from '../engine/types'
import { fmt } from '../engine/format'
import { AWG_EQUIV } from '../engine/standards'
import { formatQuoteMoney, type Quote } from '../engine/quote'
import { getBattery, INV_EFF_BATT } from '../engine/compute'
import { getLocation } from '../data/locations'
import { appliances } from '../data/appliances'
import { defaultCompany } from '../engine/defaults'
import { placeName } from '../i18n/places'
import { en as uiEn } from '../i18n/en'
import { ar as uiAr } from '../i18n/ar'
import { exportLabels, type ExportLabels, type ExportLang } from './labels'

export type { ExportLang, ExportLabels }
export const labelsFor = (lang: ExportLang): ExportLabels => exportLabels[lang]

/** Yearly energy-cost escalation the engine applies to savings (default 3 %). */
export const escalationPct = (p: Project) => p.design.tariffEscalationPct ?? 3
export { INV_EFF_BATT }

/** dd/mm/yyyy with Western digits in both languages. */
export function fmtDate(d: Date | string) {
  const x = new Date(d)
  if (Number.isNaN(x.getTime())) return '—'
  const p = (n: number) => String(n).padStart(2, '0')
  return `${p(x.getDate())}/${p(x.getMonth() + 1)}/${x.getFullYear()}`
}
export const addDays = (d: Date, n: number) => new Date(d.getTime() + n * 864e5)

/** Quantity printed exactly as billed (no rounding that would break qty × unit price = amount). */
export function qtyText(q: number) {
  if (!Number.isFinite(q)) return '—'
  for (let d = 0; d <= 3; d++) { const k = 10 ** d; if (Math.abs(Math.round(q * k) / k - q) < 1e-9) return fmt(q, d) }
  return fmt(q, 3)
}
/** Number with up to `max` decimals, trailing zeros dropped (1.2, 7, 0.95). */
export function num(v: number, max = 2) {
  if (!Number.isFinite(v)) return '—'
  for (let d = 0; d <= max; d++) { const k = 10 ** d; if (Math.abs(Math.round(v * k) / k - v) < 1e-9) return fmt(v, d) }
  return fmt(v, max)
}

export const money = (q: Quote) => (v: number, d?: number) => formatQuoteMoney(v, q, d)
/** Amount without the currency (table cells; the currency is in the column header). */
export const plain = (q: Quote) => (v: number, d = q.decimals) => (v < 0 ? '−' : '') + fmt(Math.abs(v), d)
/** Converts an engine USD figure to the quote's display currency (same fx the quote uses). */
export const toQuoteCur = (q: Quote, usd: number) => usd * q.fx
/** Decimals for small per-unit amounts (tariff, LCOE): 3 below 1, 2 below 100, 0 above. */
export const unitDecimals = (v: number) => (Math.abs(v) < 1 ? 3 : Math.abs(v) < 100 ? 2 : 0)

export function systemName(p: Project, L: ExportLabels) { return L.sys[p.design.systemType] ?? p.design.systemType }
export function phaseName(p: Project, L: ExportLabels) { return L.phase(p.design.phase) }
export function locationName(p: Project, lang: ExportLang) {
  if (p.site.locationId === 'custom') return p.site.customName?.trim() || '—'
  const loc = getLocation(p.site.locationId)
  return loc ? placeName(loc, lang) : p.site.locationId
}
export const unitName = (u: string, L: ExportLabels) => L.units[u] ?? u
export const categoryName = (c: string, L: ExportLabels) => L.cats[c] ?? c

type NamedLine = Pick<BomLine, 'id' | 'name' | 'spec' | 'source'> & { nameAr?: string; specAr?: string }
export function lineName(l: NamedLine, lang: ExportLang, L: ExportLabels) {
  if (l.source === 'custom') return l.name?.trim() || '—'
  if (L.services[l.id]) return L.services[l.id]
  return (lang === 'ar' && l.nameAr) || l.name
}
export const lineSpec = (l: NamedLine, lang: ExportLang) => (lang === 'ar' && l.specAr) || l.spec || ''

const applianceByName = new Map(appliances.map((a) => [a.name.trim().toLowerCase(), a]))
for (const a of appliances) if (a.nameAr) applianceByName.set(a.nameAr.trim(), a)
/** Load row name; in Arabic the library appliance's Arabic name when the row came from the library. */
export function loadName(l: LoadItem, lang: ExportLang) {
  const name = l.name?.trim() || '—'
  if (lang !== 'ar') return name
  const a = applianceByName.get(name.toLowerCase()) ?? applianceByName.get(name)
  return a?.nameAr ?? name
}
export const loadCategory = (c: string, L: ExportLabels) => L.loadCats[c] ?? c

export function derateName(b: { name: string; nameAr?: string }, lang: ExportLang, L: ExportLabels) {
  if (lang === 'ar' && b.nameAr) return b.nameAr
  if (L.derate[b.name]) return L.derate[b.name]
  const m = /^Battery round-trip \((\d+(?:\.\d+)?)% via battery\)/i.exec(b.name)
  return m ? L.battRoundTrip(m[1]) : b.name
}
export const checkMessage = (c: Check, lang: ExportLang) => (lang === 'ar' && c.messageAr) || c.message

/** Battery model in the design, even when its BOM line was excluded (supplied by the client). */
export function batteryInfo(p: Project, r: Results): { battery: Battery | null; excluded: boolean } {
  let b: Battery | null | undefined = r.battery
  if (!b) for (const l of r.bom) { const x = getBattery(l.id); if (x) { b = x; break } }
  if (!b) for (const id of p.pricing.excludedIds) { const x = getBattery(id); if (x) { b = x; break } }
  if (!b && p.design.batteryId && p.design.batteryId !== 'auto') b = getBattery(p.design.batteryId)
  return { battery: b ?? null, excluded: !!b && p.pricing.excludedIds.includes(b.id) }
}

/** Battery autonomy: days for off-grid (whole daily load), hours for hybrid backup. null when there is no battery. */
export function autonomyOf(p: Project, r: Results): { days: number; hours: number; offgrid: boolean } | null {
  if (!r.batteryQty || !(r.batteryUsableKwh > 0)) return null
  const offgrid = p.design.systemType === 'offgrid'
  const dailyWh = r.batteryDailyWh > 0 ? r.batteryDailyWh : offgrid ? r.dailyWh : r.nightWh
  const days = r.autonomyDays > 0 ? r.autonomyDays : dailyWh > 0 ? (r.batteryUsableKwh * INV_EFF_BATT * 1000) / dailyWh : NaN
  const hours = offgrid ? days * 24 : Number.isFinite(r.batteryHoursBackup) && r.batteryHoursBackup > 0 ? r.batteryHoursBackup : days * 24
  return Number.isFinite(days) || Number.isFinite(hours) ? { days, hours, offgrid } : null
}

/** Share of the annual demand met by solar (useful energy when the engine reports it). */
export function solarCoveragePct(r: Results) {
  if (!(r.annualKwh > 0)) return 0
  const useful = r.usefulEnergyKwh > 0 ? r.usefulEnergyKwh : Math.min(r.annualProductionKwh, r.annualKwh)
  return Math.min(100, (useful / r.annualKwh) * 100)
}
/** Roof / ground area to reserve (with row spacing when the engine reports the footprint). */
export const footprintM2 = (r: Results) => (r.footprintM2 > 0 ? r.footprintM2 : r.arrayAreaM2 * 1.15)

// Placeholder company texts (engine default + the per-language defaults the Settings page uses). A document never prints the
// other language's placeholder: an untouched Arabic default becomes the English one in an English PDF and vice versa.
type UiDefaults = { settings?: { defaultName?: string; defaultTagline?: string; defaultTerms?: string } }
const uiDefaults = (l: ExportLang) => ((l === 'ar' ? uiAr : uiEn) as unknown as UiDefaults).settings ?? {}
const norm = (x?: string | null) => (x ?? '').trim()
const defaultsFor = (l: ExportLang) => ({
  name: norm(uiDefaults(l).defaultName) || (l === 'ar' ? 'شركتك للطاقة الشمسية' : defaultCompany.name),
  tagline: norm(uiDefaults(l).defaultTagline) || (l === 'ar' ? '' : defaultCompany.tagline),
  terms: l === 'ar' ? norm(uiDefaults('ar').defaultTerms) || exportLabels.ar.pdf.defaultTerms : norm(uiDefaults('en').defaultTerms) || defaultCompany.terms,
})
const known = (k: 'name' | 'tagline' | 'terms') => new Set([norm(defaultCompany[k]), defaultsFor('en')[k], defaultsFor('ar')[k], k === 'terms' ? norm(exportLabels.ar.pdf.defaultTerms) : ''].filter(Boolean))
export const isDefaultCompanyName = (c: CompanySettings) => !norm(c.name) || known('name').has(norm(c.name))
/** Company settings with untouched placeholder texts swapped to the document language. */
export function localizeCompany(c: CompanySettings, lang: ExportLang): CompanySettings {
  const d = defaultsFor(lang)
  const pick = (k: 'name' | 'tagline' | 'terms') => (known(k).has(norm(c[k])) ? d[k] || c[k] : c[k])
  return { ...c, name: pick('name'), tagline: pick('tagline'), terms: pick('terms') }
}
export const termsText = (c: CompanySettings, lang: ExportLang) => norm(localizeCompany(c, lang).terms)

// ---- cable schedule & protection (technical PDF and workbook)
/** Circuit name (engine label in the document language), with the number of identical circuits. */
export function cableLabel(c: CableResult, lang: ExportLang, L: ExportLabels) {
  const base = (lang === 'ar' ? c.labelAr : c.label) || L.circuits[c.use] || c.use
  return c.count && c.count > 1 ? `${base} ×${c.count}` : base
}
/** "2 × 120 mm² (AWG 4/0) · Iz 412 A" */
export const cableSize = (c: CableResult, L: ExportLabels) =>
  `${c.parallelRuns && c.parallelRuns > 1 ? `${c.parallelRuns} × ` : ''}${c.sizeMm2} mm² (AWG ${AWG_EQUIV[c.sizeMm2] ?? '—'})${c.ampacityA ? ` · ${L.tech.iz} ${num(c.ampacityA, 0)} A` : ''}`
/** "25 A gPV fuse 1000 V" (+ a note when no standard device is large enough) */
export const cableDevice = (c: CableResult, L: ExportLabels) =>
  `${c.breakerA} A ${c.deviceType || L.protection[c.use] || ''}${c.deviceRatedV ? ` ${c.deviceRatedV} V` : ''}${c.deviceStd === false ? ` (${L.tech.nonStd})` : ''}`.replace(/\s+/g, ' ').trim()
/** Protective-device ratings that drive the BOM (Results.protection), as label/value rows. */
export function protectionRows(r: Results, L: ExportLabels): [string, string][] {
  const pr = r.protection, T = L.tech.protRows
  if (!pr) return []
  const a = (x: number | null | undefined) => (x != null && x > 0 ? `${num(x, 1)} A` : '')
  const v = (x: number | null | undefined) => (x != null && x > 0 ? `${num(x, 0)} V DC` : '')
  const both = (...xs: string[]) => xs.filter(Boolean).join(' / ')
  const rows: [string, string][] = [
    [T.stringFuse, a(pr.stringFuseA)], [T.arrayFuse, a(pr.arrayFuseA)], [T.dcIsolator, both(a(pr.dcIsolatorA), v(pr.dcIsolatorV))], [T.spdDc, v(pr.spdDcV)],
    [T.batteryFuse, both(a(pr.batteryFuseA), v(pr.batteryFuseVdc))], [T.acInv, a(pr.acBreakerPerInverterA)], [T.acMain, a(pr.acMainBreakerA)],
    [T.gen, a(pr.generatorBreakerA)], [T.rcd, a(pr.rcdA)],
    [T.changeover, both(a(pr.changeoverA), pr.changeoverType ? (pr.changeoverType === 'ats' ? L.tech.ats : L.tech.manual) : '')],
  ]
  return rows.filter(([, val]) => !!val)
}

/** Wizard step order (store.step is an index). */
export const STEP_ORDER: StepKey[] = ['info', 'loads', 'site', 'design', 'results', 'bom', 'export']
const CHECK_STEP: Record<string, StepKey> = {
  'no-loads': 'loads', 'load-phase': 'info', area: 'site', 'low-tariff': 'site', 'total-zero': 'bom', 'price-zero': 'bom', 'gen-price': 'bom',
}
/** Step where a check is fixed: the engine's tag, else a sensible default. */
export const checkStep = (c: Check): StepKey => c.step ?? CHECK_STEP[c.id] ?? (c.id.startsWith('fx') ? 'site' : c.id.startsWith('bom') ? 'bom' : 'design')

/** File-name stem: keeps Arabic letters, drops characters that are illegal in file names. */
export const fileStem = (name: string) => (name || 'solar-project').trim().replace(/[\\/:*?"<>|]+/g, '').replace(/[^\w؀-ۿ-]+/g, '_').replace(/^_+|_+$/g, '') || 'solar-project'
