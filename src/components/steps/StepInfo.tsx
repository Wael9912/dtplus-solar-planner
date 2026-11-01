import { Fragment } from 'react'
import { useT } from '../../i18n'
import { Field, Section, Choice, Segmented } from '../ui'
import type { StepProps } from '../Wizard'
import type { SystemType, Project } from '../../engine/types'
import { applySystemType } from '../../engine/defaults'

/** Let a label wrap at spaces but not at the hyphen of “Single-phase” (narrow phones would split it there). */
const nbHyphen = (s: string) => s.split(' ').map((w, i) => <Fragment key={i}>{i > 0 && ' '}{w.includes('-') ? <span className="whitespace-nowrap">{w}</span> : w}</Fragment>)

export function StepInfo({ project: p, update }: StepProps) {
  const { t } = useT()
  const setType = (systemType: SystemType) => update((prev) => ({ design: applySystemType(prev.design, systemType) }))
  return (
    <div className="grid grid-cols-1 gap-4 sm:gap-5 lg:grid-cols-5">
      <Section title={t.info.title} className="lg:col-span-3">
        <div className="grid grid-cols-1 gap-x-4 gap-y-4 sm:grid-cols-2">
          <Field label={t.info.name} className="sm:col-span-2"><input className="input" dir="auto" value={p.name} placeholder={t.info.namePh} onChange={(e) => update({ name: e.target.value })} /></Field>
          <Field label={t.info.client}><input className="input" dir="auto" autoComplete="off" value={p.clientName} onChange={(e) => update({ clientName: e.target.value })} /></Field>
          <Field label={t.info.phone}><input className="input" type="tel" dir="ltr" inputMode="tel" autoComplete="off" value={p.clientPhone} onChange={(e) => update({ clientPhone: e.target.value })} /></Field>
          <Field label={t.info.email}><input className="input" type="email" dir="ltr" inputMode="email" autoComplete="off" value={p.clientEmail} onChange={(e) => update({ clientEmail: e.target.value })} /></Field>
          <Field label={t.info.reference}><input className="input" dir="auto" value={p.reference} onChange={(e) => update({ reference: e.target.value })} /></Field>
          <Field label={t.info.address} className="sm:col-span-2"><input className="input" dir="auto" value={p.clientAddress} onChange={(e) => update({ clientAddress: e.target.value })} /></Field>
          <Field label={t.info.status}>
            <select className="input" value={p.status} onChange={(e) => update({ status: e.target.value as Project['status'] })}>
              {(['draft', 'quoted', 'approved', 'installed'] as const).map((s) => <option key={s} value={s}>{t.info.statuses[s]}</option>)}
            </select>
          </Field>
          <Field label={t.info.notes} className="sm:col-span-2"><textarea className="input min-h-24" dir="auto" placeholder={t.info.notesPh} value={p.notes} onChange={(e) => update({ notes: e.target.value })} /></Field>
        </div>
      </Section>
      <div className="space-y-4 sm:space-y-5 lg:col-span-2">
        <Section title={t.info.systemType}>
          <Choice label={t.info.systemType} columns="grid-cols-1" value={p.design.systemType} onChange={setType} options={[
            { value: 'hybrid', label: t.info.hybrid, help: t.info.hybridHelp },
            { value: 'offgrid', label: t.info.offgrid, help: t.info.offgridHelp },
            { value: 'gridtie', label: t.info.gridtie, help: t.info.gridtieHelp },
          ]} />
        </Section>
        <Section title={t.info.phase}>
          <Segmented full label={t.info.phase} value={String(p.design.phase) as '1' | '3'} onChange={(v) => update((prev) => ({ design: { ...prev.design, phase: Number(v) as 1 | 3, inverterId: null } }))} options={[
            { value: '1', label: nbHyphen(t.info.single), testId: 'phase-1' }, { value: '3', label: nbHyphen(t.info.three), testId: 'phase-3' },
          ]} />
        </Section>
      </div>
    </div>
  )
}
