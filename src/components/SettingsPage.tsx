import { useRef } from 'react'
import { Upload, X } from 'lucide-react'
import { useAppStore } from '../store/useAppStore'
import { useT } from '../i18n'
import { Field, NumberInput, Section } from './ui'

export function SettingsPage() {
  const { t } = useT()
  const { company, setCompany } = useAppStore()
  const fileRef = useRef<HTMLInputElement>(null)
  const onLogo = (f: File) => { const r = new FileReader(); r.onload = () => setCompany({ logoDataUrl: String(r.result) }); r.readAsDataURL(f) }
  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <h1 className="text-2xl font-bold text-slate-900">{t.settings.title}</h1>
      <Section title={t.settings.company}>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={t.settings.company}><input className="input" value={company.name} onChange={(e) => setCompany({ name: e.target.value })} /></Field>
          <Field label={t.settings.tagline}><input className="input" value={company.tagline} onChange={(e) => setCompany({ tagline: e.target.value })} /></Field>
          <Field label={t.settings.phone}><input className="input" value={company.phone} onChange={(e) => setCompany({ phone: e.target.value })} /></Field>
          <Field label={t.settings.email}><input className="input" value={company.email} onChange={(e) => setCompany({ email: e.target.value })} /></Field>
          <Field label={t.settings.website}><input className="input" value={company.website} onChange={(e) => setCompany({ website: e.target.value })} /></Field>
          <Field label={t.settings.address}><input className="input" value={company.address} onChange={(e) => setCompany({ address: e.target.value })} /></Field>
          <Field label={t.settings.color}><input type="color" className="input h-10 p-1" value={company.primaryColor} onChange={(e) => setCompany({ primaryColor: e.target.value })} /></Field>
          <Field label={t.settings.validity}><NumberInput value={company.quoteValidityDays} onChange={(v) => setCompany({ quoteValidityDays: v ?? 30 })} min={1} /></Field>
          <Field label={t.settings.logo} className="sm:col-span-2">
            <div className="flex items-center gap-3">
              {company.logoDataUrl && <img src={company.logoDataUrl} alt="logo" className="h-14 rounded border border-slate-200 bg-white p-1" />}
              <input ref={fileRef} type="file" accept="image/png,image/jpeg" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) onLogo(f); e.target.value = '' }} />
              <button className="btn-secondary" onClick={() => fileRef.current?.click()}><Upload size={16} />{t.settings.upload}</button>
              {company.logoDataUrl && <button className="btn-ghost" onClick={() => setCompany({ logoDataUrl: null })}><X size={16} />{t.settings.remove}</button>}
            </div>
          </Field>
          <Field label={t.settings.terms} className="sm:col-span-2"><textarea className="input min-h-28" value={company.terms} onChange={(e) => setCompany({ terms: e.target.value })} /></Field>
        </div>
      </Section>
    </div>
  )
}
