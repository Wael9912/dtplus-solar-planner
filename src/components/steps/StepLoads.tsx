import { useMemo, useState } from 'react'
import { Plus, Trash2, Search, X } from 'lucide-react'
import { useT } from '../../i18n'
import { Field, NumberInput, Section, Stat, Empty } from '../ui'
import type { StepProps } from '../Wizard'
import type { LoadItem } from '../../engine/types'
import { appliances, applianceCategories } from '../../data/appliances'
import { loadFromAppliance, uid } from '../../engine/defaults'
import { fmt } from '../../engine/format'
import { loadTemplates } from '../../data/samples'

export function StepLoads({ project: p, results: r, update }: StepProps) {
  const { t, lang } = useT()
  const [q, setQ] = useState('')
  const [cat, setCat] = useState('all')
  const [showLib, setShowLib] = useState(p.loads.length === 0)
  const setLoads = (loads: LoadItem[]) => update({ loads })
  const patch = (id: string, x: Partial<LoadItem>) => setLoads(p.loads.map((l) => (l.id === id ? { ...l, ...x } : l)))
  const addAppliance = (aid: string) => { const a = appliances.find((x) => x.id === aid); if (!a) return; setLoads([...p.loads, loadFromAppliance(a)]) }
  const addCustom = () => setLoads([...p.loads, { id: uid(), name: '', category: 'other', watts: 100, qty: 1, hoursPerDay: 4, surgeFactor: 1, nightSharePct: 40, phase: 1, critical: true }])
  const filtered = useMemo(() => appliances.filter((a) => (cat === 'all' || a.category === cat) && ((lang === 'ar' ? a.nameAr ?? a.name : a.name) + a.name).toLowerCase().includes(q.toLowerCase())), [q, cat, lang])
  const isHybrid = p.design.systemType === 'hybrid'

  return (
    <div className="space-y-5">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <Stat label={t.loads.totalDaily} value={`${fmt(r.dailyWh / 1000, 2)} ${t.common.kwh}`} sub={`${fmt(r.monthlyKwh)} ${t.common.kwh} ${t.loads.monthly}`} tone="brand" />
        <Stat label={t.loads.connected} value={`${fmt(r.connectedW)} ${t.common.w}`} />
        <Stat label={t.loads.peak} value={`${fmt(r.peakW)} ${t.common.w}`} sub={`× ${p.design.coincidenceFactor}`} />
        <Stat label={t.loads.surgeW} value={`${fmt(r.surgeW)} ${t.common.w}`} />
        <Stat label={t.loads.nightEnergy} value={`${fmt(r.nightWh / 1000, 2)} ${t.common.kwh}`} sub={r.dailyWh ? `${fmt((r.nightWh / r.dailyWh) * 100)}%` : ''} />
      </div>

      <Section title={t.loads.name} right={
        <div className="flex flex-wrap gap-2">
          <button className="btn-secondary" onClick={() => setShowLib((s) => !s)}><Plus size={16} />{t.loads.library}</button>
          <button className="btn-secondary" onClick={addCustom}><Plus size={16} />{t.loads.custom}</button>
          {p.loads.length > 0 && <button className="btn-ghost text-red-600" onClick={() => setLoads([])}><Trash2 size={16} />{t.loads.clear}</button>}
        </div>}>
        {showLib && (
          <div className="mb-4 rounded-xl border border-brand-200 bg-brand-50/50 p-3">
            <div className="mb-2 flex flex-wrap items-center gap-2">
              <div className="relative flex-1 min-w-48"><Search size={14} className="pointer-events-none absolute inset-y-0 start-3 my-auto text-slate-400" /><input className="input ps-8" placeholder={t.loads.search} value={q} onChange={(e) => setQ(e.target.value)} autoFocus /></div>
              <select className="input w-auto" value={cat} onChange={(e) => setCat(e.target.value)}><option value="all">All</option>{applianceCategories.map((c) => <option key={c} value={c}>{c}</option>)}</select>
              <span className="text-xs text-slate-500">{t.loads.templates}:</span>
              {loadTemplates.map((tp) => <button key={tp.key} className="btn-ghost text-xs" onClick={() => setLoads([...p.loads, ...tp.build()])}>{t.loads[tp.key]}</button>)}
              <button className="btn-ghost" onClick={() => setShowLib(false)}><X size={16} /></button>
            </div>
            <div className="grid max-h-56 gap-1 overflow-y-auto sm:grid-cols-2 lg:grid-cols-3">
              {filtered.map((a) => (
                <button key={a.id} onClick={() => addAppliance(a.id)} className="flex items-center justify-between rounded-lg border border-slate-200 bg-white px-3 py-2 text-start text-sm hover:border-brand-400">
                  <span><span className="font-medium">{lang === 'ar' ? a.nameAr ?? a.name : a.name}</span><span className="block text-xs text-slate-500">{a.category} · {a.hoursPerDay} h{a.surgeFactor > 1 ? ` · surge ×${a.surgeFactor}` : ''}</span></span>
                  <span className="tabular-nums text-slate-700">{a.watts} W</span>
                </button>
              ))}
            </div>
          </div>
        )}
        {p.loads.length === 0 ? <Empty>{t.loads.empty}</Empty> : (
          <div className="overflow-x-auto">
            <table className="table">
              <thead><tr><th>{t.loads.name}</th><th>{t.loads.watts}</th><th>{t.loads.qty}</th><th>{t.loads.hours}</th><th>{t.loads.night}</th><th>{t.loads.surge}</th>{p.design.phase === 3 && <th>{t.loads.phase}</th>}{isHybrid && <th title={t.loads.criticalHelp}>{t.loads.critical}</th>}<th>{t.loads.daily}</th><th></th></tr></thead>
              <tbody>
                {p.loads.map((l) => (
                  <tr key={l.id}>
                    <td className="min-w-40"><input className="input py-1" value={l.name} placeholder={t.loads.name} onChange={(e) => patch(l.id, { name: e.target.value })} /></td>
                    <td className="w-24"><NumberInput value={l.watts} onChange={(v) => patch(l.id, { watts: v ?? 0 })} min={0} /></td>
                    <td className="w-20"><NumberInput value={l.qty} onChange={(v) => patch(l.id, { qty: v ?? 0 })} min={0} /></td>
                    <td className="w-24"><NumberInput value={l.hoursPerDay} onChange={(v) => patch(l.id, { hoursPerDay: Math.min(24, v ?? 0) })} min={0} max={24} step={0.5} /></td>
                    <td className="w-24"><NumberInput value={l.nightSharePct} onChange={(v) => patch(l.id, { nightSharePct: Math.min(100, v ?? 0) })} min={0} max={100} step={10} /></td>
                    <td className="w-20"><NumberInput value={l.surgeFactor} onChange={(v) => patch(l.id, { surgeFactor: v ?? 1 })} min={1} step={0.5} /></td>
                    {p.design.phase === 3 && <td className="w-20"><select className="input py-1" value={l.phase} onChange={(e) => patch(l.id, { phase: Number(e.target.value) as 1 | 3 })}><option value={1}>1φ</option><option value={3}>3φ</option></select></td>}
                    {isHybrid && <td className="text-center"><input type="checkbox" checked={l.critical} onChange={(e) => patch(l.id, { critical: e.target.checked })} className="h-4 w-4 accent-brand-700" /></td>}
                    <td className="tabular-nums font-medium">{fmt(l.watts * l.qty * l.hoursPerDay)}</td>
                    <td><button className="btn-ghost p-1 text-red-600" onClick={() => setLoads(p.loads.filter((x) => x.id !== l.id))}><Trash2 size={15} /></button></td>
                  </tr>
                ))}
              </tbody>
              <tfoot><tr className="font-semibold"><td colSpan={p.design.phase === 3 ? (isHybrid ? 8 : 7) : (isHybrid ? 7 : 6)} className="text-end">{t.loads.totalDaily}</td><td className="tabular-nums">{fmt(r.dailyWh)} Wh</td><td></td></tr></tfoot>
            </table>
          </div>
        )}
        <div className="mt-4 grid gap-4 sm:grid-cols-3">
          <Field label={t.loads.coincidence} help={t.loads.coincidenceHelp}><NumberInput value={p.design.coincidenceFactor} onChange={(v) => update((prev) => ({ design: { ...prev.design, coincidenceFactor: Math.min(1, Math.max(0.3, v ?? 0.8)) } }))} min={0.3} max={1} step={0.05} /></Field>
        </div>
      </Section>
    </div>
  )
}
