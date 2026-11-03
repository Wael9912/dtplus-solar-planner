import { useMemo, useRef, useState, type ReactNode } from 'react'
import { Plus, Copy, Trash2, Upload, Search, FolderOpen, Download, Building2, Sparkles, Check, X } from 'lucide-react'
import { useAppStore } from '../store/useAppStore'
import { useT } from '../i18n'
import { computeProject } from '../engine/compute'
import { buildQuote, formatQuoteMoney } from '../engine/quote'
import { fmt } from '../engine/format'
import { companyTitle, fmtDate, matchAppliance, projectTitle } from '../i18n/labels'
import { Badge } from './ui'
import { ConfirmDialog, Menu } from './overlay'
import type { Project } from '../engine/types'
import { sampleProjects } from '../data/samples'
import { download } from '../export/download'
import { toast } from '../store/useToast'

type Status = Project['status']
const STATUSES: Status[] = ['draft', 'quoted', 'approved', 'installed']
const statusLevel: Record<Status, 'neutral' | 'info' | 'ok'> = { draft: 'neutral', quoted: 'info', approved: 'ok', installed: 'ok', lost: 'neutral' }
// Arabic display data for the bundled samples (keyed by quote reference)
const SAMPLE_AR: Record<string, Partial<Project>> = {
  'Q-2026-0112': { name: 'فيلا الرياض — نظام هجين 10 كيلوواط', clientName: 'أحمد الفهد', clientAddress: 'حي الياسمين، الرياض' },
  'Q-2026-0098': { name: 'مزرعة الأبيض — مضخة منفصلة عن الشبكة', clientName: 'مريم عثمان', clientAddress: 'الأبيض، شمال كردفان' },
  'Q-2026-0105': { name: 'صيدلية الخرطوم — نظام هجين احتياطي', clientName: 'صيدلية د. صلاح', clientAddress: 'شارع 15، العمارات، الخرطوم' },
  'Q-2026-0120': { name: 'مستودع دبي — 100 كيلوواط متصل بالشبكة', clientName: 'الخليج للخدمات اللوجستية ذ.م.م', clientAddress: 'المنطقة الحرة بجبل علي' },
}

export function ProjectsPage() {
  const { t, lang } = useT()
  const projects = useAppStore((s) => s.projects)
  const company = useAppStore((s) => s.company)
  const { createProject, openProject, deleteProject, restoreProject, duplicateProject, importProject, importMany, setView } = useAppStore.getState()
  const [q, setQ] = useState('')
  const [status, setStatus] = useState<Status | 'all'>('all')
  const [sort, setSort] = useState<'updated' | 'name' | 'value'>('updated')
  const [confirm, setConfirm] = useState<Project | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  const enriched = useMemo(() => projects.map((p) => { const r = computeProject(p); return { p, r, quote: buildQuote(p, r) } }), [projects])
  const counts = useMemo(() => Object.fromEntries(STATUSES.map((s) => [s, projects.filter((p) => p.status === s).length])) as Record<Status, number>, [projects])
  const list = useMemo(() => {
    const s = q.trim().toLowerCase()
    const xs = enriched.filter(({ p }) => (status === 'all' || p.status === status) && (!s || `${p.name} ${p.clientName} ${p.reference} ${p.clientAddress}`.toLowerCase().includes(s)))
    return [...xs].sort((a, b) => sort === 'name' ? projectTitle(a.p.name, t).localeCompare(projectTitle(b.p.name, t), lang) : sort === 'value' ? b.r.totalUsd - a.r.totalUsd : b.p.updatedAt.localeCompare(a.p.updatedAt))
  }, [enriched, q, status, sort, t, lang])

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
  const exportJson = (p: Project) => download(new Blob([JSON.stringify(p, null, 2)], { type: 'application/json' }), `${(p.name || 'solar-project').replace(/[^\w؀-ۿ-]+/g, '_')}.json`)
  const filtered = q.trim() !== '' || status !== 'all'
  const companyDone = !!companyTitle(company.name)

  return (
    <div className="space-y-4 sm:space-y-5">
      <input ref={fileRef} type="file" accept="application/json,.json" hidden data-testid="import-file" onChange={(e) => { const f = e.target.files?.[0]; if (f) onImport(f); e.target.value = '' }} />
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-display text-slate-900">{t.projects.title}</h1>
          {projects.length > 0 && <p className="mt-0.5 text-sm text-slate-500">{t.projects.count(projects.length)}</p>}
        </div>
        <div className="flex items-center gap-2">
          <button type="button" className="btn-secondary hidden sm:inline-flex" onClick={() => fileRef.current?.click()} data-testid="import-btn"><Upload size={18} />{t.projects.import}</button>
          <Menu label={t.common.more} testId="projects-menu" items={[
            { label: t.projects.import, icon: <Upload size={18} />, onClick: () => fileRef.current?.click(), testId: 'menu-import' },
            { label: t.projects.sample, icon: <Sparkles size={18} />, onClick: loadSamples, testId: 'menu-samples' },
          ]} />
          <button type="button" className="btn-primary hidden sm:inline-flex" onClick={() => createProject()} data-testid="projects-new"><Plus size={18} />{t.nav.newProject}</button>
        </div>
      </div>

      {projects.length === 0 ? (
        <section className="card p-5 sm:p-8" data-testid="get-started">
          <div className="flex items-center gap-3"><span className="grid size-12 place-items-center rounded-full bg-brand-50 text-brand-700"><FolderOpen size={24} /></span>
            <div><h2 className="card-title">{t.projects.getStarted}</h2><p className="text-sm text-slate-600">{t.projects.empty}</p></div></div>
          <ol className="mt-5 space-y-2">
            <Step n={1} done={companyDone} label={t.projects.stepCompany} action={<button type="button" className="btn-secondary" onClick={() => setView('settings')}><Building2 size={18} />{t.nav.settings}</button>} />
            <Step n={2} done={false} label={t.projects.stepFirst} action={<button type="button" className="btn-primary" onClick={() => createProject()} data-testid="first-project"><Plus size={18} />{t.nav.newProject}</button>} />
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
              <button type="button" className="chip" aria-pressed={status === 'all'} onClick={() => setStatus('all')}>{t.projects.all} <span className="opacity-70">{projects.length}</span></button>
              {STATUSES.map((s) => <button key={s} type="button" className="chip" aria-pressed={status === s} onClick={() => setStatus(s)} data-testid={`filter-${s}`}>{t.info.statuses[s]} <span className="opacity-70">{counts[s]}</span></button>)}
            </div>
            <label className="flex items-center gap-2 text-sm text-slate-600 lg:ms-auto">
              <span className="shrink-0">{t.projects.sort}</span>
              <select className="input w-auto min-w-40" value={sort} onChange={(e) => setSort(e.target.value as typeof sort)} data-testid="projects-sort">
                <option value="updated">{t.projects.sortUpdated}</option><option value="name">{t.projects.sortName}</option><option value="value">{t.projects.sortValue}</option>
              </select>
            </label>
          </div>

          {list.length === 0 ? (
            <div className="card flex flex-col items-center px-6 py-10 text-center" data-testid="no-match">
              <p className="text-sm text-slate-700">{q.trim() ? t.projects.noMatch(q.trim()) : t.projects.noMatchStatus}</p>
              {filtered && <button type="button" className="btn-secondary mt-4" onClick={() => { setQ(''); setStatus('all') }}><X size={18} />{t.projects.clearSearch}</button>}
            </div>
          ) : (
            <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 sm:gap-4 xl:grid-cols-3" data-testid="project-list">
              {list.map(({ p, r, quote }) => (
                <li key={p.id} data-testid="project-card" className="card group relative flex flex-col p-4 transition hover:border-slate-300 hover:shadow-md focus-within:ring-2 focus-within:ring-brand-500">
                  <div className="flex items-start gap-2">
                    <div className="min-w-0 flex-1">
                      <h3 className="font-semibold text-slate-900">
                        <button type="button" data-testid="project-open" onClick={() => openProject(p.id)} className="text-start after:absolute after:inset-0 after:rounded-xl after:content-[''] focus-visible:outline-none group-hover:text-brand-800"><bdi>{projectTitle(p.name, t)}</bdi></button>
                      </h3>
                      <p className="mt-0.5 truncate text-sm text-slate-500"><bdi>{[p.clientName || '—', p.reference].filter(Boolean).join(' · ')}</bdi></p>
                    </div>
                    <div className="relative z-10 -me-2 -mt-1">
                      <Menu label={t.projects.moreActions} testId="project-menu" items={[
                        { label: t.projects.open, icon: <FolderOpen size={18} />, onClick: () => openProject(p.id) },
                        { label: t.projects.duplicate, icon: <Copy size={18} />, onClick: () => dup(p), testId: 'project-duplicate' },
                        { label: t.projects.exportJson, icon: <Download size={18} />, onClick: () => exportJson(p) },
                        { label: t.projects.delete, icon: <Trash2 size={18} />, danger: true, onClick: () => setConfirm(p), testId: 'project-delete' },
                      ]} />
                    </div>
                  </div>
                  <dl className="mt-3 grid grid-cols-3 gap-2 text-sm">
                    <div className="min-w-0"><dt className="text-xs text-slate-500">{t.projects.size}</dt><dd className="font-semibold text-slate-900 tabular-nums"><bdi>{fmt(r.arrayKwp, 1)} kWp</bdi></dd></div>
                    <div className="min-w-0"><dt className="text-xs text-slate-500">{t.results.battery}</dt><dd className="font-semibold text-slate-900 tabular-nums"><bdi>{r.batteryKwh ? `${fmt(r.batteryKwh, 1)} kWh` : '—'}</bdi></dd></div>
                    <div className="min-w-0"><dt className="text-xs text-slate-500">{t.projects.total}</dt><dd className="truncate font-semibold text-slate-900 tabular-nums"><bdi>{formatQuoteMoney(quote.total, quote, 0)}</bdi></dd></div>
                  </dl>
                  <div className="mt-3 flex items-center justify-between gap-2 border-t border-slate-100 pt-3 text-xs text-slate-500">
                    <span className="truncate">{t.info[`${p.design.systemType}Short` as const]} · <bdi>{t.projects.updatedOn(fmtDate(p.updatedAt))}</bdi></span>
                    <Badge level={statusLevel[p.status]}>{t.info.statuses[p.status]}</Badge>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </>
      )}

      {projects.length > 0 && <button type="button" onClick={() => createProject()} data-testid="fab-new" className="btn-primary fixed end-4 bottom-[calc(1rem+env(safe-area-inset-bottom))] z-20 h-14 rounded-full px-5 shadow-[var(--shadow-float)] sm:hidden"><Plus size={20} />{t.nav.newProject}</button>}
      <ConfirmDialog open={!!confirm} onClose={() => setConfirm(null)} title={t.projects.confirmDelete} body={confirm ? t.projects.confirmDeleteBody(projectTitle(confirm.name, t)) : ''} confirmLabel={t.projects.yes} onConfirm={() => confirm && doDelete(confirm)} />
    </div>
  )
}

function Step({ n, done, label, action }: { n: number; done: boolean; label: string; action: ReactNode }) {
  return (
    <li className="flex flex-wrap items-center gap-3 rounded-xl border border-slate-200 p-3">
      <span className={`grid size-8 shrink-0 place-items-center rounded-full text-sm font-semibold ${done ? 'bg-brand-100 text-brand-700' : 'bg-slate-100 text-slate-600'}`}>{done ? <Check size={16} /> : n}</span>
      <span className={`min-w-[10rem] flex-1 text-sm font-medium ${done ? 'text-slate-500 line-through' : 'text-slate-800'}`}>{label}</span>
      {!done && <span className="w-full sm:w-auto [&>button]:w-full">{action}</span>}
    </li>
  )
}
