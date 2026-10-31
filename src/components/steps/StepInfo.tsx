import { useT } from '../../i18n'
import { Field, Section, Choice } from '../ui'
import type { StepProps } from '../Wizard'
import type { SystemType, Project } from '../../engine/types'
import { defaultDesign } from '../../engine/defaults'

export function StepInfo({ project: p, update }: StepProps) {
  const { t } = useT()
  const setType = (systemType: SystemType) => update((prev) => {
    const d = { ...prev.design, systemType }
    if (systemType === 'gridtie') { d.batteryId = null; d.autonomyDays = 0 } else if (!d.batteryId) { d.batteryId = 'auto'; d.autonomyDays = defaultDesign(systemType).autonomyDays }
    if (systemType === 'offgrid' && d.autonomyDays < 1) d.autonomyDays = 1
    return { design: d }
  })
  return (
    <div className="grid gap-5 lg:grid-cols-5">
      <Section title={t.info.name} className="lg:col-span-3">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={t.info.name} className="sm:col-span-2"><input className="input" value={p.name} onChange={(e) => update({ name: e.target.value })} /></Field>
          <Field label={t.info.client}><input className="input" value={p.clientName} onChange={(e) => update({ clientName: e.target.value })} /></Field>
          <Field label={t.info.phone}><input className="input" value={p.clientPhone} onChange={(e) => update({ clientPhone: e.target.value })} /></Field>
          <Field label={t.info.email}><input className="input" type="email" value={p.clientEmail} onChange={(e) => update({ clientEmail: e.target.value })} /></Field>
          <Field label={t.info.reference}><input className="input" value={p.reference} onChange={(e) => update({ reference: e.target.value })} /></Field>
          <Field label={t.info.address} className="sm:col-span-2"><input className="input" value={p.clientAddress} onChange={(e) => update({ clientAddress: e.target.value })} /></Field>
          <Field label={t.info.status}>
            <select className="input" value={p.status} onChange={(e) => update({ status: e.target.value as Project['status'] })}>
              {(['draft', 'quoted', 'approved', 'installed'] as const).map((s) => <option key={s} value={s}>{t.info.statuses[s]}</option>)}
            </select>
          </Field>
          <Field label={t.info.notes} className="sm:col-span-2"><textarea className="input min-h-20" value={p.notes} onChange={(e) => update({ notes: e.target.value })} /></Field>
        </div>
      </Section>
      <div className="space-y-5 lg:col-span-2">
        <Section title={t.info.systemType}>
          <div className="[&>div]:grid-cols-1">
            <Choice value={p.design.systemType} onChange={setType} options={[
              { value: 'hybrid', label: t.info.hybrid, help: t.info.hybridHelp },
              { value: 'offgrid', label: t.info.offgrid, help: t.info.offgridHelp },
              { value: 'gridtie', label: t.info.gridtie, help: t.info.gridtieHelp },
            ]} />
          </div>
        </Section>
        <Section title={t.info.phase}>
          <div className="[&>div]:grid-cols-2">
            <Choice value={String(p.design.phase) as '1' | '3'} onChange={(v) => update((prev) => ({ design: { ...prev.design, phase: Number(v) as 1 | 3, inverterId: null } }))} options={[
              { value: '1', label: t.info.single }, { value: '3', label: t.info.three },
            ]} />
          </div>
        </Section>
      </div>
    </div>
  )
}
