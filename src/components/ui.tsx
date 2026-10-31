import { useId, useState, type ReactNode, type KeyboardEvent, type ComponentType } from 'react'
import { ChevronDown, Minus, Plus } from 'lucide-react'
import { useT } from '../i18n'
import { fmt } from '../engine/format'

/* ------------------------------------------------------------------ helpers */


/** Spec line made of separate parts ("8 kW · hybrid · 2 MPPT"): each part is a bidi island, so the list reads in the UI direction. */
export function Parts({ parts, className = '' }: { parts: (string | null | undefined | false)[]; className?: string }) {
  const xs = parts.filter(Boolean) as string[]
  return <span className={className}>{xs.map((x, i) => <span key={i}>{i > 0 && ' · '}<bdi>{x}</bdi></span>)}</span>
}

/* ------------------------------------------------------------------ form fields */

export function Field({ label, help, error, children, className = '', as = 'label' }: { label: ReactNode; help?: ReactNode; error?: ReactNode; children: ReactNode; className?: string; as?: 'label' | 'div' }) {
  const Tag = as
  return (
    <Tag className={`block min-w-0 ${className}`}>
      <span className="label">{label}</span>
      {children}
      {error ? <span className="error-text" role="alert">{error}</span> : help ? <span className="help">{help}</span> : null}
    </Tag>
  )
}

const DIGITS_AR = /[٠-٩]/g, DIGITS_FA = /[۰-۹]/g
const normalizeNum = (s: string) => s.replace(DIGITS_AR, (d) => String(d.charCodeAt(0) - 0x660)).replace(DIGITS_FA, (d) => String(d.charCodeAt(0) - 0x6f0))
  .replace(/[٫,]/g, '.').replace(/[−–—]/g, '-').replace(/\s+/g, '')
const show = (n: number | null | undefined) => (n == null || !Number.isFinite(n) ? '' : String(Number(n.toPrecision(12))))
const parseDraft = (s: string): number | null => (s === '' || s === '-' || s === '.' || s === '-.' ? null : Number.isFinite(Number(s)) ? Number(s) : null)

export interface NumberInputProps {
  value: number | null; onChange: (v: number | null) => void
  min?: number; max?: number; step?: number; placeholder?: string; suffix?: ReactNode
  allowEmpty?: boolean; allowNegative?: boolean; integer?: boolean; stepper?: boolean
  className?: string; quiet?: boolean; id?: string; disabled?: boolean; invalid?: boolean; align?: 'start' | 'end'
  'aria-label'?: string; 'data-testid'?: string
}
/**
 * Numeric field that keeps a text draft while focused: no forced 0 when cleared, no "025", minus sign allowed, Arabic digits and
 * comma decimals accepted, clamps to min/max on blur (and says so). `allowNegative` adds a ± key (iOS decimal pads have no minus);
 * `stepper` adds −/+ buttons.
 */
export function NumberInput({ value, onChange, min, max, step = 1, placeholder, suffix, allowEmpty = false, allowNegative = false, integer = false, stepper = false,
  className = '', quiet = false, id, disabled, invalid, align = 'start', ...rest }: NumberInputProps) {
  const { t, dir } = useT()
  const [draft, setDraft] = useState<string | null>(null)
  const [note, setNote] = useState<string | null>(null)
  const errId = useId()
  const neg = allowNegative || (min != null && min < 0)
  const re = integer ? (neg ? /^-?\d*$/ : /^\d*$/) : neg ? /^-?\d*\.?\d*$/ : /^\d*\.?\d*$/
  const rangeMsg = min != null && max != null ? t.common.between(fmt(min, decimalsOf(min)), fmt(max, decimalsOf(max))) : min != null ? t.common.atLeast(fmt(min, decimalsOf(min))) : max != null ? t.common.atMost(fmt(max, decimalsOf(max))) : t.common.notNumber
  const clamp = (n: number) => { let c = integer ? Math.round(n) : n; if (min != null && c < min) c = min; if (max != null && c > max) c = max; return c }

  const typed = (raw: string) => {
    const s = normalizeNum(raw)
    if (!re.test(s)) return
    setDraft(s)
    const n = parseDraft(s)
    if (n == null) { setNote(null); return }
    if (max != null && n > max) { setNote(rangeMsg); return }
    if (min != null && n < min) { setNote(null); return } // may still become valid while typing; clamped on blur
    setNote(null)
    if (n !== value) onChange(n)
  }
  const commit = () => {
    const s = draft ?? show(value)
    setDraft(null)
    const n = parseDraft(s)
    if (n == null) { setNote(null); if (s === '' && allowEmpty && value !== null) onChange(null); return } // empty → revert (or clear when allowed)
    const c = clamp(n)
    setNote(c !== n ? rangeMsg : null)
    if (c !== value) onChange(c)
  }
  const nudge = (d: number) => {
    const base = parseDraft(draft ?? show(value)) ?? (min ?? 0)
    const c = clamp(Math.round((base + d) * 1e6) / 1e6)
    setNote(null); if (draft != null) setDraft(show(c)); if (c !== value) onChange(c)
  }
  const flip = () => {
    if (draft != null) typed(draft.startsWith('-') ? draft.slice(1) : '-' + draft)
    else if (value != null) { const c = clamp(-value); if (c !== value) onChange(c) }
  }
  const hold = (e: { preventDefault: () => void }) => e.preventDefault() // keep focus in the field while tapping adornments
  const isInvalid = !!note || !!invalid

  return (
    <div className={`min-w-0 ${className}`}>
      <div className={`input-group ${quiet ? 'quiet' : ''}`}>
        <input {...rest} id={id} type="text" inputMode="decimal" autoComplete="off" dir="ltr" disabled={disabled}
          className={stepper ? 'px-1 text-center' : (align === 'end') !== (dir === 'rtl') ? 'text-right' : 'text-left'}
          value={draft ?? show(value)} placeholder={placeholder}
          aria-invalid={isInvalid || undefined} aria-describedby={note ? errId : undefined}
          onFocus={(e) => { const init = show(value); setDraft(init); setNote(null); const el = e.currentTarget; requestAnimationFrame(() => { try { if (document.activeElement === el && el.value === init) el.select() } catch { /* ignore */ } }) }}
          onChange={(e) => typed(e.target.value)} onBlur={commit}
          onKeyDown={(e) => { if (e.key === 'Enter') (e.currentTarget as HTMLInputElement).blur(); else if (e.key === 'ArrowUp') { e.preventDefault(); nudge(step) } else if (e.key === 'ArrowDown') { e.preventDefault(); nudge(-step) } }} />
        {suffix != null && suffix !== '' && <span className="adorn" aria-hidden="true">{suffix}</span>}
        {neg && <button type="button" className="adorn-btn border-s border-slate-200" aria-label={t.common.toggleSign} title={t.common.toggleSign} disabled={disabled} onPointerDown={hold} onClick={flip}>±</button>}
        {stepper && <button type="button" className="adorn-btn order-first border-e border-slate-200" aria-label={t.loads.decrease} disabled={disabled || (min != null && (value ?? 0) <= min)} onPointerDown={hold} onClick={() => nudge(-step)}><Minus size={16} /></button>}
        {stepper && <button type="button" className="adorn-btn border-s border-slate-200" aria-label={t.loads.increase} disabled={disabled || (max != null && (value ?? 0) >= max)} onPointerDown={hold} onClick={() => nudge(step)}><Plus size={16} /></button>}
      </div>
      {note && <span id={errId} className="error-text">{note}</span>}
    </div>
  )
}
const decimalsOf = (n: number) => (Number.isInteger(n) ? 0 : Math.min(3, String(n).split('.')[1]?.length ?? 0))

/* ------------------------------------------------------------------ layout */

export function Section({ title, description, children, right, className = '', id, flush = false }: { title?: ReactNode; description?: ReactNode; children: ReactNode; right?: ReactNode; className?: string; id?: string; flush?: boolean }) {
  const hid = useId()
  return (
    <section id={id} aria-labelledby={title ? hid : undefined} className={`card min-w-0 ${flush ? 'overflow-hidden' : 'p-4 sm:p-5'} ${className}`}>
      {(title || right) && (
        <div className={`flex flex-wrap items-start justify-between gap-x-4 gap-y-2 ${flush ? 'px-4 pt-4 pb-3 sm:px-5 sm:pt-5' : 'mb-4'}`}>
          <div className="min-w-0">
            {title && <h3 id={hid} className="card-title">{title}</h3>}
            {description && <p className="mt-0.5 text-sm text-slate-500">{description}</p>}
          </div>
          {right && <div className="flex flex-wrap items-center gap-2">{right}</div>}
        </div>
      )}
      {children}
    </section>
  )
}

export function Stat({ label, value, sub, unit, tone = 'default', className = '' }: { label: ReactNode; value: ReactNode; sub?: ReactNode; unit?: ReactNode; tone?: 'default' | 'brand' | 'warn' | 'err'; className?: string }) {
  const cls = tone === 'brand' ? 'stat-hero' : tone === 'warn' ? 'stat border-amber-200 bg-amber-50' : tone === 'err' ? 'stat border-red-200 bg-red-50' : 'stat'
  return (
    <div className={`${cls} ${className}`}>
      <div className="stat-value"><bdi>{value}{unit != null && <span className="ms-1 text-[0.8125rem] font-medium text-slate-500">{unit}</span>}</bdi></div>
      <div className="stat-label">{label}</div>
      {sub && <div className="stat-sub"><bdi>{sub}</bdi></div>}
    </div>
  )
}
export const Kpi = Stat

export function Badge({ level, children }: { level: 'ok' | 'warn' | 'error' | 'neutral' | 'info'; children: ReactNode }) {
  const cls = level === 'ok' ? 'badge-ok' : level === 'warn' ? 'badge-warn' : level === 'error' ? 'badge-err' : level === 'info' ? 'badge-info' : 'badge-neutral'
  return <span className={cls}>{children}</span>
}

/* ------------------------------------------------------------------ toggles & choices */

/** Accessible switch (role=switch, keyboard operable). */
export function Switch({ checked, onChange, label, help, className = '', disabled, 'data-testid': testId }: { checked: boolean; onChange: (v: boolean) => void; label?: ReactNode; help?: ReactNode; className?: string; disabled?: boolean; 'data-testid'?: string }) {
  return (
    <button type="button" role="switch" aria-checked={checked} disabled={disabled} data-testid={testId} onClick={() => onChange(!checked)}
      className={`group inline-flex min-h-11 max-w-full items-center gap-3 rounded-lg text-start focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2 disabled:opacity-50 ${className}`}>
      <span className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors ${checked ? 'bg-brand-600' : 'bg-slate-300'}`}>
        <span className={`absolute top-0.5 size-5 rounded-full bg-white shadow transition-[inset-inline-start] ${checked ? 'start-[1.375rem]' : 'start-0.5'}`} />
      </span>
      {label != null && <span className="min-w-0 text-sm font-medium text-slate-800">{label}{help && <span className="mt-0.5 block text-xs font-normal text-slate-500">{help}</span>}</span>}
    </button>
  )
}
/** @deprecated kept for older call sites — same as Switch. */
export const Toggle = Switch

function arrowNav(e: KeyboardEvent<HTMLElement>, dir: 'ltr' | 'rtl') {
  const keys = dir === 'rtl' ? { next: ['ArrowDown', 'ArrowLeft'], prev: ['ArrowUp', 'ArrowRight'] } : { next: ['ArrowDown', 'ArrowRight'], prev: ['ArrowUp', 'ArrowLeft'] }
  const d = keys.next.includes(e.key) ? 1 : keys.prev.includes(e.key) ? -1 : 0
  if (!d) return
  e.preventDefault()
  const items = [...(e.currentTarget.parentElement?.querySelectorAll<HTMLElement>('[role=radio],[role=tab]') ?? [])]
  const i = items.indexOf(e.currentTarget)
  const nx = items[(i + d + items.length) % items.length]
  nx?.focus(); nx?.click()
}

/** Radio cards (role=radiogroup). */
export function Choice<T extends string>({ options, value, onChange, label, columns = 'sm:grid-cols-3' }: { options: { value: T; label: ReactNode; help?: ReactNode; icon?: ReactNode }[]; value: T; onChange: (v: T) => void; label?: string; columns?: string }) {
  const { dir } = useT()
  return (
    <div role="radiogroup" aria-label={label} className={`grid gap-2 ${columns}`}>
      {options.map((o) => {
        const on = value === o.value
        return (
          <button type="button" role="radio" aria-checked={on} tabIndex={on ? 0 : -1} key={o.value} onClick={() => onChange(o.value)} onKeyDown={(e) => arrowNav(e, dir)}
            className={`flex min-h-11 items-start gap-3 rounded-xl border p-3 text-start transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 ${on ? 'border-brand-600 bg-brand-50 ring-1 ring-brand-600' : 'border-slate-200 bg-white hover:border-slate-300'}`}>
            <span className={`mt-0.5 grid size-5 shrink-0 place-items-center rounded-full border-2 ${on ? 'border-brand-700' : 'border-slate-300'}`}>{on && <span className="size-2.5 rounded-full bg-brand-700" />}</span>
            <span className="min-w-0">
              <span className="block text-sm font-semibold text-slate-900">{o.label}</span>
              {o.help && <span className="mt-0.5 block text-xs leading-5 text-slate-600">{o.help}</span>}
            </span>
          </button>
        )
      })}
    </div>
  )
}
export const RadioCards = Choice

/** Segmented control: role=radiogroup (settings) or role=tablist (views). */
export function Segmented<T extends string>({ options, value, onChange, label, kind = 'radio', className = '', full = false }: { options: { value: T; label: ReactNode; icon?: ReactNode; testId?: string }[]; value: T; onChange: (v: T) => void; label: string; kind?: 'radio' | 'tab'; className?: string; full?: boolean }) {
  const { dir } = useT()
  return (
    <div role={kind === 'tab' ? 'tablist' : 'radiogroup'} aria-label={label} className={`inline-flex max-w-full items-center gap-1 rounded-lg bg-slate-100 p-1 ${full ? 'w-full' : ''} ${className}`}>
      {options.map((o) => {
        const on = value === o.value
        return (
          <button key={o.value} type="button" role={kind} aria-checked={kind === 'radio' ? on : undefined} aria-selected={kind === 'tab' ? on : undefined} tabIndex={on ? 0 : -1} data-testid={o.testId}
            onClick={() => onChange(o.value)} onKeyDown={(e) => arrowNav(e, dir)}
            className={`inline-flex min-h-10 min-w-0 items-center justify-center gap-1.5 rounded-md px-3 text-sm font-medium whitespace-nowrap transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 ${full ? 'flex-1' : ''} ${on ? 'bg-white text-slate-900 shadow-sm ring-1 ring-slate-200' : 'text-slate-600 hover:text-slate-900'}`}>
            {o.icon}<span className="truncate">{o.label}</span>
          </button>
        )
      })}
    </div>
  )
}

/* ------------------------------------------------------------------ disclosure & empty states */

export function Disclosure({ title, description, children, defaultOpen = false, className = '', testId }: { title: ReactNode; description?: ReactNode; children: ReactNode; defaultOpen?: boolean; className?: string; testId?: string }) {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <details className={`disclosure ${className}`} open={open} data-testid={testId} onToggle={(e) => setOpen((e.currentTarget as HTMLDetailsElement).open)}>
      <summary>
        <span className="min-w-0"><span className="block">{title}</span>{description && <span className="block text-xs font-normal text-slate-500">{description}</span>}</span>
        <ChevronDown size={18} className="disclosure-chevron shrink-0 text-slate-500 transition-transform" />
      </summary>
      <div className="pt-2">{children}</div>
    </details>
  )
}

export function EmptyState({ icon: Icon, title, body, children, className = '' }: { icon?: ComponentType<{ size?: number; className?: string }>; title: ReactNode; body?: ReactNode; children?: ReactNode; className?: string }) {
  return (
    <div className={`card flex flex-col items-center px-6 py-10 text-center ${className}`}>
      {Icon && <span className="mb-3 grid size-12 place-items-center rounded-full bg-slate-100 text-slate-500"><Icon size={24} /></span>}
      <h3 className="card-title">{title}</h3>
      {body && <p className="mt-1 max-w-md text-sm text-slate-600">{body}</p>}
      {children && <div className="mt-5 flex flex-wrap justify-center gap-2">{children}</div>}
    </div>
  )
}
export function Empty({ children }: { children: ReactNode }) {
  return <div className="rounded-xl border border-dashed border-slate-300 p-6 text-center text-sm text-slate-600">{children}</div>
}

export function IconButton({ label, children, className = 'btn-ghost', onClick, disabled, 'data-testid': testId }: { label: string; children: ReactNode; className?: string; onClick?: () => void; disabled?: boolean; 'data-testid'?: string }) {
  return <button type="button" aria-label={label} title={label} className={`${className} btn-icon`} onClick={onClick} disabled={disabled} data-testid={testId}>{children}</button>
}
