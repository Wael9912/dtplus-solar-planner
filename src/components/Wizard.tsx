import { useEffect, useRef, useState } from 'react'
import { ChevronLeft, ChevronRight, ChevronDown, Check, PlugZap, CloudCheck, CloudAlert, Info, Lock } from 'lucide-react'
import { useAppStore, useCurrentProject } from '../store/useAppStore'
import { useT } from '../i18n'
import { formatQuoteMoney, type Quote } from '../engine/quote'
import { fmt } from '../engine/format'
import { fmtDate, projectTitle } from '../i18n/labels'
import { StepInfo } from './steps/StepInfo'
import { StepLoads } from './steps/StepLoads'
import { StepSite } from './steps/StepSite'
import { StepDesign } from './steps/StepDesign'
import { StepResults } from './steps/StepResults'
import { StepBom } from './steps/StepBom'
import { StepExport } from './steps/StepExport'
import { EmptyState, Switch } from './ui'
import { useMediaQuery } from './hooks'
import { Sheet } from './overlay'
import { ChecksList } from './Checks'
import { stepsFor, stepStatuses, realIssues, hasDemand, type StepStatus } from './wizardModel'
import { useComputed } from './useEngine'
import type { Project, Results, StepKey } from '../engine/types'
import { useSaveState } from '../store/useSaveState'

export interface StepProps { project: Project; results: Results; quote: Quote; update: (patch: Partial<Project> | ((p: Project) => Partial<Project>)) => void; goTo: (s: StepKey) => void }
function StatusCircle({ status, n, current }: { status: StepStatus; n: number; current: boolean }) {
  const base = 'inline-grid size-6 shrink-0 place-items-center rounded-full text-xs font-semibold'
  if (current) return <span className={`${base} bg-white/20 text-white`}>{status === 'error' || status === 'warn' ? '!' : n}</span>
  if (status === 'error') return <span className={`${base} bg-red-600 text-white`}>!</span>
  if (status === 'warn') return <span className={`${base} bg-amber-400 text-amber-950`}>!</span>
  if (status === 'done') return <span className={`${base} bg-brand-100 text-brand-700`}><Check size={14} strokeWidth={3} /></span>
  return <span className={`${base} bg-slate-100 text-slate-600`}>{n}</span>
}
const segCls: Record<StepStatus, string> = { done: 'bg-brand-600', todo: 'bg-slate-200', warn: 'bg-amber-400', error: 'bg-red-500' }

export function Wizard() {
  const { t, dir } = useT()
  const saveFailed = useSaveState((x) => x.failed)
  const project = useCurrentProject()
  const step = useAppStore((s) => s.step)
  const setStep = useAppStore((s) => s.setStep)
  const updateProject = useAppStore((s) => s.updateProject)
  const setView = useAppStore((s) => s.setView)
  const clientView = useAppStore((s) => s.clientView)
  const setClientView = useAppStore((s) => s.setClientView)
  const { results, quote, book: companyBook } = useComputed(project)
  const maxStep = useAppStore((s) => s.maxStep)
  const applyCurrentPrices = useAppStore((s) => s.applyCurrentPrices)
  const [sheet, setSheet] = useState<'steps' | 'issues' | null>(null)
  const tiny = useMediaQuery('(max-width: 399px)')
  const heading = useRef<HTMLHeadingElement>(null)
  const firstRun = useRef(true)
  // A double tap on Next / Back moves one step, not two: the second click of a double click (detail ≥ 2) and repeats within
  // 120 ms are ignored; deliberate taps in a row still move one step each
  const lastMove = useRef(0)
  const move = (to: number, detail = 1) => { const now = Date.now(); if (detail > 1 || now - lastMove.current < 120) return; lastMove.current = now; setStep(to) }

  useEffect(() => { if (!project) setView('projects') }, [project, setView])
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'instant' as ScrollBehavior })
    if (!firstRun.current) heading.current?.focus({ preventScroll: true })
    firstRun.current = false
  }, [step, project?.id])

  if (!project || !results || !quote) return null
  const STEPS = stepsFor(project)
  const cur = Math.max(0, Math.min(step, STEPS.length - 1))
  const key = STEPS[cur]
  const update: StepProps['update'] = (patch) => updateProject(project.id, patch)
  const goTo = (s: StepKey) => { setSheet(null); const i = STEPS.indexOf(s); if (i >= 0) setStep(i) }
  const props: StepProps = { project, results, quote, update, goTo }
  const status = stepStatuses(project, results, quote, Math.max(cur, maxStep[project.id] ?? 0))
  const lockedStale = !!project.lockedPrices && JSON.stringify(project.lockedPrices) !== JSON.stringify(companyBook)
  const hasLoads = hasDemand(project, results)
  const issues = hasLoads ? realIssues(results.checks).filter((c) => c.id !== 'no-loads' && c.id !== 'no-items') : []
  const BackIc = dir === 'rtl' ? ChevronRight : ChevronLeft
  const NextIc = dir === 'rtl' ? ChevronLeft : ChevronRight
  const nErr = issues.filter((c) => c.level === 'error').length

  const kpi = (() => {
    const sys = [results.arrayKwp > 0 ? `${fmt(results.arrayKwp, 2)} kWp` : '', results.batteryKwh ? `${fmt(results.batteryKwh, 1)} kWh` : '', results.inverter && (!tiny || !results.batteryKwh || !results.arrayKwp) ? `${fmt(results.inverterTotalKw, 1)} kW` : ''].filter(Boolean).join(' · ') || '—'
    if (results.mode === 'items') return { cap: t.bom.grand, val: formatQuoteMoney(quote.total, quote, 0) }
    if (results.mode === 'design' && (key === 'info' || key === 'loads')) return { cap: t.loads.totalDaily, val: `${fmt(results.dailyWh / 1000, 2)} kWh${results.peakW ? ` · ${fmt(results.peakW / 1000, 1)} kW` : ''}` }
    if (!hasLoads) return { cap: t.loads.totalDaily, val: '0 kWh' }
    if (key === 'site' || key === 'design' || key === 'results') return { cap: t.results.summary, val: sys }
    return { cap: t.bom.grand, val: formatQuoteMoney(quote.total, quote, 0) }
  })()
  const needsLoads = results.mode === 'design' && !hasLoads && (key === 'results' || key === 'bom' || key === 'export')

  return (
    <div className="space-y-4 sm:space-y-5">
      {/* Desktop/tablet title row */}
      <div className="hidden flex-wrap items-end justify-between gap-3 sm:flex">
        <div className="min-w-0">
          <h1 className="truncate text-display text-slate-900"><bdi>{projectTitle(project.name, t)}</bdi></h1>
          <p className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-slate-500">
            {(project.clientName || project.reference) && <bdi>{[project.clientName, project.reference].filter(Boolean).join(' · ')}</bdi>}
            <span className="badge-neutral">{t.modes.short[results.mode]}</span>
            <span className="badge-neutral">{t.info.statuses[project.status]}</span>
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          {issues.length > 0
            ? <button type="button" data-testid="issues-btn" className={`badge ${nErr ? 'badge-err' : 'badge-warn'} min-h-9 cursor-pointer px-3 text-sm`} onClick={() => setSheet('issues')}>{t.nav.issues(issues.length)}</button>
            : hasLoads ? <span className="badge-ok min-h-9 px-3 text-sm"><Check size={14} />{t.nav.noIssues}</span> : null}
          <Switch checked={clientView} onChange={setClientView} label={t.nav.clientView} data-testid="client-view" />
          {saveFailed
            ? <span className="hidden items-center gap-1 text-xs font-medium text-red-700 lg:inline-flex" data-testid="not-saved"><CloudAlert size={14} />{t.storage.notSaved}</span>
            : <span className="hidden items-center gap-1 text-xs text-slate-500 lg:inline-flex"><CloudCheck size={14} />{t.nav.savedAuto}</span>}
        </div>
      </div>

      {/* Desktop/tablet stepper */}
      <nav aria-label={t.nav.steps} className="hidden sm:block">
        <ol className="card flex gap-1 p-1.5">
          {STEPS.map((s, i) => (
            <li key={s} className="min-w-0 flex-1">
              <button type="button" data-testid={`step-${i}`} aria-current={i === cur ? 'step' : undefined} title={`${t.steps[s]} · ${t.stepStatus[status[s]]}`} onClick={() => setStep(i)}
                className={`flex min-h-10 w-full items-center justify-center gap-2 rounded-lg px-2 text-sm font-medium whitespace-nowrap transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 lg:justify-start ${i === cur ? 'bg-brand-700 text-white' : 'text-slate-700 hover:bg-slate-100'}`}>
                <StatusCircle status={status[s]} n={i + 1} current={i === cur} />
                <span className={`min-w-0 truncate ${i === cur ? '' : 'hidden lg:inline'}`}>{t.steps[s]}</span>
              </button>
            </li>
          ))}
        </ol>
      </nav>

      {/* Phone: compact progress header that opens the step list */}
      <div className="sm:hidden">
        <button type="button" data-testid="step-sheet-btn" aria-haspopup="dialog" onClick={() => setSheet('steps')} className="flex min-h-14 w-full items-center gap-3 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-start shadow-[var(--shadow-card)]">
          <span className="min-w-0 flex-1">
            <span className="block text-xs text-slate-500">{t.nav.stepOf(cur + 1, STEPS.length)}</span>
            <span className="block truncate text-base font-semibold text-slate-900">{t.steps[key]}</span>
          </span>
          {issues.length > 0 && <span className={nErr ? 'badge-err' : 'badge-warn'}>{t.nav.issues(issues.length)}</span>}
          <ChevronDown size={20} className="shrink-0 text-slate-500" />
        </button>
        <div className="mt-2 flex gap-1 px-0.5" aria-hidden="true">{STEPS.map((s, i) => <span key={s} className={`h-1.5 flex-1 rounded-full ${i === cur ? 'bg-brand-800' : segCls[status[s]]}`} />)}</div>
      </div>

      <div>
        <h2 ref={heading} tabIndex={-1} className="sr-only text-title text-slate-900 outline-none sm:not-sr-only">{t.steps[key]}</h2>
        <p className="mt-0.5 hidden max-w-3xl text-sm text-slate-600 sm:block">{t.stepHelp[key]}</p>
      </div>

      {lockedStale && (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-xl border border-sky-200 bg-sky-50 px-4 py-3 text-sm text-sky-900" role="status" data-testid="prices-locked">
          <Lock size={18} className="shrink-0" aria-hidden="true" />
          <span className="min-w-0 flex-1">{t.nav.pricesLocked(project.lockedAt ? fmtDate(project.lockedAt) : '')}</span>
          <button type="button" className="btn-secondary min-h-10" data-testid="apply-current-prices" onClick={() => applyCurrentPrices(project.id)}>{t.nav.useCurrentPrices}</button>
        </div>
      )}

      {needsLoads ? (
        <EmptyState icon={PlugZap} title={t.empty.needLoadsTitle} body={t.empty.needLoadsBody}>
          <button type="button" className="btn-primary" data-testid="go-loads" onClick={() => goTo('loads')}>{t.empty.goLoads}</button>
        </EmptyState>
      ) : (
        <>
          {key === 'info' && <StepInfo {...props} />}
          {key === 'loads' && <StepLoads {...props} />}
          {key === 'site' && <StepSite {...props} />}
          {key === 'design' && <StepDesign {...props} />}
          {key === 'results' && <StepResults {...props} />}
          {key === 'bom' && <StepBom {...props} />}
          {key === 'export' && <StepExport {...props} />}
        </>
      )}

      {/* Sticky action bar: Back · live headline figure · Next */}
      <div className="wizard-bar fixed inset-x-0 bottom-0 z-30 border-t border-slate-200 bg-white/95 pb-[env(safe-area-inset-bottom)] shadow-[0_-4px_16px_-8px_rgb(15_23_42/0.15)] backdrop-blur" data-testid="wizard-bar">
        <div className="mx-auto flex max-w-7xl items-center gap-2 ps-[max(0.75rem,env(safe-area-inset-left))] pe-[max(0.75rem,env(safe-area-inset-right))] py-2 sm:gap-3 sm:px-6">
          {cur > 0
            ? <button type="button" data-testid="nav-back" className="btn-secondary btn-icon h-12 w-12 sm:h-auto sm:w-auto sm:px-4" onClick={(e) => move(cur - 1, e.detail)} aria-label={t.nav.back}><BackIc size={20} /><span className="hidden sm:inline">{t.nav.back}</span></button>
            : <span className="hidden w-12 sm:block sm:w-[5.5rem]" />}
          <div className="min-w-0 flex-1 text-center sm:text-start" data-testid="bar-kpi">
            <div className="truncate text-xs text-slate-500 sm:text-xs">{kpi.cap}</div>
            <div className="truncate text-sm font-semibold text-slate-900 tabular-nums sm:text-base"><bdi>{kpi.val}</bdi></div>
          </div>
          {cur < STEPS.length - 1
            ? <button type="button" data-testid="nav-next" className="btn-primary h-12 px-4 sm:h-auto" onClick={(e) => move(cur + 1, e.detail)}>
                <span className="sm:hidden">{t.nav.next}</span><span className="hidden sm:inline">{t.nav.nextTo(t.steps[STEPS[cur + 1]])}</span><NextIc size={18} />
              </button>
            : <button type="button" data-testid="nav-finish" className="btn-primary h-12 px-4 sm:h-auto" title={t.nav.finishHelp} onClick={() => setView('projects')}><Check size={18} />{t.nav.finish}</button>}
        </div>
      </div>

      <Sheet open={sheet === 'steps'} onClose={() => setSheet(null)} title={t.nav.steps} description={t.stepHelp[key]} testId="step-sheet">
        <ol className="space-y-1">
          {STEPS.map((s, i) => (
            <li key={s}>
              <button type="button" data-testid={`sheet-step-${i}`} aria-current={i === cur ? 'step' : undefined} onClick={() => { setSheet(null); setStep(i) }}
                className={`flex min-h-13 w-full items-center gap-3 rounded-xl px-3 text-start transition ${i === cur ? 'bg-brand-700 text-white' : 'hover:bg-slate-100'}`}>
                <StatusCircle status={status[s]} n={i + 1} current={i === cur} />
                <span className="min-w-0 flex-1 font-medium">{t.steps[s]}</span>
                <span className={`text-xs ${i === cur ? 'text-white/80' : status[s] === 'error' ? 'text-red-700' : status[s] === 'warn' ? 'text-amber-700' : 'text-slate-500'}`}>{i === cur ? t.stepStatus.current : t.stepStatus[status[s]]}</span>
              </button>
            </li>
          ))}
        </ol>
        {issues.length > 0 && <div className="mt-4 border-t border-slate-100 pt-3"><p className="eyebrow mb-1 flex items-center gap-1"><Info size={14} />{t.results.issuesN(issues.length)}</p><ChecksList checks={issues} current={key} onGo={goTo} steps={STEPS} dense /></div>}
      </Sheet>
      <Sheet open={sheet === 'issues'} onClose={() => setSheet(null)} title={t.results.checks} description={t.results.issuesN(issues.length)} variant="drawer" testId="issues-sheet">
        <ChecksList checks={issues} current={key} onGo={goTo} steps={STEPS} dense />
      </Sheet>
    </div>
  )
}
