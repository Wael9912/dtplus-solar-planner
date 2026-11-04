import { useMemo } from 'react'
import { SolarPanel } from 'lucide-react'
import { useT } from '../../i18n'
import { useAppStore } from '../../store/useAppStore'
import { useCatalog } from '../useEngine'
import { Field, NumberInput, Section, Segmented, Stat } from '../ui'
import { checkStrings, controllerMppt, inverterMppt, panelSpec, type MpptSpec, type PvModuleSpec, type StringField } from '../../engine/tools'
import { defaultDesign, siteFromLocation } from '../../engine/defaults'
import { toast } from '../../store/useToast'
import { locations } from '../../data/locations'
import { cityName } from '../../i18n/places'
import type { ChargeController, Inverter, Panel, SystemType } from '../../engine/types'
import { CheckRows, CityPicker, InvalidHint, ProductPicker, ResultActions, ToolFrame, ToolLayout, type PickOpt, type RowView } from './common'
import { hotOf, line, num, numT, useDefaultLocation, useToolState } from './useTool'

const DEF_PANEL = 'pnl-ja-550-jam72s30', DEF_INV = 'inv-deye-8k-sg01lp1', DEF_CC = 'cc-victron-150-35'
type N = number | null
const panelNums = (p?: Panel) => ({ watts: (p?.watts ?? null) as N, voc: (p?.voc ?? null) as N, vmp: (p?.vmp ?? null) as N, isc: (p?.isc ?? null) as N, imp: (p?.imp ?? null) as N,
  tcVoc: (p?.tempCoeffVocPctPerC ?? null) as N, tcPmax: (p?.tempCoeffPmaxPctPerC ?? null) as N, noct: (p?.noct ?? 45) as N, maxSysV: (p?.maxSystemVoltage ?? null) as N, maxFuse: (p?.maxSeriesFuseA ?? null) as N })
const mpptNums = (i?: Inverter) => ({ maxPvV: (i?.maxPvVoltage ?? null) as N, mpptMin: (i?.mpptMinV ?? null) as N, mpptMax: (i?.mpptMaxV ?? null) as N, mpptCount: (i?.mpptCount ?? 1) as N, maxA: (i?.maxInputCurrentPerMppt ?? null) as N, maxPvKw: (i?.maxPvInputKw ?? null) as N })
const ENUMS = { panelSrc: ['catalog', 'datasheet'], inputSrc: ['inverter', 'controller', 'datasheet'], code: [1000, 1500], busV: [12, 24, 36, 48] } as const

export function StringsTool() {
  const { t, lang } = useT()
  const cat = useCatalog()
  const loc = useDefaultLocation()
  const company = useAppStore((s) => s.company)
  const createProject = useAppStore((s) => s.createProject)
  const mpptInverters = useMemo(() => cat.inverters.filter((i) => i.mpptCount > 0).sort((a, b) => a.ratedAcKw - b.ratedAcKw), [cat])
  const defaults = useMemo(() => {
    const p = cat.panels.find((x) => x.id === DEF_PANEL) ?? cat.panels[0], i = mpptInverters.find((x) => x.id === DEF_INV) ?? mpptInverters[0]
    return {
      panelSrc: 'catalog' as 'catalog' | 'datasheet', panelId: p?.id ?? '', panel: panelNums(p),
      inputSrc: 'inverter' as 'inverter' | 'controller' | 'datasheet', inverterId: i?.id ?? '', controllerId: DEF_CC, busV: 48 as number, mppt: mpptNums(i),
      units: 1 as N, panelCount: 16 as N, locationId: loc.id, low: loc.recordLowTempC as N, hot: hotOf(loc) as N, code: 1000 as number,
    }
  }, [cat, mpptInverters, loc])
  const [s, set] = useToolState('strings', defaults, ENUMS)
  const st = t.tools.st

  const panel = cat.panels.find((p) => p.id === s.panelId) ?? cat.panels.find((p) => p.id === DEF_PANEL) ?? cat.panels[0]
  const inv = mpptInverters.find((i) => i.id === s.inverterId) ?? mpptInverters[0]
  const cc: ChargeController | undefined = cat.chargeControllers.find((c) => c.id === s.controllerId) ?? cat.chargeControllers[0]
  const busV = cc && !cc.batteryVoltages.includes(s.busV) ? (cc.batteryVoltages.includes(48) ? 48 : Math.max(...cc.batteryVoltages)) : s.busV
  const module: PvModuleSpec = s.panelSrc === 'catalog' && panel ? panelSpec(panel) : {
    watts: s.panel.watts, voc: s.panel.voc, vmp: s.panel.vmp, isc: s.panel.isc, imp: s.panel.imp, tempCoeffVocPctPerC: s.panel.tcVoc, tempCoeffPmaxPctPerC: s.panel.tcPmax,
    noct: s.panel.noct, maxSystemVoltage: s.panel.maxSysV, maxSeriesFuseA: s.panel.maxFuse,
  }
  const mppt: MpptSpec = s.inputSrc === 'inverter' && inv ? inverterMppt(inv) : s.inputSrc === 'controller' && cc ? controllerMppt(cc, busV, module)
    : { maxPvVoltage: s.mppt.maxPvV, mpptMinV: s.mppt.mpptMin, mpptMaxV: s.mppt.mpptMax, mpptCount: s.mppt.mpptCount, maxInputCurrentPerMppt: s.mppt.maxA, maxPvInputKw: s.mppt.maxPvKw }
  const r = checkStrings({ module, mppt, units: s.units, panelCount: s.panelCount, recordLowC: s.low, hotAmbientC: s.hot, codeLimitV: s.code })
  const bad = new Set<StringField>(r.valid ? [] : r.invalid)

  const panelOpts: PickOpt[] = useMemo(() => [...cat.panels].sort((a, b) => a.watts - b.watts).map((p) => ({ id: p.id, title: `${p.brand} ${p.model}`, sub: [`${p.watts} W`, `Voc ${p.voc} V`, `Isc ${p.isc} A`], hidden: cat.hidden.has(p.id), search: `${p.brand} ${p.model} ${p.watts}` })), [cat])
  const invOpts: PickOpt[] = useMemo(() => mpptInverters.map((i) => ({ id: i.id, title: `${i.brand} ${i.model}`, sub: [`${numT(i.ratedAcKw, 1)} kW`, `${i.mpptCount} MPPT`, `${i.mpptMinV}-${i.mpptMaxV} V`, `${i.maxInputCurrentPerMppt} A`], hidden: cat.hidden.has(i.id), search: `${i.brand} ${i.model} ${i.ratedAcKw}` })), [mpptInverters, cat])
  const ccOpts: PickOpt[] = useMemo(() => cat.chargeControllers.map((c) => ({ id: c.id, title: `${c.brand} ${c.model}`, sub: [`${c.maxChargeA} A`, `${c.maxPvVoltage} V`, c.type ?? 'MPPT'], hidden: cat.hidden.has(c.id), search: `${c.brand} ${c.model} ${c.maxChargeA}` })), [cat])

  const setPanel = (k: keyof typeof s.panel, v: N) => set((cur) => ({ panel: { ...cur.panel, [k]: v } }))
  const setMppt = (k: keyof typeof s.mppt, v: N) => set((cur) => ({ mppt: { ...cur.mppt, [k]: v } }))
  const pf = (k: keyof typeof s.panel, unit: string, o: { neg?: boolean; empty?: boolean; ph?: string; help?: string } = {}) => (
    <Field label={st.f[k]} help={o.help}><NumberInput value={s.panel[k]} onChange={(v) => setPanel(k, v)} suffix={unit} allowNegative={o.neg} allowEmpty={o.empty ?? true} placeholder={o.ph} invalid={bad.has(k)} data-testid={`st-${k}`} /></Field>
  )
  const mf = (k: keyof typeof s.mppt, unit: string, o: { int?: boolean; empty?: boolean } = {}) => (
    <Field label={st.f[k]}><NumberInput value={s.mppt[k]} onChange={(v) => setMppt(k, v)} suffix={unit} integer={o.int} allowEmpty={o.empty ?? true} invalid={bad.has(k)} data-testid={`st-${k}`} /></Field>
  )

  // ---- result rows → text
  const rowView: RowView[] = r.valid ? r.rows.map((x) => {
    const d = st.d
    const detail = x.id === 'coldVoc' ? d.coldVoc(numT(x.value), numT(x.limit), numT(x.extra))
      : x.id === 'hotVmp' ? d.hotVmp(numT(x.value), numT(x.limit))
        : x.id === 'stcVmp' ? d.stcVmp(numT(x.value), numT(x.limit))
          : x.id === 'current' ? d.current(numT(x.value, 2), numT(x.limit * 1.25, 2), numT(x.extra, 2), numT(x.limit, 2))
            : x.id === 'inputs' ? d.inputs(num(x.value), num(x.limit))
              : x.id === 'pvPower' ? d.pvPower(numT(x.value, 2), numT(x.limit, 2))
                : r.fuse && r.fuse.ratingA == null ? d.fuseNone
                  : (r.fuse?.required ? d.fuseRequired(num(r.fuse.ratingA), num(r.fuse.stringsPerInput)) : d.fuseNot(num(r.fuse?.ratingA), num(r.fuse?.stringsPerInput)))
                    + (r.fuse?.maxSeriesFuseA ? d.fuseModule(num(r.fuse.maxSeriesFuseA)) : '')
    return { id: x.id, level: x.level, label: st.rows[x.id], detail }
  }) : []
  const notes = r.valid && r.layout ? (lang === 'ar' ? r.layout.notesAr ?? r.layout.notes : r.layout.notes) : []
  const rangeText = r.valid ? (r.rangeOk ? st.rangeValue(num(r.seriesMin), num(r.seriesMax)) : st.noRange) : ''
  const rangeSub = r.valid ? st.rangeSub(num(r.seriesMin), num(Math.max(0, r.seriesMaxVoc)), num(Math.max(0, r.seriesMaxMppt))) : ''
  const layoutText = r.valid && r.layout ? st.layoutValue(num(r.layout.strings), num(r.layout.panelsPerString)) : ''
  const layoutSub = r.valid && r.layout ? st.layoutSub(num(r.layout.totalPanels), num(r.layout.stringsPerMppt), num(r.layout.mpptsUsed)) : ''

  const city = locations.find((l) => l.id === s.locationId)
  const panelTitle = s.panelSrc === 'catalog' && panel ? `${panel.brand} ${panel.model}` : st.inputKinds.datasheet
  const inputTitle = s.inputSrc === 'inverter' && inv ? `${inv.brand} ${inv.model}` : s.inputSrc === 'controller' && cc ? `${cc.brand} ${cc.model} · ${busV} V` : st.inputKinds.datasheet
  const text = r.valid ? [
    t.tools.copyHeader(t.tools.names.strings),
    line(st.panel, `${panelTitle} (${num(module.watts)} W, Voc ${numT(module.voc, 2)} V, Vmp ${numT(module.vmp, 2)} V, Isc ${numT(module.isc, 2)} A)`),
    line(st.input, `${inputTitle} × ${num(s.units)}`),
    line(st.site, `${city ? cityName(city, lang) + ' · ' : ''}${numT(s.low)} / ${numT(s.hot)} °C · ${s.code} V`),
    line(st.range, rangeText),
    ...(r.layout ? [line(st.layout, `${layoutText} (${layoutSub})`)] : []),
    ...rowView.map((x) => `${t.tools.copyLevel[x.level]} ${x.label}: ${x.detail}`),
    ...notes,
  ].join('\n') : null

  const canStart = r.valid && !!r.layout && s.panelSrc === 'catalog' && s.inputSrc === 'inverter' && !!panel && !!inv
  const start = () => {
    if (!canStart || !r.valid || !r.layout || !inv || !panel) return
    const type: SystemType = inv.type === 'gridtie' ? 'gridtie' : inv.type === 'offgrid' ? 'offgrid' : 'hybrid'
    const bv = inv.batteryVoltage
    const systemVoltage = typeof bv === 'string' ? 'hv' : bv === 12 || bv === 24 || bv === 48 ? bv : 48
    const cur = company.currency || 'USD'
    const site = { ...siteFromLocation(s.locationId), currency: cur, fxRateToUsd: cur === 'USD' ? 1 : company.fxRateToUsd > 0 ? company.fxRateToUsd : 1, recordLowC: s.low ?? 0, ambientHighC: s.hot ?? 40, roofType: s.code === 1500 ? 'ground' as const : 'flat-concrete' as const }
    createProject({ site, design: { ...defaultDesign(type), phase: inv.phase, panelId: panel.id, inverterId: inv.id, inverterQty: s.units ?? 1, panelOverrideQty: r.layout.totalPanels, systemVoltage } }, 'design')
    toast({ message: t.tools.started, tone: 'ok' })
  }

  return (
    <ToolFrame id="strings" icon={SolarPanel}>
      <ToolLayout
        inputs={<>
          <Section title={st.panel} right={<Segmented label={st.panel} value={s.panelSrc} onChange={(v) => set({ panelSrc: v })}
            options={[{ value: 'catalog', label: t.tools.source.catalog, testId: 'st-panel-catalog' }, { value: 'datasheet', label: t.tools.source.datasheet, testId: 'st-panel-datasheet' }]} />}>
            {s.panelSrc === 'catalog'
              ? <ProductPicker label={st.panel} hideLabel value={panel?.id ?? ''} options={panelOpts} onPick={(id) => set({ panelId: id })} testId="st-panel" />
              : (
                <div className="grid grid-cols-2 gap-x-3 gap-y-4 sm:grid-cols-3 sm:gap-x-4">
                  {pf('watts', 'W')}{pf('voc', 'V')}{pf('vmp', 'V')}{pf('isc', 'A')}{pf('imp', 'A')}{pf('noct', '°C')}
                  {pf('tcVoc', '%/°C', { neg: true, help: st.tcHelp })}{pf('tcPmax', '%/°C', { neg: true })}
                  {pf('maxSysV', 'V', { ph: '1500' })}{pf('maxFuse', 'A', { ph: t.tools.optional })}
                </div>
              )}
          </Section>

          <Section title={st.input}>
            <Segmented label={st.input} value={s.inputSrc} onChange={(v) => set({ inputSrc: v })} full className="mb-4"
              options={[{ value: 'inverter', label: st.inputKinds.inverter, testId: 'st-src-inverter' }, { value: 'controller', label: st.inputKinds.controller, testId: 'st-src-controller' }, { value: 'datasheet', label: st.inputKinds.datasheet, testId: 'st-src-datasheet' }]} />
            {s.inputSrc === 'inverter' && <ProductPicker label={st.inputKinds.inverter} value={inv?.id ?? ''} options={invOpts} onPick={(id) => set({ inverterId: id })} testId="st-inverter" />}
            {s.inputSrc === 'controller' && cc && (
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                <div className="sm:col-span-2"><ProductPicker label={st.inputKinds.controller} value={cc.id} options={ccOpts} onPick={(id) => set({ controllerId: id })} testId="st-controller" /></div>
                <Field label={st.f.bus}>
                  <select className="input" value={busV} onChange={(e) => set({ busV: Number(e.target.value) })} data-testid="st-bus">
                    {cc.batteryVoltages.map((v) => <option key={v} value={v}>{`${v} V`}</option>)}
                  </select>
                </Field>
                {cc.type === 'PWM' && <p className="text-sm text-amber-800 sm:col-span-3">{st.pwm}</p>}
              </div>
            )}
            {s.inputSrc === 'datasheet' && (
              <div className="grid grid-cols-2 gap-x-3 gap-y-4 sm:grid-cols-3 sm:gap-x-4">
                {mf('maxPvV', 'V')}{mf('mpptMin', 'V')}{mf('mpptMax', 'V')}{mf('mpptCount', '', { int: true })}{mf('maxA', 'A')}{mf('maxPvKw', 'kW')}
              </div>
            )}
            <div className="mt-4 grid grid-cols-2 gap-x-3 gap-y-4 border-t border-slate-100 pt-4 sm:gap-x-4">
              <Field label={st.f.units} help={st.unitsHelp}><NumberInput integer stepper value={s.units} min={1} max={50} onChange={(v) => set({ units: v })} invalid={bad.has('units')} data-testid="st-units" /></Field>
              <Field label={st.f.panelCount} help={st.countHelp}><NumberInput integer stepper allowEmpty value={s.panelCount} min={1} max={5000} onChange={(v) => set({ panelCount: v })} invalid={bad.has('panelCount')} data-testid="st-count" /></Field>
            </div>
          </Section>

          <Section title={st.site}>
            <div className="grid grid-cols-2 gap-x-3 gap-y-4 sm:gap-x-4">
              <div className="col-span-2"><CityPicker value={s.locationId} onPick={(l) => set({ locationId: l.id, low: l.recordLowTempC, hot: hotOf(l) })} /></div>
              <Field label={st.f.low} help={st.lowHelp}><NumberInput value={s.low} allowNegative allowEmpty min={-50} max={40} suffix="°C" onChange={(v) => set({ low: v })} invalid={bad.has('low')} data-testid="st-low" /></Field>
              <Field label={st.f.hot} help={st.hotHelp}><NumberInput value={s.hot} allowNegative allowEmpty min={-20} max={60} suffix="°C" onChange={(v) => set({ hot: v })} invalid={bad.has('hot')} data-testid="st-hot" /></Field>
              <Field as="div" label={st.code} className="col-span-2">
                <Segmented label={st.code} value={String(s.code) as '1000' | '1500'} onChange={(v) => set({ code: Number(v) })} full
                  options={[{ value: '1000', label: st.codes[1000], testId: 'st-code-1000' }, { value: '1500', label: st.codes[1500], testId: 'st-code-1500' }]} />
              </Field>
            </div>
          </Section>
        </>}
        results={!r.valid ? <InvalidHint fields={r.invalid.map((k) => st.f[k])} /> : <>
          <Section title={t.tools.result}>
            <div className="grid grid-cols-2 gap-3">
              <Stat tone={r.rangeOk ? 'brand' : 'err'} label={st.range} value={<span dir="ltr" data-testid="st-range">{rangeText}</span>} sub={rangeSub} />
              {r.layout
                ? <Stat label={st.layout} value={<span dir="ltr" data-testid="st-layout">{layoutText}</span>} sub={layoutSub} />
                : <p className="self-center text-sm text-slate-600" data-testid="st-need-count">{st.needCount}</p>}
            </div>
            {notes.length > 0 && <ul className="mt-3 space-y-1 text-sm text-amber-800" data-testid="st-notes">{notes.map((n) => <li key={n}>{n}</li>)}</ul>}
            <p className="mt-3 text-xs leading-5 text-slate-500">
              {st.temps(numT(r.vocColdModule, 2), numT(s.low), numT(r.vmpHotModule, 2), numT(r.cellHotC))} {st.limitLine(numT(r.vLimit), st.limitBy[r.limitBy])}
            </p>
          </Section>
          {rowView.length > 0 && <Section title={t.tools.checks}><CheckRows rows={rowView} /></Section>}
          <ResultActions text={text} onStart={start} startBlocked={!canStart} />
        </>}
      />
    </ToolFrame>
  )
}
