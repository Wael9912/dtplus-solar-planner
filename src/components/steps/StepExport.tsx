import { useEffect, useMemo, useRef, useState, type ComponentType, type ReactNode } from 'react'
import { FileSpreadsheet, FileText, FileJson, Wrench, Share2, Download, CircleCheck, CircleAlert, TriangleAlert, ArrowLeft, ArrowRight, LoaderCircle, Lock, Users, ReceiptText } from 'lucide-react'
import { useT } from '../../i18n'
import type { StepProps } from '../Wizard'
import type { StepKey } from '../../engine/types'
import { useAppStore } from '../../store/useAppStore'
import { fmt } from '../../engine/format'
import { formatQuoteMoney } from '../../engine/quote'
import { download, shareFile, canShareFiles, isTouchDevice } from '../../export/download'
import { exportLabels, type ExportLang } from '../../export/labels'
import { checkMessage, checkStep, companyNameFor, docFileName, docTitle, proposalFinance, avoidedCostUsd, unitDecimals, systemName, sizeSummary, sizingOf } from '../../export/common'
import { stepsFor } from '../wizardModel'
import { Segmented } from '../ui'
import { ConfirmDialog } from '../overlay'

type DocKey = 'proposal' | 'quote' | 'tech' | 'excel' | 'json'
/** Documents with cost prices: sharing them asks for confirmation first (download stays one tap). */
const INTERNAL: DocKey[] = ['tech', 'excel']
interface DocState { busy?: 'share' | 'download'; msg?: string; err?: string; pending?: { blob: Blob; name: string }; done?: boolean }
type Icon = ComponentType<{ size?: number; className?: string }>

/**
 * Export step: readiness checklist, then the client documents (proposal as the hero, or the quotation for a product quote),
 * the internal documents and the project file. A product quote gets the quotation, the price workbook and the project file;
 * a known-size quote and a full design get every document.
 */
export function StepExport({ project: p, results: r, quote: q, update, goTo }: StepProps) {
  const { t, lang, dir } = useT()
  const X = exportLabels[lang].ui
  const O = t.outputs.export
  const company = useAppStore((s) => s.company)
  const setView = useAppStore((s) => s.setView)
  // Document language follows the UI language unless the user picks another one for this export
  const [docPick, setDocPick] = useState<{ ui: ExportLang; doc: ExportLang } | null>(null)
  const docLang: ExportLang = docPick?.ui === lang ? docPick.doc : lang
  const [st, setSt] = useState<Partial<Record<DocKey, DocState>>>({})
  const [confirmShare, setConfirmShare] = useState<DocKey | null>(null)
  // One file per tap: an action ignores repeat taps while it runs and for 600 ms after (a double tap never saves two files)
  const lock = useRef<Partial<Record<DocKey, boolean>>>({})
  const guard = async (k: DocKey, fn: () => Promise<void> | void) => {
    if (lock.current[k]) return
    lock.current[k] = true
    try { await fn() } finally { window.setTimeout(() => { lock.current[k] = false }, 600) }
  }
  const set = (k: DocKey, v: DocState) => setSt((s) => ({ ...s, [k]: v }))
  const canShare = useMemo(() => canShareFiles(), [])
  const shareFirst = useMemo(() => canShare && isTouchDevice(), [canShare])
  const Arrow = dir === 'rtl' ? ArrowLeft : ArrowRight

  // Warm up the PDF module and its font while the user reads the checklist (keeps the share sheet within the tap's activation window).
  useEffect(() => {
    const id = window.setTimeout(() => { void import('../../export/fonts').then((m) => m.loadPdfFonts()).catch(() => {}); void import('../../export/pdf') }, 400)
    return () => window.clearTimeout(id)
  }, [])

  // ---- readiness (per mode: the client name is optional on a quote; the load list or bill only matters for a full design)
  const mode = r.mode
  const steps = stepsFor(p)
  const go = (s: StepKey) => (steps.includes(s) ? () => goTo(s) : undefined)
  const errors = r.checks.filter((c) => c.level === 'error' && c.id !== 'no-loads' && c.id !== 'no-items')
  const nonUsd = p.site.currency !== 'USD'
  const fxOk = !nonUsd || (p.site.fxRateToUsd > 0 && p.site.fxRateToUsd !== 1)
  const clientName = p.clientName.trim(), clientSoft = mode !== 'design'
  const bill = sizingOf(p).bill
  const profile = exportLabels[lang].pdf.profiles[bill.profile] ?? bill.profile
  const nLines = q.lines.length
  const coName = companyNameFor(company, docLang)
  const demandItem = mode === 'items'
    ? { key: 'products', ok: nLines > 0, label: O.products, detail: nLines ? O.productsOk(nLines, formatQuoteMoney(q.total, q)) : O.productsMissing, fix: go('bom') }
    : mode === 'size'
      ? { key: 'system', ok: !!sizeSummary(r), label: O.system, detail: sizeSummary(r) || O.systemMissing, fix: go('design') }
      : r.demand === 'bill'
        ? { key: 'loads', ok: r.dailyWh > 0, label: O.bill, detail: r.dailyWh > 0 ? O.billOk(fmt(bill.monthlyKwh), profile) : O.billMissing, fix: go('loads') }
        : { key: 'loads', ok: p.loads.length > 0 && r.dailyWh > 0, label: X.loads, detail: p.loads.length > 0 && r.dailyWh > 0 ? X.loadsOk(p.loads.length, fmt(r.dailyWh / 1000, 1)) : X.loadsMissing, fix: go('loads') }
  const items: { key: string; ok: boolean; soft?: boolean; label: string; detail: string; fix?: () => void; fixLabel?: string; sub?: { text: string; go?: () => void }[] }[] = [
    { key: 'client', ok: !!clientName, soft: clientSoft, label: X.client, detail: clientName ? X.clientOk(clientName) : clientSoft ? O.clientOptional : X.clientMissing, fix: go('info') },
    demandItem,
    { key: 'checks', ok: errors.length === 0, label: X.checks, detail: errors.length ? X.checksErr(errors.length) : X.checksOk, sub: errors.map((c) => ({ text: checkMessage(c, lang), go: go(checkStep(c)) })) },
    ...(nonUsd ? [{ key: 'fx', ok: fxOk, soft: true, label: X.fx, detail: fxOk ? X.fxOk(p.site.currency, fmt(p.site.fxRateToUsd, p.site.fxRateToUsd < 10 ? 4 : 2)) : X.fxMissing(p.site.currency), fix: go(mode === 'items' ? 'bom' : 'site') }] : []),
    { key: 'company', ok: !!coName, soft: true, label: X.company, detail: coName ? X.companyOk(coName) : X.companyMissing, fix: () => setView('settings'), fixLabel: X.settings },
  ]
  const blocking = items.filter((i) => !i.ok && !i.soft).length
  const open = items.filter((i) => !i.ok).length

  // ---- file builders (export modules are loaded on demand so jsPDF / ExcelJS stay out of the main bundle)
  // File names: reference + project title (client and system while the project still has its default name) + document kind
  // (capped at 120 bytes, the suffix kept)
  const F = exportLabels[docLang].file
  const fileName = (suffix: string, ext: string) => docFileName(p, r, docLang, suffix, ext)
  const title = docTitle(p, r, docLang)
  const builders: Record<DocKey, () => Promise<{ blob: Blob; name: string }>> = {
    proposal: async () => ({ blob: await (await import('../../export/pdf')).buildProposalPdf(p, r, company, docLang), name: fileName(F.proposal, 'pdf') }),
    quote: async () => ({ blob: await (await import('../../export/pdf')).buildQuotationPdf(p, r, company, docLang), name: fileName(F.quotation, 'pdf') }),
    tech: async () => ({ blob: await (await import('../../export/pdf')).buildTechnicalPdf(p, r, company, docLang), name: fileName(F.technical, 'pdf') }),
    excel: async () => ({ blob: await (await import('../../export/excel')).buildExcel(p, r, company, docLang), name: fileName(F.workbook, 'xlsx') }),
    json: async () => ({ blob: new Blob([JSON.stringify(p, null, 2)], { type: 'application/json' }), name: fileName('', 'json') }),
  }
  const run = (k: DocKey, mode: 'share' | 'download') => guard(k, () => runNow(k, mode))
  const runNow = async (k: DocKey, mode: 'share' | 'download') => {
    set(k, { busy: mode })
    try {
      const { blob, name } = await builders[k]()
      if (mode === 'share') {
        const res = await shareFile(blob, name, title)
        if (res === 'shared') return set(k, { msg: X.shared, done: true })
        if (res === 'cancelled') return set(k, {})
        if (res === 'needs-gesture') return set(k, { pending: { blob, name } })
      }
      download(blob, name)
      set(k, { msg: X.downloaded(name), done: true })
    } catch (e) {
      set(k, { err: (e as Error)?.message === 'pdf-font' ? X.fontFailed : X.failed })
      console.error(e)
    }
  }
  const sharePending = (k: DocKey) => guard(k, async () => {
    const pending = st[k]?.pending; if (!pending) return
    const res = await shareFile(pending.blob, pending.name, title)
    if (res === 'shared') set(k, { msg: X.shared, done: true })
    else if (res === 'cancelled') set(k, { pending })
    else { download(pending.blob, pending.name); set(k, { msg: X.downloaded(pending.name), done: true }) }
  })

  // Render helpers (plain functions, not components, so buttons keep focus across re-renders)
  const actions = (k: DocKey, hero?: boolean) => {
    const s = st[k] ?? {}
    const busy = !!s.busy
    const primary = hero && blocking === 0 ? 'btn-primary' : 'btn-secondary'
    const spin = <LoaderCircle size={18} className="animate-spin" aria-hidden="true" />
    if (s.pending) return (
      <div className="flex flex-col gap-2 sm:flex-row">
        <button type="button" className="btn-primary min-h-11 flex-1 sm:flex-none" onClick={() => sharePending(k)} data-testid={`export-${k}-share-now`}><Share2 size={18} />{X.shareNow}</button>
        <button type="button" className="btn-ghost min-h-11" onClick={() => { const pd = s.pending!; void guard(k, () => { download(pd.blob, pd.name); set(k, { msg: X.downloaded(pd.name), done: true }) }) }}><Download size={18} />{X.moreActions}</button>
      </div>
    )
    const shareBtn = canShare && (
      <button type="button" disabled={busy} className={`${shareFirst ? primary : 'btn-secondary'} min-h-11 flex-1 sm:flex-none`} onClick={() => (INTERNAL.includes(k) ? setConfirmShare(k) : run(k, 'share'))} data-testid={`export-${k}-share`}>
        {s.busy === 'share' ? spin : <Share2 size={18} />}{s.busy === 'share' ? X.preparing : X.share}
      </button>
    )
    const dlBtn = (
      <button type="button" disabled={busy} className={`${shareFirst ? 'btn-secondary' : primary} min-h-11 flex-1 sm:flex-none`} onClick={() => run(k, 'download')} data-testid={`export-${k}-download`}>
        {s.busy === 'download' ? spin : <Download size={18} />}{s.busy === 'download' ? X.preparing : X.download}
      </button>
    )
    return <div className="flex flex-wrap gap-2">{shareFirst ? <>{shareBtn}{dlBtn}</> : <>{dlBtn}{shareBtn}</>}</div>
  }
  const status = (k: DocKey) => {
    const s = st[k]
    return (
      <p role="status" aria-live="polite" className="min-h-5 text-sm">
        {s?.err ? <span className="font-medium text-red-700">{s.err}</span> : s?.msg ? <span className="inline-flex items-center gap-1 text-emerald-700"><CircleCheck size={16} aria-hidden="true" /><bdi className="break-all">{s.msg}</bdi></span> : null}
      </p>
    )
  }
  const docCard = ({ k, icon: I, title, help, badge, hero, children }: { k: DocKey; icon: Icon; title: string; help: string; badge?: ReactNode; hero?: boolean; children?: ReactNode }) => (
    <section className={`card flex flex-col gap-3 ${hero ? 'border-brand-200 p-4 sm:p-6' : 'p-4 sm:p-5'}`} data-testid={`export-card-${k}`}>
      <div className="flex items-start gap-3">
        <span className={`grid shrink-0 place-items-center rounded-xl bg-brand-50 text-brand-700 ${hero ? 'size-12' : 'size-10'}`}><I size={hero ? 24 : 20} /></span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2"><h3 className="text-base font-semibold text-slate-900">{title}</h3>{badge}</div>
          <p className="mt-1 text-sm leading-6 text-slate-600">{help}</p>
        </div>
      </div>
      {children}
      {actions(k, hero)}
      {status(k)}
    </section>
  )

  const summary = (mode === 'items'
    ? [p.name, p.clientName, O.productsOk(nLines, formatQuoteMoney(q.total, q))]
    : [p.name, p.clientName, systemName(p, exportLabels[lang]), r.arrayKwp > 0 ? `${fmt(r.arrayKwp, 2)} kWp` : '', r.batteryKwh ? `${fmt(r.batteryKwh, 1)} kWh` : '', r.inverter ? `${r.inverterQty} × ${fmt(r.inverter.ratedAcKw, 1)} kW` : '', formatQuoteMoney(q.total, q)]
  ).filter((x) => x && String(x).trim())
  const clientBadge = <span className="badge-ok"><Users size={12} aria-hidden="true" />{X.clientSafe}</span>
  const internalBadge = <span className="badge-neutral"><Lock size={12} aria-hidden="true" />{X.internal}</span>
  const markQuoted = (k: DocKey) => st[k]?.done && p.status === 'draft' && (
    <button type="button" className="btn-link min-h-11 self-start" onClick={() => update({ status: 'quoted' })} data-testid="export-mark-quoted">{X.markQuoted}</button>
  )
  const notReady = blocking > 0 && <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900">{X.proposalNotReady}</p>

  // ---- savings & payback in the proposal: Auto (only when the payback helps the sale) / On / Off — project.proposalFinance
  const fin = proposalFinance(p, r)
  const finValue = p.proposalFinance == null ? 'auto' : p.proposalFinance ? 'on' : 'off'
  const tariffLocal = avoidedCostUsd(p, r) * q.fx
  const tariffText = formatQuoteMoney(tariffLocal, q, unitDecimals(tariffLocal))
  const paybackText = r.paybackYears != null && Number.isFinite(r.paybackYears) ? fmt(r.paybackYears, 1) : '—'
  const finHidden = fin.reason === 'payback' || fin.reason === 'no-savings'
  const finNote = fin.reason === 'on' ? O.financeOnNote : fin.reason === 'off' ? O.financeOffNote : fin.reason === 'ok' ? O.financeAutoShown(paybackText)
    : `${fin.reason === 'payback' ? O.financePayback(paybackText, tariffText) : O.financeNoSavings(tariffText)} ${O.financeHint[p.design.systemType] ?? ''}`.trim()
  const financeControl = fin.reason !== 'na' && (
    <div className="rounded-lg border border-slate-200 p-3" data-testid="export-finance">
      <p className="text-sm font-medium text-slate-900" id="finance-label">{O.finance}</p>
      <Segmented<'auto' | 'on' | 'off'> label={O.finance} className="mt-2" value={finValue}
        onChange={(v) => update({ proposalFinance: v === 'auto' ? undefined : v === 'on' })}
        options={(['auto', 'on', 'off'] as const).map((v) => ({ value: v, label: O.financeOpts[v], testId: `export-finance-${v}` }))} />
      <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
        <p className={`min-w-0 flex-1 text-sm ${finHidden ? 'text-amber-800' : 'text-slate-600'}`} data-testid="export-finance-note" data-shown={fin.show}><bdi>{finNote}</bdi></p>
        {finHidden && go('site') && (
          <button type="button" className="btn-ghost min-h-11 shrink-0 px-3 text-brand-700" onClick={go('site')} data-testid="export-finance-fix">{O.financeFix}<Arrow size={16} aria-hidden="true" /></button>
        )}
      </div>
    </div>
  )

  return (
    <div className="space-y-4" data-testid="export-step">
      {/* Readiness checklist */}
      <section className="card p-4 sm:p-5" aria-labelledby="ready-title" data-testid="export-readiness">
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
          <h3 id="ready-title" className="text-base font-semibold text-slate-900">{X.readiness}</h3>
          {open === 0 ? <span className="badge-ok"><CircleCheck size={14} aria-hidden="true" />{X.ready}</span> : <span className={blocking ? 'badge-err' : 'badge-warn'}>{X.notReady(open)}</span>}
        </div>
        <ul className="divide-y divide-slate-100">
          {items.map((it) => {
            const I = it.ok ? CircleCheck : it.soft ? TriangleAlert : CircleAlert
            const tone = it.ok ? 'text-emerald-600' : it.soft ? 'text-amber-600' : 'text-red-600'
            return (
              <li key={it.key} className="py-2.5" data-testid={`ready-${it.key}`} data-ok={it.ok}>
                <div className="flex items-start gap-3">
                  <I size={20} className={`mt-0.5 shrink-0 ${tone}`} aria-hidden="true" />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-slate-900">{it.label}</p>
                    <p className="min-w-0 text-sm text-slate-600 [overflow-wrap:anywhere]"><bdi>{it.detail}</bdi></p>
                  </div>
                  {!it.ok && it.fix && (
                    <button type="button" className="btn-ghost min-h-11 shrink-0 px-3 text-brand-700" onClick={it.fix} data-testid={`ready-${it.key}-fix`}>{it.fixLabel ?? X.fix}<Arrow size={16} aria-hidden="true" /></button>
                  )}
                </div>
                {!!it.sub?.length && (
                  <ul className="mt-1 space-y-1 ps-8">
                    {it.sub.map((s, i) => (
                      <li key={i} className="flex items-start justify-between gap-2">
                        <span className="min-w-0 py-2 text-sm text-slate-700 [overflow-wrap:anywhere]">{s.text}</span>
                        {s.go && <button type="button" className="btn-ghost min-h-11 shrink-0 px-3 text-brand-700" onClick={s.go} data-testid={`ready-check-fix-${i}`}>{X.fix}<Arrow size={16} aria-hidden="true" /></button>}
                      </li>
                    ))}
                  </ul>
                )}
              </li>
            )
          })}
        </ul>
      </section>

      {/* Document language (defaults to the UI language) */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-sm font-medium text-slate-700" id="doc-lang">{X.docLang}</span>
        <div role="radiogroup" aria-labelledby="doc-lang" className="inline-flex gap-1 rounded-lg bg-slate-100 p-1">
          {(['en', 'ar'] as const).map((l) => (
            <button key={l} type="button" role="radio" aria-checked={docLang === l} lang={l} data-testid={`doc-lang-${l}`} onClick={() => { setDocPick({ ui: lang, doc: l }); setSt({}) }}
              className={`min-h-11 min-w-20 rounded-md px-4 text-sm font-medium transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 ${docLang === l ? 'bg-white text-slate-900 shadow-sm ring-1 ring-slate-200' : 'text-slate-600 hover:text-slate-900'}`}>
              {l === 'en' ? X.english : X.arabic}
            </button>
          ))}
        </div>
      </div>

      {mode === 'items' ? <>
        {docCard({ k: 'quote', hero: true, icon: ReceiptText, title: O.quotation, help: O.quotationHelp, badge: clientBadge, children: <>{notReady}{markQuoted('quote')}</> })}
        <h3 className="eyebrow pt-2">{X.team}</h3>
        {docCard({ k: 'excel', icon: FileSpreadsheet, title: O.excelItems, help: O.excelItemsHelp, badge: internalBadge })}
      </> : <>
        {docCard({ k: 'proposal', hero: true, icon: FileText, title: X.proposal, help: mode === 'size' ? O.proposalHelpSize : X.proposalHelp, badge: clientBadge, children: <>{financeControl}{notReady}{markQuoted('proposal')}</> })}
        <h3 className="eyebrow pt-2">{O.alsoForClient}</h3>
        {docCard({ k: 'quote', icon: ReceiptText, title: O.quotation, help: O.quotationHelp, badge: clientBadge, children: !st.proposal?.done ? markQuoted('quote') : undefined })}
        <h3 className="eyebrow pt-2">{X.team}</h3>
        <div className="grid gap-3 sm:grid-cols-2">
          {docCard({ k: 'tech', icon: Wrench, title: X.tech, help: X.techHelp, badge: internalBadge })}
          {docCard({ k: 'excel', icon: FileSpreadsheet, title: X.excel, help: X.excelHelp, badge: internalBadge })}
        </div>
      </>}
      {docCard({ k: 'json', icon: FileJson, title: X.json, help: X.jsonHelp, badge: <span className="badge-neutral">{X.backup}</span> })}

      <p className="min-w-0 text-sm text-slate-600 [overflow-wrap:anywhere]"><span className="font-medium text-slate-700">{X.summary}: </span>{summary.map((s, i) => <span key={i}>{i > 0 && ' · '}<bdi>{s}</bdi></span>)}</p>

      {/* Internal documents carry cost prices: confirm before they go to the share sheet */}
      <ConfirmDialog open={!!confirmShare} onClose={() => setConfirmShare(null)} danger={false}
        title={X.shareInternalTitle} confirmLabel={X.shareInternalConfirm}
        body={confirmShare ? X.shareInternalBody(confirmShare === 'tech' ? X.tech : mode === 'items' ? O.excelItems : X.excel) : undefined}
        onConfirm={() => { if (confirmShare) void run(confirmShare, 'share') }} />
    </div>
  )
}
