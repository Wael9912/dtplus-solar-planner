import { useEffect } from 'react'
import { Sun, FolderOpen, Settings, Plus, ChevronLeft, ChevronRight, Presentation, Wrench, Tags } from 'lucide-react'
import { useAppStore, useCurrentProject, type View } from './store/useAppStore'
import { useT } from './i18n'
import { companyTitle, projectTitle } from './i18n/labels'
import { ProjectsPage } from './components/ProjectsPage'
import { SettingsPage } from './components/SettingsPage'
import { Wizard } from './components/Wizard'
import { ToolsPage } from './components/tools/ToolsPage'
import { QuickCalc } from './components/QuickCalc'
import { PriceListPage } from './components/PriceListPage'
import { Menu, Toaster } from './components/overlay'
import { useStartActions } from './components/startMenu'
import { useMediaQuery } from './components/hooks'

const YEAR = new Date().getFullYear()

/** Segmented EN | عربي switch — always visible in the header, fixed order in both directions. */
export function LangSwitch() {
  const lang = useAppStore((s) => s.lang)
  const setLang = useAppStore((s) => s.setLang)
  return (
    <div role="group" aria-label="Language · اللغة" dir="ltr" className="inline-flex shrink-0 items-center rounded-lg bg-slate-100 p-0.5 ring-1 ring-slate-200 ring-inset">
      {(['en', 'ar'] as const).map((l) => (
        <button key={l} type="button" lang={l} aria-pressed={lang === l} data-testid={`lang-${l}`} onClick={() => setLang(l)}
          className={`min-h-10 min-w-11 rounded-md px-2.5 text-sm font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 ${lang === l ? 'bg-white text-brand-800 shadow-sm ring-1 ring-slate-200' : 'text-slate-500 hover:text-slate-900'}`}>
          {l === 'en' ? 'EN' : 'عربي'}
        </button>
      ))}
    </div>
  )
}

const hashFor = (s: { view: View; currentId: string | null; step: number; toolId: string | null }) =>
  s.view === 'wizard' && s.currentId ? `#/p/${encodeURIComponent(s.currentId)}/${s.step + 1}`
    : s.view === 'tools' ? (s.toolId ? `#/tools/${encodeURIComponent(s.toolId)}` : '#/tools')
      : s.view === 'settings' || s.view === 'calc' || s.view === 'prices' ? `#/${s.view}` : '#/projects'
function parseHash(h: string): { view: View; currentId?: string; step?: number; toolId?: string | null } | null {
  const m = /^#\/p\/([^/]+)\/(\d+)$/.exec(h)
  if (m) return { view: 'wizard', currentId: decodeURIComponent(m[1]), step: Math.max(0, Math.min(6, Number(m[2]) - 1)) }
  const tl = /^#\/tools(?:\/([^/]+))?$/.exec(h)
  if (tl) return { view: 'tools', toolId: tl[1] ? decodeURIComponent(tl[1]) : null }
  return h === '#/settings' ? { view: 'settings' } : h === '#/calc' ? { view: 'calc' } : h === '#/prices' ? { view: 'prices' } : h === '#/projects' ? { view: 'projects' } : null
}

export default function App() {
  const { t, lang, dir } = useT()
  const view = useAppStore((s) => s.view)
  const setView = useAppStore((s) => s.setView)
  const start = useStartActions()
  const company = useAppStore((s) => s.company)
  const clientView = useAppStore((s) => s.clientView)
  const setClientView = useAppStore((s) => s.setClientView)
  const project = useCurrentProject()
  const inWizard = view === 'wizard' && !!project
  // The load calculator keeps its result in a bottom bar below 1280 px (side column above): toasts must clear it
  const calcBar = !useMediaQuery('(min-width: 1280px)') && view === 'calc'

  useEffect(() => {
    document.documentElement.lang = lang; document.documentElement.dir = dir
    document.title = t.appName
    document.querySelector('meta[name=description]')?.setAttribute('content', `${t.appName} — ${t.tagline}`)
  }, [lang, dir, t.appName, t.tagline])

  // URL ⇄ state: ?lang= deep link, and a hash per screen so the phone's back gesture moves back through steps instead of leaving the app.
  useEffect(() => {
    const st = useAppStore.getState()
    const url = new URL(location.href)
    const q = url.searchParams.get('lang')
    if (q === 'ar' || q === 'en') { st.setLang(q); url.searchParams.delete('lang') }
    const target = parseHash(location.hash)
    if (target) st.navigate(target)
    if (useAppStore.getState().view === 'calc' && !useAppStore.getState().calc) useAppStore.getState().startCalc()
    history.replaceState(null, '', url.pathname + url.search + hashFor(useAppStore.getState()))
    const unsub = useAppStore.subscribe((s) => { const h = hashFor(s); if (h !== location.hash) history.pushState(null, '', h) })
    const onPop = () => {
      const x = parseHash(location.hash); if (!x) return
      useAppStore.getState().navigate(x)
      if (x.view === 'calc' && !useAppStore.getState().calc) useAppStore.getState().startCalc()
    }
    window.addEventListener('popstate', onPop)
    return () => { unsub(); window.removeEventListener('popstate', onPop) }
  }, [])

  const BackIcon = dir === 'rtl' ? ChevronRight : ChevronLeft
  const brand = companyTitle(company.name) ?? t.appName

  return (
    <div className="flex min-h-dvh flex-col" dir={dir}>
      <header className="sticky top-0 z-30 border-b border-slate-200 bg-white/95 pt-[env(safe-area-inset-top)] backdrop-blur">
        <div className="mx-auto flex h-14 max-w-7xl items-center gap-1.5 ps-[max(0.75rem,env(safe-area-inset-left))] pe-[max(0.75rem,env(safe-area-inset-right))] sm:gap-2 sm:px-6">
          {inWizard && (
            <button type="button" className="btn-ghost btn-icon -ms-1 sm:hidden" aria-label={t.nav.allProjects} title={t.nav.allProjects} data-testid="nav-back-projects" onClick={() => setView('projects')}><BackIcon size={22} /></button>
          )}
          <button type="button" data-testid="brand" className={`${inWizard ? 'hidden sm:flex' : 'flex'} min-h-11 min-w-0 flex-1 items-center gap-2.5 rounded-lg text-start focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 sm:flex-none`} onClick={() => setView('projects')}>
            {company.logoDataUrl
              ? <img src={company.logoDataUrl} alt="" className="h-9 w-9 shrink-0 rounded-lg border border-slate-200 bg-white object-contain p-0.5" />
              : <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-brand-700 text-sun-400"><Sun size={20} /></span>}
            <span className="min-w-0 leading-tight">
              <span className="block truncate text-[0.9375rem] font-semibold text-slate-900"><bdi>{brand}</bdi></span>
              <span className="hidden truncate text-xs text-slate-500 md:block">{companyTitle(company.name) ? <bdi>{company.tagline || t.tagline}</bdi> : t.tagline}</span>
            </span>
          </button>
          {inWizard && project && (
            <div className="min-w-0 flex-1 leading-tight sm:hidden">
              <div className="truncate text-[0.9375rem] font-semibold text-slate-900" data-testid="header-project"><bdi>{projectTitle(project.name, t)}</bdi></div>
              <div className="truncate text-xs text-slate-500"><bdi>{[project.clientName, project.reference].filter(Boolean).join(' · ')}</bdi></div>
            </div>
          )}
          <div className="hidden flex-1 sm:block" />
          <nav className="hidden items-center gap-1 sm:flex" aria-label={t.nav.menu}>
            <button type="button" data-testid="nav-projects" aria-current={view === 'projects' ? 'page' : undefined} className={`btn-ghost px-3 ${view === 'projects' ? 'bg-slate-100 text-slate-900' : ''}`} title={t.nav.projects} onClick={() => setView('projects')}><FolderOpen size={18} /><span className="hidden xl:inline">{t.nav.projects}</span></button>
            <button type="button" data-testid="nav-tools" aria-current={view === 'tools' ? 'page' : undefined} className={`btn-ghost px-3 ${view === 'tools' ? 'bg-slate-100 text-slate-900' : ''}`} title={t.nav.tools} onClick={() => setView('tools')}><Wrench size={18} /><span className="hidden xl:inline">{t.nav.tools}</span></button>
            <button type="button" data-testid="nav-prices" aria-current={view === 'prices' ? 'page' : undefined} className={`btn-ghost px-3 ${view === 'prices' ? 'bg-slate-100 text-slate-900' : ''}`} title={t.nav.prices} onClick={() => setView('prices')}><Tags size={18} /><span className="hidden xl:inline">{t.nav.prices}</span></button>
            <button type="button" data-testid="nav-settings" aria-current={view === 'settings' ? 'page' : undefined} className={`btn-ghost px-3 ${view === 'settings' ? 'bg-slate-100 text-slate-900' : ''}`} title={t.nav.settings} onClick={() => setView('settings')}><Settings size={18} /><span className="hidden xl:inline">{t.nav.settings}</span></button>
          </nav>
          <LangSwitch />
          <div className="hidden sm:block">
            <Menu label={t.nav.newMenu} testId="nav-new" buttonClassName="btn-primary px-3" items={start.map((a) => ({ label: a.label, icon: <a.icon size={18} />, onClick: a.run, testId: `new-${a.key}` }))}>
              <Plus size={18} /><span className="hidden md:inline">{t.nav.newShort}</span>
            </Menu>
          </div>
          <div className="sm:hidden">
            <Menu label={t.nav.menu} testId="nav-menu" items={[
              { label: t.nav.projects, icon: <FolderOpen size={18} />, onClick: () => setView('projects'), testId: 'menu-projects' },
              ...start.map((a) => ({ label: a.label, icon: <a.icon size={18} />, onClick: a.run, testId: `menu-new-${a.key}` })),
              { label: t.nav.prices, icon: <Tags size={18} />, onClick: () => setView('prices'), testId: 'menu-prices' },
              { label: t.nav.settings, icon: <Settings size={18} />, onClick: () => setView('settings'), testId: 'menu-settings' },
              { label: t.nav.clientView, icon: <Presentation size={18} />, onClick: () => setClientView(!clientView), checked: clientView, hidden: !inWizard, testId: 'menu-client-view' },
            ]} />
          </div>
        </div>
      </header>
      <main className={`mx-auto w-full max-w-7xl flex-1 ps-[max(1rem,env(safe-area-inset-left))] pe-[max(1rem,env(safe-area-inset-right))] pt-4 sm:px-6 sm:pt-6 ${inWizard ? 'pb-28' : 'pb-24 sm:pb-10'}`}>
        {view === 'projects' && <ProjectsPage />}
        {view === 'settings' && <SettingsPage />}
        {view === 'wizard' && <Wizard />}
        {view === 'tools' && <ToolsPage />}
        {view === 'calc' && <QuickCalc />}
        {view === 'prices' && <PriceListPage />}
      </main>
      {!inWizard && (
        <footer className="hidden border-t border-slate-200 bg-white py-3 text-center text-xs text-slate-500 sm:block">
          <bdi>{t.by}</bdi> · <bdi dir="ltr">© {YEAR} DT+</bdi> · <bdi dir="ltr">v{__APP_VERSION__}</bdi>
        </footer>
      )}
      <Toaster raised={inWizard || calcBar} />
    </div>
  )
}
