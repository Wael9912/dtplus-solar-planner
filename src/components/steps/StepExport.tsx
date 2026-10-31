import { useEffect, useMemo, useState, type ComponentType, type ReactNode } from 'react'
import { FileSpreadsheet, FileText, FileJson, Wrench, Share2, Download, CircleCheck, CircleAlert, TriangleAlert, ArrowLeft, ArrowRight, LoaderCircle, Lock, Users } from 'lucide-react'
import { useT } from '../../i18n'
import type { StepProps } from '../Wizard'
import { useAppStore } from '../../store/useAppStore'
import { fmt } from '../../engine/format'
import { formatQuoteMoney } from '../../engine/quote'
import { download, shareFile, canShareFiles, isTouchDevice } from '../../export/download'
import { exportLabels, type ExportLang } from '../../export/labels'
import { checkMessage, checkStep, fileStem, isDefaultCompanyName, systemName } from '../../export/common'

type DocKey = 'proposal' | 'tech' | 'excel' | 'json'
interface DocState { busy?: 'share' | 'download'; msg?: string; err?: string; pending?: { blob: Blob; name: string }; done?: boolean }
type Icon = ComponentType<{ size?: number; className?: string }>

/** Export step: readiness checklist, then the client proposal (hero), the internal documents and the project file. */
export function StepExport({ project: p, results: r, quote: q, update, goTo }: StepProps) {
  const { lang, dir } = useT()
  const X = exportLabels[lang].ui
  const company = useAppStore((s) => s.company)
  const setView = useAppStore((s) => s.setView)
  // Document language follows the UI language unless the user picks another one for this export
  const [docPick, setDocPick] = useState<{ ui: ExportLang; doc: ExportLang } | null>(null)
  const docLang: ExportLang = docPick?.ui === lang ? docPick.doc : lang
  const [st, setSt] = useState<Partial<Record<DocKey, DocState>>>({})
  const set = (k: DocKey, v: DocState) => setSt((s) => ({ ...s, [k]: v }))
  const canShare = useMemo(() => canShareFiles(), [])
  const shareFirst = useMemo(() => canShare && isTouchDevice(), [canShare])
  const Arrow = dir === 'rtl' ? ArrowLeft : ArrowRight

  // Warm up the PDF module and its font while the user reads the checklist (keeps the share sheet within the tap's activation window).
  useEffect(() => {
    const id = window.setTimeout(() => { void import('../../export/fonts').then((m) => m.loadPdfFonts()).catch(() => {}); void import('../../export/pdf') }, 400)
    return () => window.clearTimeout(id)
  }, [])

  // ---- readiness
  const errors = r.checks.filter((c) => c.level === 'error')
  const hasLoads = p.loads.length > 0 && r.dailyWh > 0
  const nonUsd = p.site.currency !== 'USD'
  const fxOk = !nonUsd || (p.site.fxRateToUsd > 0 && p.site.fxRateToUsd !== 1)
  const items: { key: string; ok: boolean; soft?: boolean; label: string; detail: string; fix?: () => void; fixLabel?: string; sub?: { text: string; go: () => void }[] }[] = [
    { key: 'client', ok: !!p.clientName.trim(), label: X.client, detail: p.clientName.trim() ? X.clientOk(p.clientName.trim()) : X.clientMissing, fix: () => goTo('info') },
    { key: 'loads', ok: hasLoads, label: X.loads, detail: hasLoads ? X.loadsOk(p.loads.length, fmt(r.dailyWh / 1000, 1)) : X.loadsMissing, fix: () => goTo('loads') },
    { key: 'checks', ok: errors.length === 0, label: X.checks, detail: errors.length ? X.checksErr(errors.length) : X.checksOk, sub: errors.map((c) => ({ text: checkMessage(c, lang), go: () => goTo(checkStep(c)) })) },
    ...(nonUsd ? [{ key: 'fx', ok: fxOk, soft: true, label: X.fx, detail: fxOk ? X.fxOk(p.site.currency, fmt(p.site.fxRateToUsd, p.site.fxRateToUsd < 10 ? 4 : 2)) : X.fxMissing(p.site.currency), fix: () => goTo('site') }] : []),
    { key: 'company', ok: !isDefaultCompanyName(company), soft: true, label: X.company, detail: isDefaultCompanyName(company) ? X.companyMissing : X.companyOk(company.name), fix: () => setView('settings'), fixLabel: X.settings },
  ]
  const blocking = items.filter((i) => !i.ok && !i.soft).length
  const open = items.filter((i) => !i.ok).length

  // ---- file builders (export modules are loaded on demand so jsPDF / ExcelJS stay out of the main bundle)
  const stem = `${p.reference ? fileStem(p.reference) + '_' : ''}${fileStem(p.name)}`
  const builders: Record<DocKey, () => Promise<{ blob: Blob; name: string }>> = {
    proposal: async () => ({ blob: await (await import('../../export/pdf')).buildProposalPdf(p, r, company, docLang), name: `${stem}-proposal.pdf` }),
    tech: async () => ({ blob: await (await import('../../export/pdf')).buildTechnicalPdf(p, r, company, docLang), name: `${stem}-technical.pdf` }),
    excel: async () => ({ blob: await (await import('../../export/excel')).buildExcel(p, r, company, docLang), name: `${stem}.xlsx` }),
    json: async () => ({ blob: new Blob([JSON.stringify(p, null, 2)], { type: 'application/json' }), name: `${stem}.json` }),
  }
  const run = async (k: DocKey, mode: 'share' | 'download') => {
    set(k, { busy: mode })
    try {
      const { blob, name } = await builders[k]()
      if (mode === 'share') {
        const res = await shareFile(blob, name, p.name)
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
  const sharePending = async (k: DocKey) => {
    const pending = st[k]?.pending; if (!pending) return
    const res = await shareFile(pending.blob, pending.name, p.name)
    if (res === 'shared') set(k, { msg: X.shared, done: true })
    else if (res === 'cancelled') set(k, { pending })
    else { download(pending.blob, pending.name); set(k, { msg: X.downloaded(pending.name), done: true }) }
  }

  // Render helpers (plain functions, not components, so buttons keep focus across re-renders)
  const actions = (k: DocKey, hero?: boolean) => {
    const s = st[k] ?? {}
    const busy = !!s.busy
    const primary = hero && blocking === 0 ? 'btn-primary' : 'btn-secondary'
    const spin = <LoaderCircle size={18} className="animate-spin" aria-hidden="true" />
    if (s.pending) return (
      <div className="flex flex-col gap-2 sm:flex-row">
        <button type="button" className="btn-primary min-h-11 flex-1 sm:flex-none" onClick={() => sharePending(k)} data-testid={`export-${k}-share-now`}><Share2 size={18} />{X.shareNow}</button>
        <button type="button" className="btn-ghost min-h-11" onClick={() => { download(s.pending!.blob, s.pending!.name); set(k, { msg: X.downloaded(s.pending!.name), done: true }) }}><Download size={18} />{X.moreActions}</button>
      </div>
    )
    const shareBtn = canShare && (
      <button type="button" disabled={busy} className={`${shareFirst ? primary : 'btn-secondary'} min-h-11 flex-1 sm:flex-none`} onClick={() => run(k, 'share')} data-testid={`export-${k}-share`}>
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

  const summary = [p.name, p.clientName, systemName(p, exportLabels[lang]), `${fmt(r.arrayKwp, 2)} kWp`, r.batteryKwh ? `${fmt(r.batteryKwh, 1)} kWh` : '', r.inverter ? `${r.inverterQty} × ${fmt(r.inverter.ratedAcKw, 1)} kW` : '', formatQuoteMoney(q.total, q)].filter((x) => x && String(x).trim())

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
                    <p className="text-sm text-slate-600"><bdi>{it.detail}</bdi></p>
                  </div>
                  {!it.ok && it.fix && (
                    <button type="button" className="btn-ghost min-h-11 shrink-0 px-3 text-brand-700" onClick={it.fix} data-testid={`ready-${it.key}-fix`}>{it.fixLabel ?? X.fix}<Arrow size={16} aria-hidden="true" /></button>
                  )}
                </div>
                {!!it.sub?.length && (
                  <ul className="mt-1 space-y-1 ps-8">
                    {it.sub.map((s, i) => (
                      <li key={i} className="flex items-start justify-between gap-2">
                        <span className="min-w-0 py-2 text-sm text-slate-700">{s.text}</span>
                        <button type="button" className="btn-ghost min-h-11 shrink-0 px-3 text-brand-700" onClick={s.go} data-testid={`ready-check-fix-${i}`}>{X.fix}<Arrow size={16} aria-hidden="true" /></button>
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

      {docCard({
        k: 'proposal', hero: true, icon: FileText, title: X.proposal, help: X.proposalHelp, badge: <span className="badge-ok"><Users size={12} aria-hidden="true" />{X.clientSafe}</span>,
        children: <>
          {blocking > 0 && <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900">{X.proposalNotReady}</p>}
          {st.proposal?.done && p.status === 'draft' && (
            <button type="button" className="btn-link min-h-11 self-start" onClick={() => update({ status: 'quoted' })} data-testid="export-mark-quoted">{X.markQuoted}</button>
          )}
        </>,
      })}

      <h3 className="eyebrow pt-2">{X.team}</h3>
      <div className="grid gap-3 sm:grid-cols-2">
        {docCard({ k: 'tech', icon: Wrench, title: X.tech, help: X.techHelp, badge: <span className="badge-neutral"><Lock size={12} aria-hidden="true" />{X.internal}</span> })}
        {docCard({ k: 'excel', icon: FileSpreadsheet, title: X.excel, help: X.excelHelp, badge: <span className="badge-neutral"><Lock size={12} aria-hidden="true" />{X.internal}</span> })}
      </div>
      {docCard({ k: 'json', icon: FileJson, title: X.json, help: X.jsonHelp, badge: <span className="badge-neutral">{X.backup}</span> })}

      <p className="text-sm text-slate-600"><span className="font-medium text-slate-700">{X.summary}: </span>{summary.map((s, i) => <span key={i}>{i > 0 && ' · '}<bdi>{s}</bdi></span>)}</p>
    </div>
  )
}
