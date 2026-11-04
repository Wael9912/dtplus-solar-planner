import { useMemo, useRef, useState, type ReactNode } from 'react'
import { Upload, X, Sun, CloudCheck, Tags, ChevronRight, ChevronLeft, FileDown, FileUp, DatabaseBackup, ArchiveRestore, RefreshCw } from 'lucide-react'
import { useAppStore, type Backup, type CompanyBundle } from '../store/useAppStore'
import { useT } from '../i18n'
import { Field, NumberInput, Section, Segmented } from './ui'
import { ConfirmDialog } from './overlay'
import { currencies, currencyName, defaultFx } from '../data/currencies'
import { locations } from '../data/locations'
import { placeName } from '../i18n/places'
import { companyTitle, fmtDate } from '../i18n/labels'
import { en as EN } from '../i18n/en'
import { ar as AR } from '../i18n/ar'
import { normalizePriceBook, resolveCatalog } from '../engine/catalogContext'
import { fxOf, money } from '../engine/format'
import { download } from '../export/download'
import { toast } from '../store/useToast'
import { checkForUpdate } from '../updates'
import type { PriceBook, Phase, SystemType } from '../engine/types'
import { InstallSetting } from './InstallApp'
import { shrinkLogo } from './logo'

/** Edited prices (catalogue products), not-stocked products and own products of a price list. */
function bookCounts(b: PriceBook) {
  const r = resolveCatalog(b)
  const own = b.custom.panels.length + b.custom.batteries.length + b.custom.inverters.length + b.custom.chargeControllers.length + b.custom.items.length
  const ownIds = new Set([...b.custom.panels, ...b.custom.batteries, ...b.custom.inverters, ...b.custom.chargeControllers, ...b.custom.items].map((x) => x.id))
  return { edited: Object.keys(b.prices).filter((id) => r.basePrice.has(id) && !ownIds.has(id)).length, hidden: b.hidden.filter((id) => r.basePrice.has(id)).length, own }
}
const fileSafe = (s: string) => s.trim().replace(/[^\w\u0600-\u06FF-]+/g, '-').replace(/^-+|-+$/g, '') || 'dtplus'
const today = () => new Date().toISOString().slice(0, 10)
/** A picked JSON file waiting for the user's confirmation. */
type Pending = { kind: 'company'; data: CompanyBundle; name: string } | { kind: 'backup'; data: Backup | CompanyBundle; name: string; projects: number; company: boolean }

export function SettingsPage() {
  const { t, lang, dir } = useT()
  const tp = t.prices
  const company = useAppStore((s) => s.company)
  const setCompany = useAppStore((s) => s.setCompany)
  const projectCount = useAppStore((s) => s.projects.length)
  const setView = useAppStore((s) => s.setView)
  const fileRef = useRef<HTMLInputElement>(null)
  const companyFileRef = useRef<HTMLInputElement>(null)
  const backupFileRef = useRef<HTMLInputElement>(null)
  const [pending, setPending] = useState<Pending | null>(null)
  const [checking, setChecking] = useState(false)
  const counts = useMemo(() => bookCounts(company.priceBook), [company.priceBook])
  const fx = fxOf(company)
  const localHint = (usd: number) => (company.currency && company.currency !== 'USD' ? tp.approx(money(usd, company.currency, fx)) : undefined)
  const Chevron = dir === 'rtl' ? ChevronLeft : ChevronRight
  const baseName = fileSafe(companyTitle(company.name) ?? 'dtplus')

  const saveJson = (data: unknown, name: string) => {
    download(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }), name)
    toast({ message: tp.file.exported(name), tone: 'ok' })
  }
  const readJson = async (f: File): Promise<unknown> => { try { return JSON.parse(await f.text()) } catch { return null } }
  const isObj = (x: unknown): x is Record<string, unknown> => !!x && typeof x === 'object' && !Array.isArray(x)
  const onCompanyFile = async (f: File) => {
    const x = await readJson(f)
    if (!isObj(x) || x.kind !== 'dtplus-company' || !isObj(x.company)) { toast({ message: tp.file.importError, tone: 'err' }); return }
    setPending({ kind: 'company', data: x as unknown as CompanyBundle, name: f.name })
  }
  const onBackupFile = async (f: File) => {
    const x = await readJson(f)
    if (!isObj(x) || (x.kind !== 'dtplus-backup' && x.kind !== 'dtplus-company') || (x.kind === 'dtplus-company' && !isObj(x.company))) { toast({ message: tp.file.restoreError, tone: 'err' }); return }
    const projects = x.kind === 'dtplus-backup' && Array.isArray(x.projects) ? x.projects.length : 0
    setPending({ kind: 'backup', data: x as unknown as Backup, name: f.name, projects, company: isObj(x.company) })
  }
  const confirmPending = () => {
    if (!pending) return
    const st = useAppStore.getState()
    if (pending.kind === 'company') {
      if (st.importCompany(pending.data)) toast({ message: tp.file.imported, tone: 'ok' }); else toast({ message: tp.file.importError, tone: 'err' })
      return
    }
    const r = st.importBackup(pending.data)
    if (r) toast({ message: tp.file.restored(r.projects, r.company), tone: 'ok' }); else toast({ message: tp.file.restoreError, tone: 'err' })
  }
  const pendingInfo = (() => {
    if (!pending) return null
    const c = isObj(pending.data.company) ? pending.data.company as Record<string, unknown> : null
    const nm = c && typeof c.name === 'string' ? companyTitle(c.name) ?? t.settings.defaultName : null
    const when = typeof pending.data.exportedAt === 'string' ? fmtDate(pending.data.exportedAt) : '—'
    const bc = c ? bookCounts(normalizePriceBook(c.priceBook)) : null
    return { file: tp.file.fileInfo(nm ? `${nm} (${pending.name})` : pending.name, when), counts: bc ? tp.file.fileCounts(bc.edited, bc.hidden, bc.own) : null }
  })()
  const onLogo = (f: File) => { shrinkLogo(f).then((logoDataUrl) => setCompany({ logoDataUrl }), () => toast({ message: t.settings.logoError, tone: 'err' })) }
  // Preview in the UI language: the Arabic name / tagline in Arabic (each falling back to the other language)
  const nameAr = companyTitle(company.nameAr ?? ''), nameEn = companyTitle(company.name)
  const name = (lang === 'ar' ? nameAr ?? nameEn : nameEn ?? nameAr) ?? t.settings.defaultName
  const tagline = (lang === 'ar' ? company.taglineAr?.trim() || company.tagline : company.tagline?.trim() || company.taglineAr) || t.settings.defaultTagline
  const C = tp.company
  // The English fields never show the Arabic placeholders the UI-language switch swaps in; an untouched name shows as empty
  const enName = nameEn ?? ''
  const enText = (k: 'tagline' | 'terms') => (company[k] === AR.settings[k === 'tagline' ? 'defaultTagline' : 'defaultTerms'] ? EN.settings[k === 'tagline' ? 'defaultTagline' : 'defaultTerms'] : company[k])
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
            <div className="min-w-0"><p className="truncate font-semibold"><bdi>{name}</bdi></p><p className="truncate text-xs opacity-90"><bdi>{tagline}</bdi></p></div>
          </div>
          <p className="bg-slate-50 px-4 py-1.5 text-xs text-slate-500">{t.settings.preview}</p>
        </div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {/* English and Arabic texts side by side: English documents print the English ones, Arabic documents the Arabic ones */}
          <Field label={C.nameEn} help={C.enHelp}><input className="input" dir="ltr" lang="en" value={enName} placeholder={EN.settings.defaultName} onChange={(e) => setCompany({ name: e.target.value })} data-testid="settings-name" /></Field>
          <Field label={C.nameAr} help={C.arHelp}><input className="input" dir="rtl" lang="ar" value={company.nameAr ?? ''} placeholder={AR.settings.defaultName} onChange={(e) => setCompany({ nameAr: e.target.value })} data-testid="settings-name-ar" /></Field>
          <Field label={C.taglineEn}><input className="input" dir="ltr" lang="en" value={enText('tagline')} placeholder={EN.settings.defaultTagline} onChange={(e) => setCompany({ tagline: e.target.value })} data-testid="settings-tagline" /></Field>
          <Field label={C.taglineAr}><input className="input" dir="rtl" lang="ar" value={company.taglineAr ?? ''} placeholder={AR.settings.defaultTagline} onChange={(e) => setCompany({ taglineAr: e.target.value })} data-testid="settings-tagline-ar" /></Field>
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

          <div className="col-span-2 mt-2 border-t border-slate-100 pt-4">
            <h4 className="text-sm font-semibold text-slate-900">{tp.newDefaults}</h4>
          </div>
          <Field label={tp.defaultSystemType} as="div" className="col-span-2 sm:col-span-1">
            <Segmented<SystemType> full label={tp.defaultSystemType} value={company.defaultSystemType ?? 'hybrid'} onChange={(v) => setCompany({ defaultSystemType: v })}
              options={(['offgrid', 'hybrid', 'gridtie'] as const).map((v) => ({ value: v, label: t.info[`${v}Short`], testId: `settings-systype-${v}` }))} />
          </Field>
          <Field label={tp.defaultPhase} as="div" className="col-span-2 sm:col-span-1">
            <Segmented<'1' | '3'> full label={tp.defaultPhase} value={company.defaultPhase === 3 ? '3' : '1'} onChange={(v) => setCompany({ defaultPhase: Number(v) as Phase })}
              options={(['1', '3'] as const).map((v) => ({ value: v, label: t.design.phaseN(Number(v)), testId: `settings-phase-${v}` }))} />
          </Field>

          <div className="col-span-2 mt-2 border-t border-slate-100 pt-4">
            <h4 className="text-sm font-semibold text-slate-900">{tp.services}</h4>
            <p className="mt-0.5 text-xs text-slate-500">{tp.servicesHelp}</p>
          </div>
          <Field label={tp.labour} className="col-span-2 sm:col-span-1" help={localHint(company.labourPerKwUsd ?? 0)}>
            <NumberInput value={company.labourPerKwUsd ?? 0} min={0} max={100000} onChange={(v) => setCompany({ labourPerKwUsd: v ?? 0 })} suffix={tp.perKwp} data-testid="settings-labour" />
          </Field>
          <Field label={tp.transport} help={localHint(company.transportUsd ?? 0)}>
            <NumberInput value={company.transportUsd ?? 0} min={0} max={1000000} onChange={(v) => setCompany({ transportUsd: v ?? 0 })} suffix="USD" data-testid="settings-transport" />
          </Field>
          <Field label={tp.commissioning} help={localHint(company.commissioningUsd ?? 0)}>
            <NumberInput value={company.commissioningUsd ?? 0} min={0} max={1000000} onChange={(v) => setCompany({ commissioningUsd: v ?? 0 })} suffix="USD" data-testid="settings-commissioning" />
          </Field>
        </div>
      </Section>

      <Section title={tp.link.title} description={tp.link.help}>
        <button type="button" onClick={() => setView('prices')} data-testid="settings-prices-link"
          className="flex min-h-14 w-full items-center gap-3 rounded-xl border border-slate-200 px-3 py-2 text-start hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500">
          <span className="grid size-10 shrink-0 place-items-center rounded-lg bg-brand-50 text-brand-700"><Tags size={20} /></span>
          <span className="min-w-0 flex-1">
            <span className="block text-sm font-medium text-slate-900">{tp.link.open}</span>
            <span className="block text-xs text-slate-600" data-testid="settings-prices-counts">{tp.link.summary(counts.edited, counts.hidden, counts.own)}</span>
          </span>
          <Chevron size={18} className="shrink-0 text-slate-400" />
        </button>
      </Section>

      <Section id="company-file" title={tp.file.title} description={tp.file.help} className="scroll-mt-20">
        <input ref={companyFileRef} type="file" accept="application/json,.json" hidden data-testid="import-company-file" onChange={(e) => { const f = e.target.files?.[0]; if (f) onCompanyFile(f); e.target.value = '' }} />
        <input ref={backupFileRef} type="file" accept="application/json,.json" hidden data-testid="restore-file" onChange={(e) => { const f = e.target.files?.[0]; if (f) onBackupFile(f); e.target.value = '' }} />
        <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <FileAction icon={<FileDown size={20} />} label={tp.file.exportCompany} help={tp.file.exportCompanyHelp} testId="export-company"
            onClick={() => saveJson(useAppStore.getState().exportCompany(), `${baseName}-company.json`)} />
          <FileAction icon={<FileUp size={20} />} label={tp.file.importCompany} help={tp.file.importCompanyHelp} testId="import-company" onClick={() => companyFileRef.current?.click()} />
          <FileAction icon={<DatabaseBackup size={20} />} label={tp.file.exportBackup} help={tp.file.exportBackupHelp(projectCount)} testId="export-backup"
            onClick={() => saveJson(useAppStore.getState().exportBackup(), `${baseName}-backup-${today()}.json`)} />
          <FileAction icon={<ArchiveRestore size={20} />} label={tp.file.restore} help={tp.file.restoreHelp} testId="restore-backup" onClick={() => backupFileRef.current?.click()} />
        </ul>
      </Section>

      <Section title={t.settings.terms}>
        <div className="grid grid-cols-1 gap-4">
          <Field label={C.termsEn} help={C.enHelp}>
            <textarea className="input min-h-36" dir="ltr" lang="en" value={enText('terms')} onChange={(e) => setCompany({ terms: e.target.value })} data-testid="settings-terms" />
          </Field>
          <Field label={C.termsAr} help={C.arHelp}>
            <textarea className="input min-h-36" dir="rtl" lang="ar" value={company.termsAr ?? ''} placeholder={AR.settings.defaultTerms} onChange={(e) => setCompany({ termsAr: e.target.value })} data-testid="settings-terms-ar" />
          </Field>
        </div>
      </Section>

      <ConfirmDialog open={!!pending} onClose={() => setPending(null)} danger={false} onConfirm={confirmPending}
        title={pending?.kind === 'backup' ? tp.file.restoreTitle : tp.file.importTitle}
        confirmLabel={pending?.kind === 'backup' ? tp.file.restoreConfirm : tp.file.importConfirm}
        body={pending && pendingInfo ? <>
          {pending.kind === 'backup' ? tp.file.restoreBody(pending.projects, pending.company) : tp.file.importBody}
          <span className="mt-3 block text-xs text-slate-500" data-testid="pending-file"><bdi>{pendingInfo.file}</bdi></span>
          {pendingInfo.counts && <span className="block text-xs text-slate-500"><bdi>{pendingInfo.counts}</bdi></span>}
        </> : undefined} />

      <Section title={t.settings.about}>
        <p className="text-sm text-slate-600"><bdi>{t.appName}</bdi> · <bdi>{t.settings.version(__APP_VERSION__)}</bdi></p>
        <p className="mt-1 text-sm text-slate-600"><bdi>{t.by}</bdi></p>
        <button type="button" className="btn-secondary mt-3" data-testid="check-updates" disabled={checking}
          onClick={async () => {
            setChecking(true)
            const r = await checkForUpdate('manual')
            setChecking(false)
            if (r === 'latest') toast({ message: t.updates.latest, tone: 'ok' })
            else if (r === 'offline') toast({ message: t.updates.offline, tone: 'err' })
          }}>
          <RefreshCw size={18} className={checking ? 'animate-spin' : ''} />{t.updates.check}
        </button>
        <InstallSetting />
      </Section>
    </div>
  )
}

function FileAction({ icon, label, help, onClick, testId }: { icon: ReactNode; label: string; help: string; onClick: () => void; testId: string }) {
  return (
    <li>
      <button type="button" onClick={onClick} data-testid={testId}
        className="flex h-full min-h-16 w-full items-start gap-3 rounded-xl border border-slate-200 p-3 text-start hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500">
        <span className="grid size-10 shrink-0 place-items-center rounded-lg bg-slate-100 text-slate-600">{icon}</span>
        <span className="min-w-0"><span className="block text-sm font-medium text-slate-900">{label}</span><span className="mt-0.5 block text-xs text-slate-600">{help}</span></span>
      </button>
    </li>
  )
}
