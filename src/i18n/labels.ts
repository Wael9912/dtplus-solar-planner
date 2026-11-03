// Display helpers that turn engine/data values (English keys) into localized labels.
import type { Appliance, Check, LoadItem, StepKey } from '../engine/types'
import { appliances } from '../data/appliances'
import type { Dict } from './en'
import { en as EN } from './en'
import { ar as AR } from './ar'
import type { Lang } from './index'

/** First-strong isolate: use inside <option>, placeholders, title/aria attributes and SVG text so numbers + Latin units keep their order in RTL. */
export const iso = (s: string) => '\u2068' + s + '\u2069'

const byName = new Map<string, Appliance>()
for (const a of appliances) { byName.set(a.name.trim().toLowerCase(), a); if (a.nameAr) byName.set(a.nameAr.trim(), a) }
/** The library appliance a load row was created from (matched by its English or Arabic name). */
export const matchAppliance = (name: string): Appliance | undefined => byName.get(name.trim().toLowerCase()) ?? byName.get(name.trim())
export const applianceName = (a: Appliance, lang: Lang) => (lang === 'ar' ? a.nameAr ?? a.name : a.name)
/** Load name in the UI language when the row matches a library appliance; the typed name otherwise. */
export function loadName(l: Pick<LoadItem, 'name'>, lang: Lang, t: Dict) {
  const a = l.name ? matchAppliance(l.name) : undefined
  return a ? applianceName(a, lang) : l.name.trim() || t.loads.unnamed
}
export const catLabel = (c: string, t: Dict) => t.loads.categories[c] ?? c
export const bomCatLabel = (c: string, t: Dict) => t.bom.cats[c] ?? c
export const unitLabel = (u: string, t: Dict) => t.bom.units[u] ?? u

interface NamedLine { id: string; name: string; nameAr?: string; spec: string; specAr?: string; source: 'auto' | 'custom' }
export function bomLineName(l: NamedLine, lang: Lang, t: Dict) {
  if (l.source === 'custom') return l.name.trim() || t.bom.customItem
  if (t.bom.serviceNames[l.id]) return t.bom.serviceNames[l.id]
  return lang === 'ar' ? l.nameAr || l.name : l.name
}
export const bomLineSpec = (l: NamedLine, lang: Lang) => (lang === 'ar' ? l.specAr || l.spec : l.spec)

export const checkText = (c: Check, lang: Lang) => (lang === 'ar' ? c.messageAr || c.message : c.message)
/** Fallback check → step map for checks the engine has not tagged with `step` (ux-report appendix A). */
const CHECK_STEP: Record<string, StepKey> = {
  'no-loads': 'loads', 'load-phase': 'info', area: 'site', 'fx-missing': 'site', 'fx-unset': 'site', 'fx-invalid': 'site', 'low-tariff': 'site',
  deficit: 'design', 'no-inverter': 'design', 'inv-small': 'design', 'inv-surge': 'design', 'inv-phase': 'design', 'lv-bus': 'design', 'pv-input': 'design',
  'dcac-high': 'design', 'dcac-low': 'design', 'isc-mppt': 'design', 'imp-mppt': 'design', strings: 'design', 'inv-charger': 'design',
  'no-batt': 'design', 'batt-parallel': 'design', 'batt-discharge': 'design', 'batt-charge': 'design', 'charge-time': 'design',
  'vdrop-dc': 'design', 'vdrop-battery': 'design', 'vdrop-ac': 'design', 'total-zero': 'bom', 'price-zero': 'bom',
}
export const checkStep = (c: Check): StepKey | null => (c.id === 'all-ok' ? null : c.step ?? CHECK_STEP[c.id] ?? (c.id.startsWith('fx') ? 'site' : 'design'))

export function derateLabel(name: string, t: Dict) {
  if (t.results.derateNames[name]) return t.results.derateNames[name]
  const m = /^Battery round-trip \((\d+(?:\.\d+)?)% via battery\)/i.exec(name)
  return m ? t.results.battRoundTrip(m[1]) : name
}

/** Arabic for the engine's string-design notes (English sentences with numbers). Unknown notes stay in English. */
export function stringNote(note: string, lang: Lang) {
  if (lang !== 'ar') return note
  let m = /^Voltage window too narrow: need ≥\s*(\d+) panels\/string for MPPT min but max is (\d+)\.?$/.exec(note)
  if (m) return `نطاق الجهد ضيق جداً: يلزم ${m[1]} ألواح على الأقل في السلسلة لبلوغ الحد الأدنى لـ MPPT، بينما الحد الأقصى المسموح ${m[2]}.`
  m = /^Panel count adjusted from (\d+) to (\d+) to give (\d+) equal strings of (\d+)\.?$/.exec(note)
  if (m) return `عُدِّل عدد الألواح من ${m[1]} إلى ${m[2]} للحصول على ${m[3]} سلاسل متساوية، في كلٍّ منها ${m[4]} ألواح.`
  m = /^(\d+) strings exceed inverter MPPT capacity \((\d+)\); add a combiner box or a larger\/second inverter\.?$/.exec(note)
  if (m) return `عدد السلاسل (${m[1]}) يتجاوز سعة مداخل MPPT في الإنفرتر (${m[2]})؛ أضف صندوق تجميع أو استخدم إنفرتراً أكبر أو إنفرتراً إضافياً.`
  return note
}

const DEVICE_AR: Record<string, string> = { 'gPV fuse': 'فيوز gPV', 'gPV NH fuse': 'فيوز gPV نوع NH', 'class-T fuse': 'فيوز class-T', 'DC fuse / DC MCCB': 'فيوز DC / قاطع MCCB للتيار المستمر', 'MCB/MCCB': 'قاطع MCB/MCCB' }
/** Protective-device description from the cable schedule. */
export const deviceLabel = (s: string, lang: Lang) => (lang === 'ar' ? DEVICE_AR[s] ?? s : s)

/** dd/mm/yyyy with Western digits in both languages. */
export function fmtDate(d: string | Date) {
  const x = new Date(d); if (Number.isNaN(x.getTime())) return '—'
  const p = (n: number) => String(n).padStart(2, '0')
  return `${p(x.getDate())}/${p(x.getMonth() + 1)}/${x.getFullYear()}`
}

/** Project title for display: default names follow the UI language; empty names get a placeholder. */
export function projectTitle(name: string, t: Dict) {
  const n = name.trim()
  if (!n) return t.projects.untitled
  if (n === EN.info.defaultName || n === AR.info.defaultName) return t.info.defaultName
  if (n === EN.info.defaultQuoteName || n === AR.info.defaultQuoteName) return t.info.defaultQuoteName
  return n
}
/** Company name for display: the untouched default follows the UI language. */
export function companyTitle(name: string) {
  const n = name.trim()
  return !n || n === EN.settings.defaultName || n === AR.settings.defaultName ? null : n
}
