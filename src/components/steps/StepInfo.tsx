import { Fragment, useState } from 'react'
import { useT } from '../../i18n'
import { Field, Section, Choice, Segmented } from '../ui'
import { ConfirmDialog } from '../overlay'
import type { StepProps } from '../Wizard'
import type { SystemType, Project, ProjectMode, PriceBook, Results } from '../../engine/types'
import { applySystemType, modeDefaults } from '../../engine/defaults'
import { projectMode, resolveSizing } from '../../engine/sizing'
import { computeProject } from '../../engine/compute'
import { fmt } from '../../engine/format'
import { useAppStore, STATUSES } from '../../store/useAppStore'
import { usePriceBook } from '../useEngine'
import { stepsFor, hasDemand } from '../wizardModel'
import { toast } from '../../store/useToast'

/** Let a label wrap at spaces but not at the hyphen of “Single-phase” (narrow phones would split it there). */
const nbHyphen = (s: string) => s.split(' ').map((w, i) => <Fragment key={i}>{i > 0 && ' '}{w.includes('-') ? <span className="whitespace-nowrap">{w}</span> : w}</Fragment>)
const MODES: ProjectMode[] = ['design', 'size', 'items']

/**
 * Full design → known size: the designed array / battery / inverter become the fixed sizes, and a model the auto-selection would
 * pick differently for those sizes is pinned, so the quote stays the same.
 */
function sizeFromDesign(prev: Project, r: Results, book: PriceBook): Partial<Project> {
  const gt = prev.design.systemType === 'gridtie'
  const r3 = (x: number) => Math.round(x * 1000) / 1000
  const targets = {
    pvKwp: r.panelQty > 0 ? r3(r.arrayKwp) : 0,
    batteryKwh: gt ? null : r.battery && r.batteryQty > 0 ? r3(r.batteryKwh) : 0,
    inverterKw: r.inverter ? r3(r.inverterTotalKw) : null,
  }
  const sizing = { ...resolveSizing(prev), targets }
  const design = { ...prev.design }
  const run = () => computeProject({ ...prev, mode: 'size', sizing, design }, book)
  let r2 = run()
  if (r2.panel.id !== r.panel.id) { design.panelId = r.panel.id; r2 = run() }
  if (r.battery && r2.battery?.id !== r.battery.id) { design.batteryId = r.battery.id; r2 = run() }
  if (r.inverter && (r2.inverter?.id !== r.inverter.id || r2.inverterQty !== r.inverterQty)) { design.inverterId = r.inverter.id; design.inverterQty = r.inverterQty; r2 = run() }
  if (r.controller && !design.chargeControllerId && r2.controller?.id !== r.controller.id) design.chargeControllerId = r.controller.id
  if (design.generatorBackup && design.generatorKva == null && r.generatorKva != null && r2.generatorKva !== r.generatorKva) design.generatorKva = r.generatorKva
  return { mode: 'size', sizing, design }
}

export function StepInfo({ project: p, results: r, update }: StepProps) {
  const { t } = useT()
  const T = t.inputs.info
  const book = usePriceBook()
  const mode = projectMode(p)
  const [convertTo, setConvertTo] = useState<ProjectMode | null>(null)
  const setType = (systemType: SystemType) => update((prev) => ({ design: applySystemType(prev.design, systemType) }))
  const designed = mode === 'design' && hasDemand(p, r)
  const sysTxt = [`${fmt(r.arrayKwp, 2)} kWp`, r.batteryKwh > 0 && `${fmt(r.batteryKwh, 1)} kWh`, r.inverter && `${fmt(r.inverterTotalKw, 1)} kW`].filter(Boolean).join(' · ')
  const nCustom = p.pricing.customItems?.length ?? 0

  const convert = (to: ProjectMode) => {
    const from = mode
    const company = useAppStore.getState().company
    update((prev) => {
      const sz = resolveSizing(prev)
      let patch: Partial<Project> = { mode: to }
      if (to === 'size') {
        if (from === 'design' && hasDemand(prev, r)) patch = sizeFromDesign(prev, r, book)
        else {
          const fixed = sz.targets.pvKwp != null || sz.targets.batteryKwh != null || sz.targets.inverterKw != null
          patch.sizing = { ...sz, targets: fixed ? sz.targets : modeDefaults('size', prev.design.systemType).sizing!.targets }
        }
      } else if (to === 'design') patch.sizing = { ...sz, targets: { pvKwp: null, batteryKwh: null, inverterKw: null } }
      // A product list carries no services; a system quote gets the company's installation, transport and commissioning back
      const pr = prev.pricing
      if (from === 'items' && to !== 'items' && !pr.labourPerKwUsd && !pr.transportUsd && !pr.commissioningUsd)
        patch.pricing = { ...pr, labourPerKwUsd: company.labourPerKwUsd ?? 120, transportUsd: company.transportUsd ?? 100, commissioningUsd: company.commissioningUsd ?? 150 }
      return patch
    })
    useAppStore.getState().setStep(Math.max(0, stepsFor({ mode: to }).indexOf('info')))
    toast({ message: T.converted(t.modes.short[to]) })
  }
  const sizeTargets = (() => {
    const tg = resolveSizing(p).targets
    return tg.pvKwp != null || tg.batteryKwh != null || tg.inverterKw != null ? tg : modeDefaults('size', p.design.systemType).sizing!.targets
  })()
  const defaultSys = [sizeTargets.pvKwp != null && `${fmt(sizeTargets.pvKwp, 1)} kWp`, sizeTargets.inverterKw != null && `${fmt(sizeTargets.inverterKw, 1)} kW`,
    p.design.systemType !== 'gridtie' && sizeTargets.batteryKwh != null && `${fmt(sizeTargets.batteryKwh, 1)} kWh`].filter(Boolean).join(' · ')
  const convertBody = convertTo === 'size' ? (designed ? T.convertToSize(sysTxt) : T.convertToSizeDefault(defaultSys))
    : convertTo === 'design' ? T.convertToDesign : convertTo === 'items' ? T.convertToItems(nCustom) : ''

  return (
    <div className="grid grid-cols-1 gap-4 sm:gap-5 lg:grid-cols-5">
      {mode === 'design' && (
        <Section title={T.systemTitle} className="lg:col-span-5">
          <Choice label={t.info.systemType} columns="sm:grid-cols-3" value={p.design.systemType} onChange={setType} options={[
            { value: 'hybrid', label: t.info.hybrid, help: t.info.hybridHelp },
            { value: 'offgrid', label: t.info.offgrid, help: t.info.offgridHelp },
            { value: 'gridtie', label: t.info.gridtie, help: t.info.gridtieHelp },
          ]} />
          <div className="mt-4 sm:max-w-md">
            <span className="label">{t.info.phase}</span>
            <Segmented full label={t.info.phase} value={String(p.design.phase) as '1' | '3'} onChange={(v) => update((prev) => ({ design: { ...prev.design, phase: Number(v) as 1 | 3, inverterId: null } }))} options={[
              { value: '1', label: nbHyphen(t.info.single), testId: 'phase-1' }, { value: '3', label: nbHyphen(t.info.three), testId: 'phase-3' },
            ]} />
          </div>
        </Section>
      )}
      <Section title={t.info.title} className="lg:col-span-3">
        <div className="grid grid-cols-1 gap-x-4 gap-y-4 sm:grid-cols-2">
          <Field label={t.info.name} className="sm:col-span-2"><input className="input" dir="auto" value={p.name} placeholder={t.info.namePh} onChange={(e) => update({ name: e.target.value })} /></Field>
          <Field label={t.info.client}><input className="input" dir="auto" autoComplete="off" value={p.clientName} onChange={(e) => update({ clientName: e.target.value })} data-testid="info-client" /></Field>
          <Field label={t.info.phone}><input className="input" type="tel" dir="ltr" inputMode="tel" autoComplete="off" value={p.clientPhone} onChange={(e) => update({ clientPhone: e.target.value })} /></Field>
          <Field label={t.info.email}><input className="input" type="email" dir="ltr" inputMode="email" autoComplete="off" value={p.clientEmail} onChange={(e) => update({ clientEmail: e.target.value })} /></Field>
          <Field label={t.info.reference}><input className="input" dir="auto" value={p.reference} onChange={(e) => update({ reference: e.target.value })} /></Field>
          <Field label={t.info.address} className="sm:col-span-2"><input className="input" dir="auto" value={p.clientAddress} onChange={(e) => update({ clientAddress: e.target.value })} /></Field>
          <Field label={t.info.status}>
            <select className="input" value={p.status} onChange={(e) => update({ status: e.target.value as Project['status'] })} data-testid="info-status">
              {STATUSES.map((s) => <option key={s} value={s}>{t.info.statuses[s]}</option>)}
            </select>
          </Field>
        </div>
      </Section>
      <div className="space-y-4 sm:space-y-5 lg:col-span-2">
        <Section title={T.notesTitle}>
          <div className="grid grid-cols-1 gap-y-4">
            <Field label={T.proposalNote} help={T.proposalNoteHelp}>
              <textarea className="input min-h-20" dir="auto" placeholder={T.proposalNotePh} value={p.proposalNote ?? ''} onChange={(e) => update({ proposalNote: e.target.value })} data-testid="info-proposal-note" />
            </Field>
            <Field label={T.notesInternal}>
              <textarea className="input min-h-20" dir="auto" placeholder={T.notesInternalPh} value={p.notes} onChange={(e) => update({ notes: e.target.value })} data-testid="info-notes" />
            </Field>
          </div>
        </Section>
        <Section title={T.projectType}>
          <Segmented full label={T.projectType} value={mode} onChange={(v) => { if (v !== mode) setConvertTo(v) }}
            options={MODES.map((m) => ({ value: m, label: t.modes.short[m], testId: `ptype-${m}` }))} />
          <p className="mt-2 text-sm text-slate-600">{T.typeHelp[mode]}</p>
        </Section>
      </div>
      <ConfirmDialog open={convertTo != null} onClose={() => setConvertTo(null)} danger={false} title={convertTo ? T.convertTitle(t.modes.short[convertTo]) : ''} body={convertBody}
        confirmLabel={T.convert} onConfirm={() => { if (convertTo) convert(convertTo) }} />
    </div>
  )
}
