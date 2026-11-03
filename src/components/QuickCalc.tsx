import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { ArrowLeft, ArrowRight, Calculator, ChevronUp, CircleAlert, ClipboardCopy, Eraser, FileDown, FileText, LoaderCircle, Share2, TriangleAlert } from 'lucide-react'
import { useAppStore } from '../store/useAppStore'
import { toast } from '../store/useToast'
import { useT } from '../i18n'
import { Field, Segmented } from './ui'
import { Sheet } from './overlay'
import { useMediaQuery } from './hooks'
import { useComputed } from './useEngine'
import { StepLoads } from './steps/StepLoads'
import { realIssues } from './wizardModel'
import { locations, regions } from '../data/locations'
import { applySystemType, siteFromLocation } from '../engine/defaults'
import { fmt } from '../engine/format'
import { formatQuoteMoney, type Quote } from '../engine/quote'
import { iso } from '../i18n/labels'
import { cityName, countryName } from '../i18n/places'
import { summaryText, buildSummaryPdf, estimateFigures, short } from '../export/summaryPdf'
import { download, shareFile, canShareFiles, isTouchDevice } from '../export/download'
import { fileStem, locationName } from '../export/common'
import type { Location, Project, Results, SystemType } from '../engine/types'

const TYPES: SystemType[] = ['offgrid', 'hybrid', 'gridtie']
const REGION_ORDER = ['Africa', 'Middle East', 'Asia', 'Europe', 'Americas', 'Oceania']
const locName = (l: Location, lang: 'en' | 'ar') => (lang === 'ar' ? l.cityAr ?? cityName(l, lang) : l.city)
const ctyName = (l: Location, lang: 'en' | 'ar') => (lang === 'ar' ? l.countryAr ?? countryName(l.country, lang) : l.country)

/** Clipboard with a fallback for browsers / contexts without the async Clipboard API. */
async function copyText(s: string): Promise<boolean> {
  try { if (navigator.clipboard?.writeText) { await navigator.clipboard.writeText(s); return true } } catch { /* fall back */ }
  const prev = document.activeElement as HTMLElement | null
  try {
    const ta = document.createElement('textarea')
    ta.value = s; ta.setAttribute('readonly', ''); ta.style.position = 'fixed'; ta.style.insetBlockStart = '0'; ta.style.opacity = '0'
    document.body.appendChild(ta); ta.select()
    const ok = document.execCommand('copy')
    ta.remove(); prev?.focus?.({ preventScroll: true })
    return ok
  } catch { return false }
}

/**
 * Load calculator: system type + city, the load editor, and a live result (system size and indicative selling price) —
 * one screen, no client details. The result sits in a side column on wide desktops (≥ 1280 px) and in an expandable bottom bar below that.
 */
export function QuickCalc() {
  const { t, lang } = useT()
  const C = t.calc
  const calc = useAppStore((s) => s.calc)
  const company = useAppStore((s) => s.company)
  const updateCalc = useAppStore((s) => s.updateCalc)
  const startCalc = useAppStore((s) => s.startCalc)
  const saveCalc = useAppStore((s) => s.saveCalc)
  const { results: r, quote: q } = useComputed(calc)
  // Side column only where the load table still has room next to it (StepLoads switches to its wide table at a 1024 px viewport)
  const wide = useMediaQuery('(min-width: 1280px)')
  const [sheet, setSheet] = useState(false)
  const [busy, setBusy] = useState(false)
  const has = !!r && r.dailyWh > 0

  useEffect(() => { if (!calc) startCalc() }, [calc, startCalc])
  // Warm up the PDF module and font once there is a result (keeps the phone share sheet within the tap's activation window)
  useEffect(() => {
    if (!has) return
    const id = window.setTimeout(() => { void import('../export/fonts').then((m) => m.loadPdfFonts()).catch(() => {}); void import('../export/pdfkit') }, 1500)
    return () => window.clearTimeout(id)
  }, [has])
  const grouped = useMemo(() => [...regions].sort((a, b) => REGION_ORDER.indexOf(a) - REGION_ORDER.indexOf(b)).map((rg) => ({
    rg, items: locations.filter((l) => l.region === rg).sort((a, b) => (a.country === 'Sudan' ? -1 : b.country === 'Sudan' ? 1 : ctyName(a, lang).localeCompare(ctyName(b, lang), lang) || locName(a, lang).localeCompare(locName(b, lang), lang))),
  })), [lang])

  if (!calc || !r || !q) return <div data-testid="calc-page" />

  const f = estimateFigures(calc, r, q)
  const errors = realIssues(r.checks).filter((c) => c.level === 'error' && c.id !== 'no-loads').length
  const canClear = calc.loads.length > 0 || (calc.sizing?.demand === 'bill' && calc.sizing.bill.monthlyKwh > 0)
  const price = C.approx(formatQuoteMoney(q.total, q, 0))
  const sysLine = [`${fmt(r.arrayKwp, 2)} kWp`, f.battery ? `${fmt(r.batteryKwh, 1)} kWh` : '', r.inverter ? `${fmt(r.inverterTotalKw, 1)} kW` : ''].filter(Boolean).join(' · ')

  const setType = (v: SystemType) => updateCalc((prev) => ({ design: applySystemType(prev.design, v) }))
  const pickCity = (id: string) => { if (id !== 'custom') updateCalc((prev) => ({ site: { ...siteFromLocation(id), currency: prev.site.currency, fxRateToUsd: prev.site.fxRateToUsd } })) }

  const text = () => summaryText(calc, r, q, company, lang)
  const onCopy = async () => toast(await copyText(text()) ? { message: C.copied, tone: 'ok' } : { message: C.copyFailed, tone: 'err' })
  // Share sheet → WhatsApp → clipboard
  const onShare = async () => {
    const s = text()
    if (typeof navigator.share === 'function') {
      try { await navigator.share({ text: s }); return } catch (e) { if ((e as DOMException)?.name === 'AbortError') return }
    }
    const w = window.open(`https://wa.me/?text=${encodeURIComponent(s)}`, '_blank')
    if (w) { try { w.opener = null } catch { /* cross-origin */ } return }
    toast(await copyText(s) ? { message: C.copied, tone: 'ok' } : { message: C.copyFailed, tone: 'err' })
  }
  const onPdf = async () => {
    if (busy) return
    setBusy(true)
    try {
      const blob = await buildSummaryPdf(calc, r, q, company, lang)
      const name = `${fileStem(C.pdf.file)}-${new Date().toISOString().slice(0, 10)}.pdf`
      if (canShareFiles() && isTouchDevice()) {
        const res = await shareFile(blob, name, C.pdf.title)
        if (res === 'shared' || res === 'cancelled') return
        if (res === 'needs-gesture') {
          toast({ message: C.pdfReady, action: { label: C.share, run: () => { void shareFile(blob, name, C.pdf.title).then((x) => { if (x === 'unsupported' || x === 'needs-gesture') download(blob, name) }) } } })
          return
        }
      }
      download(blob, name)
      toast({ message: C.downloaded(name), tone: 'ok' })
    } catch (e) {
      console.error(e)
      toast({ message: (e as Error)?.message === 'pdf-font' ? C.fontFailed : C.pdfFailed, tone: 'err' })
    } finally { setBusy(false) }
  }
  const onProposal = () => { setSheet(false); if (saveCalc()) toast({ message: C.proposalCreated, tone: 'ok' }) }
  const onClear = () => {
    const prev = calc
    setSheet(false)
    startCalc(true)
    toast({ message: C.cleared, action: { label: t.common.undo, run: () => useAppStore.getState().updateCalc(() => prev) } })
  }
  const actions = (cls = '') => <Actions className={cls} has={has} busy={busy} onCopy={onCopy} onShare={onShare} onPdf={onPdf} onProposal={onProposal} />
  const clearBtn = canClear && <button type="button" className="btn-ghost w-full text-slate-600" onClick={onClear} data-testid="calc-clear"><Eraser size={18} />{C.clear}</button>

  return (
    <div className="xl:grid xl:grid-cols-[minmax(0,1fr)_20rem] xl:items-start xl:gap-5" data-testid="calc-page">
      <div className="min-w-0 space-y-4 sm:space-y-5">
        <div>
          <h1 className="text-display text-slate-900">{C.title}</h1>
          <p className="mt-0.5 max-w-3xl text-sm text-slate-600">{C.intro}</p>
        </div>
        <section className="card grid grid-cols-1 gap-x-4 gap-y-3 p-4 sm:grid-cols-2 sm:p-5" data-testid="calc-inputs">
          <Field as="div" label={C.systemType}>
            <Segmented full label={C.systemType} value={calc.design.systemType} onChange={setType}
              options={TYPES.map((v) => ({ value: v, label: t.info[`${v}Short` as const], testId: `calc-type-${v}` }))} />
          </Field>
          <Field label={C.city}>
            <select className="input" value={calc.site.locationId} onChange={(e) => pickCity(e.target.value)} data-testid="calc-city">
              {grouped.map((g) => (
                <optgroup key={g.rg} label={t.site.regions[g.rg] ?? g.rg}>
                  {g.items.map((l) => <option key={l.id} value={l.id}>{`${locName(l, lang)}${lang === 'ar' ? '، ' : ', '}${ctyName(l, lang)} — ${iso(t.site.pshShort(fmt(l.annualPsh, 1)))}`}</option>)}
                </optgroup>
              ))}
              {calc.site.locationId === 'custom' && <option value="custom">{calc.site.customName || t.site.custom}</option>}
            </select>
          </Field>
        </section>
        <StepLoads project={calc} results={r} quote={q} update={updateCalc} goTo={() => {}} />
        {!wide && <div className="h-0 sm:h-12" aria-hidden="true" />}
      </div>

      {wide ? (
        <aside className="sticky top-[4.5rem] max-h-[calc(100dvh-5.5rem)] overflow-y-auto rounded-xl" aria-labelledby="calc-result-title" data-testid="calc-result">
          <div className="card space-y-4 p-4">
            <h2 id="calc-result-title" className="card-title">{C.result}</h2>
            <ResultPanel p={calc} r={r} q={q} errors={errors} onProposal={onProposal} top={has ? actions() : null} />
            {has ? clearBtn : actions()}
          </div>
        </aside>
      ) : (
        <>
          <div className="wizard-bar fixed inset-x-0 bottom-0 z-30 rounded-t-2xl border-t border-slate-200 bg-white/95 pb-[env(safe-area-inset-bottom)] shadow-[0_-6px_20px_-10px_rgb(15_23_42/0.3)] backdrop-blur" data-testid="calc-bar">
            {has ? (
              <button type="button" onClick={() => setSheet(true)} aria-haspopup="dialog" aria-expanded={sheet} data-testid="calc-bar-open"
                className="relative mx-auto flex min-h-16 w-full max-w-7xl items-center gap-3 rounded-t-2xl ps-[max(1rem,env(safe-area-inset-left))] pe-[max(1rem,env(safe-area-inset-right))] pt-3.5 pb-2 text-start focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-inset sm:px-6">
                <span aria-hidden="true" className="absolute inset-x-0 top-1.5 mx-auto h-1 w-9 rounded-full bg-slate-300" />
                <span className="sr-only">{C.details}: </span>
                <span className="min-w-0 flex-1">
                  <span className="flex min-w-0 items-center gap-1.5 text-xs text-slate-500">
                    <span className="truncate">{C.perDay(fmt(f.dailyKwh, 1))}</span>
                    {errors > 0 && <span className="badge-err">{t.nav.issues(errors)}</span>}
                  </span>
                  <span className="block truncate text-sm font-semibold text-slate-900 tabular-nums" data-testid="calc-bar-system"><bdi>{sysLine}</bdi></span>
                </span>
                <span className="shrink-0 text-end">
                  <span className="block text-xs text-slate-500">{C.price}</span>
                  <span className="block text-base font-semibold text-brand-800 tabular-nums" data-testid="calc-bar-price">{price}</span>
                </span>
                <ChevronUp size={20} className="shrink-0 text-slate-500" aria-hidden="true" />
              </button>
            ) : (
              <p className="mx-auto flex min-h-14 max-w-7xl items-center gap-2 ps-[max(1rem,env(safe-area-inset-left))] pe-[max(1rem,env(safe-area-inset-right))] text-sm text-slate-500 sm:px-6" data-testid="calc-bar-empty">
                <Calculator size={18} className="shrink-0" aria-hidden="true" />{C.emptyBar}
              </p>
            )}
          </div>
          <Sheet open={sheet && has} onClose={() => setSheet(false)} title={C.result} testId="calc-sheet" footer={actions('w-full')}>
            <ResultPanel p={calc} r={r} q={q} errors={errors} onProposal={onProposal} />
            {clearBtn && <div className="mt-3 border-t border-slate-100 pt-2">{clearBtn}</div>}
          </Sheet>
        </>
      )}
    </div>
  )
}

/** Label / value row. Values inherit the UI direction: pass Latin values through iso(); dictionary strings isolate their own Latin runs. */
function Row({ k, v, sub, testId }: { k: ReactNode; v: ReactNode; sub?: ReactNode; testId?: string }) {
  return (
    <div className="flex items-start justify-between gap-3 py-2">
      <dt className="min-w-0 pt-px text-sm text-slate-600">{k}</dt>
      <dd className="min-w-0 text-end">
        <span className="block text-sm font-semibold text-slate-900 tabular-nums" data-testid={testId}>{v}</span>
        {sub && <span className="block text-xs leading-5 text-slate-500">{sub}</span>}
      </dd>
    </div>
  )
}

/** The live result: indicative selling price, demand, recommended system, red checks and assumptions (client-safe: no cost, no markup). */
function ResultPanel({ p, r, q, errors, onProposal, top }: { p: Project; r: Results; q: Quote; errors: number; onProposal: () => void; top?: ReactNode }) {
  const { t, lang, dir } = useT()
  const C = t.calc
  if (r.dailyWh <= 0) {
    return (
      <div className="flex flex-col items-center px-2 py-6 text-center" data-testid="calc-empty">
        <span className="mb-3 grid size-12 place-items-center rounded-full bg-brand-50 text-brand-700"><Calculator size={24} /></span>
        <p className="font-semibold text-slate-900">{C.emptyTitle}</p>
        <p className="mt-1 text-sm text-slate-600">{C.emptyBody}</p>
      </div>
    )
  }
  const f = estimateFigures(p, r, q)
  const Arrow = dir === 'rtl' ? ArrowLeft : ArrowRight
  const warnings = realIssues(r.checks).filter((c) => c.level === 'warn').length
  const vat = q.vatPct > 0 ? C.inclVat(fmt(q.vatPct, q.vatPct % 1 ? 1 : 0)) : null
  const a = f.auto
  const autoTxt = a ? (a.offgrid ? C.autonomy(short(a.days, 1)) : a.hours > 72 ? C.backupLong : C.backup(short(a.hours, 0))) : ''
  return (
    <div className="space-y-4" data-testid="calc-result-body">
      <div className="rounded-xl border border-brand-200 bg-brand-50 p-4">
        <p className="text-sm text-slate-600">{C.price}</p>
        <p className="mt-0.5 text-[1.75rem] leading-9 font-semibold text-slate-900 tabular-nums" data-testid="calc-total">{C.approx(formatQuoteMoney(q.total, q, 0))}</p>
        <p className="text-xs leading-5 text-slate-500">{[f.perWp > 0 ? C.perWp(formatQuoteMoney(f.perWp, q, 2)) : '', vat].filter(Boolean).join(' · ')}</p>
      </div>
      {top}
      {errors > 0 ? (
        <button type="button" onClick={onProposal} data-testid="calc-issues"
          className="flex min-h-11 w-full items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-start text-sm font-medium text-red-800 transition hover:bg-red-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500">
          <CircleAlert size={18} className="shrink-0" aria-hidden="true" /><span className="min-w-0 flex-1">{C.errors(errors)}</span><Arrow size={16} className="shrink-0" aria-hidden="true" />
        </button>
      ) : warnings > 0 ? (
        <p className="flex items-start gap-2 text-sm text-amber-800" data-testid="calc-warnings"><TriangleAlert size={16} className="mt-0.5 shrink-0" aria-hidden="true" />{C.warnings(warnings)}</p>
      ) : null}
      <section>
        <h3 className="eyebrow">{C.energy}</h3>
        <dl className="divide-y divide-slate-100">
          <Row k={C.daily} v={iso(`${fmt(f.dailyKwh, 1)} kWh`)} sub={f.bill ? `${C.perMonth(fmt(f.monthlyKwh))} · ${C.fromBill}` : C.perMonth(fmt(f.monthlyKwh))} testId="calc-daily" />
          <Row k={C.peak} v={iso(`${fmt(r.peakW / 1000, 1)} kW`)} sub={r.surgeW > r.peakW ? C.surge(fmt(r.surgeW / 1000, 1)) : undefined} testId="calc-peak" />
          <Row k={C.night} v={iso(`${fmt(f.nightPct)}%`)} sub={C.nightKwh(fmt(r.nightWh / 1000, 1))} testId="calc-night" />
        </dl>
      </section>
      <section>
        <h3 className="eyebrow">{C.system(C.sysTypes[p.design.systemType] ?? p.design.systemType)}</h3>
        <dl className="divide-y divide-slate-100">
          <Row k={C.panels} v={iso(`${fmt(r.arrayKwp, 2)} kWp`)} sub={C.panelsSub(r.panelQty, String(r.panel.watts))} testId="calc-pv" />
          <Row k={C.battery} v={f.battery ? iso(`${fmt(r.batteryKwh, 1)} kWh`) : '—'} sub={f.battery ? [C.usable(fmt(r.batteryUsableKwh, 1)), autoTxt].filter(Boolean).join(' · ') : C.noBattery} testId="calc-battery" />
          <Row k={C.inverter} v={r.inverter ? iso(`${r.inverterQty} × ${fmt(r.inverter.ratedAcKw, 1)} kW`) : '—'} sub={r.inverter ? iso(`${r.inverter.brand} ${r.inverter.model}`) : undefined} testId="calc-inverter" />
          <Row k={C.production} v={C.perYear(fmt(r.annualProductionKwh))} sub={C.demandYear(fmt(r.annualKwh), fmt(f.coverage))} testId="calc-production" />
        </dl>
      </section>
      <p className="text-xs leading-5 text-slate-500" data-testid="calc-assumptions">{C.assumptions(locationName(p, lang), fmt(p.site.psh, 1))}</p>
    </div>
  )
}

function Actions({ has, busy, onCopy, onShare, onPdf, onProposal, className = '' }: {
  has: boolean; busy: boolean; className?: string
  onCopy: () => void; onShare: () => void; onPdf: () => void; onProposal: () => void
}) {
  const { t } = useT()
  const C = t.calc
  return (
    <div className={`space-y-2 ${className}`} data-testid="calc-actions">
      <button type="button" className="btn-primary w-full" disabled={!has} onClick={onProposal} data-testid="calc-proposal"><FileText size={18} />{C.makeProposal}</button>
      <div className="grid grid-cols-3 gap-2">
        <button type="button" className="btn-secondary min-w-0 px-2" disabled={!has} onClick={onCopy} title={C.copyLong} aria-label={C.copyLong} data-testid="calc-copy"><ClipboardCopy size={18} className="shrink-0" />{C.copy}</button>
        <button type="button" className="btn-secondary min-w-0 px-2" disabled={!has} onClick={onShare} title={C.shareLong} aria-label={C.shareLong} data-testid="calc-share"><Share2 size={18} className="shrink-0" />{C.share}</button>
        <button type="button" className="btn-secondary min-w-0 px-2" disabled={!has || busy} onClick={onPdf} title={C.pdfLong} aria-label={busy ? C.preparing : C.pdfLong} aria-busy={busy} data-testid="calc-pdf">
          {busy ? <LoaderCircle size={18} className="shrink-0 animate-spin" aria-hidden="true" /> : <FileDown size={18} className="shrink-0" />}{C.pdfBtn}
        </button>
      </div>
    </div>
  )
}
