import type { ReactNode } from 'react'

export function Field({ label, help, children, className = '' }: { label: ReactNode; help?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <label className={`block ${className}`}>
      <span className="label">{label}</span>
      {children}
      {help && <span className="mt-1 block text-xs text-slate-500">{help}</span>}
    </label>
  )
}
export function NumberInput({ value, onChange, step = 1, min, max, placeholder, suffix, allowEmpty = false, className = '' }:
  { value: number | null; onChange: (v: number | null) => void; step?: number; min?: number; max?: number; placeholder?: string; suffix?: string; allowEmpty?: boolean; className?: string }) {
  return (
    <div className={`relative ${className}`}>
      <input type="number" inputMode="decimal" className={`input ${suffix ? 'pe-12' : ''}`} value={value ?? ''} step={step} min={min} max={max} placeholder={placeholder}
        onChange={(e) => { const v = e.target.value; if (v === '') return onChange(allowEmpty ? null : 0); const n = Number(v); if (Number.isFinite(n)) onChange(n) }} />
      {suffix && <span className="pointer-events-none absolute inset-y-0 end-3 flex items-center text-xs text-slate-400">{suffix}</span>}
    </div>
  )
}
export function Section({ title, children, right, className = '' }: { title: ReactNode; children: ReactNode; right?: ReactNode; className?: string }) {
  return (
    <section className={`card p-5 ${className}`}>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2"><h3 className="text-base font-semibold text-slate-900">{title}</h3>{right}</div>
      {children}
    </section>
  )
}
export function Stat({ label, value, sub, tone = 'default' }: { label: ReactNode; value: ReactNode; sub?: ReactNode; tone?: 'default' | 'brand' | 'warn' | 'err' }) {
  const ring = tone === 'brand' ? 'border-brand-200 bg-brand-50' : tone === 'warn' ? 'border-amber-200 bg-amber-50' : tone === 'err' ? 'border-red-200 bg-red-50' : ''
  return (
    <div className={`stat ${ring}`}>
      <div className="stat-value">{value}</div>
      <div className="text-sm font-medium text-slate-700">{label}</div>
      {sub && <div className="stat-label">{sub}</div>}
    </div>
  )
}
export function Badge({ level, children }: { level: 'ok' | 'warn' | 'error'; children: ReactNode }) {
  const cls = level === 'ok' ? 'badge-ok' : level === 'warn' ? 'badge-warn' : 'badge-err'
  return <span className={cls}>{children}</span>
}
export function Toggle({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label?: ReactNode }) {
  return (
    <label className="inline-flex cursor-pointer items-center gap-2 text-sm" onClick={() => onChange(!checked)}>
      <span className={`relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition ${checked ? 'bg-brand-600' : 'bg-slate-300'}`}>
        <span className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition ${checked ? 'translate-x-4 rtl:-translate-x-4' : 'translate-x-0.5 rtl:-translate-x-0.5'}`} />
      </span>
      {label && <span>{label}</span>}
    </label>
  )
}
export function Choice<T extends string>({ options, value, onChange }: { options: { value: T; label: ReactNode; help?: ReactNode }[]; value: T; onChange: (v: T) => void }) {
  return (
    <div className="grid gap-2 sm:grid-cols-3">
      {options.map((o) => (
        <button type="button" key={o.value} onClick={() => onChange(o.value)}
          className={`rounded-xl border p-3 text-start transition ${value === o.value ? 'border-brand-600 bg-brand-50 ring-2 ring-brand-200' : 'border-slate-200 bg-white hover:border-slate-300'}`}>
          <div className="text-sm font-semibold text-slate-900">{o.label}</div>
          {o.help && <div className="mt-1 text-xs text-slate-500">{o.help}</div>}
        </button>
      ))}
    </div>
  )
}
export function Empty({ children }: { children: ReactNode }) {
  return <div className="rounded-xl border border-dashed border-slate-300 p-8 text-center text-sm text-slate-500">{children}</div>
}
