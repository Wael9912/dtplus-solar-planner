export const COPPER_RHO = 0.0172 // Ω·mm²/m at ~20°C (use 0.0206 at 70°C for conservative design)
export const COPPER_RHO_HOT = 0.0206
/** AC breakers (MCB ≤ 125 A, MCCB 160–1600 A). Above the list → error check (§8.3 STD_BREAKERS + MCCB/ACB frames). */
export const STD_MCB_A = [6, 10, 16, 20, 25, 32, 40, 50, 63, 80, 100, 125, 160, 200, 250, 315, 400, 500, 630, 800, 1000, 1250, 1600]
/** gPV string fuses (10×38 / 14×51 mm). */
export const STD_PV_FUSE_A = [10, 12, 15, 16, 20, 25, 30, 32, 35, 40]
/** gPV NH fuses for combiner (array) outputs (§8.3 STD_FUSES_DC, NH1/NH2 gPV 1000–1500 V). */
export const STD_DC_FUSE_A = [40, 50, 63, 80, 100, 125, 160, 200, 250, 315, 400, 500, 630]
/** Battery fuses / DC breakers (§8.3 STD_FUSES_DC incl. 175 and 225 A, plus 350–800 A class T / NH). */
export const STD_BATTERY_FUSE_A = [20, 25, 30, 32, 40, 50, 63, 80, 100, 125, 150, 160, 175, 200, 225, 250, 300, 350, 400, 500, 630, 800]
export const STD_GENERATOR_KVA = [3, 5, 7.5, 10, 12, 15, 20, 25, 30, 40, 50, 60, 80, 100, 125, 150, 200, 250, 300, 400, 500]
export const STD_CABLE_MM2 = [1.5, 2.5, 4, 6, 10, 16, 25, 35, 50, 70, 95, 120, 150, 185, 240]
/** Voltage classes for PV DC isolators and DC SPDs (U_cpv). */
export const STD_PV_DC_CLASS_V = [600, 1000, 1200, 1500]
/** Current classes for PV DC isolators / load-break switches (per pole pair). */
export const STD_DC_ISOLATOR_A = [25, 32, 50, 63, 125, 250]
/** Changeover switches / ATS frames. */
export const STD_CHANGEOVER_A = [40, 63, 100, 125, 160, 250, 400, 630, 800, 1250]
/** RCCB (30 mA type A) ratings; above the list an earth-leakage relay + core-balance CT is used. */
export const STD_RCD_A = [25, 40, 63, 80, 100]

/** Legacy single ampacity column (IEC 60364-5-52 method B1, PVC). Kept for reference only — the engine uses `AMPACITY` below. */
export const CABLE_AMPACITY: Record<number, number> = {
  1.5: 16, 2.5: 24, 4: 32, 6: 41, 10: 57, 16: 76, 25: 101, 35: 125, 50: 151, 70: 192, 95: 232, 120: 269, 150: 309, 185: 353, 240: 415,
}
/**
 * Current-carrying capacity at 30 °C (A) per circuit type, methodology §8.2. The engine multiplies by K_AMB (0.87, 40 °C).
 * - pv:  EN 50618 H1Z2Z2-K single core, free air (manufacturer tables; 150–240 mm² extrapolated with the IEC method-F progression)
 * - battery: IEC 60364-5-52 B.52.12 method F, single-core cables in free air, 2 loaded conductors (150–240 extrapolated)
 * - ac1: IEC 60364-5-52 B.52.2 method C (clipped direct), 2 loaded conductors, PVC 70 °C
 * - ac3: IEC 60364-5-52 B.52.4 method C, 3 loaded conductors, PVC 70 °C
 */
export const AMPACITY: Record<'pv' | 'battery' | 'ac1' | 'ac3', Record<number, number>> = {
  pv: { 1.5: 30, 2.5: 41, 4: 55, 6: 70, 10: 98, 16: 132, 25: 176, 35: 218, 50: 276, 70: 347, 95: 416, 120: 488, 150: 563, 185: 642, 240: 757 },
  battery: { 1.5: 24, 2.5: 33, 4: 45, 6: 58, 10: 80, 16: 107, 25: 138, 35: 171, 50: 209, 70: 269, 95: 328, 120: 382, 150: 441, 185: 502, 240: 593 },
  ac1: { 1.5: 19.5, 2.5: 27, 4: 36, 6: 46, 10: 63, 16: 85, 25: 112, 35: 138, 50: 168, 70: 213, 95: 258, 120: 299, 150: 344, 185: 392, 240: 461 },
  ac3: { 1.5: 17.5, 2.5: 24, 4: 32, 6: 41, 10: 57, 16: 76, 25: 96, 35: 119, 50: 144, 70: 184, 95: 223, 120: 259, 150: 299, 185: 341, 240: 403 },
}
export const AWG_EQUIV: Record<number, string> = {
  1.5: '16', 2.5: '14', 4: '12', 6: '10', 10: '8', 16: '6', 25: '4', 35: '2', 50: '1/0', 70: '2/0', 95: '3/0', 120: '4/0', 150: '300 kcmil', 185: '350 kcmil', 240: '500 kcmil',
}
export const DAYS_IN_MONTH = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31]
export const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

export const DOD_BY_CHEMISTRY: Record<string, number> = { LiFePO4: 0.9, NMC: 0.9, AGM: 0.5, Gel: 0.5, Flooded: 0.5 }
export const ROUNDTRIP_BY_CHEMISTRY: Record<string, number> = { LiFePO4: 0.92, NMC: 0.92, AGM: 0.82, Gel: 0.82, Flooded: 0.78 }
/** Calendar-life cap (years) for the battery replacement year = min(cycles / 365, calendar life) — methodology §4.4. */
export const CALENDAR_LIFE_BY_CHEMISTRY: Record<string, number> = { LiFePO4: 15, NMC: 12, AGM: 5, Gel: 7, Flooded: 10 }

/** Next standard size ≥ value, or the list maximum when the value is above the list (legacy behaviour; the engine uses `nextStd`). */
export function roundUpStd(value: number, list: number[]): number {
  for (const v of list) if (v >= value) return v
  return list[list.length - 1]
}
/** Next standard size ≥ value, or null when the value exceeds the largest standard size (the caller raises a check). */
export function nextStd(value: number, list: number[]): number | null {
  for (const v of list) if (v >= value - 1e-9) return v
  return null
}
/** ceil() that is safe against floating-point noise on exact multiples (e.g. 10.24 / 5.12). */
export const ceilSafe = (x: number) => Math.ceil(x - 1e-9)
export const clamp = (x: number, lo: number, hi: number) => (Number.isFinite(x) ? Math.min(hi, Math.max(lo, x)) : lo)
export const r1 = (n: number) => Math.round(n * 10) / 10
export const r2 = (n: number) => Math.round(n * 100) / 100
export const r0 = (n: number) => Math.round(n)
