import { useEffect, useId, useRef, useState, type ReactNode, type RefObject } from 'react'
import { createPortal } from 'react-dom'
import { EllipsisVertical, X } from 'lucide-react'
import { useT } from '../i18n'
import { useToast } from '../store/useToast'

const FOCUSABLE = 'a[href],button:not([disabled]),input:not([disabled]):not([type=hidden]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])'

/**
 * Bottom sheet on phones; on ≥640 px either a centred dialog or an end-side drawer. Portal + backdrop, Esc / backdrop to close,
 * focus moved in and trapped, focus restored on close, page scroll locked, safe-area padding.
 */
export function Sheet({ open, onClose, title, description, children, footer, variant = 'dialog', initialFocus, testId, wide = false }: {
  open: boolean; onClose: () => void; title: ReactNode; description?: ReactNode; children: ReactNode; footer?: ReactNode
  variant?: 'dialog' | 'drawer'; initialFocus?: RefObject<HTMLElement | null>; testId?: string; wide?: boolean
}) {
  const { t, dir } = useT()
  const panel = useRef<HTMLDivElement>(null)
  const titleId = useId()
  const closeRef = useRef(onClose)
  useEffect(() => { closeRef.current = onClose })
  useEffect(() => {
    if (!open) return
    const prev = document.activeElement as HTMLElement | null
    const html = document.documentElement
    const prevOverflow = html.style.overflow
    html.style.overflow = 'hidden'
    const raf = requestAnimationFrame(() => { (initialFocus?.current ?? panel.current)?.focus({ preventScroll: true }) })
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.stopPropagation(); closeRef.current() }
      else if (e.key === 'Tab' && panel.current) {
        const els = [...panel.current.querySelectorAll<HTMLElement>(FOCUSABLE)].filter((el) => el.offsetParent !== null)
        if (!els.length) return
        const first = els[0], last = els[els.length - 1]
        if (e.shiftKey && (document.activeElement === first || document.activeElement === panel.current)) { e.preventDefault(); last.focus() }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus() }
      }
    }
    document.addEventListener('keydown', onKey)
    return () => { cancelAnimationFrame(raf); document.removeEventListener('keydown', onKey); html.style.overflow = prevOverflow; prev?.focus?.({ preventScroll: true }) }
  }, [open, initialFocus])
  if (!open) return null
  const drawer = variant === 'drawer'
  return createPortal(
    <div dir={dir} className={`fixed inset-0 z-50 flex items-end justify-center ${drawer ? 'sm:items-stretch sm:justify-end' : 'sm:items-center sm:p-6'}`}>
      <div className="absolute inset-0 animate-fade-in bg-slate-900/45" onClick={onClose} aria-hidden="true" />
      <div ref={panel} role="dialog" aria-modal="true" aria-labelledby={titleId} tabIndex={-1} data-testid={testId}
        className={`relative flex max-h-[92dvh] w-full animate-sheet-up flex-col rounded-t-2xl bg-white shadow-[var(--shadow-float)] outline-none
          ${drawer ? `sm:h-full sm:max-h-none ${wide ? 'sm:w-[34rem]' : 'sm:w-[28rem]'} sm:rounded-none sm:rounded-s-2xl` : `sm:max-h-[85dvh] ${wide ? 'sm:max-w-2xl' : 'sm:max-w-lg'} sm:rounded-2xl`}`}>
        <div className="mx-auto mt-2 h-1.5 w-10 shrink-0 rounded-full bg-slate-300 sm:hidden" aria-hidden="true" />
        <div className="flex shrink-0 items-start gap-3 px-4 pt-2 pb-3 sm:px-5 sm:pt-4">
          <div className="min-w-0 flex-1 pt-2">
            <h2 id={titleId} className="text-title text-slate-900">{title}</h2>
            {description && <p className="mt-0.5 text-sm text-slate-500">{description}</p>}
          </div>
          <button type="button" className="btn-ghost btn-icon -me-2" aria-label={t.common.close} title={t.common.close} onClick={onClose}><X size={20} /></button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 pb-4 sm:px-5">{children}</div>
        {footer && <div className="flex shrink-0 flex-wrap items-center justify-end gap-2 border-t border-slate-200 px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:px-5">{footer}</div>}
        {!footer && <div className="h-[env(safe-area-inset-bottom)] shrink-0" />}
      </div>
    </div>,
    document.body,
  )
}

export function ConfirmDialog({ open, title, body, confirmLabel, onConfirm, onClose, danger = true, children }: {
  open: boolean; title: ReactNode; body?: ReactNode; confirmLabel: string; onConfirm: () => void; onClose: () => void; danger?: boolean; children?: ReactNode
}) {
  const { t } = useT()
  const cancelRef = useRef<HTMLButtonElement>(null)
  return (
    <Sheet open={open} onClose={onClose} title={title} initialFocus={cancelRef} testId="confirm-dialog"
      footer={children ?? <>
        <button ref={cancelRef} type="button" className="btn-secondary flex-1 sm:flex-none" onClick={onClose}>{t.common.cancel}</button>
        <button type="button" className={`${danger ? 'btn-danger-solid' : 'btn-primary'} flex-1 sm:flex-none`} onClick={() => { onConfirm(); onClose() }}>{confirmLabel}</button>
      </>}>
      {body && <p className="text-sm text-slate-600">{body}</p>}
    </Sheet>
  )
}

export interface MenuItem { label: string; icon?: ReactNode; onClick: () => void; danger?: boolean; hidden?: boolean; testId?: string; checked?: boolean }
/** Overflow (⋯) menu: popover with role=menu, arrow-key navigation, closes on outside tap / Esc / selection. */
export function Menu({ label, items, icon, buttonClassName = 'btn-ghost btn-icon', align = 'end', testId, children }: { label: string; items: MenuItem[]; icon?: ReactNode; buttonClassName?: string; align?: 'start' | 'end'; testId?: string; children?: ReactNode }) {
  const [open, setOpen] = useState(false)
  const root = useRef<HTMLDivElement>(null)
  const btn = useRef<HTMLButtonElement>(null)
  const list = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!open) return
    const onDown = (e: PointerEvent) => { if (!root.current?.contains(e.target as Node)) setOpen(false) }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { setOpen(false); btn.current?.focus() }
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault()
        const els = [...(list.current?.querySelectorAll<HTMLElement>('[role^=menuitem]') ?? [])]
        const i = els.indexOf(document.activeElement as HTMLElement)
        els[(i + (e.key === 'ArrowDown' ? 1 : -1) + els.length) % els.length]?.focus()
      }
    }
    document.addEventListener('pointerdown', onDown); document.addEventListener('keydown', onKey)
    requestAnimationFrame(() => list.current?.querySelector<HTMLElement>('[role^=menuitem]')?.focus())
    return () => { document.removeEventListener('pointerdown', onDown); document.removeEventListener('keydown', onKey) }
  }, [open])
  const shown = items.filter((i) => !i.hidden)
  return (
    <div ref={root} className="relative">
      <button ref={btn} type="button" aria-haspopup="menu" aria-expanded={open} aria-label={label} title={label} data-testid={testId} className={buttonClassName} onClick={() => setOpen((o) => !o)}>
        {children ?? icon ?? <EllipsisVertical size={20} />}
      </button>
      {open && (
        <div ref={list} role="menu" aria-label={label} className={`absolute top-full z-40 mt-1 w-max max-w-[min(20rem,calc(100vw-2rem))] min-w-56 animate-pop-in rounded-lg border border-slate-200 bg-white p-1 shadow-[var(--shadow-float)] ${align === 'end' ? 'end-0' : 'start-0'}`}>
          {shown.map((it) => (
            <button key={it.label} type="button" role={it.checked != null ? 'menuitemcheckbox' : 'menuitem'} aria-checked={it.checked} data-testid={it.testId}
              className={`flex min-h-11 w-full items-center gap-3 rounded-md px-3 text-start text-sm font-medium focus-visible:outline-none ${it.danger ? 'text-red-700 hover:bg-red-50 focus-visible:bg-red-50' : 'text-slate-800 hover:bg-slate-100 focus-visible:bg-slate-100'}`}
              onClick={() => { setOpen(false); it.onClick() }}>
              {it.icon && <span className="shrink-0 text-slate-500">{it.icon}</span>}
              <span className="min-w-0 flex-1">{it.label}</span>
              {it.checked != null && <span className={`h-5 w-9 shrink-0 rounded-full p-0.5 transition ${it.checked ? 'bg-brand-600' : 'bg-slate-300'}`}><span className={`block size-4 rounded-full bg-white transition ${it.checked ? 'translate-x-4 rtl:-translate-x-4' : ''}`} /></span>}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

/** Toast/snackbar stack (role=status). `raised` lifts it above the wizard's bottom action bar. */
export function Toaster({ raised }: { raised: boolean }) {
  const { t } = useT()
  const toasts = useToast((s) => s.toasts)
  const dismiss = useToast((s) => s.dismiss)
  return (
    <div role="status" aria-live="polite" className={`pointer-events-none fixed start-0 end-0 z-[60] flex flex-col items-center gap-2 px-4 lg:start-60 lg:items-end lg:px-8 ${raised ? 'bottom-[calc(env(safe-area-inset-bottom)+5.25rem)]' : 'bottom-[calc(env(safe-area-inset-bottom)+1rem)]'}`}>
      {toasts.map((x) => (
        <div key={x.id} data-testid="toast" className={`pointer-events-auto flex w-full max-w-md animate-sheet-up items-center gap-2 rounded-lg px-4 py-2 text-sm text-white shadow-[var(--shadow-float)] ${x.tone === 'err' ? 'bg-red-700' : 'bg-slate-900'}`}>
          <span className="min-w-0 flex-1 py-1.5">{x.message}</span>
          {x.action && <button type="button" className="min-h-10 shrink-0 rounded-md px-2 font-semibold text-brand-200 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white" onClick={() => { x.action!.run(); dismiss(x.id) }}>{x.action.label}</button>}
          <button type="button" aria-label={t.common.close} className="-me-2 grid size-11 shrink-0 place-items-center rounded-md text-slate-300 hover:text-white" onClick={() => dismiss(x.id)}><X size={16} /></button>
        </div>
      ))}
    </div>
  )
}
