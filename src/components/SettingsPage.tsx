import { useRef } from 'react'
import { Upload, X, Sun, CloudCheck } from 'lucide-react'
import { useAppStore } from '../store/useAppStore'
import { useT } from '../i18n'
import { Field, NumberInput, Section } from './ui'
import { currencies, currencyName, defaultFx } from '../data/currencies'
import { locations } from '../data/locations'
import { placeName } from '../i18n/places'
import { companyTitle } from '../i18n/labels'

export function SettingsPage() {
  const { t, lang } = useT()
  const company = useAppStore((s) => s.company)
  const setCompany = useAppStore((s) => s.setCompany)
  const fileRef = useRef<HTMLInputElement>(null)
  const onLogo = (f: File) => { const r = new FileReader(); r.onload = () => setCompany({ logoDataUrl: String(r.result) }); r.readAsDataURL(f) }
  const name = companyTitle(company.name) ?? t.settings.defaultName
  const local = company.currency && company.currency !== 'USD'
  const sortedLocs = [...locations].sort((a, b) => placeName(a, lang).localeCompare(placeName(b, lang), lang))
  return (
    <div className="mx-auto max-w-3xl space-y-4 sm:space-y-5">
      <div>
        <h1 className="text-display text-slate-900">{t.settings.title}</h1>
        <p className="mt-1 inline-flex items-center gap-1.5 text-sm text-slate-500"><CloudCheck size={16} />{t.settings.autoSave}</p>
      </div>

      <Section title={t.settings.brand}>
        <div className="mb-5 overflow-hidden rounded-xl border border-slate-200" aria-label={t.settings.preview}>
          <div className="flex items-center gap-3 px-4 py-3 text-white" style={{ background: company.primaryColor }}>
            {company.logoDataUrl ? <img src={company.logoDataUrl} alt={t.settings.logo} className="h-10 w-auto max-w-28 rounded bg-white object-contain p-1" /> : <span className="grid size-10 place-items-center rounded bg-white/20"><Sun size={22} /></span>}
            <div className="min-w-0"><p className="truncate font-semibold"><bdi>{name}</bdi></p><p className="truncate text-xs opacity-90"><bdi>{company.tagline || t.settings.defaultTagline}</bdi></p></div>
          </div>
          <p className="bg-slate-50 px-4 py-1.5 text-xs text-slate-500">{t.settings.preview}</p>
        </div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label={t.settings.company}><input className="input" dir="auto" value={company.name} placeholder={t.settings.defaultName} onChange={(e) => setCompany({ name: e.target.value })} /></Field>
          <Field label={t.settings.tagline}><input className="input" dir="auto" value={company.tagline} onChange={(e) => setCompany({ tagline: e.target.value })} /></Field>
          <Field label={t.settings.phone}><input className="input" type="tel" dir="ltr" inputMode="tel" autoComplete="tel" value={company.phone} onChange={(e) => setCompany({ phone: e.target.value })} /></Field>
          <Field label={t.settings.email}><input className="input" type="email" dir="ltr" inputMode="email" autoComplete="email" value={company.email} onChange={(e) => setCompany({ email: e.target.value })} /></Field>
          <Field label={t.settings.website}><input className="input" type="url" dir="ltr" inputMode="url" autoComplete="url" value={company.website} onChange={(e) => setCompany({ website: e.target.value })} /></Field>
          <Field label={t.settings.address}><input className="input" dir="auto" value={company.address} onChange={(e) => setCompany({ address: e.target.value })} /></Field>
          <Field label={t.settings.color} as="div">
            <div className="flex items-center gap-2">
              <input type="color" className="size-11 shrink-0 cursor-pointer rounded-lg border border-slate-300 bg-white p-1" value={company.primaryColor} aria-label={t.settings.color} onChange={(e) => setCompany({ primaryColor: e.target.value })} />
              <input className="input" dir="ltr" value={company.primaryColor} aria-label={t.settings.colorHex} onChange={(e) => /^#[0-9a-fA-F]{0,6}$/.test(e.target.value) && setCompany({ primaryColor: e.target.value })} />
            </div>
          </Field>
          <Field label={t.settings.logo} as="div">
            <div className="flex flex-wrap items-center gap-2">
              {company.logoDataUrl && <img src={company.logoDataUrl} alt={t.settings.logo} className="h-11 rounded border border-slate-200 bg-white p-1" />}
              <input ref={fileRef} type="file" accept="image/png,image/jpeg" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) onLogo(f); e.target.value = '' }} />
              <button type="button" className="btn-secondary" onClick={() => fileRef.current?.click()}><Upload size={18} />{t.settings.upload}</button>
              {company.logoDataUrl && <button type="button" className="btn-ghost" onClick={() => setCompany({ logoDataUrl: null })}><X size={18} />{t.settings.remove}</button>}
            </div>
          </Field>
        </div>
      </Section>

      <Section title={t.settings.quoteDefaults} description={t.settings.quoteDefaultsHelp}>
        <div className="grid grid-cols-2 gap-x-3 gap-y-4 sm:gap-x-4">
          <Field label={t.settings.currency} className={`col-span-2 ${local ? 'sm:col-span-1' : ''}`}>
            <select className="input" value={company.currency || 'USD'} onChange={(e) => setCompany({ currency: e.target.value, fxRateToUsd: e.target.value === 'USD' ? 1 : defaultFx(e.target.value) })} data-testid="settings-currency">
              {currencies.map((c) => <option key={c.code} value={c.code}>{`${c.code} — ${currencyName(c.code, lang)}`}</option>)}
            </select>
          </Field>
          {local && (
            <Field label={`${t.settings.fx} · ${t.site.fxLabel(company.currency)}`} className="col-span-2 sm:col-span-1" help={t.site.fxIndicative}>
              <NumberInput value={company.fxRateToUsd} min={0.0001} onChange={(v) => v && v > 0 && setCompany({ fxRateToUsd: v })} suffix={company.currency} />
            </Field>
          )}
          <Field label={t.settings.margin}><NumberInput value={company.marginPct} min={0} max={300} onChange={(v) => setCompany({ marginPct: v ?? 0 })} suffix="%" /></Field>
          <Field label={t.settings.vat}><NumberInput value={company.vatPct} min={0} max={50} onChange={(v) => setCompany({ vatPct: v ?? 0 })} suffix="%" /></Field>
          <Field label={t.settings.validity}><NumberInput integer value={company.quoteValidityDays} min={1} max={365} onChange={(v) => setCompany({ quoteValidityDays: v ?? 30 })} /></Field>
          <Field label={t.settings.location} className="col-span-2">
            <select className="input" value={company.defaultLocationId} onChange={(e) => setCompany({ defaultLocationId: e.target.value })}>
              {sortedLocs.map((l) => <option key={l.id} value={l.id}>{placeName(l, lang)}</option>)}
            </select>
          </Field>
        </div>
      </Section>

      <Section title={t.settings.terms}>
        <textarea className="input min-h-36" dir="auto" aria-label={t.settings.terms} value={company.terms} onChange={(e) => setCompany({ terms: e.target.value })} />
      </Section>

      <Section title={t.settings.about}>
        <p className="text-sm text-slate-600"><bdi>{t.appName}</bdi> · <bdi>{t.settings.version(__APP_VERSION__)}</bdi></p>
        <p className="mt-1 text-sm text-slate-600"><bdi>{t.by}</bdi></p>
      </Section>
    </div>
  )
}
