import { useMemo } from 'react'
import { BatteryFull } from 'lucide-react'
import { useT } from '../../i18n'
import { useAppStore } from '../../store/useAppStore'
import { useCatalog } from '../useEngine'
import { Field, NumberInput, Section, Segmented, Stat } from '../ui'
import { batterySpec, isLead, sizeBatteryBank, type BatteryField, type BatteryModuleSpec, type Bus } from '../../engine/tools'
import { fitsSystemVoltage } from '../../engine/compute'
import { defaultDesign } from '../../engine/defaults'
import { toast } from '../../store/useToast'
import type { Battery, Chemistry } from '../../engine/types'
import { CheckRows, InvalidHint, ProductPicker, ResultActions, ToolFrame, ToolLayout, type PickOpt, type RowView } from './common'
import { line, num, numT, useToolState } from './useTool'

const DEF_BATT = 'bat-gen-48v100-rack'
type N = number | null
type BusKey = '12' | '24' | '48' | 'hv'
const CHEMS: Chemistry[] = ['LiFePO4', 'NMC', 'AGM', 'Gel', 'Flooded']
const busOf = (k: BusKey): Bus => (k === 'hv' ? 'hv' : (Number(k) as 12 | 24 | 48))
const ENUMS = { basis: ['load', 'energy'], src: ['catalog', 'datasheet'], bus: ['12', '24', '48', 'hv'], 'module.chemistry': CHEMS } as const

export function BatteryTool() {
  const { t } = useT()
  const cat = useCatalog()
  const createProject = useAppStore((s) => s.createProject)
  const defPhase = useAppStore((s) => s.company.defaultPhase)
  const invPool = useMemo(() => cat.inverters.filter((i) => i.type !== 'gridtie' && i.batteryVoltage != null).sort((a, b) => a.ratedAcKw - b.ratedAcKw), [cat])
  const defaults = useMemo(() => {
    const b = cat.batteries.find((x) => x.id === DEF_BATT) ?? cat.batteries[0]
    return {
      basis: 'load' as 'load' | 'energy', loadW: 1000 as N, hours: 5 as N, energyKwh: 10 as N,
      src: 'catalog' as 'catalog' | 'datasheet', batteryId: b?.id ?? '',
      module: { V: (b?.nominalVoltage ?? 51.2) as N, Ah: (b?.capacityAh ?? 100) as N, kWh: null as N, dod: (b?.usableDodPct ?? 90) as N, maxChargeA: (b?.maxChargeA ?? null) as N,
        maxDischargeA: (b?.maxDischargeA ?? null) as N, parallelMax: (b?.parallelMax ?? null) as N, chemistry: (b?.chemistry ?? 'LiFePO4') as Chemistry },
      bus: '48' as BusKey, dodOverride: null as N, inverterId: '', runM: 2 as N,
    }
  }, [cat])
  const [s, set] = useToolState('battery', defaults, ENUMS)
  const bt = t.tools.bt

  const battery: Battery | undefined = cat.batteries.find((b) => b.id === s.batteryId) ?? cat.batteries.find((b) => b.id === DEF_BATT) ?? cat.batteries[0]
  const inverter = invPool.find((i) => i.id === s.inverterId) ?? null
  const fromCatalog = s.src === 'catalog' && !!battery
  const m = s.module
  const module: BatteryModuleSpec = fromCatalog ? batterySpec(battery) : { nominalVoltage: m.V, capacityAh: m.Ah, energyKwh: m.kWh, usableDodPct: m.dod, maxChargeA: m.maxChargeA, maxDischargeA: m.maxDischargeA, parallelMax: m.parallelMax, chemistry: m.chemistry }
  const bus = busOf(s.bus)
  const r = sizeBatteryBank({ basis: s.basis, loadW: s.loadW, hours: s.hours, energyKwh: s.energyKwh, module, battery: fromCatalog ? battery : null, bus, dodOverridePct: s.dodOverride, inverter, cableRunM: s.runM })
  const bad = new Set<BatteryField>(r.valid ? [] : r.invalid)
  const fieldLabel: Record<BatteryField, string> = { loadW: bt.loadW, hours: bt.hours, energy: bt.energy, V: bt.f.V, Ah: bt.f.Ah, kWh: bt.f.kWh, dod: bt.f.dod, maxChargeA: bt.f.maxChargeA, maxDischargeA: bt.f.maxDischargeA, parallelMax: bt.f.parallelMax, dodOverride: bt.f.dodOverride, run: bt.f.run }

  const battOpts: PickOpt[] = useMemo(() => [...cat.batteries].sort((a, b) => a.nominalVoltage - b.nominalVoltage || a.energyKwh - b.energyKwh).map((b) => ({ id: b.id, title: `${b.brand} ${b.model}`, sub: [`${b.nominalVoltage} V`, `${b.capacityAh} Ah`, `${numT(b.energyKwh, 2)} kWh`, bt.chem[b.chemistry] ?? b.chemistry], hidden: cat.hidden.has(b.id), search: `${b.brand} ${b.model} ${b.energyKwh} ${b.chemistry}` })), [cat, bt])
  const invOpts: PickOpt[] = useMemo(() => invPool.map((i) => ({ id: i.id, title: `${i.brand} ${i.model}`, sub: [`${numT(i.ratedAcKw, 1)} kW`, `${i.batteryVoltage} V`, `${i.maxChargeA} A`], hidden: cat.hidden.has(i.id), search: `${i.brand} ${i.model} ${i.ratedAcKw} ${i.batteryVoltage}` })), [invPool, cat])

  const pickBattery = (id: string) => {
    const b = cat.batteries.find((x) => x.id === id)
    if (!b) return
    // keep the bus when the module fits it, else move to a bus the module suits (HV stack → HV)
    const fit: BusKey = fitsSystemVoltage(b, bus) ? s.bus : b.nominalVoltage > 60 ? 'hv' : (['48', '24', '12'] as BusKey[]).find((k) => fitsSystemVoltage(b, busOf(k))) ?? s.bus
    set({ batteryId: id, bus: fit })
  }
  const setM = <K extends keyof typeof m>(k: K, v: (typeof m)[K]) => set((cur) => ({ module: { ...cur.module, [k]: v } }))
  const mf = (k: Exclude<keyof typeof m, 'chemistry'>, unit: string, o: { empty?: boolean; ph?: string; int?: boolean; label?: string } = {}) => (
    <Field label={o.label ?? bt.f[k]}><NumberInput value={m[k]} onChange={(v) => setM(k, v)} suffix={unit} integer={o.int} allowEmpty={o.empty ?? true} placeholder={o.ph} invalid={bad.has(k)} data-testid={`bt-${k}`} /></Field>
  )

  const rows: RowView[] = r.valid ? r.rows.map((x) => ({
    id: x.id, level: x.level, label: bt.rows[x.id],
    detail: x.id === 'bus' ? bt.d.bus(num(r.series), numT(x.value, 1), bt.buses[s.bus])
      : x.id === 'parallel' ? bt.d.parallel(num(x.value), num(x.limit))
        : x.id === 'discharge' ? bt.d.discharge(numT(x.value, 1), numT(r.cRate, 2), numT(x.limit, 1))
          : x.id === 'charge' ? (x.level === 'pass' ? bt.d.chargeOk : bt.d.charge)(numT(x.value, 1), numT(x.limit, 1))
            : x.issue ? bt.d.compat[x.issue] ?? x.issue : bt.d.compatOk,
  })) : []
  const battTitle = fromCatalog ? `${battery.brand} ${battery.model}` : t.tools.source.datasheet
  const needLine = r.valid ? bt.needLine(numT(r.energyNeedKwh, 2), numT(r.usableNeedKwh, 2), numT(r.nominalNeedKwh, 2), numT(r.dod * 100, 1)) : ''
  const text = r.valid ? [
    t.tools.copyHeader(t.tools.names.battery),
    line(bt.module, `${battTitle} (${numT(module.nominalVoltage, 1)} V, ${numT(module.capacityAh, 1)} Ah, ${numT(r.unitKwh, 2)} kWh)`),
    line(bt.bus, bt.buses[s.bus]),
    ...(inverter ? [line(bt.inverter, `${inverter.brand} ${inverter.model}`)] : []),
    needLine,
    line(bt.modules, `${num(r.modules)} (${bt.modulesSub(num(r.series), num(r.parallel))})`),
    line(bt.nominal, `${numT(r.nominalKwh, 2)} kWh · ${bt.usable} ${numT(r.usableKwh, 2)} kWh · ${num(r.ah)} Ah`),
    ...(r.backupHours != null ? [line(bt.backup, `${numT(r.backupHours, 1)} h`)] : []),
    ...(r.cable ? [line(bt.fuse, `${num(r.cable.breakerA)} A, ${bt.fuseTypes[r.fuseType]}`), line(bt.cable, `${numT(r.cable.sizeMm2, 1)} mm² · ${bt.cableSub(numT(r.cable.dropPct, 2), numT(s.runM, 1))}`)] : []),
    ...rows.map((x) => `${t.tools.copyLevel[x.level]} ${x.label}: ${x.detail}`),
  ].join('\n') : null

  const start = () => {
    if (!r.valid || !fromCatalog) return
    const type = inverter?.type === 'offgrid' ? 'offgrid' : 'hybrid'
    createProject({ design: { ...defaultDesign(type), phase: inverter?.phase ?? (defPhase === 3 ? 3 : 1), batteryId: battery.id, systemVoltage: bus, batteryOverrideQty: r.modules, inverterId: inverter?.id ?? null, inverterQty: 1 } }, 'design')
    toast({ message: t.tools.started, tone: 'ok' })
  }

  return (
    <ToolFrame id="battery" icon={BatteryFull}>
      <ToolLayout
        inputs={<>
          <Section title={bt.need} right={<Segmented label={bt.need} value={s.basis} onChange={(v) => set({ basis: v })}
            options={[{ value: 'load', label: bt.basis.load, testId: 'bt-basis-load' }, { value: 'energy', label: bt.basis.energy, testId: 'bt-basis-energy' }]} />}>
            <div className="grid grid-cols-2 gap-x-3 gap-y-4 sm:gap-x-4">
              {s.basis === 'energy' && <Field label={bt.energy} help={bt.energyHelp} className="col-span-2 sm:col-span-1"><NumberInput value={s.energyKwh} allowEmpty min={0} onChange={(v) => set({ energyKwh: v })} suffix="kWh" invalid={bad.has('energy')} data-testid="bt-energy" /></Field>}
              <Field label={s.basis === 'load' ? bt.loadW : bt.loadOpt} className={s.basis === 'energy' ? 'col-span-2 sm:col-span-1' : ''}><NumberInput value={s.loadW} allowEmpty min={0} onChange={(v) => set({ loadW: v })} suffix="W" invalid={bad.has('loadW')} data-testid="bt-load" /></Field>
              {s.basis === 'load' && <Field label={bt.hours}><NumberInput value={s.hours} allowEmpty min={0} max={240} step={0.5} onChange={(v) => set({ hours: v })} suffix="h" invalid={bad.has('hours')} data-testid="bt-hours" /></Field>}
            </div>
          </Section>

          <Section title={bt.module} right={<Segmented label={bt.module} value={s.src} onChange={(v) => set({ src: v })}
            options={[{ value: 'catalog', label: t.tools.source.catalog, testId: 'bt-src-catalog' }, { value: 'datasheet', label: t.tools.source.datasheet, testId: 'bt-src-datasheet' }]} />}>
            {s.src === 'catalog'
              ? <ProductPicker label={bt.module} hideLabel value={battery?.id ?? ''} options={battOpts} onPick={pickBattery} testId="bt-battery" />
              : (
                <div className="grid grid-cols-2 gap-x-3 gap-y-4 sm:grid-cols-3 sm:gap-x-4">
                  {mf('V', 'V')}{mf('Ah', 'Ah')}{mf('kWh', 'kWh', { ph: bt.kWhPh })}{mf('dod', '%')}
                  {mf('maxChargeA', 'A', { ph: t.tools.optional })}{mf('maxDischargeA', 'A', { ph: t.tools.optional })}{mf('parallelMax', '', { int: true, ph: t.tools.optional })}
                  <Field label={bt.f.chemistry} className="col-span-2 sm:col-span-2">
                    <select className="input" value={m.chemistry} onChange={(e) => setM('chemistry', e.target.value as Chemistry)} data-testid="bt-chemistry">
                      {CHEMS.map((c) => <option key={c} value={c}>{bt.chem[c]}</option>)}
                    </select>
                  </Field>
                </div>
              )}
          </Section>

          <Section title={bt.bank}>
            <div className="grid grid-cols-2 gap-x-3 gap-y-4 sm:gap-x-4">
              <Field label={bt.bus}>
                <select className="input" value={s.bus} onChange={(e) => set({ bus: e.target.value as BusKey })} data-testid="bt-bus">
                  {(['12', '24', '48', 'hv'] as BusKey[]).map((k) => <option key={k} value={k}>{bt.buses[k]}</option>)}
                </select>
              </Field>
              <Field label={bt.f.dodOverride} help={bt.dodHelp}><NumberInput value={s.dodOverride} allowEmpty min={10} max={100} onChange={(v) => set({ dodOverride: v })} suffix="%" placeholder={numT(module.usableDodPct, 0)} invalid={bad.has('dodOverride')} data-testid="bt-dod" /></Field>
              <div className="col-span-2"><ProductPicker label={bt.inverter} value={inverter?.id ?? ''} options={invOpts} none={bt.noInverter} onPick={(id) => set({ inverterId: id })} testId="bt-inverter" />
                <span className="help">{bt.inverterHelp}</span></div>
              <Field label={bt.f.run}><NumberInput value={s.runM} allowEmpty min={0.1} max={500} step={0.5} onChange={(v) => set({ runM: v })} suffix="m" invalid={bad.has('run')} data-testid="bt-run" /></Field>
            </div>
          </Section>
        </>}
        results={!r.valid ? <InvalidHint fields={r.invalid.map((k) => fieldLabel[k])} /> : <>
          <Section title={t.tools.result}>
            <div className="grid grid-cols-2 gap-3">
              <Stat tone={r.level === 'fail' ? 'err' : 'brand'} label={bt.modules} value={<span data-testid="bt-modules">{num(r.modules)}</span>} sub={bt.modulesSub(num(r.series), num(r.parallel))} />
              <Stat label={bt.backup} value={r.backupHours != null ? <span data-testid="bt-backup">{numT(r.backupHours, 1)}</span> : '–'} unit={r.backupHours != null ? 'h' : undefined} sub={r.backupHours == null ? bt.backupNa : undefined} />
              <Stat label={bt.nominal} value={numT(r.nominalKwh, 2)} unit="kWh" sub={`${num(r.ah)} Ah · ${numT(r.bankV, 1)} V`} />
              <Stat label={bt.usable} value={<span data-testid="bt-usable">{numT(r.usableKwh, 2)}</span>} unit="kWh" sub={`DoD ${numT(r.dod * 100, 0)}%`} />
              {r.dischargeA != null && <Stat label={bt.discharge} value={numT(r.dischargeA, 1)} unit="A" sub={bt.cRate(numT(r.cRate, 2))} />}
              {r.cable && <Stat label={bt.fuse} value={<span data-testid="bt-fuse">{num(r.cable.breakerA)}</span>} unit="A" sub={bt.fuseTypes[r.fuseType]} />}
              {r.cable && <Stat label={bt.cable} value={<span data-testid="bt-cable">{numT(r.cable.sizeMm2, 1)}</span>} unit="mm²" sub={bt.cableSub(numT(r.cable.dropPct, 2), numT(s.runM, 1))} className="col-span-2" />}
            </div>
            <p className="mt-3 text-xs leading-5 text-slate-500">{needLine}</p>
            {!r.cable && <p className="mt-2 text-sm text-slate-600">{bt.fuseNeedsPower}</p>}
            {isLead(module.chemistry) && <p className="mt-2 text-sm text-amber-800">{bt.leadNote}</p>}
          </Section>
          {rows.length > 0 && <Section title={t.tools.checks}><CheckRows rows={rows} /></Section>}
          <ResultActions text={text} onStart={start} startBlocked={!fromCatalog} />
        </>}
      />
    </ToolFrame>
  )
}
