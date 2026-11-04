import { useEffect, type ReactNode } from 'react'
import { Sun, Settings, Plus, ChevronLeft, ChevronRight, Presentation, Tags, History, House, Download, Calculator, Wrench } from 'lucide-react'
import { useAppStore, useCurrentProject, type View } from './store/useAppStore'
import { useT } from './i18n'
import { companyTitle, projectTitle } from './i18n/labels'
import { ProjectsPage } from './components/ProjectsPage'
import { HomePage } from './components/HomePage'
import { SettingsPage } from './components/SettingsPage'
import { Wizard } from './components/Wizard'
import { ToolsPage } from './components/tools/ToolsPage'
import { TOOL_ICONS, TOOL_IDS } from './components/tools/useTool'
import { QuickCalc } from './components/QuickCalc'
import { PriceListPage } from './components/PriceListPage'
import { Menu, Toaster } from './components/overlay'
import { useStartActions } from './components/startMenu'
import { useIsDesktop, useMediaQuery } from './components/hooks'
import { UpdateBanner, UpdateNotices } from './components/UpdateNotice'
import { InstallSheet } from './components/InstallApp'
import { SaveBanner } from './components/SaveBanner'
import { install, useInstallWay } from './pwa'

const YEAR = new Date().getFullYear()

/** Segmented EN | عربي switch: fixed order in both directions. */
export function LangSwitch({ className = '' }: { className?: string }) {
  const lang = useAppStore((s) => s.lang)
  const setLang = useAppStore((s) => s.setLang)
  return (
    <div role="group" aria-label="Language · اللغة" dir="ltr" className={`inline-flex shrink-0 items-center rounded-md border border-slate-200 bg-white p-0.5 ${className}`}>
      {(['en', 'ar'] as const).map((l) => (
        <button key={l} type="button" lang={l} aria-pressed={lang === l} data-testid={`lang-${l}`} onClick={() => setLang(l)}
          className={`min-h-9 min-w-10 rounded px-2 text-sm font-medium transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 ${lang === l ? 'bg-slate-100 text-slate-900' : 'text-slate-500 hover:text-slate-900'}`}>
          {l === 'en' ? 'EN' : 'عربي'}
        </button>
      ))}
    </div>
  )
}

/** Header destination on phones and tablets (icon only); `aria-current` marks the open screen. */
function NavButton({ to, icon, label, className }: { to: View; icon: ReactNode; label: string; className: string }) {
  const active = useAppStore((s) => s.view === to)
  const setView = useAppStore((s) => s.setView)
  return (
    <button type="button" data-testid={`nav-${to}`} aria-current={active ? 'page' : undefined} title={label} aria-label={label} onClick={() => setView(to)}
      className={`btn-ghost btn-icon ${active ? 'bg-slate-100 text-slate-900' : ''} ${className}`}>
      {icon}
    </button>
  )
}

/** Sidebar destination (desktop): icon + label, `aria-current` for the open screen. */
function SideItem({ active, icon, label, onClick, testId }: { active: boolean; icon: ReactNode; label: string; onClick: () => void; testId: string }) {
  return (
    <li>
      <button type="button" className="nav-item" aria-current={active ? 'page' : undefined} data-testid={testId} onClick={onClick}>
        {icon}<span className="min-w-0 flex-1 truncate text-start">{label}</span>
      </button>
    </li>
  )
}

function Brand({ onClick, className = '' }: { onClick: () => void; className?: string }) {
  const { t } = useT()
  const company = useAppStore((s) => s.company)
  const brand = companyTitle(company.name) ?? t.appName
  return (
    <button type="button" data-testid="brand" title={t.nav.home} onClick={onClick}
      className={`flex min-h-11 min-w-0 items-center gap-2.5 rounded-md text-start focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 ${className}`}>
      {company.logoDataUrl
        ? <img src={company.logoDataUrl} alt="" className="size-8 shrink-0 rounded-md border border-slate-200 bg-white object-contain p-0.5" />
        : <span className="grid size-8 shrink-0 place-items-center rounded-md bg-slate-900 text-sun-400"><Sun size={18} /></span>}
      <span className="block min-w-0 flex-1 truncate text-[0.9375rem] font-semibold text-slate-900"><bdi>{brand}</bdi></span>
    </button>
  )
}

/** Desktop sidebar: every destination of the app, the calculators listed one by one. */
function Sidebar() {
  const { t } = useT()
  const view = useAppStore((s) => s.view)
  const toolId = useAppStore((s) => s.toolId)
  const setView = useAppStore((s) => s.setView)
  const openTool = useAppStore((s) => s.openTool)
  const startCalc = useAppStore((s) => s.startCalc)
  const start = useStartActions()
  const installWay = useInstallWay()
  return (
    <aside className="fixed inset-y-0 start-0 z-30 flex w-60 flex-col border-e border-slate-200 bg-white" data-testid="sidebar">
      <header className="space-y-3 px-3 pt-3">
        <Brand onClick={() => setView('home')} className="w-full px-1.5" />
        <Menu label={t.nav.newMenu} testId="nav-new" align="start" buttonClassName="btn-primary w-full" items={start.map((a) => ({ label: a.label, icon: <a.icon size={18} />, onClick: a.run, testId: `new-${a.key}` }))}>
          <Plus size={18} /><span>{t.nav.newShort}</span>
        </Menu>
      </header>
      <nav className="min-h-0 flex-1 overflow-y-auto px-3 pb-3" aria-label={t.nav.menu}>
        <ul className="mt-4 space-y-0.5">
          <SideItem active={view === 'home'} icon={<House size={18} />} label={t.nav.home} onClick={() => setView('home')} testId="nav-home" />
          <SideItem active={view === 'projects'} icon={<History size={18} />} label={t.nav.projects} onClick={() => setView('projects')} testId="nav-projects" />
        </ul>
        <p className="nav-group">{t.calc.home.groups.calc}</p>
        <ul className="space-y-0.5">
          <SideItem active={view === 'calc'} icon={<Calculator size={18} />} label={t.modes.calc} onClick={() => startCalc()} testId="nav-calc" />
          {TOOL_IDS.map((id) => { const Icon = TOOL_ICONS[id]; return <SideItem key={id} active={view === 'tools' && toolId === id} icon={<Icon size={18} />} label={t.tools.names[id]} onClick={() => openTool(id)} testId={`nav-tool-${id}`} /> })}
        </ul>
        <p className="nav-group">{t.calc.home.groups.business}</p>
        <ul className="space-y-0.5">
          <SideItem active={view === 'prices'} icon={<Tags size={18} />} label={t.nav.prices} onClick={() => setView('prices')} testId="nav-prices" />
          <SideItem active={view === 'settings'} icon={<Settings size={18} />} label={t.nav.settings} onClick={() => setView('settings')} testId="nav-settings" />
        </ul>
      </nav>
      <div className="space-y-2 border-t border-slate-200 px-3 py-3">
        {installWay !== 'installed' && (
          <button type="button" className="nav-item" onClick={() => void install()} data-testid="sidebar-install"><Download size={18} />{t.install.button}</button>
        )}
        <div className="flex items-center justify-between gap-2 px-1">
          <LangSwitch />
          <span className="truncate text-xs text-slate-400"><bdi dir="ltr">v{__APP_VERSION__}</bdi></span>
        </div>
        <p className="px-1 text-xs text-slate-400"><bdi>{t.by}</bdi> · <bdi dir="ltr">© {YEAR}</bdi></p>
      </div>
    </aside>
  )
}

const hashFor = (s: { view: View; currentId: string | null; step: number; toolId: string | null }) =>
  s.view === 'wizard' && s.currentId ? `#/p/${encodeURIComponent(s.currentId)}/${s.step + 1}`
    : s.view === 'tools' ? (s.toolId ? `#/tools/${encodeURIComponent(s.toolId)}` : '#/tools')
      : s.view === 'settings' || s.view === 'calc' || s.view === 'prices' || s.view === 'home' ? `#/${s.view}` : '#/projects'
function parseHash(h: string): { view: View; currentId?: string; step?: number; toolId?: string | null } | null {
  const m = /^#\/p\/([^/]+)\/(\d+)$/.exec(h)
  if (m) return { view: 'wizard', currentId: decodeURIComponent(m[1]), step: Math.max(0, Math.min(6, Number(m[2]) - 1)) }
  const tl = /^#\/tools(?:\/([^/]+))?$/.exec(h)
  if (tl) return { view: 'tools', toolId: tl[1] ? decodeURIComponent(tl[1]) : null }
  return h === '#/settings' ? { view: 'settings' } : h === '#/calc' ? { view: 'calc' } : h === '#/prices' ? { view: 'prices' }
    : h === '#/projects' || h === '#/history' ? { view: 'projects' } : h === '#/home' || h === '#/' ? { view: 'home' } : null
}

export default function App() {
  const { t, lang, dir } = useT()
  const view = useAppStore((s) => s.view)
  const setView = useAppStore((s) => s.setView)
  const start = useStartActions()
  const clientView = useAppStore((s) => s.clientView)
  const setClientView = useAppStore((s) => s.setClientView)
  const project = useCurrentProject()
  const installWay = useInstallWay()
  const inWizard = view === 'wizard' && !!project
  // One shell per breakpoint, rendered (not just hidden) so every control and test id exists once: sidebar ≥ 1024 px, top bar below
  const desktop = useIsDesktop()
  // The load calculator keeps its result in a bottom bar below 1280 px (side column above): toasts must clear it
  const calcBar = !useMediaQuery('(min-width: 1280px)') && view === 'calc'

  useEffect(() => {
    document.documentElement.lang = lang; document.documentElement.dir = dir
    document.title = t.appName
    document.querySelector('meta[name=description]')?.setAttribute('content', `${t.appName}: ${t.tagline}`)
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

  return (
    <div className="min-h-dvh" dir={dir}>
      {desktop && <Sidebar />}
      <div className="flex min-h-dvh min-w-0 flex-col lg:ps-60">
        {/* Phones and tablets: slim top bar. Desktop navigates from the sidebar. */}
        {!desktop && <header className="sticky top-0 z-30 border-b border-slate-200 bg-white pt-[env(safe-area-inset-top)]">
          <div className="flex h-14 items-center gap-1.5 ps-[max(0.75rem,env(safe-area-inset-left))] pe-[max(0.75rem,env(safe-area-inset-right))] sm:gap-2 sm:px-6">
            {inWizard && (
              <button type="button" className="btn-ghost btn-icon -ms-1 sm:hidden" aria-label={t.nav.allProjects} title={t.nav.allProjects} data-testid="nav-back-projects" onClick={() => setView('projects')}><BackIcon size={22} /></button>
            )}
            <Brand onClick={() => setView('home')} className={`${inWizard ? 'hidden sm:flex' : 'flex'} flex-1 sm:flex-none`} />
            {inWizard && project && (
              <div className="min-w-0 flex-1 leading-tight sm:hidden">
                <div className="truncate text-[0.9375rem] font-semibold text-slate-900" data-testid="header-project"><bdi>{projectTitle(project.name, t)}</bdi></div>
                <div className="truncate text-xs text-slate-500"><bdi>{[project.clientName, project.reference].filter(Boolean).join(' · ')}</bdi></div>
              </div>
            )}
            <div className="hidden flex-1 sm:block" />
            {/* History stays one tap away on phones too (inside a project the back arrow already leads there) */}
            <nav className="flex items-center gap-0.5" aria-label={t.nav.menu}>
              <NavButton to="home" icon={<House size={20} />} label={t.nav.home} className="hidden sm:inline-flex" />
              <NavButton to="projects" icon={<History size={20} />} label={t.nav.projects} className={inWizard ? 'hidden sm:inline-flex' : 'inline-flex'} />
              <NavButton to="tools" icon={<Wrench size={20} />} label={t.nav.tools} className="hidden sm:inline-flex" />
              <NavButton to="prices" icon={<Tags size={20} />} label={t.nav.prices} className="hidden sm:inline-flex" />
              <NavButton to="settings" icon={<Settings size={20} />} label={t.nav.settings} className="hidden sm:inline-flex" />
            </nav>
            <LangSwitch />
            <div className="hidden sm:block">
              <Menu label={t.nav.newMenu} testId="nav-new" buttonClassName="btn-primary px-3" items={start.map((a) => ({ label: a.label, icon: <a.icon size={18} />, onClick: a.run, testId: `new-${a.key}` }))}>
                <Plus size={18} /><span>{t.nav.newShort}</span>
              </Menu>
            </div>
            <div className="sm:hidden">
              <Menu label={t.nav.menu} testId="nav-menu" items={[
                { label: t.nav.home, icon: <House size={18} />, onClick: () => setView('home'), testId: 'menu-home' },
                { label: t.nav.projects, icon: <History size={18} />, onClick: () => setView('projects'), testId: 'menu-projects' },
                ...start.map((a) => ({ label: a.label, icon: <a.icon size={18} />, onClick: a.run, testId: `menu-new-${a.key}` })),
                { label: t.nav.prices, icon: <Tags size={18} />, onClick: () => setView('prices'), testId: 'menu-prices' },
                { label: t.nav.settings, icon: <Settings size={18} />, onClick: () => setView('settings'), testId: 'menu-settings' },
                { label: t.install.button, icon: <Download size={18} />, onClick: () => void install(), hidden: installWay === 'installed', testId: 'menu-install' },
                { label: t.nav.clientView, icon: <Presentation size={18} />, onClick: () => setClientView(!clientView), checked: clientView, hidden: !inWizard, testId: 'menu-client-view' },
              ]} />
            </div>
          </div>
        </header>}
        <UpdateBanner />
        <SaveBanner />
        <main className={`mx-auto w-full max-w-6xl flex-1 ps-[max(1rem,env(safe-area-inset-left))] pe-[max(1rem,env(safe-area-inset-right))] pt-4 sm:px-6 sm:pt-6 lg:px-8 lg:pt-8 ${inWizard ? 'pb-28' : 'pb-24 sm:pb-10'}`}>
          {view === 'home' && <HomePage />}
          {view === 'projects' && <ProjectsPage />}
          {view === 'settings' && <SettingsPage />}
          {view === 'wizard' && <Wizard />}
          {view === 'tools' && <ToolsPage />}
          {view === 'calc' && <QuickCalc />}
          {view === 'prices' && <PriceListPage />}
        </main>
        {!inWizard && (
          <footer className="hidden border-t border-slate-200 py-3 text-center text-xs text-slate-500 sm:block lg:hidden">
            <bdi>{t.by}</bdi> · <bdi dir="ltr">© {YEAR} DT+</bdi> · <bdi dir="ltr">v{__APP_VERSION__}</bdi>
          </footer>
        )}
      </div>
      <Toaster raised={inWizard || calcBar} />
      <UpdateNotices />
      <InstallSheet />
    </div>
  )
}
