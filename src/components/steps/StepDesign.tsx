import { useT } from '../../i18n'
import { Field, NumberInput, Section, Toggle } from '../ui'
import type { StepProps } from '../Wizard'
import { catalog } from '../../data/catalog'
import { fitsSystemVoltage } from '../../engine/compute'
import { fmt } from '../../engine/format'

export function StepDesign({ project: p, results: r, update }: StepProps) {
  const { t } = useT()
  const d = p.design
  const set = (x: Partial<typeof d>) => update((prev) => ({ design: { ...prev.design, ...x } }))
  const hasBattery = d.systemType !== 'gridtie'
  const sysV = d.systemVoltage
  const batteryPool = catalog.batteries.filter((b) => fitsSystemVoltage(b, sysV)).sort((a, b) => a.energyKwh - b.energyKwh)
  const inverterPool = catalog.inverters.filter((i) => i.phase === d.phase && (d.systemType === 'gridtie' ? true : sysV === 'hv' ? typeof i.batteryVoltage === 'string' : i.batteryVoltage === sysV) && (d.systemType === 'gridtie' ? i.type !== 'offgrid' : i.type !== 'gridtie')).sort((a, b) => a.ratedAcKw - b.ratedAcKw)

  return (
    <div className="grid gap-5 lg:grid-cols-2">
      <Section title={t.results.summary}>
        <div className="grid gap-4 sm:grid-cols-2">
          {hasBattery && <Field label={t.design.voltage}>
            <select className="input" value={String(sysV)} onChange={(e) => set({ systemVoltage: e.target.value === 'hv' ? 'hv' : (Number(e.target.value) as 12 | 24 | 48), batteryId: 'auto', inverterId: null })}>
              <option value="12">12 V (&lt;1 kW)</option><option value="24">24 V (1–3 kW)</option><option value="48">48 V (3–30 kW)</option><option value="hv">High-voltage (&gt;10 kW)</option>
            </select></Field>}
          {hasBattery && <Field label={t.design.autonomy} help={t.design.autonomyHelp}><NumberInput value={d.autonomyDays} step={0.5} min={0.25} max={5} onChange={(v) => set({ autonomyDays: v ?? 1 })} /></Field>}
          <Field label={t.design.pvOversize}><NumberInput value={d.pvOversize} step={0.05} min={0.8} max={2} onChange={(v) => set({ pvOversize: v ?? 1 })} /></Field>
          <Field label={t.design.inverterSafety}><NumberInput value={d.inverterSafety} step={0.05} min={1} max={2} onChange={(v) => set({ inverterSafety: v ?? 1.25 })} /></Field>
          {hasBattery && <Field label={t.design.dod}><NumberInput value={d.dodOverridePct} allowEmpty min={20} max={100} placeholder={`${fmt(r.dod * 100)} (auto)`} onChange={(v) => set({ dodOverridePct: v })} /></Field>}
          <Field label={t.design.degradation}><NumberInput value={d.degradationPctPerYear} step={0.1} min={0} max={3} onChange={(v) => set({ degradationPctPerYear: v ?? 0.5 })} /></Field>
          <Field label={t.design.years}><NumberInput value={d.analysisYears} min={5} max={30} onChange={(v) => set({ analysisYears: v ?? 25 })} /></Field>
        </div>
        <h4 className="mt-5 mb-3 text-sm font-semibold text-slate-700">{t.results.cables}</h4>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={t.design.dcRun}><NumberInput value={d.dcCableRunM} min={1} onChange={(v) => set({ dcCableRunM: v ?? 20 })} /></Field>
          {hasBattery && <Field label={t.design.battRun}><NumberInput value={d.batteryCableRunM} min={0.5} step={0.5} onChange={(v) => set({ batteryCableRunM: v ?? 2 })} /></Field>}
          <Field label={t.design.acRun}><NumberInput value={d.acCableRunM} min={1} onChange={(v) => set({ acCableRunM: v ?? 15 })} /></Field>
          <Field label={t.design.drop}><NumberInput value={d.maxVoltageDropPct} step={0.5} min={0.5} max={5} onChange={(v) => set({ maxVoltageDropPct: v ?? 2 })} /></Field>
        </div>
        {hasBattery && <div className="mt-5 space-y-3">
          <Toggle checked={d.generatorBackup} onChange={(v) => set({ generatorBackup: v })} label={t.design.generator} />
          {d.generatorBackup && <Field label={t.design.generatorKva}><NumberInput value={d.generatorKva} allowEmpty min={1} placeholder={r.generatorKva ? `${r.generatorKva} kVA (auto)` : ''} onChange={(v) => set({ generatorKva: v })} /></Field>}
        </div>}
      </Section>

      <Section title={t.design.panel}>
        <div className="grid gap-4">
          <Field label={t.design.panel} help={d.panelId === 'auto' ? `${t.design.recommended}: ${r.panelQty} × ${r.panel.brand} ${r.panel.model} (${r.panel.watts} W)` : undefined}>
            <select className="input" value={d.panelId} onChange={(e) => set({ panelId: e.target.value, panelOverrideQty: null })}>
              <option value="auto">{t.design.auto}</option>
              {[...catalog.panels].sort((a, b) => a.watts - b.watts).map((x) => <option key={x.id} value={x.id}>{x.brand} {x.model} — {x.watts} W ({x.technology}) · ${x.approxPriceUsd}</option>)}
            </select>
          </Field>
          <Field label={t.design.panelQty}><NumberInput value={d.panelOverrideQty} allowEmpty min={1} placeholder={`${r.panelQty} (auto)`} onChange={(v) => set({ panelOverrideQty: v })} /></Field>
          <Field label={t.design.inverter} help={r.inverter && !d.inverterId ? `${t.design.recommended}: ${r.inverterQty} × ${r.inverter.brand} ${r.inverter.model}` : undefined}>
            <select className="input" value={d.inverterId ?? ''} onChange={(e) => set({ inverterId: e.target.value || null })}>
              <option value="">{t.design.auto}</option>
              {inverterPool.map((x) => <option key={x.id} value={x.id}>{x.brand} {x.model} — {x.ratedAcKw} kW {x.type} · {x.mpptCount} MPPT · ${x.approxPriceUsd}</option>)}
            </select>
          </Field>
          {d.inverterId && <Field label={t.design.inverterQty}><NumberInput value={d.inverterQty} min={1} max={16} onChange={(v) => set({ inverterQty: v ?? 1 })} /></Field>}
          {hasBattery && <>
            <Field label={t.design.battery} help={r.bom.find((b) => b.category === 'Battery') && d.batteryId === 'auto' ? `${t.design.recommended}: ${r.batteryQty} × ${r.bom.find((b) => b.category === 'Battery')?.name}` : undefined}>
              <select className="input" value={d.batteryId ?? ''} onChange={(e) => set({ batteryId: e.target.value || null, batteryOverrideQty: null })}>
                <option value="auto">{t.design.auto}</option><option value="">{t.design.none}</option>
                {batteryPool.map((x) => <option key={x.id} value={x.id}>{x.brand} {x.model} — {x.nominalVoltage} V {x.capacityAh} Ah ({x.energyKwh} kWh {x.chemistry}) · ${x.approxPriceUsd}</option>)}
              </select>
            </Field>
            <Field label={t.design.battQty}><NumberInput value={d.batteryOverrideQty} allowEmpty min={1} placeholder={`${r.batteryQty} (auto)`} onChange={(v) => set({ batteryOverrideQty: v })} /></Field>
            <Toggle checked={d.useSeparateController} onChange={(v) => set({ useSeparateController: v })} label={t.design.controller} />
            {d.useSeparateController && <Field label={t.results.ctrl} help={r.controller ? `${t.design.recommended}: ${r.controllerQty} × ${r.controller.brand} ${r.controller.model} (${fmt(r.requiredControllerA)} A needed)` : undefined}>
              <select className="input" value={d.chargeControllerId ?? ''} onChange={(e) => set({ chargeControllerId: e.target.value || null })}>
                <option value="">{t.design.auto}</option>
                {catalog.chargeControllers.map((x) => <option key={x.id} value={x.id}>{x.brand} {x.model} — {x.maxChargeA} A / {x.maxPvVoltage} V · ${x.approxPriceUsd}</option>)}
              </select>
            </Field>}
          </>}
        </div>
      </Section>
    </div>
  )
}
