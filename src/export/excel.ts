// Engineering workbook (internal): loads, sizing, monthly production, costed BOM (cost, markup, selling price) and cash flow.
// Formulas carry cached results so previewers (WhatsApp, Drive, Quick Look) show the numbers; every money figure equals buildQuote().
// Arabic: labels from labels.ts and right-to-left sheet views.
// Modes: a product quote gets the priced BOM sheet only; a bill-based design states the bill on the Loads sheet; a known-size quote
// (no consumption data) has no Loads sheet and fixed sizes on the Sizing sheet; a battery-backup system has no Production sheet.
import ExcelJS from 'exceljs'
import type { Project, Results, CompanySettings, CableResult } from '../engine/types'
import { buildQuote, roundTo } from '../engine/quote'
import { DAYS_IN_MONTH } from '../engine/standards'
import {
  labelsFor, fmtDate, num, systemName, phaseName, locationName, unitName, categoryName, lineName, lineSpec, loadName, loadCategory,
  derateName, checkMessage, batteryInfo, autonomyOf, escalationPct, localizeCompany, cableLabel, cableSize, cableDevice, protectionRows, unitDecimals, INV_EFF_BATT,
  sizingOf, existingQtyOf, type ExportLang,
} from './common'

type Cell = ExcelJS.CellValue
const f = (formula: string, result: number): Cell => ({ formula, result } as ExcelJS.CellFormulaValue)
const argb = (hex: string) => 'FF' + ((hex || '#0f766e').replace('#', '').padEnd(6, '0').slice(0, 6).toUpperCase())
const INT = '#,##0', DEC = '#,##0.00', DEC3 = '#,##0.000', PCT = '0.0%'

export async function buildExcel(p: Project, r: Results, companyIn: CompanySettings, lang: ExportLang, opts: { now?: Date } = {}): Promise<Blob> {
  const L = labelsFor(lang), X = L.xl, S = X.summary, Z = X.sz, U = X.u
  const company = localizeCompany(companyIn, lang)
  const q = buildQuote(p, r)
  const rtl = lang === 'ar'
  const now = opts.now ?? new Date()
  const BRAND = argb(company.primaryColor)
  const cur = q.currency
  // Currency minor units follow the quote (ISO 4217: USD 2, KWD 3, IQD 0); ROUND() in the formulas uses the same digits
  const D = q.decimals, rq = (n: number) => roundTo(n, D)
  const dec = D > 0 ? '.' + '0'.repeat(D) : ''
  const MONEY = cur === 'USD' ? `"$"#,##0${dec};-"$"#,##0${dec}` : `#,##0${dec} "${cur}";-#,##0${dec} "${cur}"`
  const MONEY0 = cur === 'USD' ? '"$"#,##0;-"$"#,##0' : `#,##0 "${cur}";-#,##0 "${cur}"`
  const MONEY3 = cur === 'USD' ? '"$"#,##0.000' : `#,##0.000 "${cur}"`

  const wb = new ExcelJS.Workbook()
  wb.creator = `${company.name} · DT+ Solar Planner`; wb.created = now
  const sheet = (name: string) => wb.addWorksheet(name, {
    properties: { tabColor: { argb: BRAND } },
    pageSetup: { paperSize: 9, orientation: 'portrait', fitToPage: true, fitToWidth: 1, fitToHeight: 0 },
  })
  const freeze = (ws: ExcelJS.Worksheet, ySplit: number) => { ws.views = [{ state: 'frozen', ySplit, xSplit: 0, rightToLeft: rtl }] }
  const title = (ws: ExcelJS.Worksheet, text: string, sub?: string) => {
    ws.getCell('A1').value = text; ws.getCell('A1').font = { bold: true, size: 15, color: { argb: BRAND } }
    if (sub) { ws.getCell('A2').value = sub; ws.getCell('A2').font = { italic: true, color: { argb: 'FF64748B' } } }
  }
  const header = (ws: ExcelJS.Worksheet, row: number, values: string[]) => {
    const hr = ws.getRow(row); hr.values = values
    hr.font = { bold: true, color: { argb: 'FFFFFFFF' } }; hr.alignment = { vertical: 'middle', wrapText: true }; hr.height = 20
    for (let c = 1; c <= values.length; c++) hr.getCell(c).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: BRAND } }
  }
  const bold = (row: ExcelJS.Row) => { row.font = { bold: true } }
  const ref = (ws: ExcelJS.Worksheet, a1: string) => `'${ws.name.replace(/'/g, "''")}'!${a1}`
  const yellow: ExcelJS.Fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFEF9C3' } }
  const items = r.mode === 'items', noDemand = r.demand === 'none', bill = r.demand === 'bill', noPv = !(r.arrayKwp > 0)
  const sz = sizingOf(p), tgt = sz.targets
  const write = async () => new Blob([await wb.xlsx.writeBuffer()], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })

  // ---------------------------------------------------------------- BOM (internal: cost, markup, selling price)
  const fillBom = (b: ExcelJS.Worksheet, sub: string) => {
    title(b, X.bomTitle(cur), sub)
    b.columns = [{ width: 5 }, { width: 22 }, { width: 40 }, { width: 40 }, { width: 9 }, { width: 10 }, { width: 14 }, { width: 15 }, { width: 14 }, { width: 16 }]
    b.getCell('C3').value = X.markupCell; b.getCell('C3').font = { bold: true }
    b.getCell('D3').value = q.markupPct / 100; b.getCell('D3').numFmt = '0.00%'; b.getCell('D3').fill = yellow
    header(b, 5, X.bomCols)
    const bf = 6
    q.lines.forEach((x, i) => {
      const n = bf + i
      const row = b.getRow(n)
      const onSite = existingQtyOf(r, x.id)
      const spec = [lineSpec(x, lang), onSite > 0 ? X.existingSpec(num(onSite, 0)) : ''].filter(Boolean).join(' · ')
      row.values = [i + 1, categoryName(x.category, L), lineName(x, lang, L), spec, unitName(x.unit, L), x.qty, x.unitCost,
        f(`ROUND(F${n}*G${n},${D})`, x.totalCost), f(`ROUND(G${n}*(1+$D$3),${D})`, x.unitSell), f(`ROUND(F${n}*I${n},${D})`, x.totalSell)]
      for (const c of [7, 8, 9, 10]) row.getCell(c).numFmt = MONEY
      row.getCell(6).numFmt = '#,##0.###'
    })
    const bl = bf + Math.max(q.lines.length, 1) - 1
    let bn = bl + 2
    const tot = (label: string, col: 'H' | 'J', cell: Cell, fmtStr = MONEY, input?: number) => {
      const row = b.getRow(bn); row.getCell(3).value = label; row.getCell(3).font = { bold: true }
      if (input != null) { const c = row.getCell(9); c.value = input; c.numFmt = '0.00%'; c.fill = yellow }
      const c = b.getCell(`${col}${bn}`); c.value = cell; c.numFmt = fmtStr; c.font = { bold: true }
      return bn++
    }
    const rCost = tot(X.costSubtotal, 'H', f(`ROUND(SUM(H${bf}:H${bl}),${D})`, q.costSubtotal))
    const rSell = tot(X.sellSubtotal, 'J', f(`ROUND(SUM(J${bf}:J${bl}),${D})`, q.sellSubtotal))
    const rMk = tot(X.markup, 'J', f(`ROUND(J${rSell}-H${rCost},${D})`, q.markup))
    tot(X.grossMargin, 'J', f(`IF(J${rSell}>0,J${rMk}/J${rSell},0)`, q.grossMarginPct / 100), PCT)
    const rDisc = tot(X.discountIn, 'J', f(`-ROUND(J${rSell}*I${bn},${D})`, -q.discount), MONEY, q.discountPct / 100)
    const rVat = tot(X.vatIn, 'J', f(`ROUND((J${rSell}+J${rDisc})*I${bn},${D})`, q.vat), MONEY, q.vatPct / 100)
    const rTot = tot(X.grandTotal, 'J', f(`ROUND(J${rSell}+J${rDisc}+J${rVat},${D})`, q.total))
    b.getRow(rTot).font = { bold: true, size: 12 }
    freeze(b, 5)
    return { rCost, rSell, rMk, rDisc, rVat, rTot }
  }

  // Product quote: the priced list only
  if (items) {
    fillBom(sheet(X.quoteSheet), X.quoteSub([p.clientName, p.reference, fmtDate(now)].filter((x) => x?.trim()).join(' · ') || X.bomSub))
    return write()
  }

  // Sheet order = tab order; the BOM is filled first because the Summary links to its totals.
  // No consumption data → no Loads sheet; no panels → no Production sheet.
  const s = sheet(X.sheets.summary), l = noDemand ? null : sheet(X.sheets.loads), z = sheet(X.sheets.sizing), m = noPv ? null : sheet(X.sheets.production)
  const b = sheet(X.sheets.bom), e = sheet(X.sheets.economics)
  const { rCost, rSell, rMk, rDisc, rVat, rTot } = fillBom(b, X.bomSub)

  // ---------------------------------------------------------------- Summary
  title(s, p.name, [company.name, p.reference, fmtDate(now), L.brand].filter((x) => x?.trim()).join(' · '))
  s.columns = [{ width: 36 }, { width: 44 }, { width: 14 }, { width: 60 }]
  header(s, 4, [X.param, X.value, X.unit])
  const add = (k: string, v: Cell, u = '', fmtStr?: string) => {
    const row = s.addRow([k, v, u])
    if (fmtStr) row.getCell(2).numFmt = fmtStr
    else if (typeof v === 'number') row.getCell(2).numFmt = Number.isInteger(v) ? INT : DEC
    return row
  }
  const { battery } = batteryInfo(p, r)
  const auto = autonomyOf(p, r)
  add(S.client, p.clientName || '—'); add(S.site, p.clientAddress || '—'); add(S.systemType, systemName(p, L)); add(S.phase, phaseName(p, L)); add(S.location, locationName(p, lang))
  if (r.demand !== 'loads') add(X.demandBasis, X.basis[r.demand] ?? r.demand)
  add(S.psh, p.site.psh, 'kWh/m²/day'); add(S.tilt, r.tiltGainUsed > 0 ? r.tiltGainUsed : p.site.tiltGainFactor, '', DEC3)
  if (!noDemand) { add(S.daily, r.dailyWh / 1000, U.kwhDay); add(S.annual, r.annualKwh, U.kwhYr, INT); add(S.peak, r.peakW, U.w, INT); add(S.surge, r.surgeW, U.w, INT) }
  if (noPv) add(S.array, X.noPv)
  else {
    add(S.derate, r.derate, '', PCT); add(S.requiredPv, r.requiredPvKwp, U.kwp, DEC3); add(S.array, r.arrayKwp, U.kwp)
    add(S.panels, `${r.panelQty} × ${r.panel.brand} ${r.panel.model} (${r.panel.watts} W)`); add(S.area, r.arrayAreaM2, U.m2, '#,##0.0')
    add(S.production, r.annualProductionKwh, U.kwhYr, INT); add(S.yield, r.specificYield, 'kWh/kWp', INT)
  }
  if (r.batteryQty > 0) {
    add(S.battery, r.batteryKwh, U.kwh)
    add(S.battUnits, `${r.batteryQty} × ${battery ? `${battery.brand} ${battery.model}` : '—'} (${r.batteryConfig.series}S × ${r.batteryConfig.parallel}P)`)
    add(S.usable, r.batteryUsableKwh, U.kwh)
    if (auto && Number.isFinite(auto.days)) add(S.autonomy, Math.round(auto.days * 100) / 100, U.days)
  }
  add(S.inverter, r.inverter ? `${r.inverterQty} × ${r.inverter.brand} ${r.inverter.model}` : '—'); add(S.invCap, r.inverterTotalKw, U.kw)
  if (r.generatorKva) add(S.generator, r.generatorKva, U.kva)
  s.addRow([])
  s.addRow([S.pricing]).getCell(1).font = { bold: true, color: { argb: BRAND } }
  add(S.equipment, q.equipmentCost, '', MONEY); add(S.services, q.servicesCost, '', MONEY)
  add(S.cost, f(ref(b, `H${rCost}`), q.costSubtotal), '', MONEY)
  add(S.markupPct, f(ref(b, 'D3'), q.markupPct / 100), '', '0.00%')
  add(S.markup, f(ref(b, `J${rMk}`), q.markup), '', MONEY)
  add(S.sell, f(ref(b, `J${rSell}`), q.sellSubtotal), '', MONEY)
  add(S.margin, q.grossMarginPct / 100, '', PCT)
  add(S.discount, f(ref(b, `J${rDisc}`), -q.discount), '', MONEY)
  add(S.vat, f(ref(b, `J${rVat}`), q.vat), '', MONEY)
  bold(add(S.total, f(ref(b, `J${rTot}`), q.total), '', MONEY))
  if (r.arrayKwp > 0) add(S.perWp, q.total / (r.arrayKwp * 1000), '', MONEY3)
  const diesel = r.savingsBasis === 'diesel'
  add(S.basis, diesel ? L.pdf.vsDiesel : L.pdf.vsGrid)
  add(S.savings, rq(r.annualSavingsUsd * q.fx), '', MONEY)
  if (r.omUsdPerYear > 0) add(S.om, rq(r.omUsdPerYear * q.fx), '', MONEY)
  const repl = (r.replacements ?? []).filter((x) => x.year <= p.design.analysisYears)
  if (repl.length) add(S.repl, repl.map((x) => L.pdf.replItem(x.item, x.year, `${num(x.usd * q.fx, D)} ${cur}`)).join('; '))
  if (Number.isFinite(r.npvUsd)) add(S.npv, rq(r.npvUsd * q.fx), '', MONEY)
  add(S.payback, r.paybackYears != null && Number.isFinite(r.paybackYears) ? Math.round(r.paybackYears * 10) / 10 : '—', U.years, '0.0')
  const lcoe = r.lcoeUsdPerKwh * q.fx
  if (!noPv) add(S.lcoe, lcoe, `${cur}${U.perKwh}`, unitDecimals(lcoe) === 3 ? DEC3 : DEC)
  if (r.roi25Pct != null && Number.isFinite(r.roi25Pct)) add(S.roi, r.roi25Pct / 100, `${p.design.analysisYears} ${U.years}`, PCT)
  add(S.co2, r.co2TonsPerYear, U.tYr).getCell(4).value = diesel ? L.pdf.vsDiesel : L.pdf.vsGrid
  s.addRow([])
  s.addRow([S.checks]).getCell(1).font = { bold: true, color: { argb: BRAND } }
  for (const c of r.checks) {
    const row = s.addRow([L.levels[c.level] ?? c.level, checkMessage(c, lang)])
    row.getCell(1).font = { bold: true, color: { argb: c.level === 'error' ? 'FFB91C1C' : c.level === 'warn' ? 'FFB45309' : 'FF047857' } }
    s.mergeCells(row.number, 2, row.number, 4); row.getCell(2).alignment = { wrapText: true, vertical: 'top' }
  }
  freeze(s, 4)

  // ---------------------------------------------------------------- Loads: the electricity bill (§15.1) …
  if (l && bill) {
    const B = X.billRows, bi = sz.bill
    title(l, X.billTitle, X.billSub)
    l.columns = [{ width: 36 }, { width: 16 }, { width: 12 }, { width: 44 }]
    header(l, 4, [X.param, X.value, X.unit, X.note])
    const night = r.dailyWh > 0 ? r.nightWh / r.dailyWh : 0
    const rowAt = (vals: Cell[], fmtStr?: string) => { const row = l.addRow(vals); if (fmtStr) row.getCell(2).numFmt = fmtStr; return row.number }
    const rMon = rowAt([B.monthly, bi.monthlyKwh, U.kwh], INT)
    l.getCell(`B${rMon}`).fill = yellow
    const rDay = rowAt([B.daily, f(`B${rMon}/30.4`, bi.monthlyKwh / 30.4), U.kwhDay], DEC)
    rowAt([B.profile, L.pdf.profiles[bi.profile] ?? bi.profile])
    const rNight = rowAt([B.night, night, ''], '0%')
    rowAt([B.nightKwh, f(`B${rDay}*B${rNight}`, (bi.monthlyKwh / 30.4) * night), U.kwhDay], DEC)
    rowAt([B.peak, r.peakW / 1000, U.kw, bi.peakKw ? X.given : X.estimated], DEC)
    rowAt([B.motor, bi.largestMotorKw ?? 0, U.kw], DEC)
    rowAt([B.surge, r.surgeW / 1000, U.kw], DEC)
    freeze(l, 4)
  }

  // ---------------------------------------------------------------- … or the appliance list (live formulas)
  if (l && !bill) {
    title(l, X.loadsTitle, X.loadsSub)
    l.columns = [{ width: 32 }, { width: 16 }, { width: 10 }, { width: 8 }, { width: 11 }, { width: 10 }, { width: 10 }, { width: 13 }, { width: 13 }, { width: 11 }]
    header(l, 4, X.loadCols)
    const lf = 5
    let connected = 0, dailyWh = 0, nightWh = 0
    p.loads.forEach((x, i) => {
      const n = lf + i
      const wh = x.watts * x.qty * x.hoursPerDay, nwh = wh * (x.nightSharePct / 100)
      connected += x.watts * x.qty; dailyWh += wh; nightWh += nwh
      const row = l.getRow(n)
      row.values = [loadName(x, lang), loadCategory(x.category, L), x.watts, x.qty, x.hoursPerDay, x.nightSharePct / 100, x.surgeFactor, f(`C${n}*D${n}*E${n}`, wh), f(`H${n}*F${n}`, nwh), x.critical ? L.yes : L.no]
      row.getCell(6).numFmt = '0%'; row.getCell(8).numFmt = INT; row.getCell(9).numFmt = INT
    })
    if (p.loads.length) {
      const last = lf + p.loads.length - 1, t = last + 1
      const tr = l.getRow(t)
      tr.values = [X.total, '', f(`SUMPRODUCT(C${lf}:C${last},D${lf}:D${last})`, connected), '', '', '', '', f(`SUM(H${lf}:H${last})`, dailyWh), f(`SUM(I${lf}:I${last})`, nightWh)]
      bold(tr); tr.getCell(3).numFmt = INT; tr.getCell(8).numFmt = INT; tr.getCell(9).numFmt = INT
      const d = l.getRow(t + 1); d.values = [X.dailyKwh, '', '', '', '', '', '', f(`H${t}/1000`, dailyWh / 1000)]; d.getCell(8).numFmt = DEC
      const cf = r.coincidenceFactor > 0 ? r.coincidenceFactor : p.design.coincidenceFactor
      const floorW = r.maxUnitW > 0 ? r.maxUnitW : 0
      const pk = l.getRow(t + 2); pk.values = [X.peakRow, '', cf, '', '', '', '', f(`MAX(C${t}*C${t + 2},${floorW})`, Math.max(connected * cf, floorW))]; pk.getCell(8).numFmt = INT
  }
  freeze(l, 4)
  }

  // ---------------------------------------------------------------- Sizing (formula-driven)
  title(z, X.sizingTitle, X.sizingSub)
  z.columns = [{ width: 42 }, { width: 16 }, { width: 12 }, { width: 58 }]
  header(z, 4, [X.param, X.value, X.unit, X.note])
  const Zr = (k: string, v: Cell, u = '', note = '', fmtStr = DEC) => { const row = z.addRow([k, v, u, note]); if (typeof v !== 'string') row.getCell(2).numFmt = fmtStr; return row.number }
  const tilt = r.tiltGainUsed > 0 ? r.tiltGainUsed : p.site.tiltGainFactor
  const daily = r.dailyWh / 1000
  const pvFixed = tgt.pvKwp != null && tgt.pvKwp > 0, invFixed = tgt.inverterKw != null && tgt.inverterKw > 0, battFixed = tgt.batteryKwh != null && tgt.batteryKwh > 0
  if (noPv) z.addRow([X.noPv])
  else {
    // Fixed PV size (or no consumption data: the array follows the inverter) → the planner's value, else the §3 formula
    const rDaily = noDemand ? 0 : Zr(Z.daily, daily, U.kwhDay, bill ? X.fromBill : Z.fromLoads, DEC3)
    const rPsh = Zr(Z.psh, p.site.psh, `${U.h}/day`)
    const rTilt = Zr(Z.tilt, tilt, '', Z.tiltNote, DEC3)
    const rDer = Zr(Z.derate, r.derate, '', r.derateBreakdown.map((x) => `${derateName(x, lang, L)} ${x.factor.toFixed(3)}`).join(' × '), '0.000')
    let rReq: number, reqPv: number
    if (pvFixed || noDemand) {
      reqPv = r.requiredPvKwp
      rReq = Zr(Z.requiredPv, reqPv, U.kwp, pvFixed ? X.fixed : `${X.noData} · ${L.tech.pvFromInv(num(tgt.inverterKw ?? r.requiredInverterKw, 2), num(p.design.dcAcRatio, 2))}`, DEC3)
    } else {
      const rOver = Zr(Z.oversize, p.design.pvOversize)
      reqPv = p.site.psh * tilt * r.derate > 0 ? daily / (p.site.psh * tilt * r.derate) * p.design.pvOversize : 0
      rReq = Zr(Z.requiredPv, f(`IF(B${rPsh}*B${rTilt}*B${rDer}>0,B${rDaily}/(B${rPsh}*B${rTilt}*B${rDer})*B${rOver},0)`, reqPv), U.kwp, `${Z.requiredPvNote} · ${X.planner(num(r.requiredPvKwp, 3))}`, DEC3)
    }
    const rPw = Zr(Z.moduleW, r.panel.watts, 'W', `${r.panel.brand} ${r.panel.model}`, INT)
    Zr(Z.panelsTheory, f(`CEILING(B${rReq}*1000/B${rPw},1)`, Math.ceil(Math.round((reqPv * 1000) / r.panel.watts * 1e6) / 1e6)), U.pcs, Z.panelsTheoryNote, INT)
    Zr(Z.panelsFinal, r.panelQty, U.pcs, r.strings ? Z.stringsNote(String(r.strings.strings), String(r.strings.panelsPerString)) : '', INT)
    Zr(Z.array, r.arrayKwp, U.kwp)
  }
  z.addRow([])
  if (p.design.systemType !== 'gridtie' && r.batteryQty > 0 && battFixed) {
    Zr(Z.reqStorage, r.batteryRequiredKwh, U.kwh, X.fixed)
    Zr(Z.bank, r.batteryKwh, U.kwh, Z.bankNote(String(r.batteryQty), String(r.batteryConfig.series), String(r.batteryConfig.parallel), num(r.batteryAh, 0)))
    Zr(Z.usable, r.batteryUsableKwh, U.kwh)
    z.addRow([])
  } else if (p.design.systemType !== 'gridtie' && r.batteryQty > 0) {
    const offgrid = p.design.systemType === 'offgrid'
    const baseKwh = (r.batteryDailyWh > 0 ? r.batteryDailyWh : offgrid ? r.dailyWh : r.nightWh) / 1000
    const rAut = Zr(Z.autonomy, p.design.autonomyDays, U.days)
    const rDod = Zr(Z.dod, r.dod, '', Z.dodNote, '0%')
    const rEff = Zr(Z.eff, INV_EFF_BATT)
    const rBase = Zr(offgrid ? Z.base : Z.baseHybrid, baseKwh, U.kwh, '', DEC3)
    const req = r.dod > 0 ? (baseKwh * p.design.autonomyDays) / (r.dod * INV_EFF_BATT) : 0
    Zr(Z.reqStorage, f(`IF(B${rDod}*B${rEff}>0,B${rBase}*B${rAut}/(B${rDod}*B${rEff}),0)`, req), U.kwh, `${Z.reqStorageNote} · ${X.planner(num(r.batteryRequiredKwh, 2))}`)
    Zr(Z.bank, r.batteryKwh, U.kwh, Z.bankNote(String(r.batteryQty), String(r.batteryConfig.series), String(r.batteryConfig.parallel), num(r.batteryAh, 0)))
    Zr(Z.usable, r.batteryUsableKwh, U.kwh)
    z.addRow([])
  }
  const rPeak = noDemand ? 0 : Zr(Z.peak, r.peakW / 1000, U.kw, '', DEC3)
  if (invFixed) Zr(Z.reqInv, r.requiredInverterKw, U.kw, X.fixed)
  else if (r.inverterSizingBasis === 'array' || noDemand) {
    const rArr = Zr(L.tech.array, r.arrayKwp, U.kwp)
    const rRatio = Zr(L.tech.dcac, p.design.dcAcRatio)
    Zr(Z.reqInv, f(`IF(B${rRatio}>0,B${rArr}/B${rRatio},0)`, p.design.dcAcRatio > 0 ? r.arrayKwp / p.design.dcAcRatio : 0), U.kw, X.planner(num(r.requiredInverterKw, 2)))
  } else {
    const rSaf = Zr(Z.safety, p.design.inverterSafety)
    Zr(Z.reqInv, f(`B${rPeak}*B${rSaf}`, (r.peakW / 1000) * p.design.inverterSafety), U.kw, X.planner(num(r.requiredInverterKw, 2)))
  }
  Zr(Z.selInv, r.inverter ? `${r.inverterQty} × ${r.inverter.brand} ${r.inverter.model}` : '—', '', r.inverter ? Z.invNote(num(r.inverterTotalKw, 1), num(r.inverter.surgeKw * r.inverterQty, 1), num(r.inverter.maxPvInputKw * r.inverterQty, 1)) : '')
  if (r.strings && r.inverter) {
    z.addRow([]); bold(z.addRow([Z.strings]))
    Zr(Z.pps, r.strings.panelsPerString, U.pcs, '', INT)
    Zr(Z.nStrings, r.strings.strings, '', '', INT)
    Zr(Z.voc, r.strings.vocCold, 'V', Z.vocNote(num(r.strings.maxSystemVoltageV ?? r.inverter.maxPvVoltage, 0)), '0.0')
    Zr(Z.vmp, r.strings.vmpHot, 'V', Z.vmpNote(num(r.inverter.mpptMinV, 0)), '0.0')
    Zr(Z.isc, r.strings.stringIscA, 'A', Z.iscNote(num(r.inverter.maxInputCurrentPerMppt, 1)))
  }
  z.addRow([]); bold(z.addRow([Z.cables]))
  header(z, z.lastRow!.number + 1, Z.cableCols)
  const cables: CableResult[] = r.cableSchedule?.length ? r.cableSchedule : r.cables
  for (const c of cables) {
    const row = z.addRow([cableLabel(c, lang, L), c.currentA, c.lengthM, `${cableSize(c, L)} · ${num(c.dropPct, 2)}% · ${cableDevice(c, L)}`])
    row.getCell(2).numFmt = '0.0'; row.getCell(3).numFmt = '0.0'
    if (c.deviceStd === false) row.font = { color: { argb: 'FFB91C1C' } }
  }
  const prot = protectionRows(r, L)
  if (prot.length) {
    z.addRow([]); bold(z.addRow([L.tech.protection]))
    for (const [k, v] of prot) z.addRow([k, v])
  }
  freeze(z, 4)

  // ---------------------------------------------------------------- Production (inputs in rows 3–4, header in row 6); no demand columns without consumption data
  if (m) {
    title(m, noDemand ? L.pdf.chartTitle : X.prodTitle, X.prodSub)
    m.columns = [{ width: 18 }, { width: 16 }, { width: 11 }, { width: 8 }, { width: 18 }, { width: 16 }, { width: 12 }]
    m.getCell('A3').value = X.arrayKwp; m.getCell('B3').value = r.arrayKwp; m.getCell('B3').numFmt = DEC
    m.getCell('A4').value = X.derate; m.getCell('B4').value = r.derate; m.getCell('B4').numFmt = '0.000'
    m.getCell('A3').font = { bold: true }; m.getCell('A4').font = { bold: true }
    header(m, 6, noDemand ? X.prodColsNoDemand : X.prodCols)
    const pshUsed = r.monthlyPshUsed?.length === 12 ? r.monthlyPshUsed : p.site.monthlyPsh
    const gains = r.monthlyTiltGain?.length === 12 ? r.monthlyTiltGain : Array<number>(12).fill(tilt)
    let sumProd = 0, sumDem = 0
    for (let i = 0; i < 12; i++) {
      const n = 7 + i
      const prod = r.arrayKwp * pshUsed[i] * gains[i] * r.derate * DAYS_IN_MONTH[i], dem = (r.dailyWh / 1000) * DAYS_IN_MONTH[i]
      sumProd += prod; sumDem += dem
      const row = m.getRow(n)
      row.values = [L.months[i], pshUsed[i], gains[i], DAYS_IN_MONTH[i], f(`$B$3*B${n}*C${n}*$B$4*D${n}`, prod), ...(noDemand ? [] : [dem, f(`IF(F${n}>0,E${n}/F${n},0)`, dem > 0 ? prod / dem : 0)])]
      row.getCell(2).numFmt = DEC; row.getCell(3).numFmt = '0.000'; row.getCell(5).numFmt = INT; row.getCell(6).numFmt = INT; row.getCell(7).numFmt = '0%'
  }
  const mt = m.getRow(19)
  mt.values = [X.year, f('AVERAGE(B7:B18)', pshUsed.reduce((a, x) => a + x, 0) / 12), '', f('SUM(D7:D18)', 365), f('SUM(E7:E18)', sumProd), ...(noDemand ? [] : [f('SUM(F7:F18)', sumDem), f('IF(F19>0,E19/F19,0)', sumDem > 0 ? sumProd / sumDem : 0)])]
  bold(mt); mt.getCell(2).numFmt = DEC; mt.getCell(5).numFmt = INT; mt.getCell(6).numFmt = INT; mt.getCell(7).numFmt = '0%'
  freeze(m, 6)
  }

  // ---------------------------------------------------------------- Economics (engine cash flow; year 0 = the quoted total)
  const years = p.design.analysisYears
  const tariffUsd = Number.isFinite(r.avoidedCostUsdPerKwh) && r.avoidedCostUsdPerKwh > 0 ? r.avoidedCostUsdPerKwh : p.site.gridTariff
  const tariff = tariffUsd * q.fx
  title(e, X.ecoTitle(years), X.ecoSub(`${num(tariff, unitDecimals(tariff))} ${cur}`, num(escalationPct(p), 2), num(p.design.degradationPctPerYear, 2), diesel))
  e.columns = [{ width: 8 }, { width: 18 }, { width: 20 }, { width: 20 }]
  header(e, 4, X.ecoCols(cur))
  let cumv = 0
  for (let y = 0; y <= years; y++) {
    const n = 5 + y
    const prod = y === 0 ? 0 : r.annualProductionKwh * Math.pow(1 - p.design.degradationPctPerYear / 100, y - 1)
    const net = y === 0 ? -q.total : rq(((r.cumulativeCashflow[y] ?? 0) - (r.cumulativeCashflow[y - 1] ?? 0)) * q.fx)
    cumv = rq(cumv + net)
    const row = e.getRow(n)
    row.values = [y, prod, net, f(y === 0 ? `C${n}` : `D${n - 1}+C${n}`, cumv)]
    row.getCell(2).numFmt = INT; row.getCell(3).numFmt = MONEY0; row.getCell(4).numFmt = MONEY0
  }
  freeze(e, 4)

  return write()
}
