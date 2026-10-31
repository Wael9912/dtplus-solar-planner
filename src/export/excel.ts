import ExcelJS from 'exceljs'
import type { Project, Results, CompanySettings } from '../engine/types'
import { MONTHS, DAYS_IN_MONTH, AWG_EQUIV } from '../engine/standards'
import { download } from './download'

const BRAND = 'FF0F766E'
const hdr = (ws: ExcelJS.Worksheet, row: number, cols: number) => {
  const r = ws.getRow(row); r.font = { bold: true, color: { argb: 'FFFFFFFF' } }; r.alignment = { vertical: 'middle' }
  for (let c = 1; c <= cols; c++) r.getCell(c).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: BRAND } }
}
const title = (ws: ExcelJS.Worksheet, text: string, sub?: string) => {
  ws.getCell('A1').value = text; ws.getCell('A1').font = { bold: true, size: 16, color: { argb: BRAND } }
  if (sub) { ws.getCell('A2').value = sub; ws.getCell('A2').font = { italic: true, color: { argb: 'FF64748B' } } }
}
const money = '#,##0.00'; const int = '#,##0'; const dec = '#,##0.00'

export async function exportExcel(p: Project, r: Results, company: CompanySettings, filename: string) {
  const wb = new ExcelJS.Workbook()
  wb.creator = `${company.name} · DT+ Solar Planner`; wb.created = new Date()
  const cur = p.site.currency, fx = p.site.fxRateToUsd

  // ---------- Summary
  const s = wb.addWorksheet('Summary', { properties: { tabColor: { argb: BRAND } } })
  title(s, `${p.name}`, `${company.name} · ${p.reference} · ${new Date().toLocaleDateString()} · Product developed by DT+`)
  s.columns = [{ width: 34 }, { width: 26 }, { width: 14 }, { width: 40 }]
  const rows: [string, string | number, string?][] = [
    ['Client', p.clientName], ['Site', p.clientAddress], ['System type', p.design.systemType], ['Phase', p.design.phase === 3 ? 'Three-phase 400 V' : 'Single-phase 230 V'],
    ['Location', p.site.locationId === 'custom' ? p.site.customName : p.site.locationId], ['Peak sun hours (horizontal)', p.site.psh, 'kWh/m²/day'], ['Tilt gain factor', p.site.tiltGainFactor],
    ['Daily energy demand', r.dailyWh / 1000, 'kWh/day'], ['Annual demand', r.annualKwh, 'kWh/yr'], ['Peak demand', r.peakW, 'W'], ['Starting surge', r.surgeW, 'W'],
    ['Overall derate factor', r.derate], ['Required PV', r.requiredPvKwp, 'kWp'], ['PV array', r.arrayKwp, 'kWp'], ['Panels', `${r.panelQty} × ${r.panel.brand} ${r.panel.model} (${r.panel.watts} W)`],
    ['Array area', r.arrayAreaM2, 'm²'], ['Annual production', r.annualProductionKwh, 'kWh/yr'], ['Specific yield', r.specificYield, 'kWh/kWp/yr'],
    ['Battery bank', r.batteryKwh, 'kWh'], ['Battery units', r.batteryQty ? `${r.batteryQty} (${r.batteryConfig.series}S × ${r.batteryConfig.parallel}P)` : '—'], ['Usable storage', r.batteryUsableKwh, 'kWh'],
    ['Inverter', r.inverter ? `${r.inverterQty} × ${r.inverter.brand} ${r.inverter.model}` : '—'], ['Inverter capacity', r.inverterTotalKw, 'kW'],
    ['Generator', r.generatorKva ?? '—', r.generatorKva ? 'kVA' : ''],
    [`Total price (${cur})`, r.totalUsd * fx], [`Price per Wp (${cur})`, r.costPerWp * fx], [`Annual savings (${cur})`, r.annualSavingsUsd * fx], ['Simple payback', r.paybackYears ?? '—', 'years'], ['CO₂ avoided', r.co2TonsPerYear, 't/yr'],
  ]
  s.addRow([]); s.addRow(['Parameter', 'Value', 'Unit']); hdr(s, 4, 3)
  rows.forEach(([k, v, u]) => { const row = s.addRow([k, v, u ?? '']); if (typeof v === 'number') row.getCell(2).numFmt = Number.isInteger(v) ? int : dec })
  s.addRow([]); s.addRow(['Design checks']); s.lastRow!.font = { bold: true }
  r.checks.forEach((c) => s.addRow([c.level.toUpperCase(), c.message]))

  // ---------- Loads (with live formulas)
  const l = wb.addWorksheet('Loads')
  title(l, 'Load analysis', 'Edit watts/qty/hours — totals recalculate')
  l.columns = [{ width: 30 }, { width: 14 }, { width: 10 }, { width: 8 }, { width: 12 }, { width: 10 }, { width: 10 }, { width: 14 }, { width: 14 }, { width: 10 }]
  l.addRow([]); l.addRow(['Appliance', 'Category', 'Watts', 'Qty', 'Hours/day', 'Night %', 'Surge ×', 'Wh/day', 'Night Wh', 'Backup']); hdr(l, 4, 10)
  const first = 5
  p.loads.forEach((x, i) => {
    const n = first + i
    l.addRow([x.name, x.category, x.watts, x.qty, x.hoursPerDay, x.nightSharePct / 100, x.surgeFactor, { formula: `C${n}*D${n}*E${n}` }, { formula: `H${n}*F${n}` }, x.critical ? 'Yes' : 'No'])
    l.getCell(`F${n}`).numFmt = '0%'
  })
  const last = first + p.loads.length - 1
  if (p.loads.length) {
    const tr = l.addRow(['TOTAL', '', { formula: `SUMPRODUCT(C${first}:C${last},D${first}:D${last})` }, '', '', '', '', { formula: `SUM(H${first}:H${last})` }, { formula: `SUM(I${first}:I${last})` }])
    tr.font = { bold: true }
    l.addRow(['Daily energy (kWh)', '', '', '', '', '', '', { formula: `H${last + 1}/1000` }])
    l.addRow(['Peak demand (W) = connected × coincidence', '', p.design.coincidenceFactor, '', '', '', '', { formula: `C${last + 1}*C${last + 3}` }])
  }

  // ---------- Sizing (formula-driven)
  const z = wb.addWorksheet('Sizing')
  title(z, 'System sizing', 'Formulas reference the input cells in column B')
  z.columns = [{ width: 42 }, { width: 16 }, { width: 12 }, { width: 50 }]
  z.addRow([]); z.addRow(['Parameter', 'Value', 'Unit', 'Formula / note']); hdr(z, 4, 4)
  const Z = (k: string, v: number | string | { formula: string }, u = '', note = '') => { const row = z.addRow([k, v, u, note]); if (typeof v !== 'string') row.getCell(2).numFmt = dec; return row.number }
  const rDaily = Z('Daily energy demand', r.dailyWh / 1000, 'kWh/day', 'From Loads sheet')
  const rPsh = Z('Peak sun hours (horizontal)', p.site.psh, 'h/day')
  const rTilt = Z('Tilt gain factor', p.site.tiltGainFactor, '', '1 + 0.0045·|lat| (clamped 1.0–1.3)')
  const rDer = Z('Overall derate', r.derate, '', r.derateBreakdown.map((b) => `${b.name} ${b.factor.toFixed(2)}`).join(' × '))
  const rOver = Z('PV oversize factor', p.design.pvOversize)
  const rReq = Z('Required PV', { formula: `B${rDaily}/(B${rPsh}*B${rTilt}*B${rDer})*B${rOver}` }, 'kWp', 'E / (PSH × tilt × derate) × oversize')
  const rPw = Z('Module power', r.panel.watts, 'W', `${r.panel.brand} ${r.panel.model}`)
  Z('Panels (theoretical)', { formula: `CEILING(B${rReq}*1000/B${rPw},1)` }, 'pcs', 'Before string rounding')
  Z('Panels (final, after strings)', r.panelQty, 'pcs', r.strings ? `${r.strings.strings} strings × ${r.strings.panelsPerString}` : '')
  Z('Array size', r.arrayKwp, 'kWp')
  z.addRow([])
  if (p.design.systemType !== 'gridtie') {
    const rAut = Z('Autonomy', p.design.autonomyDays, 'days')
    const rDod = Z('Depth of discharge', r.dod, '', 'Chemistry default or override')
    const rEff = Z('Inverter efficiency', 0.96)
    const rBase = Z(p.design.systemType === 'offgrid' ? 'Energy from battery per day' : 'Critical night energy per day', (p.design.systemType === 'offgrid' ? r.dailyWh : (r.criticalWh > 0 ? r.batteryRequiredKwh * r.dod * 0.96 / p.design.autonomyDays * 1000 : r.nightWh)) / 1000, 'kWh')
    Z('Required storage', { formula: `B${rBase}*B${rAut}/(B${rDod}*B${rEff})` }, 'kWh', 'E × autonomy / (DoD × η)')
    Z('Battery bank', r.batteryKwh, 'kWh', `${r.batteryQty} units · ${r.batteryConfig.series}S×${r.batteryConfig.parallel}P · ${r.batteryAh} Ah`)
    Z('Usable storage', r.batteryUsableKwh, 'kWh')
    z.addRow([])
  }
  const rPeak = Z('Peak demand', r.peakW / 1000, 'kW')
  const rSaf = Z('Inverter safety factor', p.design.inverterSafety)
  Z('Required inverter', { formula: `B${rPeak}*B${rSaf}` }, 'kW')
  Z('Selected inverter', r.inverter ? `${r.inverterQty} × ${r.inverter.brand} ${r.inverter.model}` : '—', '', r.inverter ? `${r.inverterTotalKw} kW · surge ${r.inverter.surgeKw * r.inverterQty} kW · max PV ${r.inverter.maxPvInputKw * r.inverterQty} kW` : '')
  if (r.strings && r.inverter) {
    z.addRow([]); z.addRow(['String design']).font = { bold: true }
    Z('Panels per string', r.strings.panelsPerString, 'pcs')
    Z('Strings', r.strings.strings, '')
    Z('String Voc at record low', r.strings.vocCold, 'V', `Voc × (1 + β·(Tmin−25)) × n ≤ ${r.inverter.maxPvVoltage} V`)
    Z('String Vmp at hot cell', r.strings.vmpHot, 'V', `≥ MPPT min ${r.inverter.mpptMinV} V`)
    Z('String Isc', r.strings.stringIscA, 'A', `≤ MPPT input ${r.inverter.maxInputCurrentPerMppt} A / string`)
  }
  z.addRow([]); z.addRow(['Cable schedule']).font = { bold: true }
  z.addRow(['Circuit', 'Current (A)', 'Length (m)', 'Cable / drop / protection']); hdr(z, z.lastRow!.number, 4)
  r.cables.forEach((c) => z.addRow([c.use.toUpperCase(), c.currentA, c.lengthM, `${c.sizeMm2} mm² (AWG ${AWG_EQUIV[c.sizeMm2]}) · ${c.dropPct}% drop · ${c.breakerA} A ${c.use === 'ac' ? 'MCB' : 'fuse'}`]))

  // ---------- Production
  const m = wb.addWorksheet('Production')
  title(m, 'Monthly production vs demand')
  m.columns = [{ width: 10 }, { width: 14 }, { width: 10 }, { width: 18 }, { width: 16 }, { width: 14 }]
  m.addRow([]); m.addRow(['Month', 'PSH (horiz.)', 'Days', 'Production (kWh)', 'Demand (kWh)', 'Coverage']); hdr(m, 4, 6)
  const rArr = 2 // keep array kWp in F2
  m.getCell('E2').value = 'Array kWp'; m.getCell('F2').value = r.arrayKwp; m.getCell('E3').value = 'Derate × tilt'; m.getCell('F3').value = r.derate * p.site.tiltGainFactor
  MONTHS.forEach((mn, i) => {
    const n = 5 + i
    m.addRow([mn, p.site.monthlyPsh[i], DAYS_IN_MONTH[i], { formula: `$F$${rArr}*B${n}*$F$3*C${n}` }, (r.dailyWh / 1000) * DAYS_IN_MONTH[i], { formula: `IF(E${n}>0,D${n}/E${n},0)` }])
    m.getCell(`F${n}`).numFmt = '0%'; m.getCell(`D${n}`).numFmt = int; m.getCell(`E${n}`).numFmt = int
  })
  const tot = m.addRow(['Year', { formula: 'AVERAGE(B5:B16)' }, { formula: 'SUM(C5:C16)' }, { formula: 'SUM(D5:D16)' }, { formula: 'SUM(E5:E16)' }, { formula: 'IF(E17>0,D17/E17,0)' }]); tot.font = { bold: true }; m.getCell('F17').numFmt = '0%'

  // ---------- BOM
  const b = wb.addWorksheet('BOM')
  title(b, `Bill of materials (${cur})`, 'Edit qty or unit price — totals recalculate')
  b.columns = [{ width: 6 }, { width: 18 }, { width: 38 }, { width: 44 }, { width: 8 }, { width: 10 }, { width: 14 }, { width: 16 }]
  b.addRow([]); b.addRow(['#', 'Category', 'Item', 'Specification', 'Unit', 'Qty', `Unit price`, 'Total']); hdr(b, 4, 8)
  const bf = 5
  r.bom.forEach((x, i) => {
    const n = bf + i
    b.addRow([i + 1, x.category, x.name, x.spec, x.unit, x.qty, x.unitPriceUsd * fx, { formula: `F${n}*G${n}` }])
    b.getCell(`G${n}`).numFmt = money; b.getCell(`H${n}`).numFmt = money
  })
  const bl = bf + r.bom.length - 1
  const line = (label: string, f: string) => { const row = b.addRow(['', '', '', '', '', '', label, { formula: f }]); row.getCell(8).numFmt = money; row.getCell(7).font = { bold: true }; return row.number }
  const rSub = line('Subtotal', `SUM(H${bf}:H${bl})`)
  const rMar = line(`Margin ${p.pricing.marginPct}%`, `H${rSub}*${p.pricing.marginPct / 100}`)
  const rDis = line(`Discount ${p.pricing.discountPct}%`, `-(H${rSub}+H${rMar})*${p.pricing.discountPct / 100}`)
  const rVat = line(`VAT ${p.pricing.vatPct}%`, `(H${rSub}+H${rMar}+H${rDis})*${p.pricing.vatPct / 100}`)
  const rTot = line('GRAND TOTAL', `H${rSub}+H${rMar}+H${rDis}+H${rVat}`); b.getRow(rTot).font = { bold: true, size: 12 }

  // ---------- Economics
  const e = wb.addWorksheet('Economics')
  title(e, 'Cash flow (25 years)', `Tariff ${p.site.gridTariff} USD/kWh, 3% escalation, ${p.design.degradationPctPerYear}%/yr degradation`)
  e.columns = [{ width: 8 }, { width: 18 }, { width: 18 }, { width: 20 }]
  e.addRow([]); e.addRow(['Year', 'Production (kWh)', `Savings (${cur})`, `Cumulative (${cur})`]); hdr(e, 4, 4)
  for (let y = 0; y <= p.design.analysisYears; y++) {
    const prod = y === 0 ? 0 : r.annualProductionKwh * Math.pow(1 - p.design.degradationPctPerYear / 100, y - 1)
    const sav = y === 0 ? -r.totalUsd * fx : Math.min(prod, r.annualKwh) * p.site.gridTariff * Math.pow(1.03, y - 1) * fx
    const row = e.addRow([y, prod, sav, { formula: y === 0 ? `C5` : `D${4 + y}+C${5 + y}` }])
    row.getCell(2).numFmt = int; row.getCell(3).numFmt = money; row.getCell(4).numFmt = money
  }

  const buf = await wb.xlsx.writeBuffer()
  download(new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }), filename)
}
