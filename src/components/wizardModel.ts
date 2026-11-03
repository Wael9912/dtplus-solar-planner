import type { Check, Project, Results, StepKey } from '../engine/types'
import type { Quote } from '../engine/quote'
import { checkStep } from '../i18n/labels'
import { projectMode } from '../engine/sizing'

/** Every step of a full design, in order. */
export const STEPS = ['info', 'loads', 'site', 'design', 'results', 'bom', 'export'] as const satisfies readonly StepKey[]
/**
 * Steps of each project mode: a full design asks for the client first; a known-size quote and a product list start with the
 * figures and ask who the quote is for just before export.
 */
export const MODE_STEPS: Record<NonNullable<Project['mode']>, readonly StepKey[]> = {
  design: STEPS,
  size: ['design', 'site', 'results', 'bom', 'info', 'export'],
  items: ['bom', 'info', 'export'],
}
export const stepsFor = (p: Pick<Project, 'mode'>): readonly StepKey[] => MODE_STEPS[projectMode(p)]
export type StepStatus = 'done' | 'todo' | 'warn' | 'error'

/** Is there anything to size or price? Full design: a load list or a bill; known size: always; product list: at least one product. */
export const hasDemand = (p: Project, r: Results) => (r.mode === 'design' ? r.dailyWh > 0 : r.mode === 'items' ? (p.pricing.customItems?.length ?? 0) > 0 : true)

/** Real per-step status: done when the step's inputs are complete, warn/error when a design check that is fixed on that step fails. */
export function stepStatuses(p: Project, r: Results, q: Quote): Record<StepKey, StepStatus> {
  const ok = hasDemand(p, r)
  const st: Record<StepKey, StepStatus> = {
    info: p.clientName.trim() ? 'done' : 'todo', loads: ok ? 'done' : 'todo', site: ok ? 'done' : 'todo', design: ok && (r.inverter || p.design.systemType === 'gridtie') ? 'done' : 'todo',
    results: ok ? 'done' : 'todo', bom: ok && q.total > 0 ? 'done' : 'todo', export: p.status !== 'draft' ? 'done' : 'todo',
  }
  if (!ok) return st // nothing to review until there is a load list
  const steps = stepsFor(p)
  for (const c of r.checks) {
    if (c.level === 'ok' || c.id === 'no-loads' || c.id === 'no-items') continue
    const s = checkStep(c); if (!s || !steps.includes(s)) continue
    if (c.level === 'error') st[s] = 'error'
    else if (st[s] !== 'error') st[s] = 'warn'
  }
  return st
}

const rank = (c: Check) => (c.level === 'error' ? 0 : c.level === 'warn' ? 1 : 2)
export const sortChecks = (cs: Check[]) => [...cs].sort((a, b) => rank(a) - rank(b))
export const realIssues = (cs: Check[]) => cs.filter((c) => c.level !== 'ok')
