import { useMemo, useState, type ReactNode } from 'react'
import { Search, Check, Sun, Zap, BatteryFull, Cpu, ChevronDown } from 'lucide-react'
import { useT } from '../../i18n'
import { Field, NumberInput, Section, Switch, Disclosure, Parts } from '../ui'
import { Sheet } from '../overlay'
import type { StepProps } from '../Wizard'
import { catalog } from '../../data/catalog'
import { fitsSystemVoltage } from '../../engine/compute'
import { fmt } from '../../engine/format'
import { formatQuoteMoney } from '../../engine/quote'
import { useAppStore } from '../../store/useAppStore'
import { iso } from '../../i18n/labels'

interface Opt { id: string; title: string; sub: string[]; price?: string; search: string }

function Picker({ open, onClose, title, options, value, autoId, autoTitle, autoSub, extra, recommendedId, onPick }: {
  open: boolean; onClose: () => void; title: string; options: Opt[]; value: string; autoId: string; autoTitle: string; autoSub?: string; extra?: { id: string; title: string }; recommendedId?: string; onPick: (id: string) => void
}) {
  const { t } = useT()
  const [q, setQ] = useState('')
  const list = useMemo(() => { const s = q.trim().toLowerCase(); return s ? options.filter((o) => o.search.toLowerCase().includes(s)) : options }, [q, options])
  const row = (id: string, ttl: ReactNode, sub?: string[], price?: string, badge?: ReactNode) => (
    <li key={id || '_'}>
      <button type="button" onClick={() => { onPick(id); onClose() }} aria-pressed={value === id} data-testid={`pick-${id || 'none'}`}
        className={`flex min-h-14 w-full items-center gap-3 rounded-xl px-3 py-2 text-start transition ${value === id ? 'bg-brand-50 ring-1 ring-brand-600' : 'hover:bg-slate-50'}`}>
        <span className="min-w-0 flex-1">
          <span className="flex flex-wrap items-center gap-x-2 gap-y-0.5"><span className="font-medium text-slate-900"><bdi>{ttl}</bdi></span>{badge}</span>
          {sub && <Parts parts={sub} className="mt-0.5 block text-xs text-slate-600" />}
        </span>
        {price && <span className="shrink-0 text-sm font-medium text-slate-700 tabular-nums"><bdi>{price}</bdi></span>}
        {value === id && <Check size={18} className="shrink-0 text-brand-700" />}
      </button>
    </li>
  )
  return (
    <Sheet open={open} onClose={onClose} title={title} variant="drawer" wide testId="equipment-picker">
      <div className="sticky top-0 z-10 -mx-4 bg-white px-4 pb-2 sm:-mx-5 sm:px-5">
        <div className="relative"><Search size={18} className="pointer-events-none absolute inset-y-0 start-3 my-auto text-slate-400" />
          <input className="input ps-10" type="search" dir="auto" placeholder={t.design.search} aria-label={t.design.search} value={q} onChange={(e) => setQ(e.target.value)} /></div>
      </div>
      <ul className="space-y-1">
        {row(autoId, autoTitle, autoSub ? [autoSub] : undefined, undefined, <span className="badge-info">{t.design.autoBadge}</span>)}
        {extra && row(extra.id, extra.title)}
        {list.map((o) => row(o.id, o.title, o.sub, o.price, o.id === recommendedId ? <span className="badge-ok">{t.design.recommendedBadge}</span> : undefined))}
        {!list.length && <li className="py-6 text-center text-sm text-slate-500">{t.design.noMatch}</li>}
      </ul>
    </Sheet>
  )
}

function EquipRow({ icon, label, title, sub, auto, onOpen, testId }: { icon: ReactNode; label: string; title: ReactNode; sub?: (string | false | null | undefined)[]; auto: boolean; onOpen: () => void; testId: string }) {
  const { t } = useT()
  return (
    <button type="button" onClick={onOpen} data-testid={testId} aria-haspopup="dialog"
      className="flex w-full items-center gap-3 border-b border-slate-100 py-3 text-start last:border-b-0 hover:bg-slate-50/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 sm:gap-4 sm:px-1">
      <span className="grid size-10 shrink-0 place-items-center rounded-lg bg-slate-100 text-slate-600">{icon}</span>
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-2 text-xs font-medium text-slate-500">{label}{auto && <span className="badge-info">{t.design.autoBadge}</span>}</span>
        <span className="mt-0.5 block font-medium text-slate-900"><bdi>{title}</bdi></span>
        {sub && <Parts parts={sub} className="block text-xs text-slate-600" />}
      </span>
      <span className="inline-flex shrink-0 items-center gap-1 text-sm font-medium text-brand-700"><span className="hidden sm:inline">{t.design.change}</span><ChevronDown size={18} /></span>
    </button>
  )
}

export function StepDesign({ project: p, results: r, quote, update }: StepProps) {
  const { t } = useT()
  const clientView = useAppStore((s) => s.clientView)
  const [picker, setPicker] = useState<'panel' | 'inverter' | 'battery' | 'controller' | null>(null)
  const d = p.design
  const set = (x: Partial<typeof d>) => update((prev) => ({ design: { ...prev.design, ...x } }))
  const hasBattery = d.systemType !== 'gridtie'
  const sysV = d.systemVoltage
  const fx = quote.fx
  const price = (usd: number) => (clientView ? undefined : `${t.design.costShort} ${formatQuoteMoney(usd * fx, quote, 0)}`)
  const invType = (x: string) => t.design.invTypes[x] ?? x
  const chem = (x: string) => t.design.chem[x] ?? x
  const tech = (x: string) => t.design.tech[x] ?? x

  const batteryPool = catalog.batteries.filter((b) => fitsSystemVoltage(b, sysV)).sort((a, b) => a.energyKwh - b.energyKwh)
  const inverterPool = catalog.inverters.filter((i) => i.phase === d.phase && (d.systemType === 'gridtie' ? true : sysV === 'hv' ? typeof i.batteryVoltage === 'string' : i.batteryVoltage === sysV) && (d.systemType === 'gridtie' ? i.type !== 'offgrid' && i.mpptCount > 0 : i.type !== 'gridtie')).sort((a, b) => a.ratedAcKw - b.ratedAcKw)
  const panelOpts: Opt[] = [...catalog.panels].sort((a, b) => a.watts - b.watts).map((x) => ({ id: x.id, title: `${x.brand} ${x.model}`, sub: [`${x.watts} W`, tech(x.technology), `${fmt(x.efficiencyPct, 1)}%`], price: price(x.approxPriceUsd), search: `${x.brand} ${x.model} ${x.watts}` }))
  const invOpts: Opt[] = inverterPool.map((x) => ({ id: x.id, title: `${x.brand} ${x.model}`, sub: [`${fmt(x.ratedAcKw, 1)} kW`, invType(x.type), t.design.phaseN(x.phase), `${x.mpptCount} MPPT`], price: price(x.approxPriceUsd), search: `${x.brand} ${x.model} ${x.ratedAcKw}` }))
  const batOpts: Opt[] = batteryPool.map((x) => ({ id: x.id, title: `${x.brand} ${x.model}`, sub: [`${x.nominalVoltage} V`, `${x.capacityAh} Ah`, `${fmt(x.energyKwh, 1)} kWh`, chem(x.chemistry)], price: price(x.approxPriceUsd), search: `${x.brand} ${x.model} ${x.energyKwh} ${x.chemistry}` }))
  const ccOpts: Opt[] = catalog.chargeControllers.map((x) => ({ id: x.id, title: `${x.brand} ${x.model}`, sub: [`${x.maxChargeA} A`, `${x.maxPvVoltage} V`], price: price(x.approxPriceUsd), search: `${x.brand} ${x.model} ${x.maxChargeA}` }))

  const battLine = r.bom.find((b) => b.category === 'Battery')
  const battName = r.battery ? `${r.battery.brand} ${r.battery.model}` : battLine?.name
  const curPanel = `${r.panelQty} × ${r.panel.brand} ${r.panel.model}`
  const curInv = r.inverter ? `${r.inverterQty} × ${r.inverter.brand} ${r.inverter.model}` : '—'
  const curBatt = d.batteryId === null ? t.design.noBattery : battName ? `${r.batteryQty} × ${battName}` : '—'
  const curCc = r.controller ? `${r.controllerQty} × ${r.controller.brand} ${r.controller.model}` : '—'
  const autonomyHelp = d.systemType === 'offgrid' ? t.design.autonomyOffgrid : t.design.autonomyHybrid

  return (
    <div className="grid grid-cols-1 gap-4 sm:gap-5 lg:grid-cols-5">
      <Section title={t.design.equipment} className="lg:col-span-3">
        <div className="-my-1">
          <EquipRow testId="eq-panel" icon={<Sun size={20} />} label={t.design.panel} auto={d.panelId === 'auto'} title={curPanel}
            sub={[`${r.panel.watts} W`, `${fmt(r.arrayKwp, 2)} kWp`, tech(r.panel.technology)]} onOpen={() => setPicker('panel')} />
          <EquipRow testId="eq-inverter" icon={<Zap size={20} />} label={t.design.inverter} auto={!d.inverterId} title={curInv}
            sub={r.inverter ? [`${fmt(r.inverter.ratedAcKw, 1)} kW`, invType(r.inverter.type), t.design.phaseN(r.inverter.phase), `${r.inverter.mpptCount} MPPT`] : undefined} onOpen={() => setPicker('inverter')} />
          {hasBattery && <EquipRow testId="eq-battery" icon={<BatteryFull size={20} />} label={t.design.battery} auto={d.batteryId === 'auto'} title={curBatt}
            sub={d.batteryId !== null && r.batteryKwh ? [`${fmt(r.batteryKwh, 1)} kWh`, `${r.batteryConfig.series}S × ${r.batteryConfig.parallel}P`] : undefined} onOpen={() => setPicker('battery')} />}
          {hasBattery && d.useSeparateController && <EquipRow testId="eq-controller" icon={<Cpu size={20} />} label={t.results.ctrl} auto={!d.chargeControllerId} title={curCc}
            sub={[t.design.ampsNeeded(fmt(r.requiredControllerA))]} onOpen={() => setPicker('controller')} />}
        </div>
        <div className="mt-4 grid grid-cols-2 gap-x-3 gap-y-4 border-t border-slate-100 pt-4 sm:gap-x-4">
          <Field label={t.design.panelQty} help={d.panelOverrideQty == null ? t.design.autoPick(String(r.panelQty)) : undefined}><NumberInput integer stepper value={d.panelOverrideQty} allowEmpty min={1} placeholder={String(r.panelQty)} onChange={(v) => set({ panelOverrideQty: v })} /></Field>
          {d.inverterId ? <Field label={t.design.inverterQty}><NumberInput integer stepper value={d.inverterQty} min={1} max={16} onChange={(v) => set({ inverterQty: v ?? 1 })} /></Field> : <div />}
          {hasBattery && d.batteryId !== null && <Field label={t.design.battQty} help={d.batteryOverrideQty == null ? t.design.autoPick(String(r.batteryQty)) : undefined}><NumberInput integer stepper value={d.batteryOverrideQty} allowEmpty min={1} placeholder={String(r.batteryQty)} onChange={(v) => set({ batteryOverrideQty: v })} /></Field>}
          {hasBattery && <div className="col-span-2"><Switch checked={d.useSeparateController} onChange={(v) => set({ useSeparateController: v })} label={t.design.controller} data-testid="sw-controller" /></div>}
        </div>
      </Section>

      <div className="space-y-4 sm:space-y-5 lg:col-span-2">
        <Section title={t.design.title}>
          <div className="grid grid-cols-1 gap-4">
            {hasBattery && (
              <Field label={t.design.voltage}>
                <select className="input" value={String(sysV)} onChange={(e) => set({ systemVoltage: e.target.value === 'hv' ? 'hv' : (Number(e.target.value) as 12 | 24 | 48), batteryId: d.batteryId === null ? null : 'auto', inverterId: null })} data-testid="design-voltage">
                  {(['12', '24', '48', 'hv'] as const).map((k) => <option key={k} value={k}>{iso(t.design.voltages[k])}</option>)}
                </select>
              </Field>
            )}
            {hasBattery && <Field label={t.design.autonomy} help={autonomyHelp}><NumberInput value={d.autonomyDays} step={0.5} min={0.25} max={5} onChange={(v) => set({ autonomyDays: v ?? 1 })} /></Field>}
            {!hasBattery && <p className="text-sm text-slate-600">{t.info.gridtieHelp}</p>}
          </div>
          <div className="mt-4 border-t border-slate-100 pt-1">
            <Disclosure title={t.design.advanced} description={t.design.advancedHelp} defaultOpen={false} testId="design-advanced">
              <div className="grid grid-cols-2 gap-x-3 gap-y-4 pb-1 sm:gap-x-4">
                <Field label={t.design.pvOversize}><NumberInput value={d.pvOversize} step={0.05} min={0.8} max={2} onChange={(v) => set({ pvOversize: v ?? 1 })} /></Field>
                <Field label={t.design.inverterSafety}><NumberInput value={d.inverterSafety} step={0.05} min={1} max={2} onChange={(v) => set({ inverterSafety: v ?? 1.25 })} /></Field>
                {hasBattery && <Field label={t.design.dod}><NumberInput value={d.dodOverridePct} allowEmpty min={20} max={100} placeholder={iso(t.design.autoValue(fmt(r.dod * 100)))} onChange={(v) => set({ dodOverridePct: v })} suffix="%" /></Field>}
                <Field label={t.design.degradation}><NumberInput value={d.degradationPctPerYear} step={0.1} min={0} max={3} onChange={(v) => set({ degradationPctPerYear: v ?? 0.5 })} /></Field>
                <Field label={t.design.years}><NumberInput integer value={d.analysisYears} min={5} max={30} onChange={(v) => set({ analysisYears: v ?? 25 })} /></Field>
                <Field label={t.design.escalation}><NumberInput value={d.tariffEscalationPct ?? 3} step={0.5} min={0} max={30} onChange={(v) => set({ tariffEscalationPct: v ?? 3 })} suffix="%" /></Field>
                <Field label={t.design.discountRate}><NumberInput value={d.discountRatePct ?? 6} step={0.5} min={0} max={50} onChange={(v) => set({ discountRatePct: v ?? 6 })} suffix="%" /></Field>
                <Field label={t.design.om}><NumberInput value={d.omPctPerYear ?? 1} step={0.25} min={0} max={10} onChange={(v) => set({ omPctPerYear: v ?? 1 })} suffix="%" /></Field>
                <p className="col-span-2 mt-1 text-sm font-semibold text-slate-800">{t.design.cables}</p>
                <Field label={t.design.dcRun}><NumberInput value={d.dcCableRunM} min={1} max={500} onChange={(v) => set({ dcCableRunM: v ?? 20 })} suffix="m" /></Field>
                {hasBattery && <Field label={t.design.battRun}><NumberInput value={d.batteryCableRunM} min={0.5} max={50} step={0.5} onChange={(v) => set({ batteryCableRunM: v ?? 2 })} suffix="m" /></Field>}
                <Field label={t.design.acRun}><NumberInput value={d.acCableRunM} min={1} max={500} onChange={(v) => set({ acCableRunM: v ?? 15 })} suffix="m" /></Field>
                <Field label={t.design.drop}><NumberInput value={d.maxVoltageDropPct} step={0.5} min={0.5} max={5} onChange={(v) => set({ maxVoltageDropPct: v ?? 2 })} suffix="%" /></Field>
                {hasBattery && <div className="col-span-2"><Switch checked={d.generatorBackup} onChange={(v) => set({ generatorBackup: v })} label={t.design.generator} data-testid="sw-generator" /></div>}
                {hasBattery && d.generatorBackup && <Field label={t.design.generatorKva} className="col-span-2"><NumberInput value={d.generatorKva} allowEmpty min={1} placeholder={r.generatorKva ? iso(t.design.autoValue(`${r.generatorKva} kVA`)) : ''} onChange={(v) => set({ generatorKva: v })} suffix="kVA" /></Field>}
              </div>
            </Disclosure>
          </div>
        </Section>
      </div>

      <Picker open={picker === 'panel'} onClose={() => setPicker(null)} title={t.design.pickTitle(t.design.panel)} options={panelOpts} value={d.panelId} autoId="auto"
        autoTitle={t.design.auto} autoSub={t.design.autoPick(`${r.panel.brand} ${r.panel.model}`)} recommendedId={d.panelId === 'auto' ? r.panel.id : undefined} onPick={(id) => set({ panelId: id, panelOverrideQty: null })} />
      <Picker open={picker === 'inverter'} onClose={() => setPicker(null)} title={t.design.pickTitle(t.design.inverter)} options={invOpts} value={d.inverterId ?? ''} autoId=""
        autoTitle={t.design.auto} autoSub={r.inverter && !d.inverterId ? t.design.autoPick(`${r.inverter.brand} ${r.inverter.model}`) : undefined} recommendedId={!d.inverterId ? r.inverter?.id : undefined} onPick={(id) => set({ inverterId: id || null, inverterQty: id ? d.inverterQty : 1 })} />
      <Picker open={picker === 'battery'} onClose={() => setPicker(null)} title={t.design.pickTitle(t.design.battery)} options={batOpts} value={d.batteryId ?? ''} autoId="auto"
        autoTitle={t.design.auto} autoSub={d.batteryId === 'auto' && battName ? t.design.autoPick(battName) : undefined} extra={{ id: '', title: t.design.noBattery }} recommendedId={d.batteryId === 'auto' ? r.battery?.id : undefined} onPick={(id) => set({ batteryId: id || null, batteryOverrideQty: null })} />
      <Picker open={picker === 'controller'} onClose={() => setPicker(null)} title={t.design.pickTitle(t.results.ctrl)} options={ccOpts} value={d.chargeControllerId ?? ''} autoId=""
        autoTitle={t.design.auto} autoSub={r.controller && !d.chargeControllerId ? t.design.autoPick(`${r.controller.brand} ${r.controller.model}`) : undefined} onPick={(id) => set({ chargeControllerId: id || null })} />
    </div>
  )
}
