import { useEffect, useRef } from 'react'
import { RefreshCw, Sparkles, X } from 'lucide-react'
import { useT } from '../i18n'
import { toast } from '../store/useToast'
import { applyUpdate, notesSince, useUpdates, VERSION } from '../updates'
import { Sheet } from './overlay'

/** Strip under the header while a newer version waits (the user was typing or had a dialog open when it arrived). */
export function UpdateBanner() {
  const { t } = useT()
  const available = useUpdates((s) => s.available)
  if (available == null) return null
  return (
    <div className="border-t border-brand-200 bg-brand-50" data-testid="update-banner">
      <div className="mx-auto flex min-h-12 max-w-7xl items-center gap-2 py-1 ps-[max(0.75rem,env(safe-area-inset-left))] pe-[max(0.5rem,env(safe-area-inset-right))] text-sm text-brand-900 sm:px-6">
        <RefreshCw size={18} className="shrink-0 text-brand-700" aria-hidden="true" />
        <span className="min-w-0 flex-1">{t.updates.ready}</span>
        <button type="button" className="btn-primary shrink-0 px-3" data-testid="update-now" onClick={() => applyUpdate()}>{t.updates.update}</button>
        <button type="button" className="btn-ghost btn-icon shrink-0" aria-label={t.updates.later} title={t.updates.later} onClick={() => useUpdates.setState({ available: null })}><X size={18} /></button>
      </div>
    </div>
  )
}

/** After an update: the release notes this device has not seen, or a short "updated" toast when there are none. */
export function UpdateNotices() {
  const { t } = useT()
  const notice = useUpdates((s) => s.notice)
  const ok = useRef<HTMLButtonElement>(null)
  const items = notice?.kind === 'whatsNew' ? notesSince(notice.since, t.updates.notes) : []
  const sheet = items.length > 0
  useEffect(() => {
    if (!notice || sheet) return
    toast({ message: t.updates.updated(VERSION), tone: 'ok', duration: 5000 })
    useUpdates.setState({ notice: null })
  }, [notice, sheet, t])
  const close = () => useUpdates.setState({ notice: null })
  return (
    <Sheet open={sheet} onClose={close} title={t.updates.whatsNew(VERSION)} description={t.updates.intro} initialFocus={ok} testId="whats-new"
      footer={<button ref={ok} type="button" className="btn-primary flex-1 sm:flex-none" data-testid="whats-new-ok" onClick={close}>{t.updates.gotIt}</button>}>
      <ul className="space-y-3 text-sm text-slate-700">
        {items.map((x) => (
          <li key={x} className="flex gap-3"><Sparkles size={18} className="mt-0.5 shrink-0 text-sun-500" aria-hidden="true" /><span className="min-w-0">{x}</span></li>
        ))}
      </ul>
    </Sheet>
  )
}
