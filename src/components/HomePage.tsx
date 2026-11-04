import { useMemo, type ComponentType } from 'react'
import { ArrowLeft, ArrowRight, Building2, Calculator, Check, DatabaseBackup, History, Sparkles, Tags } from 'lucide-react'
import { useAppStore } from '../store/useAppStore'
import { useT } from '../i18n'
import { computeProject } from '../engine/compute'
import { buildQuote, formatQuoteMoney } from '../engine/quote'
import { fmt } from '../engine/format'
import { projectMode } from '../engine/sizing'
import { companyTitle, projectTitle } from '../i18n/labels'
import { toast } from '../store/useToast'
import { Badge } from './ui'
import { usePriceBook } from './useEngine'
import { useStartActions, type StartKey } from './startMenu'
import { hasDemand } from './wizardModel'
import { TOOL_ICONS, TOOL_IDS } from './tools/useTool'
import { InstallBanner } from './InstallApp'
import { localizedSamples, statusLevel } from './projectMeta'

type Icon = ComponentType<{ size?: number; className?: string }>
interface TileDef { key: string; label: string; help: string; short: string; icon: Icon; run: () => void; testId: string; primary?: boolean }
/** Latest projects on the home screen: four on desktop, three on phones (one fewer when the calculator has work in progress). */
const RECENT = 4

/**
 * Home: every feature on one screen, grouped by what it is for (calculators, quotes & proposals, history & company),
 * with the latest work first and the history one tap away.
 */
export function HomePage() {
  const { t, lang, dir } = useT()
  const C = t.calc.home
  const projects = useAppStore((s) => s.projects)
  const calc = useAppStore((s) => s.calc)
  const company = useAppStore((s) => s.company)
  const book = usePriceBook()
  const start = useStartActions()
  const { setView, openTool, openProject, startCalc, importMany } = useAppStore.getState()
  const Arrow = dir === 'rtl' ? ArrowLeft : ArrowRight

  const act = (k: StartKey) => start.find((a) => a.key === k)!
  const fromStart = (k: StartKey, short: string, primary = false): TileDef => {
    const a = act(k)
    return { key: k, label: a.label, help: a.help, short, icon: a.icon, run: a.run, testId: `start-${k}`, primary }
  }
  const calculators: TileDef[] = [
    fromStart('calc', C.short.calc, true),
    ...TOOL_IDS.map((id) => ({ key: id, label: t.tools.names[id], help: t.tools.helps[id], short: C.short[id], icon: TOOL_ICONS[id], run: () => openTool(id), testId: `start-tool-${id}` })),
  ]
  const quotes: TileDef[] = [fromStart('size', C.short.size, true), fromStart('items', C.short.items), fromStart('design', C.short.design)]
  const openBackup = () => {
    setView('settings')
    requestAnimationFrame(() => document.getElementById('company-file')?.scrollIntoView({ block: 'start', behavior: 'smooth' }))
  }
  const business: TileDef[] = [
    { key: 'history', label: C.history, help: C.historyHelp, short: C.historyCount(projects.length), icon: History, run: () => setView('projects'), testId: 'home-history', primary: true },
    { key: 'prices', label: t.nav.prices, help: C.pricesHelp, short: C.short.prices, icon: Tags, run: () => setView('prices'), testId: 'home-prices' },
    { key: 'settings', label: t.nav.settings, help: C.settingsHelp, short: C.short.settings, icon: Building2, run: () => setView('settings'), testId: 'home-settings' },
    { key: 'backup', label: C.backup, help: C.backupHelp, short: C.short.backup, icon: DatabaseBackup, run: openBackup, testId: 'home-backup' },
  ]

  // Latest saved work, priced with the company price list
  const recent = useMemo(() => [...projects].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)).slice(0, RECENT).map((p) => {
    const r = computeProject(p, book)
    const q = buildQuote(p, r)
    return { p, total: hasDemand(p, r) && q.total > 0 ? formatQuoteMoney(q.total, q, 0) : '—', mode: projectMode(p) }
  }), [projects, book])
  // The load calculator's scratch work (kept until "Make full proposal" or Clear)
  const scratch = useMemo(() => {
    if (!calc) return null
    if (calc.sizing?.demand === 'bill') return calc.sizing.bill.monthlyKwh > 0 ? C.continueBill(fmt(calc.sizing.bill.monthlyKwh)) : null
    if (!calc.loads.length) return null
    const kwh = calc.loads.reduce((s, l) => s + l.watts * l.qty * l.hoursPerDay, 0) / 1000
    return C.continueLoads(calc.loads.length, fmt(kwh, 1))
  }, [calc, C])

  // Samples open the history so the four projects are in view
  const loadSamples = () => {
    importMany(localizedSamples(lang))
    toast({ message: t.projects.samplesLoaded })
    setView('projects')
  }
  const companyDone = !!companyTitle(company.name)
  const shownRecent = recent.slice(0, scratch ? RECENT - 1 : RECENT)

  return (
    <div className="space-y-8 sm:space-y-10" data-testid="home-page">
      <div>
        <h1 className="text-display text-slate-900">{C.hello}</h1>
        {C.helloSub && <p className="mt-1 text-sm text-slate-500">{C.helloSub}</p>}
      </div>
      <InstallBanner />

      {(scratch || recent.length > 0) ? (
        <section aria-labelledby="home-resume" data-testid="home-resume">
          <div className="flex items-center justify-between gap-3">
            <h2 id="home-resume" className="text-title text-slate-900">{C.resume}</h2>
            {projects.length > 0 && (
              <button type="button" className="btn-link min-h-11 shrink-0 sm:min-h-0" onClick={() => setView('projects')} data-testid="home-history-link">
                {C.allHistory(projects.length)}<Arrow size={16} aria-hidden="true" />
              </button>
            )}
          </div>
          <ul className="card mt-3 divide-y divide-slate-100">
            {scratch && (
              <li>
                <button type="button" onClick={() => startCalc()} data-testid="continue-calc"
                  className="flex min-h-14 w-full items-center gap-3 px-3 py-2.5 text-start transition hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand-500 sm:px-4">
                  <span className="grid size-9 shrink-0 place-items-center rounded-md bg-brand-50 text-brand-700"><Calculator size={18} /></span>
                  <span className="min-w-0 flex-1">
                    <span className="block font-semibold text-slate-900">{C.continue}</span>
                    <span className="block truncate text-sm text-slate-500">{scratch}</span>
                  </span>
                  <Arrow size={18} className="shrink-0 text-slate-400" aria-hidden="true" />
                </button>
              </li>
            )}
            {shownRecent.map(({ p, total, mode }, i) => (
              <li key={p.id} className={i + (scratch ? 1 : 0) >= 3 ? 'hidden sm:block' : ''}>
                <button type="button" onClick={() => openProject(p.id)} data-testid="recent-project"
                  className="flex min-h-14 w-full items-center gap-3 px-3 py-2.5 text-start transition hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand-500 sm:px-4">
                  <span className="min-w-0 flex-1">
                    <span className="flex items-baseline justify-between gap-3">
                      <span className="min-w-0 truncate font-semibold text-slate-900"><bdi>{projectTitle(p.name, t)}</bdi></span>
                      <span className="shrink-0 text-sm font-semibold text-slate-900 tabular-nums" data-testid="recent-total"><bdi>{total}</bdi></span>
                    </span>
                    <span className="mt-0.5 flex items-center justify-between gap-3">
                      <span className="min-w-0 truncate text-sm text-slate-500"><bdi>{[p.clientName || '—', p.reference, t.modes.short[mode]].filter(Boolean).join(' · ')}</bdi></span>
                      <Badge level={statusLevel[p.status]}>{t.info.statuses[p.status]}</Badge>
                    </span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </section>
      ) : (
        <section className="card flex flex-col gap-4 p-4 sm:flex-row sm:items-center sm:p-5" data-testid="home-new-here">
          <div className="min-w-0 flex-1">
            <h2 className="text-title text-slate-900">{C.newHere}</h2>
            <p className="mt-0.5 text-sm text-slate-500">{C.newHereBody}</p>
          </div>
          <div className="flex flex-col gap-2 sm:flex-row">
            <button type="button" className="btn-secondary" onClick={() => setView('settings')} data-testid="home-setup-company">
              {companyDone ? <Check size={18} className="text-brand-700" /> : <Building2 size={18} />}{t.projects.stepCompany}
            </button>
            <button type="button" className="btn-secondary" onClick={loadSamples} data-testid="load-samples"><Sparkles size={18} />{t.projects.stepSamples}</button>
          </div>
        </section>
      )}

      <Group id="quotes" title={C.groups.quotes} tiles={quotes} cols="sm:grid-cols-3" />
      <Group id="calc" title={C.groups.calc} tiles={calculators} cols="sm:grid-cols-3 lg:grid-cols-5" />
      <Group id="business" title={C.groups.business} tiles={business} cols="sm:grid-cols-4" />
    </div>
  )
}

/** One group of tiles: two per row on phones (an odd first tile, the group's main tool, takes the full row). */
function Group({ id, title, tiles, cols }: { id: string; title: string; tiles: TileDef[]; cols: string }) {
  return (
    <section aria-labelledby={`home-${id}`} data-testid={`home-group-${id}`}>
      <h2 id={`home-${id}`} className="text-title text-slate-900">{title}</h2>
      <ul className={`mt-3 grid grid-cols-2 gap-2 sm:gap-3 ${cols}`}>
        {tiles.map((x, i) => {
          const wide = i === 0 && tiles.length % 2 === 1
          return (
            <li key={x.key} className={wide ? 'col-span-2 sm:col-span-1' : ''}>
              <button type="button" onClick={x.run} data-testid={x.testId} title={x.help}
                className={`card flex h-full min-h-[4.5rem] w-full gap-3 p-3 text-start transition hover:border-slate-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 sm:flex-col sm:items-start sm:gap-3 sm:p-4 ${wide ? 'items-center' : 'flex-col items-start'}`}>
                <span className={`grid size-9 shrink-0 place-items-center rounded-md ${x.primary ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-700'}`}><x.icon size={18} /></span>
                <span className="min-w-0">
                  <span className="block text-sm leading-snug font-semibold text-slate-900">{x.label}</span>
                  <span className="mt-0.5 block text-xs leading-[1.125rem] text-slate-500 sm:hidden" data-testid="tile-short">{x.short}</span>
                  <span className="mt-1 hidden text-xs leading-5 text-slate-500 sm:block">{x.help}</span>
                </span>
              </button>
            </li>
          )
        })}
      </ul>
    </section>
  )
}
