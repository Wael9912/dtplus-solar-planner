// Shared helpers for the PDF and Excel exports: human-readable names, dates, quantities and the derived facts both documents print.
import type { Project, Results, Battery, BomLine, LoadItem, Check, CompanySettings, StepKey, CableResult } from '../engine/types'
import { fmt } from '../engine/format'
import { AWG_EQUIV } from '../engine/standards'
import { formatQuoteMoney, type Quote } from '../engine/quote'
import { getBattery, INV_EFF_BATT } from '../engine/compute'
import { resolveSizing } from '../engine/sizing'
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
  // Custom lines added from the catalogue carry the product's Arabic name; typed lines print as typed (units spaced: "48 V")
  if (l.source === 'custom') return unitSpace(((lang === 'ar' && l.nameAr?.trim()) || l.name?.trim()) || '—')
  if (L.services[l.id]) return L.services[l.id]
  return unitSpace((lang === 'ar' && l.nameAr) || l.name)
}
export const lineSpec = (l: NamedLine, lang: ExportLang) => unitSpace((lang === 'ar' && l.specAr) || l.spec || '')

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
// ---- project modes (known size, battery backup only, electricity bill, product quote)
/** Sizes the user fixed, the bill and the existing equipment, with defaults filled (projects saved before v0.2 have none). */
export const sizingOf = (p: Project) => resolveSizing(p)
/** Battery backup without solar panels (fixed PV size 0). */
export const isBackupOnly = (r: Results) => r.mode !== 'items' && !(r.arrayKwp > 0)
/** Hours the usable storage covers a constant AC load of `kw` (after the battery→AC inverter efficiency). */
export const backupHoursAt = (r: Results, kw: number) => (kw > 0 && r.batteryUsableKwh > 0 ? (r.batteryUsableKwh * INV_EFF_BATT) / kw : 0)
/** Reference loads for a backup-time table when there is no consumption data: 0.5, 1 and 2 kW up to the inverter rating, then the rating. */
export function backupLoads(r: Results): number[] {
  const cap = r.inverterTotalKw > 0 ? r.inverterTotalKw : 0
  const xs = [0.5, 1, 2].filter((x) => !cap || x < cap)
  if (cap) xs.push(Math.round(cap * 100) / 100)
  return xs
}
/** "5.04 kWp · 10.24 kWh · 5 kW" (parts that exist). */
export function sizeSummary(r: Results) {
  return [r.arrayKwp > 0 ? `${fmt(r.arrayKwp, 2)} kWp` : '', r.batteryKwh > 0 ? `${fmt(r.batteryKwh, 1)} kWh` : '', r.inverterTotalKw > 0 ? `${num(r.inverterTotalKw, 1)} kW` : '']
    .filter(Boolean).join(' · ')
}
/** Units of a BOM line already on site (expansion projects), 0 when none. */
export const existingQtyOf = (r: Results, id: string) => r.bom.find((b) => b.id === id)?.existingQty ?? 0
/** Main-equipment lines entirely on site (qty 0, existingQty > 0): never priced; client documents list them in a note. */
export const onSiteOnlyLines = (r: Results) => r.bom.filter((b) => !(b.qty > 0) && (b.existingQty ?? 0) > 0)
/** "Existing equipment (not quoted): 4 × Jinko … already on site." — '' when nothing is entirely on site. */
export function existingNote(r: Results, lang: ExportLang, L: ExportLabels) {
  const xs = onSiteOnlyLines(r)
  return xs.length ? L.pdf.existingNote(xs.map((b) => L.pdf.existingItem(qtyText(b.existingQty ?? 0), lineName(b, lang, L))).join(lang === 'ar' ? '، ' : '; ')) : ''
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
type CompanyText = 'name' | 'tagline' | 'terms'
const known = (k: CompanyText) => new Set([norm(defaultCompany[k]), defaultsFor('en')[k], defaultsFor('ar')[k], k === 'terms' ? norm(exportLabels.ar.pdf.defaultTerms) : ''].filter(Boolean))
const AR_KEY = { name: 'nameAr', tagline: 'taglineAr', terms: 'termsAr' } as const
/** The company's own text for a document language: the Arabic field for Arabic documents, the main field for English, each falling back to the other; '' when only placeholders are left. */
function ownText(c: CompanySettings, k: CompanyText, lang: ExportLang) {
  const real = (v?: string | null) => (norm(v) && !known(k).has(norm(v)) ? norm(v) : '')
  const main = real(c[k]), ar = real(c[AR_KEY[k]])
  return lang === 'ar' ? ar || main : main || ar
}
/** true when the company has no name of its own (empty or the placeholder) in either language. */
export const isDefaultCompanyName = (c: CompanySettings) => !ownText(c, 'name', 'en')
/** Company name printed on a document in this language; '' while it is still the placeholder (documents then leave it off). */
export const companyNameFor = (c: CompanySettings, lang: ExportLang) => ownText(c, 'name', lang)
/**
 * Company settings for a document language: Arabic name / tagline / terms for Arabic documents and the main ones for English
 * (each falling back to the other), with untouched placeholder texts swapped to the document language.
 */
export function localizeCompany(c: CompanySettings, lang: ExportLang): CompanySettings {
  const d = defaultsFor(lang)
  const pick = (k: CompanyText) => ownText(c, k, lang) || d[k] || norm(c[k])
  return { ...c, name: pick('name'), tagline: pick('tagline'), terms: pick('terms') }
}
/**
 * Company as printed on a document: localized, and without the placeholder name — a document never shows "Your Solar Company"
 * (the header then has the logo and contact only). The placeholder tagline goes with the placeholder name.
 */
export function docCompany(c: CompanySettings, lang: ExportLang): CompanySettings {
  const l = localizeCompany(c, lang)
  const name = companyNameFor(c, lang)
  return { ...l, name, tagline: name || ownText(c, 'tagline', lang) ? l.tagline : '' }
}
export const termsText = (c: CompanySettings, lang: ExportLang) => norm(localizeCompany(c, lang).terms)

// ---- document identity: title, file names, savings section
const DEFAULT_PROJECT_NAMES = new Set([uiEn.info.defaultName, uiAr.info.defaultName, uiEn.info.defaultQuoteName, uiAr.info.defaultQuoteName, 'New solar project'].map(norm))
/** Empty or an untouched default project name ("New quote", «عرض سعر جديد» …). */
export const isDefaultProjectName = (name?: string | null) => !norm(name) || DEFAULT_PROJECT_NAMES.has(norm(name))
/** "5.8 kWp hybrid" / «نظام هجين 5.8 kWp» / "10 kWh battery backup"; '' for a product quote or an empty design. */
export function systemDescriptor(p: Project, r: Results, L: ExportLabels) {
  if (r.mode === 'items') return ''
  if (r.arrayKwp > 0) return L.pdf.descriptor(num(Math.round(r.arrayKwp * 10) / 10, 1), L.pdf.sysShort[p.design.systemType] ?? p.design.systemType)
  return r.batteryKwh > 0 ? L.pdf.descriptorBackup(num(Math.round(r.batteryKwh * 10) / 10, 1)) : ''
}
/**
 * Project title printed on the documents and used for the file name: the project name, or — while it is still a default name —
 * the client name with a short system descriptor ("Osman Ali — 5.8 kWp hybrid"), else the reference.
 */
export function docTitle(p: Project, r: Results, lang: ExportLang) {
  if (!isDefaultProjectName(p.name)) return norm(p.name)
  const client = norm(p.clientName), desc = systemDescriptor(p, r, labelsFor(lang))
  if (client) return desc ? `${client} — ${desc}` : client
  return norm(p.reference) || desc || '—'
}
/** File-name stem: reference + document title (the reference once when the title is the reference). */
export function docFileStem(p: Project, r: Results, lang: ExportLang) {
  const ref = norm(p.reference), title = docTitle(p, r, lang)
  return !ref || title === ref ? fileStem(title === '—' ? '' : title) : `${fileStem(ref)}_${fileStem(title)}`
}
/** Longest download file name (UTF-8 bytes): well under the 255-byte limit of common file systems and share targets. */
export const MAX_FILE_NAME_BYTES = 120
// Measured decomposed (NFD): macOS and some share targets store names decomposed, and «ؤ», «أ» … take 2 more bytes there
const utf8Len = (s: string) => new TextEncoder().encode(s.normalize('NFD')).length
/** Cut to at most `max` UTF-8 bytes on a character boundary, without a dangling separator. */
export function capBytes(s: string, max: number) {
  if (utf8Len(s) <= max) return s
  let out = '', n = 0
  for (const ch of s) { const b = utf8Len(ch); if (n + b > max) break; out += ch; n += b }
  return out.replace(/[_.\-\s]+$/, '')
}
/** Download file name: `<stem>-<suffix>.<ext>` (no suffix: `<stem>.<ext>`), the stem shortened so the whole name stays ≤ 120 bytes. */
export function docFileName(p: Project, r: Results, lang: ExportLang, suffix: string, ext: string) {
  const tail = `${suffix ? '-' + suffix : ''}.${ext}`
  return `${capBytes(docFileStem(p, r, lang), MAX_FILE_NAME_BYTES - utf8Len(tail)) || 'solar-project'}${tail}`
}
/** Payback above this (years) hides savings and payback from the proposal in automatic mode. */
export const FINANCE_MAX_PAYBACK_YEARS = 12
export type FinanceReason = 'na' | 'off' | 'on' | 'ok' | 'no-savings' | 'payback'
/**
 * Does the client proposal show the savings and payback tiles, the cash flow and the financial note? `project.proposalFinance`:
 * true / false, or missing → automatic: only when the system saves money and pays back within 12 years. Never without panels
 * (battery backup only) or for a product quote.
 */
export function proposalFinance(p: Project, r: Results): { show: boolean; auto: boolean; reason: FinanceReason } {
  const auto = p.proposalFinance == null
  if (r.mode === 'items' || isBackupOnly(r) || !(r.annualProductionKwh > 0)) return { show: false, auto, reason: 'na' }
  if (p.proposalFinance === true) return { show: true, auto, reason: 'on' }
  if (p.proposalFinance === false) return { show: false, auto, reason: 'off' }
  if (!(r.annualSavingsUsd > 0) || r.paybackYears == null || !Number.isFinite(r.paybackYears)) return { show: false, auto, reason: 'no-savings' }
  return r.paybackYears <= FINANCE_MAX_PAYBACK_YEARS ? { show: true, auto, reason: 'ok' } : { show: false, auto, reason: 'payback' }
}
/** Cost per kWh the savings are valued at (USD): the blended avoided cost from the engine, else the grid tariff. */
export const avoidedCostUsd = (p: Project, r: Results) => (Number.isFinite(r.avoidedCostUsdPerKwh) && r.avoidedCostUsdPerKwh > 0 ? r.avoidedCostUsdPerKwh : p.site.gridTariff)

// Catalogue model names print units without a space ("580W", "51.2V 200Ah"): documents use "580 W". Only a number that does not
// follow a letter is touched, so model codes such as JKM580N or SUN-8K stay as they are.
const UNIT_GLUED = /(?<![A-Za-z0-9.,])(\d+(?:[.,]\d+)?)(kWp|kWh|kW|kVA|MWh|Wp|Wh|Ah|V|A|W)(?![A-Za-z0-9²³])/g
/** "51.2V 200Ah" → "51.2 V 200 Ah" (catalogue names and specs on documents). */
export const unitSpace = (s: string) => String(s ?? '').replace(UNIT_GLUED, '$1 $2')
/** Brand + model of a catalogue product as printed on documents. */
export const productName = (x: { brand: string; model: string }) => unitSpace(`${x.brand} ${x.model}`)

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

/** File-name stem: keeps Arabic letters and decimal points ("5.8"), drops characters that are illegal in file names; ≤ 100 bytes. */
export const fileStem = (name: string) => capBytes((name || 'solar-project').trim().replace(/[\\/:*?"<>|]+/g, '').replace(/(?<!\d)\.|\.(?!\d)/g, '_')
  .replace(/[^\w؀-ۿ.-]+/g, '_').replace(/_+/g, '_').replace(/^_+|_+$/g, ''), 100) || 'solar-project'
