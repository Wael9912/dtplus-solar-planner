// Engineering tools stress (src/engine/tools.ts, src/components/tools/state.ts): seeded fuzz of the four calculators with realistic,
// boundary and hostile inputs, physical invariants on paired inputs, every catalogue product, and the saved-input normaliser.
// tests/stress.test.ts §5 covers "garbage → invalid or finite"; this file checks that the answers are physically right.
// Formulas: docs/sizing-methodology.md §4 (battery), §5 / §11 (inverter, generator), §7 (strings), §8 (cables and protection).
//
// Reproduce a failure: every case is generated from SEED and its index only; messages print `#i` and the input.
//   STRESS_SEED=7 STRESS_N=20000 npx vitest run tests/tools-stress.test.ts
import { describe, it, expect, beforeAll } from 'vitest'
import {
  checkStrings, panelSpec, inverterMppt, controllerMppt, sizeBatteryBank, batterySpec, sizeCircuit, sizeGenerator, ambientFactor, currentFromPower,
  START_FACTOR, STD_INV_KW, K_AMB_TABLE, type StringCheckInput, type StringCheck, type BatteryBankInput, type BatteryBank, type CableToolInput, type CableTool,
  type GeneratorInput, type GeneratorSizing, type CircuitKind, type StartMethod, type Insulation, type Bus,
} from '../src/engine/tools'
import { fitsSystemVoltage } from '../src/engine/compute'
import { AMPACITY, COPPER_RHO_HOT, STD_BATTERY_FUSE_A, STD_CABLE_MM2, STD_DC_FUSE_A, STD_GENERATOR_KVA, STD_MCB_A, STD_PV_FUSE_A } from '../src/engine/standards'
import { normalizeToolState } from '../src/components/tools/state'
import { catalog } from '../src/data/catalog'
import type { Chemistry } from '../src/engine/types'

// ====================================================================================================== seeded PRNG (as stress.test.ts)
const SEED = Number(process.env.STRESS_SEED ?? 20261104)
const N = Number(process.env.STRESS_N ?? 5000)
function rngFor(seed: number) {
  let a = seed >>> 0
  const next = () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
  return {
    next,
    chance: (p: number) => next() < p,
    int: (lo: number, hi: number) => lo + Math.floor(next() * (hi - lo + 1)),
    num: (lo: number, hi: number) => lo + next() * (hi - lo),
    pick: <T,>(xs: readonly T[]): T => xs[Math.floor(next() * xs.length)],
  }
}
type Rng = ReturnType<typeof rngFor>
const seedOf = (i: number, salt = 0) => (SEED ^ Math.imul(i + 1, 2654435761) ^ Math.imul(salt + 1, 40503)) >>> 0
const r2 = (x: number) => Math.round(x * 100) / 100

// ====================================================================================================== helpers
/** Violation buckets: category → count + first examples. `expect(V.report()).toEqual({})` prints them all on failure. */
class Violations {
  readonly buckets = new Map<string, { count: number; examples: string[] }>()
  readonly seen = new Map<string, number>()
  checks = 0
  check(ok: boolean, cat: string, msg: () => string) {
    this.checks++
    if (ok) return
    const b = this.buckets.get(cat) ?? { count: 0, examples: [] }
    b.count++; if (b.examples.length < 4) b.examples.push(msg())
    this.buckets.set(cat, b)
  }
  hit(k: string) { this.seen.set(k, (this.seen.get(k) ?? 0) + 1) }
  report(prefix = '') { return Object.fromEntries([...this.buckets].filter(([k]) => k.startsWith(prefix)).map(([k, b]) => [k, `${b.count}× ${b.examples.join(' ‖ ')}`])) }
}
const show = (x: unknown) => JSON.stringify(x, (_k, v) => (typeof v === 'bigint' ? `${v}n` : typeof v === 'number' && !Number.isFinite(v) ? String(v) : v === undefined ? '∅' : v))
/** Keys a result may leave undefined (optional CableResult / StringDesign fields, row extras). */
const OPTIONAL = new Set(['id', 'label', 'labelAr', 'fuseA', 'deviceType', 'deviceRatedV', 'extra', 'issue', 'notesAr', 'maxSystemVoltageV', 'viaController', 'count'])
/** Paths of non-finite numbers and of undefined values (outside OPTIONAL) anywhere in a result. */
function holes(x: unknown, path = '$', out: string[] = []): string[] {
  if (typeof x === 'number') { if (!Number.isFinite(x)) out.push(`${path}=${x}`) }
  else if (x === undefined) { if (!OPTIONAL.has(path.slice(path.lastIndexOf('.') + 1))) out.push(`${path}=undefined`) }
  else if (Array.isArray(x)) x.forEach((v, i) => holes(v, `${path}[${i}]`, out))
  else if (x && typeof x === 'object') for (const [k, v] of Object.entries(x)) holes(v, `${path}.${k}`, out)
  return out
}
const LEVELS = new Set(['pass', 'warn', 'fail'])
const levelsOk = (r: { level?: string; rows?: { level: string }[] }) => (r.level === undefined || LEVELS.has(r.level)) && (r.rows ?? []).every((x) => LEVELS.has(x.level))
const geq = (a: number, b: number, rel = 1e-9) => a >= b - rel * Math.max(1, Math.abs(a), Math.abs(b))
const close = (a: number, b: number, rel = 1e-9) => Math.abs(a - b) <= rel * Math.max(1, Math.abs(a), Math.abs(b))
/** null = "above the standard list" = larger than any size. */
const orInf = (x: number | null) => x ?? Infinity

/** Finite but absurd numbers, non-finite numbers, and non-numbers a stale or hand-edited input could hold. */
const EDGE = [0, -0, -1, -1e-9, 1e-12, 1e-6, 1e9, 1e15, 1e300, -1e300, Number.MAX_VALUE, Number.MIN_VALUE, Number.NaN, Infinity, -Infinity]
const HOSTILE: unknown[] = [null, undefined, '', '48', true, false, {}, [], [12], { valueOf: () => 7 }, 10n]
/** Per-case hostility: most cases are clean (so the invariants get many valid results), some perturb one field, a few many. */
const hostility = (r: Rng) => r.pick([0, 0, 0, 0, 0.03, 0.08, 0.25])
/** One field: the realistic value, or (with probability p) a validator bound ± a hair, an edge number or a non-number. */
function fld<T>(r: Rng, p: number, real: T, lo?: number, hi?: number): T {
  if (!r.chance(p)) return real
  const u = r.next()
  if (u < 0.5 && lo !== undefined && hi !== undefined) {
    const hair = (x: number) => 1e-9 * Math.max(1, Math.abs(x))
    return r.pick([lo, hi, lo - hair(lo), hi + hair(hi), lo + (hi - lo) * 1e-6, hi - (hi - lo) * 1e-6]) as T
  }
  return (u < 0.85 ? r.pick(EDGE) : r.pick(HOSTILE)) as T
}

// ====================================================================================================== generators
const MPPT_INVERTERS = catalog.inverters.filter((i) => i.mpptCount > 0)
const BATTERY_INVERTERS = catalog.inverters.filter((i) => i.type !== 'gridtie' && i.batteryVoltage != null)
const CHEMS: Chemistry[] = ['LiFePO4', 'NMC', 'AGM', 'Gel', 'Flooded']
const STARTS = Object.keys(START_FACTOR) as StartMethod[]
const CIRCUITS: CircuitKind[] = ['pv', 'battery', 'ac1', 'ac3']
const INSULATIONS: Insulation[] = ['pvc', 'xlpe']

function genStrings(r: Rng): StringCheckInput {
  const p = hostility(r)
  // module: a catalogue panel, a catalogue panel scaled ±40 %, or an invented datasheet (incl. small 12 V modules)
  let m = panelSpec(r.pick(catalog.panels))
  const kind = r.next()
  if (kind > 0.75) {
    const small = r.chance(0.25)
    const vmp = small ? r.num(8, 20) : r.num(25, 50), watts = small ? r.int(5, 120) : r.int(250, 720), imp = watts / vmp
    m = {
      watts, vmp: r2(vmp), voc: r2(vmp * r.num(1.12, 1.3)), imp: r2(imp), isc: r2(imp * r.num(1.02, 1.1)), tempCoeffVocPctPerC: r2(r.num(-0.4, -0.2)),
      tempCoeffPmaxPctPerC: r2(r.num(-0.5, -0.25)), noct: r.int(40, 50), maxSystemVoltage: r.pick([null, 600, 1000, 1500]), maxSeriesFuseA: r.pick([null, 10, 15, 20, 25, 30, 35]),
    }
  } else if (kind > 0.5) {
    const k = r.num(0.6, 1.4)
    m = { ...m, voc: r2(m.voc! * k), vmp: r2(m.vmp! * k), isc: r2(m.isc! * r.num(0.8, 1.2)), imp: r2(m.imp! * r.num(0.8, 1.0)) }
    if (m.imp! > m.isc!) m.imp = m.isc
  }
  // MPPT input: a catalogue inverter, a catalogue charge controller on one of its buses, or an invented datasheet
  const busV = r.pick([12, 24, 36, 48])
  const src = r.next()
  let mp = src < 0.55 ? inverterMppt(r.pick(MPPT_INVERTERS)) : src < 0.8
    ? (() => { const c = r.pick(catalog.chargeControllers); return controllerMppt(c, r.chance(0.9) ? r.pick(c.batteryVoltages) : busV, m) })()
    : (() => {
      const maxPv = r.pick([100, 150, 250, 450, 500, 550, 600, 800, 1000, 1100, 1500]), hi = maxPv * r.num(0.7, 0.95)
      return { maxPvVoltage: maxPv, mpptMaxV: r2(hi), mpptMinV: r2(hi * r.num(0.1, 0.5)), mpptCount: r.int(1, 12), maxInputCurrentPerMppt: r.pick([10, 12.5, 13, 16, 18, 20, 22, 26, 32, 36, 40]), maxPvInputKw: r.chance(0.3) ? null : r2(r.num(1, 150)) }
    })()
  mp = {
    maxPvVoltage: fld(r, p, mp.maxPvVoltage, 1, 3000), mpptMinV: fld(r, p, mp.mpptMinV, 0, 2000), mpptMaxV: fld(r, p, mp.mpptMaxV, 1, 3000), mpptCount: fld(r, p, mp.mpptCount, 1, 100),
    maxInputCurrentPerMppt: fld(r, p, mp.maxInputCurrentPerMppt, 0.1, 2000), maxPvInputKw: fld(r, p, mp.maxPvInputKw, 0, 100000),
  }
  m = {
    watts: fld(r, p, m.watts, 1, 5000), voc: fld(r, p, m.voc, 1, 2000), vmp: fld(r, p, m.vmp, 0.5, 2000), isc: fld(r, p, m.isc, 0.1, 100), imp: fld(r, p, m.imp, 0.05, 100),
    tempCoeffVocPctPerC: fld(r, p, m.tempCoeffVocPctPerC, -1, 0), tempCoeffPmaxPctPerC: fld(r, p, m.tempCoeffPmaxPctPerC, -1, 0), noct: fld(r, p, m.noct, 20, 70),
    maxSystemVoltage: fld(r, p, m.maxSystemVoltage ?? null, 1, 3000), maxSeriesFuseA: fld(r, p, m.maxSeriesFuseA ?? null, 1, 200),
  }
  const low = r.int(-30, 25)
  return {
    module: m, mppt: mp, units: fld(r, p, r.chance(0.85) ? r.int(1, 4) : r.int(5, 20), 1, 1000),
    panelCount: fld(r, p, r.chance(0.15) ? null : r.chance(0.9) ? r.int(1, 300) : r.int(301, 5000), 1, 100000),
    recordLowC: fld(r, p, low, -50, 40), hotAmbientC: fld(r, p, r.int(Math.max(low, 25), 55), -20, 60), codeLimitV: r.pick([1000, 1500]),
  }
}

function genBattery(r: Rng): BatteryBankInput {
  const p = hostility(r)
  const fromCat = r.chance(0.6)
  const bat = r.pick(catalog.batteries)
  let module = batterySpec(bat)
  if (!fromCat) {
    const chemistry = r.pick(CHEMS), lead = chemistry === 'AGM' || chemistry === 'Gel' || chemistry === 'Flooded'
    const V = lead ? r.pick([2, 6, 12, 24]) : r.pick([12.8, 25.6, 48, 51.2, 102.4, 204.8, 409.6]), Ah = r.pick([7, 50, 100, 150, 200, 280, 314])
    module = {
      chemistry, nominalVoltage: V, capacityAh: Ah, energyKwh: r.chance(0.7) ? null : r2((V * Ah / 1000) * r.num(0.9, 1.05)), usableDodPct: lead ? r.int(30, 80) : r.int(80, 100),
      maxChargeA: r.chance(0.3) ? null : r2(Ah * r.num(0.1, 1)), maxDischargeA: r.chance(0.3) ? null : r2(Ah * r.num(0.2, 1.5)), parallelMax: r.chance(0.4) ? null : r.int(1, 16),
    }
  }
  module = {
    chemistry: module.chemistry, nominalVoltage: fld(r, p, module.nominalVoltage, 1, 2000), capacityAh: fld(r, p, module.capacityAh, 0.1, 100000),
    energyKwh: fld(r, p, module.energyKwh, 0.01, 10000), usableDodPct: fld(r, p, module.usableDodPct, 10, 100), maxChargeA: fld(r, p, module.maxChargeA, 0.1, 100000),
    maxDischargeA: fld(r, p, module.maxDischargeA, 0.1, 100000), parallelMax: fld(r, p, module.parallelMax, 1, 1000),
  }
  // mostly a bus the module fits (as BatteryTool's pickBattery moves it), sometimes any
  const fits = (['hv', 48, 24, 12] as Bus[]).filter((b) => fitsSystemVoltage(batteryLike(module), b))
  const bus: Bus = fits.length && r.chance(0.85) ? r.pick(fits) : r.pick([12, 24, 48, 'hv'] as Bus[])
  const basis = r.pick(['load', 'energy'] as const)
  return {
    basis, loadW: fld(r, p, basis === 'energy' && r.chance(0.3) ? null : r.int(50, 30000), 0.1, 1e7), hours: fld(r, p, r2(r.num(0.25, 48)), 0.01, 240),
    energyKwh: fld(r, p, r2(r.num(0.5, 300)), 0.001, 100000), module, battery: fromCat && r.chance(0.8) ? bat : null, bus,
    dodOverridePct: fld(r, p, r.chance(0.7) ? null : r.int(30, 100), 10, 100), inverter: r.chance(0.4) ? null : r.pick(r.chance(0.8) ? BATTERY_INVERTERS : catalog.inverters),
    cableRunM: fld(r, p, r2(r.num(0.5, 15)), 0.1, 500),
  }
}
const batteryLike = (m: BatteryBankInput['module']) => ({ nominalVoltage: typeof m.nominalVoltage === 'number' ? m.nominalVoltage : 0 }) as Parameters<typeof fitsSystemVoltage>[0]

function genCable(r: Rng): CableToolInput {
  const p = hostility(r)
  const circuit = r.pick(CIRCUITS)
  const voltage = r.chance(0.1) ? r2(r.num(1, 1500)) : circuit === 'pv' ? r.int(100, 1000) : circuit === 'battery' ? r.pick([12, 24, 48, 51.2, 102.4, 400, 600]) : circuit === 'ac1' ? r.pick([110, 120, 220, 230, 240]) : r.pick([380, 400, 415, 480])
  return {
    circuit, by: r.pick(['current', 'power'] as const), currentA: fld(r, p, r.chance(0.9) ? r2(r.num(0.5, 600)) : r2(r.num(600, 5000)), 0.01, 100000),
    powerKw: fld(r, p, r2(r.num(0.1, 300)), 0.001, 100000), pf: fld(r, p, r2(r.num(0.6, 1)), 0.1, 1), voltage: fld(r, p, voltage, 1, 1500),
    lengthM: fld(r, p, r.chance(0.9) ? r2(r.num(0.5, 200)) : r2(r.num(200, 3000)), 0.1, 10000), maxDropPct: fld(r, p, r2(r.num(0.5, 5)), 0.1, 20),
    ambientC: fld(r, p, r.chance(0.8) ? r.int(-10, 85) : r2(r.num(-40, 90)), -40, 80), insulation: r.pick(INSULATIONS),
  }
}

function genGenerator(r: Rng): GeneratorInput {
  const p = hostility(r)
  const running = r.chance(0.9) ? r2(r.num(0.2, 300)) : r2(r.num(300, 3000))
  return {
    runningKw: fld(r, p, running, 0.01, 100000), motorKw: fld(r, p, r.chance(0.25) ? null : r.chance(0.85) ? r2(r.num(0, Math.min(running, 150))) : r2(r.num(running, running * 2)), 0, 100000),
    start: r.pick(STARTS), pf: fld(r, p, r2(r.num(0.6, 1)), 0.5, 1), chargeKw: fld(r, p, r.chance(0.3) ? null : r2(r.num(0, 40)), 0, 100000), ambientC: fld(r, p, r.int(-10, 55), -20, 60),
  }
}

// ====================================================================================================== invariants
const STRING_FIELDS = new Set(['watts', 'voc', 'vmp', 'isc', 'imp', 'tcVoc', 'tcPmax', 'noct', 'maxSysV', 'maxFuse', 'maxPvV', 'mpptMin', 'mpptMax', 'mpptCount', 'maxA', 'maxPvKw', 'units', 'panelCount', 'low', 'hot'])
const BATTERY_FIELDS = new Set(['loadW', 'hours', 'energy', 'V', 'Ah', 'kWh', 'dod', 'maxChargeA', 'maxDischargeA', 'parallelMax', 'dodOverride', 'run'])
const CABLE_FIELDS = new Set(['current', 'power', 'pf', 'voltage', 'length', 'drop', 'ambient'])
const GEN_FIELDS = new Set(['running', 'motor', 'pf', 'charge', 'ambient'])

/** Run a tool, catch throws, check the invalid / valid envelope; returns the valid result or null. */
function run<T extends { valid: true }>(V: Violations, tool: string, tag: string, x: unknown, fn: () => T | { valid: false; invalid: string[] }, fields: Set<string>, slow: { ms: number; tag: string }): T | null {
  let out: T | { valid: false; invalid: string[] }
  const t0 = performance.now()
  try { out = fn() } catch (e) { V.check(false, `${tool}-throws`, () => `${tag} ${(e as Error).message} ← ${show(x)}`); return null }
  const ms = performance.now() - t0
  if (ms > slow.ms) { slow.ms = ms; slow.tag = `${tag} ← ${show(x)}` }
  if (!out.valid) {
    V.hit(`${tool}:invalid`)
    V.check(Array.isArray(out.invalid) && out.invalid.length > 0 && out.invalid.every((f) => fields.has(f)) && new Set(out.invalid).size === out.invalid.length, `${tool}-invalid-shape`, () => `${tag} ${show(out)}`)
    return null
  }
  V.hit(`${tool}:valid`)
  const lv = (out as { level?: string }).level
  if (lv) V.hit(`${tool}:${lv}`)
  const h = holes(out)
  V.check(h.length === 0, `${tool}-holes`, () => `${tag} ${h.slice(0, 4).join(' ')} ← ${show(x)}`)
  V.check(levelsOk(out as { level?: string; rows?: { level: string }[] }), `${tool}-level`, () => `${tag} ${show(out)}`)
  return out as T
}

function stringInvariants(V: Violations, tag: string, x: StringCheckInput, s: StringCheck) {
  const m = x.module as Required<{ [K in keyof StringCheckInput['module']]: number }>, p = x.mppt as { [K in keyof StringCheckInput['mppt']]: number }
  const c = (ok: boolean, cat: string, what: () => string) => V.check(ok, `strings-${cat}`, () => `${tag} ${what()} ← ${show(x)}`)
  // §7 temperatures, recomputed from the inputs
  const vocCold = m.voc * (1 + (m.tempCoeffVocPctPerC / 100) * (x.recordLowC! - 25))
  c(close(s.vocColdModule, vocCold), 'voc-cold', () => `${s.vocColdModule} ≠ ${vocCold}`)
  c(x.recordLowC! > 25 || geq(s.vocColdModule, m.voc), 'voc-cold-below-stc', () => `cold Voc ${s.vocColdModule} < STC ${m.voc} at ${x.recordLowC} °C`)
  c(s.cellHotC < 25 || s.vmpHotModule <= m.vmp * (1 + 1e-12), 'vmp-hot-above-stc', () => `hot Vmp ${s.vmpHotModule} > STC ${m.vmp}`)
  c(s.vmpHotModule > 0, 'vmp-hot-positive', () => `hot Vmp ${s.vmpHotModule}`)
  c(s.vLimit <= s.vHard + 1e-9 && s.vHard <= p.maxPvVoltage + 1e-9 && s.vHard <= (m.maxSystemVoltage ?? 1500) + 1e-9 && s.vHard <= x.codeLimitV + 1e-9, 'limits', () => `vLimit ${s.vLimit} vHard ${s.vHard}`)
  c(s.rangeOk === (s.seriesMaxVoc >= 1 && s.seriesMax >= s.seriesMin), 'range-flag', () => `rangeOk ${s.rangeOk} ${s.seriesMin}…${s.seriesMax}`)
  c(!s.rangeOk || s.level !== 'fail' || s.rows.some((r) => r.level === 'fail'), 'fail-without-reason', () => `level fail with range ok and no failed row`)
  c(s.rangeOk || s.level === 'fail', 'range-not-fail', () => `range ${s.seriesMin}…${s.seriesMax} but level ${s.level}`)
  c(x.panelCount != null ? !!s.layout : !s.layout && s.rows.length === 0, 'layout-presence', () => `panelCount ${x.panelCount}, layout ${show(s.layout)}`)
  const L = s.layout
  if (!L) return
  const n = L.panelsPerString
  c(Number.isInteger(n) && n >= 1 && Number.isInteger(L.strings) && L.strings >= 1 && L.totalPanels === n * L.strings, 'layout-shape', () => show(L))
  // the nearest equal layout covers the panels with less than one string's worth of spares
  c(L.totalPanels >= x.panelCount! && L.totalPanels - x.panelCount! < n, 'layout-count', () => `${x.panelCount} panels → ${L.strings} × ${n}`)
  // a feasible range → the layout lies inside it and the three voltage rows pass
  if (s.rangeOk) {
    c(n >= s.seriesMin && n <= s.seriesMax, 'layout-in-range', () => `${n} outside ${s.seriesMin}…${s.seriesMax}`)
    for (const id of ['coldVoc', 'hotVmp', 'stcVmp'] as const) c(s.rows.find((r) => r.id === id)?.level === 'pass', `row-${id}-in-range`, () => show(s.rows.find((r) => r.id === id)))
  }
  // whatever the tool says OK is physically OK (independent of its own rows)
  const iscIn = L.stringsPerMppt * m.isc, impIn = L.stringsPerMppt * m.imp, arrayKw = (L.totalPanels * m.watts) / 1000
  if (s.level !== 'fail') {
    c(n * vocCold <= s.vHard * (1 + 1e-9) + 1e-9, 'ok-cold-voc', () => `${n} × ${vocCold} V > ${s.vHard} V`)
    c(n * s.vmpHotModule >= p.mpptMinV * (1 - 1e-9) - 1e-9, 'ok-hot-vmp', () => `${n} × ${s.vmpHotModule} V < MPPT min ${p.mpptMinV} V`)
    c(L.strings <= s.capacityStrings, 'ok-inputs', () => `${L.strings} strings > ${s.capacityStrings}`)
    c(iscIn <= p.maxInputCurrentPerMppt * 1.25 * (1 + 1e-9) + 1e-9, 'ok-isc', () => `Isc ${iscIn} A per MPPT > 1.25 × ${p.maxInputCurrentPerMppt} A`)
  }
  if (s.level === 'pass') {
    c(n * vocCold <= s.vLimit * (1 + 1e-9) + 1e-9, 'pass-cold-voc', () => `${n} × ${vocCold} V > ${s.vLimit} V`)
    c(n * m.vmp <= p.mpptMaxV * (1 + 1e-9) + 1e-9, 'pass-stc-vmp', () => `${n} × ${m.vmp} V > MPPT max ${p.mpptMaxV} V`)
    c(impIn <= p.maxInputCurrentPerMppt * (1 + 1e-9) + 1e-9, 'pass-imp', () => `Imp ${impIn} A per MPPT > ${p.maxInputCurrentPerMppt} A`)
    c(!(p.maxPvInputKw > 0) || arrayKw <= p.maxPvInputKw * x.units! * (1 + 1e-9) + 1e-9, 'pass-pv-kw', () => `${arrayKw} kW > ${p.maxPvInputKw} × ${x.units}`)
  }
  // §8.3 string fuse: a standard gPV size ≥ 1.5 × Isc whenever one is required
  const f = s.fuse!
  c(!!f && f.stringsPerInput === L.stringsPerMppt, 'fuse-shape', () => show(f))
  if (f?.required && f.ratingA != null) c(STD_PV_FUSE_A.includes(f.ratingA) && f.ratingA >= m.isc * 1.5 - 1e-9, 'fuse-rating', () => `${f.ratingA} A for Isc ${m.isc} A`)
  if (f?.required && f.ratingA == null) c(s.rows.find((r) => r.id === 'fuse')?.level === 'fail', 'fuse-missing-not-fail', () => show(f))
}

function batteryInvariants(V: Violations, tag: string, x: BatteryBankInput, b: BatteryBank) {
  const c = (ok: boolean, cat: string, what: () => string) => V.check(ok, `battery-${cat}`, () => `${tag} ${what()} ← ${show(x)}`)
  const energy = x.basis === 'load' ? (x.loadW! * x.hours!) / 1000 : x.energyKwh!
  c(close(b.energyNeedKwh, energy) && close(b.usableNeedKwh, energy / 0.95), 'need', () => `need ${b.energyNeedKwh} / usable ${b.usableNeedKwh} for ${energy} kWh`)
  c([b.series, b.parallel, b.modules].every((v) => Number.isInteger(v) && v >= 1) && b.modules === b.series * b.parallel, 'counts', () => `${b.series} s × ${b.parallel} p = ${b.modules}`)
  // the bank covers the need (§4.1) and is not one parallel string too big
  c(geq(b.nominalKwh, b.nominalNeedKwh) && geq(b.usableKwh, b.usableNeedKwh), 'covers', () => `bank ${b.nominalKwh} / usable ${b.usableKwh} < need ${b.nominalNeedKwh} / ${b.usableNeedKwh}`)
  c(b.parallel === 1 || (b.parallel - 1) * b.series * b.unitKwh < b.nominalNeedKwh * (1 + 1e-9), 'minimal', () => `${b.parallel} parallel, ${b.parallel - 1} would hold ${(b.parallel - 1) * b.series * b.unitKwh} ≥ ${b.nominalNeedKwh} kWh`)
  c(close(b.ah, b.parallel * x.module.capacityAh!) && close(b.nominalKwh, b.modules * b.unitKwh), 'totals', () => `${b.ah} Ah, ${b.nominalKwh} kWh`)
  if (x.basis === 'load') c(b.backupHours != null && geq(b.backupHours, x.hours!), 'backup-hours', () => `backup ${b.backupHours} h < ${x.hours} h asked`)
  c((b.backupHours == null) === !(typeof x.loadW === 'number' && x.loadW > 0), 'backup-null', () => `backupHours ${b.backupHours} with load ${x.loadW}`)
  const busRow = b.rows.find((r) => r.id === 'bus')!
  c(busRow.level === (fitsSystemVoltage(batteryLike(x.module), x.bus) ? 'pass' : 'fail'), 'bus-row', () => show(busRow))
  c(b.fuseType === (x.bus === 'hv' ? 'dc-mccb' : 'class-t'), 'fuse-type', () => b.fuseType)
  c((b.cable != null) === (b.dischargeA != null && b.dischargeA > 0), 'cable-presence', () => `cable ${show(b.cable)} discharge ${b.dischargeA}`)
  const cb = b.cable
  if (cb) {
    c(cb.sizeMm2 >= (x.bus === 'hv' ? 6 : 10), 'cable-min', () => `${cb.sizeMm2} mm²`)
    c(cb.ampacityA! + 0.05 >= b.dischargeA! * 1.25, 'cable-ampacity', () => `I_z ${cb.ampacityA} A < 1.25 × ${b.dischargeA} A`)
    if (cb.deviceStd) {
      c(STD_BATTERY_FUSE_A.includes(cb.breakerA) && cb.breakerA >= b.dischargeA! * 1.25 - 1e-9, 'fuse-rating', () => `${cb.breakerA} A for ${b.dischargeA} A`)
      c(cb.ampacityA! + 0.05 >= cb.breakerA, 'in-le-iz', () => `I_n ${cb.breakerA} A > I_z ${cb.ampacityA} A`)
    } else c(b.dischargeA! * 1.25 > STD_BATTERY_FUSE_A[STD_BATTERY_FUSE_A.length - 1] - 1e-9, 'fuse-null', () => `no standard fuse for ${b.dischargeA} A`)
  }
  if (b.cRate != null) c(close(b.cRate, b.dischargeA! / b.ah), 'c-rate', () => `${b.cRate}`)
}

function cableInvariants(V: Violations, tag: string, x: CableToolInput, t: CableTool) {
  const c = (ok: boolean, cat: string, what: () => string) => V.check(ok, `cable-${cat}`, () => `${tag} ${what()} ← ${show(x)}`)
  const byPower = x.by === 'power' && x.circuit !== 'pv'
  const I = byPower ? currentFromPower(x.circuit, x.powerKw!, x.voltage!, x.pf ?? 1) : x.currentA!
  c(close(t.currentA, I), 'current', () => `${t.currentA} ≠ ${I}`)
  c(t.kAmb === ambientFactor(x.ambientC!, x.insulation) && t.kAmb > 0, 'k-amb', () => `${t.kAmb}`)
  const cb = t.cable, runs = cb.parallelRuns ?? 1
  const factor = x.circuit === 'pv' ? 1.56 : 1.25
  c(STD_CABLE_MM2.includes(cb.sizeMm2) && cb.sizeMm2 >= t.minMm2 && Number.isInteger(runs) && runs >= 1, 'size', () => `${runs} × ${cb.sizeMm2} mm² (min ${t.minMm2})`)
  // §8: I_B × factor ≤ I_z, and I_n ≤ I_z with a standard device ≥ I_B × factor
  const table = x.circuit === 'pv' ? AMPACITY.pv : x.circuit === 'battery' ? AMPACITY.battery : x.circuit === 'ac3' ? AMPACITY.ac3 : AMPACITY.ac1
  const iz = table[cb.sizeMm2] * t.kAmb * runs
  c(close(cb.ampacityA!, Math.round(iz * 10) / 10), 'iz', () => `${cb.ampacityA} ≠ ${iz}`)
  c(iz >= I * factor * (1 - 1e-9), 'iz-current', () => `I_z ${iz} A < ${factor} × ${I} A`)
  const list = x.circuit === 'pv' ? [...STD_PV_FUSE_A, ...STD_DC_FUSE_A] : x.circuit === 'battery' ? STD_BATTERY_FUSE_A : STD_MCB_A
  if (cb.deviceStd) {
    c(list.includes(cb.breakerA) && cb.breakerA >= I * factor - 1e-9, 'device', () => `${cb.breakerA} A for ${factor} × ${I} A`)
    c(iz >= cb.breakerA * (1 - 1e-9), 'in-le-iz', () => `I_n ${cb.breakerA} A > I_z ${iz} A`)
    c(x.circuit === 'pv' || t.device !== 'mccb' || cb.breakerA > 125, 'device-kind', () => `${t.device} ${cb.breakerA} A`)
  }
  c(t.level === (cb.deviceStd === false ? 'fail' : t.dropOk ? 'pass' : 'warn') && t.dropOk === cb.dropPct <= x.maxDropPct! + 0.005, 'level', () => `${t.level} drop ${cb.dropPct} % / ${x.maxDropPct} %`)
  // voltage drop recomputed: 2 L I ρ / A / V (1-ph and DC), √3 L I ρ / A / V (3-ph)
  const drop = (mm2: number) => (((x.circuit === 'ac3' ? Math.sqrt(3) : 2) * x.lengthM! * (I / runs) * COPPER_RHO_HOT) / mm2 / x.voltage!) * 100
  c(Math.abs(cb.dropPct - drop(cb.sizeMm2)) <= 0.0051 + 1e-9 * drop(cb.sizeMm2), 'drop', () => `${cb.dropPct} % ≠ ${drop(cb.sizeMm2)} %`)
  // smallest size: no smaller standard size above the floor carries the need and meets the drop target with the same runs
  const need = Math.max(cb.deviceStd ? cb.breakerA : 0, I * factor)
  const smaller = STD_CABLE_MM2.filter((a) => a >= t.minMm2 && a < cb.sizeMm2).find((a) => table[a] * t.kAmb * runs >= need * (1 + 1e-6) && drop(a) <= x.maxDropPct! * (1 - 1e-6))
  c(smaller === undefined, 'not-smallest', () => `${cb.sizeMm2} mm² chosen, ${smaller} mm² fits`)
  c(t.awg != null, 'awg', () => `no AWG for ${cb.sizeMm2}`)
}

function generatorInvariants(V: Violations, tag: string, x: GeneratorInput, g: GeneratorSizing) {
  const c = (ok: boolean, cat: string, what: () => string) => V.check(ok, `generator-${cat}`, () => `${tag} ${what()} ← ${show(x)}`)
  const motor = x.motorKw ?? 0
  c(g.runningKw === Math.max(x.runningKw!, motor) && g.raisedToMotor === motor > x.runningKw!, 'running', () => `${g.runningKw} raised ${g.raisedToMotor}`)
  c(g.surgeKw >= g.runningKw && close(g.surgeKw, g.runningKw + motor * (START_FACTOR[x.start] - 1)), 'surge', () => `${g.surgeKw}`)
  c(geq(g.requiredKva, g.steadyKva) && geq(g.requiredKva, g.startKva) && g.steadyKva >= g.steadyKw && g.startKva >= g.surgeKw, 'kva', () => `${g.requiredKva} / ${g.steadyKva} / ${g.startKva}`)
  c(g.hot === x.ambientC! > 40 && close(g.requiredKva, Math.max(g.steadyKva, g.startKva) * (g.hot ? 1.1 : 1)), 'derate', () => `${g.requiredKva}`)
  const last = STD_GENERATOR_KVA[STD_GENERATOR_KVA.length - 1]
  if (g.generatorKva == null) c(g.requiredKva > last - 1e-9, 'gen-null', () => `null for ${g.requiredKva} kVA`)
  else {
    const i = STD_GENERATOR_KVA.indexOf(g.generatorKva)
    c(i >= 0 && geq(g.generatorKva, g.requiredKva) && (i === 0 || STD_GENERATOR_KVA[i - 1] < g.requiredKva - 1e-9), 'gen-std', () => `${g.generatorKva} kVA for ${g.requiredKva}`)
  }
  c(close(g.inverterKw, g.runningKw * 1.25), 'inv-kw', () => `${g.inverterKw}`)
  const invNeed = Math.max(g.inverterKw, g.surgeKw / 2)
  if (g.inverterStdKw == null) c(invNeed > STD_INV_KW[STD_INV_KW.length - 1] - 1e-9, 'inv-null', () => `null for ${invNeed} kW`)
  else c(STD_INV_KW.includes(g.inverterStdKw) && geq(g.inverterStdKw, invNeed), 'inv-std', () => `${g.inverterStdKw} kW for ${invNeed}`)
}

// ====================================================================================================== 1. random fuzz + paired invariants
const V = new Violations()
const slow: Record<string, { ms: number; tag: string }> = { strings: { ms: 0, tag: '' }, battery: { ms: 0, tag: '' }, cable: { ms: 0, tag: '' }, generator: { ms: 0, tag: '' } }
let elapsed = 0

beforeAll(() => {
  const t0 = performance.now()
  const strings = (tag: string, x: StringCheckInput) => run<StringCheck>(V, 'strings', tag, x, () => checkStrings(x), STRING_FIELDS, slow.strings)
  const battery = (tag: string, x: BatteryBankInput) => run<BatteryBank>(V, 'battery', tag, x, () => sizeBatteryBank(x), BATTERY_FIELDS, slow.battery)
  const cable = (tag: string, x: CableToolInput) => run<CableTool>(V, 'cable', tag, x, () => sizeCircuit(x), CABLE_FIELDS, slow.cable)
  const generator = (tag: string, x: GeneratorInput) => run<GeneratorSizing>(V, 'generator', tag, x, () => sizeGenerator(x), GEN_FIELDS, slow.generator)
  const mono = (ok: boolean, cat: string, msg: () => string) => V.check(ok, cat, msg)

  for (let i = 0; i < N; i++) {
    // ---------------------------------------------------------------- strings
    {
      const r = rngFor(seedOf(i, 1)), tag = `#${i}`
      const x = genStrings(r)
      const s = strings(tag, x)
      if (s) {
        stringInvariants(V, tag, x, s)
        // the range does not depend on the panel count
        const range = strings(tag, { ...x, panelCount: null })
        mono(!!range && range.seriesMin === s.seriesMin && range.seriesMax === s.seriesMax && range.rangeOk === s.rangeOk, 'strings-range-vs-count', () => `${tag} ${show(x)}`)
        // colder record low → higher cold Voc, never a longer allowed string
        if (x.recordLowC! > -50) {
          const y = { ...x, recordLowC: Math.max(-50, x.recordLowC! - r.int(1, 30)) }
          const t = strings(tag + ' colder', y)
          mono(!!t && geq(t.vocColdModule, s.vocColdModule) && t.seriesMaxVoc <= s.seriesMaxVoc, 'strings-mono-cold', () => `${tag} ${y.recordLowC} °C: Voc ${t?.vocColdModule} / max ${t?.seriesMaxVoc} vs ${s.vocColdModule} / ${s.seriesMaxVoc}`)
        }
        // hotter ambient → lower hot Vmp, never a shorter minimum string
        if (x.hotAmbientC! < 60) {
          const y = { ...x, hotAmbientC: Math.min(60, x.hotAmbientC! + r.int(1, 20)) }
          const t = strings(tag + ' hotter', y)
          mono(!!t && t.vmpHotModule <= s.vmpHotModule * (1 + 1e-12) && t.seriesMin >= s.seriesMin, 'strings-mono-hot', () => `${tag} ${y.hotAmbientC} °C: Vmp ${t?.vmpHotModule} / min ${t?.seriesMin} vs ${s.vmpHotModule} / ${s.seriesMin}`)
        }
        // more identical inverters → never fewer string inputs
        if (x.units! < 1000) {
          const t = strings(tag + ' units', { ...x, units: Math.min(1000, x.units! + r.int(1, 3)) })
          mono(!!t && t.capacityStrings >= s.capacityStrings, 'strings-mono-units', () => `${tag} capacity ${t?.capacityStrings} < ${s.capacityStrings}`)
        }
      }
    }
    // ---------------------------------------------------------------- battery
    {
      const r = rngFor(seedOf(i, 2)), tag = `#${i}`
      const x = genBattery(r)
      const b = battery(tag, x)
      if (b) {
        batteryInvariants(V, tag, x, b)
        // more backup hours (or more energy) → never a smaller bank
        const y: BatteryBankInput = x.basis === 'load' ? { ...x, hours: Math.min(240, x.hours! * r.num(1.01, 3)) } : { ...x, energyKwh: Math.min(100000, x.energyKwh! * r.num(1.01, 3)) }
        const t = battery(tag + ' more', y)
        mono(!!t && geq(t.nominalKwh, b.nominalKwh) && t.parallel >= b.parallel, 'battery-mono-need', () => `${tag} ${t?.nominalKwh} kWh / ${t?.parallel} p < ${b.nominalKwh} / ${b.parallel} ← ${show(y)}`)
        // a deeper allowed discharge → never a bigger bank
        const dod = (x.dodOverridePct ?? x.module.usableDodPct!)
        if (dod < 100) {
          const z = { ...x, dodOverridePct: Math.min(100, dod + r.int(1, 30)) }
          const u = battery(tag + ' dod', z)
          mono(!!u && u.nominalKwh <= b.nominalKwh * (1 + 1e-9), 'battery-mono-dod', () => `${tag} DoD ${z.dodOverridePct} %: ${u?.nominalKwh} kWh > ${b.nominalKwh} at ${dod} %`)
        }
        // a bigger load (no inverter) → never a smaller discharge current or a smaller fuse
        if (!b.cable || x.inverter) { /* inverter rating sets the current */ } else if (x.loadW! < 1e7) {
          const z = { ...x, loadW: Math.min(1e7, x.loadW! * r.num(1.01, 3)) }
          const u = battery(tag + ' load', z)
          mono(!!u && geq(u.dischargeA!, b.dischargeA!) && (!u.cable!.deviceStd || !b.cable.deviceStd || u.cable!.breakerA >= b.cable.breakerA), 'battery-mono-load', () => `${tag} ${u?.dischargeA} A / ${u?.cable?.breakerA} A < ${b.dischargeA} / ${b.cable!.breakerA}`)
        }
      }
    }
    // ---------------------------------------------------------------- cable
    {
      const r = rngFor(seedOf(i, 3)), tag = `#${i}`
      const x = genCable(r)
      const t = cable(tag, x)
      if (t) {
        cableInvariants(V, tag, x, t)
        // by power and by the same current give the same circuit
        // (only inside the by-current range 0.01–100,000 A: 1 W at 480 V is 0.002 A, accepted by power, below the current field's minimum)
        if (x.by === 'power' && x.circuit !== 'pv' && t.currentA >= 0.01 && t.currentA <= 100000) {
          const u = cable(tag + ' as-current', { ...x, by: 'current', currentA: t.currentA })
          mono(!!u && u.cable.sizeMm2 === t.cable.sizeMm2 && u.cable.breakerA === t.cable.breakerA && u.cable.parallelRuns === t.cable.parallelRuns, 'cable-power-vs-current', () => `${tag} ${show(u?.cable)} vs ${show(t.cable)}`)
        }
        const runs = t.cable.parallelRuns ?? 1
        // longer run → never a thinner conductor (same current, so the same number of runs); at the same size, never less drop
        if (x.lengthM! < 10000) {
          const y = { ...x, lengthM: Math.min(10000, x.lengthM! * r.num(1.01, 4)) }
          const u = cable(tag + ' longer', y)
          mono(!!u && (u.cable.parallelRuns ?? 1) === runs && u.cable.sizeMm2 >= t.cable.sizeMm2 && (u.cable.sizeMm2 !== t.cable.sizeMm2 || u.cable.dropPct >= t.cable.dropPct), 'cable-mono-length',
            () => `${tag} ${y.lengthM} m: ${u?.cable.parallelRuns} × ${u?.cable.sizeMm2} mm² ${u?.cable.dropPct} % vs ${x.lengthM} m: ${runs} × ${t.cable.sizeMm2} mm² ${t.cable.dropPct} %`)
        }
        // tighter drop target → never a thinner conductor
        if (x.maxDropPct! > 0.1) {
          const y = { ...x, maxDropPct: Math.max(0.1, x.maxDropPct! * r.num(0.3, 0.99)) }
          const u = cable(tag + ' tighter', y)
          mono(!!u && u.cable.sizeMm2 >= t.cable.sizeMm2, 'cable-mono-drop', () => `${tag} ${y.maxDropPct} %: ${u?.cable.sizeMm2} mm² < ${t.cable.sizeMm2} mm²`)
        }
        // more current → never a smaller protective device
        if (t.currentA >= 0.01 && t.currentA < 100000) {
          const y = { ...x, by: 'current' as const, currentA: Math.min(100000, t.currentA * r.num(1.01, 3)) }
          const u = cable(tag + ' more-current', y)
          // (a standard device never follows a missing one; PV may move from string fuses to NH fuses, both ≥ 1.56 × I)
          mono(!!u && (u.cable.deviceStd || !t.cable.deviceStd ? !u.cable.deviceStd || !t.cable.deviceStd || x.circuit === 'pv' || u.cable.breakerA >= t.cable.breakerA : true) && !(u.cable.deviceStd && !t.cable.deviceStd),
            'cable-mono-current', () => `${tag} ${y.currentA} A → ${u?.cable.breakerA} A vs ${t.currentA} A → ${t.cable.breakerA} A`)
        }
        // hotter air → a lower (or equal) correction factor
        if (x.ambientC! < 80) {
          const y = { ...x, ambientC: x.ambientC! + r.num(0.5, 20) }
          const k2 = ambientFactor(y.ambientC, x.insulation)
          mono(k2 == null || k2 <= t.kAmb + 1e-12, 'cable-mono-ambient', () => `${tag} k(${y.ambientC}) ${k2} > k(${x.ambientC}) ${t.kAmb}`)
          if (k2 != null && y.ambientC >= -40) { const u = cable(tag + ' hotter', y); mono(!!u, 'cable-hotter-valid', () => `${tag} ${show(y)}`) }
        }
      }
    }
    // ---------------------------------------------------------------- generator
    {
      const r = rngFor(seedOf(i, 4)), tag = `#${i}`
      const x = genGenerator(r)
      const g = generator(tag, x)
      if (g) {
        generatorInvariants(V, tag, x, g)
        const bigger = (a: GeneratorSizing | null, cat: string, what: string) => mono(!!a && geq(a.requiredKva, g.requiredKva) && orInf(a.generatorKva) >= orInf(g.generatorKva) && orInf(a.inverterStdKw) >= orInf(g.inverterStdKw),
          cat, () => `${tag} ${what}: ${a?.requiredKva} kVA → ${a?.generatorKva} / inverter ${a?.inverterStdKw} vs ${g.requiredKva} → ${g.generatorKva} / ${g.inverterStdKw} ← ${show(x)}`)
        if (x.runningKw! < 100000) bigger(generator(tag, { ...x, runningKw: Math.min(100000, x.runningKw! * r.num(1.01, 3)) }), 'generator-mono-running', 'more running load')
        bigger(generator(tag, { ...x, motorKw: Math.min(100000, (x.motorKw ?? 0) + r.num(0.1, 50)) }), 'generator-mono-motor', 'bigger motor')
        if (x.pf! > 0.5) bigger(generator(tag, { ...x, pf: Math.max(0.5, x.pf! - r.num(0.01, 0.3)) }), 'generator-mono-pf', 'lower power factor')
        if (x.ambientC! < 60) bigger(generator(tag, { ...x, ambientC: Math.min(60, x.ambientC! + r.int(1, 25)) }), 'generator-mono-ambient', 'hotter site')
        bigger(generator(tag, { ...x, chargeKw: Math.min(100000, (x.chargeKw ?? 0) + r.num(0.1, 20)) }), 'generator-mono-charge', 'more battery charging')
        // harsher start method → never a smaller surge (DOL ≥ star-delta ≥ soft starter ≥ VFD)
        const surges = (['dol', 'star-delta', 'soft', 'vfd'] as StartMethod[]).map((start) => (sizeGenerator({ ...x, start }) as GeneratorSizing).surgeKw)
        mono(surges.every((v, k) => k === 0 || v <= surges[k - 1] + 1e-9), 'generator-mono-start', () => `${tag} surges ${surges} ← ${show(x)}`)
      }
    }
  }
  elapsed = performance.now() - t0
  if (process.env.STRESS_DEBUG) console.log(`tools-stress: seed ${SEED}, ${N} cases × 4 tools, ${V.checks} checks, ${Math.round(elapsed)} ms`, Object.fromEntries(V.seen), slow)
}, 600_000)

describe(`engineering tools fuzz: ${N} cases per tool, seed ${SEED}`, () => {
  for (const tool of ['strings', 'battery', 'cable', 'generator']) {
    it(`${tool}: never throws, invalid inputs name known fields, valid results have no NaN / Infinity / undefined and only pass / warn / fail`, () => {
      expect(V.seen.get(`${tool}:valid`) ?? 0).toBeGreaterThan(N * 0.4)
      expect(V.seen.get(`${tool}:invalid`) ?? 0).toBeGreaterThan(N * 0.05)
      // the "what the tool calls OK is physically OK" checks are not vacuous: every verdict is reached
      if (tool !== 'generator') for (const lv of ['pass', 'warn', 'fail']) expect(V.seen.get(`${tool}:${lv}`) ?? 0, lv).toBeGreaterThan(N * 0.01)
      expect(V.report(`${tool}-throws`)).toEqual({})
      expect(V.report(`${tool}-invalid-shape`)).toEqual({})
      expect(V.report(`${tool}-holes`)).toEqual({})
      expect(V.report(`${tool}-level`)).toEqual({})
    })
    it(`${tool}: physical invariants and monotonicity on paired inputs`, () => {
      const all = V.report(`${tool}-`)
      for (const k of ['throws', 'invalid-shape', 'holes', 'level']) delete all[`${tool}-${k}`]
      expect(all).toEqual({})
    })
    it(`${tool}: every call stays interactive (< 50 ms; the page recomputes on each keystroke)`, () => {
      expect(slow[tool].ms, slow[tool].tag).toBeLessThan(50)
    })
  }
})

// ====================================================================================================== 2. every catalogue product
describe('every catalogue product is a valid tool input', () => {
  it('every panel × every MPPT inverter (§7), cold and hot sites, with and without a panel count', () => {
    const W = new Violations(), s0 = { ms: 0, tag: '' }
    for (const p of catalog.panels) for (const inv of MPPT_INVERTERS) for (const [low, hot] of [[5, 42], [-10, 35], [15, 50]]) for (const count of [null, 1, 12, 37]) {
      const x: StringCheckInput = { module: panelSpec(p), mppt: inverterMppt(inv), units: 1, panelCount: count, recordLowC: low, hotAmbientC: hot, codeLimitV: 1000 }
      const tag = `${p.id} on ${inv.id} ${low}/${hot} °C ×${count}`
      const s = run<StringCheck>(W, 'strings', tag, x, () => checkStrings(x), STRING_FIELDS, s0)
      W.check(!!s, 'catalogue-invalid', () => `${tag} → ${show(checkStrings(x))}`)
      if (s) stringInvariants(W, tag, x, s)
    }
    expect(W.report()).toEqual({})
  })
  it('every charge controller on each of its battery voltages × every panel (§6 virtual MPPT)', () => {
    const W = new Violations(), s0 = { ms: 0, tag: '' }
    for (const cc of catalog.chargeControllers) for (const bus of cc.batteryVoltages) for (const p of catalog.panels) for (const count of [null, 2, 6]) {
      const m = panelSpec(p)
      const x: StringCheckInput = { module: m, mppt: controllerMppt(cc, bus, m), units: 1, panelCount: count, recordLowC: 5, hotAmbientC: 42, codeLimitV: 1000 }
      const tag = `${p.id} on ${cc.id} @ ${bus} V ×${count}`
      const s = run<StringCheck>(W, 'strings', tag, x, () => checkStrings(x), STRING_FIELDS, s0)
      W.check(!!s, 'catalogue-invalid', () => `${tag} → ${show(checkStrings(x))}`)
      if (s) stringInvariants(W, tag, x, s)
    }
    expect(W.report()).toEqual({})
  })
  it('every battery × every bus × (no inverter and every battery inverter), by load and by energy (§4)', () => {
    const W = new Violations(), s0 = { ms: 0, tag: '' }
    for (const bat of catalog.batteries) for (const bus of [12, 24, 48, 'hv'] as Bus[]) for (const inv of [null, ...BATTERY_INVERTERS]) for (const basis of ['load', 'energy'] as const) {
      const x: BatteryBankInput = { basis, loadW: 2500, hours: 6, energyKwh: 15, module: batterySpec(bat), battery: bat, bus, dodOverridePct: null, inverter: inv, cableRunM: 2 }
      const tag = `${bat.id} @ ${bus} with ${inv?.id ?? 'no inverter'} (${basis})`
      const b = run<BatteryBank>(W, 'battery', tag, x, () => sizeBatteryBank(x), BATTERY_FIELDS, s0)
      W.check(!!b, 'catalogue-invalid', () => `${tag} → ${show(sizeBatteryBank(x))}`)
      if (b) batteryInvariants(W, tag, x, b)
    }
    expect(W.report()).toEqual({})
  })
  it('every battery fits at least one bus, and the bus the tool moves it to fits it', () => {
    const none = catalog.batteries.filter((b) => !(['hv', 48, 24, 12] as Bus[]).some((bus) => fitsSystemVoltage(b, bus)))
    expect(none.map((b) => `${b.id} ${b.nominalVoltage} V`)).toEqual([])
  })
})

// ====================================================================================================== 3. sweeps
describe('cable and generator sweeps', () => {
  it('ambient −40…90 °C in 0.5 °C steps × both insulations × every circuit: valid exactly where the table has a factor, k never rises with heat', () => {
    const W = new Violations(), s0 = { ms: 0, tag: '' }
    for (const insulation of INSULATIONS) {
      let prev = Infinity
      for (let a = -40; a <= 90; a += 0.5) {
        const k = ambientFactor(a, insulation)
        W.check(k == null || k <= prev + 1e-12, 'k-rises', () => `${insulation} ${a} °C: ${k} > ${prev}`)
        if (k != null) prev = k
        const last = K_AMB_TABLE[insulation][K_AMB_TABLE[insulation].length - 1][0]
        W.check((k == null) === (a > last), 'k-range', () => `${insulation} ${a} °C → ${k}`)
        for (const circuit of CIRCUITS) {
          const x: CableToolInput = { circuit, by: 'current', currentA: 32, powerKw: null, pf: 1, voltage: circuit === 'pv' ? 600 : circuit === 'battery' ? 48 : circuit === 'ac1' ? 230 : 400, lengthM: 20, maxDropPct: 2, ambientC: a, insulation }
          const t = run<CableTool>(W, 'cable', `${circuit} ${insulation} ${a} °C`, x, () => sizeCircuit(x), CABLE_FIELDS, s0)
          W.check(!!t === (k != null), 'valid-iff-k', () => `${circuit} ${insulation} ${a} °C valid ${!!t} k ${k}`)
          if (t) cableInvariants(W, `${circuit} ${insulation} ${a} °C`, x, t)
        }
      }
    }
    expect(W.report()).toEqual({})
  })
  it('current 0.01…100,000 A (log sweep) × every circuit: devices step up through the standard lists and fail cleanly above them', () => {
    const W = new Violations(), s0 = { ms: 0, tag: '' }
    for (const circuit of CIRCUITS) for (const insulation of INSULATIONS) {
      let prevDevice = 0, prevStd = true
      for (let e = -2; e <= 5; e += 0.01) {
        const I = 10 ** e
        const x: CableToolInput = { circuit, by: 'current', currentA: I, powerKw: null, pf: 1, voltage: circuit === 'battery' ? 51.2 : 400, lengthM: 10, maxDropPct: 3, ambientC: 35, insulation }
        const t = run<CableTool>(W, 'cable', `${circuit} ${I} A`, x, () => sizeCircuit(x), CABLE_FIELDS, s0)
        if (!t) { W.check(false, 'sweep-invalid', () => `${circuit} ${I} A`); continue }
        cableInvariants(W, `${circuit} ${insulation} ${I} A`, x, t)
        // once above the list a circuit stays above it (PV switches from string fuses to NH fuses at 40 A, so its device may restart lower)
        if (t.cable.deviceStd) {
          W.check(prevStd, 'std-again', () => `${circuit} ${I} A has a standard device again after none`)
          W.check(circuit === 'pv' || t.cable.breakerA >= prevDevice, 'device-drops', () => `${circuit} ${I} A: ${t.cable.breakerA} A < ${prevDevice} A`)
          prevDevice = t.cable.breakerA
        } else prevStd = false
      }
    }
    expect(W.report()).toEqual({})
  })
  it('generator: running 0.01…100,000 kW (log sweep) × start methods × power factors × hot / mild sites', () => {
    const W = new Violations(), s0 = { ms: 0, tag: '' }
    for (const start of STARTS) for (const pf of [0.5, 0.8, 1]) for (const ambientC of [25, 41]) {
      let prev: GeneratorSizing | null = null
      for (let e = -2; e <= 5; e += 0.02) {
        const x: GeneratorInput = { runningKw: 10 ** e, motorKw: 10 ** e * 0.4, start, pf, chargeKw: 2, ambientC }
        const g = run<GeneratorSizing>(W, 'generator', `${start} ${pf} ${ambientC} °C ${x.runningKw} kW`, x, () => sizeGenerator(x), GEN_FIELDS, s0)
        if (!g) { W.check(false, 'sweep-invalid', () => show(x)); continue }
        generatorInvariants(W, show(x), x, g)
        if (prev) W.check(orInf(g.generatorKva) >= orInf(prev.generatorKva) && orInf(g.inverterStdKw) >= orInf(prev.inverterStdKw), 'sweep-mono', () => `${show(x)} → ${g.generatorKva} / ${g.inverterStdKw}`)
        prev = g
      }
    }
    expect(W.report()).toEqual({})
  })
})

// ====================================================================================================== 4. saved inputs (localStorage → tools[id])
// The four tools' defaults and enums, as in src/components/tools/*Tool.tsx (shapes only; values are catalogue-independent here).
const TOOL_STATES: Record<string, { defaults: Record<string, unknown>; enums: Record<string, readonly unknown[]> }> = {
  strings: {
    defaults: {
      panelSrc: 'catalog', panelId: 'pnl-ja-550-jam72s30', panel: { watts: 550, voc: 49.9, vmp: 41.96, isc: 14, imp: 13.11, tcVoc: -0.275, tcPmax: -0.35, noct: 45, maxSysV: 1500, maxFuse: 25 },
      inputSrc: 'inverter', inverterId: 'inv-deye-8k-sg01lp1', controllerId: 'cc-victron-150-35', busV: 48, mppt: { maxPvV: 500, mpptMin: 150, mpptMax: 425, mpptCount: 2, maxA: 26, maxPvKw: 10.4 },
      units: 1, panelCount: 16, locationId: 'khartoum', low: 10, hot: 42, code: 1000,
    },
    enums: { panelSrc: ['catalog', 'datasheet'], inputSrc: ['inverter', 'controller', 'datasheet'], code: [1000, 1500], busV: [12, 24, 36, 48] },
  },
  battery: {
    defaults: {
      basis: 'load', loadW: 1000, hours: 5, energyKwh: 10, src: 'catalog', batteryId: 'bat-gen-48v100-rack',
      module: { V: 51.2, Ah: 100, kWh: null, dod: 90, maxChargeA: 100, maxDischargeA: 100, parallelMax: null, chemistry: 'LiFePO4' }, bus: '48', dodOverride: null, inverterId: '', runM: 2,
    },
    enums: { basis: ['load', 'energy'], src: ['catalog', 'datasheet'], bus: ['12', '24', '48', 'hv'], 'module.chemistry': CHEMS },
  },
  cable: {
    defaults: { circuit: 'ac1', by: 'power', currentA: 20, powerKw: 5, pf: 1, voltage: 230, lengthM: 15, dropPct: 2, ambientC: 40, insulation: 'pvc' },
    enums: { circuit: CIRCUITS, by: ['current', 'power'], insulation: ['pvc', 'xlpe'] },
  },
  generator: {
    defaults: { runningKw: 10, motorKw: 4, start: 'dol', pf: 0.8, chargeKw: null, ambientC: 42 },
    enums: { start: STARTS },
  },
}
const isPlain = (x: unknown): x is Record<string, unknown> => !!x && typeof x === 'object' && !Array.isArray(x) && Object.getPrototypeOf(x) === Object.prototype
/** Does `out` have exactly the defaults' keys, each of the type the default implies (enum fields: one of the listed values)? */
function shapeErrors(out: unknown, defaults: Record<string, unknown>, enums: Record<string, readonly unknown[]>, path = ''): string[] {
  if (!isPlain(out)) return [`${path || '$'} is not a plain object`]
  const errs: string[] = []
  const keys = Object.keys(out), want = Object.keys(defaults)
  if (keys.length !== want.length || want.some((k) => !Object.prototype.hasOwnProperty.call(out, k))) errs.push(`${path || '$'} keys ${keys} ≠ ${want}`)
  for (const [k, d] of Object.entries(defaults)) {
    const v = out[k], key = path + k
    const allowed = enums[key]
    if (allowed) { if (!allowed.includes(v)) errs.push(`${key}=${show(v)} not in ${show(allowed)}`) }
    else if (typeof d === 'number' || d === null) { if (!(v === null || (typeof v === 'number' && Number.isFinite(v)))) errs.push(`${key}=${show(v)} not a finite number / null`) }
    else if (typeof d === 'string' || typeof d === 'boolean') { if (typeof v !== typeof d) errs.push(`${key}=${show(v)} not a ${typeof d}`) }
    else if (isPlain(d)) errs.push(...shapeErrors(v, d, enums, key + '.'))
  }
  return errs
}
const KEYS = ['__proto__', 'constructor', 'prototype', 'toString', 'valueOf', 'hasOwnProperty', 'x', '', '0', 'module', 'panel', 'mppt', 'bus', 'busV', 'code', 'chemistry', 'start']
/** Anything a stale, foreign or hand-edited localStorage entry could hold, incl. own `__proto__` keys (as JSON.parse creates them). */
function junk(r: Rng, depth = 0): unknown {
  switch (r.int(0, 11)) {
    case 0: return null
    case 1: return undefined
    case 2: return r.pick(EDGE)
    case 3: return r2(r.num(-1e6, 1e6))
    case 4: return r.pick(['', 'load', 'energy', 'hv', '48', '1000', 'catalog', 'datasheet', 'dol', 'LiFePO4', 'Lithium', '__proto__', 'NaN'])
    case 5: return r.chance(0.5)
    case 6: return depth < 3 ? Array.from({ length: r.int(0, 4) }, () => junk(r, depth + 1)) : []
    case 7: return JSON.parse('{"__proto__": {"polluted": true, "panelSrc": "datasheet", "watts": 5}, "constructor": {"prototype": {"polluted": true}}}')
    case 8: return r.pick([1000, 1500, 12, 24, 36, 48])
    default: {
      if (depth >= 3) return {}
      const o: Record<string, unknown> = {}
      for (let k = r.int(0, 6); k > 0; k--) Object.defineProperty(o, r.pick(KEYS), { value: junk(r, depth + 1), enumerable: true, configurable: true, writable: true })
      return o
    }
  }
}
/** A valid saved state: every field of the right type, enum fields one of their values. */
function validState(r: Rng, defaults: Record<string, unknown>, enums: Record<string, readonly unknown[]>, path = ''): Record<string, unknown> {
  return Object.fromEntries(Object.entries(defaults).map(([k, d]) => {
    const key = path + k
    if (enums[key]) return [k, r.pick(enums[key])]
    if (typeof d === 'number' || d === null) return [k, r.chance(0.15) ? null : r2(r.num(-1e4, 1e4))]
    if (typeof d === 'string') return [k, r.pick(['', 'x', 'my-panel-1', 'khartoum', 'بطارية'])]
    if (typeof d === 'boolean') return [k, r.chance(0.5)]
    if (isPlain(d)) return [k, validState(r, d, enums, key + '.')]
    return [k, d]
  }))
}

describe(`saved tool inputs: normalizeToolState over ${N} hostile entries per tool`, () => {
  for (const [tool, { defaults, enums }] of Object.entries(TOOL_STATES)) {
    it(`${tool}: always the defaults' shape and types, idempotent, never pollutes prototypes, keeps valid saves`, () => {
      const errs: string[] = []
      for (let i = 0; i < N; i++) {
        const r = rngFor(seedOf(i, 5))
        // hostile: a whole junk value, or a valid save with some fields replaced by junk and junk keys added
        const base = validState(r, defaults, enums)
        const raw = r.chance(0.25) ? junk(r) : (() => {
          const o: Record<string, unknown> = structuredClone(base)
          for (const k of Object.keys(o)) if (r.chance(0.3)) o[k] = junk(r)
          for (const k of Object.keys(o)) if (isPlain(o[k]) && r.chance(0.3)) { const inner = o[k] as Record<string, unknown>; for (const j of Object.keys(inner)) if (r.chance(0.3)) inner[j] = junk(r) }
          if (r.chance(0.3)) Object.defineProperty(o, r.pick(KEYS), { value: junk(r), enumerable: true, configurable: true, writable: true })
          return o
        })()
        // what the app really reads back is JSON (zustand persist): check both the raw object and its JSON round trip
        let json: unknown
        try { json = JSON.parse(JSON.stringify(raw, (_k, v) => (typeof v === 'bigint' ? Number(v) : v)) ?? 'null') } catch { json = null }
        for (const [label, x] of [['raw', raw], ['json', json]] as const) {
          let out: Record<string, unknown>
          try { out = normalizeToolState(x, defaults, enums) } catch (e) { errs.push(`#${i} ${label} throws ${(e as Error).message}`); continue }
          const se = shapeErrors(out, defaults, enums)
          if (se.length) errs.push(`#${i} ${label} ${se.slice(0, 3).join('; ')} ← ${show(x)}`)
          const again = normalizeToolState(out, defaults, enums)
          if (JSON.stringify(again) !== JSON.stringify(out)) errs.push(`#${i} ${label} not idempotent`)
          // nested objects are rebuilt, never shared with the stored value (the calculators mutate copies only)
          for (const [k, v] of Object.entries(out)) if (isPlain(v) && x && typeof x === 'object' && (x as Record<string, unknown>)[k] === v) errs.push(`#${i} ${label} ${k} shared with the input`)
        }
        const kept = normalizeToolState(structuredClone(base), defaults, enums)
        if (JSON.stringify(kept) !== JSON.stringify(base)) errs.push(`#${i} valid save changed: ${show(base)} → ${show(kept)}`)
        if (errs.length > 8) break
      }
      expect(({} as Record<string, unknown>).polluted).toBeUndefined()
      expect(Object.prototype.hasOwnProperty.call(Object.prototype, 'polluted')).toBe(false)
      expect(errs).toEqual([])
    })
  }
})
