import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { Project, CompanySettings, PriceBook, ProjectMode, SystemType, Phase, CustomProducts } from '../engine/types'
import { defaultCompany, newProject, uid, siteFromLocation, modeDefaults, defaultDesign, defaultPricing } from '../engine/defaults'
import { emptyPriceBook, normalizePriceBook } from '../engine/catalogContext'
import { defaultSizing, projectMode } from '../engine/sizing'
import { en } from '../i18n/en'
import { ar } from '../i18n/ar'

/** projects = home (start tiles + project list); calc = load calculator; tools = engineering calculators (`toolId`); prices = company price list. */
export type View = 'projects' | 'wizard' | 'settings' | 'tools' | 'calc' | 'prices'
export type Lang = 'en' | 'ar'

/** Quote defaults kept with the company profile and applied by createProject (they are not part of the engine's CompanySettings). */
export interface QuoteDefaults {
  marginPct: number; vatPct: number; defaultLocationId: string
  /** Services (USD): installation labour per kWp, transport per job, commissioning per job. */
  labourPerKwUsd: number; transportUsd: number; commissioningUsd: number
  defaultSystemType: SystemType; defaultPhase: Phase
}
export type Company = CompanySettings & QuoteDefaults & { priceBook: PriceBook }
export const defaultQuoteDefaults: QuoteDefaults = { marginPct: 20, vatPct: 0, defaultLocationId: 'khartoum', labourPerKwUsd: 120, transportUsd: 100, commissioningUsd: 150, defaultSystemType: 'hybrid', defaultPhase: 1 }
const initialCompany: Company = { ...defaultCompany, ...defaultQuoteDefaults, priceBook: emptyPriceBook() }
export type ProductKind = keyof CustomProducts
/** Company file (settings + price list + own products) shared between staff devices. */
export interface CompanyBundle { kind: 'dtplus-company'; version: 1; exportedAt: string; company: Omit<Company, 'logoDataUrl'> & { logoDataUrl: string | null } }
/** Full backup: company file + every project. */
export interface Backup { kind: 'dtplus-backup'; version: 1; exportedAt: string; company: Company; projects: Project[] }

const initialLang = (): Lang => {
  const w = typeof window !== 'undefined' ? (window as unknown as { __DT_LANG__?: string }).__DT_LANG__ : undefined
  return w === 'ar' ? 'ar' : 'en'
}

interface AppState {
  lang: Lang; view: View; step: number; projects: Project[]; currentId: string | null; company: Company
  /** Client-safe presentation: hide cost prices and markup everywhere. */
  clientView: boolean
  lastStep: Record<string, number>
  /** Engineering calculator shown in the tools view (null = the tools list). */
  toolId: string | null
  /** Saved inputs of each engineering calculator, by tool id (the calculators own their shapes). */
  tools: Record<string, unknown>
  /** Scratch project of the load calculator (not in the project list until saved). */
  calc: Project | null
  setLang: (l: Lang) => void; setView: (v: View) => void; setStep: (s: number) => void; setClientView: (v: boolean) => void
  navigate: (to: { view: View; currentId?: string | null; step?: number; toolId?: string | null }) => void
  openTool: (id: string | null) => void
  setTool: (id: string, state: unknown) => void
  /** Create a project in a mode ('design' full design, 'size' known system size, 'items' product list) and open it. */
  createProject: (p?: Partial<Project>, mode?: ProjectMode) => Project; openProject: (id: string, step?: number) => void
  updateProject: (id: string, patch: Partial<Project> | ((p: Project) => Partial<Project>)) => void
  deleteProject: (id: string) => { project: Project; index: number } | null; restoreProject: (p: Project, index: number) => void
  duplicateProject: (id: string) => Project | null
  /** Copy as the next revision: same client and name, reference <base>-R<n>, status draft, current company exchange rate. */
  newRevision: (id: string) => Project | null
  importProject: (p: unknown) => Project | null; importMany: (ps: Project[]) => void
  setCompany: (c: Partial<Company>) => void
  // load calculator
  startCalc: (fresh?: boolean) => Project
  updateCalc: (patch: Partial<Project> | ((p: Project) => Partial<Project>)) => void
  /** Move the calculator's loads into a new full-design project and open it (the calculator starts empty again). */
  saveCalc: () => Project | null
  // company price list
  setPriceBook: (fn: (b: PriceBook) => PriceBook) => void
  setPrice: (id: string, usd: number | null) => void
  setHidden: (id: string, hidden: boolean) => void
  upsertProduct: <K extends ProductKind>(kind: K, item: CustomProducts[K][number]) => void
  removeProduct: (kind: ProductKind, id: string) => void
  exportCompany: () => CompanyBundle
  importCompany: (x: unknown) => boolean
  exportBackup: () => Backup
  /** Restores a backup or a company file; projects are added (ids that already exist get new ids). Returns what was restored. */
  importBackup: (x: unknown) => { company: boolean; projects: number } | null
}

const isObj = (x: unknown): x is Record<string, unknown> => !!x && typeof x === 'object' && !Array.isArray(x)
export const STATUSES: Project['status'][] = ['draft', 'quoted', 'approved', 'installed', 'lost']
/** Validate an imported JSON file and fill fields added in newer versions. Returns null when it is not a project. */
export function normalizeProject(x: unknown): Project | null {
  if (!isObj(x) || !isObj(x.design) || !isObj(x.site)) return null
  const mode = projectMode(x as Pick<Project, 'mode'>)
  if (mode === 'design' && !Array.isArray(x.loads)) return null
  const base = newProject()
  const p = x as unknown as Project
  const pricing = { ...base.pricing, ...(isObj(p.pricing) ? p.pricing : {}) }
  const sz = isObj(p.sizing) ? (p.sizing as unknown as Record<string, unknown>) : {}
  const def = defaultSizing()
  return {
    ...base, ...p,
    id: typeof p.id === 'string' && p.id ? p.id : base.id,
    name: typeof p.name === 'string' ? p.name : base.name,
    loads: Array.isArray(p.loads) ? p.loads : [],
    site: { ...base.site, ...p.site }, design: { ...base.design, ...p.design },
    pricing: { ...pricing, customItems: Array.isArray(pricing.customItems) ? pricing.customItems : [], excludedIds: Array.isArray(pricing.excludedIds) ? pricing.excludedIds : [],
      priceOverrides: isObj(pricing.priceOverrides) ? pricing.priceOverrides : {}, qtyOverrides: isObj(pricing.qtyOverrides) ? pricing.qtyOverrides : {} },
    mode,
    sizing: { ...def, ...sz, bill: { ...def.bill, ...(isObj(sz.bill) ? sz.bill : {}) }, targets: { ...def.targets, ...(isObj(sz.targets) ? sz.targets : {}) }, existing: { ...def.existing, ...(isObj(sz.existing) ? sz.existing : {}) } } as Project['sizing'],
    status: STATUSES.includes(p.status) ? p.status : 'draft',
  }
}

const isLogo = (v: unknown) => typeof v === 'string' && /^data:image\/(png|jpe?g|gif|webp|svg\+xml);base64,/.test(v)
/** Validate an imported company profile (unknown keys dropped, wrong types → current value). */
export function normalizeCompany(x: unknown, current: Company): Company | null {
  if (!isObj(x)) return null
  const out: Company = { ...current }
  const o = out as unknown as Record<string, unknown>
  for (const [k, v] of Object.entries(initialCompany)) {
    if (k === 'priceBook' || k === 'logoDataUrl' || !(k in x)) continue
    if (typeof v === typeof x[k] && (typeof v !== 'number' || Number.isFinite(x[k]))) o[k] = x[k]
  }
  if ('logoDataUrl' in x) out.logoDataUrl = isLogo(x.logoDataUrl) ? (x.logoDataUrl as string) : null
  if ('priceBook' in x) out.priceBook = normalizePriceBook(x.priceBook)
  if (!['offgrid', 'hybrid', 'gridtie'].includes(out.defaultSystemType)) out.defaultSystemType = current.defaultSystemType
  if (out.defaultPhase !== 1 && out.defaultPhase !== 3) out.defaultPhase = current.defaultPhase
  return out
}

/** A new project with the company defaults (location, currency, markup, VAT, services, system type, phase) in the given mode. */
function freshProject(c: Company, lang: Lang, partial: Partial<Project> = {}, mode: ProjectMode = 'design'): Project {
  const d = lang === 'ar' ? ar : en
  const sysType = partial.design?.systemType ?? c.defaultSystemType ?? 'hybrid'
  const p = newProject({ ...modeDefaults(mode, sysType), ...partial }, c)
  if (!partial.name) p.name = mode === 'design' ? d.info.defaultName : d.info.defaultQuoteName
  if (!partial.design) p.design = { ...defaultDesign(sysType), phase: c.defaultPhase === 3 ? 3 : 1 }
  if (!partial.site) {
    const cur = c.currency || 'USD'
    p.site = { ...siteFromLocation(c.defaultLocationId || 'khartoum'), currency: cur, fxRateToUsd: cur === 'USD' ? 1 : c.fxRateToUsd > 0 ? c.fxRateToUsd : 1 }
  }
  if (!partial.pricing) p.pricing = { ...defaultPricing(c.marginPct ?? 20, c.vatPct ?? 0), labourPerKwUsd: c.labourPerKwUsd ?? 120, transportUsd: c.transportUsd ?? 100, commissioningUsd: c.commissioningUsd ?? 150 }
  // A counter sale has no installation: no labour / transport / commissioning lines unless the user adds them
  if (mode === 'items' && !partial.pricing) p.pricing = { ...p.pricing, labourPerKwUsd: 0, transportUsd: 0, commissioningUsd: 0 }
  return p
}
const revBase = (ref: string) => ref.replace(/-R\d+$/, '')

export const useAppStore = create<AppState>()(
  persist(
    (set, get) => ({
      lang: initialLang(), view: 'projects', step: 0, projects: [], currentId: null, company: initialCompany, clientView: true, lastStep: {}, toolId: null, tools: {}, calc: null,
      setLang: (lang) => set((s) => {
        // Untouched default texts follow the UI language (so the Arabic quote doesn't print English boilerplate)
        const from = lang === 'ar' ? en : ar, to = lang === 'ar' ? ar : en
        const swap = (v: string, a: string[], b: string) => (a.includes(v) ? b : v)
        const c = s.company
        return {
          lang,
          company: { ...c, name: swap(c.name, [from.settings.defaultName, defaultCompany.name], to.settings.defaultName), tagline: swap(c.tagline, [from.settings.defaultTagline, defaultCompany.tagline], to.settings.defaultTagline), terms: swap(c.terms, [from.settings.defaultTerms, defaultCompany.terms], to.settings.defaultTerms) },
          projects: s.projects.some((p) => p.name === from.info.defaultName || p.name === from.info.defaultQuoteName)
            ? s.projects.map((p) => (p.name === from.info.defaultName ? { ...p, name: to.info.defaultName } : p.name === from.info.defaultQuoteName ? { ...p, name: to.info.defaultQuoteName } : p)) : s.projects,
        }
      }),
      setView: (view) => set(view === 'tools' ? { view, toolId: null } : { view }),
      openTool: (toolId) => set({ view: 'tools', toolId }),
      setTool: (id, state) => set((s) => ({ tools: { ...s.tools, [id]: state } })),
      setStep: (step) => set((s) => ({ step, lastStep: s.currentId ? { ...s.lastStep, [s.currentId]: step } : s.lastStep })),
      setClientView: (clientView) => set({ clientView }),
      navigate: ({ view, currentId, step, toolId }) => set((s) => {
        if (view === 'wizard' && currentId && s.projects.some((p) => p.id === currentId)) return { view, currentId, step: step ?? s.lastStep[currentId] ?? 0 }
        if (view === 'tools') return { view, toolId: toolId ?? null }
        return { view: view === 'wizard' ? 'projects' : view }
      }),
      createProject: (partial = {}, mode = 'design') => {
        const p = freshProject(get().company, get().lang, partial, mode)
        set((s) => ({ projects: [p, ...s.projects], currentId: p.id, view: 'wizard', step: 0, lastStep: { ...s.lastStep, [p.id]: 0 } }))
        return p
      },
      openProject: (id, step) => set((s) => ({ currentId: id, view: 'wizard', step: step ?? s.lastStep[id] ?? 0 })),
      updateProject: (id, patch) => set((s) => ({
        projects: s.projects.map((p) => (p.id === id ? { ...p, ...(typeof patch === 'function' ? patch(p) : patch), updatedAt: new Date().toISOString() } : p)),
      })),
      deleteProject: (id) => {
        const s = get(); const index = s.projects.findIndex((p) => p.id === id)
        if (index < 0) return null
        const project = s.projects[index]
        set({ projects: s.projects.filter((p) => p.id !== id), currentId: s.currentId === id ? null : s.currentId, view: s.currentId === id && s.view === 'wizard' ? 'projects' : s.view })
        return { project, index }
      },
      restoreProject: (p, index) => set((s) => {
        if (s.projects.some((x) => x.id === p.id)) return {}
        const projects = [...s.projects]; projects.splice(Math.min(index, projects.length), 0, p)
        return { projects }
      }),
      duplicateProject: (id) => {
        const s = get(); const src = s.projects.find((p) => p.id === id); if (!src) return null
        const d = s.lang === 'ar' ? ar : en
        const now = new Date().toISOString()
        const copy: Project = { ...structuredClone(src), id: uid(), name: `${src.name} ${d.projects.copySuffix}`, createdAt: now, updatedAt: now, status: 'draft', revisionOf: undefined }
        set({ projects: [copy, ...s.projects] })
        return copy
      },
      newRevision: (id) => {
        const s = get(); const src = s.projects.find((p) => p.id === id); if (!src) return null
        const base = revBase(src.reference || '')
        const n = Math.max(1, ...s.projects.filter((p) => revBase(p.reference || '') === base && base).map((p) => Number(/-R(\d+)$/.exec(p.reference)?.[1] ?? 1))) + 1
        const now = new Date().toISOString()
        const c = s.company
        const site = { ...src.site }
        if (site.currency === c.currency && site.currency !== 'USD' && c.fxRateToUsd > 0) site.fxRateToUsd = c.fxRateToUsd
        const copy: Project = { ...structuredClone(src), site, id: uid(), reference: base ? `${base}-R${n}` : src.reference, createdAt: now, updatedAt: now, status: 'draft', revisionOf: src.id }
        set({ projects: [copy, ...s.projects] })
        return copy
      },
      importProject: (x) => {
        const p = normalizeProject(x); if (!p) return null
        const s = get(); const fixed = { ...p, id: s.projects.some((q) => q.id === p.id) ? uid() : p.id }
        set({ projects: [fixed, ...s.projects] })
        return fixed
      },
      importMany: (ps) => set((s) => ({ projects: [...ps.map((p) => ({ ...p, id: s.projects.some((q) => q.id === p.id) ? uid() : p.id })), ...s.projects] })),
      setCompany: (c) => set((s) => ({ company: { ...s.company, ...c } })),

      startCalc: (fresh = false) => {
        const cur = get().calc
        if (cur && !fresh) { set({ view: 'calc' }); return cur }
        const p = freshProject(get().company, get().lang)
        set({ calc: p, view: 'calc' })
        return p
      },
      updateCalc: (patch) => set((s) => (s.calc ? { calc: { ...s.calc, ...(typeof patch === 'function' ? patch(s.calc) : patch), updatedAt: new Date().toISOString() } } : {})),
      saveCalc: () => {
        const s = get(); const c = s.calc; if (!c) return null
        const now = new Date().toISOString()
        const p: Project = { ...structuredClone(c), id: uid(), mode: 'design', createdAt: now, updatedAt: now, status: 'draft' }
        set((st) => ({ projects: [p, ...st.projects], calc: null, currentId: p.id, view: 'wizard', step: 0, lastStep: { ...st.lastStep, [p.id]: 0 } }))
        return p
      },

      setPriceBook: (fn) => set((s) => ({ company: { ...s.company, priceBook: { ...fn(s.company.priceBook ?? emptyPriceBook()), updatedAt: new Date().toISOString() } } })),
      setPrice: (id, usd) => get().setPriceBook((b) => {
        const prices = { ...b.prices }
        if (usd == null || !Number.isFinite(usd) || usd < 0) delete prices[id]; else prices[id] = usd
        return { ...b, prices }
      }),
      setHidden: (id, hidden) => get().setPriceBook((b) => ({ ...b, hidden: hidden ? Array.from(new Set([...b.hidden, id])) : b.hidden.filter((x) => x !== id) })),
      upsertProduct: (kind, item) => get().setPriceBook((b) => {
        const list = b.custom[kind] as { id: string }[]
        const next = list.some((x) => x.id === item.id) ? list.map((x) => (x.id === item.id ? item : x)) : [...list, item]
        return { ...b, custom: { ...b.custom, [kind]: next } }
      }),
      removeProduct: (kind, id) => get().setPriceBook((b) => {
        const prices = { ...b.prices }; delete prices[id]
        return { ...b, prices, hidden: b.hidden.filter((x) => x !== id), custom: { ...b.custom, [kind]: (b.custom[kind] as { id: string }[]).filter((x) => x.id !== id) } }
      }),
      exportCompany: () => ({ kind: 'dtplus-company', version: 1, exportedAt: new Date().toISOString(), company: get().company }),
      importCompany: (x) => {
        const src = isObj(x) && x.kind === 'dtplus-company' && isObj(x.company) ? x.company : null
        const c = src ? normalizeCompany(src, get().company) : null
        if (!c) return false
        set({ company: c })
        return true
      },
      exportBackup: () => ({ kind: 'dtplus-backup', version: 1, exportedAt: new Date().toISOString(), company: get().company, projects: get().projects }),
      importBackup: (x) => {
        if (!isObj(x)) return null
        if (x.kind === 'dtplus-company') return get().importCompany(x) ? { company: true, projects: 0 } : null
        if (x.kind !== 'dtplus-backup') return null
        const c = isObj(x.company) ? normalizeCompany(x.company, get().company) : null
        const ps = (Array.isArray(x.projects) ? x.projects : []).map(normalizeProject).filter((p): p is Project => !!p)
        if (!c && !ps.length) return null
        if (c) set({ company: c })
        if (ps.length) get().importMany(ps)
        return { company: !!c, projects: ps.length }
      },
    }),
    {
      name: 'dtplus-solar-planner-v1', version: 3,
      migrate: (persisted, version) => {
        let st = (persisted ?? {}) as Partial<AppState>
        if (version < 2) st = { ...st, clientView: true, lastStep: {}, company: { ...initialCompany, ...(st.company ?? {}) } }
        if (version < 3) {
          st = {
            ...st, tools: {}, toolId: null, calc: null,
            company: { ...initialCompany, ...(st.company ?? {}), priceBook: normalizePriceBook(st.company?.priceBook) },
            projects: (st.projects ?? []).map((p) => normalizeProject(p)).filter((p): p is Project => !!p),
          }
        }
        return st as AppState
      },
      merge: (persisted, current) => {
        const p = (persisted ?? {}) as Partial<AppState>
        const company = { ...current.company, ...(p.company ?? {}) }
        company.priceBook = normalizePriceBook(company.priceBook)
        return { ...current, ...p, company, lastStep: { ...(p.lastStep ?? {}) }, tools: { ...(p.tools ?? {}) }, calc: p.calc ? normalizeProject(p.calc) : null }
      },
    },
  ),
)
export const useCurrentProject = () => useAppStore((s) => s.projects.find((p) => p.id === s.currentId) ?? null)
