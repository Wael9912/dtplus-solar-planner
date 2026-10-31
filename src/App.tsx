import { useEffect } from 'react'
import { Sun, FolderOpen, Settings, Languages, Plus } from 'lucide-react'
import { useAppStore } from './store/useAppStore'
import { useT } from './i18n'
import { ProjectsPage } from './components/ProjectsPage'
import { SettingsPage } from './components/SettingsPage'
import { Wizard } from './components/Wizard'

export default function App() {
  const { t, lang, dir } = useT()
  const { view, setView, setLang, createProject, company } = useAppStore()
  useEffect(() => { document.documentElement.lang = lang; document.documentElement.dir = dir }, [lang, dir])

  return (
    <div className="min-h-screen flex flex-col" dir={dir}>
      <header className="sticky top-0 z-30 border-b border-slate-200 bg-white/90 backdrop-blur">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-3 px-4 py-3">
          <button className="flex min-w-0 items-center gap-2" onClick={() => setView('projects')}>
            <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-brand-700 text-sun-400"><Sun size={20} /></span>
            <span className="min-w-0 text-start leading-tight">
              <span className="block truncate text-base font-bold text-slate-900">{company.name !== 'Your Solar Company' ? company.name : t.appName}</span>
              <span className="block truncate text-[11px] text-slate-500">{t.tagline}</span>
            </span>
          </button>
          <nav className="flex shrink-0 items-center gap-1">
            <button className={`btn-ghost ${view === 'projects' ? 'bg-slate-100' : ''}`} title={t.nav.projects} onClick={() => setView('projects')}><FolderOpen size={16} /><span className="hidden sm:inline">{t.nav.projects}</span></button>
            <button className={`btn-ghost ${view === 'settings' ? 'bg-slate-100' : ''}`} title={t.nav.settings} onClick={() => setView('settings')}><Settings size={16} /><span className="hidden sm:inline">{t.nav.settings}</span></button>
            <button className="btn-ghost" onClick={() => setLang(lang === 'en' ? 'ar' : 'en')} title="Language"><Languages size={16} /><span>{t.nav.language}</span></button>
            <button className="btn-primary" title={t.nav.newProject} onClick={() => createProject()}><Plus size={16} /><span className="hidden sm:inline">{t.nav.newProject}</span></button>
          </nav>
        </div>
      </header>
      <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-6">
        {view === 'projects' && <ProjectsPage />}
        {view === 'settings' && <SettingsPage />}
        {view === 'wizard' && <Wizard />}
      </main>
      <footer className="border-t border-slate-200 bg-white py-4 text-center text-xs text-slate-500">
        {t.by} · © {new Date().getFullYear()} DT+ · v{__APP_VERSION__}
      </footer>
    </div>
  )
}
