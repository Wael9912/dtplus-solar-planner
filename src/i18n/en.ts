export const en = {
  appName: 'DT+ Solar Planner', tagline: 'Step-by-step solar design, sizing & quotation', by: 'Product developed by DT+',
  nav: { projects: 'Projects', settings: 'Company settings', newProject: 'New project', back: 'Back', next: 'Next', finish: 'Finish', save: 'Saved', language: 'العربية' },
  steps: { info: 'Project', loads: 'Loads', site: 'Site & sun', design: 'System', results: 'Sizing', bom: 'Bill of materials', export: 'Export' },
  stepHelp: {
    info: 'Who is this project for and what kind of system do they need?',
    loads: 'List every appliance the system must power. Energy per day drives panel count; peak power drives inverter size; night share drives battery size.',
    site: 'Pick the nearest city for sun hours, or enter your own. Tilt and shading adjust the usable energy.',
    design: 'Choose the system voltage, autonomy and equipment. Leave on Auto to let the planner recommend.',
    results: 'Engineering summary. Amber warnings are worth a look; red items must be fixed before quoting.',
    bom: 'Every item needed for installation with quantities and prices. Edit any price or quantity, add custom lines, set margin and VAT.',
    export: 'Download the client proposal (PDF) and the engineering workbook (Excel), or save the project file.',
  },
  info: {
    name: 'Project name', client: 'Client name', phone: 'Phone', email: 'Email', address: 'Site address', reference: 'Quote reference', notes: 'Notes',
    systemType: 'System type', offgrid: 'Off-grid', hybrid: 'Hybrid (grid + battery backup)', gridtie: 'Grid-tied (no battery)',
    offgridHelp: 'No grid available. Batteries carry all night loads; full autonomy.', hybridHelp: 'Grid present but unreliable. PV + battery back up selected loads.', gridtieHelp: 'Reliable grid. PV reduces the bill; no storage.',
    phase: 'Supply phase', single: 'Single-phase 230 V', three: 'Three-phase 400 V', status: 'Status',
    statuses: { draft: 'Draft', quoted: 'Quoted', approved: 'Approved', installed: 'Installed' },
  },
  loads: {
    add: 'Add appliance', library: 'Appliance library', custom: 'Custom appliance', search: 'Search appliances…', name: 'Appliance', watts: 'Watts', qty: 'Qty', hours: 'Hours/day', night: 'Night %', surge: 'Surge ×', critical: 'Backup', phase: 'Phase', daily: 'Wh/day', empty: 'No loads yet. Add appliances from the library or create a custom one.',
    totalDaily: 'Daily energy', connected: 'Connected load', peak: 'Peak demand', surgeW: 'Starting surge', nightEnergy: 'Night energy', monthly: 'Monthly', coincidence: 'Coincidence factor', coincidenceHelp: 'Fraction of connected load expected to run at the same time (0.6–0.8 homes, 0.8–1.0 shops/workshops).',
    templates: 'Quick templates', tplSmallHome: 'Small home', tplFamilyHome: 'Family home with AC', tplShop: 'Shop / office', tplFarm: 'Farm pump', tplClinic: 'Clinic', clear: 'Clear all', criticalHelp: 'Hybrid only: items ticked here are backed up by battery; others run on grid/PV only.',
  },
  site: {
    location: 'Location', custom: 'Custom location', psh: 'Peak sun hours (kWh/m²/day)', monthly: 'Monthly sun hours', tilt: 'Tilt (°)', azimuth: 'Azimuth (° from south)', tiltGain: 'Tilt gain factor', ambient: 'Design ambient high (°C)', ambientAvg: 'Average daytime high (°C)', recordLow: 'Record low (°C)',
    shading: 'Shading loss %', soiling: 'Soiling / dust loss %', roof: 'Mounting surface', roofs: { 'flat-concrete': 'Flat concrete roof', 'pitched-tile': 'Pitched tile roof', 'metal-sheet': 'Metal sheet roof', ground: 'Ground mount' },
    area: 'Available area (m²)', tariff: 'Grid / diesel tariff (USD per kWh)', tariffHelp: 'Used for savings and payback. For off-grid sites enter the cost of the diesel alternative (typically 0.40–0.60).', emission: 'Grid CO₂ factor (kg/kWh)', currency: 'Display currency', fx: 'Local units per 1 USD', region: 'Region',
  },
  design: {
    voltage: 'Battery system voltage', autonomy: 'Autonomy (days)', autonomyHelp: 'Off-grid: days the battery must carry the full load without sun (1–3). Hybrid: nights of backup for critical loads (0.5–1.5).', dod: 'Depth of discharge override %',
    panel: 'PV module', battery: 'Battery', inverter: 'Inverter', controller: 'Separate MPPT charge controller', auto: 'Auto-recommend', inverterQty: 'Inverter units (parallel)', pvOversize: 'PV oversize factor', inverterSafety: 'Inverter safety factor', dcAc: 'DC/AC ratio',
    dcRun: 'DC cable run (m, one way)', battRun: 'Battery cable run (m)', acRun: 'AC cable run (m)', drop: 'Max voltage drop %', generator: 'Include generator backup', generatorKva: 'Generator size (kVA, blank = auto)', degradation: 'Module degradation %/yr', years: 'Analysis horizon (years)',
    panelQty: 'Panel quantity override', battQty: 'Battery quantity override', recommended: 'Recommended', none: 'None',
  },
  results: {
    summary: 'System summary', pv: 'PV array', battery: 'Battery bank', inverter: 'Inverter', strings: 'String design', cables: 'Cables & protection', energy: 'Energy balance', derate: 'Loss breakdown', checks: 'Design checks', economics: 'Economics',
    requiredPv: 'Required PV', arraySize: 'Array size', panels: 'Panels', area: 'Roof area', weight: 'Array weight', yield: 'Specific yield', annualProd: 'Annual production', coverage: 'Demand coverage',
    reqBatt: 'Required storage', bankSize: 'Bank size', usable: 'Usable', units: 'Units', config: 'Configuration', backupHours: 'Backup at night load',
    reqInv: 'Required inverter', selected: 'Selected', surgeCheck: 'Surge capacity', ctrl: 'Charge controller',
    pps: 'Panels / string', nStrings: 'Strings', vocCold: 'Max Voc (cold)', vmpHot: 'Min Vmp (hot)', mppt: 'MPPTs used', use: 'Circuit', current: 'Current', length: 'Run', size: 'Cable', drop: 'Drop', protection: 'Fuse / breaker',
    dc: 'PV string DC', batt: 'Battery DC', ac: 'Inverter AC output', months: 'Monthly production vs demand', production: 'Production', demand: 'Demand', generator: 'Generator',
    total: 'Total price', perWp: 'Price per Wp', savings: 'Annual savings', payback: 'Simple payback', lcoe: 'LCOE', co2: 'CO₂ avoided / yr', roi: '25-yr ROI', lifetime: 'Lifetime production', cashflow: 'Cumulative cash flow', years: 'years', tons: 't',
  },
  bom: {
    item: 'Item', spec: 'Specification', unit: 'Unit', qty: 'Qty', unitPrice: 'Unit price', total: 'Total', category: 'Category', addCustom: 'Add custom line', exclude: 'Exclude', include: 'Include', reset: 'Reset to auto',
    equipment: 'Equipment', services: 'Services', subtotal: 'Subtotal', margin: 'Margin', discount: 'Discount', vat: 'VAT', grand: 'Grand total', labourPerKw: 'Labour per kWp (USD)', transport: 'Transport (USD)', commissioning: 'Commissioning (USD)',
    excludedNote: 'items excluded', pricesNote: 'Catalog prices are indicative wholesale USD figures; override them with your supplier prices.',
  },
  export: {
    pdf: 'Client proposal (PDF)', pdfHelp: 'Branded quotation with system summary, savings, bill of materials and terms.', excel: 'Engineering workbook (Excel)', excelHelp: 'Loads, sizing, strings, cables, BOM with live formulas, monthly production.', json: 'Project file (JSON)', jsonHelp: 'Backup or share with a colleague; import from the Projects page.', print: 'Print', generating: 'Generating…', techPdf: 'Technical datasheet (PDF)', techHelp: 'Engineering-only report: string design, cable schedule, checks and loss breakdown.',
  },
  projects: {
    title: 'Projects', empty: 'No projects yet. Create your first solar project.', search: 'Search projects…', import: 'Import JSON', duplicate: 'Duplicate', delete: 'Delete', open: 'Open', confirmDelete: 'Delete this project? This cannot be undone.', created: 'Created', updated: 'Updated', client: 'Client', size: 'Size', total: 'Total', yes: 'Yes, delete', no: 'Cancel', sample: 'Load sample projects',
  },
  settings: {
    title: 'Company settings', company: 'Company name', tagline: 'Tagline', phone: 'Phone', email: 'Email', website: 'Website', address: 'Address', logo: 'Logo', upload: 'Upload logo', remove: 'Remove', color: 'Brand colour', validity: 'Quote validity (days)', terms: 'Terms & conditions', saved: 'Settings saved', currency: 'Default currency', fx: 'Local units per USD', margin: 'Default margin %', vat: 'Default VAT %',
  },
  common: { usd: 'USD', kwh: 'kWh', kw: 'kW', kwp: 'kWp', wh: 'Wh', w: 'W', v: 'V', a: 'A', m2: 'm²', kg: 'kg', day: '/day', ok: 'OK', warn: 'Check', error: 'Fix', pcs: 'pcs', m: 'm', lot: 'lot', actions: 'Actions', remove: 'Remove', edit: 'Edit', close: 'Close', apply: 'Apply', cancel: 'Cancel' },
}
export type Dict = typeof en
