import { useMemo } from 'react'
import { Cable } from 'lucide-react'
import { useT } from '../../i18n'
import { Field, NumberInput, Section, Segmented, Stat } from '../ui'
import { CIRCUIT_DEFAULTS, sizeCircuit, type CableField, type CircuitKind, type Insulation } from '../../engine/tools'
import type { Level } from '../../engine/tools'
import { CheckRows, InvalidHint, ResultActions, ToolFrame, ToolLayout, type RowView } from './common'
import { line, num, numT, useToolState } from './useTool'

type N = number | null
const CIRCUITS: CircuitKind[] = ['pv', 'battery', 'ac1', 'ac3']
const ENUMS = { circuit: CIRCUITS, by: ['current', 'power'], insulation: ['pvc', 'xlpe'] } as const

export function CableTool() {
  const { t } = useT()
  const defaults = useMemo(() => ({
    circuit: 'ac1' as CircuitKind, by: 'power' as 'current' | 'power', currentA: 20 as N, powerKw: 5 as N, pf: 1 as N,
    voltage: CIRCUIT_DEFAULTS.ac1.voltage as N, lengthM: CIRCUIT_DEFAULTS.ac1.lengthM as N, dropPct: CIRCUIT_DEFAULTS.ac1.dropPct as N, ambientC: 40 as N, insulation: 'pvc' as Insulation,
  }), [])
  const [s, set] = useToolState('cable', defaults, ENUMS)
  const cb = t.tools.cb
  const pv = s.circuit === 'pv'
  const byPower = s.by === 'power' && !pv
  const r = sizeCircuit({ circuit: s.circuit, by: s.by, currentA: s.currentA, powerKw: s.powerKw, pf: s.pf, voltage: s.voltage, lengthM: s.lengthM, maxDropPct: s.dropPct, ambientC: s.ambientC, insulation: s.insulation })
  const bad = new Set<CableField>(r.valid ? [] : r.invalid)
  const fieldLabel: Record<CableField, string> = { current: pv ? cb.currentPv : cb.current, power: cb.power, pf: cb.pf, voltage: cb.voltage, length: cb.length, drop: cb.drop, ambient: cb.ambient }
  // A new circuit type starts from its own voltage and drop target (§8.1); the current, length and ambient are kept
  const setCircuit = (c: CircuitKind) => set({ circuit: c, voltage: CIRCUIT_DEFAULTS[c].voltage, dropPct: CIRCUIT_DEFAULTS[c].dropPct })

  const c = r.valid ? r.cable : null
  const runs = c?.parallelRuns ?? 1
  const deviceText = r.valid ? [cb.devices[r.device], cb.poles[s.circuit]].filter(Boolean).join(' · ') : ''
  const rows: RowView[] = r.valid && c ? [
    { id: 'ampacity', level: 'pass' as Level, label: cb.rows.ampacity, detail: cb.d.ampacity(numT(r.currentA, 1), num(c.breakerA), numT(c.ampacityA, 1)) },
    { id: 'drop', level: (r.dropOk ? 'pass' : 'warn') as Level, label: cb.rows.drop, detail: r.dropOk ? cb.d.drop(numT(c.dropPct, 2), numT(s.dropPct, 2)) : cb.d.dropOver(numT(c.dropPct, 2), numT(s.dropPct, 2)) },
    { id: 'device', level: (c.deviceStd === false ? 'fail' : 'pass') as Level, label: cb.rows.device, detail: c.deviceStd === false ? cb.d.deviceOver(num(c.breakerA)) : cb.d.deviceOk(num(c.breakerA)) },
  ].filter((x) => x.id !== 'ampacity' || c.deviceStd !== false) : []
  const sizeText = c ? cb.sizeValue(numT(c.sizeMm2, 1), String(runs)) : ''
  const text = r.valid && c ? [
    t.tools.copyHeader(t.tools.names.cable),
    line(cb.circuit, `${cb.circuits[s.circuit]} · ${numT(s.voltage, 1)} V · ${numT(s.lengthM, 1)} m · ${cb.ambient} ${numT(s.ambientC, 1)} °C · ${cb.insul[s.insulation]}`),
    line(cb.designCurrent, `${numT(r.currentA, 1)} A${byPower ? ` (${cb.fromPower(numT(s.powerKw, 2))})` : ''}`),
    line(cb.size, `${sizeText}${runs > 1 ? ` ${cb.perPole}` : ''}${r.awg ? ` (${cb.awg(r.awg)})` : ''}`),
    line(cb.device, `${num(c.breakerA)} A ${deviceText}`),
    line(cb.dropLabel, `${numT(c.dropPct, 2)} %`),
    line(cb.ampacity, `${numT(c.ampacityA, 1)} A (${cb.kAmb(numT(r.kAmb, 3), numT(s.ambientC, 1))})`),
    ...rows.map((x) => `${t.tools.copyLevel[x.level]} ${x.label}: ${x.detail}`),
  ].join('\n') : null

  return (
    <ToolFrame id="cable" icon={Cable}>
      <ToolLayout
        inputs={<>
          <Section title={cb.circuit}>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4" role="radiogroup" aria-label={cb.circuit}>
              {CIRCUITS.map((k) => (
                <button key={k} type="button" role="radio" aria-checked={s.circuit === k} onClick={() => setCircuit(k)} data-testid={`cb-circuit-${k}`}
                  className={`min-h-11 rounded-lg border px-3 py-2 text-sm font-medium transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 ${s.circuit === k ? 'border-brand-600 bg-brand-50 text-brand-800 ring-1 ring-brand-600' : 'border-slate-200 bg-white text-slate-700 hover:border-slate-300'}`}>
                  {cb.circuits[k]}
                </button>
              ))}
            </div>
            <div className="mt-4 grid grid-cols-2 gap-x-3 gap-y-4 sm:gap-x-4">
              {!pv && (
                <div className="col-span-2">
                  <Segmented label={cb.designCurrent} value={s.by} onChange={(v) => set({ by: v })} full
                    options={[{ value: 'current', label: cb.by.current, testId: 'cb-by-current' }, { value: 'power', label: cb.by.power, testId: 'cb-by-power' }]} />
                </div>
              )}
              {byPower
                ? <Field label={cb.power} help={cb.powerHelp[s.circuit]}><NumberInput value={s.powerKw} allowEmpty min={0} onChange={(v) => set({ powerKw: v })} suffix="kW" invalid={bad.has('power')} data-testid="cb-power" /></Field>
                : <Field label={pv ? cb.currentPv : cb.current} help={pv ? cb.currentPvHelp : undefined}><NumberInput value={s.currentA} allowEmpty min={0} onChange={(v) => set({ currentA: v })} suffix="A" invalid={bad.has('current')} data-testid="cb-current" /></Field>}
              {byPower && s.circuit !== 'battery' && <Field label={cb.pf} help={cb.pfHelp}><NumberInput value={s.pf} allowEmpty min={0.1} max={1} step={0.05} onChange={(v) => set({ pf: v })} invalid={bad.has('pf')} data-testid="cb-pf" /></Field>}
              <Field label={cb.voltage} help={cb.voltageHelp[s.circuit]}><NumberInput value={s.voltage} allowEmpty min={1} max={1500} onChange={(v) => set({ voltage: v })} suffix="V" invalid={bad.has('voltage')} data-testid="cb-voltage" /></Field>
              <Field label={cb.length}><NumberInput value={s.lengthM} allowEmpty min={0.1} max={10000} onChange={(v) => set({ lengthM: v })} suffix="m" invalid={bad.has('length')} data-testid="cb-length" /></Field>
              <Field label={cb.drop}><NumberInput value={s.dropPct} allowEmpty min={0.1} max={20} step={0.5} onChange={(v) => set({ dropPct: v })} suffix="%" invalid={bad.has('drop')} data-testid="cb-drop" /></Field>
            </div>
          </Section>
          <Section title={cb.conditions}>
            <div className="grid grid-cols-2 gap-x-3 gap-y-4 sm:gap-x-4">
              <Field label={cb.ambient}><NumberInput value={s.ambientC} allowEmpty allowNegative min={-40} max={80} onChange={(v) => set({ ambientC: v })} suffix="°C" invalid={bad.has('ambient')} data-testid="cb-ambient" /></Field>
              <Field label={cb.insulation}>
                <select className="input" value={s.insulation} onChange={(e) => set({ insulation: e.target.value as Insulation })} data-testid="cb-insulation">
                  {(['pvc', 'xlpe'] as Insulation[]).map((k) => <option key={k} value={k}>{cb.insul[k]}</option>)}
                </select>
              </Field>
              <p className="col-span-2 -mt-2 text-xs leading-5 text-slate-500">{cb.insulHelp}</p>
            </div>
          </Section>
        </>}
        results={!r.valid || !c ? <InvalidHint fields={r.valid ? [] : r.invalid.map((k) => fieldLabel[k])} /> : <>
          <Section title={t.tools.result}>
            <div className="grid grid-cols-2 gap-3">
              <Stat tone={r.level === 'fail' ? 'err' : 'brand'} label={cb.size} value={<span data-testid="cb-size">{sizeText}</span>} sub={[runs > 1 ? cb.perPole : null, r.awg ? cb.awg(r.awg) : null].filter(Boolean).join(' · ') || undefined} />
              <Stat tone={c.deviceStd === false ? 'err' : 'default'} label={cb.device} value={<span data-testid="cb-device">{num(c.breakerA)}</span>} unit="A" sub={deviceText} />
              <Stat tone={r.dropOk ? 'default' : 'warn'} label={cb.dropLabel} value={<span data-testid="cb-drop-out">{numT(c.dropPct, 2)}</span>} unit="%" />
              <Stat label={cb.ampacity} value={numT(c.ampacityA, 1)} unit="A" sub={cb.kAmb(numT(r.kAmb, 3), numT(s.ambientC, 1))} />
              <Stat label={cb.designCurrent} value={<span data-testid="cb-current-out">{numT(r.currentA, 1)}</span>} unit="A" sub={byPower ? cb.fromPower(numT(s.powerKw, 2)) : undefined} className="col-span-2" />
            </div>
            {runs > 1 && <p className="mt-3 text-sm text-slate-700">{cb.parallelNote(num(runs))}</p>}
            <p className="mt-3 text-xs leading-5 text-slate-500">{cb.minNote(numT(r.minMm2, 1))}</p>
          </Section>
          <Section title={t.tools.checks}><CheckRows rows={rows} /></Section>
          <ResultActions text={text} />
        </>}
      />
    </ToolFrame>
  )
}
