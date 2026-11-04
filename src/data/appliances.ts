// Appliance library — typical rated watts, daily hours and starting-surge factors (see docs/sizing-methodology.md §2).
import type { Appliance } from '../engine/types'

export const appliances: Appliance[] = [
 {
  "id": "led_bulb_10w",
  "name": "LED bulb 10 W",
  "category": "lighting",
  "watts": 10,
  "hoursPerDay": 6,
  "surgeFactor": 1.0,
  "phase": 1,
  "nameAr": "لمبة LED 10 واط"
 },
 {
  "id": "led_tube_18w",
  "name": "LED tube light 18 W",
  "category": "lighting",
  "watts": 18,
  "hoursPerDay": 6,
  "surgeFactor": 1.0,
  "phase": 1,
  "nameAr": "لمبة LED طولية 18 واط"
 },
 {
  "id": "led_flood_50w",
  "name": "LED floodlight 50 W",
  "category": "lighting",
  "watts": 50,
  "hoursPerDay": 10,
  "surgeFactor": 1.0,
  "phase": 1,
  "nameAr": "كشاف LED 50 واط"
 },
 {
  "id": "cfl_20w",
  "name": "CFL lamp 20 W",
  "category": "lighting",
  "watts": 20,
  "hoursPerDay": 5,
  "surgeFactor": 1.0,
  "phase": 1,
  "nameAr": "لمبة موفرة 20 واط"
 },
 {
  "id": "ceiling_fan",
  "name": "Ceiling fan",
  "category": "cooling",
  "watts": 70,
  "hoursPerDay": 8,
  "surgeFactor": 1.5,
  "phase": 1,
  "nameAr": "مروحة سقف"
 },
 {
  "id": "stand_fan",
  "name": "Pedestal / stand fan",
  "category": "cooling",
  "watts": 55,
  "hoursPerDay": 6,
  "surgeFactor": 1.5,
  "phase": 1,
  "nameAr": "مروحة عمودية"
 },
 {
  "id": "evap_cooler",
  "name": "Evaporative (desert) air cooler",
  "category": "cooling",
  "watts": 250,
  "hoursPerDay": 8,
  "surgeFactor": 3.0,
  "phase": 1,
  "nameAr": "مكيف صحراوي (تبريد بالماء)"
 },
 {
  "id": "ac_window_1ton",
  "name": "Window AC 1 ton (12,000 BTU)",
  "category": "cooling",
  "watts": 1300,
  "hoursPerDay": 8,
  "surgeFactor": 3.5,
  "phase": 1,
  "nameAr": "مكيف شباك 1 طن"
 },
 {
  "id": "ac_window_1_5ton",
  "name": "Window AC 1.5 ton (18,000 BTU)",
  "category": "cooling",
  "watts": 1900,
  "hoursPerDay": 8,
  "surgeFactor": 3.5,
  "phase": 1,
  "nameAr": "مكيف شباك 1.5 طن"
 },
 {
  "id": "ac_split_1ton_inv",
  "name": "Split AC 1 ton inverter",
  "category": "cooling",
  "watts": 1000,
  "hoursPerDay": 8,
  "surgeFactor": 2.0,
  "phase": 1,
  "nameAr": "مكيف سبليت 1 طن إنفرتر"
 },
 {
  "id": "ac_split_1ton_fixed",
  "name": "Split AC 1 ton fixed-speed",
  "category": "cooling",
  "watts": 1200,
  "hoursPerDay": 8,
  "surgeFactor": 3.0,
  "phase": 1,
  "nameAr": "مكيف سبليت 1 طن عادي"
 },
 {
  "id": "ac_split_1_5ton_inv",
  "name": "Split AC 1.5 ton inverter",
  "category": "cooling",
  "watts": 1300,
  "hoursPerDay": 8,
  "surgeFactor": 2.0,
  "phase": 1,
  "nameAr": "مكيف سبليت 1.5 طن إنفرتر"
 },
 {
  "id": "ac_split_1_5ton_fixed",
  "name": "Split AC 1.5 ton fixed-speed",
  "category": "cooling",
  "watts": 1800,
  "hoursPerDay": 8,
  "surgeFactor": 3.0,
  "phase": 1,
  "nameAr": "مكيف سبليت 1.5 طن عادي"
 },
 {
  "id": "ac_split_2ton_inv",
  "name": "Split AC 2 ton inverter",
  "category": "cooling",
  "watts": 1800,
  "hoursPerDay": 8,
  "surgeFactor": 2.0,
  "phase": 1,
  "nameAr": "مكيف سبليت 2 طن إنفرتر"
 },
 {
  "id": "ac_split_2ton_fixed",
  "name": "Split AC 2 ton fixed-speed",
  "category": "cooling",
  "watts": 2400,
  "hoursPerDay": 8,
  "surgeFactor": 3.0,
  "phase": 1,
  "nameAr": "مكيف سبليت 2 طن عادي"
 },
 {
  "id": "ac_cassette_4ton_3ph",
  "name": "Cassette / ducted AC 4 ton (3-phase)",
  "category": "cooling",
  "watts": 4800,
  "hoursPerDay": 8,
  "surgeFactor": 3.0,
  "phase": 3,
  "nameAr": "مكيف كاسيت 4 طن (ثلاثي الأطوار)"
 },
 {
  "id": "water_cooler",
  "name": "Water cooler / dispenser (hot+cold)",
  "category": "appliance",
  "watts": 120,
  "hoursPerDay": 10,
  "surgeFactor": 3.0,
  "phase": 1,
  "nameAr": "برادة مياه (حار/بارد)"
 },
 {
  "id": "fridge_small",
  "name": "Refrigerator 150-250 L",
  "category": "refrigeration",
  "watts": 120,
  "hoursPerDay": 8,
  "surgeFactor": 4.0,
  "phase": 1,
  "nameAr": "ثلاجة صغيرة 150-250 لتر"
 },
 {
  "id": "fridge_large",
  "name": "Refrigerator-freezer 400-600 L",
  "category": "refrigeration",
  "watts": 200,
  "hoursPerDay": 9,
  "surgeFactor": 4.0,
  "phase": 1,
  "nameAr": "ثلاجة كبيرة 400-600 لتر"
 },
 {
  "id": "chest_freezer",
  "name": "Chest fridge / chest freezer 300 L",
  "category": "refrigeration",
  "watts": 150,
  "hoursPerDay": 8,
  "surgeFactor": 4.0,
  "phase": 1,
  "nameAr": "فريزر أفقي 300 لتر"
 },
 {
  "id": "deep_freezer",
  "name": "Deep freezer 500 L",
  "category": "refrigeration",
  "watts": 250,
  "hoursPerDay": 10,
  "surgeFactor": 4.0,
  "phase": 1,
  "nameAr": "ديب فريزر 500 لتر"
 },
 {
  "id": "display_chiller",
  "name": "Commercial display chiller / cold cabinet",
  "category": "refrigeration",
  "watts": 600,
  "hoursPerDay": 12,
  "surgeFactor": 3.5,
  "phase": 1,
  "nameAr": "ثلاجة عرض تجارية"
 },
 {
  "id": "tv_led_43",
  "name": "LED TV 43 in",
  "category": "electronics",
  "watts": 80,
  "hoursPerDay": 5,
  "surgeFactor": 1.0,
  "phase": 1,
  "nameAr": "تلفزيون LED 43 بوصة"
 },
 {
  "id": "tv_led_65",
  "name": "LED TV 65 in",
  "category": "electronics",
  "watts": 150,
  "hoursPerDay": 5,
  "surgeFactor": 1.0,
  "phase": 1,
  "nameAr": "تلفزيون LED 65 بوصة"
 },
 {
  "id": "satellite_receiver",
  "name": "Satellite receiver / decoder",
  "category": "electronics",
  "watts": 20,
  "hoursPerDay": 5,
  "surgeFactor": 1.0,
  "phase": 1,
  "nameAr": "رسيفر"
 },
 {
  "id": "router",
  "name": "Wi-Fi router / modem",
  "category": "electronics",
  "watts": 10,
  "hoursPerDay": 24,
  "surgeFactor": 1.0,
  "phase": 1,
  "nameAr": "راوتر واي فاي"
 },
 {
  "id": "phone_charger",
  "name": "Phone charger",
  "category": "electronics",
  "watts": 10,
  "hoursPerDay": 3,
  "surgeFactor": 1.0,
  "phase": 1,
  "nameAr": "شاحن هاتف"
 },
 {
  "id": "laptop",
  "name": "Laptop",
  "category": "electronics",
  "watts": 60,
  "hoursPerDay": 6,
  "surgeFactor": 1.0,
  "phase": 1,
  "nameAr": "لابتوب"
 },
 {
  "id": "desktop_pc",
  "name": "Desktop PC with monitor",
  "category": "electronics",
  "watts": 200,
  "hoursPerDay": 8,
  "surgeFactor": 1.2,
  "phase": 1,
  "nameAr": "كمبيوتر مكتبي مع شاشة"
 },
 {
  "id": "printer_laser",
  "name": "Laser printer",
  "category": "office",
  "watts": 500,
  "hoursPerDay": 1,
  "surgeFactor": 1.5,
  "phase": 1,
  "nameAr": "طابعة ليزر"
 },
 {
  "id": "printer_inkjet",
  "name": "Inkjet printer",
  "category": "office",
  "watts": 30,
  "hoursPerDay": 1,
  "surgeFactor": 1.0,
  "phase": 1,
  "nameAr": "طابعة حبر"
 },
 {
  "id": "photocopier",
  "name": "Photocopier (office)",
  "category": "office",
  "watts": 1200,
  "hoursPerDay": 2,
  "surgeFactor": 1.5,
  "phase": 1,
  "nameAr": "ماكينة تصوير"
 },
 {
  "id": "pos_terminal",
  "name": "POS terminal + receipt printer",
  "category": "office",
  "watts": 50,
  "hoursPerDay": 10,
  "surgeFactor": 1.0,
  "phase": 1,
  "nameAr": "جهاز نقاط بيع + طابعة إيصالات"
 },
 {
  "id": "cctv_4ch",
  "name": "CCTV 4 cameras + DVR/NVR",
  "category": "security",
  "watts": 50,
  "hoursPerDay": 24,
  "surgeFactor": 1.0,
  "phase": 1,
  "nameAr": "كاميرات مراقبة 4 + DVR"
 },
 {
  "id": "cctv_16ch",
  "name": "CCTV 16 cameras + NVR",
  "category": "security",
  "watts": 150,
  "hoursPerDay": 24,
  "surgeFactor": 1.0,
  "phase": 1,
  "nameAr": "كاميرات مراقبة 16 + NVR"
 },
 {
  "id": "server_rack",
  "name": "Server / network rack (1 server + switch)",
  "category": "office",
  "watts": 400,
  "hoursPerDay": 24,
  "surgeFactor": 1.2,
  "phase": 1,
  "nameAr": "خزانة سيرفر وشبكة (سيرفر + سويتش)"
 },
 {
  "id": "washing_machine",
  "name": "Washing machine (front/top load)",
  "category": "appliance",
  "watts": 500,
  "hoursPerDay": 1,
  "surgeFactor": 3.0,
  "phase": 1,
  "nameAr": "غسالة ملابس"
 },
 {
  "id": "electric_iron",
  "name": "Electric iron",
  "category": "appliance",
  "watts": 1200,
  "hoursPerDay": 0.5,
  "surgeFactor": 1.0,
  "phase": 1,
  "nameAr": "مكواة كهربائية"
 },
 {
  "id": "microwave",
  "name": "Microwave oven",
  "category": "kitchen",
  "watts": 1200,
  "hoursPerDay": 0.5,
  "surgeFactor": 1.5,
  "phase": 1,
  "nameAr": "ميكروويف"
 },
 {
  "id": "kettle",
  "name": "Electric kettle",
  "category": "kitchen",
  "watts": 2000,
  "hoursPerDay": 0.3,
  "surgeFactor": 1.0,
  "phase": 1,
  "nameAr": "غلاية كهربائية"
 },
 {
  "id": "toaster",
  "name": "Toaster",
  "category": "kitchen",
  "watts": 900,
  "hoursPerDay": 0.2,
  "surgeFactor": 1.0,
  "phase": 1,
  "nameAr": "محمصة"
 },
 {
  "id": "blender",
  "name": "Blender / juicer",
  "category": "kitchen",
  "watts": 400,
  "hoursPerDay": 0.2,
  "surgeFactor": 2.0,
  "phase": 1,
  "nameAr": "خلاط / عصارة"
 },
 {
  "id": "water_heater_geyser",
  "name": "Electric water heater 50-80 L (geyser)",
  "category": "heating",
  "watts": 2000,
  "hoursPerDay": 2,
  "surgeFactor": 1.0,
  "phase": 1,
  "nameAr": "سخان مياه 50-80 لتر"
 },
 {
  "id": "instant_water_heater",
  "name": "Instant electric water heater",
  "category": "heating",
  "watts": 4500,
  "hoursPerDay": 0.5,
  "surgeFactor": 1.0,
  "phase": 1,
  "nameAr": "سخان مياه فوري"
 },
 {
  "id": "electric_stove",
  "name": "Electric cooktop (2 plates)",
  "category": "kitchen",
  "watts": 2500,
  "hoursPerDay": 1,
  "surgeFactor": 1.0,
  "phase": 1,
  "nameAr": "موقد كهربائي (عينين)"
 },
 {
  "id": "hair_dryer",
  "name": "Hair dryer",
  "category": "appliance",
  "watts": 1500,
  "hoursPerDay": 0.2,
  "surgeFactor": 1.2,
  "phase": 1,
  "nameAr": "مجفف شعر"
 },
 {
  "id": "vacuum",
  "name": "Vacuum cleaner",
  "category": "appliance",
  "watts": 1200,
  "hoursPerDay": 0.3,
  "surgeFactor": 2.0,
  "phase": 1,
  "nameAr": "مكنسة كهربائية"
 },
 {
  "id": "pump_surface_0_5hp",
  "name": "Surface water pump 0.5 HP",
  "category": "pump",
  "watts": 500,
  "hoursPerDay": 2,
  "surgeFactor": 3.0,
  "phase": 1,
  "nameAr": "مضخة سطحية 0.5 حصان"
 },
 {
  "id": "pump_surface_1hp",
  "name": "Surface water pump 1 HP",
  "category": "pump",
  "watts": 1000,
  "hoursPerDay": 2,
  "surgeFactor": 3.0,
  "phase": 1,
  "nameAr": "مضخة سطحية 1 حصان"
 },
 {
  "id": "pump_sub_0_5hp",
  "name": "Submersible well pump 0.5 HP",
  "category": "pump",
  "watts": 550,
  "hoursPerDay": 3,
  "surgeFactor": 5.0,
  "phase": 1,
  "nameAr": "مضخة غاطسة 0.5 حصان"
 },
 {
  "id": "pump_sub_1hp",
  "name": "Submersible well pump 1 HP",
  "category": "pump",
  "watts": 1050,
  "hoursPerDay": 3,
  "surgeFactor": 5.0,
  "phase": 1,
  "nameAr": "مضخة غاطسة 1 حصان"
 },
 {
  "id": "pump_sub_1_5hp",
  "name": "Submersible well pump 1.5 HP",
  "category": "pump",
  "watts": 1500,
  "hoursPerDay": 4,
  "surgeFactor": 5.0,
  "phase": 1,
  "nameAr": "مضخة غاطسة 1.5 حصان"
 },
 {
  "id": "pump_sub_2hp",
  "name": "Submersible well pump 2 HP",
  "category": "pump",
  "watts": 2050,
  "hoursPerDay": 4,
  "surgeFactor": 5.0,
  "phase": 1,
  "nameAr": "مضخة غاطسة 2 حصان"
 },
 {
  "id": "pump_sub_3hp_3ph",
  "name": "Submersible well pump 3 HP (3-phase)",
  "category": "pump",
  "watts": 2700,
  "hoursPerDay": 5,
  "surgeFactor": 5.0,
  "phase": 3,
  "nameAr": "مضخة غاطسة 3 حصان (ثلاثية الأطوار)"
 },
 {
  "id": "pump_sub_5hp_3ph",
  "name": "Submersible well pump 5 HP (3-phase)",
  "category": "pump",
  "watts": 4400,
  "hoursPerDay": 6,
  "surgeFactor": 5.0,
  "phase": 3,
  "nameAr": "مضخة غاطسة 5 حصان (ثلاثية الأطوار)"
 },
 {
  "id": "pressure_booster",
  "name": "Pressure booster pump 0.75 HP",
  "category": "pump",
  "watts": 750,
  "hoursPerDay": 1.5,
  "surgeFactor": 3.0,
  "phase": 1,
  "nameAr": "مضخة ضغط 0.75 حصان"
 },
 {
  "id": "motor_3ph_5hp",
  "name": "3-phase induction motor 5 HP",
  "category": "motor",
  "watts": 4300,
  "hoursPerDay": 6,
  "surgeFactor": 4.0,
  "phase": 3,
  "nameAr": "محرك حثّي ثلاثي الأطوار 5 حصان"
 },
 {
  "id": "motor_3ph_10hp",
  "name": "3-phase induction motor 10 HP",
  "category": "motor",
  "watts": 8400,
  "hoursPerDay": 6,
  "surgeFactor": 4.0,
  "phase": 3,
  "nameAr": "محرك حثّي ثلاثي الأطوار 10 حصان"
 },
 {
  "id": "motor_3ph_20hp",
  "name": "3-phase induction motor 20 HP",
  "category": "motor",
  "watts": 16600,
  "hoursPerDay": 6,
  "surgeFactor": 4.0,
  "phase": 3,
  "nameAr": "محرك حثّي ثلاثي الأطوار 20 حصان"
 },
 {
  "id": "grain_mill",
  "name": "Grain / flour mill 7.5 HP (3-phase)",
  "category": "agri",
  "watts": 6400,
  "hoursPerDay": 4,
  "surgeFactor": 4.0,
  "phase": 3,
  "nameAr": "طاحونة حبوب 7.5 حصان (ثلاثية الأطوار)"
 },
 {
  "id": "milking_machine",
  "name": "Milking machine 1 HP",
  "category": "agri",
  "watts": 1000,
  "hoursPerDay": 2,
  "surgeFactor": 3.0,
  "phase": 1,
  "nameAr": "ماكينة حلب 1 حصان"
 },
 {
  "id": "incubator",
  "name": "Egg incubator (medium)",
  "category": "agri",
  "watts": 150,
  "hoursPerDay": 24,
  "surgeFactor": 1.0,
  "phase": 1,
  "nameAr": "فقاسة بيض"
 },
 {
  "id": "poultry_fan",
  "name": "Poultry house ventilation fan 1 HP",
  "category": "agri",
  "watts": 950,
  "hoursPerDay": 12,
  "surgeFactor": 3.0,
  "phase": 1,
  "nameAr": "مروحة تهوية دواجن 1 حصان"
 },
 {
  "id": "welding_machine",
  "name": "Welding machine 200 A inverter",
  "category": "workshop",
  "watts": 5000,
  "hoursPerDay": 2,
  "surgeFactor": 2.0,
  "phase": 1,
  "nameAr": "ماكينة لحام 200 أمبير"
 },
 {
  "id": "compressor_2hp",
  "name": "Air compressor 2 HP",
  "category": "workshop",
  "watts": 2000,
  "hoursPerDay": 2,
  "surgeFactor": 4.0,
  "phase": 1,
  "nameAr": "ضاغط هواء (كمبروسر) 2 حصان"
 },
 {
  "id": "angle_grinder",
  "name": "Angle grinder / power tool",
  "category": "workshop",
  "watts": 900,
  "hoursPerDay": 1,
  "surgeFactor": 2.0,
  "phase": 1,
  "nameAr": "جلّاخة (صاروخ) / عُدد كهربائية"
 },
 {
  "id": "led_highbay_150w",
  "name": "LED high-bay 150 W (warehouse)",
  "category": "lighting",
  "watts": 150,
  "hoursPerDay": 10,
  "surgeFactor": 1.0,
  "phase": 1,
  "nameAr": "كشاف هاي باي LED 150 واط"
 },
 {
  "id": "ac_package_10ton_3ph",
  "name": "Package AC unit 10 ton (3-phase)",
  "category": "cooling",
  "watts": 12000,
  "hoursPerDay": 8,
  "surgeFactor": 3.0,
  "phase": 3,
  "nameAr": "وحدة تكييف مركزي 10 طن (ثلاثية الأطوار)"
 },
 {
  "id": "vaccine_fridge",
  "name": "Vaccine / medical refrigerator",
  "category": "refrigeration",
  "watts": 150,
  "hoursPerDay": 10,
  "surgeFactor": 4.0,
  "phase": 1,
  "nameAr": "ثلاجة لقاحات / طبية"
 },
 {
  "id": "sterilizer",
  "name": "Autoclave / sterilizer",
  "category": "heating",
  "watts": 1500,
  "hoursPerDay": 1,
  "surgeFactor": 1.0,
  "phase": 1,
  "nameAr": "جهاز تعقيم"
 },
 {
  "id": "street_light_60w",
  "name": "Solar street / yard light 60 W",
  "category": "lighting",
  "watts": 60,
  "hoursPerDay": 12,
  "surgeFactor": 1.0,
  "phase": 1,
  "nameAr": "كشاف شارع / فناء 60 واط"
 },
 {
  "id": "ev_charger_7kw",
  "name": "EV charger 7 kW",
  "category": "appliance",
  "watts": 7000,
  "hoursPerDay": 3,
  "surgeFactor": 1.0,
  "phase": 1,
  "nameAr": "شاحن سيارة كهربائية 7 كيلوواط"
 }
]

export const applianceCategories = Array.from(new Set(appliances.map((a) => a.category)))
// Default share of each category's daily energy that falls after sunset (drives battery sizing)
export const nightShareByCategory: Record<string, number> = { lighting: 90, cooling: 60, refrigeration: 50, electronics: 60, security: 50, office: 10, kitchen: 40, appliance: 30, heating: 50, pump: 20, motor: 20, agri: 20, workshop: 10, other: 40 }

// ---------------- Library search ----------------
// Other names people type for an appliance (English, Sudanese / Gulf Arabic, trade sizes). AC sizes are also searchable in BTU
// ("12000 btu", "18 الف وحدة") and in the "horse" market convention (1 ton ≈ 1.5 حصان, 1.5 ton ≈ 2.25, 2 ton ≈ 3).
const AC = ['ac', 'a/c', 'air conditioner', 'aircon', 'cooling', 'تكييف', 'مكيف']
const AC1 = [...AC, '12000 btu', '12k btu', '1.5 hp', '1.5 حصان', '12000 وحدة', '12 الف وحدة']
const AC15 = [...AC, '18000 btu', '18k btu', '2.25 hp', '2.25 حصان', '18000 وحدة', '18 الف وحدة']
const AC2 = [...AC, '24000 btu', '24k btu', '3 hp', '3 حصان', '24000 وحدة', '24 الف وحدة']
const SPLIT = ['wall split', 'سبلت', 'اسبليت']
const INV = ['dc inverter', 'inverter ac', 'انفرتر']
const FIXED = ['non-inverter', 'on/off', 'conventional', 'عادي']
const LIGHT = ['light', 'lamp', 'lighting', 'اضاءة', 'انارة', 'نور']
const FRIDGE = ['fridge', 'refrigerator', 'ثلاجة', 'تلاجة', 'براد']
const FREEZER = ['freezer', 'deep freezer', 'فريزر', 'ديب فريزر', 'مجمد']
const TV = ['tv', 'television', 'screen', 'تلفزيون', 'تلفاز', 'شاشة']
const PC = ['computer', 'pc', 'كمبيوتر', 'حاسوب']
const CCTV = ['camera', 'cameras', 'security', 'كاميرا', 'كاميرات', 'مراقبة']
const PUMP = ['pump', 'water pump', 'motor', 'طلمبة', 'موتور', 'ماطور', 'مضخة مياه']
const BORE = [...PUMP, 'borehole', 'well', 'deep well', 'submersible', 'بئر', 'بير', 'غاطس']
const MOTOR = ['motor', 'induction motor', 'موتور', 'ماطور', 'محرك']
const HEATER = ['heater', 'water heater', 'سخان']

export const applianceAliases: Record<string, string[]> = {
  led_bulb_10w: [...LIGHT, 'bulb', 'لمبة'], led_tube_18w: [...LIGHT, 'tube', 'fluorescent', 'neon', 'نيون'],
  led_flood_50w: [...LIGHT, 'flood', 'spotlight', 'projector', 'كشاف', 'بروجكتور'], cfl_20w: [...LIGHT, 'energy saver', 'saving lamp', 'موفرة'],
  led_highbay_150w: [...LIGHT, 'highbay', 'warehouse', 'factory', 'هاي باي', 'مستودع', 'مخزن'],
  street_light_60w: [...LIGHT, 'street', 'yard', 'outdoor', 'pole', 'اضاءة شارع', 'عمود انارة'],
  ceiling_fan: ['fan', 'مروحة'], stand_fan: ['fan', 'floor fan', 'table fan', 'مروحة', 'مروحة ستاند', 'مروحة طاولة'],
  evap_cooler: ['air cooler', 'desert cooler', 'swamp cooler', 'cooler', 'مبرد', 'مكيف مويه', 'مكيف ماء', 'تكييف'],
  ac_window_1ton: [...AC1, 'window'], ac_window_1_5ton: [...AC15, 'window'],
  ac_split_1ton_inv: [...AC1, ...SPLIT, ...INV], ac_split_1ton_fixed: [...AC1, ...SPLIT, ...FIXED],
  ac_split_1_5ton_inv: [...AC15, ...SPLIT, ...INV], ac_split_1_5ton_fixed: [...AC15, ...SPLIT, ...FIXED],
  ac_split_2ton_inv: [...AC2, ...SPLIT, ...INV], ac_split_2ton_fixed: [...AC2, ...SPLIT, ...FIXED],
  ac_cassette_4ton_3ph: [...AC, 'ducted', 'central', '48000 btu', '48k btu', '48 الف وحدة', 'دكت', 'مركزي'],
  ac_package_10ton_3ph: [...AC, 'central', 'rooftop', 'package unit', '120000 btu', 'باكيج', 'مكيف مركزي'],
  water_cooler: ['dispenser', 'water dispenser', 'كولر', 'مبرد مياه', 'موزع مياه'],
  fridge_small: [...FRIDGE], fridge_large: [...FRIDGE, 'freezer', 'فريزر'], chest_freezer: [...FREEZER, 'chest'], deep_freezer: [...FREEZER, 'chest freezer'],
  display_chiller: [...FRIDGE, 'showcase', 'cold display', 'chiller', 'شوكيس', 'ثلاجة بقالة'],
  vaccine_fridge: [...FRIDGE, 'medical', 'pharmacy', 'vaccine', 'صيدلية', 'لقاح', 'دواء'],
  tv_led_43: TV, tv_led_65: TV,
  satellite_receiver: ['dish', 'decoder', 'receiver', 'satellite', 'دش', 'ستلايت', 'رسيفر'],
  router: ['wifi', 'internet', 'modem', 'انترنت', 'مودم', 'واي فاي'],
  phone_charger: ['mobile', 'charger', 'جوال', 'موبايل', 'تلفون'],
  laptop: [...PC, 'notebook', 'لاب توب'], desktop_pc: [...PC, 'desktop'],
  printer_laser: ['printer', 'طابعة'], printer_inkjet: ['printer', 'طابعة'],
  photocopier: ['copier', 'photocopy', 'xerox', 'printer', 'تصوير', 'فوتوكوبي'],
  pos_terminal: ['cash register', 'cashier', 'pos', 'كاشير', 'نقاط بيع'],
  cctv_4ch: CCTV, cctv_16ch: CCTV, server_rack: ['server', 'network', 'switch', 'سيرفر', 'شبكة'],
  washing_machine: ['washer', 'laundry', 'غسالة'], electric_iron: ['iron', 'مكواة'],
  microwave: ['oven', 'مايكرويف', 'ميكرويف'], kettle: ['tea', 'جك', 'كاتل', 'كفتيرة'], toaster: ['toast', 'توستر'],
  blender: ['mixer', 'juicer', 'خلاط', 'عصارة'],
  water_heater_geyser: [...HEATER, 'geyser', 'boiler', 'بويلر'], instant_water_heater: [...HEATER, 'instant', 'tankless', 'shower', 'فوري'],
  electric_stove: ['stove', 'cooker', 'hot plate', 'hob', 'cooking', 'بوتاجاز', 'موقد', 'عين'],
  hair_dryer: ['dryer', 'blow dryer', 'سشوار', 'استشوار'], vacuum: ['hoover', 'cleaner', 'مكنسة'],
  pump_surface_0_5hp: PUMP, pump_surface_1hp: PUMP,
  pump_sub_0_5hp: BORE, pump_sub_1hp: BORE, pump_sub_1_5hp: BORE, pump_sub_2hp: BORE, pump_sub_3hp_3ph: BORE, pump_sub_5hp_3ph: BORE,
  pressure_booster: [...PUMP, 'booster', 'pressure pump', 'طلمبة ضغط', 'ماطور ضغط'],
  motor_3ph_5hp: MOTOR, motor_3ph_10hp: MOTOR, motor_3ph_20hp: MOTOR,
  grain_mill: ['mill', 'flour', 'grinder', 'طاحونة', 'مطحنة', 'دقيق'], milking_machine: ['milk', 'dairy', 'حلابة', 'حليب'],
  incubator: ['eggs', 'hatchery', 'poultry', 'فقاسة', 'حضانة', 'دواجن'],
  poultry_fan: ['fan', 'chicken', 'farm', 'exhaust', 'ventilation', 'مروحة', 'شفاط', 'دواجن', 'مزرعة'],
  welding_machine: ['welder', 'welding', 'لحام'], compressor_2hp: ['compressor', 'air', 'كمبروسر', 'كومبريسور', 'ضاغط'],
  angle_grinder: ['grinder', 'drill', 'tools', 'صاروخ', 'دريل', 'شنيور', 'عدد'],
  sterilizer: ['autoclave', 'sterilize', 'clinic', 'تعقيم', 'اوتوكلاف'],
  ev_charger_7kw: ['electric car', 'ev', 'car charger', 'wallbox', 'سيارة', 'شاحن سيارة'],
}

/**
 * Search text normalised for matching: lower case, Western digits, no Arabic diacritics / tatweel, unified alef / ya / ta-marbuta,
 * thousands separators dropped ("12,000" → "12000"), numbers split from units ("2hp" → "2 hp"), punctuation → spaces.
 */
export function normalizeSearch(s: string): string {
  return s.toLowerCase()
    .replace(/[\u0660-\u0669]/g, (d) => String(d.charCodeAt(0) - 0x660)).replace(/[\u06F0-\u06F9]/g, (d) => String(d.charCodeAt(0) - 0x6f0))
    .replace(/[\u064B-\u065F\u0670\u0640]/g, '')
    .replace(/[أإآٱ]/g, 'ا').replace(/ى/g, 'ي').replace(/ة/g, 'ه').replace(/ؤ/g, 'و').replace(/ئ/g, 'ي')
    .replace(/(\d)[,٬](?=\d{3}(?!\d))/g, '$1').replace(/(\d)٫(?=\d)/g, '$1.')
    .replace(/(\d)([^\d\s.])/g, '$1 $2').replace(/([^\d\s.])(\d)/g, '$1 $2')
    .replace(/\.(?!\d)|(?<!\d)\./g, ' ').replace(/[^\p{L}\p{N}.]+/gu, ' ')
    .split(' ').map((w) => w.replace(/^\.+|\.+$/g, '')).filter(Boolean)
    // Arabic definite article: "الثلاجة" finds "ثلاجة"
    .map((w) => (w.length > 3 && /^\u0627\u0644[\u0621-\u064A]/.test(w) ? w.slice(2) : w))
    .join(' ')
}

const isNum = (w: string) => /^\d+(\.\d+)?$/.test(w)
const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
interface Indexed { words: string[]; text: string }
const index = (s: string): Indexed => { const text = normalizeSearch(s); return { words: text.split(' ').filter(Boolean), text } }
/**
 * A query word matches a number exactly ("1.5" ≠ "1"), a word by prefix ("ac" → "AC", not "vacuum"), and from 4 letters anywhere
 * ("light" → "floodlight"). A number + unit ("1.5 hp", "2hp", "12000 btu") must appear together, the unit by prefix.
 */
const hit = (tok: string, ix: Indexed) => {
  if (tok.includes(' ')) return new RegExp(`(^| )${esc(tok)}`).test(ix.text)
  return isNum(tok) ? ix.words.some((w) => isNum(w) && Number(w) === Number(tok))
    : ix.words.some((w) => w.startsWith(tok)) || (tok.length >= 4 && ix.text.includes(tok))
}
/** Query words; with `pairs`, a number and the word after it form one phrase. */
function queryTokens(q: string, pairs: boolean): string[] {
  const ws = normalizeSearch(q).split(' ').filter(Boolean), out: string[] = []
  for (let i = 0; i < ws.length; i++) {
    if (pairs && isNum(ws[i]) && i + 1 < ws.length && !isNum(ws[i + 1])) { out.push(`${ws[i]} ${ws[i + 1]}`); i++ } else out.push(ws[i])
  }
  return out
}

const nameIx = new WeakMap<Appliance, Indexed>(), aliasIx = new WeakMap<Appliance, Indexed>(), firstIx = new WeakMap<Appliance, string[]>()
/**
 * Rank of one query word for an appliance: 3 = a name (English or Arabic) starts with it, 2 = a whole word of the name or of an alias
 * ("fridge" for "Refrigerator"; a number or number + unit in the name), 1 = part of a name word ("fri" → "fridge"), 0 = other alias /
 * category match, -1 = no match.
 */
function weight(tk: string, n: Indexed, al: Indexed, first: string[], ex: Indexed | null): number {
  if (hit(tk, n)) {
    if (!tk.includes(' ') && !isNum(tk) && first.some((w) => w.startsWith(tk))) return 3
    return tk.includes(' ') || isNum(tk) || n.words.includes(tk) ? 2 : 1
  }
  if (hit(tk, al)) return al.words.includes(tk) ? 2 : 0 // a number + unit only in the aliases ("1.5 hp" for a 1-ton AC) stays below the name
  return ex && tk.length >= 3 && hit(tk, ex) ? 0 : -1 // short words ("ac") never match a category label
}
function run(list: Appliance[], toks: string[], extra?: (a: Appliance) => string): Appliance[] {
  const scored: { a: Appliance; score: number; i: number }[] = []
  list.forEach((a, i) => {
    let n = nameIx.get(a); if (!n) { n = index(`${a.name} ${a.nameAr ?? ''}`); nameIx.set(a, n) }
    let al = aliasIx.get(a); if (!al) { al = index((applianceAliases[a.id] ?? []).join(' , ')); aliasIx.set(a, al) }
    let first = firstIx.get(a); if (!first) { first = [a.name, a.nameAr ?? ''].map((x) => normalizeSearch(x).split(' ')[0]).filter(Boolean); firstIx.set(a, first) }
    const ex = extra ? index(extra(a)) : null
    let score = 0
    for (const tk of toks) {
      const w = weight(tk, n, al, first, ex)
      if (w < 0) return
      score += w
    }
    scored.push({ a, score, i })
  })
  return scored.sort((x, y) => y.score - x.score || x.i - y.i).map((x) => x.a)
}
/**
 * Library search: every query word must match (any order, any case) the appliance name (English or Arabic), its aliases or `extra`
 * (e.g. the category labels). Number + unit pairs are matched together first ("1.5 hp" is not the 1.5-ton AC), word by word if that
 * finds nothing. Ranking: names that start with the query, then whole-word name / alias matches ("fridge" → the refrigerators before
 * "Chest fridge / chest freezer", which only shares the word), then partial name matches, then alias / category matches; library
 * order otherwise.
 */
export function searchAppliances(list: Appliance[], query: string, extra?: (a: Appliance) => string): Appliance[] {
  const paired = queryTokens(query, true)
  if (!paired.length) return list
  const r = run(list, paired, extra)
  return r.length || paired.every((x) => !x.includes(' ')) ? r : run(list, queryTokens(query, false), extra)
}
