import { useMemo } from 'react'
import { useT } from '../../i18n'
import { Field, NumberInput, Section, Disclosure } from '../ui'
import { useMediaQuery, useIsSm } from '../hooks'
import type { StepProps } from '../Wizard'
import { locations, regions } from '../../data/locations'
import { siteFromLocation, DEFAULT_DIESEL_USD_PER_KWH } from '../../engine/defaults'
import { fmt } from '../../engine/format'
import { currencies, defaultFx, currencyName } from '../../data/currencies'
import { iso } from '../../i18n/labels'
import { cityName, countryName } from '../../i18n/places'
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts'
import type { Location } from '../../engine/types'

const REGION_ORDER = ['Africa', 'Middle East', 'Asia', 'Europe', 'Americas', 'Oceania']
const locName = (l: Location, lang: 'en' | 'ar') => (lang === 'ar' ? l.cityAr ?? cityName(l, lang) : l.city)
const ctyName = (l: Location, lang: 'en' | 'ar') => (lang === 'ar' ? l.countryAr ?? countryName(l.country, lang) : l.country)

export function StepSite({ project: p, results: r, update }: StepProps) {
  const { t, lang, dir } = useT()
  const rtl = dir === 'rtl'
  const narrow = useMediaQuery('(max-width: 479px)')
  const sm = useIsSm()
  const s = p.site
  const set = (x: Partial<typeof s>) => update((prev) => ({ site: { ...prev.site, ...x } }))
  const grouped = useMemo(() => [...regions].sort((a, b) => REGION_ORDER.indexOf(a) - REGION_ORDER.indexOf(b)).map((rg) => ({
    rg, items: locations.filter((l) => l.region === rg).sort((a, b) => (a.country === 'Sudan' ? -1 : b.country === 'Sudan' ? 1 : ctyName(a, lang).localeCompare(ctyName(b, lang), lang) || locName(a, lang).localeCompare(locName(b, lang), lang))),
  })), [lang])
  const pick = (id: string) => {
    if (id === 'custom') return set({ locationId: 'custom' })
    const fresh = siteFromLocation(id)
    set({ ...fresh, roofType: s.roofType, availableAreaM2: s.availableAreaM2, currency: s.currency, fxRateToUsd: s.fxRateToUsd, shadingLossPct: s.shadingLossPct, soilingLossPct: s.soilingLossPct, dieselCostUsdPerKwh: s.dieselCostUsdPerKwh ?? fresh.dieselCostUsdPerKwh })
  }
  const setCurrency = (c: string) => set({ currency: c, fxRateToUsd: c === 'USD' ? 1 : defaultFx(c) })
  const setMonth = (i: number, v: number | null) => {
    const m = [...s.monthlyPsh]; m[i] = v ?? m[i]
    set({ monthlyPsh: m, psh: Math.round((m.reduce((a, b) => a + b, 0) / 12) * 100) / 100 })
  }
  const months = narrow ? t.monthsNarrow : t.months
  const chart = s.monthlyPsh.map((v, i) => ({ m: months[i], full: t.months[i], psh: Math.round(v * 100) / 100 }))
  const local = s.currency !== 'USD'
  const fx = s.fxRateToUsd
  const offgrid = p.design.systemType === 'offgrid'
  const hybrid = p.design.systemType === 'hybrid'
  const outage = s.outageHoursPerDay ?? 0
  const diesel = s.dieselCostUsdPerKwh ?? DEFAULT_DIESEL_USD_PER_KWH
  const localUsd = (usd: number) => (local && fx > 0 ? `${fmt(usd * fx, 2)} ${s.currency}` : `${fmt(usd, 2)} USD`)
  const indicative = local && Math.abs(fx - defaultFx(s.currency)) < 1e-9
  const minP = Math.min(...s.monthlyPsh), maxP = Math.max(...s.monthlyPsh)

  return (
    <div className="grid grid-cols-1 gap-4 sm:gap-5 lg:grid-cols-2">
      <Section title={t.site.basics}>
        <div className="grid grid-cols-2 gap-x-3 gap-y-4 sm:gap-x-4">
          <Field label={t.site.location} className="col-span-2">
            <select className="input" value={s.locationId} onChange={(e) => pick(e.target.value)} data-testid="site-location">
              {grouped.map((g) => (
                <optgroup key={g.rg} label={t.site.regions[g.rg] ?? g.rg}>
                  {g.items.map((l) => <option key={l.id} value={l.id}>{`${locName(l, lang)}${lang === 'ar' ? '، ' : ', '}${ctyName(l, lang)} · ${iso(t.site.pshShort(fmt(l.annualPsh, 1)))}`}</option>)}
                </optgroup>
              ))}
              <option value="custom">{t.site.custom}</option>
            </select>
          </Field>
          {s.locationId === 'custom' && <Field label={t.site.customName} className="col-span-2"><input className="input" dir="auto" value={s.customName} onChange={(e) => set({ customName: e.target.value })} /></Field>}
          <Field label={t.site.psh} className="col-span-2 sm:col-span-1"><NumberInput value={s.psh} step={0.1} min={1} max={9} onChange={(v) => { const psh = v ?? s.psh; set({ psh, monthlyPsh: s.locationId === 'custom' ? Array(12).fill(psh) : s.monthlyPsh }) }} /></Field>
          <Field label={t.site.roof} className="col-span-2 sm:col-span-1">
            <select className="input" value={s.roofType} onChange={(e) => set({ roofType: e.target.value as typeof s.roofType })}>
              {(Object.keys(t.site.roofs) as (keyof typeof t.site.roofs)[]).map((k) => <option key={k} value={k}>{t.site.roofs[k]}</option>)}
            </select>
          </Field>
          <Field label={t.site.area}><NumberInput value={s.availableAreaM2} allowEmpty min={0} onChange={(v) => set({ availableAreaM2: v })} placeholder={t.site.areaPh} suffix="m²" /></Field>
          <Field label={t.site.shading}><NumberInput value={s.shadingLossPct} min={0} max={50} onChange={(v) => set({ shadingLossPct: v ?? 0 })} suffix="%" /></Field>
        </div>
        <div className="mt-4 border-t border-slate-100 pt-1">
          <Disclosure title={t.site.advanced} description={t.site.advancedHelp} testId="site-advanced">
            <div className="grid grid-cols-2 gap-x-3 gap-y-4 pb-1 sm:gap-x-4">
              <Field label={t.site.tilt}><NumberInput value={s.tiltDeg} min={0} max={90} onChange={(v) => set({ tiltDeg: v ?? 0 })} /></Field>
              <Field label={t.site.azimuth}><NumberInput value={s.azimuthDeg} min={-180} max={180} allowNegative onChange={(v) => set({ azimuthDeg: v ?? 0 })} /></Field>
              <Field label={t.site.tiltGain}><NumberInput value={s.tiltGainFactor} step={0.01} min={0.8} max={1.4} onChange={(v) => set({ tiltGainFactor: v ?? 1 })} /></Field>
              <Field label={t.site.soiling}><NumberInput value={s.soilingLossPct} min={0} max={30} onChange={(v) => set({ soilingLossPct: v ?? 0 })} suffix="%" /></Field>
              <Field label={t.site.ambient}><NumberInput value={s.ambientHighC} min={-30} max={60} allowNegative onChange={(v) => set({ ambientHighC: v ?? s.ambientHighC })} /></Field>
              <Field label={t.site.ambientAvg}><NumberInput value={s.ambientAvgC} min={-30} max={55} allowNegative onChange={(v) => set({ ambientAvgC: v ?? s.ambientAvgC })} /></Field>
              <Field label={t.site.recordLow}><NumberInput value={s.recordLowC} min={-50} max={40} allowNegative onChange={(v) => set({ recordLowC: v ?? s.recordLowC })} /></Field>
              <Field label={t.site.emission}><NumberInput value={s.gridEmission} step={0.05} min={0} max={2} onChange={(v) => set({ gridEmission: v ?? 0 })} /></Field>
            </div>
          </Disclosure>
        </div>
      </Section>

      <div className="space-y-4 sm:space-y-5">
        <Section title={t.site.monthly} description={<bdi>{`${t.site.avg}: ${t.site.pshShort(fmt(s.psh, 2))}`}</bdi>}>
          <div dir="ltr" className="h-44 sm:h-52" role="img" aria-label={t.site.chartAlt(fmt(minP, 1), fmt(maxP, 1))}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chart} margin={{ top: 8, right: rtl ? 0 : 8, left: rtl ? 8 : 0, bottom: 0 }} accessibilityLayer={false}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                <XAxis dataKey="m" reversed={rtl} interval={0} tick={{ fontSize: 12, fill: '#475569' }} tickLine={false} axisLine={{ stroke: '#cbd5e1' }} />
                <YAxis orientation={rtl ? 'right' : 'left'} width={30} tick={{ fontSize: 12, fill: '#475569' }} tickLine={false} axisLine={false} domain={[0, 'auto']} allowDecimals={false} />
                <Tooltip cursor={{ fill: '#f1f5f9' }} wrapperStyle={{ pointerEvents: 'none' }} labelFormatter={(_, pl) => String(pl?.[0]?.payload?.full ?? '')} formatter={(v) => [t.site.pshShort(String(v)), t.site.monthly]} />
                <Bar dataKey="psh" fill="#f59e0b" radius={[4, 4, 0, 0]} isAnimationActive={false} />
              </BarChart>
            </ResponsiveContainer>
          </div>
          <p className="mt-2 text-sm text-slate-600"><bdi>{t.site.tiltedLine(fmt(s.psh, 2), fmt(s.tiltGainFactor, 2), fmt(s.psh * s.tiltGainFactor, 2))}</bdi></p>
          <div className="mt-2 border-t border-slate-100 pt-1">
            <Disclosure title={t.site.monthlyEdit} description={t.site.monthlyHelp} defaultOpen={sm} testId="site-monthly">
              <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 xl:grid-cols-6">
                {s.monthlyPsh.map((v, i) => (
                  <label key={i} className="block min-w-0">
                    <span className="mb-1 block text-xs font-medium text-slate-600">{t.months[i]}</span>
                    <NumberInput value={v} step={0.1} min={0} max={12} onChange={(x) => setMonth(i, x)} aria-label={`${t.site.monthly}: ${t.months[i]}`} />
                  </label>
                ))}
              </div>
            </Disclosure>
          </div>
        </Section>

        <Section title={t.site.economics}>
          <div className="grid grid-cols-2 gap-x-3 gap-y-4 sm:gap-x-4">
            <Field label={t.site.currency} className={`col-span-2 ${local ? 'sm:col-span-1' : ''}`}>
              <select className="input" value={s.currency} onChange={(e) => setCurrency(e.target.value)} data-testid="site-currency">
                {currencies.map((c) => <option key={c.code} value={c.code}>{`${c.code} · ${currencyName(c.code, lang)}`}</option>)}
                {!currencies.some((c) => c.code === s.currency) && <option value={s.currency}>{s.currency}</option>}
              </select>
            </Field>
            {local && (
              <Field label={`${t.site.fx} · ${t.site.fxLabel(s.currency)}`} className="col-span-2 sm:col-span-1" error={!(fx > 0) ? t.site.fxRequired : undefined} help={indicative ? t.site.fxIndicative : undefined}>
                <NumberInput value={fx} min={0.0001} step={0.01} onChange={(v) => v != null && v > 0 && set({ fxRateToUsd: v })} suffix={s.currency} invalid={!(fx > 0)} data-testid="site-fx" />
              </Field>
            )}
            {offgrid ? (
              <Field label={t.site.diesel} className="col-span-2" help={<>{t.site.dieselHelp}{local && fx > 0 && <> <bdi>{t.site.tariffLocal(`${fmt(diesel * fx, 2)} ${s.currency}`)}</bdi></>}</>}>
                <NumberInput value={diesel} step={0.01} min={0} max={5} onChange={(v) => set({ dieselCostUsdPerKwh: v ?? DEFAULT_DIESEL_USD_PER_KWH })} suffix="USD" data-testid="site-diesel" />
              </Field>
            ) : (
              <Field label={t.site.tariff} className="col-span-2" help={local && fx > 0 ? <bdi>{t.site.tariffLocal(`${fmt(s.gridTariff * fx, 2)} ${s.currency}`)}</bdi> : t.site.tariffHelp}>
                <NumberInput value={s.gridTariff} step={0.01} min={0} max={5} onChange={(v) => set({ gridTariff: v ?? 0 })} suffix="USD" data-testid="site-tariff" />
              </Field>
            )}
            {hybrid && (
              <Field label={t.inputs.site.outage} className="col-span-2 sm:col-span-1" help={t.inputs.site.outageHelp}>
                <NumberInput value={outage} step={1} min={0} max={24} suffix="h" onChange={(v) => set({ outageHoursPerDay: v ?? 0 })} data-testid="site-outage" />
              </Field>
            )}
            {hybrid && outage > 0 && (
              <Field label={t.inputs.site.dieselHybrid} className="col-span-2 sm:col-span-1" help={<>{t.inputs.site.dieselHybridHelp}{local && fx > 0 && <> <bdi>{t.site.tariffLocal(`${fmt(diesel * fx, 2)} ${s.currency}`)}</bdi></>}</>}>
                <NumberInput value={diesel} step={0.01} min={0} max={5} onChange={(v) => set({ dieselCostUsdPerKwh: v ?? DEFAULT_DIESEL_USD_PER_KWH })} suffix="USD" data-testid="site-diesel" />
              </Field>
            )}
            {hybrid && outage > 0 && r.avoidedCostUsdPerKwh > 0 && <p className="col-span-2 text-sm text-slate-600" data-testid="site-blended"><bdi>{t.inputs.site.blended(localUsd(r.avoidedCostUsdPerKwh))}</bdi></p>}
          </div>
        </Section>
      </div>
    </div>
  )
}
