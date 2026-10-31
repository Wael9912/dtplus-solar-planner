import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { Project, CompanySettings } from '../engine/types'
import { defaultCompany, newProject, uid, siteFromLocation } from '../engine/defaults'
import { en } from '../i18n/en'
import { ar } from '../i18n/ar'

export type View = 'projects' | 'wizard' | 'settings'
export type Lang = 'en' | 'ar'

/** Quote defaults kept with the company profile and applied by createProject (they are not part of the engine's CompanySettings). */
export interface QuoteDefaults { marginPct: number; vatPct: number; defaultLocationId: string }
export type Company = CompanySettings & QuoteDefaults
export const defaultQuoteDefaults: QuoteDefaults = { marginPct: 20, vatPct: 0, defaultLocationId: 'khartoum' }
const initialCompany: Company = { ...defaultCompany, ...defaultQuoteDefaults }

const initialLang = (): Lang => {
  const w = typeof window !== 'undefined' ? (window as unknown as { __DT_LANG__?: string }).__DT_LANG__ : undefined
  return w === 'ar' ? 'ar' : 'en'
}

interface AppState {
  lang: Lang; view: View; step: number; projects: Project[]; currentId: string | null; company: Company
  /** Client-safe presentation: hide cost prices and markup everywhere. */
  clientView: boolean
  lastStep: Record<string, number>
  setLang: (l: Lang) => void; setView: (v: View) => void; setStep: (s: number) => void; setClientView: (v: boolean) => void
  navigate: (to: { view: View; currentId?: string | null; step?: number }) => void
  createProject: (p?: Partial<Project>) => Project; openProject: (id: string, step?: number) => void
  updateProject: (id: string, patch: Partial<Project> | ((p: Project) => Partial<Project>)) => void
  deleteProject: (id: string) => { project: Project; index: number } | null; restoreProject: (p: Project, index: number) => void
  duplicateProject: (id: string) => Project | null
  importProject: (p: unknown) => Project | null; importMany: (ps: Project[]) => void
  setCompany: (c: Partial<Company>) => void
}

const isObj = (x: unknown): x is Record<string, unknown> => !!x && typeof x === 'object' && !Array.isArray(x)
/** Validate an imported JSON file and fill fields added in newer versions. Returns null when it is not a project. */
export function normalizeProject(x: unknown): Project | null {
  if (!isObj(x) || !Array.isArray(x.loads) || !isObj(x.design) || !isObj(x.site)) return null
  const base = newProject()
  const p = x as unknown as Project
  return {
    ...base, ...p,
    id: typeof p.id === 'string' && p.id ? p.id : base.id,
    name: typeof p.name === 'string' ? p.name : base.name,
    site: { ...base.site, ...p.site }, design: { ...base.design, ...p.design },
    pricing: { ...base.pricing, ...(isObj(p.pricing) ? p.pricing : {}) },
    status: ['draft', 'quoted', 'approved', 'installed'].includes(p.status) ? p.status : 'draft',
  }
}

export const useAppStore = create<AppState>()(
  persist(
    (set, get) => ({
      lang: initialLang(), view: 'projects', step: 0, projects: [], currentId: null, company: initialCompany, clientView: true, lastStep: {},
      setLang: (lang) => set((s) => {
        // Untouched default texts follow the UI language (so the Arabic quote doesn't print English boilerplate)
        const from = lang === 'ar' ? en : ar, to = lang === 'ar' ? ar : en
        const swap = (v: string, a: string[], b: string) => (a.includes(v) ? b : v)
        const c = s.company
        return {
          lang,
          company: { ...c, name: swap(c.name, [from.settings.defaultName, defaultCompany.name], to.settings.defaultName), tagline: swap(c.tagline, [from.settings.defaultTagline, defaultCompany.tagline], to.settings.defaultTagline), terms: swap(c.terms, [from.settings.defaultTerms, defaultCompany.terms], to.settings.defaultTerms) },
          projects: s.projects.some((p) => p.name === from.info.defaultName) ? s.projects.map((p) => (p.name === from.info.defaultName ? { ...p, name: to.info.defaultName } : p)) : s.projects,
        }
      }),
      setView: (view) => set({ view }),
      setStep: (step) => set((s) => ({ step, lastStep: s.currentId ? { ...s.lastStep, [s.currentId]: step } : s.lastStep })),
      setClientView: (clientView) => set({ clientView }),
      navigate: ({ view, currentId, step }) => set((s) => {
        if (view === 'wizard' && currentId && s.projects.some((p) => p.id === currentId)) return { view, currentId, step: step ?? s.lastStep[currentId] ?? 0 }
        return { view: view === 'wizard' ? 'projects' : view }
      }),
      createProject: (partial = {}) => {
        const c = get().company
        const d = get().lang === 'ar' ? ar : en
        const p = newProject(partial, c)
        if (!partial.name) p.name = d.info.defaultName
        if (!partial.site) {
          const cur = c.currency || 'USD'
          p.site = { ...siteFromLocation(c.defaultLocationId || 'khartoum'), currency: cur, fxRateToUsd: cur === 'USD' ? 1 : c.fxRateToUsd > 0 ? c.fxRateToUsd : 1 }
        }
        if (!partial.pricing) p.pricing = { ...p.pricing, marginPct: c.marginPct ?? 20, vatPct: c.vatPct ?? 0 }
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
        const copy: Project = { ...structuredClone(src), id: uid(), name: `${src.name} ${d.projects.copySuffix}`, createdAt: now, updatedAt: now, status: 'draft' }
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
    }),
    {
      name: 'dtplus-solar-planner-v1', version: 2,
      migrate: (persisted, version) => {
        const st = (persisted ?? {}) as Partial<AppState>
        if (version < 2) return { ...st, clientView: true, lastStep: {}, company: { ...initialCompany, ...(st.company ?? {}) } } as AppState
        return st as AppState
      },
      merge: (persisted, current) => {
        const p = (persisted ?? {}) as Partial<AppState>
        return { ...current, ...p, company: { ...current.company, ...(p.company ?? {}) }, lastStep: { ...(p.lastStep ?? {}) } }
      },
    },
  ),
)
export const useCurrentProject = () => useAppStore((s) => s.projects.find((p) => p.id === s.currentId) ?? null)
