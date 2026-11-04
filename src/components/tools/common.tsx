// Shared building blocks of the engineering tools: persisted inputs, page frame, product / city pickers, check rows, copy action.
import { useMemo, useState, type ComponentType, type ReactNode } from 'react'
import { Check, ChevronDown, ChevronLeft, ChevronRight, CircleAlert, CircleCheck, Copy, Rocket, Search, TriangleAlert } from 'lucide-react'
import { useAppStore } from '../../store/useAppStore'
import { useT } from '../../i18n'
import { Parts } from '../ui'
import { Sheet } from '../overlay'
import { toast } from '../../store/useToast'
import { locations, regions } from '../../data/locations'
import { cityName, countryName } from '../../i18n/places'
import type { Level } from '../../engine/tools'
import type { Location } from '../../engine/types'
import type { ToolId } from './useTool'

/* ------------------------------------------------------------------ page frame */

export function ToolFrame({ id, icon: Icon, children }: { id: ToolId; icon: ComponentType<{ size?: number; className?: string }>; children: ReactNode }) {
  const { t, dir } = useT()
  const openTool = useAppStore((s) => s.openTool)
  const Back = dir === 'rtl' ? ChevronRight : ChevronLeft
  return (
    <div className="space-y-4 sm:space-y-5" data-testid={`tool-${id}`}>
      <div>
        <button type="button" className="btn-ghost -ms-3 px-3 text-brand-700" onClick={() => openTool(null)} data-testid="tool-back"><Back size={18} />{t.tools.allTools}</button>
        <div className="mt-1 flex items-start gap-3">
          <span className="grid size-11 shrink-0 place-items-center rounded-lg bg-brand-50 text-brand-700"><Icon size={22} /></span>
          <div className="min-w-0">
            <h1 className="text-display text-slate-900">{t.tools.names[id]}</h1>
            <p className="mt-0.5 max-w-2xl text-sm text-slate-600">{t.tools.helps[id]}</p>
          </div>
        </div>
      </div>
      {children}
    </div>
  )
}

/** Two columns on desktop (inputs | results, results sticky), stacked on phones. */
export function ToolLayout({ inputs, results }: { inputs: ReactNode; results: ReactNode }) {
  return (
    <div className="grid grid-cols-1 items-start gap-4 sm:gap-5 lg:grid-cols-5">
      <div className="min-w-0 space-y-4 sm:space-y-5 lg:col-span-3">{inputs}</div>
      <div className="min-w-0 space-y-4 sm:space-y-5 lg:sticky lg:top-20 lg:col-span-2" data-testid="tool-results">{results}</div>
    </div>
  )
}

/* ------------------------------------------------------------------ results */

const LEVEL_ICON = { pass: CircleCheck, warn: TriangleAlert, fail: CircleAlert }
const LEVEL_TONE = { pass: 'text-emerald-600', warn: 'text-amber-600', fail: 'text-red-600' }
const LEVEL_BADGE = { pass: 'badge-ok', warn: 'badge-warn', fail: 'badge-err' }

export interface RowView { id: string; level: Level; label: string; detail: string }
export function CheckRows({ rows }: { rows: RowView[] }) {
  const { t } = useT()
  return (
    <ul className="-my-2 divide-y divide-slate-100" data-testid="tool-rows">
      {rows.map((r) => {
        const Icon = LEVEL_ICON[r.level]
        return (
          <li key={r.id} className="flex items-start gap-3 py-2.5" data-testid={`row-${r.id}`} data-level={r.level}>
            <Icon size={20} className={`mt-0.5 shrink-0 ${LEVEL_TONE[r.level]}`} aria-hidden="true" />
            <div className="min-w-0 flex-1">
              <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm font-medium text-slate-900">
                <span>{r.label}</span><span className={LEVEL_BADGE[r.level]}>{t.tools.level[r.level]}</span>
              </p>
              <p className="mt-0.5 text-sm leading-6 text-slate-600">{r.detail}</p>
            </div>
          </li>
        )
      })}
    </ul>
  )
}

/** Hint shown instead of results while inputs are missing or out of range. */
export function InvalidHint({ fields }: { fields: string[] }) {
  const { t, lang } = useT()
  return (
    <div className="flex items-start gap-3 rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900" role="status" data-testid="tool-invalid">
      <TriangleAlert size={20} className="mt-0.5 shrink-0 text-amber-600" aria-hidden="true" />
      <p>{t.tools.checkValues(fields.join(lang === 'ar' ? '، ' : ', '))}</p>
    </div>
  )
}

/** "Copy result" + optional "Start a project with this" (disabled with a reason when datasheet values were used). */
export function ResultActions({ text, onStart, startBlocked }: { text: string | null; onStart?: () => void; startBlocked?: boolean }) {
  const { t } = useT()
  const copy = async () => {
    if (!text) return
    try { await navigator.clipboard.writeText(text); toast({ message: t.tools.copied, tone: 'ok' }) } catch { toast({ message: t.tools.copyFailed, tone: 'err' }) }
  }
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2">
        <button type="button" className="btn-secondary flex-1 sm:flex-none" onClick={copy} disabled={!text} data-testid="tool-copy"><Copy size={18} />{t.tools.copy}</button>
        {onStart && <button type="button" className="btn-primary flex-1 sm:flex-none" onClick={onStart} disabled={startBlocked} data-testid="tool-start"><Rocket size={18} />{t.tools.startProject}</button>}
      </div>
      {onStart && startBlocked && <p className="text-xs leading-5 text-slate-500">{t.tools.startNeedsCatalog}</p>}
    </div>
  )
}

/* ------------------------------------------------------------------ pickers */

export interface PickOpt { id: string; title: string; sub: (string | null | undefined | false)[]; hidden?: boolean; search: string }

/** Product field: a button showing the choice; opens a searchable sheet listing every product ("not stocked" tag on hidden ones). */
export function ProductPicker({ label, value, options, onPick, none, testId, hideLabel = false }: { label: string; value: string; options: PickOpt[]; onPick: (id: string) => void; none?: string; testId: string; hideLabel?: boolean }) {
  const { t } = useT()
  const [open, setOpen] = useState(false)
  const [q, setQ] = useState('')
  const cur = options.find((o) => o.id === value)
  const list = useMemo(() => { const s = q.trim().toLowerCase(); return s ? options.filter((o) => o.search.toLowerCase().includes(s)) : options }, [q, options])
  const pick = (id: string) => { onPick(id); setOpen(false); setQ('') }
  const tag = (o?: PickOpt) => o?.hidden ? <span className="badge-neutral">{t.tools.notStocked}</span> : null
  const row = (id: string, title: string, sub?: PickOpt['sub'], o?: PickOpt) => (
    <li key={id || '_none'}>
      <button type="button" onClick={() => pick(id)} aria-pressed={value === id} data-testid={`${testId}-opt-${id || 'none'}`}
        className={`flex min-h-12 w-full items-center gap-3 rounded-lg px-3 py-2 text-start transition ${value === id ? 'bg-brand-50 ring-1 ring-brand-600' : 'hover:bg-slate-50'}`}>
        <span className="min-w-0 flex-1">
          <span className="flex flex-wrap items-center gap-x-2 gap-y-0.5"><span className="font-medium text-slate-900"><bdi>{title}</bdi></span>{tag(o)}</span>
          {sub && <Parts parts={sub} className="mt-0.5 block text-xs text-slate-600" />}
        </span>
        {value === id && <Check size={18} className="shrink-0 text-brand-700" />}
      </button>
    </li>
  )
  return (
    <div className="min-w-0">
      <span className={hideLabel ? 'sr-only' : 'label'}>{label}</span>
      <button type="button" onClick={() => setOpen(true)} aria-haspopup="dialog" aria-label={`${label}: ${cur?.title ?? none ?? ''}`} data-testid={testId}
        className="flex min-h-11 w-full items-center gap-2 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-start hover:border-slate-400 focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-brand-500/20">
        <span className="min-w-0 flex-1">
          <span className="flex flex-wrap items-center gap-x-2"><span className="text-sm font-medium text-slate-900"><bdi>{cur?.title ?? none ?? '—'}</bdi></span>{tag(cur)}</span>
          {cur && <Parts parts={cur.sub} className="block text-xs text-slate-600" />}
        </span>
        <span className="sr-only">{t.tools.change}</span>
        <ChevronDown size={18} className="shrink-0 text-slate-500" />
      </button>
      <Sheet open={open} onClose={() => { setOpen(false); setQ('') }} title={t.tools.pickTitle(label)} variant="drawer" wide testId={`${testId}-sheet`}>
        <div className="sticky top-0 z-10 -mx-4 bg-white px-4 pb-2 sm:-mx-5 sm:px-5">
          <div className="relative"><Search size={18} className="pointer-events-none absolute inset-y-0 start-3 my-auto text-slate-400" />
            <input className="input ps-10" type="search" dir="auto" placeholder={t.tools.search} aria-label={t.tools.search} value={q} onChange={(e) => setQ(e.target.value)} /></div>
        </div>
        <ul className="space-y-1">
          {none != null && !q && row('', none)}
          {list.map((o) => row(o.id, o.title, o.sub, o))}
          {!list.length && <li className="py-6 text-center text-sm text-slate-500">{t.tools.noMatch}</li>}
        </ul>
      </Sheet>
    </div>
  )
}

const REGION_ORDER = ['Africa', 'Middle East', 'Asia', 'Europe', 'Americas', 'Oceania']
/** City select over the climate database (Sudan first in Africa); picking a city calls `onPick` with the location. */
export function CityPicker({ value, onPick, testId = 'tool-city' }: { value: string; onPick: (l: Location) => void; testId?: string }) {
  const { t, lang } = useT()
  const grouped = useMemo(() => [...regions].sort((a, b) => REGION_ORDER.indexOf(a) - REGION_ORDER.indexOf(b)).map((rg) => ({
    rg, items: locations.filter((l) => l.region === rg).sort((a, b) => (a.country === 'Sudan' ? -1 : b.country === 'Sudan' ? 1 : countryName(a.country, lang).localeCompare(countryName(b.country, lang), lang) || cityName(a, lang).localeCompare(cityName(b, lang), lang))),
  })), [lang])
  return (
    <label className="block min-w-0">
      <span className="label">{t.tools.city}</span>
      <select className="input" value={value} data-testid={testId} onChange={(e) => { const l = locations.find((x) => x.id === e.target.value); if (l) onPick(l) }}>
        {!locations.some((l) => l.id === value) && <option value={value}>—</option>}
        {grouped.map((g) => (
          <optgroup key={g.rg} label={t.site.regions[g.rg] ?? g.rg}>
            {g.items.map((l) => <option key={l.id} value={l.id}>{`${cityName(l, lang)}${lang === 'ar' ? '، ' : ', '}${countryName(l.country, lang)}`}</option>)}
          </optgroup>
        ))}
      </select>
      <span className="help">{t.tools.cityHelp}</span>
    </label>
  )
}
