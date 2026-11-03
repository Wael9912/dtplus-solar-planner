import { useMemo } from 'react'
import { Fuel } from 'lucide-react'
import { useT } from '../../i18n'
import { Field, NumberInput, Section, Stat } from '../ui'
import { sizeGenerator, type GeneratorField, type StartMethod } from '../../engine/tools'
import { InvalidHint, ResultActions, ToolFrame, ToolLayout } from './common'
import { hotOf, line, num, numT, useDefaultLocation, useToolState } from './useTool'

type N = number | null
const STARTS: StartMethod[] = ['dol', 'star-delta', 'soft', 'vfd']
const ENUMS = { start: STARTS } as const

export function GeneratorTool() {
  const { t } = useT()
  const loc = useDefaultLocation()
  const defaults = useMemo(() => ({ runningKw: 10 as N, motorKw: 4 as N, start: 'dol' as StartMethod, pf: 0.8 as N, chargeKw: null as N, ambientC: hotOf(loc) as N }), [loc])
  const [s, set] = useToolState('generator', defaults, ENUMS)
  const gn = t.tools.gn
  const r = sizeGenerator({ runningKw: s.runningKw, motorKw: s.motorKw, start: s.start, pf: s.pf, chargeKw: s.chargeKw, ambientC: s.ambientC })
  const bad = new Set<GeneratorField>(r.valid ? [] : r.invalid)
  const fieldLabel: Record<GeneratorField, string> = { running: gn.running, motor: gn.motor, pf: gn.pf, charge: gn.charge, ambient: gn.ambient }

  const genText = r.valid ? (r.generatorKva != null ? `${num(r.generatorKva)} kVA` : gn.genOver) : ''
  const basis = r.valid ? (r.basis === 'start' ? gn.basis.start(numT(r.startKva, 1)) : gn.basis.steady(numT(r.steadyKva, 1))) : ''
  const text = r.valid ? [
    t.tools.copyHeader(t.tools.names.generator),
    line(gn.running, `${numT(r.runningKw, 2)} kW · ${gn.motor} ${numT(r.motorKw, 2)} kW (${gn.starts[s.start]}) · PF ${numT(s.pf, 2)} · ${numT(s.ambientC, 1)} °C`),
    ...(s.chargeKw ? [line(gn.charge, `${numT(s.chargeKw, 2)} kW`)] : []),
    line(gn.gen, genText),
    line(gn.steady, gn.steadyValue(numT(r.steadyKw, 2), numT(r.steadyKva, 1))),
    line(gn.startLine, gn.startValue(numT(r.surgeKw, 2), numT(r.startKva, 1))),
    `${basis}${r.hot ? ` · ${gn.hot}` : ''}`,
    line(gn.invCont, `${numT(r.inverterKw, 2)} kW`),
    line(gn.invSurge, `${numT(r.inverterSurgeKw, 2)} kW`),
    line(gn.invStd, r.inverterStdKw != null ? `${numT(r.inverterStdKw, 1)} kW` : gn.invOver),
  ].join('\n') : null

  return (
    <ToolFrame id="generator" icon={Fuel}>
      <ToolLayout
        inputs={<>
          <Section title={gn.load}>
            <div className="grid grid-cols-2 gap-x-3 gap-y-4 sm:gap-x-4">
              <Field label={gn.running} help={gn.runningHelp}><NumberInput value={s.runningKw} allowEmpty min={0} onChange={(v) => set({ runningKw: v })} suffix="kW" invalid={bad.has('running')} data-testid="gn-running" /></Field>
              <Field label={gn.motor} help={gn.motorHelp}><NumberInput value={s.motorKw} allowEmpty min={0} onChange={(v) => set({ motorKw: v })} suffix="kW" placeholder="0" invalid={bad.has('motor')} data-testid="gn-motor" /></Field>
              <Field label={gn.start} className="col-span-2">
                <select className="input" value={s.start} onChange={(e) => set({ start: e.target.value as StartMethod })} data-testid="gn-start">
                  {STARTS.map((k) => <option key={k} value={k}>{gn.starts[k]}</option>)}
                </select>
              </Field>
              <Field label={gn.pf}><NumberInput value={s.pf} allowEmpty min={0.5} max={1} step={0.05} onChange={(v) => set({ pf: v })} invalid={bad.has('pf')} data-testid="gn-pf" /></Field>
              <Field label={gn.charge} help={gn.chargeHelp}><NumberInput value={s.chargeKw} allowEmpty min={0} onChange={(v) => set({ chargeKw: v })} suffix="kW" placeholder={t.tools.optional} invalid={bad.has('charge')} data-testid="gn-charge" /></Field>
              <Field label={gn.ambient} help={gn.ambientHelp}><NumberInput value={s.ambientC} allowEmpty allowNegative min={-20} max={60} onChange={(v) => set({ ambientC: v })} suffix="°C" invalid={bad.has('ambient')} data-testid="gn-ambient" /></Field>
            </div>
          </Section>
        </>}
        results={!r.valid ? <InvalidHint fields={r.invalid.map((k) => fieldLabel[k])} /> : <>
          <Section title={gn.gen}>
            <Stat tone={r.generatorKva != null ? 'brand' : 'warn'} label={gn.gen} value={<span data-testid="gn-kva">{r.generatorKva != null ? num(r.generatorKva) : '–'}</span>} unit={r.generatorKva != null ? 'kVA' : undefined}
              sub={r.generatorKva != null ? `${basis}${r.hot ? ` · ${gn.hot}` : ''}` : gn.genOver} />
            <dl className="mt-3 divide-y divide-slate-100 text-sm">
              <div className="flex flex-wrap justify-between gap-x-4 py-2"><dt className="text-slate-600">{gn.steady}</dt><dd className="font-medium text-slate-900 tabular-nums">{gn.steadyValue(numT(r.steadyKw, 2), numT(r.steadyKva, 1))}</dd></div>
              <div className="flex flex-wrap justify-between gap-x-4 py-2"><dt className="text-slate-600">{gn.startLine}</dt><dd className="font-medium text-slate-900 tabular-nums" data-testid="gn-surge">{gn.startValue(numT(r.surgeKw, 2), numT(r.startKva, 1))}</dd></div>
              <div className="flex flex-wrap justify-between gap-x-4 py-2"><dt className="text-slate-600">{gn.required}</dt><dd className="font-medium text-slate-900 tabular-nums"><bdi>{`${numT(r.requiredKva, 1)} kVA`}</bdi></dd></div>
            </dl>
            {r.raisedToMotor && <p className="mt-2 text-sm text-amber-800">{gn.raised}</p>}
          </Section>
          <Section title={gn.inverter}>
            <div className="grid grid-cols-2 gap-3">
              <Stat tone="brand" label={gn.invStd} value={<span data-testid="gn-inv-std">{r.inverterStdKw != null ? numT(r.inverterStdKw, 1) : '–'}</span>} unit={r.inverterStdKw != null ? 'kW' : undefined} sub={r.inverterStdKw != null ? undefined : gn.invOver} className="col-span-2" />
              <Stat label={gn.invCont} value={<span data-testid="gn-inv-kw">{numT(r.inverterKw, 2)}</span>} unit="kW" />
              <Stat label={gn.invSurge} value={numT(r.inverterSurgeKw, 2)} unit="kW" />
            </div>
            <p className="mt-3 text-xs leading-5 text-slate-500">{gn.invStdHelp}</p>
          </Section>
          <ResultActions text={text} />
        </>}
      />
    </ToolFrame>
  )
}
