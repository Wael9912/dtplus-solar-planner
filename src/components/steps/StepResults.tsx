import { useState, type ReactNode } from 'react'
import { CircleCheck, Info } from 'lucide-react'
import { useT } from '../../i18n'
import { Section, Stat, Segmented, Disclosure } from '../ui'
import { useMediaQuery, useIsSm } from '../hooks'
import type { StepProps } from '../Wizard'
import { fmt } from '../../engine/format'
import { formatQuoteMoney } from '../../engine/quote'
import { AWG_EQUIV, DAYS_IN_MONTH } from '../../engine/standards'
import { derateLabel, deviceLabel, stringNote, iso, checkText } from '../../i18n/labels'
import { ChecksList } from '../Checks'
import { realIssues } from '../wizardModel'
import { resolveSizing } from '../../engine/sizing'
import { backupHoursAt, backupLoads } from '../../export/common'
import { ComposedChart, Bar, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend, ReferenceLine, AreaChart, Area, CartesianGrid } from 'recharts'
import type { CableResult } from '../../engine/types'

const compact = new Intl.NumberFormat('en', { notation: 'compact', maximumFractionDigits: 1 })

function Row({ k, v, tone }: { k: ReactNode; v: ReactNode; tone?: 'warn' | 'err' }) {
  return (
    <div className="flex flex-col gap-0.5 py-2 sm:grid sm:grid-cols-[minmax(0,2fr)_minmax(0,3fr)] sm:gap-4">
      <dt className="text-xs text-slate-500 sm:text-sm">{k}</dt>
      <dd className={`min-w-0 text-sm font-medium tabular-nums ${tone === 'err' ? 'text-red-700' : tone === 'warn' ? 'text-amber-800' : 'text-slate-900'}`}><bdi>{v}</bdi></dd>
    </div>
  )
}

/**
 * Results adapt to the project: a known-size quote has no consumption data (no demand line, coverage or surge check; savings
 * assume full self-use), a battery-backup system has no panels (backup time instead of production and payback), and a design
 * from the electricity bill states the bill it was sized on.
 */
export function StepResults({ project: p, results: r, quote, goTo }: StepProps) {
  const { t, lang, dir } = useT()
  const O = t.outputs.results
  const rtl = dir === 'rtl'
  const narrow = useMediaQuery('(max-width: 479px)')
  const sm = useIsSm()
  const [tab, setTab] = useState<'overview' | 'engineering'>('overview')
  const fx = quote.fx
  const money = (usd: number, d = 0) => formatQuoteMoney(usd * fx, quote, d)
  const hasBatt = p.design.systemType !== 'gridtie' && r.batteryQty > 0
  const noDemand = r.demand === 'none', backupOnly = !(r.arrayKwp > 0)
  const sz = resolveSizing(p), tg = sz.targets
  const pvFixed = tg.pvKwp != null && tg.pvKwp > 0, invFixed = tg.inverterKw != null && tg.inverterKw > 0, battFixed = tg.batteryKwh != null && tg.batteryKwh > 0
  const hoursTxt = (h: number) => (h > 72 ? O.overDays : O.hoursShort(fmt(h, 1)))
  const at1 = backupHoursAt(r, 1)
  const loadsKw = backupLoads(r)
  const months = narrow ? t.monthsNarrow : t.months
  const demandM = (i: number) => Math.round((r.dailyWh / 1000) * DAYS_IN_MONTH[i])
  const monthly = r.monthlyProductionKwh.map((v, i) => ({ m: months[i], full: t.months[i], production: Math.round(v), demand: demandM(i) }))
  const cash = r.cumulativeCashflow.map((v, i) => ({ y: i, v: Math.round(v * fx) }))
  const coverage = r.annualKwh > 0 ? Math.min(1, r.annualProductionKwh / r.annualKwh) : 0
  const issues = realIssues(r.checks)
  const invTypeTxt = t.design.invTypes[r.inverter?.type ?? p.design.systemType] ?? ''
  const prodDay = r.annualProductionKwh / 365
  const years = p.design.analysisYears || 25
  const perWp = r.arrayKwp > 0 ? quote.total / (r.arrayKwp * 1000) : 0
  const backupTxt = r.batteryHoursBackup > 72 ? t.results.backupLong : t.results.hours(fmt(r.batteryHoursBackup, 1))
  const battName = r.battery ? `${r.battery.brand} ${r.battery.model}` : r.bom.find((b) => b.category === 'Battery')?.name ?? '—'
  const dcAc = r.dcAcRatio ?? (r.inverterTotalKw ? r.arrayKwp / r.inverterTotalKw : 0)
  const cables: CableResult[] = r.cableSchedule?.length ? r.cableSchedule : r.cables
  const useLabel: Record<string, string> = { dc: t.results.dc, battery: t.results.batt, ac: t.results.ac }
  const cableName = (c: CableResult) => (lang === 'ar' ? c.labelAr ?? useLabel[c.use] : c.label ?? useLabel[c.use])
  const notes = lang === 'ar' && r.strings?.notesAr?.length ? r.strings.notesAr : (r.strings?.notes ?? []).map((n) => stringNote(n, lang))
  const axisTick = { fontSize: 12, fill: '#475569' }
  const selfUse = r.checks.find((c) => c.id === 'savings-assumed')
  const fixedTxt = (on: boolean) => (on ? ` (${O.setByClient})` : '')
  const assumptions = t.results.assumptions({ esc: fmt(p.design.tariffEscalationPct ?? 3, 1), disc: fmt(p.design.discountRatePct ?? 6, 1), om: money(r.omUsdPerYear ?? 0), npv: money(r.npvUsd ?? 0),
    repl: (r.replacements ?? []).slice(0, 3).map((x) => t.results.replacement(t.results.replItems[x.item] ?? x.item, x.year, money(x.usd))).join('; ') })

  const overview = (
    <div className="space-y-4 sm:space-y-5" data-testid="results-overview">
      {issues.length > 0 ? (
        <Section title={t.results.checks} description={t.results.issuesN(issues.length)}>
          <ChecksList checks={issues} current="results" onGo={goTo} />
        </Section>
      ) : (
        <div className="flex items-center gap-3 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-800" data-testid="checks-ok"><CircleCheck size={20} />{t.results.allOk}</div>
      )}

      {(noDemand || r.demand === 'bill') && (
        <div className="flex items-start gap-3 rounded-xl border border-sky-200 bg-sky-50 px-4 py-3 text-sm text-sky-900" data-testid="results-basis">
          <Info size={20} className="mt-0.5 shrink-0" aria-hidden="true" />
          <div className="min-w-0 space-y-0.5">
            {noDemand ? <>
              <p className="font-medium">{backupOnly ? `${O.sizeChosen} ${O.noPv}.` : O.sizeChosen}</p>
              {selfUse && !backupOnly && <p>{checkText(selfUse, lang)}</p>}
            </> : <p className="font-medium"><bdi>{O.fromBill(fmt(sz.bill.monthlyKwh), O.profiles[sz.bill.profile] ?? sz.bill.profile)}</bdi></p>}
          </div>
        </div>
      )}

      <section className="card p-4 sm:p-5">
        <p className="text-[0.9375rem] leading-7 text-slate-700 sm:text-base" data-testid="results-sentence">
          {backupOnly ? O.sentenceBackup({ batt: hasBatt ? fmt(r.batteryKwh, 1) : null, usable: fmt(r.batteryUsableKwh, 1), inv: fmt(r.inverterTotalKw, 1), type: invTypeTxt })
            : noDemand ? O.sentenceNoDemand({ pv: fmt(r.arrayKwp, 2), batt: hasBatt ? fmt(r.batteryKwh, 1) : null, inv: fmt(r.inverterTotalKw, 1), type: invTypeTxt, prod: fmt(prodDay, 1) })
              : t.results.sentence({ pv: fmt(r.arrayKwp, 2), batt: hasBatt ? fmt(r.batteryKwh, 1) : null, inv: fmt(r.inverterTotalKw, 1), type: invTypeTxt, prod: fmt(prodDay, 1), demand: fmt(r.dailyWh / 1000, 1), cov: fmt(coverage * 100) })}
        </p>
        <div className="mt-4 grid grid-cols-2 gap-2 sm:gap-3 lg:grid-cols-4" data-testid="results-stats">
          <Stat tone="brand" className="col-span-2 lg:col-span-1" label={t.results.total} value={formatQuoteMoney(quote.total, quote, 0)}
            sub={[perWp > 0 ? t.bom.perWp(formatQuoteMoney(perWp, quote, 2)) : '', quote.vatPct ? t.bom.inclVat(fmt(quote.vatPct, quote.vatPct % 1 ? 1 : 0)) : ''].filter(Boolean).join(' · ') || undefined} />
          {!backupOnly && <Stat label={t.results.arraySize} value={fmt(r.arrayKwp, 2)} unit="kWp" sub={`${r.panelQty} × ${r.panel.watts} W`} />}
          {hasBatt ? <Stat label={t.results.bankSize} value={fmt(r.batteryKwh, 1)} unit="kWh" sub={<>{t.results.usable}: {iso(`${fmt(r.batteryUsableKwh, 1)} kWh`)}</>} />
            : !backupOnly && <Stat label={t.results.dcAc} value={fmt(dcAc, 2)} />}
          <Stat label={t.results.inverter} value={r.inverter ? fmt(r.inverterTotalKw, 1) : '—'} unit={r.inverter ? 'kW' : undefined} sub={r.inverter ? `${r.inverterQty} × ${invTypeTxt}` : undefined} />
          {backupOnly
            ? hasBatt && <Stat className="col-span-2 lg:col-span-1" label={O.backup} value={hoursTxt(at1)} sub={O.backupAt('1')} />
            : <>
              <Stat label={t.results.dailyProduction} value={fmt(prodDay, 1)} unit="kWh" sub={noDemand ? t.results.avgDay : <>{t.results.dailyDemand}: {iso(`${fmt(r.dailyWh / 1000, 1)} kWh`)}</>} />
              <Stat label={r.savingsBasis === 'diesel' ? t.results.savingsDiesel : t.results.savings} value={money(r.annualSavingsUsd)} sub={t.results.perYear} />
              <Stat label={t.results.payback} value={r.paybackYears ? fmt(r.paybackYears, 1) : '—'} unit={r.paybackYears ? t.results.years : undefined} />
              <Stat label={t.results.co2} value={fmt(r.co2TonsPerYear, 1)} unit={t.results.tons} />
            </>}
        </div>
      </section>

      {backupOnly && hasBatt && (
        <Section title={O.backup} description={O.backupHelp}>
          <ul className="-my-1 divide-y divide-slate-100" data-testid="backup-table">
            {loadsKw.map((kw, i) => (
              <li key={kw} className="flex items-center justify-between gap-3 py-2.5">
                <span className="min-w-0">
                  <span className="block text-sm font-medium text-slate-900"><bdi>{O.loadKw(fmt(kw, kw % 1 ? 1 : 0))}</bdi></span>
                  <span className="block text-xs text-slate-500">{i === loadsKw.length - 1 && kw === Math.round(r.inverterTotalKw * 100) / 100 ? O.backupExamples[3] : O.backupExamples[Math.min(i, 2)]}</span>
                </span>
                <bdi className="shrink-0 text-base font-semibold text-slate-900 tabular-nums">{hoursTxt(backupHoursAt(r, kw))}</bdi>
              </li>
            ))}
          </ul>
        </Section>
      )}

      {!backupOnly && <div className="grid grid-cols-1 gap-4 sm:gap-5 lg:grid-cols-2">
        <Section title={noDemand ? O.monthlyProduction : t.results.months}>
          <div dir="ltr" className="h-56 sm:h-64" role="img" aria-label={t.results.chartMonthsAlt} data-testid="chart-months">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={monthly} margin={{ top: 8, right: rtl ? 0 : 8, left: rtl ? 8 : 0, bottom: 0 }} accessibilityLayer={false}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                <XAxis dataKey="m" reversed={rtl} interval={0} tick={axisTick} tickLine={false} axisLine={{ stroke: '#cbd5e1' }} />
                <YAxis orientation={rtl ? 'right' : 'left'} width={40} tick={axisTick} tickLine={false} axisLine={false} tickFormatter={(v) => compact.format(Number(v))} />
                <Tooltip cursor={{ fill: '#f1f5f9' }} wrapperStyle={{ pointerEvents: 'none' }} labelFormatter={(_, pl) => String(pl?.[0]?.payload?.full ?? '')} formatter={(v, name) => [`${fmt(Number(v))} kWh`, String(name)]} />
                {!noDemand && <Legend wrapperStyle={{ fontSize: 12 }} iconSize={10} />}
                <Bar dataKey="production" name={t.results.production} fill="#0d9488" radius={[4, 4, 0, 0]} isAnimationActive={false} />
                {!noDemand && <Line dataKey="demand" name={t.results.demand} type="monotone" stroke="#475569" strokeDasharray="5 4" strokeWidth={2} dot={false} isAnimationActive={false} />}
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        </Section>
        <Section title={t.results.economics} description={r.paybackYears ? t.results.breakEven(fmt(r.paybackYears, 1)) : undefined}>
          <div dir="ltr" className="h-48 sm:h-56" role="img" aria-label={t.results.chartCashAlt}>
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={cash} margin={{ top: 8, right: rtl ? 0 : 8, left: rtl ? 8 : 0, bottom: 0 }} accessibilityLayer={false}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                <XAxis dataKey="y" reversed={rtl} tick={axisTick} tickLine={false} axisLine={{ stroke: '#cbd5e1' }} minTickGap={12} />
                <YAxis orientation={rtl ? 'right' : 'left'} width={44} tick={axisTick} tickLine={false} axisLine={false} tickFormatter={(v) => compact.format(Number(v))} />
                <Tooltip wrapperStyle={{ pointerEvents: 'none' }} formatter={(v) => [formatQuoteMoney(Number(v), quote, 0), t.results.cashflow]} labelFormatter={(l) => t.results.yearN(Number(l))} />
                <ReferenceLine y={0} stroke="#64748b" />
                <Area dataKey="v" stroke="#0d9488" strokeWidth={2} fill="#14b8a6" fillOpacity={0.15} isAnimationActive={false} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
          <p className="mt-1 text-xs text-slate-500">{t.results.cashIn(quote.currency)}</p>
          <p className="mt-2 text-xs leading-5 text-slate-600" data-testid="econ-assumptions">{assumptions}</p>
          <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3">
            <Stat label={t.results.lcoe} value={money(r.lcoeUsdPerKwh, 3)} sub={t.results.perKwh} />
            <Stat label={t.results.roiN(years)} value={r.roi25Pct != null ? `${fmt(r.roi25Pct)}%` : '—'} />
            <Stat className="col-span-2 sm:col-span-1" label={t.results.lifetime} value={fmt(r.lifetimeProductionKwh / 1000)} unit="MWh" />
          </div>
        </Section>
      </div>}
    </div>
  )

  const engineering = (
    <div className="grid grid-cols-1 gap-4 sm:gap-5 lg:grid-cols-2" data-testid="results-engineering">
      {r.demand === 'bill' && (
        <Section title={O.demand}>
          <dl className="-my-2 divide-y divide-slate-100" data-testid="results-bill">
            <Row k={O.monthlyBill} v={`${fmt(sz.bill.monthlyKwh)} kWh`} />
            <Row k={O.dailyEnergy} v={`${fmt(r.dailyWh / 1000, 1)} kWh`} />
            <Row k={O.profile} v={O.profiles[sz.bill.profile] ?? sz.bill.profile} />
            <Row k={O.nightShare} v={`${fmt(r.dailyWh > 0 ? (r.nightWh / r.dailyWh) * 100 : 0)}%`} />
            <Row k={O.peak} v={`${fmt(r.peakW / 1000, 1)} kW`} />
            <Row k={O.surge} v={`${fmt(r.surgeW / 1000, 1)} kW`} />
          </dl>
        </Section>
      )}
      {!backupOnly && <Section title={t.results.pv}>
        <dl className="-my-2 divide-y divide-slate-100">
          <Row k={t.results.requiredPv} v={<>{fmt(r.requiredPvKwp, 2)} kWp{pvFixed ? fixedTxt(true) : noDemand ? <> (<bdi>{O.fromInverter(fmt(tg.inverterKw ?? r.requiredInverterKw, 1), fmt(p.design.dcAcRatio, 2))}</bdi>)</> : null}</>} />
          <Row k={t.results.panels} v={`${r.panelQty} × ${r.panel.brand} ${r.panel.model} (${r.panel.watts} W)`} />
          <Row k={t.results.arraySize} v={`${fmt(r.arrayKwp, 2)} kWp`} />
          <Row k={t.results.area} v={<>{fmt(r.arrayAreaM2, 1)} m² · <bdi>{t.results.spacing(fmt(r.footprintM2 ?? r.arrayAreaM2 * 1.15))}</bdi></>} />
          <Row k={t.results.weight} v={`${fmt(r.arrayWeightKg)} kg`} />
          <Row k={t.site.psh} v={t.results.tiltedPsh(fmt(p.site.psh, 2), fmt(r.tiltedPsh, 2))} />
          <Row k={t.results.annualProd} v={`${fmt(r.annualProductionKwh)} kWh`} />
          <Row k={t.results.yield} v={`${fmt(r.specificYield)} kWh/kWp`} />
          {!noDemand && <Row k={t.results.coverage} v={`${fmt(coverage * 100)}%`} />}
          <Row k={t.results.derateTotal} v={`${fmt(r.derate * 100, 1)}%`} />
        </dl>
        <div className="mt-2 border-t border-slate-100">
          <Disclosure title={t.results.derateBreakdown}>
            <ul className="grid grid-cols-1 gap-x-6 sm:grid-cols-2">
              {r.derateBreakdown.map((b) => <li key={b.name} className="flex justify-between gap-3 border-b border-slate-100 py-1.5 text-sm"><span className="text-slate-600">{lang === 'ar' && b.nameAr ? b.nameAr : derateLabel(b.name, t)}</span><span className="font-medium text-slate-900 tabular-nums" dir="ltr">×{b.factor.toFixed(3)}</span></li>)}
            </ul>
          </Disclosure>
        </div>
      </Section>}

      {hasBatt && (
        <Section title={t.results.battery}>
          <dl className="-my-2 divide-y divide-slate-100">
            <Row k={t.results.reqBatt} v={battFixed || noDemand ? `${fmt(r.batteryRequiredKwh, 1)} kWh${fixedTxt(battFixed)}` : `${fmt(r.batteryRequiredKwh, 1)} kWh (DoD ${fmt(r.dod * 100)}% · ${t.results.days(fmt(p.design.autonomyDays, p.design.autonomyDays % 1 ? 1 : 0))})`} />
            <Row k={t.results.bankSize} v={`${fmt(r.batteryKwh, 1)} kWh · ${fmt(r.batteryAh)} Ah @ ${p.design.systemVoltage === 'hv' ? 'HV' : `${p.design.systemVoltage} V`}`} />
            <Row k={t.results.units} v={t.results.battN(r.batteryQty, battName)} />
            <Row k={t.results.config} v={`${r.batteryConfig.series}S × ${r.batteryConfig.parallel}P`} />
            <Row k={t.results.usable} v={`${fmt(r.batteryUsableKwh, 1)} kWh`} />
            {noDemand ? <Row k={O.backup} v={loadsKw.slice(0, 2).map((kw) => `${hoursTxt(backupHoursAt(r, kw))} ${O.backupAt(fmt(kw, kw % 1 ? 1 : 0))}`).join(' · ')} />
              : p.design.systemType === 'offgrid' ? <Row k={t.results.autonomyActual} v={t.results.days(fmt(r.autonomyDays, 2))} /> : <Row k={t.results.backupCritical} v={backupTxt} />}
            {r.controller && <Row k={t.results.ctrl} v={`${r.controllerQty} × ${r.controller.brand} ${r.controller.model} (${fmt(r.requiredControllerA)} A)`} />}
            {r.generatorKva ? <Row k={t.results.generator} v={`${r.generatorKva} kVA`} /> : null}
          </dl>
        </Section>
      )}

      <Section title={t.results.inverter + (r.strings ? ` · ${t.results.strings}` : '')}>
        <dl className="-my-2 divide-y divide-slate-100">
          <Row k={t.results.reqInv} v={invFixed ? `${fmt(r.requiredInverterKw, 2)} kW${fixedTxt(true)}`
            : r.inverterSizingBasis === 'array' || noDemand ? <>{fmt(r.requiredInverterKw, 2)} kW (<bdi>{t.results.invFromArray(fmt(r.arrayKwp, 2), fmt(p.design.dcAcRatio, 2))}</bdi>)</>
              : <>{fmt(r.requiredInverterKw, 2)} kW (<bdi>{t.results.peakTimes(fmt(r.sizingPeakW ?? r.peakW), fmt(p.design.inverterSafety, 2))}</bdi>)</>} />
          <Row k={t.results.selected} v={r.inverter ? `${r.inverterQty} × ${r.inverter.brand} ${r.inverter.model} · ${fmt(r.inverterTotalKw, 1)} kW` : '—'} />
          {r.inverter && p.design.systemType !== 'gridtie' && !noDemand && <Row k={t.results.surgeCheck} v={t.results.neededAvailable(fmt(r.surgeW / 1000, 1), fmt(r.inverter.surgeKw * r.inverterQty, 1))} />}
          {!backupOnly && <Row k={t.results.dcAc} v={dcAc ? fmt(dcAc, 2) : '—'} />}
          {r.strings && <>
            <Row k={t.results.pps} v={String(r.strings.panelsPerString)} />
            <Row k={t.results.nStrings} v={<>{r.strings.strings} (<bdi>{t.results.panelsN(r.strings.totalPanels)}</bdi>)</>} />
            <Row k={t.results.vocCold} v={t.results.atTemp(fmt(r.strings.vocCold), String(p.site.recordLowC), String(r.strings.maxSystemVoltageV ?? r.inverter?.maxPvVoltage ?? '—'))} />
            <Row k={t.results.vmpHot} v={t.results.mpptRange(fmt(r.strings.vmpHot), String(r.inverter?.mpptMinV ?? '—'), String(r.inverter?.mpptMaxV ?? '—'))} />
            <Row k={t.results.mppt} v={<>{r.strings.mpptsUsed} / {(r.inverter?.mpptCount ?? 0) * r.inverterQty} · <bdi>{t.results.stringsPerMppt(r.strings.stringsPerMppt)}</bdi></>} />
          </>}
        </dl>
        {notes.length > 0 && <div className="mt-3 space-y-1 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900">{notes.map((n) => <p key={n}>{n}</p>)}</div>}
      </Section>

      <Section title={t.results.cables} flush={sm}>
        {sm ? (
          <div className="overflow-x-auto border-t border-slate-200">
            <table className="table" data-testid="cables-table">
              <thead><tr><th>{t.results.use}</th><th className="num">{t.results.current}</th><th className="num">{t.results.length}</th><th>{t.results.size}</th><th className="num">{t.results.drop}</th><th>{t.results.protection}</th></tr></thead>
              <tbody>{cables.map((c, i) => (
                <tr key={(c.id ?? c.use) + i}>
                  <td className="font-medium text-slate-900">{cableName(c)}{c.count && c.count > 1 ? <span className="text-slate-500"> ×{c.count}</span> : null}</td>
                  <td className="num"><bdi>{fmt(c.currentA, 1)} A @ {fmt(c.voltage)} V</bdi></td>
                  <td className="num"><bdi>{fmt(c.lengthM, c.lengthM % 1 ? 1 : 0)} m</bdi></td>
                  <td className="whitespace-nowrap"><bdi className="font-medium text-slate-900">{c.parallelRuns && c.parallelRuns > 1 ? `${c.parallelRuns} × ` : ''}{c.sizeMm2} mm²</bdi><span className="block text-xs text-slate-500" dir="ltr">AWG {AWG_EQUIV[c.sizeMm2] ?? '—'}</span></td>
                  <td className={`num ${c.dropPct > p.design.maxVoltageDropPct ? 'font-semibold text-red-700' : ''}`}><bdi>{fmt(c.dropPct, 2)}%</bdi></td>
                  <td className="whitespace-nowrap"><bdi>{c.fuseA ? `${c.fuseA} A` : `${c.breakerA} A`}</bdi>{c.deviceType && <span className="block max-w-48 truncate text-xs text-slate-500" title={deviceLabel(c.deviceType, lang)}>{deviceLabel(c.deviceType, lang)}</span>}</td>
                </tr>
              ))}</tbody>
            </table>
          </div>
        ) : (
          <ul className="-my-1 divide-y divide-slate-100" data-testid="cables-cards">
            {cables.map((c, i) => (
              <li key={(c.id ?? c.use) + i} className="py-2.5">
                <p className="font-medium text-slate-900">{cableName(c)}{c.count && c.count > 1 ? <span className="text-slate-500"> ×{c.count}</span> : null}</p>
                <p className="text-sm text-slate-600"><bdi>{fmt(c.currentA, 1)} A @ {fmt(c.voltage)} V · {fmt(c.lengthM, c.lengthM % 1 ? 1 : 0)} m</bdi></p>
                <p className="text-sm text-slate-800"><bdi>{c.sizeMm2} mm² (AWG {AWG_EQUIV[c.sizeMm2] ?? '—'})</bdi> · <span className={c.dropPct > p.design.maxVoltageDropPct ? 'font-semibold text-red-700' : ''}>{t.results.drop} <bdi>{fmt(c.dropPct, 2)}%</bdi></span> · <bdi>{c.fuseA ?? c.breakerA} A</bdi></p>
              </li>
            ))}
          </ul>
        )}
      </Section>
    </div>
  )

  return (
    <div className="space-y-4 sm:space-y-5">
      <Segmented kind="tab" label={t.steps.results} value={tab} onChange={setTab} full={!sm} options={[{ value: 'overview', label: t.results.overview, testId: 'tab-overview' }, { value: 'engineering', label: t.results.engineering, testId: 'tab-engineering' }]} />
      {tab === 'overview' ? overview : engineering}
    </div>
  )
}
