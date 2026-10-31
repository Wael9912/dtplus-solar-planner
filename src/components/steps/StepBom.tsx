import { useState } from 'react'
import { Plus, RotateCcw, EyeOff, Eye, Trash2 } from 'lucide-react'
import { useT } from '../../i18n'
import { Field, NumberInput, Section, Stat } from '../ui'
import type { StepProps } from '../Wizard'
import type { BomLine } from '../../engine/types'
import { fmt, money } from '../../engine/format'
import { uid } from '../../engine/defaults'
import { computeProject } from '../../engine/compute'

export function StepBom({ project: p, results: r, update }: StepProps) {
  const { t } = useT()
  const pr = p.pricing
  const cur = p.site.currency, fx = p.site.fxRateToUsd
  const set = (x: Partial<typeof pr>) => update((prev) => ({ pricing: { ...prev.pricing, ...x } }))
  const [showExcluded, setShowExcluded] = useState(false)
  // Lines including excluded ones (recompute with no exclusions to show them greyed)
  const allLines = showExcluded ? computeProject({ ...p, pricing: { ...pr, excludedIds: [] } }).bom : r.bom
  const categories = Array.from(new Set(allLines.map((l) => l.category)))
  const setPrice = (id: string, v: number | null) => set({ priceOverrides: v == null ? omit(pr.priceOverrides, id) : { ...pr.priceOverrides, [id]: v } })
  const setQty = (id: string, v: number | null) => set({ qtyOverrides: v == null ? omit(pr.qtyOverrides, id) : { ...pr.qtyOverrides, [id]: v } })
  const toggle = (id: string) => set({ excludedIds: pr.excludedIds.includes(id) ? pr.excludedIds.filter((x) => x !== id) : [...pr.excludedIds, id] })
  const addCustom = () => set({ customItems: [...pr.customItems, { id: uid(), category: 'Custom', name: '', spec: '', unit: 'pcs', qty: 1, unitPriceUsd: 0, totalUsd: 0, source: 'custom' }] })
  const patchCustom = (id: string, x: Partial<BomLine>) => set({ customItems: pr.customItems.map((c) => (c.id === id ? { ...c, ...x } : c)) })
  const overridden = Object.keys(pr.priceOverrides).length + Object.keys(pr.qtyOverrides).length

  return (
    <div className="space-y-5">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label={t.bom.equipment} value={money(r.equipmentCostUsd, cur, fx)} />
        <Stat label={t.bom.services} value={money(r.labourUsd, cur, fx)} />
        <Stat label={`${t.bom.margin} ${pr.marginPct}%`} value={money(r.marginUsd, cur, fx)} />
        <Stat tone="brand" label={t.bom.grand} value={money(r.totalUsd, cur, fx)} sub={pr.vatPct ? `incl. ${t.bom.vat} ${pr.vatPct}%` : undefined} />
      </div>

      <Section title={t.bom.item} right={
        <div className="flex flex-wrap gap-2">
          <button className="btn-ghost text-xs" onClick={() => setShowExcluded((s) => !s)}>{showExcluded ? <EyeOff size={14} /> : <Eye size={14} />}{pr.excludedIds.length} {t.bom.excludedNote}</button>
          {overridden > 0 && <button className="btn-ghost text-xs" onClick={() => set({ priceOverrides: {}, qtyOverrides: {} })}><RotateCcw size={14} />{t.bom.reset}</button>}
          <button className="btn-secondary" onClick={addCustom}><Plus size={16} />{t.bom.addCustom}</button>
        </div>}>
        <p className="mb-3 text-xs text-slate-500">{t.bom.pricesNote}</p>
        <div className="overflow-x-auto"><table className="table">
          <thead><tr><th>#</th><th>{t.bom.item}</th><th>{t.bom.spec}</th><th>{t.bom.unit}</th><th>{t.bom.qty}</th><th>{t.bom.unitPrice} ({cur})</th><th>{t.bom.total}</th><th></th></tr></thead>
          <tbody>
            {categories.map((cat) => {
              const lines = allLines.filter((l) => l.category === cat)
              return [
                <tr key={cat} className="bg-slate-50"><td colSpan={8} className="text-xs font-semibold uppercase tracking-wide text-brand-800">{cat}</td></tr>,
                ...lines.map((l, i) => {
                  const excluded = pr.excludedIds.includes(l.id)
                  const custom = l.source === 'custom'
                  const c = pr.customItems.find((x) => x.id === l.id)
                  return (
                    <tr key={l.id} className={excluded ? 'opacity-40' : ''}>
                      <td className="text-xs text-slate-400">{i + 1}</td>
                      <td className="min-w-44">{custom ? <input className="input py-1" value={c?.name ?? ''} placeholder={t.bom.item} onChange={(e) => patchCustom(l.id, { name: e.target.value })} /> : <span className="font-medium">{l.name}</span>}</td>
                      <td className="min-w-40 text-xs text-slate-500">{custom ? <input className="input py-1" value={c?.spec ?? ''} placeholder={t.bom.spec} onChange={(e) => patchCustom(l.id, { spec: e.target.value })} /> : l.spec}</td>
                      <td className="text-xs">{custom ? <input className="input w-16 py-1" value={c?.unit ?? ''} onChange={(e) => patchCustom(l.id, { unit: e.target.value })} /> : l.unit}</td>
                      <td className="w-24"><NumberInput value={custom ? (c?.qty ?? 1) : (pr.qtyOverrides[l.id] ?? l.qty)} min={0} step={1} onChange={(v) => (custom ? patchCustom(l.id, { qty: v ?? 0 }) : setQty(l.id, v))} className={!custom && pr.qtyOverrides[l.id] != null ? '[&_input]:border-amber-400' : ''} /></td>
                      <td className="w-28"><NumberInput value={Math.round((custom ? (c?.unitPriceUsd ?? 0) : (pr.priceOverrides[l.id] ?? l.unitPriceUsd)) * fx * 100) / 100} min={0} step={0.5} onChange={(v) => (custom ? patchCustom(l.id, { unitPriceUsd: (v ?? 0) / fx }) : setPrice(l.id, v == null ? null : v / fx))} className={!custom && pr.priceOverrides[l.id] != null ? '[&_input]:border-amber-400' : ''} /></td>
                      <td className="tabular-nums font-medium">{money(l.totalUsd, cur, fx)}</td>
                      <td>{custom ? <button className="btn-ghost p-1 text-red-600" onClick={() => set({ customItems: pr.customItems.filter((x) => x.id !== l.id) })}><Trash2 size={15} /></button>
                        : <button className="btn-ghost p-1" title={excluded ? t.bom.include : t.bom.exclude} onClick={() => toggle(l.id)}>{excluded ? <Eye size={15} /> : <EyeOff size={15} />}</button>}</td>
                    </tr>
                  )
                }),
              ]
            })}
          </tbody>
        </table></div>
      </Section>

      <div className="grid gap-5 lg:grid-cols-2">
        <Section title={t.bom.services}>
          <div className="grid gap-4 sm:grid-cols-3">
            <Field label={t.bom.labourPerKw}><NumberInput value={pr.labourPerKwUsd} min={0} onChange={(v) => set({ labourPerKwUsd: v ?? 0 })} /></Field>
            <Field label={t.bom.transport}><NumberInput value={pr.transportUsd} min={0} onChange={(v) => set({ transportUsd: v ?? 0 })} /></Field>
            <Field label={t.bom.commissioning}><NumberInput value={pr.commissioningUsd} min={0} onChange={(v) => set({ commissioningUsd: v ?? 0 })} /></Field>
          </div>
        </Section>
        <Section title={t.bom.grand}>
          <div className="grid gap-4 sm:grid-cols-3">
            <Field label={`${t.bom.margin} %`}><NumberInput value={pr.marginPct} min={0} max={100} onChange={(v) => set({ marginPct: v ?? 0 })} /></Field>
            <Field label={`${t.bom.discount} %`}><NumberInput value={pr.discountPct} min={0} max={100} onChange={(v) => set({ discountPct: v ?? 0 })} /></Field>
            <Field label={`${t.bom.vat} %`}><NumberInput value={pr.vatPct} min={0} max={50} onChange={(v) => set({ vatPct: v ?? 0 })} /></Field>
          </div>
          <dl className="mt-4 space-y-1 text-sm">
            <L k={t.bom.subtotal} v={money(r.subtotalUsd, cur, fx)} />
            <L k={`${t.bom.margin} (${pr.marginPct}%)`} v={money(r.marginUsd, cur, fx)} />
            {pr.discountPct > 0 && <L k={`${t.bom.discount} (${pr.discountPct}%)`} v={'− ' + money(r.discountUsd, cur, fx)} />}
            {pr.vatPct > 0 && <L k={`${t.bom.vat} (${pr.vatPct}%)`} v={money(r.vatUsd, cur, fx)} />}
            <div className="flex justify-between border-t border-slate-200 pt-2 text-base font-bold"><dt>{t.bom.grand}</dt><dd className="tabular-nums">{money(r.totalUsd, cur, fx)}</dd></div>
            <p className="text-xs text-slate-500">{fmt(r.arrayKwp, 2)} kWp → {money(r.costPerWp, cur, fx, 2)} / Wp</p>
          </dl>
        </Section>
      </div>
    </div>
  )
}
function L({ k, v }: { k: string; v: string }) { return <div className="flex justify-between"><dt className="text-slate-600">{k}</dt><dd className="tabular-nums">{v}</dd></div> }
function omit<T extends Record<string, unknown>>(o: T, k: string): T { const c = { ...o }; delete c[k]; return c }
