import { DatabaseBackup, TriangleAlert } from 'lucide-react'
import { useT } from '../i18n'
import { useAppStore } from '../store/useAppStore'
import { useSaveState } from '../store/useSaveState'

/** Strip under the header while changes cannot be saved on this device (storage full) — until a save works again. */
export function SaveBanner() {
  const { t } = useT()
  const failed = useSaveState((s) => s.failed)
  if (!failed) return null
  const backup = () => {
    useAppStore.getState().setView('settings')
    requestAnimationFrame(() => document.getElementById('company-file')?.scrollIntoView({ block: 'start', behavior: 'smooth' }))
  }
  return (
    <div className="border-b border-red-200 bg-red-50" role="alert" data-testid="save-banner">
      <div className="mx-auto flex min-h-12 max-w-6xl items-center gap-2 py-1.5 ps-[max(0.75rem,env(safe-area-inset-left))] pe-[max(0.5rem,env(safe-area-inset-right))] text-sm text-red-900 sm:px-6">
        <TriangleAlert size={18} className="shrink-0 text-red-700" aria-hidden="true" />
        <span className="min-w-0 flex-1">{t.storage.full}</span>
        <button type="button" className="btn-secondary shrink-0 px-3" onClick={backup} data-testid="save-banner-backup"><DatabaseBackup size={18} />{t.storage.backup}</button>
      </div>
    </div>
  )
}
