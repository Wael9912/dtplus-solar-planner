// UI strings of the outputs module (Results, Pricing, Export steps). `outputsEn` is the type source; `outputsAr` must have the same
// keys and function signatures. Wired into the main dictionaries as `t.outputs` (see en.ts / ar.ts).
// Arabic: MSA, Western digits, Latin SI units; numbers + units inside Arabic sentences sit in first-strong isolates (as in ar.ts).

/** First-strong isolate: keeps a number + Latin unit/model code in one LTR island inside an Arabic sentence. */
const I = (x: string) => '\u2068' + x + '\u2069'
/** Arabic hours: 1 ساعة, 2 ساعتان, 3–10 ساعات, 11–99 ساعة (fractions singular). */
const hoursAr = (h: string) => {
  const n = h.replace(/,/g, ''), v = Number(n), r = v % 100
  if (!/^\d+$/.test(n)) return `${I(h)} ساعة`
  return v === 2 ? 'ساعتان' : r >= 3 && r <= 10 ? `${I(h)} ساعات` : `${I(h)} ساعة`
}
const yearsAr = (y: string) => {
  const n = y.replace(/,/g, ''), v = Number(n), r = v % 100
  if (!/^\d+$/.test(n)) return `${I(y)} سنة`
  return v === 2 ? 'سنتان' : r >= 3 && r <= 10 ? `${I(y)} سنوات` : `${I(y)} سنة`
}

export const outputsEn = {
  results: {
    sentenceNoDemand: (x: { pv: string; batt: string | null; inv: string; type: string; prod: string }) =>
      `A ${x.pv} kWp solar array${x.batt ? ` with ${x.batt} kWh of battery storage` : ''} and a ${x.inv} kW ${x.type} inverter. It produces about ${x.prod} kWh on an average day.`,
    sentenceBackup: (x: { batt: string | null; usable: string; inv: string; type: string }) =>
      x.batt ? `Battery backup without solar panels: ${x.batt} kWh of storage (${x.usable} kWh usable) and a ${x.inv} kW ${x.type} inverter.`
        : `A ${x.inv} kW ${x.type} inverter without solar panels or batteries.`,
    sizeChosen: 'System size chosen by the client.', monthlyProduction: 'Monthly solar production',
    fromBill: (kwh: string, profile: string) => `From the electricity bill: ${kwh} kWh/month · ${profile} profile`,
    profiles: { residential: 'residential', commercial: 'commercial', daytime: 'daytime-only' } as Record<string, string>,
    backup: 'Backup time', backupAt: (kw: string) => `at ${kw} kW`, loadKw: (kw: string) => `${kw} kW load`,
    backupHelp: 'Usable storage divided by the load, after inverter losses. The real time depends on what runs during the outage.',
    backupCol: { load: 'Load', time: 'Backup time', example: 'Typical use' },
    backupExamples: ['Lights, TV, router, fridge', 'Home essentials + a fan or two', 'A 1.5 hp air conditioner + essentials', 'Inverter at full power'],
    hoursShort: (h: string) => `${h} h`, overDays: 'more than 3 days',
    demand: 'Demand', monthlyBill: 'Monthly consumption', dailyEnergy: 'Daily energy', profile: 'Usage profile', nightShare: 'Used at night', peak: 'Peak demand', surge: 'Starting surge',
    setByClient: 'set by the client', fromArray: (kwp: string, r: string) => `PV ${kwp} kWp ÷ DC/AC ${r}`, fromInverter: (kw: string, r: string) => `inverter ${kw} kW × DC/AC ${r}`,
    noPv: 'No solar panels (battery backup only)',
  },
  bom: {
    addProducts: 'Add products', addFromCatalog: 'Add from catalogue', addCustomShort: 'Custom line',
    pickerTitle: 'Add from catalogue', pickerHelp: 'Your price list: tap a product to add it, tap again to add one more.',
    search: 'Search brand, model or size', clearSearch: 'Clear search',
    tabs: { all: 'All', panels: 'Panels', inverters: 'Inverters', batteries: 'Batteries', controllers: 'Controllers', items: 'Accessories', own: 'Your products' },
    noResults: 'No products match your search.', showing: (n: number, total: number) => `Showing ${n} of ${total}. Refine the search to see more.`,
    inQuote: (n: number) => `${n} in quote`, added: (name: string, n: number) => `${name}: ${n} in quote`, own: 'Your product', noPrice: 'no price',
    emptyTitle: 'Add the products to quote', emptyBody: 'Pick panels, inverters, batteries and accessories from your price list, or type a line of your own.',
    existing: (n: number) => `+${n} already on site (not quoted)`,
    currency: 'Currency', fx: 'Exchange rate', fxLabel: (cur: string) => `1 USD = … ${cur}`, fxIndicative: 'Indicative rate filled in. Confirm today’s rate.',
  },
  export: {
    quotation: 'Quotation (PDF)', quotationHelp: 'Prices only: itemised list, totals, your note to the client, terms and signatures. No sizing pages.',
    // Savings & payback section of the client proposal (project.proposalFinance)
    finance: 'Savings & payback in the proposal', financeOpts: { auto: 'Auto', on: 'On', off: 'Off' },
    financeAutoShown: (years: string) => `Shown: payback ${years} years.`,
    financePayback: (years: string, tariff: string) => `Hidden: payback ${years} years at a ${tariff}/kWh tariff.`,
    financeNoSavings: (tariff: string) => `Hidden: no savings at a ${tariff}/kWh tariff.`,
    financeHint: { hybrid: 'Set outage hours or the tariff on the Site step.', gridtie: 'Check the tariff on the Site step.', offgrid: 'Check the diesel cost on the Site step.' } as Record<string, string>,
    financeOnNote: 'The proposal shows savings, payback and the cash flow.', financeOffNote: 'The proposal leaves out savings, payback and the cash flow.',
    financeFix: 'Site step',
    proposalHelpSize: 'Branded proposal: the system the client chose, production and savings, priced bill of materials and terms. Selling prices only.',
    alsoForClient: 'Also for the client',
    excelItems: 'Price workbook (Excel)', excelItemsHelp: 'The quoted products with cost, markup and selling price, with live formulas.',
    products: 'Products', productsOk: (n: number, total: string) => `${n} ${n === 1 ? 'line' : 'lines'} · ${total}`, productsMissing: 'No products yet',
    bill: 'Electricity bill', billOk: (kwh: string, profile: string) => `${kwh} kWh/month · ${profile}`, billMissing: 'Enter the monthly consumption',
    system: 'System size', systemMissing: 'No equipment selected',
    clientOptional: 'Optional. Add it to address the quote to the client',
  },
}

export const outputsAr: typeof outputsEn = {
  results: {
    sentenceNoDemand: (x) =>
      `مصفوفة ألواح شمسية بقدرة ${I(x.pv + ' kWp')}${x.batt ? ` مع بطاريات تخزين بسعة ${I(x.batt + ' kWh')}` : ''} وإنفرتر ${x.type} بقدرة ${I(x.inv + ' kW')}. تنتج نحو ${I(x.prod + ' kWh')} في اليوم المتوسط.`,
    sentenceBackup: (x) =>
      x.batt ? `نظام احتياطي بالبطاريات دون ألواح شمسية: سعة تخزين ${I(x.batt + ' kWh')} (المتاح منها ${I(x.usable + ' kWh')}) وإنفرتر ${x.type} بقدرة ${I(x.inv + ' kW')}.`
        : `إنفرتر ${x.type} بقدرة ${I(x.inv + ' kW')} دون ألواح شمسية أو بطاريات.`,
    sizeChosen: 'حجم النظام حدده العميل.', monthlyProduction: 'الإنتاج الشمسي الشهري',
    fromBill: (kwh, profile) => `من فاتورة الكهرباء: ${I(kwh + ' kWh')} شهرياً · نمط استهلاك ${profile}`,
    profiles: { residential: 'سكني', commercial: 'تجاري', daytime: 'نهاري فقط' },
    backup: 'مدة الاحتياط', backupAt: (kw) => `عند حمل ${I(kw + ' kW')}`, loadKw: (kw) => `حمل ${I(kw + ' kW')}`,
    backupHelp: 'السعة المتاحة مقسومة على الحمل بعد خسائر الإنفرتر. المدة الفعلية تعتمد على الأجهزة التي تعمل أثناء الانقطاع.',
    backupCol: { load: 'الحمل', time: 'مدة الاحتياط', example: 'استخدام نموذجي' },
    backupExamples: ['إنارة وتلفاز وراوتر وثلاجة', 'الأساسيات المنزلية مع مروحة أو اثنتين', 'مكيف 1.5 حصان مع الأساسيات', 'الإنفرتر بكامل قدرته'],
    hoursShort: (h) => hoursAr(h), overDays: 'أكثر من 3 أيام',
    demand: 'الطلب على الطاقة', monthlyBill: 'الاستهلاك الشهري', dailyEnergy: 'الطاقة اليومية', profile: 'نمط الاستهلاك', nightShare: 'الاستهلاك الليلي', peak: 'الطلب الأقصى', surge: 'قدرة البدء',
    setByClient: 'حدده العميل', fromArray: (kwp, r) => I(`PV ${kwp} kWp ÷ DC/AC ${r}`), fromInverter: (kw, r) => `الإنفرتر ${I(`${kw} kW × DC/AC ${r}`)}`,
    noPv: 'بدون ألواح شمسية (احتياطي بالبطاريات فقط)',
  },
  bom: {
    addProducts: 'إضافة منتجات', addFromCatalog: 'إضافة من الكتالوج', addCustomShort: 'بند مخصص',
    pickerTitle: 'إضافة من الكتالوج', pickerHelp: 'قائمة أسعارك: اضغط على المنتج لإضافته، واضغط مرة أخرى لزيادة الكمية.',
    search: 'ابحث بالماركة أو الموديل أو المقاس', clearSearch: 'مسح البحث',
    tabs: { all: 'الكل', panels: 'الألواح', inverters: 'الإنفرترات', batteries: 'البطاريات', controllers: 'منظمات الشحن', items: 'الملحقات', own: 'منتجاتك' },
    noResults: 'لا توجد منتجات مطابقة للبحث.', showing: (n, total) => `يظهر ${n} من ${total}. حدّد البحث لعرض المزيد.`,
    inQuote: (n) => `في العرض: ${n}`, added: (name, n) => `${name}، في العرض: ${n}`, own: 'منتجك', noPrice: 'بدون سعر',
    emptyTitle: 'أضف المنتجات المطلوب تسعيرها', emptyBody: 'اختر الألواح والإنفرترات والبطاريات والملحقات من قائمة أسعارك، أو اكتب بنداً خاصاً بك.',
    existing: (n) => `+${n} موجود في الموقع (غير مسعّر)`,
    currency: 'العملة', fx: 'سعر الصرف', fxLabel: (cur) => `1 USD = … ${cur}`, fxIndicative: 'تم إدخال سعر تقريبي. تأكد من سعر اليوم.',
  },
  export: {
    quotation: 'عرض سعر (PDF)', quotationHelp: 'الأسعار فقط: قائمة البنود والإجمالي وملاحظتك للعميل والشروط والتوقيعات، بدون صفحات التصميم.',
    finance: 'التوفير وفترة الاسترداد في العرض', financeOpts: { auto: 'تلقائي', on: 'إظهار', off: 'إخفاء' },
    financeAutoShown: (years) => `معروض: فترة الاسترداد ${yearsAr(years)}.`,
    financePayback: (years, tariff) => `مخفي: فترة الاسترداد ${yearsAr(years)} بتعرفة ${I(tariff)} لكل kWh.`,
    financeNoSavings: (tariff) => `مخفي: لا يوجد توفير بتعرفة ${I(tariff)} لكل kWh.`,
    financeHint: { hybrid: 'أدخل ساعات انقطاع الشبكة أو التعرفة في خطوة الموقع.', gridtie: 'راجع التعرفة في خطوة الموقع.', offgrid: 'راجع تكلفة الديزل في خطوة الموقع.' },
    financeOnNote: 'يتضمن العرض الشامل التوفير وفترة الاسترداد والتدفق النقدي.', financeOffNote: 'لا يتضمن العرض الشامل التوفير وفترة الاسترداد والتدفق النقدي.',
    financeFix: 'خطوة الموقع',
    proposalHelpSize: 'عرض بهوية شركتك: النظام الذي اختاره العميل والإنتاج والتوفير وقائمة المواد بالأسعار والشروط. أسعار البيع فقط.',
    alsoForClient: 'للعميل أيضاً',
    excelItems: 'ملف الأسعار (Excel)', excelItemsHelp: 'المنتجات المسعّرة بالتكلفة والإضافة وسعر البيع، بمعادلات حية.',
    products: 'المنتجات', productsOk: (n, total) => `${n === 1 ? 'بند واحد' : n === 2 ? 'بندان' : `${n} بنود`} · ${I(total)}`, productsMissing: 'لا توجد منتجات بعد',
    bill: 'فاتورة الكهرباء', billOk: (kwh, profile) => `${I(kwh + ' kWh')} شهرياً · ${profile}`, billMissing: 'أدخل الاستهلاك الشهري',
    system: 'حجم النظام', systemMissing: 'لم يتم اختيار أي معدات',
    clientOptional: 'اختياري. أضفه ليُوجَّه العرض باسم العميل',
  },
}
