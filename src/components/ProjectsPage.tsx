import { useMemo, useRef, useState, type ReactNode } from 'react'
import { Plus, Copy, Trash2, Upload, Search, FolderOpen, Download, Building2, Sparkles, Check, X, Calculator, ArrowLeft, ArrowRight, GitBranchPlus } from 'lucide-react'
import { useAppStore, STATUSES } from '../store/useAppStore'
import { useT } from '../i18n'
import { computeProject } from '../engine/compute'
import { buildQuote, formatQuoteMoney } from '../engine/quote'
import { fmt, fxOf } from '../engine/format'
import { projectMode } from '../engine/sizing'
import { companyTitle, fmtDate, matchAppliance, projectTitle } from '../i18n/labels'
import { Badge } from './ui'
import { ConfirmDialog, Menu, Sheet } from './overlay'
import { usePriceBook } from './useEngine'
import { useStartActions, type StartAction } from './startMenu'
import { hasDemand } from './wizardModel'
import type { Project } from '../engine/types'
import { sampleProjects } from '../data/samples'
import { download } from '../export/download'
import { toast } from '../store/useToast'
import { normalizeSearch } from '../data/searchKeywords'

type Status = Project['status']
const statusLevel: Record<Status, 'neutral' | 'info' | 'ok' | 'error'> = { draft: 'neutral', quoted: 'info', approved: 'ok', installed: 'ok', lost: 'error' }
// Arabic display data for the bundled samples (keyed by quote reference)
const SAMPLE_AR: Record<string, Partial<Project>> = {
  'Q-2026-0112': { name: 'فيلا الرياض — نظام هجين 10 كيلوواط', clientName: 'أحمد الفهد', clientAddress: 'حي الياسمين، الرياض' },
  'Q-2026-0098': { name: 'مزرعة الأبيض — مضخة منفصلة عن الشبكة', clientName: 'مريم عثمان', clientAddress: 'الأبيض، شمال كردفان' },
  'Q-2026-0105': { name: 'صيدلية الخرطوم — نظام هجين احتياطي', clientName: 'صيدلية د. صلاح', clientAddress: 'شارع 15، العمارات، الخرطوم' },
  'Q-2026-0120': { name: 'مستودع دبي — 100 كيلوواط متصل بالشبكة', clientName: 'الخليج للخدمات اللوجستية ذ.م.م', clientAddress: 'المنطقة الحرة بجبل علي' },
}
const revBase = (ref?: string) => (ref ?? '').trim().replace(/-R\d+$/, '')
const revNo = (ref?: string) => Number(/-R(\d+)$/.exec((ref ?? '').trim())?.[1] ?? 1)
/** Short money for the status chips: $12.4K, 1.2M SDG. */
const compactMoney = (v: number, cur: string) => {
  const n = new Intl.NumberFormat('en-US', { notation: 'compact', maximumFractionDigits: Math.abs(v) >= 1e6 ? 1 : 0 }).format(v)
  return cur === 'USD' ? `$${n}` : `${n} ${cur}`
}
/**
 * Older revisions of the same quote: same reference base with a lower -R number, or an ancestor in the `revisionOf` chain.
 * Maps the superseded project id → label of the newest revision ("R3"; '' when that one has no -R reference).
 */
function supersededBy(projects: Project[]): Map<string, string> {
  const out = new Map<string, string>()
  const label = (p: Project) => (/-R\d+$/.test((p.reference ?? '').trim()) ? `R${revNo(p.reference)}` : '')
  const groups = new Map<string, Project[]>()
  for (const p of projects) { const b = revBase(p.reference); if (b) groups.set(b, [...(groups.get(b) ?? []), p]) }
  for (const g of groups.values()) {
    if (g.length < 2) continue
    const newest = g.reduce((a, b) => (revNo(b.reference) > revNo(a.reference) ? b : a))
    for (const p of g) if (revNo(p.reference) < revNo(newest.reference)) out.set(p.id, label(newest))
  }
  // revisionOf chain (references edited or empty): every ancestor is superseded by the newest descendant
  const byId = new Map(projects.map((p) => [p.id, p]))
  const children = new Map<string, Project[]>()
  for (const p of projects) if (p.revisionOf && byId.has(p.revisionOf) && p.revisionOf !== p.id) children.set(p.revisionOf, [...(children.get(p.revisionOf) ?? []), p])
  const newestBelow = (p: Project, seen = new Set<string>()): Project => {
    seen.add(p.id)
    let best: Project | null = null
    for (const c of children.get(p.id) ?? []) {
      if (seen.has(c.id)) continue
      const n = newestBelow(c, seen)
      if (!best || n.createdAt > best.createdAt) best = n
    }
    return best ?? p
  }
  for (const id of children.keys()) if (!out.has(id)) { const p = byId.get(id)!; const n = newestBelow(p); if (n !== p) out.set(id, label(n)) }
  return out
}
/** Digits only (Arabic-Indic digits normalised) — phone search ignores spaces, dashes and "+". */
const digits = (s: string) => s.replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x660)).replace(/[۰-۹]/g, (d) => String(d.charCodeAt(0) - 0x6f0)).replace(/\D/g, '')
/**
 * Phone search on digits only. From 7 digits the number is compared without its trunk zero / country code: the last 9 digits of the
 * query must appear in the phone ("0912345678" finds "+249 912 345 678"); shorter queries (3+ digits) match anywhere.
 */
function phoneMatch(phone: string, query: string): boolean {
  const ph = digits(phone), d = digits(query).replace(/^0+/, '')
  if (!ph || d.length < 3) return false
  return d.length >= 7 ? ph.includes(d.slice(-9)) : ph.includes(d)
}

/** Home: start hub (every way to start work, the load calculator first) and the project list. */
export function ProjectsPage() {
  const { t, lang, dir } = useT()
  const C = t.calc.home
  const projects = useAppStore((s) => s.projects)
  const company = useAppStore((s) => s.company)
  const calc = useAppStore((s) => s.calc)
  const book = usePriceBook()
  const start = useStartActions()
  const { openProject, deleteProject, restoreProject, duplicateProject, newRevision, importProject, importMany, setView, startCalc } = useAppStore.getState()
  const [q, setQ] = useState('')
  const [status, setStatus] = useState<Status | 'all'>('all')
  const [sort, setSort] = useState<'updated' | 'name' | 'value'>('updated')
  const [confirm, setConfirm] = useState<Project | null>(null)
  const [startSheet, setStartSheet] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)
  const Arrow = dir === 'rtl' ? ArrowLeft : ArrowRight

  // Card figures with the company price list; "value" = total in USD (comparable across currencies), 0 while there is nothing to price
  const enriched = useMemo(() => projects.map((p) => {
    const r = computeProject(p, book)
    const quote = buildQuote(p, r)
    const priced = hasDemand(p, r)
    return { p, r, quote, priced, mode: projectMode(p), value: priced ? r.totalUsd : 0 }
  }), [projects, book])
  const counts = useMemo(() => Object.fromEntries(STATUSES.map((s) => [s, projects.filter((p) => p.status === s).length])) as Record<Status, number>, [projects])
  const superseded = useMemo(() => supersededBy(projects), [projects])
  // Per-status value: sell total incl. VAT in the company currency (other currencies via the project's own rate → USD → company rate, shown as ≈);
  // superseded revisions and projects with nothing to price are left out
  const coCur = company.currency || 'USD'
  const totals = useMemo(() => {
    const coFx = fxOf({ currency: coCur, fxRateToUsd: company.fxRateToUsd })
    const sum = Object.fromEntries(STATUSES.map((s) => [s, 0])) as Record<Status, number>
    const approx = new Set<Status>()
    for (const { p, quote, priced } of enriched) {
      if (!priced || superseded.has(p.id) || !(quote.total > 0)) continue
      if (quote.currency === coCur) sum[p.status] += quote.total
      else { sum[p.status] += (quote.total / quote.fx) * coFx; approx.add(p.status) }
    }
    return { sum, approx }
  }, [enriched, superseded, coCur, company.fxRateToUsd])
  const statusValue = (s: Status) => totals.sum[s] > 0 ? `${totals.approx.has(s) ? '≈ ' : ''}${compactMoney(totals.sum[s], coCur)}` : null
  const list = useMemo(() => {
    const s = normalizeSearch(q)
    const xs = enriched.filter(({ p }) => (status === 'all' || p.status === status) && (!s
      || normalizeSearch(`${p.name} ${p.clientName} ${p.reference} ${p.clientAddress} ${p.clientPhone} ${p.clientEmail}`).includes(s)
      || phoneMatch(p.clientPhone || '', q)))
    return [...xs].sort((a, b) => sort === 'name' ? projectTitle(a.p.name, t).localeCompare(projectTitle(b.p.name, t), lang) : sort === 'value' ? b.value - a.value : b.p.updatedAt.localeCompare(a.p.updatedAt))
  }, [enriched, q, status, sort, t, lang])

  // The load calculator's scratch work (kept until "Make full proposal" or Clear)
  const scratch = useMemo(() => {
    if (!calc) return null
    if (calc.sizing?.demand === 'bill') return calc.sizing.bill.monthlyKwh > 0 ? C.continueBill(fmt(calc.sizing.bill.monthlyKwh)) : null
    if (!calc.loads.length) return null
    const kwh = calc.loads.reduce((s, l) => s + l.watts * l.qty * l.hoursPerDay, 0) / 1000
    return C.continueLoads(calc.loads.length, fmt(kwh, 1))
  }, [calc, C])

  const onImport = async (f: File) => {
    try {
      const p = importProject(JSON.parse(await f.text()))
      if (p) toast({ message: t.projects.imported(projectTitle(p.name, t)), tone: 'ok' }); else toast({ message: t.projects.importError, tone: 'err' })
    } catch { toast({ message: t.projects.importError, tone: 'err' }) }
  }
  const loadSamples = () => {
    const xs = sampleProjects().map((p) => {
      if (lang !== 'ar') return p
      return { ...p, ...SAMPLE_AR[p.reference], loads: p.loads.map((l) => ({ ...l, name: matchAppliance(l.name)?.nameAr ?? l.name })) }
    })
    importMany(xs)
    toast({ message: t.projects.samplesLoaded })
  }
  const doDelete = (p: Project) => {
    const res = deleteProject(p.id)
    if (res) toast({ message: t.projects.deleted(projectTitle(p.name, t)), action: { label: t.common.undo, run: () => restoreProject(res.project, res.index) } })
  }
  const dup = (p: Project) => { const c = duplicateProject(p.id); if (c) toast({ message: t.projects.duplicated(projectTitle(c.name, t)) }) }
  const revise = (p: Project) => {
    const c = newRevision(p.id); if (!c) return
    toast({ message: C.revisionCreated(c.reference || projectTitle(c.name, t)), tone: 'ok' })
    openProject(c.id)
  }
  const exportJson = (p: Project) => download(new Blob([JSON.stringify(p, null, 2)], { type: 'application/json' }), `${(p.name || 'solar-project').replace(/[^\w؀-ۿ-]+/g, '_')}.json`)
  const filtered = q.trim() !== '' || status !== 'all'
  const companyDone = !!companyTitle(company.name)
  const runStart = (a: StartAction) => { setStartSheet(false); a.run() }

  return (
    <div className="space-y-6 sm:space-y-8">
      <input ref={fileRef} type="file" accept="application/json,.json" hidden data-testid="import-file" onChange={(e) => { const f = e.target.files?.[0]; if (f) onImport(f); e.target.value = '' }} />

      {/* Start hub: every way to start work, in the order a sales desk reaches for them */}
      <section aria-labelledby="start-title" data-testid="start-hub">
        <h1 id="start-title" className="text-display text-slate-900">{C.title}</h1>
        {scratch && (
          <button type="button" onClick={() => startCalc()} data-testid="continue-calc"
            className="mt-3 flex min-h-14 w-full items-center gap-3 rounded-xl border border-brand-300 bg-brand-50 px-3 py-2.5 text-start transition hover:bg-brand-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 sm:px-4">
            <span className="grid size-10 shrink-0 place-items-center rounded-lg bg-brand-700 text-white"><Calculator size={20} /></span>
            <span className="min-w-0 flex-1">
              <span className="block font-semibold text-brand-900">{C.continue}</span>
              <span className="block truncate text-sm text-brand-800">{scratch}</span>
            </span>
            <Arrow size={20} className="shrink-0 text-brand-700" aria-hidden="true" />
          </button>
        )}
        <ul className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3 sm:gap-3 lg:grid-cols-5">
          {start.map((a, i) => (
            <li key={a.key} className={i === start.length - 1 && start.length % 2 ? 'col-span-2 sm:col-span-1' : ''}>
              <button type="button" onClick={a.run} data-testid={`start-${a.key}`} title={a.help}
                className="card flex h-full min-h-16 w-full items-center gap-3 p-3 text-start transition hover:border-brand-400 hover:bg-brand-50/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 sm:flex-col sm:items-start sm:gap-2 sm:p-4">
                <span className={`grid size-10 shrink-0 place-items-center rounded-lg ${i < 2 ? 'bg-brand-700 text-white' : 'bg-brand-50 text-brand-700'}`}><a.icon size={20} /></span>
                <span className="min-w-0">
                  <span className="block text-sm leading-snug font-semibold text-slate-900 sm:text-[0.9375rem]">{a.label}</span>
                  <span className="mt-1 hidden text-xs leading-5 text-slate-600 sm:block">{a.help}</span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      </section>

      <section aria-labelledby="projects-title" className="space-y-4">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 id="projects-title" className="text-[1.25rem] leading-7 font-semibold text-slate-900">{t.projects.title}</h2>
            {projects.length > 0 && <p className="mt-0.5 text-sm text-slate-500">{t.projects.count(projects.length)}</p>}
          </div>
          <div className="flex items-center gap-2">
            <button type="button" className="btn-secondary hidden sm:inline-flex" onClick={() => fileRef.current?.click()} data-testid="import-btn"><Upload size={18} />{t.projects.import}</button>
            <Menu label={t.common.more} testId="projects-menu" items={[
              { label: t.projects.import, icon: <Upload size={18} />, onClick: () => fileRef.current?.click(), testId: 'menu-import' },
              { label: t.projects.sample, icon: <Sparkles size={18} />, onClick: loadSamples, testId: 'menu-samples' },
            ]} />
          </div>
        </div>

        {projects.length === 0 ? (
          <section className="card p-5 sm:p-8" data-testid="get-started">
            <div className="flex items-center gap-3"><span className="grid size-12 shrink-0 place-items-center rounded-full bg-brand-50 text-brand-700"><FolderOpen size={24} /></span>
              <div><h3 className="card-title">{t.projects.getStarted}</h3><p className="text-sm text-slate-600">{C.emptyBody}</p></div></div>
            <ol className="mt-5 space-y-2">
              <Step n={1} done={companyDone} label={t.projects.stepCompany} action={<button type="button" className="btn-secondary" onClick={() => setView('settings')}><Building2 size={18} />{t.nav.settings}</button>} />
              <Step n={2} done={false} label={C.stepStart} />
              <Step n={3} done={false} label={t.projects.stepSamples} action={<button type="button" className="btn-secondary" onClick={loadSamples} data-testid="load-samples"><Sparkles size={18} />{t.projects.sample}</button>} />
            </ol>
          </section>
        ) : (
          <>
            <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
              <div className="relative w-full lg:w-80">
                <Search size={18} className="pointer-events-none absolute inset-y-0 start-3 my-auto text-slate-400" />
                <input className="input ps-10" type="search" dir="auto" placeholder={t.projects.search} aria-label={t.projects.search} value={q} onChange={(e) => setQ(e.target.value)} data-testid="projects-search" />
              </div>
              <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-0.5 [scrollbar-width:none] sm:mx-0 sm:px-0" role="group" aria-label={t.projects.statusFilter}>
                <button type="button" className="chip" aria-pressed={status === 'all'} onClick={() => setStatus('all')} data-testid="filter-all">{t.projects.all} <span className="opacity-70">{projects.length}</span></button>
                {STATUSES.map((s) => { const v = statusValue(s); return (
                  <button key={s} type="button" className="chip" aria-pressed={status === s} onClick={() => setStatus(s)} data-testid={`filter-${s}`}>
                    {t.info.statuses[s]} <span className="opacity-70">{counts[s]}</span>{v && <span className="opacity-70" data-testid="filter-total"> · <bdi>{v}</bdi></span>}
                  </button>
                ) })}
              </div>
              <label className="flex items-center gap-2 text-sm text-slate-600 lg:ms-auto">
                <span className="shrink-0">{t.projects.sort}</span>
                <select className="input w-auto min-w-40" value={sort} onChange={(e) => setSort(e.target.value as typeof sort)} data-testid="projects-sort">
                  <option value="updated">{t.projects.sortUpdated}</option><option value="name">{t.projects.sortName}</option><option value="value">{t.projects.sortValue}</option>
                </select>
              </label>
            </div>

            {STATUSES.some((s) => totals.sum[s] > 0) && (
              <p className="-mt-1 text-xs text-slate-500" data-testid="totals-note">{C.totalsNote(coCur)}{totals.approx.size > 0 && <> {C.totalsConverted}</>}</p>
            )}

            {list.length === 0 ? (
              <div className="card flex flex-col items-center px-6 py-10 text-center" data-testid="no-match">
                <p className="text-sm text-slate-700">{q.trim() ? t.projects.noMatch(q.trim()) : t.projects.noMatchStatus}</p>
                {filtered && <button type="button" className="btn-secondary mt-4" onClick={() => { setQ(''); setStatus('all') }}><X size={18} />{t.projects.clearSearch}</button>}
              </div>
            ) : (
              <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 sm:gap-4 xl:grid-cols-3" data-testid="project-list">
                {list.map(({ p, r, quote, priced, mode }) => {
                  const total = priced ? formatQuoteMoney(quote.total, quote, 0) : '—'
                  const old = superseded.get(p.id)
                  const nProducts = r.bom.filter((b) => b.qty > 0 && b.category !== 'Services').length
                  return (
                    <li key={p.id} data-testid="project-card" data-mode={mode} className="card group relative flex flex-col p-4 transition hover:border-slate-300 hover:shadow-md focus-within:ring-2 focus-within:ring-brand-500">
                      <div className="flex items-start gap-2">
                        <div className="min-w-0 flex-1">
                          <h3 className="font-semibold text-slate-900">
                            <button type="button" data-testid="project-open" onClick={() => openProject(p.id)} className="text-start after:absolute after:inset-0 after:rounded-xl after:content-[''] focus-visible:outline-none group-hover:text-brand-800"><bdi>{projectTitle(p.name, t)}</bdi></button>
                          </h3>
                          <p className="mt-0.5 truncate text-sm text-slate-500"><bdi>{[p.clientName || '—', p.reference].filter(Boolean).join(' · ')}</bdi></p>
                          {old != null && <p className="mt-1"><span className="badge-neutral bg-white whitespace-normal text-slate-500" title={C.supersededHelp} data-testid="project-superseded">{old ? C.superseded(old) : C.supersededNewer}</span></p>}
                        </div>
                        <div className="relative z-10 -me-2 -mt-1">
                          <Menu label={t.projects.moreActions} testId="project-menu" items={[
                            { label: t.projects.open, icon: <FolderOpen size={18} />, onClick: () => openProject(p.id) },
                            { label: t.projects.duplicate, icon: <Copy size={18} />, onClick: () => dup(p), testId: 'project-duplicate' },
                            { label: C.newRevision, icon: <GitBranchPlus size={18} />, onClick: () => revise(p), testId: 'project-revision' },
                            { label: t.projects.exportJson, icon: <Download size={18} />, onClick: () => exportJson(p) },
                            { label: t.projects.delete, icon: <Trash2 size={18} />, danger: true, onClick: () => setConfirm(p), testId: 'project-delete' },
                          ]} />
                        </div>
                      </div>
                      <dl className={`mt-3 grid grid-cols-3 gap-2 text-sm ${old != null ? 'opacity-60' : ''}`} data-testid="project-figures">
                        {mode === 'items' ? <>
                          <Fig k={C.products} v={String(nProducts)} />
                          <Fig k={t.projects.total} v={total} className="col-span-2" />
                        </> : <>
                          <Fig k={t.projects.size} v={priced && r.arrayKwp > 0 ? `${fmt(r.arrayKwp, 1)} kWp` : '—'} />
                          <Fig k={t.results.battery} v={priced && r.batteryKwh > 0 ? `${fmt(r.batteryKwh, 1)} kWh` : '—'} />
                          <Fig k={t.projects.total} v={total} title={priced ? undefined : C.noDemand} />
                        </>}
                      </dl>
                      <div className="mt-3 flex items-center justify-between gap-2 border-t border-slate-100 pt-3 text-xs text-slate-500">
                        <span className="min-w-0 truncate">{mode !== 'items' && <>{t.info[`${p.design.systemType}Short` as const]} · </>}<bdi>{t.projects.updatedOn(fmtDate(p.updatedAt))}</bdi></span>
                        <span className="flex shrink-0 items-center gap-1.5">
                          <span className="badge-neutral" data-testid="project-mode">{t.modes.short[mode]}</span>
                          <Badge level={statusLevel[p.status]}>{t.info.statuses[p.status]}</Badge>
                        </span>
                      </div>
                    </li>
                  )
                })}
              </ul>
            )}
          </>
        )}
      </section>

      {projects.length > 0 && (
        <button type="button" onClick={() => setStartSheet(true)} aria-haspopup="dialog" aria-label={t.nav.newProject} data-testid="fab-new"
          className="btn-primary fixed end-4 bottom-[calc(1rem+env(safe-area-inset-bottom))] z-20 h-14 rounded-full px-5 shadow-[var(--shadow-float)] sm:hidden">
          <Plus size={20} />{t.nav.newShort}
        </button>
      )}
      <Sheet open={startSheet} onClose={() => setStartSheet(false)} title={C.title} testId="start-sheet">
        <ul className="space-y-1">
          {start.map((a) => (
            <li key={a.key}>
              <button type="button" onClick={() => runStart(a)} data-testid={`sheet-start-${a.key}`}
                className="flex min-h-14 w-full items-center gap-3 rounded-xl px-2 py-2 text-start transition hover:bg-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500">
                <span className="grid size-10 shrink-0 place-items-center rounded-lg bg-brand-50 text-brand-700"><a.icon size={20} /></span>
                <span className="min-w-0 flex-1">
                  <span className="block font-medium text-slate-900">{a.label}</span>
                  <span className="block text-xs leading-5 text-slate-600">{a.help}</span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      </Sheet>
      <ConfirmDialog open={!!confirm} onClose={() => setConfirm(null)} title={t.projects.confirmDelete} body={confirm ? t.projects.confirmDeleteBody(projectTitle(confirm.name, t)) : ''} confirmLabel={t.projects.yes} onConfirm={() => confirm && doDelete(confirm)} />
    </div>
  )
}

function Fig({ k, v, className = '', title }: { k: string; v: string; className?: string; title?: string }) {
  return (
    <div className={`min-w-0 ${className}`} title={title}>
      <dt className="text-xs text-slate-500">{k}</dt>
      <dd className="truncate font-semibold text-slate-900 tabular-nums"><bdi>{v}</bdi></dd>
    </div>
  )
}

function Step({ n, done, label, action }: { n: number; done: boolean; label: string; action?: ReactNode }) {
  return (
    <li className="flex flex-wrap items-center gap-3 rounded-xl border border-slate-200 p-3">
      <span className={`grid size-8 shrink-0 place-items-center rounded-full text-sm font-semibold ${done ? 'bg-brand-100 text-brand-700' : 'bg-slate-100 text-slate-600'}`}>{done ? <Check size={16} /> : n}</span>
      <span className={`min-w-[10rem] flex-1 text-sm font-medium ${done ? 'text-slate-500 line-through' : 'text-slate-800'}`}>{label}</span>
      {!done && action && <span className="w-full sm:w-auto [&>button]:w-full">{action}</span>}
    </li>
  )
}
