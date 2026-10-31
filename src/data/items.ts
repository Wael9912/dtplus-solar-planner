import type { CatalogItem } from '../engine/types'
// Accessory / BOS catalogue used by the BOM builder. Prices are indicative wholesale USD (2025) — override per supplier.
// There is one item per standard size/rating the engine can output (cables, fuses, breakers, isolators, SPDs, changeovers),
// so every BOM line carries exactly the designed rating. Ids are `<family>-<rating>` and stay stable.

const RLM = '‏' // keeps a Latin/number run in place inside Arabic text
const item = (id: string, category: string, name: string, spec: string, unit: string, approxPriceUsd: number, nameAr: string, specAr: string): CatalogItem =>
  ({ id, category, name, spec, unit, approxPriceUsd, nameAr, specAr })

// ---- price ladders (USD) ----
const DC_CABLE: Record<number, number> = { 4: 0.6, 6: 0.85, 10: 1.4, 16: 2.2, 25: 3.4, 35: 4.7, 50: 6.6, 70: 9.2, 95: 12.4, 120: 15.6, 150: 19.5, 185: 24, 240: 31 }
const BATT_CABLE: Record<number, number> = { 6: 1.2, 10: 1.8, 16: 2.6, 25: 3.8, 35: 5.2, 50: 7.5, 70: 10.5, 95: 14, 120: 17.5, 150: 22, 185: 27, 240: 35 }
const AC_CABLE: Record<number, number> = { 2.5: 0.45, 4: 0.7, 6: 1.0, 10: 1.7, 16: 2.6, 25: 4.0, 35: 5.5, 50: 7.6, 70: 10.6, 95: 14.2, 120: 18, 150: 22.5, 185: 27.5, 240: 36 }
const PV_FUSE: Record<number, number> = { 10: 4, 12: 4, 15: 4, 16: 4, 20: 4, 25: 4.5, 30: 4.5, 32: 4.5, 35: 5.5, 40: 5.5 }
const ARRAY_FUSE: Record<number, number> = { 40: 18, 50: 18, 63: 20, 80: 26, 100: 26, 125: 30, 160: 38, 200: 40, 250: 45, 315: 55, 400: 60, 500: 85, 630: 95 }
const BATT_FUSE: Record<number, number> = { 20: 18, 25: 18, 30: 18, 32: 18, 40: 20, 50: 20, 63: 22, 80: 26, 100: 28, 125: 28, 150: 32, 160: 32, 175: 32, 200: 32, 225: 36, 250: 38, 300: 48, 350: 52, 400: 55, 500: 75, 630: 95, 800: 120 }
const BREAKER: Record<number, number> = { 6: 8, 10: 8, 16: 8, 20: 8, 25: 9, 32: 9, 40: 12, 50: 13, 63: 14, 80: 30, 100: 45, 125: 55, 160: 95, 200: 120, 250: 150, 315: 220, 400: 280, 500: 420, 630: 520, 800: 900, 1000: 1400, 1250: 1700, 1600: 2200 }
const ISOLATOR_A: Record<number, number> = { 25: 18, 32: 22, 50: 35, 63: 48, 125: 95, 250: 180 }
const CLASS_V_FACTOR: Record<number, number> = { 600: 0.85, 1000: 1, 1200: 1.25, 1500: 1.5 }
const SPD_DC: Record<number, number> = { 600: 30, 1000: 35, 1200: 45, 1500: 55 }
const RCD: Record<number, number> = { 25: 22, 40: 25, 63: 32, 80: 55, 100: 65 }
const CHANGEOVER: Record<number, number> = { 40: 22, 63: 25, 100: 45, 125: 55, 160: 90, 250: 140, 400: 260, 630: 420, 800: 650, 1250: 1100 }
const ATS: Record<number, number> = { 40: 180, 63: 220, 100: 320, 125: 380, 160: 520, 250: 750, 400: 1100, 630: 1600, 800: 2100, 1250: 3200 }

const breakerSpec = (a: number): [string, string] =>
  a <= 63 ? ['2P / 4P C-curve 6 kA', `2P / 4P منحنى C، ${RLM}6 kA`]
    : a <= 125 ? ['2P / 4P C-curve 10 kA', `2P / 4P منحنى C، ${RLM}10 kA`]
      : a <= 400 ? ['3P / 4P MCCB 25–36 kA, adjustable thermal trip', `3P / 4P، ${RLM}25–36 kA، فصل حراري قابل للضبط`]
        : a <= 800 ? ['3P / 4P MCCB 36–50 kA, electronic trip', `3P / 4P، ${RLM}36–50 kA، وحدة فصل إلكترونية`]
          : ['3P / 4P ACB / MCCB 50 kA, electronic trip', `3P / 4P قاطع هوائي ACB أو MCCB، ${RLM}50 kA`]

export const items: CatalogItem[] = [
  // ---------------- Mounting
  item('rail', 'Mounting', 'Aluminium mounting rail', '40×40 mm anodised, 4.2 m lengths', 'm', 4.5, 'سكة تثبيت ألومنيوم', 'مقطع 40×40 مم مؤكسد (أنودايز)، أطوال 4.2 م'),
  item('mid-clamp', 'Mounting', 'Mid clamp', '30–40 mm frame, aluminium + SS bolt', 'pcs', 0.9, 'مشبك وسطي', 'لإطار 30–40 مم، ألومنيوم + مسمار ستانلس'),
  item('end-clamp', 'Mounting', 'End clamp', '35 mm frame, aluminium + SS bolt', 'pcs', 0.9, 'مشبك طرفي', 'لإطار 35 مم، ألومنيوم + مسمار ستانلس'),
  item('rail-splice', 'Mounting', 'Rail splice / connector', 'Internal splice kit', 'pcs', 1.5, 'وصلة سكة', 'طقم وصل داخلي'),
  item('l-foot', 'Mounting', 'L-foot / tin-roof clamp', 'With EPDM washer & self-drilling screw', 'pcs', 1.8, 'قاعدة L / مشبك سقف صاج', 'مع حلقة مانعة EPDM ومسمار ذاتي الحفر'),
  item('tile-hook', 'Mounting', 'Tile roof hook', 'Stainless steel, adjustable', 'pcs', 4, 'خطاف سقف قرميد', 'ستانلس ستيل، قابل للضبط'),
  item('triangle-frame', 'Mounting', 'Flat-roof tilt frame', 'Adjustable 10–30° triangle, per panel', 'pcs', 18, 'حامل مائل للأسطح المستوية', 'مثلث قابل للضبط 10–30°، لكل لوح'),
  item('ballast-block', 'Mounting', 'Ballast / concrete footing', '~20 kg block or chemical anchor', 'pcs', 3, 'ثقل خرساني / قاعدة تثبيت', 'بلوك ~20 كجم أو مثبّت كيميائي'),
  item('ground-structure', 'Mounting', 'Ground-mount structure', 'Galvanised steel, incl. foundations, per kWp', 'kWp', 110, 'هيكل تركيب أرضي', 'حديد مجلفن شامل القواعد، لكل kWp'),

  // ---------------- PV DC
  ...Object.entries(DC_CABLE).map(([mm2, usd]) => item(`dc-cable-${mm2}`, 'Cabling', `PV DC cable ${mm2} mm²`, 'H1Z2Z2-K 1.5 kV, red/black', 'm', usd,
    `كابل ألواح DC مقطع ${mm2} مم²`, `H1Z2Z2-K ${RLM}1.5 kV، أحمر/أسود`)),
  item('mc4-pair', 'Cabling', 'MC4 connector pair', 'IP68, 1500 V, 30 A', 'pair', 1.5, 'زوج موصلات MC4', 'IP68، 1500 V، 30 A'),
  item('combiner-box', 'Protection', 'DC combiner box', 'IP65, up to 6 strings in / 1 out, fuse holders, SPD slot', 'pcs', 85, 'صندوق تجميع DC', 'IP65، حتى 6 سلاسل دخول / 1 خروج، حوامل فيوزات، مكان لواقي الجهد الزائد'),
  ...Object.entries(PV_FUSE).flatMap(([a, usd]) => [
    item(`pv-fuse-${a}`, 'Protection', `PV string fuse ${a} A`, `${Number(a) <= 32 ? '10×38' : '14×51'} gPV 1000 V DC + holder`, 'pcs', usd,
      `فيوز سلسلة ألواح ${a} A`, `${Number(a) <= 32 ? '10×38' : '14×51'} gPV ${RLM}1000 V DC + حامل`),
    item(`pv-fuse-${a}-1500v`, 'Protection', `PV string fuse ${a} A (1500 V)`, '10×85 gPV 1500 V DC + holder', 'pcs', usd * 1.8,
      `فيوز سلسلة ألواح ${a} A ‏(1500 V)`, `10×85 gPV ${RLM}1500 V DC + حامل`),
  ]),
  ...Object.entries(ARRAY_FUSE).flatMap(([a, usd]) => [
    item(`pv-array-fuse-${a}`, 'Protection', `PV array (combiner output) fuse ${a} A`, 'NH gPV 1000 V DC + fuse base', 'pcs', usd,
      `فيوز خرج صندوق التجميع ${a} A`, `NH gPV ${RLM}1000 V DC + قاعدة فيوز`),
    item(`pv-array-fuse-${a}-1500v`, 'Protection', `PV array (combiner output) fuse ${a} A (1500 V)`, 'NH gPV 1500 V DC + fuse base', 'pcs', usd * 1.6,
      `فيوز خرج صندوق التجميع ${a} A ‏(1500 V)`, `NH gPV ${RLM}1500 V DC + قاعدة فيوز`),
  ]),
  ...Object.entries(CLASS_V_FACTOR).flatMap(([v, k]) => Object.entries(ISOLATOR_A).map(([a, usd]) =>
    item(`dc-isolator-${v}v-${a}a`, 'Protection', `DC isolator switch ${a} A ${v} V`, `PV-rated (DC-PV2) load-break switch, ${v} V DC, ${a} A, 4-pole, IP66`, 'pcs', Math.round(usd * k * 100) / 100,
      `مفتاح فصل DC ‏${a} A ‏${v} V`, `مفتاح فصل للألواح (DC-PV2)، ${RLM}${v} V DC، ${RLM}${a} A، 4 أقطاب، IP66`))),
  ...Object.entries(SPD_DC).map(([v, usd]) => item(`spd-dc-${v}v`, 'Protection', `DC surge protector ${v} V`, `Type 2, Ucpv ${v} V DC, 40 kA`, 'pcs', usd,
    `واقي الجهد الزائد DC (SPD) ‏${v} V`, `النوع 2، Ucpv ${RLM}${v} V DC، ${RLM}40 kA`)),

  // ---------------- Battery
  ...Object.entries(BATT_CABLE).map(([mm2, usd]) => item(`batt-cable-${mm2}`, 'Cabling', `Battery cable ${mm2} mm²`, 'Flexible copper, 105 °C, red/black', 'm', usd,
    `كابل بطارية مقطع ${mm2} مم²`, 'نحاس مرن، 105 °م، أحمر/أسود')),
  item('cable-lug', 'Cabling', 'Tinned copper lug + heat-shrink', 'M8/M10 to match cable', 'pcs', 0.8, 'نهاية كابل (كوس) نحاس مقصدر + عازل حراري', 'M8/M10 حسب مقطع الكابل'),
  ...Object.entries(BATT_FUSE).flatMap(([a, usd]) => [
    item(`batt-fuse-${a}`, 'Protection', `Battery fuse ${a} A + holder`, 'Class T / NH gG, ≥ 125 V DC (LV bus)', 'pcs', usd,
      `فيوز بطارية ${a} A مع حامل`, `فئة T / NH gG، ${RLM}125 V DC أو أعلى (بطاريات جهد منخفض)`),
    item(`batt-fuse-hv-${a}`, 'Protection', `HV battery fuse ${a} A + holder`, 'DC fuse gR/gPV or DC MCCB, 1000 V DC (HV bank)', 'pcs', Math.round(usd * 2.2 * 100) / 100,
      `فيوز بطارية جهد عالٍ ${a} A مع حامل`, `فيوز DC ‏(gR/gPV) أو قاطع MCCB للتيار المستمر، ${RLM}1000 V DC`),
  ]),
  item('battery-rack', 'Battery', 'Battery rack / cabinet', '19" rack, 4–6 modules, with busbars', 'pcs', 160, 'رف / كابينة بطاريات', 'رف 19 بوصة، 4–6 وحدات، مع قضبان توصيل (Busbar)'),
  item('battery-stand', 'Battery', 'Battery stand (lead acid)', 'Steel 2-tier stand for 4 × 12 V', 'pcs', 60, 'حامل بطاريات (رصاص حمضي)', 'حامل حديد بطابقين لـ 4 × 12 V'),
  item('busbar-kit', 'Battery', 'Battery busbar kit', 'Insulated +/− copper busbars for up to 8 units in parallel', 'pcs', 45, 'طقم قضبان توصيل (Busbar) للبطاريات', 'قضبان نحاسية موجبة/سالبة معزولة حتى 8 وحدات على التوازي'),
  item('bms-cable', 'Battery', 'BMS communication cable', 'CAN / RS485 link, RJ45, per battery unit', 'pcs', 6, 'كابل اتصال نظام إدارة البطارية (BMS)', 'رابط CAN / RS485، ‏RJ45، لكل وحدة بطارية'),

  // ---------------- AC
  ...Object.entries(AC_CABLE).map(([mm2, usd]) => item(`ac-cable-${mm2}`, 'Cabling', `AC cable ${mm2} mm²`, 'Cu PVC/PVC, per core', 'm', usd,
    `كابل AC مقطع ${mm2} مم²`, 'نحاس PVC/PVC، السعر لكل موصل')),
  ...Object.entries(BREAKER).map(([a, usd]) => {
    const n = Number(a), mccb = n >= 160, [spec, specAr] = breakerSpec(n)
    return item(`${mccb ? 'ac-mccb' : 'ac-mcb'}-${a}`, 'Protection', `AC ${mccb ? 'MCCB' : n > 63 ? 'MCB / MCCB' : 'MCB'} ${a} A`, spec, 'pcs', usd,
      `قاطع AC من نوع ${mccb ? 'MCCB' : n > 63 ? 'MCB / MCCB' : 'MCB'} ‏${a} A`, specAr)
  }),
  ...Object.entries(RCD).map(([a, usd]) => item(`rcd-${a}`, 'Protection', `RCCB ${a} A 30 mA`, 'Type A, 2P / 4P, on the backup / off-grid output board', 'pcs', usd,
    `قاطع تيار متبقٍ (RCCB) ‏${a} A ‏30 mA`, 'النوع A، ‏2P / 4P، على لوحة خرج الطوارئ / النظام المنفصل')),
  item('rcd-relay', 'Protection', 'Earth-leakage relay 30 mA + core-balance CT', 'Trips the output MCCB via shunt trip (outputs above 100 A)', 'pcs', 120,
    'مرحّل تسرّب أرضي 30 mA + محوّل تيار حلقي', 'يفصل قاطع الخرج MCCB عبر ملف فصل (للخرج الأكبر من 100 A)'),
  item('spd-ac', 'Protection', 'AC surge protector', 'Type 2, 275 V, 40 kA, 2P/4P', 'pcs', 28, 'واقي الجهد الزائد AC (SPD)', 'النوع 2، 275 V، 40 kA، 2P/4P'),
  item('db-board', 'Protection', 'Distribution board (AC/DC)', 'IP65 enclosure, 12–24 way, busbars, labels', 'pcs', 45, 'لوحة توزيع (AC/DC)', 'صندوق IP65، 12–24 خطاً، قضبان توصيل، ملصقات'),
  ...Object.entries(CHANGEOVER).map(([a, usd]) => item(`changeover-${a}`, 'Protection', `Changeover switch ${a} A`, 'Manual 2P / 4P grid–solar–off (maintenance bypass)', 'pcs', usd,
    `مفتاح تحويل ${a} A`, 'يدوي 2P / 4P (شبكة – شمسي – فصل) للتجاوز أثناء الصيانة')),
  ...Object.entries(ATS).map(([a, usd]) => item(`ats-${a}`, 'Protection', `Automatic transfer switch (ATS) ${a} A`, '4P, controller with generator auto-start', 'pcs', usd,
    `مفتاح تحويل آلي (ATS) ‏${a} A`, '4P، مع وحدة تحكم وتشغيل آلي للمولد')),
  item('ct-meter', 'Monitoring', 'Energy meter / CT clamp', 'For export limit & self-consumption (1 CT per phase)', 'pcs', 45, 'عداد طاقة / محوّل تيار (CT)', 'للتحكم في حد التصدير والاستهلاك الذاتي (محوّل لكل طور)'),
  item('wifi-dongle', 'Monitoring', 'Wi-Fi / 4G monitoring dongle', 'Manufacturer datalogger', 'pcs', 35, 'وحدة مراقبة Wi-Fi / 4G', 'مسجّل بيانات من الشركة المصنعة'),

  // ---------------- Earthing & misc
  item('earth-rod', 'Earthing', 'Earth rod 1.5 m + clamp', 'Copper-bonded 16 mm', 'pcs', 18, 'قضيب تأريض 1.5 م + مشبك', 'فولاذ مطلي بالنحاس 16 مم'),
  item('earth-cable', 'Earthing', 'Earth cable 6 mm² green/yellow', 'Cu PVC', 'm', 1.0, 'كابل تأريض 6 مم² أخضر/أصفر', 'نحاس PVC'),
  item('earth-clip', 'Earthing', 'Module earthing clip', 'Stainless WEEB-type bonding clip, 1 per panel', 'pcs', 0.5, 'مشبك تأريض للوح', 'مشبك ربط ستانلس من نوع WEEB، واحد لكل لوح'),
  item('lightning-arrestor', 'Earthing', 'Lightning arrestor / air terminal', 'With down-conductor', 'pcs', 120, 'مانعة صواعق / رأس التقاط', 'مع موصل نزول'),
  item('conduit', 'Cabling', 'Conduit / cable trunking', 'UV-resistant 25–40 mm + fittings', 'm', 1.6, 'مواسير / مجاري كابلات', 'مقاومة للأشعة فوق البنفسجية 25–40 مم + ملحقات'),
  item('cable-ties-labels', 'Accessories', 'Consumables kit', 'UV cable ties, labels, glands, screws, tape (per 20 panels)', 'kit', 25, 'طقم مستهلكات', 'رباطات كابلات مقاومة للأشعة، ملصقات، جلندات، براغي، شريط (لكل 20 لوحاً)'),
  // Priced per kVA by buildBom (generatorPriceUsd); approxPriceUsd here is only a fallback
  item('generator', 'Generator', 'Diesel generator', 'Silent canopy, ATS-ready', 'pcs', 0, 'مولد ديزل', 'بكاتم صوت، جاهز لمفتاح التحويل الآلي ATS'),
]

/** Indicative diesel genset price (USD) by size — small sets cost more per kVA. Override per supplier in the BOM. */
export function generatorPriceUsd(kva: number): number {
  const perKva = kva <= 10 ? 280 : kva <= 30 ? 220 : kva <= 100 ? 170 : 140
  return Math.round(kva * perKva)
}
