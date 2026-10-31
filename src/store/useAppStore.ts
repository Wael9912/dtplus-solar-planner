import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { Project, CompanySettings } from '../engine/types'
import { defaultCompany, newProject, uid } from '../engine/defaults'

export type View = 'projects' | 'wizard' | 'settings'
interface AppState {
  lang: 'en' | 'ar'; view: View; step: number; projects: Project[]; currentId: string | null; company: CompanySettings;
  setLang: (l: 'en' | 'ar') => void; setView: (v: View) => void; setStep: (s: number) => void;
  createProject: (p?: Partial<Project>) => Project; openProject: (id: string) => void; updateProject: (id: string, patch: Partial<Project> | ((p: Project) => Partial<Project>)) => void;
  deleteProject: (id: string) => void; duplicateProject: (id: string) => void; importProject: (p: Project) => void; setCompany: (c: Partial<CompanySettings>) => void;
}
export const useAppStore = create<AppState>()(
  persist(
    (set, get) => ({
      lang: 'en', view: 'projects', step: 0, projects: [], currentId: null, company: defaultCompany,
      setLang: (lang) => set({ lang }), setView: (view) => set({ view }), setStep: (step) => set({ step }),
      createProject: (partial) => {
        const p = newProject(partial, get().company)
        p.pricing.vatPct = 0
        set((s) => ({ projects: [p, ...s.projects], currentId: p.id, view: 'wizard', step: 0 }))
        return p
      },
      openProject: (id) => set({ currentId: id, view: 'wizard', step: 0 }),
      updateProject: (id, patch) => set((s) => ({
        projects: s.projects.map((p) => (p.id === id ? { ...p, ...(typeof patch === 'function' ? patch(p) : patch), updatedAt: new Date().toISOString() } : p)),
      })),
      deleteProject: (id) => set((s) => ({ projects: s.projects.filter((p) => p.id !== id), currentId: s.currentId === id ? null : s.currentId, view: s.currentId === id ? 'projects' : s.view })),
      duplicateProject: (id) => set((s) => {
        const src = s.projects.find((p) => p.id === id); if (!src) return {}
        const now = new Date().toISOString()
        return { projects: [{ ...structuredClone(src), id: uid(), name: `${src.name} (copy)`, createdAt: now, updatedAt: now, status: 'draft' }, ...s.projects] }
      }),
      importProject: (p) => set((s) => ({ projects: [{ ...p, id: s.projects.some((x) => x.id === p.id) ? uid() : p.id }, ...s.projects] })),
      setCompany: (c) => set((s) => ({ company: { ...s.company, ...c } })),
    }),
    { name: 'dtplus-solar-planner-v1', version: 1 },
  ),
)
export const useCurrentProject = () => useAppStore((s) => s.projects.find((p) => p.id === s.currentId) ?? null)
