// Monthly plane-of-array gain (isotropic sky: Liu–Jordan / Klein monthly method with the Erbs monthly diffuse fraction).
// Methodology §3.1 / §9 and docs/irradiance-notes.md. Used only for the *shape* of the year and for orientation changes:
// the user's annual tilt-gain factor is the anchor at the location's optimal tilt facing the equator.
import { DAYS_IN_MONTH } from './standards'

const rad = (d: number) => (d * Math.PI) / 180
/** Recommended average day of each month (Klein 1977). */
const MID_DAY = [17, 47, 75, 105, 135, 162, 198, 228, 258, 288, 318, 344]
const GSC = 1367 // W/m²

/** Optimal fixed tilt rule used for the location data (irradiance-notes.md). */
export const optimalTiltFor = (lat: number) => {
  const a = Math.abs(lat)
  return Math.max(10, Math.round(a < 25 ? 0.87 * a : 0.76 * a + 3.1))
}

/**
 * Monthly ratio R_m = H_tilted / H_horizontal for a surface at `tiltDeg`, turned `azimuthDeg` away from the equator
 * (0 = equator-facing, ±90 = east/west, 180 = facing the pole), given 12 monthly mean daily GHI values (kWh/m²/day).
 */
export function monthlyTiltRatios(latDeg: number, tiltDeg: number, azimuthDeg: number, monthlyGhi: number[], albedo = 0.2): number[] {
  const south = latDeg < 0
  const phi = rad(Math.min(66, Math.abs(latDeg))) // mirror the southern hemisphere onto the northern one
  const beta = rad(Number.isFinite(tiltDeg) ? Math.max(0, Math.min(90, tiltDeg)) : 0)
  const gamma = rad(Number.isFinite(azimuthDeg) ? ((((azimuthDeg + 180) % 360) + 360) % 360) - 180 : 0)
  return MID_DAY.map((n, m) => {
    const H = monthlyGhi[m] ?? 0
    if (!(H > 0) || beta === 0) return 1
    let delta = rad(23.45 * Math.sin(rad((360 * (284 + n)) / 365)))
    if (south) delta = -delta
    const ws = Math.acos(Math.max(-1, Math.min(1, -Math.tan(phi) * Math.tan(delta))))
    const h0 = ((24 * 3600 * GSC) / Math.PI) * (1 + 0.033 * Math.cos(rad((360 * n) / 365))) *
      (Math.cos(phi) * Math.cos(delta) * Math.sin(ws) + ws * Math.sin(phi) * Math.sin(delta)) / 3.6e6
    const kt = Math.max(0.1, Math.min(0.85, h0 > 0 ? H / h0 : 0.5))
    const wsDeg = (ws * 180) / Math.PI
    const fd = Math.max(0.05, Math.min(1, wsDeg <= 81.4
      ? 1.391 - 3.56 * kt + 4.189 * kt ** 2 - 2.137 * kt ** 3
      : 1.311 - 3.022 * kt + 3.427 * kt ** 2 - 1.821 * kt ** 3))
    // Beam ratio: ∫cosθ / ∫cosθz over the day (extraterrestrial weighting), numerically so that azimuth is handled
    const sd = Math.sin(delta), cd = Math.cos(delta), sp = Math.sin(phi), cp = Math.cos(phi), sb = Math.sin(beta), cb = Math.cos(beta)
    let num = 0, den = 0
    for (let w = -ws; w <= ws; w += 0.01) {
      const cz = cp * cd * Math.cos(w) + sp * sd
      if (cz <= 0) continue
      const ct = sd * sp * cb - sd * cp * sb * Math.cos(gamma) + cd * cp * cb * Math.cos(w) + cd * sp * sb * Math.cos(gamma) * Math.cos(w) + cd * sb * Math.sin(gamma) * Math.sin(w)
      num += Math.max(0, ct); den += cz
    }
    const rb = den > 0 ? num / den : 1
    return (1 - fd) * rb + fd * (1 + cb) / 2 + albedo * (1 - cb) / 2
  })
}

/** Energy-weighted annual mean of monthly ratios. */
export function annualRatio(ratios: number[], monthlyGhi: number[]): number {
  let a = 0, b = 0
  for (let m = 0; m < 12; m++) { const w = (monthlyGhi[m] ?? 0) * DAYS_IN_MONTH[m]; a += w * ratios[m]; b += w }
  return b > 0 ? a / b : 1
}

/**
 * Monthly and annual plane-of-array gain used by the engine.
 * - Without a latitude: flat gain = tiltGainFactor (legacy behaviour).
 * - With a latitude: monthly shape from the isotropic model; scaled so that at the reference geometry (optimal tilt, equator-facing)
 *   the annual gain equals the user's tiltGainFactor; other tilts/azimuths follow the model, with the calibration
 *   c = tiltGainFactor / G_model(ref) applied as c^min(1, tilt/refTilt) (so a flat array gets exactly 1.0).
 */
export function tiltGains(opts: { lat?: number | null; tiltDeg: number; azimuthDeg: number; tiltGainFactor: number; refTiltDeg?: number; monthlyGhi: number[] }): { monthly: number[]; annual: number; modelled: boolean } {
  const tgf = opts.tiltGainFactor > 0 ? opts.tiltGainFactor : 1
  if (opts.lat == null || !Number.isFinite(opts.lat)) return { monthly: Array(12).fill(tgf), annual: tgf, modelled: false }
  const ref = opts.refTiltDeg ?? optimalTiltFor(opts.lat)
  const rRef = monthlyTiltRatios(opts.lat, ref, 0, opts.monthlyGhi)
  const rCur = monthlyTiltRatios(opts.lat, opts.tiltDeg, opts.azimuthDeg, opts.monthlyGhi)
  const gRef = annualRatio(rRef, opts.monthlyGhi)
  // Calibration c = user factor / model at the reference geometry; phased in with tilt so a flat array gets exactly 1.0
  const c = gRef > 0 ? tgf / gRef : 1
  const s = ref > 0 ? Math.max(0, Math.min(1, opts.tiltDeg / ref)) : 1
  const k = Math.pow(c, s)
  const monthly = rCur.map((x) => x * k)
  return { monthly, annual: annualRatio(monthly, opts.monthlyGhi), modelled: true }
}
