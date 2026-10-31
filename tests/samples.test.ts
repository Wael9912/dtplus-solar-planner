// The bundled sample projects must compute cleanly (no error-level checks) — they are the client's first impression.
import { describe, it, expect } from 'vitest'
import { computeProject } from '../src/engine/compute'
import { sampleProjects } from '../src/data/samples'

describe('sample projects', () => {
  for (const p of sampleProjects()) {
    it(`${p.name} computes without errors`, () => {
      const r = computeProject(p)
      const line = `${p.name} | ${r.arrayKwp.toFixed(1)} kWp | ${r.inverterQty} × ${r.inverter?.model ?? '-'} | ${r.batteryKwh.toFixed(1)} kWh | $${Math.round(r.totalUsd)} | ${r.checks.map((c) => `${c.level}:${c.id}`).join(' ')}`
      console.log(line)
      expect(r.checks.filter((c) => c.level === 'error')).toHaveLength(0)
      expect(r.totalUsd).toBeGreaterThan(0)
      expect(Number.isFinite(r.paybackYears ?? 0)).toBe(true)
    })
  }
})
