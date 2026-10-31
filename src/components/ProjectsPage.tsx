import { useMemo, useRef, useState } from 'react'
import { Plus, Copy, Trash2, Upload, Search, FolderOpen } from 'lucide-react'
import { useAppStore } from '../store/useAppStore'
import { useT } from '../i18n'
import { computeProject } from '../engine/compute'
import { money, fmt } from '../engine/format'
import { Empty } from './ui'
import type { Project } from '../engine/types'
import { sampleProjects } from '../data/samples'

export function ProjectsPage() {
  const { t } = useT()
  const { projects, createProject, openProject, deleteProject, duplicateProject, importProject } = useAppStore()
  const [q, setQ] = useState('')
  const [confirm, setConfirm] = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const list = useMemo(() => projects.filter((p) => (p.name + p.clientName + p.reference).toLowerCase().includes(q.toLowerCase())), [projects, q])

  const onImport = async (f: File) => {
    try { const p = JSON.parse(await f.text()) as Project; if (p && p.loads && p.design) importProject(p) } catch { /* ignore */ }
  }
  const statusCls: Record<Project['status'], string> = { draft: 'bg-slate-100 text-slate-700', quoted: 'bg-blue-50 text-blue-700', approved: 'bg-emerald-50 text-emerald-700', installed: 'bg-brand-100 text-brand-800' }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold text-slate-900">{t.projects.title}</h1>
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative"><Search size={14} className="pointer-events-none absolute inset-y-0 start-3 my-auto text-slate-400" /><input className="input ps-8 w-56" placeholder={t.projects.search} value={q} onChange={(e) => setQ(e.target.value)} /></div>
          <input ref={fileRef} type="file" accept="application/json" hidden onChange={(e) => e.target.files?.[0] && onImport(e.target.files[0])} />
          <button className="btn-secondary" onClick={() => fileRef.current?.click()}><Upload size={16} />{t.projects.import}</button>
          <button className="btn-primary" onClick={() => createProject()}><Plus size={16} />{t.nav.newProject}</button>
        </div>
      </div>

      {list.length === 0 ? (
        <Empty>
          <FolderOpen className="mx-auto mb-2 text-slate-300" size={36} />
          <p>{t.projects.empty}</p>
          <div className="mt-4 flex justify-center gap-2">
            <button className="btn-primary" onClick={() => createProject()}><Plus size={16} />{t.nav.newProject}</button>
            {projects.length === 0 && <button className="btn-secondary" onClick={() => sampleProjects().forEach(importProject)}>{t.projects.sample}</button>}
          </div>
        </Empty>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {list.map((p) => {
            const r = computeProject(p)
            return (
              <div key={p.id} className="card flex flex-col p-4">
                <div className="flex items-start justify-between gap-2">
                  <button className="text-start" onClick={() => openProject(p.id)}>
                    <h3 className="font-semibold text-slate-900 hover:text-brand-700">{p.name}</h3>
                    <p className="text-sm text-slate-500">{p.clientName || '—'} · {p.reference}</p>
                  </button>
                  <span className={`badge ${statusCls[p.status]}`}>{t.info.statuses[p.status]}</span>
                </div>
                <dl className="mt-3 grid grid-cols-3 gap-2 text-sm">
                  <div><dt className="text-xs text-slate-500">{t.projects.size}</dt><dd className="font-semibold tabular-nums">{fmt(r.arrayKwp, 1)} {t.common.kwp}</dd></div>
                  <div><dt className="text-xs text-slate-500">{t.results.battery}</dt><dd className="font-semibold tabular-nums">{r.batteryKwh ? fmt(r.batteryKwh, 1) + ' ' + t.common.kwh : '—'}</dd></div>
                  <div><dt className="text-xs text-slate-500">{t.projects.total}</dt><dd className="font-semibold tabular-nums">{money(r.totalUsd, p.site.currency, p.site.fxRateToUsd)}</dd></div>
                </dl>
                <p className="mt-2 text-xs text-slate-400">{t.info[p.design.systemType]} · {t.projects.updated} {new Date(p.updatedAt).toLocaleDateString()}</p>
                <div className="mt-3 flex items-center gap-1 border-t border-slate-100 pt-3">
                  <button className="btn-secondary flex-1 justify-center" onClick={() => openProject(p.id)}>{t.projects.open}</button>
                  <button className="btn-ghost" title={t.projects.duplicate} onClick={() => duplicateProject(p.id)}><Copy size={16} /></button>
                  {confirm === p.id ? (
                    <><button className="btn-danger" onClick={() => { deleteProject(p.id); setConfirm(null) }}>{t.projects.yes}</button><button className="btn-ghost" onClick={() => setConfirm(null)}>{t.projects.no}</button></>
                  ) : <button className="btn-ghost text-red-600" title={t.projects.delete} onClick={() => setConfirm(p.id)}><Trash2 size={16} /></button>}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
