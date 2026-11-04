import { Check, Download, Share, X } from 'lucide-react'
import { useT } from '../i18n'
import { closeBanner, closeInstallSheet, install, useInstallWay, usePwa } from '../pwa'
import { Sheet } from './overlay'

const ICON = `${import.meta.env.BASE_URL}icon-192.png`

/** Home: "Get it as an app" — where the browser can install it (install dialog, iPhone / iPad, Safari on Mac), until closed. */
export function InstallBanner() {
  const { t } = useT()
  const way = useInstallWay()
  const closed = usePwa((s) => s.bannerClosed)
  if (closed || way === 'installed' || way === 'other') return null
  return (
    <section className="card relative flex flex-wrap items-center gap-x-3 gap-y-3 border-brand-200 bg-brand-50/60 p-3 sm:flex-nowrap sm:p-4 sm:pe-14" data-testid="install-banner">
      <img src={ICON} alt="" width={44} height={44} className="size-11 shrink-0 rounded-xl" />
      <p className="min-w-0 flex-1 basis-48 pe-9 text-sm text-slate-700 sm:pe-0">{t.install.banner}</p>
      <button type="button" className="btn-primary w-full shrink-0 sm:w-auto" onClick={() => void install()} data-testid="install-app"><Download size={18} />{t.install.button}</button>
      <button type="button" className="btn-ghost btn-icon absolute end-1 top-1" aria-label={t.install.close} title={t.install.close} onClick={closeBanner} data-testid="install-close"><X size={18} /></button>
    </section>
  )
}

/** Settings → About: install, or say it is installed. */
export function InstallSetting() {
  const { t } = useT()
  const way = useInstallWay()
  return (
    <div className="mt-4 border-t border-slate-100 pt-4" data-testid="install-setting">
      <p className="text-sm text-slate-600">{t.install.settingsHelp}</p>
      {way === 'installed'
        ? <p className="mt-2 inline-flex items-center gap-1.5 text-sm font-medium text-brand-800" data-testid="install-installed"><Check size={16} />{t.install.installed}</p>
        : <button type="button" className="btn-secondary mt-3" onClick={() => void install()} data-testid="settings-install"><Download size={18} />{t.install.button}</button>}
    </div>
  )
}

/** Steps for browsers without an install dialog (Safari on iPhone / iPad / Mac, others through their menu). */
export function InstallSheet() {
  const { t } = useT()
  const open = usePwa((s) => s.sheet)
  const way = useInstallWay()
  const kind = way === 'ios' || way === 'mac' ? way : 'other'
  const c = t.install[kind]
  return (
    <Sheet open={open && way !== 'installed'} onClose={closeInstallSheet} title={c.title} testId="install-sheet"
      footer={<button type="button" className="btn-primary flex-1 sm:flex-none" onClick={closeInstallSheet} data-testid="install-sheet-done">{t.common.done}</button>}>
      <div className="flex items-center gap-3">
        <img src={ICON} alt="" width={48} height={48} className="size-12 shrink-0 rounded-xl" />
        <p className="text-sm text-slate-600">{t.install.settingsHelp}</p>
      </div>
      <ol className="mt-4 space-y-3" data-testid="install-steps">
        {c.steps.map((s, i) => (
          <li key={i} className="flex gap-3">
            <span className="grid size-7 shrink-0 place-items-center rounded-full bg-brand-50 text-sm font-semibold text-brand-800">{i + 1}</span>
            <span className="pt-0.5 text-sm text-slate-800">{s}{i === 0 && kind === 'ios' && <Share size={16} className="ms-1.5 inline align-[-3px] text-brand-700" aria-hidden="true" />}</span>
          </li>
        ))}
      </ol>
      {kind === 'other' && <p className="mt-4 text-xs text-slate-500">{t.install.otherNote}</p>}
      <p className="mt-3 text-xs text-slate-500">{t.install.keep}</p>
    </Sheet>
  )
}
