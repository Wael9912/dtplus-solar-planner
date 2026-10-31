import { jsPDF } from 'jspdf'
import autoTable from 'jspdf-autotable'
import type { Project, Results, CompanySettings } from '../engine/types'
import { fmt, money } from '../engine/format'
import { MONTHS, AWG_EQUIV } from '../engine/standards'
import { en } from '../i18n/en'

type RGB = [number, number, number]
const hex2rgb = (h: string): RGB => { const m = h.replace('#', ''); return [parseInt(m.slice(0, 2), 16), parseInt(m.slice(2, 4), 16), parseInt(m.slice(4, 6), 16)] }
const SLATE: RGB = [71, 85, 105]

function header(doc: jsPDF, company: CompanySettings, title: string, subtitle: string) {
  const brand = hex2rgb(company.primaryColor || '#0f766e')
  doc.setFillColor(...brand); doc.rect(0, 0, 210, 28, 'F')
  if (company.logoDataUrl) { try { doc.addImage(company.logoDataUrl, 'PNG', 14, 5, 36, 18, undefined, 'FAST') } catch { /* ignore bad image */ } }
  doc.setTextColor(255, 255, 255); doc.setFont('helvetica', 'bold'); doc.setFontSize(16)
  doc.text(company.name, company.logoDataUrl ? 56 : 14, 13)
  doc.setFont('helvetica', 'normal'); doc.setFontSize(9)
  doc.text([company.tagline, [company.phone, company.email, company.website].filter(Boolean).join('  ·  ')].filter(Boolean), company.logoDataUrl ? 56 : 14, 19)
  doc.setFontSize(14); doc.setFont('helvetica', 'bold'); doc.text(title, 196, 13, { align: 'right' })
  doc.setFontSize(9); doc.setFont('helvetica', 'normal'); doc.text(subtitle, 196, 19, { align: 'right' })
  doc.setTextColor(...SLATE)
}
function footer(doc: jsPDF, company: CompanySettings) {
  const n = doc.getNumberOfPages()
  for (let i = 1; i <= n; i++) {
    doc.setPage(i); doc.setFontSize(8); doc.setTextColor(148, 163, 184)
    doc.text(`${company.name} · ${company.address || ''}`.trim(), 14, 290)
    doc.text(`Product developed by DT+ · Page ${i} / ${n}`, 196, 290, { align: 'right' })
  }
}
function h2(doc: jsPDF, text: string, y: number, brand: RGB) {
  doc.setFontSize(12); doc.setFont('helvetica', 'bold'); doc.setTextColor(...brand); doc.text(text, 14, y)
  doc.setDrawColor(...brand); doc.setLineWidth(0.4); doc.line(14, y + 1.5, 196, y + 1.5); doc.setTextColor(...SLATE); doc.setFont('helvetica', 'normal')
  return y + 7
}
const tableBase = (brand: RGB) => ({ theme: 'grid' as const, styles: { fontSize: 8.5, cellPadding: 1.8, textColor: SLATE, lineColor: [226, 232, 240] as RGB, lineWidth: 0.2 }, headStyles: { fillColor: brand, textColor: [255, 255, 255] as RGB, fontStyle: 'bold' as const }, alternateRowStyles: { fillColor: [248, 250, 252] as RGB }, margin: { left: 14, right: 14 } })
const lastY = (doc: jsPDF) => (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY

export async function exportProposalPdf(p: Project, r: Results, company: CompanySettings, _lang: 'en' | 'ar', filename: string) {
  const t = en // PDF body is English (jsPDF core fonts have no Arabic shaping); Arabic UI users still get an English proposal document.
  const doc = new jsPDF({ unit: 'mm', format: 'a4' })
  const brand = hex2rgb(company.primaryColor || '#0f766e')
  const cur = p.site.currency, fx = p.site.fxRateToUsd
  const M = (v: number, d = 0) => money(v, cur, fx, d)
  const date = new Date(); const valid = new Date(date.getTime() + company.quoteValidityDays * 864e5)
  header(doc, company, 'Solar Proposal', `${p.reference} · ${date.toLocaleDateString()}`)

  // Client block
  let y = 38
  doc.setFontSize(10); doc.setFont('helvetica', 'bold'); doc.text('Prepared for', 14, y); doc.text('Project', 110, y)
  doc.setFont('helvetica', 'normal'); doc.setFontSize(9.5)
  doc.text([p.clientName || '—', p.clientAddress, p.clientPhone, p.clientEmail].filter(Boolean), 14, y + 5)
  doc.text([p.name, `${t.info[p.design.systemType]} · ${p.design.phase === 3 ? 'Three-phase' : 'Single-phase'}`, `Location: ${p.site.locationId === 'custom' ? p.site.customName : p.site.locationId} (${fmt(p.site.psh, 1)} sun-hours/day)`, `Valid until ${valid.toLocaleDateString()}`], 110, y + 5)
  y += 28

  // Headline tiles
  const tiles: [string, string][] = [
    ['PV array', `${fmt(r.arrayKwp, 2)} kWp`], ['Battery storage', r.batteryKwh ? `${fmt(r.batteryKwh, 1)} kWh` : 'None'], ['Inverter', r.inverter ? `${fmt(r.inverterTotalKw, 1)} kW` : '—'], ['Annual production', `${fmt(r.annualProductionKwh / 1000, 1)} MWh`],
    ['Investment', M(r.totalUsd)], ['Annual savings', M(r.annualSavingsUsd)], ['Payback', r.paybackYears ? `${fmt(r.paybackYears, 1)} yrs` : '—'], ['CO₂ avoided', `${fmt(r.co2TonsPerYear, 1)} t/yr`],
  ]
  tiles.forEach(([k, v], i) => {
    const x = 14 + (i % 4) * 45.5, yy = y + Math.floor(i / 4) * 20
    doc.setFillColor(240, 253, 250); doc.setDrawColor(204, 251, 241); doc.roundedRect(x, yy, 43.5, 17, 2, 2, 'FD')
    doc.setFontSize(12); doc.setFont('helvetica', 'bold'); doc.setTextColor(...brand); doc.text(v, x + 3, yy + 8)
    doc.setFontSize(7.5); doc.setFont('helvetica', 'normal'); doc.setTextColor(...SLATE); doc.text(k, x + 3, yy + 13.5)
  })
  y += 46

  y = h2(doc, 'Your system', y, brand)
  const sysRows = [
    ['Solar modules', `${r.panelQty} × ${r.panel.brand} ${r.panel.model} — ${r.panel.watts} W ${r.panel.technology}${r.panel.bifacial ? ' bifacial' : ''}, ${r.panel.warrantyYears}-yr warranty`],
    ['Inverter', r.inverter ? `${r.inverterQty} × ${r.inverter.brand} ${r.inverter.model} — ${r.inverter.ratedAcKw} kW ${r.inverter.type}` : '—'],
    ...(r.batteryQty ? [['Battery', `${r.batteryQty} × ${r.bom.find((b) => b.category === 'Battery')?.name} — ${fmt(r.batteryKwh, 1)} kWh total, ${fmt(r.batteryUsableKwh, 1)} kWh usable, ~${fmt(r.batteryHoursBackup, 0)} h backup at night load`]] : []),
    ...(r.generatorKva ? [['Generator', `${r.generatorKva} kVA backup`]] : []),
    ['Roof area needed', `≈ ${fmt(r.arrayAreaM2 * 1.15)} m² (${t.site.roofs[p.site.roofType]})`],
    ['Daily energy covered', `${fmt(r.dailyWh / 1000, 1)} kWh/day demand · ${fmt(Math.min(100, (r.annualProductionKwh / Math.max(1, r.annualKwh)) * 100))}% covered by solar`],
  ]
  autoTable(doc, { ...tableBase(brand), startY: y, head: [['Component', 'Description']], body: sysRows, columnStyles: { 0: { cellWidth: 40, fontStyle: 'bold' } } })
  y = lastY(doc) + 8

  // Monthly production mini-chart
  if (y > 215) { doc.addPage(); y = 20 }
  y = h2(doc, 'Monthly solar production (kWh)', y, brand)
  const maxV = Math.max(...r.monthlyProductionKwh, 1); const demand = (r.dailyWh / 1000) * 30.4
  const cx = 14, cy = y + 40, cw = 182, ch = 36
  doc.setDrawColor(226, 232, 240); doc.line(cx, cy, cx + cw, cy)
  r.monthlyProductionKwh.forEach((v, i) => {
    const bw = cw / 12 - 3, bx = cx + i * (cw / 12) + 1.5, bh = (v / maxV) * ch
    doc.setFillColor(...brand); doc.rect(bx, cy - bh, bw, bh, 'F')
    doc.setFontSize(7); doc.setTextColor(...SLATE); doc.text(MONTHS[i], bx + bw / 2, cy + 4, { align: 'center' }); doc.text(fmt(v), bx + bw / 2, cy - bh - 1.5, { align: 'center' })
  })
  if (demand <= maxV * 1.3) { const dy = cy - (Math.min(demand, maxV * 1.2) / maxV) * ch; doc.setDrawColor(245, 158, 11); doc.setLineDashPattern([2, 1.5], 0); doc.line(cx, dy, cx + cw, dy); doc.setLineDashPattern([], 0); doc.setFontSize(7); doc.setTextColor(180, 83, 9); doc.text(`monthly demand ${fmt(demand)} kWh`, cx + cw, dy - 1.5, { align: 'right' }); doc.setTextColor(...SLATE) }
  y = cy + 12

  // Savings table
  if (y > 230) { doc.addPage(); y = 20 }
  y = h2(doc, 'Financial summary', y, brand)
  const yrs = [1, 5, 10, 15, 20, 25].filter((n) => n <= p.design.analysisYears)
  autoTable(doc, { ...tableBase(brand), startY: y, head: [['Year', ...yrs.map((n) => `Yr ${n}`)]], body: [['Cumulative cash flow', ...yrs.map((n) => M(r.cumulativeCashflow[n]))]] })
  y = lastY(doc) + 3
  doc.setFontSize(8.5); doc.text(`Based on ${fmt(p.site.gridTariff, 2)} USD/kWh energy cost with 3% annual escalation, ${p.design.degradationPctPerYear}%/yr module degradation. Levelised cost of solar energy: ${M(r.lcoeUsdPerKwh, 3)}/kWh. 25-year return on investment: ${r.roi25Pct != null ? fmt(r.roi25Pct) + '%' : '—'}.`, 14, y, { maxWidth: 182 })

  // Quotation page
  doc.addPage(); header(doc, company, 'Quotation', `${p.reference} · ${date.toLocaleDateString()}`)
  y = 38; y = h2(doc, `Bill of materials & pricing (${cur})`, y, brand)
  const cats = Array.from(new Set(r.bom.map((b) => b.category)))
  const body: (string | { content: string; colSpan?: number; styles?: object })[][] = []
  cats.forEach((c) => {
    body.push([{ content: c, colSpan: 6, styles: { fontStyle: 'bold', fillColor: [241, 245, 249], textColor: brand } }])
    r.bom.filter((b) => b.category === c).forEach((b, i) => body.push([String(i + 1), b.name, b.spec, `${fmt(b.qty, Number.isInteger(b.qty) ? 0 : 1)} ${b.unit}`, M(b.unitPriceUsd, 2), M(b.totalUsd, 2)]))
  })
  autoTable(doc, { ...tableBase(brand), startY: y, head: [['#', 'Item', 'Specification', 'Qty', 'Unit price', 'Total']], body, columnStyles: { 0: { cellWidth: 8 }, 1: { cellWidth: 52 }, 2: { cellWidth: 62 }, 3: { cellWidth: 20, halign: 'right' }, 4: { cellWidth: 20, halign: 'right' }, 5: { cellWidth: 20, halign: 'right' } } })
  y = lastY(doc) + 4
  if (y > 240) { doc.addPage(); y = 20 }
  const totals: [string, string][] = [['Subtotal', M(r.subtotalUsd, 2)], [`Margin (${p.pricing.marginPct}%)`, M(r.marginUsd, 2)]]
  if (p.pricing.discountPct) totals.push([`Discount (${p.pricing.discountPct}%)`, '− ' + M(r.discountUsd, 2)])
  if (p.pricing.vatPct) totals.push([`VAT (${p.pricing.vatPct}%)`, M(r.vatUsd, 2)])
  autoTable(doc, { ...tableBase(brand), startY: y, theme: 'plain', body: [...totals, [{ content: 'GRAND TOTAL', styles: { fontStyle: 'bold', fontSize: 11 } }, { content: M(r.totalUsd, 2), styles: { fontStyle: 'bold', fontSize: 11, textColor: brand } }]], columnStyles: { 0: { halign: 'right', cellWidth: 142 }, 1: { halign: 'right', cellWidth: 40 } } })
  y = lastY(doc) + 10
  if (y > 240) { doc.addPage(); y = 20 }
  y = h2(doc, 'Terms & conditions', y, brand)
  doc.setFontSize(8.5); doc.text(company.terms, 14, y, { maxWidth: 182 }); y += doc.splitTextToSize(company.terms, 182).length * 4 + 8
  if (p.notes) { doc.setFont('helvetica', 'bold'); doc.text('Notes', 14, y); doc.setFont('helvetica', 'normal'); doc.text(p.notes, 14, y + 5, { maxWidth: 182 }); y += 16 }
  doc.text(['Accepted by client: ______________________________    Date: ____________', '', `For ${company.name}: ______________________________    Date: ____________`], 14, Math.min(y + 10, 270))
  footer(doc, company)
  doc.save(filename)
}

export async function exportTechnicalPdf(p: Project, r: Results, company: CompanySettings, filename: string) {
  const doc = new jsPDF({ unit: 'mm', format: 'a4' })
  const brand = hex2rgb(company.primaryColor || '#0f766e')
  header(doc, company, 'Technical Design Report', `${p.reference} · ${p.name}`)
  let y = 38
  y = h2(doc, 'Design checks', y, brand)
  autoTable(doc, { ...tableBase(brand), startY: y, head: [['Level', 'Check']], body: r.checks.map((c) => [c.level.toUpperCase(), c.message]), columnStyles: { 0: { cellWidth: 20, fontStyle: 'bold' } }, didParseCell: (d) => { if (d.section === 'body' && d.column.index === 0) { const v = String(d.cell.raw); d.cell.styles.textColor = v === 'ERROR' ? [185, 28, 28] : v === 'WARN' ? [180, 83, 9] : [4, 120, 87] } } })
  y = lastY(doc) + 8
  y = h2(doc, 'Load analysis', y, brand)
  autoTable(doc, { ...tableBase(brand), startY: y, head: [['Appliance', 'W', 'Qty', 'h/day', 'Night %', 'Surge ×', 'Wh/day']], body: [...p.loads.map((l) => [l.name, fmt(l.watts), fmt(l.qty), String(l.hoursPerDay), String(l.nightSharePct), String(l.surgeFactor), fmt(l.watts * l.qty * l.hoursPerDay)]), [{ content: 'Total', styles: { fontStyle: 'bold' } }, fmt(r.connectedW), '', '', fmt(r.dailyWh ? (r.nightWh / r.dailyWh) * 100 : 0), '', { content: fmt(r.dailyWh), styles: { fontStyle: 'bold' } }]] })
  y = lastY(doc) + 3
  doc.setFontSize(8.5); doc.text(`Peak demand ${fmt(r.peakW)} W (coincidence ${p.design.coincidenceFactor}) · starting surge ${fmt(r.surgeW)} W · night energy ${fmt(r.nightWh)} Wh · annual ${fmt(r.annualKwh)} kWh`, 14, y); y += 8
  if (y > 200) { doc.addPage(); y = 20 }
  y = h2(doc, 'PV sizing', y, brand)
  autoTable(doc, { ...tableBase(brand), startY: y, head: [['Parameter', 'Value', 'Basis']], body: [
    ['Peak sun hours', `${fmt(p.site.psh, 2)} → ${fmt(r.tiltedPsh, 2)} tilted`, `tilt gain ×${p.site.tiltGainFactor}, tilt ${p.site.tiltDeg}°`],
    ['Derate', `${fmt(r.derate * 100, 1)}%`, r.derateBreakdown.map((b) => `${b.name} ${b.factor.toFixed(2)}`).join(', ')],
    ['Required PV', `${fmt(r.requiredPvKwp, 3)} kWp`, `E/(PSH×derate) × oversize ${p.design.pvOversize}`],
    ['Array', `${r.panelQty} × ${r.panel.watts} W = ${fmt(r.arrayKwp, 2)} kWp`, `${r.panel.brand} ${r.panel.model} · Voc ${r.panel.voc} V · Vmp ${r.panel.vmp} V · Isc ${r.panel.isc} A · ${r.panel.tempCoeffPmaxPctPerC}%/°C`],
    ['Area / weight', `${fmt(r.arrayAreaM2, 1)} m² / ${fmt(r.arrayWeightKg)} kg`, `${r.panel.lengthMm}×${r.panel.widthMm} mm, ${r.panel.weightKg} kg each`],
    ['Annual production', `${fmt(r.annualProductionKwh)} kWh`, `${fmt(r.specificYield)} kWh/kWp/yr`],
  ] })
  y = lastY(doc) + 8
  if (r.inverter) {
    if (y > 200) { doc.addPage(); y = 20 }
    y = h2(doc, 'Inverter & string design', y, brand)
    const inv = r.inverter, st = r.strings
    autoTable(doc, { ...tableBase(brand), startY: y, head: [['Parameter', 'Value', 'Limit / basis']], body: [
      ['Required', `${fmt(r.requiredInverterKw, 2)} kW`, `peak × ${p.design.inverterSafety}; surge ${fmt(r.surgeW / 1000, 1)} kW`],
      ['Selected', `${r.inverterQty} × ${inv.brand} ${inv.model}`, `${inv.ratedAcKw} kW, surge ${inv.surgeKw} kW, max PV ${inv.maxPvInputKw} kW, ${inv.mpptCount} MPPT × ${inv.maxInputCurrentPerMppt} A, ${inv.mpptMinV}–${inv.mpptMaxV} V (max ${inv.maxPvVoltage} V)`],
      ['DC/AC ratio', fmt(r.arrayKwp / r.inverterTotalKw, 2), 'typical 1.1–1.3'],
      ...(st ? [
        ['Strings', `${st.strings} × ${st.panelsPerString} modules`, `${st.mpptsUsed} MPPT used, ${st.stringsPerMppt} string(s)/MPPT`],
        ['Voc cold', `${fmt(st.vocCold)} V`, `at ${p.site.recordLowC}°C ≤ ${inv.maxPvVoltage} V ${st.vocCold <= inv.maxPvVoltage ? '✓' : '✗'}`],
        ['Vmp hot', `${fmt(st.vmpHot)} V`, `at cell ~${fmt(p.site.ambientHighC + 31)}°C ≥ ${inv.mpptMinV} V ${st.vmpHot >= inv.mpptMinV ? '✓' : '✗'}`],
        ['String Isc', `${st.stringIscA} A`, `≤ ${inv.maxInputCurrentPerMppt} A/MPPT ${st.stringIscA <= inv.maxInputCurrentPerMppt ? '✓' : '✗'}`],
      ] : []),
    ] })
    y = lastY(doc) + 8
  }
  if (r.batteryQty) {
    if (y > 210) { doc.addPage(); y = 20 }
    y = h2(doc, 'Battery bank', y, brand)
    autoTable(doc, { ...tableBase(brand), startY: y, head: [['Parameter', 'Value', 'Basis']], body: [
      ['Required', `${fmt(r.batteryRequiredKwh, 2)} kWh`, `${p.design.systemType === 'offgrid' ? 'daily energy' : 'critical night energy'} × ${p.design.autonomyDays} d / (DoD ${fmt(r.dod * 100)}% × η 0.96)`],
      ['Bank', `${r.batteryQty} × ${r.bom.find((b) => b.category === 'Battery')?.name}`, `${r.batteryConfig.series}S × ${r.batteryConfig.parallel}P · ${fmt(r.batteryKwh, 2)} kWh · ${fmt(r.batteryAh)} Ah @ ${p.design.systemVoltage} V`],
      ['Usable / backup', `${fmt(r.batteryUsableKwh, 2)} kWh`, `≈ ${fmt(r.batteryHoursBackup, 1)} h at average night load`],
      ...(r.controller ? [['Charge controller', `${r.controllerQty} × ${r.controller.brand} ${r.controller.model}`, `${fmt(r.requiredControllerA)} A required`]] : []),
      ...(r.generatorKva ? [['Generator', `${r.generatorKva} kVA`, 'peak × 1.25 + charger, PF 0.8']] : []),
    ] })
    y = lastY(doc) + 8
  }
  if (y > 220) { doc.addPage(); y = 20 }
  y = h2(doc, 'Cable schedule & protection', y, brand)
  autoTable(doc, { ...tableBase(brand), startY: y, head: [['Circuit', 'Current', 'Voltage', 'Run', 'Cable', 'Drop', 'Protection']], body: r.cables.map((c) => [c.use === 'dc' ? 'PV string DC' : c.use === 'battery' ? 'Battery DC' : 'Inverter AC', `${c.currentA} A`, `${c.voltage} V`, `${c.lengthM} m`, `${c.sizeMm2} mm² (AWG ${AWG_EQUIV[c.sizeMm2]})`, `${c.dropPct}%`, `${c.breakerA} A ${c.use === 'ac' ? 'MCB' : c.use === 'dc' ? 'gPV fuse' : 'class-T fuse'}`]) })
  y = lastY(doc) + 3
  doc.setFontSize(8); doc.text('Voltage drop: Vd = 2·L·I·ρ/A (√3·L·I·ρ/A three-phase), ρ = 0.0206 Ω·mm²/m (Cu, 70 °C). Ampacity derated ×0.87 for 40 °C ambient. PV fuses 1.56×Isc; battery & AC protection 1.25×I. Reference: IEC 62548, IEC 60364-5-52, NEC 690.', 14, y, { maxWidth: 182 })
  footer(doc, company)
  doc.save(filename)
}
