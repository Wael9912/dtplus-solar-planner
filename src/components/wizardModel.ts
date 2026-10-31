import type { Check, Project, Results, StepKey } from '../engine/types'
import type { Quote } from '../engine/quote'
import { checkStep } from '../i18n/labels'

export const STEPS = ['info', 'loads', 'site', 'design', 'results', 'bom', 'export'] as const satisfies readonly StepKey[]
export type StepStatus = 'done' | 'todo' | 'warn' | 'error'

/** Real per-step status: done when the step's inputs are complete, warn/error when a design check that is fixed on that step fails. */
export function stepStatuses(p: Project, r: Results, q: Quote): Record<StepKey, StepStatus> {
  const hasLoads = p.loads.length > 0 && r.dailyWh > 0
  const st: Record<StepKey, StepStatus> = {
    info: p.clientName.trim() ? 'done' : 'todo', loads: hasLoads ? 'done' : 'todo', site: hasLoads ? 'done' : 'todo', design: hasLoads && (r.inverter || p.design.systemType === 'gridtie') ? 'done' : 'todo',
    results: hasLoads ? 'done' : 'todo', bom: hasLoads && q.total > 0 ? 'done' : 'todo', export: p.status !== 'draft' ? 'done' : 'todo',
  }
  if (!hasLoads) return st // nothing to review until there is a load list
  for (const c of r.checks) {
    if (c.level === 'ok' || c.id === 'no-loads') continue
    const s = checkStep(c); if (!s) continue
    if (c.level === 'error') st[s] = 'error'
    else if (st[s] !== 'error') st[s] = 'warn'
  }
  return st
}

const rank = (c: Check) => (c.level === 'error' ? 0 : c.level === 'warn' ? 1 : 2)
export const sortChecks = (cs: Check[]) => [...cs].sort((a, b) => rank(a) - rank(b))
export const realIssues = (cs: Check[]) => cs.filter((c) => c.level !== 'ok')
