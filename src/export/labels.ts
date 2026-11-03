// Every string the exports (client proposal PDF, technical PDF, Excel workbook) and the Export step print, in English and Arabic.
// Arabic policy: Western digits, Latin SI unit symbols (kW, kWh, V, A, m²), no diacritics (jsPDF has no mark positioning),
// "DT+" followed by an LRM so the "+" stays on the right side of the brand in RTL text.
export type ExportLang = 'en' | 'ar'

/** Forms of an Arabic counted noun: singular, dual (nominative, oblique), plural for 3–10, singular accusative for 11–99. */
interface ArNoun { one: string; two: [string, string]; few: string; many: string }
/**
 * Arabic number + counted noun from the printed number: 1 ساعة, 2 → ساعتان (the dual replaces the digit), 3–10 ساعات,
 * 11–99 ساعة / يوما, 100+ and fractions singular. `oblique` picks the dual after a preposition or in an iḍāfa (ساعتين).
 */
export function arCount(n: string, w: ArNoun, oblique = false) {
  const s = n.replace(/[,\s\u200e\u2068\u2069]/g, '')
  if (!/^\d+$/.test(s)) return `${n} ${w.one}`
  const v = Number(s), r = v % 100
  if (v === 2) return w.two[oblique ? 1 : 0]
  if (r >= 3 && r <= 10) return `${n} ${w.few}`
  if (r >= 11 && r <= 99) return `${n} ${w.many}`
  return `${n} ${w.one}`
}
export const AR_NOUNS = {
  hour: { one: 'ساعة', two: ['ساعتان', 'ساعتين'], few: 'ساعات', many: 'ساعة' },
  day: { one: 'يوم', two: ['يومان', 'يومين'], few: 'أيام', many: 'يوما' },
  year: { one: 'سنة', two: ['سنتان', 'سنتين'], few: 'سنوات', many: 'سنة' },
  panel: { one: 'لوح', two: ['لوحان', 'لوحين'], few: 'ألواح', many: 'لوحا' },
  battery: { one: 'بطارية', two: ['بطاريتان', 'بطاريتين'], few: 'بطاريات', many: 'بطارية' },
  inverter: { one: 'إنفرتر', two: ['إنفرتران', 'إنفرترين'], few: 'إنفرترات', many: 'إنفرترا' },
} satisfies Record<string, ArNoun>
const hAr = (h: string, obl = false) => arCount(h, AR_NOUNS.hour, obl)
const dAr = (d: string, obl = false) => arCount(d, AR_NOUNS.day, obl)
const yAr = (y: string, obl = false) => arCount(y, AR_NOUNS.year, obl)
/**
 * Fix "N ساعة / يوم / سنة" in Arabic strings built elsewhere (load-calculator strings): number (optionally inside a
 * first-strong isolate) followed by the singular noun → the grammatical form. Those strings put the count after «نحو» /
 * «لمدة», so the dual is oblique (ساعتين).
 */
export function arFixCounts(s: string) {
  return s.replace(/(\u2068?)(\d[\d,]*(?:\.\d+)?)(\u2069?) (ساعة|يوم|سنة)(?![\u0600-\u06FF])/g, (_m, a: string, n: string, b: string, noun: string) => {
    const w = noun === 'ساعة' ? AR_NOUNS.hour : noun === 'يوم' ? AR_NOUNS.day : AR_NOUNS.year
    const out = arCount(n, w, true)
    return out.startsWith(n) ? `${a}${n}${b}${out.slice(n.length)}` : out
  })
}

const en = {
  brand: 'Product developed by DT+',
  sys: { offgrid: 'Off-grid (solar + battery)', hybrid: 'Hybrid (grid + battery)', gridtie: 'Grid-tied (no battery)' } as Record<string, string>,
  phase: (n: number): string => (n === 3 ? 'Three-phase 400 V' : 'Single-phase 230 V'),
  invType: { offgrid: 'off-grid inverter', hybrid: 'hybrid inverter', gridtie: 'grid-tied inverter' } as Record<string, string>,
  roofs: { 'flat-concrete': 'flat concrete roof', 'pitched-tile': 'pitched tile roof', 'metal-sheet': 'metal sheet roof', ground: 'ground mount' } as Record<string, string>,
  months: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'],
  units: { pcs: 'pcs', m: 'm', lot: 'lot', kit: 'kit', pair: 'pair', set: 'set', kWp: 'kWp', kVA: 'kVA', kW: 'kW', kWh: 'kWh' } as Record<string, string>,
  cats: {
    'PV Modules': 'Solar modules', Inverter: 'Inverters & controllers', Battery: 'Battery storage', Mounting: 'Mounting structure', Cabling: 'Cables & connectors',
    Protection: 'Protection & switchgear', Earthing: 'Earthing & lightning', Monitoring: 'Monitoring', Accessories: 'Accessories', Generator: 'Generator', Services: 'Services', Custom: 'Other items',
  } as Record<string, string>,
  services: { labour: 'Installation labour', transport: 'Transport & logistics', commissioning: 'Commissioning, testing & handover' } as Record<string, string>,
  loadCats: {
    lighting: 'Lighting', cooling: 'Cooling', refrigeration: 'Refrigeration', electronics: 'Electronics', security: 'Security', office: 'Office', kitchen: 'Kitchen', appliance: 'Appliance',
    heating: 'Heating', pump: 'Pump', motor: 'Motor', agri: 'Agriculture', workshop: 'Workshop', other: 'Other',
  } as Record<string, string>,
  derate: {
    Temperature: 'Temperature', Soiling: 'Soiling / dust', Shading: 'Shading', 'Wiring (DC+AC)': 'Wiring (DC+AC)', 'Mismatch & nameplate': 'Mismatch & nameplate',
    'Inverter efficiency': 'Inverter efficiency', 'Availability / dust storms': 'Availability / dust storms',
  } as Record<string, string>,
  battRoundTrip: (pct: string) => `Battery round-trip (${pct}% via battery)`,
  levels: { ok: 'OK', warn: 'Review', error: 'Must fix' } as Record<string, string>,
  yes: 'Yes', no: 'No', none: 'None', dash: '—',
  circuits: { dc: 'PV string (DC)', battery: 'Battery (DC)', ac: 'Inverter output (AC)' } as Record<string, string>,
  protection: { dc: 'gPV fuse', battery: 'class-T fuse', ac: 'MCB' } as Record<string, string>,

  pdf: {
    title: 'Solar Proposal', quotation: 'Quotation', preparedFor: 'Prepared for', project: 'Project', ref: 'Reference', date: 'Date',
    location: 'Location', psh: (v: string) => `${v} peak sun-hours/day`, validUntil: (d: string) => `Valid until ${d}`,
    tiles: { pv: 'PV array', battery: 'Battery storage', inverter: 'Inverter', production: 'Annual production', investment: 'Investment', savings: 'Annual savings', payback: 'Payback', co2: 'CO₂ avoided', lifetime: 'Lifetime production', yield: 'Specific yield' },
    years: (v: string) => `${v} years`, inclVat: (pct: string) => `incl. VAT ${pct}%`, perYear: '/yr', tPerYear: 't/yr', kwhPerKwp: 'kWh/kWp',
    yourSystem: 'Your system', component: 'Component', description: 'Description',
    rows: { modules: 'Solar modules', inverter: 'Inverter', battery: 'Battery bank', controller: 'Charge controller', generator: 'Backup generator', roof: 'Roof area needed', energy: 'Energy' },
    modules: (qty: string, name: string, w: string, tech: string, warranty: string) => `${qty} × ${name} — ${w} W ${tech}, ${warranty}-year warranty`,
    bifacial: 'bifacial',
    inverter: (qty: string, name: string, kw: string, type: string) => `${qty} × ${name} — ${kw} kW ${type}`,
    battery: (qty: string, name: string, total: string, usable: string) => `${qty} × ${name} — ${total} kWh total, ${usable} kWh usable`,
    batteryNoModel: (total: string, usable: string) => `${total} kWh total, ${usable} kWh usable`,
    autonomyDays: (d: string) => `about ${d} days of autonomy at the full daily load`,
    backupHours: (h: string) => `about ${h} h of backup for the backed-up loads at night`,
    autonomyShort: (d: string) => `${d} days autonomy`, backupShort: (h: string) => `${h} h night backup`,
    notQuoted: 'not included in this quotation',
    controller: (qty: string, name: string) => `${qty} × ${name}`,
    generator: (kva: string) => `${kva} kVA (sized for peak load and battery charging)`,
    roof: (m2: string, roof: string) => `about ${m2} m² (${roof})`,
    energy: (kwh: string, pct: string) => `${kwh} kWh/day demand · solar covers ${pct}% over the year`,
    chartTitle: 'Monthly solar production (kWh)', demand: (v: string) => `monthly demand ${v} kWh`,
    finance: 'Financial summary', year: 'Year', yearN: (n: number) => `Year ${n}`, cumulative: 'Cumulative cash flow',
    financeNote: (a: { diesel: boolean; tariff: string; esc: string; deg: string; lcoe: string; years: string; roi: string; om: string; repl: string }) =>
      (a.diesel ? `Savings are valued against diesel generation at ${a.tariff}/kWh` : `Savings are valued at the grid tariff of ${a.tariff}/kWh`) +
      `, rising ${a.esc}% a year, with ${a.deg}% a year module degradation.` +
      (a.om ? ` The cash flow includes O&M of ${a.om} a year${a.repl ? ` and replacements: ${a.repl}` : ''}.` : '') +
      ` Levelised cost of solar energy: ${a.lcoe}/kWh. Return on investment over ${a.years} years: ${a.roi}.`,
    replItem: (item: string, year: number, amount: string) => `${item === 'battery' ? 'battery bank' : 'inverter'} in year ${year} (${amount})`,
    vsDiesel: 'vs diesel generation', vsGrid: 'vs grid electricity', savingsDiesel: 'year 1 · vs diesel',
    boq: 'Bill of materials & pricing', pricesIn: (cur: string) => `All prices in ${cur}`,
    cols: { no: '#', item: 'Item', spec: 'Specification', qty: 'Qty', unit: 'Unit', unitPrice: 'Unit price', total: 'Amount' },
    subtotal: 'Subtotal', discount: (pct: string) => `Discount ${pct}%`, vat: (pct: string) => `VAT ${pct}%`, total: 'TOTAL', totalInclVat: 'TOTAL incl. VAT',
    terms: 'Terms & conditions', notes: 'Notes', accepted: 'Accepted by client', forCompany: (c: string) => `For ${c}`, signature: 'Signature', name: 'Name',
    page: (i: number, n: number) => `Page ${i} of ${n}`,
    defaultTerms: '',
    // Modes: known size (no consumption data), battery backup only (no panels), demand from the electricity bill, product quote
    profiles: { residential: 'residential', commercial: 'commercial', daytime: 'daytime-only' } as Record<string, string>,
    energyBill: (kwh: string, profile: string, pct: string) => `${kwh} kWh/month from the electricity bill (${profile} use) · solar covers ${pct}% over the year`,
    energyNone: (prod: string) => `System size chosen by the client · about ${prod} kWh of solar energy on an average day`,
    energyBackup: 'System size chosen by the client · battery backup without solar panels',
    selfUseNote: ' No consumption data: savings assume all the solar energy is used on site.',
    backupAt: (h: string, kw: string) => `${h} h at ${kw} kW`, backupAbout: (list: string) => `backup of about ${list}`,
    tileBackup: 'Backup time', tileUsable: (kwh: string) => `${kwh} kWh usable`, atLoad: (kw: string) => `at a ${kw} kW load`, hours: (h: string) => `${h} h`,
    existingIncl: (n: string) => `incl. ${n} already on site`, existingLine: (n: string) => `+${n} already on site, not quoted`,
    existingNote: (list: string) => `Existing equipment (not quoted): ${list}.`, existingItem: (qty: string, name: string) => `${qty} × ${name} already on site`,
    details: 'Quotation details', refN: (r: string) => `Reference ${r}`, dateN: (d: string) => `Date ${d}`,
    systemShort: (type: string, size: string) => `${type} · ${size}`,
    // Document title when the project still has its default name: client + a short system descriptor
    sysShort: { offgrid: 'off-grid', hybrid: 'hybrid', gridtie: 'grid-tied' } as Record<string, string>,
    descriptor: (kwp: string, type: string) => `${kwp} kWp ${type}`, descriptorBackup: (kwh: string) => `${kwh} kWh battery backup`,
    forCompanyBlank: 'For the company',
  },
  /** File-name suffixes (after the project stem). */
  file: { proposal: 'proposal', quotation: 'quotation', technical: 'technical-internal', workbook: 'workbook-internal' },

  tech: {
    title: 'Technical Design Report', internal: 'INTERNAL — not for the client',
    project: 'Project', client: 'Client', site: 'Site', systemType: 'System type', supply: 'Supply', location: 'Location', date: 'Date',
    checks: 'Design checks', level: 'Status', check: 'Check',
    loads: 'Load analysis', loadCols: ['Appliance', 'W', 'Qty', 'h/day', 'Night %', 'Surge ×', 'Wh/day'], total: 'Total',
    loadNote: (a: { peak: string; cf: string; surge: string; night: string; annual: string }) => `Peak demand ${a.peak} W (coincidence ${a.cf}) · starting surge ${a.surge} W · night energy ${a.night} Wh/day · annual ${a.annual} kWh`,
    pv: 'PV sizing', param: 'Parameter', value: 'Value', basis: 'Basis',
    psh: 'Peak sun hours', tilted: (h: string, t: string) => `${h} → ${t} on the tilted plane`, tiltBasis: (g: string, deg: string) => `tilt gain ×${g}, tilt ${deg}°`,
    derate: 'Overall derate (performance ratio)', requiredPv: 'Required PV', requiredPvBasis: (o: string) => `daily energy / (PSH × derate) × oversize ${o}`,
    array: 'Array', areaWeight: 'Area / weight', areaBasis: (l: string, w: string, kg: string) => `${l} × ${w} mm, ${kg} kg each`,
    production: 'Annual production', specYield: (v: string) => `${v} kWh/kWp per year`,
    losses: 'Loss breakdown', factor: 'Factor',
    inverter: 'Inverter & string design', required: 'Required', requiredInvBasis: (s: string, surge: string) => `peak × ${s}; surge ${surge} kW`,
    selected: 'Selected', invBasis: (a: { kw: string; surge: string; pv: string; mppt: string; amps: string; vmin: string; vmax: string; vabs: string }) =>
      `${a.kw} kW, surge ${a.surge} kW, max PV ${a.pv} kW, ${a.mppt} MPPT × ${a.amps} A, ${a.vmin}–${a.vmax} V (max ${a.vabs} V)`,
    dcac: 'DC/AC ratio', dcacBasis: 'typical 1.1–1.3',
    strings: 'Strings', stringsVal: (n: string, p: string) => `${n} × ${p} modules`, stringsBasis: (m: string, s: string) => `${m} MPPT used, ${s} string(s) per MPPT`,
    vocCold: 'Voc at record low', vocBasis: (t: string, lim: string, ok: boolean) => `at ${t} °C, limit ${lim} V: ${ok ? 'OK' : 'FAIL'}`,
    vmpHot: 'Vmp at hot cell', vmpBasis: (t: string, lim: string, ok: boolean) => `cell about ${t} °C, MPPT min ${lim} V: ${ok ? 'OK' : 'FAIL'}`,
    isc: 'String Isc', iscBasis: (lim: string, ok: boolean) => `MPPT input limit ${lim} A: ${ok ? 'OK' : 'FAIL'}`,
    battery: 'Battery bank', battRequired: (base: string, d: string, dod: string, eff: string) => `${base} × ${d} d autonomy / (DoD ${dod}% × inverter efficiency ${eff})`,
    dailyEnergy: 'daily energy', criticalNight: 'backed-up night energy',
    bank: 'Bank', bankBasis: (s: string, p: string, kwh: string, ah: string, v: string) => `${s}S × ${p}P · ${kwh} kWh · ${ah} Ah at ${v} V`,
    usable: 'Usable / autonomy', controller: 'Charge controller', ctrlBasis: (a: string) => `${a} A required`, generator: 'Generator', genBasis: 'peak × 1.25 + charger, PF 0.8',
    cables: 'Cable schedule & protection', cableCols: ['Circuit', 'Current', 'Voltage', 'Run', 'Cable', 'Drop', 'Protection'],
    cableNote: 'Voltage drop: Vd = 2·L·I·rho/A (sqrt(3)·L·I·rho/A three-phase), rho = 0.0206 ohm·mm²/m (Cu at 70 °C). Ampacity derated ×0.87 for 40 °C ambient. PV fuses 1.56 × Isc; battery and AC protection 1.25 × I. References: IEC 62548, IEC 60364-5-52, NEC 690.',
    protection: 'Protective devices', protRows: {
      stringFuse: 'PV string fuse', arrayFuse: 'PV array fuse', dcIsolator: 'DC isolator', spdDc: 'DC surge protector', batteryFuse: 'Battery fuse',
      acInv: 'AC breaker per inverter', acMain: 'AC main breaker', gen: 'Generator breaker', rcd: 'Residual-current device (RCD)', changeover: 'Changeover switch',
    } as Record<string, string>, manual: 'manual', ats: 'automatic (ATS)', nonStd: 'above the largest standard rating', iz: 'Iz',
    pricing: 'Internal pricing summary', pricingRows: {
      equipment: 'Equipment (cost)', services: 'Services (cost)', cost: 'Cost subtotal', markup: (p: string) => `Markup ${p}% on cost`, sell: 'Selling price before discount',
      margin: 'Gross margin', discount: (p: string) => `Discount ${p}%`, vat: (p: string) => `VAT ${p}%`, total: 'Total to client',
    },
    costedBom: 'Costed bill of materials', costCols: ['#', 'Item', 'Qty', 'Unit', 'Unit cost', 'Cost', 'Unit price', 'Price'],
    bill: 'Demand from the electricity bill', billRows: {
      monthly: 'Monthly consumption', daily: 'Daily energy', profile: 'Usage profile', night: 'Night share', peak: 'Peak demand', motor: 'Largest motor', surge: 'Starting surge',
    }, given: 'measured / contracted', estimated: 'estimated from the profile', noMotor: 'none', whPerDay: (v: string) => `${v} Wh/day`,
    billNote: 'No appliance list: the daily energy, night share and peak come from the monthly bill and the usage profile.',
    basisTitle: 'Sizing basis', noDemand: (sizes: string) => `No consumption data: the client chose the system size (${sizes}).`, assumeSelfUse: ' Savings assume all the solar energy is used on site.',
    noPv: 'No PV array: battery backup only.',
    fixedPv: (kwp: string) => `fixed at ${kwp} kWp by the client`, pvFromInv: (kw: string, r: string) => `inverter ${kw} kW × DC/AC ${r}`,
    fixedInv: (kw: string) => `fixed at ${kw} kW by the client`, invFromPv: (kwp: string, r: string) => `PV ${kwp} kWp ÷ DC/AC ${r}`,
    fixedBatt: (kwh: string) => `fixed at ${kwh} kWh nominal by the client`,
    existing: 'Already on site', existingVal: (parts: string) => `${parts} (counted in the design, not quoted)`,
    existingParts: { panels: (n: number) => `${n} panels`, batteries: (n: number) => `${n} batteries`, inverters: (n: number) => `${n} inverters` },
  },

  xl: {
    sheets: { summary: 'Summary', loads: 'Loads', sizing: 'Sizing', production: 'Production', bom: 'BOM', economics: 'Economics' },
    param: 'Parameter', value: 'Value', unit: 'Unit', note: 'Formula / note',
    summary: {
      client: 'Client', site: 'Site address', systemType: 'System type', phase: 'Supply', location: 'Location', psh: 'Peak sun hours (horizontal)', tilt: 'Tilt gain factor',
      daily: 'Daily energy demand', annual: 'Annual demand', peak: 'Peak demand', surge: 'Starting surge', derate: 'Overall derate factor', requiredPv: 'Required PV', array: 'PV array',
      panels: 'Panels', area: 'Array area', production: 'Annual production', yield: 'Specific yield', battery: 'Battery bank', battUnits: 'Battery units', usable: 'Usable storage', autonomy: 'Autonomy',
      inverter: 'Inverter', invCap: 'Inverter capacity', generator: 'Generator',
      pricing: 'Pricing', equipment: 'Equipment (cost)', services: 'Services (cost)', cost: 'Cost subtotal', markupPct: 'Markup on cost', markup: 'Markup', sell: 'Selling price before discount',
      margin: 'Gross margin', discount: 'Discount', vat: 'VAT', total: 'Total price (incl. VAT)', perWp: 'Price per Wp', savings: 'Annual savings (year 1)', payback: 'Simple payback', lcoe: 'LCOE', roi: 'Return on investment', co2: 'CO₂ avoided',
      checks: 'Design checks', om: 'O&M per year', npv: 'Net present value', repl: 'Replacements in the cash flow', basis: 'Savings basis',
    },
    u: { kwhDay: 'kWh/day', kwhYr: 'kWh/yr', w: 'W', kwp: 'kWp', m2: 'm²', kwh: 'kWh', kw: 'kW', kva: 'kVA', years: 'years', days: 'days', tYr: 't/yr', pcs: 'pcs', h: 'h', perKwh: '/kWh' },
    loadsTitle: 'Load analysis', loadsSub: 'Edit watts, quantity or hours: the totals recalculate',
    loadCols: ['Appliance', 'Category', 'Watts', 'Qty', 'Hours/day', 'Night %', 'Surge ×', 'Wh/day', 'Night Wh', 'Backed up'],
    total: 'TOTAL', dailyKwh: 'Daily energy (kWh)', peakRow: 'Peak demand (W) = connected × coincidence',
    sizingTitle: 'System sizing', sizingSub: 'Formulas reference the input cells in column B',
    sz: {
      daily: 'Daily energy demand', fromLoads: 'From the Loads sheet', psh: 'Peak sun hours (horizontal)', tilt: 'Tilt gain factor', tiltNote: '1 + 0.0045 × |latitude| (1.0–1.3)',
      derate: 'Overall derate', oversize: 'PV oversize factor', requiredPv: 'Required PV', requiredPvNote: 'E / (PSH × tilt × derate) × oversize', moduleW: 'Module power',
      panelsTheory: 'Panels (theoretical)', panelsTheoryNote: 'Before string rounding', panelsFinal: 'Panels (final, after strings)', stringsNote: (s: string, p: string) => `${s} strings × ${p}`, array: 'Array size',
      autonomy: 'Autonomy', dod: 'Depth of discharge', dodNote: 'Chemistry default or override', eff: 'Inverter efficiency (battery)', base: 'Energy from battery per day', baseHybrid: 'Backed-up night energy per day',
      reqStorage: 'Required storage', reqStorageNote: 'E × autonomy / (DoD × efficiency)', bank: 'Battery bank', bankNote: (q: string, s: string, p: string, ah: string) => `${q} units · ${s}S × ${p}P · ${ah} Ah`, usable: 'Usable storage',
      peak: 'Peak demand', safety: 'Inverter safety factor', reqInv: 'Required inverter', selInv: 'Selected inverter', invNote: (kw: string, surge: string, pv: string) => `${kw} kW · surge ${surge} kW · max PV ${pv} kW`,
      strings: 'String design', pps: 'Panels per string', nStrings: 'Strings', voc: 'String Voc at record low', vocNote: (v: string) => `Voc × (1 + beta × (Tmin − 25)) × n <= ${v} V`,
      vmp: 'String Vmp at hot cell', vmpNote: (v: string) => `>= MPPT min ${v} V`, isc: 'String Isc', iscNote: (a: string) => `<= MPPT input ${a} A`,
      cables: 'Cable schedule', cableCols: ['Circuit', 'Current (A)', 'Length (m)', 'Cable / drop / protection'], cableDesc: (mm: string, awg: string, drop: string, a: string, prot: string) => `${mm} mm² (AWG ${awg}) · ${drop}% drop · ${a} A ${prot}`,
    },
    prodTitle: 'Monthly production vs demand', prodSub: 'Production = array × PSH × tilt gain × derate × days', arrayKwp: 'Array (kWp)', derate: 'Overall derate', prodCols: ['Month', 'PSH (horizontal)', 'Tilt gain', 'Days', 'Production (kWh)', 'Demand (kWh)', 'Coverage'], year: 'Year',
    bomTitle: (cur: string) => `Bill of materials (${cur})`, bomSub: 'Internal: cost, markup and selling prices. Edit a quantity, cost or the markup cell: totals recalculate.',
    bomCols: ['#', 'Category', 'Item', 'Specification', 'Unit', 'Qty', 'Unit cost', 'Total cost', 'Unit price', 'Total price'],
    markupCell: 'Markup on cost (input)', planner: (v: string) => `Planner: ${v}`, discountIn: 'Discount (input %)', vatIn: 'VAT (input %)', costSubtotal: 'Cost subtotal', sellSubtotal: 'Subtotal (selling)', markup: 'Markup', grossMargin: 'Gross margin', discount: (p: string) => `Discount ${p}%`, vat: (p: string) => `VAT ${p}%`, grandTotal: 'GRAND TOTAL',
    ecoTitle: (n: number) => `Cash flow (${n} years)`, ecoSub: (tariff: string, esc: string, deg: string, diesel?: boolean) => `${diesel ? 'Diesel generation cost' : 'Grid tariff'} ${tariff}/kWh, ${esc}% escalation, ${deg}%/yr degradation; net of O&M and replacements`,
    ecoCols: (cur: string) => ['Year', 'Production (kWh)', `Net cash flow (${cur})`, `Cumulative (${cur})`],
    quoteSheet: 'Quotation', quoteSub: (who: string) => `${who} · cost, markup and selling prices. Edit a quantity, cost or the markup cell: totals recalculate.`,
    demandBasis: 'Demand basis', basis: { loads: 'Appliance list', bill: 'Electricity bill', none: 'System size chosen by the client' } as Record<string, string>,
    billTitle: 'Demand from the electricity bill', billSub: 'No appliance list: edit the monthly consumption (yellow) and the daily energy recalculates',
    billRows: { monthly: 'Monthly consumption', daily: 'Daily energy', profile: 'Usage profile', night: 'Night share', nightKwh: 'Night energy', peak: 'Peak demand', motor: 'Largest motor', surge: 'Starting surge' },
    given: 'measured / contracted', estimated: 'estimated from the profile',
    fromBill: 'From the electricity bill (Loads sheet)', noData: 'No consumption data', fixed: 'Fixed by the client', noPv: 'No PV array: battery backup only',
    prodColsNoDemand: ['Month', 'PSH (horizontal)', 'Tilt gain', 'Days', 'Production (kWh)'],
    existingSpec: (n: string) => `+${n} already on site, not quoted`,
  },

  ui: {
    readiness: 'Before you send', ready: 'Ready to send', notReady: (n: number) => (n === 1 ? '1 item to check' : `${n} items to check`),
    client: 'Client name', clientOk: (n: string) => n, clientMissing: 'Add the client’s name',
    loads: 'Appliance list', loadsOk: (n: number, kwh: string) => `${n} ${n === 1 ? 'appliance' : 'appliances'} · ${kwh} kWh/day`, loadsMissing: 'No appliances yet',
    checks: 'Design checks', checksOk: 'No blocking design issues', checksErr: (n: number) => (n === 1 ? '1 issue must be fixed' : `${n} issues must be fixed`),
    company: 'Company name', companyOk: (n: string) => n, companyMissing: 'Company name not set — it is left off the documents. Add it in Settings.',
    fx: 'Exchange rate', fxOk: (cur: string, v: string) => `1 USD = ${v} ${cur}`, fxMissing: (cur: string) => `1 USD = 1 ${cur}: enter today’s rate`,
    fix: 'Fix', open: 'Open', settings: 'Settings',
    docLang: 'Document language', english: 'English', arabic: 'العربية',
    proposal: 'Client proposal (PDF)', proposalHelp: 'Branded proposal: system summary, savings, priced bill of materials and terms. Shows selling prices only, never cost or markup.',
    proposalNotReady: 'Fix the items above before sending this to a client.',
    team: 'For your team', internal: 'Internal — includes cost prices', clientSafe: 'For the client',
    shareInternalTitle: 'Share an internal document?',
    shareInternalBody: (doc: string) => `${doc} includes your cost prices, markup and margin. Share it with your team only — never with the client.`,
    shareInternalConfirm: 'Share anyway',
    tech: 'Technical report (PDF)', techHelp: 'Design checks, string and cable design, loss breakdown, plus cost, markup and margin.',
    excel: 'Engineering workbook (Excel)', excelHelp: 'Loads, sizing, production, costed bill of materials with live formulas, cash flow.',
    json: 'Project file (JSON)', jsonHelp: 'Backup, or send to a colleague to import on the Projects page.', backup: 'Backup',
    share: 'Share', download: 'Download', shareNow: 'Tap to share', preparing: 'Preparing…', downloaded: (f: string) => `Downloaded ${f}`, shared: 'Shared',
    failed: 'Could not create the file. Please try again.', fontFailed: 'Could not load the PDF font. Check your connection and try again.',
    summary: 'Summary', markQuoted: 'Mark project as quoted', markedQuoted: 'Project marked as quoted', moreActions: 'Download instead',
  },
}

export type ExportLabels = typeof en

const LRM = '\u200E'
const ar: ExportLabels = {
  brand: 'من تطوير DT+' + LRM,
  sys: { offgrid: 'منفصل عن الشبكة: ألواح وبطاريات', hybrid: 'هجين: شبكة وبطاريات', gridtie: 'متصل بالشبكة بدون بطاريات' },
  phase: (n) => (n === 3 ? 'ثلاثي الأطوار 400 V' : 'أحادي الطور 230 V'),
  invType: { offgrid: 'إنفرتر منفصل عن الشبكة', hybrid: 'إنفرتر هجين', gridtie: 'إنفرتر متصل بالشبكة' },
  roofs: { 'flat-concrete': 'سطح خرساني مستو', 'pitched-tile': 'سطح قرميد مائل', 'metal-sheet': 'سطح صاج', ground: 'تركيب أرضي' },
  months: ['يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو', 'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر'],
  units: { pcs: 'قطعة', m: 'م', lot: 'مقطوعية', kit: 'طقم', pair: 'زوج', set: 'طقم', kWp: 'kWp', kVA: 'kVA', kW: 'kW', kWh: 'kWh' },
  cats: {
    'PV Modules': 'الألواح الشمسية', Inverter: 'الإنفرترات ومنظمات الشحن', Battery: 'تخزين البطاريات', Mounting: 'هياكل التثبيت', Cabling: 'الكابلات والموصلات',
    Protection: 'الحماية ولوحات التوزيع', Earthing: 'التأريض والحماية من الصواعق', Monitoring: 'المراقبة', Accessories: 'ملحقات', Generator: 'المولد', Services: 'الخدمات', Custom: 'بنود أخرى',
  },
  services: { labour: 'أعمال التركيب', transport: 'النقل والخدمات اللوجستية', commissioning: 'التشغيل والاختبار والتسليم' },
  loadCats: {
    lighting: 'إنارة', cooling: 'تبريد وتكييف', refrigeration: 'ثلاجات ومجمدات', electronics: 'إلكترونيات', security: 'أنظمة أمنية', office: 'مكتب', kitchen: 'مطبخ', appliance: 'أجهزة منزلية',
    heating: 'تسخين', pump: 'مضخات', motor: 'محركات', agri: 'زراعة', workshop: 'ورشة', other: 'أخرى',
  },
  derate: {
    Temperature: 'الحرارة', Soiling: 'الغبار والاتساخ', Shading: 'التظليل', 'Wiring (DC+AC)': 'الأسلاك DC وAC', 'Mismatch & nameplate': 'عدم التطابق وتفاوت القدرة',
    'Inverter efficiency': 'كفاءة الإنفرتر', 'Availability / dust storms': 'التوفر والعواصف الترابية',
  },
  battRoundTrip: (pct) => `كفاءة دورة البطارية، ${pct}% عبر البطارية`,
  levels: { ok: 'سليم', warn: 'للمراجعة', error: 'يجب إصلاحه' },
  yes: 'نعم', no: 'لا', none: 'لا يوجد', dash: '—',
  circuits: { dc: 'سلسلة الألواح DC', battery: 'البطارية DC', ac: 'خرج الإنفرتر AC' },
  protection: { dc: 'فيوز gPV', battery: 'فيوز class-T', ac: 'قاطع MCB' },

  pdf: {
    title: 'العرض الشامل للطاقة الشمسية', quotation: 'عرض سعر', preparedFor: 'مقدم إلى', project: 'المشروع', ref: 'المرجع', date: 'التاريخ',
    location: 'الموقع', psh: (v) => `${hAr(v)} ذروة شمسية في اليوم`, validUntil: (d) => `صالح حتى ${d}`,
    tiles: { pv: 'مصفوفة الألواح', battery: 'تخزين البطاريات', inverter: 'الإنفرتر', production: 'الإنتاج السنوي', investment: 'قيمة الاستثمار', savings: 'التوفير السنوي', payback: 'فترة الاسترداد', co2: 'انبعاثات CO₂ المتجنبة', lifetime: 'الإنتاج طوال العمر', yield: 'الإنتاجية النوعية' },
    years: (v) => yAr(v), inclVat: (pct) => `شامل الضريبة ${pct}%`, perYear: '/سنة', tPerYear: 'طن/سنة', kwhPerKwp: 'kWh/kWp',
    yourSystem: 'نظامك', component: 'المكون', description: 'الوصف',
    rows: { modules: 'الألواح الشمسية', inverter: 'الإنفرتر', battery: 'بنك البطاريات', controller: 'منظم الشحن', generator: 'مولد احتياطي', roof: 'المساحة المطلوبة', energy: 'الطاقة' },
    modules: (qty, name, w, tech, warranty) => `${qty} × ${name} — ${w} W ${tech}، ضمان ${yAr(warranty, true)}`,
    bifacial: 'ثنائي الوجه',
    inverter: (qty, name, kw, type) => `${qty} × ${name} — ${kw} kW ${type}`,
    battery: (qty, name, total, usable) => `${qty} × ${name} — السعة الكلية ${total} kWh، المتاح ${usable} kWh`,
    batteryNoModel: (total, usable) => `السعة الكلية ${total} kWh، المتاح ${usable} kWh`,
    autonomyDays: (d) => `استقلالية نحو ${dAr(d, true)} بكامل الحمل اليومي`,
    backupHours: (h) => `دعم ليلي نحو ${hAr(h, true)} للأحمال المدعومة`,
    autonomyShort: (d) => `استقلالية ${dAr(d, true)}`, backupShort: (h) => `دعم ليلي ${hAr(h, true)}`,
    notQuoted: 'غير مشمول في عرض السعر هذا',
    controller: (qty, name) => `${qty} × ${name}`,
    generator: (kva) => `${kva} kVA، محسوب للحمل الأقصى وشحن البطاريات`,
    roof: (m2, roof) => `نحو ${m2} م² على ${roof}`,
    energy: (kwh, pct) => `الطلب ${kwh} kWh يوميا · تغطي الطاقة الشمسية ${pct}% على مدار السنة`,
    chartTitle: 'الإنتاج الشمسي الشهري kWh', demand: (v) => `الطلب الشهري ${v} kWh`,
    finance: 'الملخص المالي', year: 'السنة', yearN: (n) => `السنة ${n}`, cumulative: 'التدفق النقدي التراكمي',
    financeNote: (a) =>
      (a.diesel ? `يحتسب التوفير مقارنة بتوليد الديزل بتكلفة ${a.tariff} لكل kWh` : `يحتسب التوفير بتعرفة الشبكة ${a.tariff} لكل kWh`) +
      ` مع زيادة ${a.esc}% سنويا، وتدهور الألواح ${a.deg}% سنويا.` +
      (a.om ? ` يشمل التدفق النقدي التشغيل والصيانة بمبلغ ${a.om} سنويا${a.repl ? `، والاستبدال: ${a.repl}` : ''}.` : '') +
      ` التكلفة المستوية للطاقة الشمسية: ${a.lcoe} لكل kWh. العائد على الاستثمار خلال ${yAr(a.years, true)}: ${a.roi}.`,
    replItem: (item, year, amount) => `${item === 'battery' ? 'البطاريات' : 'الإنفرتر'} في السنة ${year} بمبلغ ${amount}`,
    vsDiesel: 'مقارنة بتوليد الديزل', vsGrid: 'مقارنة بكهرباء الشبكة', savingsDiesel: 'السنة 1 · مقارنة بالديزل',
    boq: 'قائمة المواد والأسعار', pricesIn: (cur) => `جميع الأسعار بعملة ${cur}`,
    cols: { no: '#', item: 'البند', spec: 'المواصفات', qty: 'الكمية', unit: 'الوحدة', unitPrice: 'سعر الوحدة', total: 'المبلغ' },
    subtotal: 'المجموع الفرعي', discount: (pct) => `الخصم ${pct}%`, vat: (pct) => `ضريبة القيمة المضافة ${pct}%`, total: 'الإجمالي', totalInclVat: 'الإجمالي شامل الضريبة',
    terms: 'الشروط والأحكام', notes: 'ملاحظات', accepted: 'موافقة العميل', forCompany: (c) => `عن ${c}`, signature: 'التوقيع', name: 'الاسم',
    page: (i, n) => `صفحة ${i} من ${n}`,
    profiles: { residential: 'سكني', commercial: 'تجاري', daytime: 'نهاري فقط' },
    energyBill: (kwh, profile, pct) => `${kwh} kWh شهريا من فاتورة الكهرباء، استهلاك ${profile} · تغطي الطاقة الشمسية ${pct}% على مدار السنة`,
    energyNone: (prod) => `حجم النظام حدده العميل · نحو ${prod} kWh من الطاقة الشمسية في اليوم المتوسط`,
    energyBackup: 'حجم النظام حدده العميل · نظام احتياطي بالبطاريات دون ألواح شمسية',
    selfUseNote: ' لا توجد بيانات استهلاك: يفترض التوفير استخدام كامل الطاقة الشمسية في الموقع.',
    backupAt: (h, kw) => `${hAr(h)} عند ${kw} kW`, backupAbout: (list) => `مدة احتياط نحو ${list}`,
    tileBackup: 'مدة الاحتياط', tileUsable: (kwh) => `المتاح ${kwh} kWh`, atLoad: (kw) => `عند حمل ${kw} kW`, hours: (h) => hAr(h),
    existingIncl: (n) => `منها ${n} موجودة في الموقع`, existingLine: (n) => `+${n} موجود في الموقع، غير مسعر`,
    existingNote: (list) => `معدات موجودة في الموقع، غير مسعرة: ${list}.`, existingItem: (qty, name) => `${qty} × ${name}`,
    details: 'بيانات العرض', refN: (r) => `المرجع ${r}`, dateN: (d) => `التاريخ ${d}`,
    systemShort: (type, size) => `${type} · ${size}`,
    sysShort: { offgrid: 'منفصل عن الشبكة', hybrid: 'هجين', gridtie: 'متصل بالشبكة' },
    descriptor: (kwp, type) => `نظام ${type} ${kwp} kWp`, descriptorBackup: (kwh) => `احتياطي بطاريات ${kwh} kWh`,
    forCompanyBlank: 'عن الشركة',
    defaultTerms: 'الأسعار صالحة للمدة المذكورة وتخضع لتوفر المخزون. دفعة مقدمة 50% عند الطلب والباقي عند التشغيل. ضمانات المعدات حسب الشركة المصنعة. ضمان أعمال التركيب سنتان. الأعمال المدنية ورسوم توصيل الشبكة والتصاريح غير مشمولة ما لم يذكر خلاف ذلك.',
  },

  file: { proposal: 'العرض-الشامل', quotation: 'عرض-سعر', technical: 'التقرير-الفني-داخلي', workbook: 'الملف-الهندسي-داخلي' },

  tech: {
    title: 'التقرير الفني للتصميم', internal: 'داخلي — ليس للعميل',
    project: 'المشروع', client: 'العميل', site: 'الموقع', systemType: 'نوع النظام', supply: 'التغذية', location: 'الموقع', date: 'التاريخ',
    checks: 'فحوصات التصميم', level: 'الحالة', check: 'الفحص',
    loads: 'تحليل الأحمال', loadCols: ['الجهاز', 'W', 'العدد', 'ساعة/يوم', 'ليلي %', 'بدء ×', 'Wh/يوم'], total: 'الإجمالي',
    loadNote: (a) => `الطلب الأقصى ${a.peak} W بمعامل تزامن ${a.cf} · قدرة البدء ${a.surge} W · الطاقة الليلية ${a.night} Wh يوميا · السنوي ${a.annual} kWh`,
    pv: 'تحجيم الألواح', param: 'البند', value: 'القيمة', basis: 'الأساس',
    psh: 'ساعات الذروة الشمسية', tilted: (h, t) => `${h} على الأفقي، ${t} على السطح المائل`, tiltBasis: (g, deg) => `معامل الميل ×${g}، زاوية الميل ${deg}°`,
    derate: 'معامل الأداء الكلي', requiredPv: 'قدرة الألواح المطلوبة', requiredPvBasis: (o) => `الطاقة اليومية / (ساعات الذروة × معامل الأداء) × ${o}`,
    array: 'المصفوفة', areaWeight: 'المساحة / الوزن', areaBasis: (l, w, kg) => `${l} × ${w} mm، ${kg} kg للوح`,
    production: 'الإنتاج السنوي', specYield: (v) => `${v} kWh/kWp سنويا`,
    losses: 'تفصيل الخسائر', factor: 'المعامل',
    inverter: 'الإنفرتر وتصميم السلاسل', required: 'المطلوب', requiredInvBasis: (s, surge) => `الحمل الأقصى × ${s}؛ قدرة البدء ${surge} kW`,
    selected: 'المختار', invBasis: (a) => `${a.kw} kW، بدء ${a.surge} kW، أقصى ألواح ${a.pv} kW، ${a.mppt} MPPT × ${a.amps} A، ${a.vmin}–${a.vmax} V، الأقصى ${a.vabs} V`,
    dcac: 'نسبة DC/AC', dcacBasis: 'المعتاد 1.1–1.3',
    strings: 'السلاسل', stringsVal: (n, p) => `${n} × ${arCount(p, AR_NOUNS.panel)}`, stringsBasis: (m, s) => `${m} MPPT مستخدمة، ${s} سلسلة لكل MPPT`,
    vocCold: 'Voc عند أدنى حرارة', vocBasis: (t, lim, ok) => `عند ${t} °C، الحد ${lim} V: ${ok ? 'سليم' : 'غير مقبول'}`,
    vmpHot: 'Vmp عند الخلية الساخنة', vmpBasis: (t, lim, ok) => `الخلية نحو ${t} °C، أدنى MPPT ${lim} V: ${ok ? 'سليم' : 'غير مقبول'}`,
    isc: 'تيار Isc للسلسلة', iscBasis: (lim, ok) => `حد مدخل MPPT ${lim} A: ${ok ? 'سليم' : 'غير مقبول'}`,
    battery: 'بنك البطاريات', battRequired: (base, d, dod, eff) => `${base} × ${dAr(d)} / (عمق التفريغ ${dod}% × كفاءة الإنفرتر ${eff})`,
    dailyEnergy: 'الطاقة اليومية', criticalNight: 'الطاقة الليلية المدعومة',
    bank: 'البنك', bankBasis: (s, p, kwh, ah, v) => `${s}S × ${p}P · ${kwh} kWh · ${ah} Ah عند ${v} V`,
    usable: 'المتاح / الاستقلالية', controller: 'منظم الشحن', ctrlBasis: (a) => `المطلوب ${a} A`, generator: 'المولد', genBasis: 'الحمل الأقصى × 1.25 + الشاحن، معامل قدرة 0.8',
    cables: 'جدول الكابلات والحماية', cableCols: ['الدائرة', 'التيار', 'الجهد', 'الطول', 'الكابل', 'الهبوط', 'الحماية'],
    cableNote: 'هبوط الجهد: Vd = 2·L·I·rho/A، وللثلاثي sqrt(3)·L·I·rho/A، حيث rho = 0.0206 ohm·mm²/m للنحاس عند 70 °C. تخفيض سعة التيار ×0.87 لحرارة محيط 40 °C. فيوزات الألواح 1.56 × Isc، وحماية البطارية وAC بمقدار 1.25 × I. المراجع: IEC 62548 وIEC 60364-5-52 وNEC 690.',
    protection: 'أجهزة الحماية', protRows: {
      stringFuse: 'فيوز سلسلة الألواح', arrayFuse: 'فيوز مصفوفة الألواح', dcIsolator: 'مفتاح فصل DC', spdDc: 'واقي الجهد الزائد DC', batteryFuse: 'فيوز البطارية',
      acInv: 'قاطع AC لكل إنفرتر', acMain: 'قاطع AC الرئيسي', gen: 'قاطع المولد', rcd: 'قاطع التيار المتبقي RCD', changeover: 'مفتاح التحويل',
    }, manual: 'يدوي', ats: 'تلقائي ATS', nonStd: 'أعلى من أكبر قيمة قياسية', iz: 'Iz',
    pricing: 'ملخص التسعير الداخلي', pricingRows: {
      equipment: 'المعدات بسعر التكلفة', services: 'الخدمات بسعر التكلفة', cost: 'إجمالي التكلفة', markup: (p) => `الإضافة على التكلفة ${p}%`, sell: 'سعر البيع قبل الخصم',
      margin: 'هامش الربح الإجمالي', discount: (p) => `الخصم ${p}%`, vat: (p) => `ضريبة القيمة المضافة ${p}%`, total: 'الإجمالي للعميل',
    },
    costedBom: 'قائمة المواد بالتكلفة والبيع', costCols: ['#', 'البند', 'الكمية', 'الوحدة', 'تكلفة الوحدة', 'التكلفة', 'سعر الوحدة', 'السعر'],
    bill: 'الطلب من فاتورة الكهرباء', billRows: {
      monthly: 'الاستهلاك الشهري', daily: 'الطاقة اليومية', profile: 'نمط الاستهلاك', night: 'نسبة الاستهلاك الليلي', peak: 'الطلب الأقصى', motor: 'أكبر محرك', surge: 'قدرة البدء',
    }, given: 'مقاس أو متعاقد عليه', estimated: 'مقدر من نمط الاستهلاك', noMotor: 'لا يوجد', whPerDay: (v) => `${v} Wh يوميا`,
    billNote: 'لا توجد قائمة أجهزة: الطاقة اليومية والنسبة الليلية والطلب الأقصى محسوبة من الفاتورة الشهرية ونمط الاستهلاك.',
    basisTitle: 'أساس التحجيم', noDemand: (sizes) => `لا توجد بيانات استهلاك: حدد العميل حجم النظام (${sizes}).`, assumeSelfUse: ' يفترض التوفير استخدام كامل الطاقة الشمسية في الموقع.',
    noPv: 'لا توجد مصفوفة ألواح: احتياطي بالبطاريات فقط.',
    fixedPv: (kwp) => `محدد بقدرة ${kwp} kWp من العميل`, pvFromInv: (kw, r) => `الإنفرتر ${kw} kW × نسبة DC/AC ${r}`,
    fixedInv: (kw) => `محدد بقدرة ${kw} kW من العميل`, invFromPv: (kwp, r) => `الألواح ${kwp} kWp ÷ نسبة DC/AC ${r}`,
    fixedBatt: (kwh) => `محدد بسعة اسمية ${kwh} kWh من العميل`,
    existing: 'موجود في الموقع', existingVal: (parts) => `${parts}، محسوبة في التصميم وغير مسعرة`,
    existingParts: { panels: (n) => arCount(String(n), AR_NOUNS.panel), batteries: (n) => arCount(String(n), AR_NOUNS.battery), inverters: (n) => arCount(String(n), AR_NOUNS.inverter) },
  },

  xl: {
    sheets: { summary: 'الملخص', loads: 'الأحمال', sizing: 'التحجيم', production: 'الإنتاج', bom: 'قائمة المواد', economics: 'الجدوى الاقتصادية' },
    param: 'البند', value: 'القيمة', unit: 'الوحدة', note: 'المعادلة / ملاحظة',
    summary: {
      client: 'العميل', site: 'عنوان الموقع', systemType: 'نوع النظام', phase: 'التغذية', location: 'الموقع', psh: 'ساعات الذروة الشمسية على الأفقي', tilt: 'معامل كسب الميل',
      daily: 'الطلب اليومي على الطاقة', annual: 'الطلب السنوي', peak: 'الطلب الأقصى', surge: 'قدرة بدء التشغيل', derate: 'معامل الأداء الكلي', requiredPv: 'قدرة الألواح المطلوبة', array: 'مصفوفة الألواح',
      panels: 'الألواح', area: 'مساحة المصفوفة', production: 'الإنتاج السنوي', yield: 'الإنتاجية النوعية', battery: 'بنك البطاريات', battUnits: 'عدد البطاريات', usable: 'السعة المتاحة', autonomy: 'الاستقلالية',
      inverter: 'الإنفرتر', invCap: 'قدرة الإنفرتر', generator: 'المولد',
      pricing: 'التسعير', equipment: 'المعدات بسعر التكلفة', services: 'الخدمات بسعر التكلفة', cost: 'إجمالي التكلفة', markupPct: 'نسبة الإضافة على التكلفة', markup: 'قيمة الإضافة', sell: 'سعر البيع قبل الخصم',
      margin: 'هامش الربح الإجمالي', discount: 'الخصم', vat: 'ضريبة القيمة المضافة', total: 'السعر الإجمالي شامل الضريبة', perWp: 'السعر لكل واط ذروة', savings: 'التوفير السنوي في السنة الأولى', payback: 'فترة الاسترداد البسيطة', lcoe: 'التكلفة المستوية للطاقة', roi: 'العائد على الاستثمار', co2: 'انبعاثات CO₂ المتجنبة',
      checks: 'فحوصات التصميم', om: 'التشغيل والصيانة سنويا', npv: 'صافي القيمة الحالية', repl: 'الاستبدال ضمن التدفق النقدي', basis: 'أساس احتساب التوفير',
    },
    u: { kwhDay: 'kWh/يوم', kwhYr: 'kWh/سنة', w: 'W', kwp: 'kWp', m2: 'م²', kwh: 'kWh', kw: 'kW', kva: 'kVA', years: 'سنة', days: 'يوم', tYr: 'طن/سنة', pcs: 'قطعة', h: 'ساعة', perKwh: '/kWh' },
    loadsTitle: 'تحليل الأحمال', loadsSub: 'عدل القدرة أو العدد أو الساعات وستحدث المجاميع تلقائيا',
    loadCols: ['الجهاز', 'الفئة', 'القدرة W', 'العدد', 'ساعة/يوم', 'ليلي %', 'معامل البدء', 'Wh/يوم', 'Wh ليلا', 'مدعوم'],
    total: 'الإجمالي', dailyKwh: 'الطاقة اليومية kWh', peakRow: 'الطلب الأقصى W = الحمل الموصول × معامل التزامن',
    sizingTitle: 'تحجيم النظام', sizingSub: 'المعادلات تشير إلى خلايا الإدخال في العمود B',
    sz: {
      daily: 'الطلب اليومي على الطاقة', fromLoads: 'من ورقة الأحمال', psh: 'ساعات الذروة الشمسية على الأفقي', tilt: 'معامل كسب الميل', tiltNote: '1 + 0.0045 × |خط العرض|، بين 1.0 و1.3',
      derate: 'معامل الأداء الكلي', oversize: 'معامل زيادة الألواح', requiredPv: 'قدرة الألواح المطلوبة', requiredPvNote: 'الطاقة / (ساعات الذروة × الميل × الأداء) × الزيادة', moduleW: 'قدرة اللوح',
      panelsTheory: 'عدد الألواح النظري', panelsTheoryNote: 'قبل التقريب للسلاسل', panelsFinal: 'عدد الألواح النهائي', stringsNote: (s, p) => `${s} سلسلة × ${p}`, array: 'حجم المصفوفة',
      autonomy: 'الاستقلالية', dod: 'عمق التفريغ', dodNote: 'حسب نوع البطارية أو قيمة يدوية', eff: 'كفاءة الإنفرتر من البطارية', base: 'الطاقة من البطارية يوميا', baseHybrid: 'الطاقة الليلية المدعومة يوميا',
      reqStorage: 'التخزين المطلوب', reqStorageNote: 'الطاقة × الاستقلالية / (عمق التفريغ × الكفاءة)', bank: 'بنك البطاريات', bankNote: (q, s, p, ah) => `${q} وحدة · ${s}S × ${p}P · ${ah} Ah`, usable: 'السعة المتاحة',
      peak: 'الطلب الأقصى', safety: 'معامل أمان الإنفرتر', reqInv: 'الإنفرتر المطلوب', selInv: 'الإنفرتر المختار', invNote: (kw, surge, pv) => `${kw} kW · بدء ${surge} kW · أقصى ألواح ${pv} kW`,
      strings: 'تصميم السلاسل', pps: 'ألواح لكل سلسلة', nStrings: 'السلاسل', voc: 'جهد Voc للسلسلة عند أدنى حرارة', vocNote: (v) => `Voc × (1 + beta × (Tmin − 25)) × n <= ${v} V`,
      vmp: 'جهد Vmp للسلسلة عند الخلية الساخنة', vmpNote: (v) => `>= أدنى MPPT ${v} V`, isc: 'تيار Isc للسلسلة', iscNote: (a) => `<= مدخل MPPT ${a} A`,
      cables: 'جدول الكابلات', cableCols: ['الدائرة', 'التيار A', 'الطول م', 'الكابل / الهبوط / الحماية'], cableDesc: (mm, awg, drop, a, prot) => `${mm} mm² (AWG ${awg}) · هبوط ${drop}% · ${a} A ${prot}`,
    },
    prodTitle: 'الإنتاج الشهري مقابل الطلب', prodSub: 'الإنتاج = المصفوفة × ساعات الذروة × كسب الميل × معامل الأداء × الأيام', arrayKwp: 'المصفوفة kWp', derate: 'معامل الأداء الكلي', prodCols: ['الشهر', 'ساعات الذروة', 'كسب الميل', 'الأيام', 'الإنتاج kWh', 'الطلب kWh', 'التغطية'], year: 'السنة',
    bomTitle: (cur) => `قائمة المواد ${cur}`, bomSub: 'داخلي: التكلفة والإضافة وأسعار البيع. عدل الكمية أو التكلفة أو خلية الإضافة وستحدث المجاميع.',
    bomCols: ['#', 'الفئة', 'البند', 'المواصفات', 'الوحدة', 'الكمية', 'تكلفة الوحدة', 'إجمالي التكلفة', 'سعر الوحدة', 'إجمالي السعر'],
    markupCell: 'الإضافة على التكلفة (إدخال)', planner: (v) => `قيمة المخطط: ${v}`, discountIn: 'الخصم (إدخال %)', vatIn: 'الضريبة (إدخال %)', costSubtotal: 'إجمالي التكلفة', sellSubtotal: 'المجموع الفرعي بسعر البيع', markup: 'قيمة الإضافة', grossMargin: 'هامش الربح الإجمالي', discount: (p) => `الخصم ${p}%`, vat: (p) => `ضريبة القيمة المضافة ${p}%`, grandTotal: 'الإجمالي النهائي',
    ecoTitle: (n) => `التدفق النقدي خلال ${yAr(String(n), true)}`, ecoSub: (tariff, esc, deg, diesel) => `${diesel ? 'تكلفة توليد الديزل' : 'تعرفة الشبكة'} ${tariff} لكل kWh، زيادة ${esc}% سنويا، تدهور ${deg}% سنويا، بعد خصم التشغيل والصيانة والاستبدال`,
    ecoCols: (cur) => ['السنة', 'الإنتاج kWh', `صافي التدفق ${cur}`, `التراكمي ${cur}`],
    quoteSheet: 'عرض سعر', quoteSub: (who) => `${who} · التكلفة والإضافة وأسعار البيع. عدل الكمية أو التكلفة أو خلية الإضافة وستحدث المجاميع.`,
    demandBasis: 'أساس الطلب', basis: { loads: 'قائمة الأجهزة', bill: 'فاتورة الكهرباء', none: 'حجم النظام حدده العميل' },
    billTitle: 'الطلب من فاتورة الكهرباء', billSub: 'لا توجد قائمة أجهزة: عدل الاستهلاك الشهري في الخلية الصفراء وستحدث الطاقة اليومية',
    billRows: { monthly: 'الاستهلاك الشهري', daily: 'الطاقة اليومية', profile: 'نمط الاستهلاك', night: 'نسبة الاستهلاك الليلي', nightKwh: 'الطاقة الليلية', peak: 'الطلب الأقصى', motor: 'أكبر محرك', surge: 'قدرة البدء' },
    given: 'مقاس أو متعاقد عليه', estimated: 'مقدر من نمط الاستهلاك',
    fromBill: 'من فاتورة الكهرباء، ورقة الأحمال', noData: 'لا توجد بيانات استهلاك', fixed: 'محدد من العميل', noPv: 'لا توجد مصفوفة ألواح: احتياطي بالبطاريات فقط',
    prodColsNoDemand: ['الشهر', 'ساعات الذروة', 'كسب الميل', 'الأيام', 'الإنتاج kWh'],
    existingSpec: (n) => `+${n} موجود في الموقع، غير مسعر`,
  },

  ui: {
    readiness: 'قبل الإرسال', ready: 'جاهز للإرسال', notReady: (n) => (n === 1 ? 'بند واحد يحتاج مراجعة' : n === 2 ? 'بندان يحتاجان مراجعة' : `${n} بنود تحتاج مراجعة`),
    client: 'اسم العميل', clientOk: (n) => n, clientMissing: 'أضف اسم العميل',
    loads: 'قائمة الأجهزة', loadsOk: (n, kwh) => `${n} جهاز · ${kwh} kWh يوميا`, loadsMissing: 'لا توجد أجهزة بعد',
    checks: 'فحوصات التصميم', checksOk: 'لا توجد مشكلات تمنع الإرسال', checksErr: (n) => (n === 1 ? 'مشكلة واحدة يجب إصلاحها' : `${n} مشكلات يجب إصلاحها`),
    company: 'اسم الشركة', companyOk: (n) => n, companyMissing: 'لم يتم إدخال اسم الشركة — لن يظهر في المستندات. أضفه من الإعدادات.',
    fx: 'سعر الصرف', fxOk: (cur, v) => `1 USD = ${v} ${cur}`, fxMissing: (cur) => `1 USD = 1 ${cur}: أدخل سعر اليوم`,
    fix: 'إصلاح', open: 'فتح', settings: 'الإعدادات',
    docLang: 'لغة المستند', english: 'English', arabic: 'العربية',
    proposal: 'العرض الشامل للعميل (PDF)', proposalHelp: 'عرض بهوية شركتك: ملخص النظام والتوفير وقائمة المواد بالأسعار والشروط. يظهر أسعار البيع فقط، بدون التكلفة أو الإضافة.',
    proposalNotReady: 'أصلح البنود أعلاه قبل إرسال العرض للعميل.',
    team: 'لفريقك', internal: 'داخلي — يتضمن أسعار التكلفة', clientSafe: 'للعميل',
    shareInternalTitle: 'مشاركة مستند داخلي؟',
    shareInternalBody: (doc) => `يتضمن ${doc} أسعار التكلفة والإضافة وهامش الربح. شاركه مع فريقك فقط ولا ترسله إلى العميل.`,
    shareInternalConfirm: 'مشاركة على أي حال',
    tech: 'التقرير الفني (PDF)', techHelp: 'فحوصات التصميم، تصميم السلاسل والكابلات، تفصيل الخسائر، مع التكلفة والإضافة وهامش الربح.',
    excel: 'الملف الهندسي (Excel)', excelHelp: 'الأحمال، التحجيم، الإنتاج، قائمة المواد بالتكلفة ومعادلات حية، والتدفق النقدي.',
    json: 'ملف المشروع (JSON)', jsonHelp: 'نسخة احتياطية، أو أرسله لزميل ليستورده من صفحة المشاريع.', backup: 'نسخة احتياطية',
    share: 'مشاركة', download: 'تنزيل', shareNow: 'اضغط للمشاركة', preparing: 'جار التجهيز…', downloaded: (f) => `تم تنزيل ${f}`, shared: 'تمت المشاركة',
    failed: 'تعذر إنشاء الملف. حاول مرة أخرى.', fontFailed: 'تعذر تحميل خط ملف PDF. تحقق من الاتصال وحاول مرة أخرى.',
    summary: 'الملخص', markQuoted: 'تحديد المشروع كمسعر', markedQuoted: 'تم تحديد المشروع كمسعر', moreActions: 'تنزيل بدلا من ذلك',
  },
}

export const exportLabels: Record<ExportLang, ExportLabels> = { en, ar }
