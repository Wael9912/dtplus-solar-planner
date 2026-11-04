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
/** Latest projects on the home screen: four across on desktop, three on phones (one fewer when the calculator has work in progress). */
const RECENT = 4

/**
 * Home: every feature of the app on one screen, grouped by what it is for — calculators (instant answers, nothing saved),
 * quotes & proposals (saved to history) and history & company — with the latest work and the history one tap away.
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

  return (
    <div className="space-y-7 sm:space-y-9" data-testid="home-page">
      <div>
        <h1 className="text-display text-slate-900">{C.hello}</h1>
        <p className="mt-0.5 text-sm text-slate-600">{C.helloSub}</p>
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
          <ul className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2 sm:gap-3 lg:grid-cols-4">
            {scratch && (
              <li>
                <button type="button" onClick={() => startCalc()} data-testid="continue-calc"
                  className="flex h-full min-h-16 w-full items-center gap-3 rounded-xl border border-brand-300 bg-brand-50 px-3 py-2.5 text-start transition hover:bg-brand-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 sm:px-4">
                  <span className="grid size-10 shrink-0 place-items-center rounded-lg bg-brand-700 text-white"><Calculator size={20} /></span>
                  <span className="min-w-0 flex-1">
                    <span className="block font-semibold text-brand-900">{C.continue}</span>
                    <span className="block truncate text-sm text-brand-800">{scratch}</span>
                  </span>
                  <Arrow size={20} className="shrink-0 text-brand-700" aria-hidden="true" />
                </button>
              </li>
            )}
            {recent.slice(0, scratch ? RECENT - 1 : RECENT).map(({ p, total, mode }, i) => (
              <li key={p.id} className={i + (scratch ? 1 : 0) >= 3 ? 'hidden sm:block' : ''}>
                <button type="button" onClick={() => openProject(p.id)} data-testid="recent-project"
                  className="card flex h-full w-full flex-col px-3 py-2.5 text-start transition hover:border-brand-400 hover:bg-brand-50/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 sm:px-4 sm:py-3">
                  <span className="block w-full truncate font-semibold text-slate-900"><bdi>{projectTitle(p.name, t)}</bdi></span>
                  <span className="block w-full truncate text-xs text-slate-500"><bdi>{[p.clientName || '—', p.reference].filter(Boolean).join(' · ')}</bdi></span>
                  <span className="mt-auto flex w-full min-w-0 items-center gap-1.5 pt-2">
                    <span className="badge-neutral">{t.modes.short[mode]}</span>
                    <Badge level={statusLevel[p.status]}>{t.info.statuses[p.status]}</Badge>
                    <span className="ms-auto shrink-0 ps-1 text-sm font-semibold text-slate-900 tabular-nums" data-testid="recent-total"><bdi>{total}</bdi></span>
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
            <p className="mt-0.5 text-sm text-slate-600">{C.newHereBody}</p>
          </div>
          <div className="flex flex-col gap-2 sm:flex-row">
            <button type="button" className="btn-secondary" onClick={() => setView('settings')} data-testid="home-setup-company">
              {companyDone ? <Check size={18} className="text-brand-700" /> : <Building2 size={18} />}{t.projects.stepCompany}
            </button>
            <button type="button" className="btn-secondary" onClick={loadSamples} data-testid="load-samples"><Sparkles size={18} />{t.projects.stepSamples}</button>
          </div>
        </section>
      )}

      <Group id="calc" title={C.groups.calc} note={C.groups.calcNote} tiles={calculators} cols="sm:grid-cols-3 lg:grid-cols-5" />
      <Group id="quotes" title={C.groups.quotes} note={C.groups.quotesNote} tiles={quotes} cols="sm:grid-cols-3" />
      <Group id="business" title={C.groups.business} note={C.groups.businessNote} tiles={business} cols="sm:grid-cols-4" />
    </div>
  )
}

/** One group of tiles: two per row on phones (an odd first tile — the group's main tool — takes the full row). */
function Group({ id, title, note, tiles, cols }: { id: string; title: string; note: string; tiles: TileDef[]; cols: string }) {
  return (
    <section aria-labelledby={`home-${id}`} data-testid={`home-group-${id}`}>
      <h2 id={`home-${id}`} className="text-title text-slate-900">{title}</h2>
      <p className="mt-0.5 text-sm text-slate-500">{note}</p>
      <ul className={`mt-3 grid grid-cols-2 gap-2 sm:gap-3 ${cols}`}>
        {tiles.map((x, i) => {
          const wide = i === 0 && tiles.length % 2 === 1
          return (
            <li key={x.key} className={wide ? 'col-span-2 sm:col-span-1' : ''}>
              <button type="button" onClick={x.run} data-testid={x.testId} title={x.help}
                className={`card flex h-full min-h-[4.75rem] w-full gap-2 p-3 text-start transition hover:border-brand-400 hover:bg-brand-50/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 sm:flex-col sm:items-start sm:p-4 ${wide ? 'items-center gap-3' : 'flex-col items-start'}`}>
                <span className={`grid size-10 shrink-0 place-items-center rounded-lg ${x.primary ? 'bg-brand-700 text-white' : 'bg-brand-50 text-brand-700'}`}><x.icon size={20} /></span>
                <span className="min-w-0">
                  <span className="block text-sm leading-snug font-semibold text-slate-900 sm:text-[0.9375rem]">{x.label}</span>
                  <span className="mt-0.5 block text-xs leading-[1.125rem] text-slate-600 sm:hidden" data-testid="tile-short">{x.short}</span>
                  <span className="mt-1 hidden text-xs leading-5 text-slate-600 sm:block">{x.help}</span>
                </span>
              </button>
            </li>
          )
        })}
      </ul>
    </section>
  )
}
