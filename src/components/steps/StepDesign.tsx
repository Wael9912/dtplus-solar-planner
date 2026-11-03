import { Fragment, useMemo, useState, type ReactNode } from 'react'
import { Search, Check, Sun, Zap, BatteryFull, Cpu, ChevronDown, Info, Lightbulb } from 'lucide-react'
import { useT } from '../../i18n'
import { Field, NumberInput, Section, Switch, Disclosure, Parts, Segmented } from '../ui'
import { Sheet } from '../overlay'
import type { StepProps } from '../Wizard'
import type { Project, SizeTargets, SystemType, Results } from '../../engine/types'
import type { Dict } from '../../i18n/en'
import { fitsSystemVoltage } from '../../engine/compute'
import { applySystemType, modeDefaults } from '../../engine/defaults'
import { projectMode, resolveSizing } from '../../engine/sizing'
import { CUSTOM_PREFIX } from '../../engine/catalogContext'
import { fmt } from '../../engine/format'
import { formatQuoteMoney } from '../../engine/quote'
import { useAppStore } from '../../store/useAppStore'
import { useCatalog } from '../useEngine'
import { iso } from '../../i18n/labels'
import { toast } from '../../store/useToast'

interface Opt { id: string; title: string; sub: string[]; price?: string; search: string; hidden?: boolean; own?: boolean }

/** Let a label wrap at spaces but not at the hyphen of “Single-phase”. */
const nbHyphen = (s: string) => s.split(' ').map((w, i) => <Fragment key={i}>{i > 0 && ' '}{w.includes('-') ? <span className="whitespace-nowrap">{w}</span> : w}</Fragment>)

function Picker({ open, onClose, title, options, value, autoId, autoTitle, autoSub, extra, recommendedId, onPick }: {
  open: boolean; onClose: () => void; title: string; options: Opt[]; value: string; autoId: string; autoTitle: string; autoSub?: string; extra?: { id: string; title: string }; recommendedId?: string; onPick: (id: string) => void
}) {
  const { t } = useT()
  const [q, setQ] = useState('')
  // Every word, any order ("deye 8", "lfp 5")
  const list = useMemo(() => { const ws = q.trim().toLowerCase().split(/\s+/).filter(Boolean); return ws.length ? options.filter((o) => { const s = o.search.toLowerCase(); return ws.every((w) => s.includes(w)) }) : options }, [q, options])
  const row = (id: string, ttl: ReactNode, sub?: string[], price?: string, badge?: ReactNode) => (
    <li key={id || '_'}>
      <button type="button" onClick={() => { onPick(id); onClose() }} aria-pressed={value === id} data-testid={`pick-${id || 'none'}`}
        className={`flex min-h-14 w-full items-center gap-3 rounded-xl px-3 py-2 text-start transition ${value === id ? 'bg-brand-50 ring-1 ring-brand-600' : 'hover:bg-slate-50'}`}>
        <span className="min-w-0 flex-1">
          <span className="flex flex-wrap items-center gap-x-2 gap-y-0.5"><span className="font-medium text-slate-900 [overflow-wrap:anywhere]"><bdi>{ttl}</bdi></span>{badge}</span>
          {sub && <Parts parts={sub} className="mt-0.5 block text-xs text-slate-600" />}
        </span>
        {price && <span className="shrink-0 text-sm font-medium text-slate-700 tabular-nums"><bdi>{price}</bdi></span>}
        {value === id && <Check size={18} className="shrink-0 text-brand-700" />}
      </button>
    </li>
  )
  const tags = (o: Opt) => (o.id === recommendedId || o.hidden || o.own) ? <>
    {o.id === recommendedId && <span className="badge-ok">{t.design.recommendedBadge}</span>}
    {o.own && <span className="badge-info">{t.inputs.design.ownProduct}</span>}
    {o.hidden && <span className="badge-warn" data-testid="not-stocked">{t.inputs.design.notStocked}</span>}
  </> : undefined
  return (
    <Sheet open={open} onClose={onClose} title={title} variant="drawer" wide testId="equipment-picker">
      <div className="sticky top-0 z-10 -mx-4 bg-white px-4 pb-2 sm:-mx-5 sm:px-5">
        <div className="relative"><Search size={18} className="pointer-events-none absolute inset-y-0 start-3 my-auto text-slate-400" />
          <input className="input ps-10" type="search" dir="auto" placeholder={t.design.search} aria-label={t.design.search} value={q} onChange={(e) => setQ(e.target.value)} /></div>
      </div>
      <ul className="space-y-1">
        {row(autoId, autoTitle, autoSub ? [autoSub] : undefined, undefined, <span className="badge-info">{t.design.autoBadge}</span>)}
        {extra && row(extra.id, extra.title)}
        {list.map((o) => row(o.id, o.title, o.sub, o.price, tags(o)))}
        {!list.length && <li className="py-6 text-center text-sm text-slate-500">{t.design.noMatch}</li>}
      </ul>
    </Sheet>
  )
}

function EquipRow({ icon, label, title, sub, auto, notStocked, onOpen, testId }: { icon: ReactNode; label: string; title: ReactNode; sub?: (string | false | null | undefined)[]; auto: boolean; notStocked?: boolean; onOpen: () => void; testId: string }) {
  const { t } = useT()
  return (
    <button type="button" onClick={onOpen} data-testid={testId} aria-haspopup="dialog"
      className="flex w-full items-center gap-3 border-b border-slate-100 py-3 text-start last:border-b-0 hover:bg-slate-50/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 sm:gap-4 sm:px-1">
      <span className="grid size-10 shrink-0 place-items-center rounded-lg bg-slate-100 text-slate-600">{icon}</span>
      <span className="min-w-0 flex-1">
        <span className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs font-medium text-slate-500">{label}{auto && <span className="badge-info">{t.design.autoBadge}</span>}{notStocked && <span className="badge-warn">{t.inputs.design.notStocked}</span>}</span>
        <span className="mt-0.5 block font-medium text-slate-900 [overflow-wrap:anywhere]"><bdi>{title}</bdi></span>
        {sub && <Parts parts={sub} className="block text-xs text-slate-600" />}
      </span>
      <span className="inline-flex shrink-0 items-center gap-1 text-sm font-medium text-brand-700"><span className="hidden sm:inline">{t.design.change}</span><ChevronDown size={18} /></span>
    </button>
  )
}

/** One fixed size (kWp / kWh / kW): empty = auto (the placeholder shows what auto gives), with the installed result underneath. */
function TargetField({ label, value, auto, unit, installed, why, disabled, disabledText, onChange, testId, children }: {
  label: string; value: number | null; auto: string; unit: string; installed: ReactNode; why?: string; disabled?: boolean; disabledText?: string
  onChange: (v: number | null) => void; testId: string; children?: ReactNode
}) {
  const { t } = useT()
  const T = t.inputs.design
  const fixed = value != null && !disabled
  return (
    <div className="min-w-0">
      <Field label={<span className="flex flex-wrap items-center gap-x-2 gap-y-0.5">{label}{!disabled && (fixed ? <span className="badge-neutral">{T.fixedBadge}</span> : <span className="badge-info">{T.autoBadge}</span>)}</span>}
        help={<bdi>{installed}</bdi>}>
        <NumberInput value={disabled ? null : value} allowEmpty min={0.1} max={100000} step={0.5} suffix={unit} disabled={disabled}
          placeholder={disabled ? disabledText : iso(t.design.autoValue(auto))} onChange={onChange} data-testid={testId} />
      </Field>
      {/* Installed ≠ fixed size: one line saying why (whole panels / strings, battery modules, catalogue inverter sizes) */}
      {fixed && why && <p className="mt-1 flex items-start gap-1.5 text-xs leading-5 text-slate-600" data-testid={`${testId}-why`}><Info size={14} className="mt-[3px] shrink-0 text-slate-400" aria-hidden="true" /><span className="min-w-0">{why}</span></p>}
      {(fixed || children) && (
        <div className="mt-1 flex flex-wrap items-center gap-x-4">
          {children}
          {fixed && <button type="button" className="btn-link min-h-11" onClick={() => onChange(null)} data-testid={`${testId}-auto`}>{T.useAuto}</button>}
        </div>
      )}
    </div>
  )
}

/** Shown under a fixed size when the installed system differs from it — derived from the results (the engine rounds to whole products). */
function sizeReasons(p: Project, r: Results, T: Dict['inputs']['design']): { pv?: string; batt?: string; inv?: string } {
  const tg = resolveSizing(p).targets
  const d = p.design, qo = p.pricing.qtyOverrides ?? {}
  const W = String(r.panel.watts)
  const out: { pv?: string; batt?: string; inv?: string } = {}
  // Solar array: whole panels, then equal strings
  const pv = tg.pvKwp
  if (pv != null && pv > 0 && r.panelQty > 0 && Math.abs(r.arrayKwp - pv) >= 0.005) {
    const minQty = Math.max(1, Math.ceil((pv * 1000) / r.panel.watts - 1e-9))
    out.pv = d.panelOverrideQty != null || qo[r.panel.id] != null ? T.whyPvManual
      : r.strings && r.strings.totalPanels === r.panelQty && r.panelQty !== minQty ? T.whyPvStrings(r.strings.strings, r.strings.panelsPerString, W)
        : T.whyPvWhole(W, r.panelQty)
  }
  // Battery: whole modules (and whole series strings on a low-voltage bus)
  const bk = d.systemType === 'gridtie' ? null : tg.batteryKwh
  if (bk != null && bk > 0 && r.battery && r.batteryQty > 0 && Math.abs(r.batteryKwh - bk) > Math.max(0.01, bk * 0.002)) {
    const e = fmt(r.battery.energyKwh, r.battery.energyKwh % 1 ? 2 : 0)
    out.batt = d.batteryOverrideQty != null || qo[r.battery.id] != null ? T.whyBattManual
      : r.batteryConfig.series > 1 ? T.whyBattSeries(e, r.batteryConfig.series, String(d.systemVoltage))
        : T.whyBattModules(e)
  }
  // Inverter: the engine picks catalogue units at or above the size that also suit the array (and the battery bus)
  const ik = tg.inverterKw
  if (ik != null && ik > 0 && r.inverter && Math.abs(r.inverterTotalKw - ik) >= 0.05) {
    const kw = fmt(r.inverterTotalKw, r.inverterTotalKw % 1 ? 1 : 0), target = fmt(ik, ik % 1 ? 1 : 0)
    out.inv = d.inverterId || qo[r.inverter.id] != null ? T.whyInvManual
      : r.inverterTotalKw < ik ? T.whyInvBelow
        : d.systemType === 'gridtie' ? T.whyInvGridTie(target, kw)
          : r.inverterQty > 1 ? T.whyInvParallel(r.inverterQty, fmt(r.inverter.ratedAcKw, r.inverter.ratedAcKw % 1 ? 1 : 0))
            : T.whyInvNearest(target, W, kw)
  }
  return out
}

/** PV kWp / battery kWh / inverter kW targets (§15.2): null = auto, PV 0 = no panels (backup only), battery 0 = no battery. */
function SizeInputs({ p, r, update, columns }: { p: Project; r: Results; update: StepProps['update']; columns: string }) {
  const { t } = useT()
  const T = t.inputs.design
  const tg = resolveSizing(p).targets
  const gt = p.design.systemType === 'gridtie'
  // Switching "no panels" / "no battery" off again restores the size that was there before
  const [lastPv, setLastPv] = useState<number | null>(null), [lastBatt, setLastBatt] = useState<number | null>(null)
  const setT = (x: Partial<SizeTargets>) => update((prev) => { const sz = resolveSizing(prev); return { sizing: { ...sz, targets: { ...sz.targets, ...x } } } })
  const noPv = tg.pvKwp === 0, noBatt = tg.batteryKwh === 0
  const why = sizeReasons(p, r, T)
  return (
    <div className={`grid grid-cols-1 gap-x-4 gap-y-4 ${columns}`} data-testid="size-targets">
      <TargetField label={T.pvKwp} value={tg.pvKwp} auto={fmt(r.arrayKwp, 2)} unit="kWp" disabled={noPv} disabledText={T.noPanels} testId="target-pv"
        installed={r.panelQty > 0 ? T.installed(`${r.panelQty} × ${r.panel.watts} W = ${fmt(r.arrayKwp, 2)} kWp`) : T.noPanels} why={why.pv} onChange={(v) => setT({ pvKwp: v })}>
        <Switch checked={noPv} onChange={(on) => { if (on) setLastPv(tg.pvKwp); setT({ pvKwp: on ? 0 : lastPv }) }} label={T.noPv} data-testid="sw-no-pv" />
      </TargetField>
      {!gt && (
        <TargetField label={T.battKwh} value={tg.batteryKwh} auto={fmt(r.batteryKwh, 1)} unit="kWh" disabled={noBatt} disabledText={T.noBatt} testId="target-batt"
          installed={r.battery && r.batteryQty > 0 ? T.installed(`${r.batteryQty} × ${fmt(r.battery.energyKwh, 2)} kWh = ${fmt(r.batteryKwh, 2)} kWh`) : T.noBatt} why={why.batt} onChange={(v) => setT({ batteryKwh: v })}>
          <Switch checked={noBatt} onChange={(on) => { if (on) setLastBatt(tg.batteryKwh); setT({ batteryKwh: on ? 0 : lastBatt }) }} label={T.noBatt} data-testid="sw-no-batt" />
        </TargetField>
      )}
      <TargetField label={T.invKw} value={tg.inverterKw} auto={fmt(r.inverterTotalKw, 1)} unit="kW" testId="target-inv"
        installed={r.inverter ? T.installed(`${r.inverterQty} × ${fmt(r.inverter.ratedAcKw, 1)} kW = ${fmt(r.inverterTotalKw, 1)} kW`) : '—'} why={why.inv} onChange={(v) => setT({ inverterKw: v })} />
    </div>
  )
}

/** Panels / batteries / inverters already on site: designed with the system, deducted from the quote. */
function ExistingInputs({ p, r, update }: { p: Project; r: Results; update: StepProps['update'] }) {
  const { t } = useT()
  const T = t.inputs.design
  const ex = resolveSizing(p).existing
  const gt = p.design.systemType === 'gridtie'
  const setE = (x: Partial<typeof ex>) => update((prev) => { const sz = resolveSizing(prev); return { sizing: { ...sz, existing: { ...sz.existing, ...x } } } })
  const any = ex.panels + ex.batteries + ex.inverters > 0
  return (
    <Disclosure title={T.existingTitle} description={T.existingHelp} defaultOpen={any} testId="existing-equipment">
      <p className="mb-3 text-sm text-slate-600">{T.existingBody}</p>
      <div className="grid grid-cols-2 gap-x-3 gap-y-4 pb-1 sm:grid-cols-3 sm:gap-x-4">
        <Field label={T.existingPanels} help={T.ofDesign(r.panelQty)}><NumberInput integer stepper value={ex.panels} min={0} max={9999} onChange={(v) => setE({ panels: v ?? 0 })} data-testid="existing-panels" /></Field>
        {!gt && <Field label={T.existingBatteries} help={T.ofDesign(r.batteryQty)}><NumberInput integer stepper value={ex.batteries} min={0} max={999} onChange={(v) => setE({ batteries: v ?? 0 })} data-testid="existing-batteries" /></Field>}
        <Field label={T.existingInverters} help={T.ofDesign(r.inverter ? r.inverterQty : 0)}><NumberInput integer stepper value={ex.inverters} min={0} max={99} onChange={(v) => setE({ inverters: v ?? 0 })} data-testid="existing-inverters" /></Field>
      </div>
    </Disclosure>
  )
}

export function StepDesign({ project: p, results: r, quote, update }: StepProps) {
  const { t } = useT()
  const T = t.inputs.design
  const C = useCatalog()
  const clientView = useAppStore((s) => s.clientView)
  const [picker, setPicker] = useState<'panel' | 'inverter' | 'battery' | 'controller' | null>(null)
  const d = p.design
  const mode = projectMode(p)
  const sizeMode = mode === 'size'
  const tg = resolveSizing(p).targets
  const set = (x: Partial<typeof d>) => update((prev) => ({ design: { ...prev.design, ...x } }))
  const hasBattery = d.systemType !== 'gridtie'
  const sysV = d.systemVoltage
  const fx = quote.fx
  const price = (usd: number) => (clientView ? undefined : `${t.design.costShort} ${formatQuoteMoney(usd * fx, quote, 0)}`)
  const invType = (x: string) => t.design.invTypes[x] ?? x
  const chem = (x: string) => t.design.chem[x] ?? x
  const tech = (x: string) => t.design.tech[x] ?? x
  const flags = (id: string) => ({ hidden: C.hidden.has(id), own: id.startsWith(CUSTOM_PREFIX) })

  // Company price list: company prices, own products, and products not stocked (tagged, still pickable)
  const batteryPool = C.batteries.filter((b) => fitsSystemVoltage(b, sysV)).sort((a, b) => a.energyKwh - b.energyKwh)
  const inverterPool = C.inverters.filter((i) => i.phase === d.phase && (d.systemType === 'gridtie' ? true : sysV === 'hv' ? typeof i.batteryVoltage === 'string' : i.batteryVoltage === sysV) && (d.systemType === 'gridtie' ? i.type !== 'offgrid' && i.mpptCount > 0 : i.type !== 'gridtie')).sort((a, b) => a.ratedAcKw - b.ratedAcKw)
  const panelOpts: Opt[] = [...C.panels].sort((a, b) => a.watts - b.watts).map((x) => ({ id: x.id, title: `${x.brand} ${x.model}`, sub: [`${x.watts} W`, tech(x.technology), `${fmt(x.efficiencyPct, 1)}%`], price: price(x.approxPriceUsd), search: `${x.brand} ${x.model} ${x.watts}`, ...flags(x.id) }))
  const invOpts: Opt[] = inverterPool.map((x) => ({ id: x.id, title: `${x.brand} ${x.model}`, sub: [`${fmt(x.ratedAcKw, 1)} kW`, invType(x.type), t.design.phaseN(x.phase), `${x.mpptCount} MPPT`], price: price(x.approxPriceUsd), search: `${x.brand} ${x.model} ${x.ratedAcKw}`, ...flags(x.id) }))
  const batOpts: Opt[] = batteryPool.map((x) => ({ id: x.id, title: `${x.brand} ${x.model}`, sub: [`${x.nominalVoltage} V`, `${x.capacityAh} Ah`, `${fmt(x.energyKwh, 1)} kWh`, chem(x.chemistry)], price: price(x.approxPriceUsd), search: `${x.brand} ${x.model} ${x.energyKwh} ${x.chemistry}`, ...flags(x.id) }))
  const ccOpts: Opt[] = C.chargeControllers.map((x) => ({ id: x.id, title: `${x.brand} ${x.model}`, sub: [`${x.maxChargeA} A`, `${x.maxPvVoltage} V`], price: price(x.approxPriceUsd), search: `${x.brand} ${x.model} ${x.maxChargeA}`, ...flags(x.id) }))

  const battLine = r.bom.find((b) => b.category === 'Battery')
  const battName = r.battery ? `${r.battery.brand} ${r.battery.model}` : battLine?.name
  const noPv = r.panelQty === 0
  const curPanel = noPv ? T.noPanels : `${r.panelQty} × ${r.panel.brand} ${r.panel.model}`
  const curInv = r.inverter ? `${r.inverterQty} × ${r.inverter.brand} ${r.inverter.model}` : '—'
  const curBatt = d.batteryId === null || tg.batteryKwh === 0 ? t.design.noBattery : battName && r.batteryQty > 0 ? `${r.batteryQty} × ${battName}` : d.batteryId === 'auto' ? t.design.notNeeded : '—'
  const curCc = r.controller ? `${r.controller.brand} ${r.controller.model}` : '—'
  const autonomyHelp = `${d.systemType === 'offgrid' ? t.design.autonomyOffgrid : t.design.autonomyHybrid} ${T.autonomyZero}`
  // §4.2: 48 V suits inverters up to 15 kW; above that recommend a high-voltage battery (one tap, battery and inverter back to auto)
  const hvAdvice = hasBattery && sysV === 48 && d.batteryId !== null && tg.batteryKwh !== 0 && Math.max(r.requiredInverterKw, r.inverterTotalKw) > 15
  const hvStocked = C.avail.inverters.some((i) => i.phase === d.phase && typeof i.batteryVoltage === 'string' && (d.systemType === 'hybrid' ? i.type === 'hybrid' : i.type !== 'gridtie'))
  const switchToHv = () => {
    const prev = { systemVoltage: d.systemVoltage, batteryId: d.batteryId, inverterId: d.inverterId, batteryOverrideQty: d.batteryOverrideQty }
    set({ systemVoltage: 'hv', batteryId: 'auto', inverterId: null, batteryOverrideQty: null })
    toast({ message: T.hvSwitched, tone: 'ok', action: { label: t.common.undo, run: () => set(prev) } })
  }
  const setType = (type: SystemType) => update((prev) => {
    const sz = resolveSizing(prev)
    // A known-size quote switched to a battery system starts with the typical battery instead of none
    const batt = projectMode(prev) === 'size' && type !== 'gridtie' && sz.targets.batteryKwh == null ? modeDefaults('size', type).sizing!.targets.batteryKwh : sz.targets.batteryKwh
    return { design: applySystemType(prev.design, type), sizing: { ...sz, targets: { ...sz.targets, batteryKwh: batt } } }
  })

  return (
    <div className="grid grid-cols-1 gap-4 sm:gap-5 lg:grid-cols-5">
      {sizeMode && (
        <Section title={T.sizeTitle} description={T.sizeHelp} className="lg:col-span-5">
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div className="min-w-0">
              <span className="label">{t.info.systemType}</span>
              <Segmented full label={t.info.systemType} value={d.systemType} onChange={setType} options={[
                { value: 'hybrid', label: t.info.hybridShort, testId: 'size-type-hybrid' },
                { value: 'offgrid', label: t.info.offgridShort, testId: 'size-type-offgrid' },
                { value: 'gridtie', label: t.info.gridtieShort, testId: 'size-type-gridtie' },
              ]} />
              <p className="help">{d.systemType === 'hybrid' ? t.info.hybridHelp : d.systemType === 'offgrid' ? t.info.offgridHelp : t.info.gridtieHelp}</p>
            </div>
            <div className="min-w-0">
              <span className="label">{t.info.phase}</span>
              <Segmented full label={t.info.phase} value={String(d.phase) as '1' | '3'} onChange={(v) => set({ phase: Number(v) as 1 | 3, inverterId: null })} options={[
                { value: '1', label: nbHyphen(t.info.single), testId: 'phase-1' }, { value: '3', label: nbHyphen(t.info.three), testId: 'phase-3' },
              ]} />
            </div>
          </div>
          <div className="mt-5 border-t border-slate-100 pt-4">
            <SizeInputs p={p} r={r} update={update} columns="sm:grid-cols-3" />
          </div>
        </Section>
      )}

      <Section title={t.design.equipment} className="lg:col-span-3">
        <div className="-my-1">
          <EquipRow testId="eq-panel" icon={<Sun size={20} />} label={t.design.panel} auto={d.panelId === 'auto'} notStocked={C.hidden.has(r.panel.id)} title={curPanel}
            sub={noPv ? (d.panelId === 'auto' ? undefined : [`${r.panel.brand} ${r.panel.model}`, `${r.panel.watts} W`]) : [`${r.panel.watts} W`, `${fmt(r.arrayKwp, 2)} kWp`, tech(r.panel.technology)]} onOpen={() => setPicker('panel')} />
          <EquipRow testId="eq-inverter" icon={<Zap size={20} />} label={t.design.inverter} auto={!d.inverterId} notStocked={!!r.inverter && C.hidden.has(r.inverter.id)} title={curInv}
            sub={r.inverter ? [`${fmt(r.inverter.ratedAcKw, 1)} kW`, invType(r.inverter.type), t.design.phaseN(r.inverter.phase), `${r.inverter.mpptCount} MPPT`] : undefined} onOpen={() => setPicker('inverter')} />
          {hasBattery && <EquipRow testId="eq-battery" icon={<BatteryFull size={20} />} label={t.design.battery} auto={d.batteryId === 'auto'} notStocked={!!r.battery && C.hidden.has(r.battery.id)} title={curBatt}
            sub={d.batteryId !== null && r.batteryKwh ? [`${fmt(r.batteryKwh, 1)} kWh`, `${r.batteryConfig.series}S × ${r.batteryConfig.parallel}P`] : undefined} onOpen={() => setPicker('battery')} />}
          {hasBattery && d.useSeparateController && <EquipRow testId="eq-controller" icon={<Cpu size={20} />} label={t.results.ctrl} auto={!d.chargeControllerId} notStocked={!!r.controller && C.hidden.has(r.controller.id)}
            title={r.controller ? `${r.controllerQty} × ${curCc}` : curCc} sub={[t.design.ampsNeeded(fmt(r.requiredControllerA))]} onOpen={() => setPicker('controller')} />}
        </div>
        <div className="mt-4 grid grid-cols-2 gap-x-3 gap-y-4 border-t border-slate-100 pt-4 sm:gap-x-4">
          <Field label={t.design.panelQty} help={d.panelOverrideQty == null ? t.design.autoPick(String(r.panelQty)) : undefined}><NumberInput integer stepper value={d.panelOverrideQty} allowEmpty min={1} placeholder={String(r.panelQty)} onChange={(v) => set({ panelOverrideQty: v })} /></Field>
          {d.inverterId ? <Field label={t.design.inverterQty}><NumberInput integer stepper value={d.inverterQty} min={1} max={16} onChange={(v) => set({ inverterQty: v ?? 1 })} /></Field> : <div />}
          {hasBattery && d.batteryId !== null && <Field label={t.design.battQty} help={d.batteryOverrideQty == null ? t.design.autoPick(String(r.batteryQty)) : undefined}><NumberInput integer stepper value={d.batteryOverrideQty} allowEmpty min={1} placeholder={String(r.batteryQty)} onChange={(v) => set({ batteryOverrideQty: v })} /></Field>}
          {hasBattery && <div className="col-span-2"><Switch checked={d.useSeparateController} onChange={(v) => set({ useSeparateController: v })} label={t.design.controller} data-testid="sw-controller" /></div>}
        </div>
        <div className="mt-3 border-t border-slate-100 pt-1">
          <ExistingInputs p={p} r={r} update={update} />
        </div>
      </Section>

      <div className="space-y-4 sm:space-y-5 lg:col-span-2">
        <Section title={t.design.title}>
          <div className="grid grid-cols-1 gap-4">
            {hasBattery && (
              <div className="min-w-0">
                <Field label={t.design.voltage}>
                  <select className="input" value={String(sysV)} onChange={(e) => set({ systemVoltage: e.target.value === 'hv' ? 'hv' : (Number(e.target.value) as 12 | 24 | 48), batteryId: d.batteryId === null ? null : 'auto', inverterId: null })} data-testid="design-voltage">
                    {(['12', '24', '48', 'hv'] as const).map((k) => <option key={k} value={k}>{iso(t.design.voltages[k])}</option>)}
                  </select>
                </Field>
                {hvAdvice && (
                  <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900" data-testid="hv-advice">
                    <Lightbulb size={16} className="shrink-0 text-amber-600" aria-hidden="true" />
                    <span className="min-w-0 flex-1">{T.hvAdvice}{!hvStocked && <span className="block text-xs text-amber-800">{T.hvNone}</span>}</span>
                    {hvStocked && <button type="button" className="btn-secondary min-h-10 border-amber-300 bg-white px-3 text-amber-900 hover:bg-amber-100" onClick={switchToHv} data-testid="hv-switch">{T.hvSwitch}</button>}
                  </div>
                )}
              </div>
            )}
            {/* Autonomy sizes the bank from the demand; a known-size quote has none (the battery kWh is fixed above) */}
            {hasBattery && !sizeMode && <Field label={t.design.autonomy} help={autonomyHelp}><NumberInput value={d.autonomyDays} step={0.5} min={0} max={5} onChange={(v) => set({ autonomyDays: v ?? 1 })} data-testid="design-autonomy" /></Field>}
            {!hasBattery && <p className="text-sm text-slate-600">{t.info.gridtieHelp}</p>}
          </div>
          {!sizeMode && (
            <div className="mt-4 border-t border-slate-100 pt-1">
              <Disclosure title={T.fixTitle} description={T.fixHelp} defaultOpen={tg.pvKwp != null || tg.batteryKwh != null || tg.inverterKw != null} testId="design-fix-sizes">
                <div className="pb-2"><SizeInputs p={p} r={r} update={update} columns="sm:grid-cols-3 lg:grid-cols-1" /></div>
              </Disclosure>
            </div>
          )}
          <div className={`${sizeMode ? 'mt-4' : ''} border-t border-slate-100 pt-1`}>
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
