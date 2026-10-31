import { useMemo } from 'react'
import { ChevronLeft, ChevronRight, Check } from 'lucide-react'
import { useAppStore, useCurrentProject } from '../store/useAppStore'
import { useT } from '../i18n'
import { computeProject } from '../engine/compute'
import { StepInfo } from './steps/StepInfo'
import { StepLoads } from './steps/StepLoads'
import { StepSite } from './steps/StepSite'
import { StepDesign } from './steps/StepDesign'
import { StepResults } from './steps/StepResults'
import { StepBom } from './steps/StepBom'
import { StepExport } from './steps/StepExport'
import type { Project, Results } from '../engine/types'

export interface StepProps { project: Project; results: Results; update: (patch: Partial<Project> | ((p: Project) => Partial<Project>)) => void }
const STEPS = ['info', 'loads', 'site', 'design', 'results', 'bom', 'export'] as const

export function Wizard() {
  const { t, dir } = useT()
  const project = useCurrentProject()
  const { step, setStep, updateProject, setView } = useAppStore()
  const results = useMemo(() => (project ? computeProject(project) : null), [project])
  if (!project || !results) { setView('projects'); return null }
  const update: StepProps['update'] = (patch) => updateProject(project.id, patch)
  const props: StepProps = { project, results, update }
  const Back = dir === 'rtl' ? ChevronRight : ChevronLeft
  const Next = dir === 'rtl' ? ChevronLeft : ChevronRight
  const errors = results.checks.filter((c) => c.level === 'error').length
  const warns = results.checks.filter((c) => c.level === 'warn').length

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-xl font-bold text-slate-900">{project.name || t.nav.newProject}</h1>
          <p className="text-sm text-slate-500">{project.clientName && `${project.clientName} · `}{project.reference}</p>
        </div>
        <div className="flex items-center gap-2 text-xs">
          {errors > 0 && <span className="badge-err">{errors} {t.common.error}</span>}
          {warns > 0 && <span className="badge-warn">{warns} {t.common.warn}</span>}
          {errors === 0 && warns === 0 && <span className="badge-ok"><Check size={12} className="me-1" />{t.common.ok}</span>}
          <span className="text-slate-400">{t.nav.save} ✓</span>
        </div>
      </div>

      <ol className="card flex overflow-x-auto p-1">
        {STEPS.map((s, i) => (
          <li key={s} className="flex-1 min-w-[90px]">
            <button onClick={() => setStep(i)} className={`w-full rounded-lg px-2 py-2 text-xs font-medium sm:text-sm transition ${i === step ? 'bg-brand-700 text-white' : i < step ? 'text-brand-700 hover:bg-brand-50' : 'text-slate-500 hover:bg-slate-50'}`}>
              <span className={`me-1.5 inline-grid h-5 w-5 place-items-center rounded-full text-[11px] ${i === step ? 'bg-white/20' : i < step ? 'bg-brand-100' : 'bg-slate-100'}`}>{i < step ? <Check size={12} /> : i + 1}</span>
              {t.steps[s]}
            </button>
          </li>
        ))}
      </ol>
      <p className="text-sm text-slate-600">{t.stepHelp[STEPS[step]]}</p>

      {step === 0 && <StepInfo {...props} />}
      {step === 1 && <StepLoads {...props} />}
      {step === 2 && <StepSite {...props} />}
      {step === 3 && <StepDesign {...props} />}
      {step === 4 && <StepResults {...props} />}
      {step === 5 && <StepBom {...props} />}
      {step === 6 && <StepExport {...props} />}

      <div className="flex items-center justify-between pt-2">
        <button className="btn-secondary" disabled={step === 0} onClick={() => setStep(step - 1)}><Back size={16} />{t.nav.back}</button>
        {step < STEPS.length - 1
          ? <button className="btn-primary" onClick={() => setStep(step + 1)}>{t.nav.next}<Next size={16} /></button>
          : <button className="btn-primary" onClick={() => setView('projects')}><Check size={16} />{t.nav.finish}</button>}
      </div>
    </div>
  )
}
