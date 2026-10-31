import { useT } from '../../i18n'
import { Section, Stat, Badge } from '../ui'
import type { StepProps } from '../Wizard'
import { fmt, money } from '../../engine/format'
import { MONTHS } from '../../engine/standards'
import { AWG_EQUIV } from '../../engine/standards'
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend, ReferenceLine, AreaChart, Area, CartesianGrid } from 'recharts'

export function StepResults({ project: p, results: r }: StepProps) {
  const { t } = useT()
  const cur = p.site.currency, fx = p.site.fxRateToUsd
  const hasBatt = p.design.systemType !== 'gridtie'
  const monthly = r.monthlyProductionKwh.map((v, i) => ({ m: MONTHS[i], production: Math.round(v), demand: Math.round((r.dailyWh / 1000) * [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][i]) }))
  const cash = r.cumulativeCashflow.map((v, i) => ({ y: i, v: Math.round(v * fx) }))
  const coverage = r.annualKwh > 0 ? Math.min(1, r.annualProductionKwh / r.annualKwh) : 0
  const useLabel: Record<string, string> = { dc: t.results.dc, battery: t.results.batt, ac: t.results.ac }

  return (
    <div className="space-y-5">
      <Section title={t.results.checks}>
        <ul className="grid gap-2 sm:grid-cols-2">
          {r.checks.map((c) => <li key={c.id} className="flex items-start gap-2 text-sm"><Badge level={c.level}>{c.level === 'ok' ? t.common.ok : c.level === 'warn' ? t.common.warn : t.common.error}</Badge><span className="text-slate-700">{c.message}</span></li>)}
        </ul>
      </Section>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat tone="brand" label={t.results.arraySize} value={`${fmt(r.arrayKwp, 2)} ${t.common.kwp}`} sub={`${r.panelQty} × ${r.panel.watts} W · ${t.results.requiredPv} ${fmt(r.requiredPvKwp, 2)} kWp`} />
        {hasBatt && <Stat tone="brand" label={t.results.bankSize} value={`${fmt(r.batteryKwh, 1)} ${t.common.kwh}`} sub={`${r.batteryQty} ${t.results.units} · ${t.results.usable} ${fmt(r.batteryUsableKwh, 1)} kWh`} />}
        <Stat tone="brand" label={t.results.inverter} value={r.inverter ? `${fmt(r.inverterTotalKw, 1)} ${t.common.kw}` : '—'} sub={r.inverter ? `${r.inverterQty} × ${r.inverter.brand} ${r.inverter.model}` : ''} />
        <Stat tone="brand" label={t.results.total} value={money(r.totalUsd, cur, fx)} sub={`${money(r.costPerWp, cur, fx, 2)} / Wp`} />
      </div>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        <Section title={t.results.pv}>
          <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
            <Row k={t.results.requiredPv} v={`${fmt(r.requiredPvKwp, 2)} kWp`} />
            <Row k={t.results.panels} v={`${r.panelQty} × ${r.panel.brand} ${r.panel.model} (${r.panel.watts} W)`} />
            <Row k={t.results.area} v={`${fmt(r.arrayAreaM2, 1)} m² (+15% spacing ≈ ${fmt(r.arrayAreaM2 * 1.15)} m²)`} />
            <Row k={t.results.weight} v={`${fmt(r.arrayWeightKg)} kg`} />
            <Row k={t.site.psh} v={`${fmt(p.site.psh, 2)} → ${fmt(r.tiltedPsh, 2)} tilted`} />
            <Row k={t.results.annualProd} v={`${fmt(r.annualProductionKwh)} kWh`} />
            <Row k={t.results.yield} v={`${fmt(r.specificYield)} kWh/kWp/yr`} />
            <Row k={t.results.coverage} v={`${fmt(coverage * 100)}%`} />
            <Row k={t.results.derate} v={`${fmt(r.derate * 100, 1)}%`} />
          </dl>
          <details className="mt-3 text-xs text-slate-600"><summary className="cursor-pointer font-medium">{t.results.derate}</summary>
            <ul className="mt-2 grid grid-cols-2 gap-1">{r.derateBreakdown.map((b) => <li key={b.name} className="flex justify-between border-b border-slate-100 py-0.5"><span>{b.name}</span><span className="tabular-nums">×{b.factor.toFixed(2)}</span></li>)}</ul>
          </details>
        </Section>

        {hasBatt ? (
          <Section title={t.results.battery}>
            <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
              <Row k={t.results.reqBatt} v={`${fmt(r.batteryRequiredKwh, 1)} kWh (DoD ${fmt(r.dod * 100)}%, ${p.design.autonomyDays} d)`} />
              <Row k={t.results.bankSize} v={`${fmt(r.batteryKwh, 1)} kWh · ${fmt(r.batteryAh)} Ah @ ${p.design.systemVoltage === 'hv' ? 'HV' : p.design.systemVoltage + ' V'}`} />
              <Row k={t.results.units} v={`${r.batteryQty} × ${r.bom.find((b) => b.category === 'Battery')?.name ?? '—'}`} />
              <Row k={t.results.config} v={`${r.batteryConfig.series}S × ${r.batteryConfig.parallel}P`} />
              <Row k={t.results.usable} v={`${fmt(r.batteryUsableKwh, 1)} kWh`} />
              <Row k={t.results.backupHours} v={`${fmt(r.batteryHoursBackup, 1)} h`} />
              {r.controller && <Row k={t.results.ctrl} v={`${r.controllerQty} × ${r.controller.brand} ${r.controller.model} (${fmt(r.requiredControllerA)} A)`} />}
              {r.generatorKva && <Row k={t.results.generator} v={`${r.generatorKva} kVA`} />}
            </dl>
          </Section>
        ) : (
          <Section title={t.results.inverter}>
            <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
              <Row k={t.results.reqInv} v={`${fmt(r.requiredInverterKw, 2)} kW`} />
              <Row k={t.results.selected} v={r.inverter ? `${r.inverterQty} × ${r.inverter.brand} ${r.inverter.model}` : '—'} />
              <Row k={t.results.dc + '/AC'} v={r.inverterTotalKw ? fmt(r.arrayKwp / r.inverterTotalKw, 2) : '—'} />
            </dl>
          </Section>
        )}

        <Section title={t.results.inverter + (r.strings ? ' · ' + t.results.strings : '')}>
          <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
            <Row k={t.results.reqInv} v={`${fmt(r.requiredInverterKw, 2)} kW (peak ${fmt(r.peakW)} W × ${p.design.inverterSafety})`} />
            <Row k={t.results.selected} v={r.inverter ? `${r.inverterQty} × ${r.inverter.brand} ${r.inverter.model} · ${fmt(r.inverterTotalKw, 1)} kW` : '—'} />
            <Row k={t.results.surgeCheck} v={r.inverter ? `${fmt(r.surgeW / 1000, 1)} kW needed / ${fmt(r.inverter.surgeKw * r.inverterQty, 1)} kW available` : '—'} />
            <Row k="DC/AC" v={r.inverterTotalKw ? fmt(r.arrayKwp / r.inverterTotalKw, 2) : '—'} />
            {r.strings && <>
              <Row k={t.results.pps} v={`${r.strings.panelsPerString}`} />
              <Row k={t.results.nStrings} v={`${r.strings.strings} (${r.strings.totalPanels} panels)`} />
              <Row k={t.results.vocCold} v={`${fmt(r.strings.vocCold)} V @ ${p.site.recordLowC}°C (max ${r.inverter?.maxPvVoltage} V)`} />
              <Row k={t.results.vmpHot} v={`${fmt(r.strings.vmpHot)} V (MPPT ${r.inverter?.mpptMinV}–${r.inverter?.mpptMaxV} V)`} />
              <Row k={t.results.mppt} v={`${r.strings.mpptsUsed} / ${(r.inverter?.mpptCount ?? 0) * r.inverterQty} · ${r.strings.stringsPerMppt} strings/MPPT`} />
            </>}
          </dl>
          {r.strings?.notes.length ? <p className="mt-2 text-xs text-amber-700">{r.strings.notes.join(' ')}</p> : null}
        </Section>

        <Section title={t.results.cables}>
          <div className="overflow-x-auto"><table className="table">
            <thead><tr><th>{t.results.use}</th><th>{t.results.current}</th><th>{t.results.length}</th><th>{t.results.size}</th><th>{t.results.drop}</th><th>{t.results.protection}</th></tr></thead>
            <tbody>{r.cables.map((c) => <tr key={c.use}><td>{useLabel[c.use]}</td><td className="tabular-nums">{fmt(c.currentA, 1)} A @ {c.voltage} V</td><td className="tabular-nums">{c.lengthM} m</td><td className="font-medium">{c.sizeMm2} mm² <span className="text-xs text-slate-400">(AWG {AWG_EQUIV[c.sizeMm2]})</span></td><td className={`tabular-nums ${c.dropPct > p.design.maxVoltageDropPct ? 'text-red-600' : ''}`}>{c.dropPct}%</td><td>{c.breakerA} A</td></tr>)}</tbody>
          </table></div>
        </Section>
      </div>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        <Section title={t.results.months}>
          <div className="h-56"><ResponsiveContainer width="100%" height="100%">
            <BarChart data={monthly} margin={{ top: 4, right: 4, left: -10, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" /><XAxis dataKey="m" tick={{ fontSize: 11 }} /><YAxis tick={{ fontSize: 11 }} />
              <Tooltip formatter={(v) => [`${fmt(Number(v))} kWh`]} /><Legend wrapperStyle={{ fontSize: 12 }} />
              <Bar dataKey="production" name={t.results.production} fill="#0d9488" radius={[4, 4, 0, 0]} />
              <ReferenceLine y={monthly[0]?.demand} stroke="#f59e0b" strokeDasharray="4 4" label={{ value: t.results.demand, fontSize: 11, fill: '#b45309', position: 'insideTopRight' }} />
            </BarChart>
          </ResponsiveContainer></div>
        </Section>
        <Section title={t.results.economics}>
          <div className="mb-3 grid grid-cols-2 gap-2 sm:grid-cols-3">
            <Stat label={t.results.savings} value={money(r.annualSavingsUsd, cur, fx)} />
            <Stat label={t.results.payback} value={r.paybackYears ? `${fmt(r.paybackYears, 1)} ${t.results.years}` : '—'} />
            <Stat label={t.results.lcoe} value={money(r.lcoeUsdPerKwh, cur, fx, 3)} sub="/ kWh" />
            <Stat label={t.results.co2} value={`${fmt(r.co2TonsPerYear, 1)} ${t.results.tons}`} />
            <Stat label={t.results.roi} value={r.roi25Pct != null ? `${fmt(r.roi25Pct)}%` : '—'} />
            <Stat label={t.results.lifetime} value={`${fmt(r.lifetimeProductionKwh / 1000)} MWh`} />
          </div>
          <div className="h-40"><ResponsiveContainer width="100%" height="100%">
            <AreaChart data={cash} margin={{ top: 4, right: 4, left: -10, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" /><XAxis dataKey="y" tick={{ fontSize: 11 }} /><YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => `${Math.round(v / 1000)}k`} />
              <Tooltip formatter={(v) => [money(Number(v) / fx, cur, fx), t.results.cashflow]} labelFormatter={(l) => `${t.results.years} ${l}`} />
              <ReferenceLine y={0} stroke="#64748b" /><Area dataKey="v" stroke="#0d9488" fill="#ccfbf1" />
            </AreaChart>
          </ResponsiveContainer></div>
        </Section>
      </div>
    </div>
  )
}
function Row({ k, v }: { k: string; v: string }) { return <><dt className="text-slate-500">{k}</dt><dd className="min-w-0 wrap-anywhere font-medium text-slate-800 tabular-nums">{v}</dd></> }
