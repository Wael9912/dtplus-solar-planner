import { useMemo } from 'react'
import { useT } from '../../i18n'
import { Field, NumberInput, Section } from '../ui'
import type { StepProps } from '../Wizard'
import { locations, regions } from '../../data/locations'
import { siteFromLocation } from '../../engine/defaults'
import { MONTHS } from '../../engine/standards'
import { fmt } from '../../engine/format'
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts'

const CURRENCIES = ['USD', 'SDG', 'SAR', 'AED', 'EGP', 'QAR', 'OMR', 'KWD', 'BHD', 'JOD', 'IQD', 'ETB', 'KES', 'UGX', 'TZS', 'NGN', 'GHS', 'ZAR', 'MAD', 'TRY', 'PKR', 'INR', 'EUR', 'GBP', 'AUD', 'CAD', 'MXN', 'BRL']

export function StepSite({ project: p, update }: StepProps) {
  const { t } = useT()
  const s = p.site
  const set = (x: Partial<typeof s>) => update((prev) => ({ site: { ...prev.site, ...x } }))
  const grouped = useMemo(() => regions.map((rg) => ({ rg, items: locations.filter((l) => l.region === rg).sort((a, b) => (a.country === 'Sudan' ? -1 : b.country === 'Sudan' ? 1 : a.country.localeCompare(b.country) || a.city.localeCompare(b.city))) })).sort((a, b) => (a.rg === 'Africa' ? -1 : b.rg === 'Africa' ? 1 : a.rg === 'Middle East' ? -1 : b.rg === 'Middle East' ? 1 : 0)), [])
  const pick = (id: string) => {
    if (id === 'custom') return set({ locationId: 'custom' })
    const fresh = siteFromLocation(id)
    set({ ...fresh, roofType: s.roofType, availableAreaM2: s.availableAreaM2, currency: s.currency, fxRateToUsd: s.fxRateToUsd, shadingLossPct: s.shadingLossPct, soilingLossPct: s.soilingLossPct })
  }
  const chart = s.monthlyPsh.map((v, i) => ({ m: MONTHS[i], psh: Math.round(v * s.tiltGainFactor * 100) / 100 }))

  return (
    <div className="grid gap-5 lg:grid-cols-2">
      <Section title={t.site.location}>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={t.site.location} className="sm:col-span-2">
            <select className="input" value={s.locationId} onChange={(e) => pick(e.target.value)}>
              {grouped.map((g) => <optgroup key={g.rg} label={g.rg}>{g.items.map((l) => <option key={l.id} value={l.id}>{l.city}, {l.country} — {l.annualPsh.toFixed(1)} PSH</option>)}</optgroup>)}
              <option value="custom">{t.site.custom}</option>
            </select>
          </Field>
          {s.locationId === 'custom' && <Field label={t.site.custom} className="sm:col-span-2"><input className="input" value={s.customName} onChange={(e) => set({ customName: e.target.value })} /></Field>}
          <Field label={t.site.psh}><NumberInput value={s.psh} step={0.1} min={1} max={9} onChange={(v) => { const psh = v ?? 5; set({ psh, monthlyPsh: s.locationId === 'custom' ? Array(12).fill(psh) : s.monthlyPsh }) }} /></Field>
          <Field label={t.site.tiltGain}><NumberInput value={s.tiltGainFactor} step={0.01} min={0.8} max={1.4} onChange={(v) => set({ tiltGainFactor: v ?? 1 })} /></Field>
          <Field label={t.site.tilt}><NumberInput value={s.tiltDeg} min={0} max={60} onChange={(v) => set({ tiltDeg: v ?? 0 })} /></Field>
          <Field label={t.site.azimuth}><NumberInput value={s.azimuthDeg} min={-180} max={180} onChange={(v) => set({ azimuthDeg: v ?? 0 })} /></Field>
          <Field label={t.site.ambient}><NumberInput value={s.ambientHighC} onChange={(v) => set({ ambientHighC: v ?? 35 })} /></Field>
          <Field label={t.site.ambientAvg}><NumberInput value={s.ambientAvgC} onChange={(v) => set({ ambientAvgC: v ?? 30 })} /></Field>
          <Field label={t.site.recordLow}><NumberInput value={s.recordLowC} onChange={(v) => set({ recordLowC: v ?? 0 })} /></Field>
          <Field label={t.site.shading}><NumberInput value={s.shadingLossPct} min={0} max={50} onChange={(v) => set({ shadingLossPct: v ?? 0 })} /></Field>
          <Field label={t.site.soiling}><NumberInput value={s.soilingLossPct} min={0} max={30} onChange={(v) => set({ soilingLossPct: v ?? 0 })} /></Field>
          <Field label={t.site.roof}>
            <select className="input" value={s.roofType} onChange={(e) => set({ roofType: e.target.value as typeof s.roofType })}>
              {(Object.keys(t.site.roofs) as (keyof typeof t.site.roofs)[]).map((k) => <option key={k} value={k}>{t.site.roofs[k]}</option>)}
            </select>
          </Field>
          <Field label={t.site.area}><NumberInput value={s.availableAreaM2} allowEmpty min={0} onChange={(v) => set({ availableAreaM2: v })} placeholder="—" /></Field>
        </div>
      </Section>
      <div className="space-y-5">
        <Section title={t.site.monthly}>
          <div className="h-48">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chart} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
                <XAxis dataKey="m" tick={{ fontSize: 11 }} /><YAxis tick={{ fontSize: 11 }} domain={[0, 'auto']} />
                <Tooltip formatter={(v) => [`${v} kWh/m²/day`, 'PSH']} />
                <Bar dataKey="psh" fill="#f59e0b" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
          <div className="mt-2 grid grid-cols-6 gap-1 sm:grid-cols-12">
            {s.monthlyPsh.map((v, i) => <input key={i} className="input px-1 py-1 text-center text-xs" type="number" step={0.1} value={v} title={MONTHS[i]} onChange={(e) => { const m = [...s.monthlyPsh]; m[i] = Number(e.target.value) || 0; set({ monthlyPsh: m, psh: Math.round((m.reduce((a, b) => a + b, 0) / 12) * 100) / 100 }) }} />)}
          </div>
          <p className="mt-1 text-xs text-slate-500">{t.site.psh}: {fmt(s.psh, 2)} → ×{s.tiltGainFactor} = {fmt(s.psh * s.tiltGainFactor, 2)} on tilted plane</p>
        </Section>
        <Section title={t.results.economics}>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label={t.site.tariff} help={t.site.tariffHelp}><NumberInput value={s.gridTariff} step={0.01} min={0} onChange={(v) => set({ gridTariff: v ?? 0 })} /></Field>
            <Field label={t.site.emission}><NumberInput value={s.gridEmission} step={0.05} min={0} onChange={(v) => set({ gridEmission: v ?? 0 })} /></Field>
            <Field label={t.site.currency}><select className="input" value={s.currency} onChange={(e) => set({ currency: e.target.value, fxRateToUsd: e.target.value === 'USD' ? 1 : s.fxRateToUsd })}>{CURRENCIES.map((c) => <option key={c}>{c}</option>)}</select></Field>
            <Field label={t.site.fx}><NumberInput value={s.fxRateToUsd} step={0.01} min={0} onChange={(v) => set({ fxRateToUsd: v ?? 1 })} /></Field>
          </div>
        </Section>
      </div>
    </div>
  )
}
