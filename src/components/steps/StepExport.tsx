import { useState } from 'react'
import { FileSpreadsheet, FileText, FileJson, Wrench } from 'lucide-react'
import { useT } from '../../i18n'
import { Section } from '../ui'
import type { StepProps } from '../Wizard'
import { useAppStore } from '../../store/useAppStore'

export function StepExport({ project: p, results: r }: StepProps) {
  const { t, lang } = useT()
  const company = useAppStore((s) => s.company)
  const [busy, setBusy] = useState<string | null>(null)
  const run = async (key: string, fn: () => Promise<void>) => { setBusy(key); try { await fn() } finally { setBusy(null) } }
  const safe = (p.name || 'solar-project').replace(/[^\w؀-ۿ-]+/g, '_')

  const card = (key: string, Icon: typeof FileText, title: string, help: string, onClick: () => Promise<void>) => (
    <button disabled={!!busy} onClick={() => run(key, onClick)} className="card flex items-start gap-4 p-5 text-start transition hover:border-brand-400 hover:shadow-md disabled:opacity-60">
      <span className="grid h-12 w-12 shrink-0 place-items-center rounded-xl bg-brand-50 text-brand-700"><Icon size={24} /></span>
      <span><span className="block font-semibold text-slate-900">{busy === key ? t.export.generating : title}</span><span className="mt-1 block text-sm text-slate-500">{help}</span></span>
    </button>
  )
  return (
    <div className="space-y-5">
      <div className="grid gap-4 sm:grid-cols-2">
        {card('pdf', FileText, t.export.pdf, t.export.pdfHelp, async () => { const m = await import('../../export/pdf'); await m.exportProposalPdf(p, r, company, lang, `${safe}-proposal.pdf`) })}
        {card('tech', Wrench, t.export.techPdf, t.export.techHelp, async () => { const m = await import('../../export/pdf'); await m.exportTechnicalPdf(p, r, company, `${safe}-technical.pdf`) })}
        {card('xlsx', FileSpreadsheet, t.export.excel, t.export.excelHelp, async () => { const m = await import('../../export/excel'); await m.exportExcel(p, r, company, `${safe}.xlsx`) })}
        {card('json', FileJson, t.export.json, t.export.jsonHelp, async () => { const blob = new Blob([JSON.stringify(p, null, 2)], { type: 'application/json' }); download(blob, `${safe}.json`) })}
      </div>
      <Section title={t.results.summary}>
        <p className="text-sm text-slate-600">{p.name} · {p.clientName} · {t.info[p.design.systemType]} · {r.arrayKwp.toFixed(2)} kWp{r.batteryKwh ? ` · ${r.batteryKwh.toFixed(1)} kWh` : ''} · {r.inverter ? `${r.inverterQty} × ${r.inverter.ratedAcKw} kW` : ''}</p>
      </Section>
    </div>
  )
}
export function download(blob: Blob, name: string) {
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove() }, 1000)
}
