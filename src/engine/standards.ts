export const COPPER_RHO = 0.0172 // Ω·mm²/m at ~20°C (use 0.0206 at 70°C for conservative design)
export const COPPER_RHO_HOT = 0.0206
export const STD_MCB_A = [6, 10, 16, 20, 25, 32, 40, 50, 63, 80, 100, 125, 160, 200, 250, 315, 400]
export const STD_PV_FUSE_A = [10, 15, 20, 25, 30, 32]
export const STD_BATTERY_FUSE_A = [63, 80, 100, 125, 150, 160, 200, 250, 300, 350, 400, 500, 630, 800]
export const STD_GENERATOR_KVA = [3, 5, 7.5, 10, 12, 15, 20, 25, 30, 40, 50, 60, 80, 100, 125, 150, 200, 250, 300, 400, 500]
export const STD_CABLE_MM2 = [1.5, 2.5, 4, 6, 10, 16, 25, 35, 50, 70, 95, 120, 150, 185, 240]
// Approximate ampacity (A) for PV-rated / XLPE copper in free air at 30°C with derating for conduit — conservative installer values
export const CABLE_AMPACITY: Record<number, number> = {
  1.5: 16, 2.5: 24, 4: 32, 6: 41, 10: 57, 16: 76, 25: 101, 35: 125, 50: 151, 70: 192, 95: 232, 120: 269, 150: 309, 185: 353, 240: 415,
}
export const AWG_EQUIV: Record<number, string> = {
  1.5: '16', 2.5: '14', 4: '12', 6: '10', 10: '8', 16: '6', 25: '4', 35: '2', 50: '1/0', 70: '2/0', 95: '3/0', 120: '4/0', 150: '300 kcmil', 185: '350 kcmil', 240: '500 kcmil',
}
export const DAYS_IN_MONTH = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31]
export const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

export const DOD_BY_CHEMISTRY: Record<string, number> = { LiFePO4: 0.9, NMC: 0.9, AGM: 0.5, Gel: 0.5, Flooded: 0.5 }
export const ROUNDTRIP_BY_CHEMISTRY: Record<string, number> = { LiFePO4: 0.92, NMC: 0.92, AGM: 0.82, Gel: 0.82, Flooded: 0.78 }

export function roundUpStd(value: number, list: number[]): number {
  for (const v of list) if (v >= value) return v
  return list[list.length - 1]
}
export const r1 = (n: number) => Math.round(n * 10) / 10
export const r2 = (n: number) => Math.round(n * 100) / 100
export const r0 = (n: number) => Math.round(n)
