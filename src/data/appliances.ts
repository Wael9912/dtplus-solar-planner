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
  "nameAr": "مكيف كاسيت 4 طن (3 فاز)"
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
  "nameAr": "ثلاجة صغيرة 150–250 لتر"
 },
 {
  "id": "fridge_large",
  "name": "Refrigerator-freezer 400-600 L",
  "category": "refrigeration",
  "watts": 200,
  "hoursPerDay": 9,
  "surgeFactor": 4.0,
  "phase": 1,
  "nameAr": "ثلاجة كبيرة 400–600 لتر"
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
  "nameAr": "نقطة بيع + طابعة فواتير"
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
  "nameAr": "سيرفر وشبكة"
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
  "nameAr": "سخان مياه 50–80 لتر"
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
  "watts": 400,
  "hoursPerDay": 2,
  "surgeFactor": 3.0,
  "phase": 1,
  "nameAr": "مضخة سطحية 0.5 حصان"
 },
 {
  "id": "pump_surface_1hp",
  "name": "Surface water pump 1 HP",
  "category": "pump",
  "watts": 750,
  "hoursPerDay": 2,
  "surgeFactor": 3.0,
  "phase": 1,
  "nameAr": "مضخة سطحية 1 حصان"
 },
 {
  "id": "pump_sub_0_5hp",
  "name": "Submersible well pump 0.5 HP",
  "category": "pump",
  "watts": 400,
  "hoursPerDay": 3,
  "surgeFactor": 5.0,
  "phase": 1,
  "nameAr": "مضخة غاطسة 0.5 حصان"
 },
 {
  "id": "pump_sub_1hp",
  "name": "Submersible well pump 1 HP",
  "category": "pump",
  "watts": 750,
  "hoursPerDay": 3,
  "surgeFactor": 5.0,
  "phase": 1,
  "nameAr": "مضخة غاطسة 1 حصان"
 },
 {
  "id": "pump_sub_1_5hp",
  "name": "Submersible well pump 1.5 HP",
  "category": "pump",
  "watts": 1100,
  "hoursPerDay": 4,
  "surgeFactor": 5.0,
  "phase": 1,
  "nameAr": "مضخة غاطسة 1.5 حصان"
 },
 {
  "id": "pump_sub_2hp",
  "name": "Submersible well pump 2 HP",
  "category": "pump",
  "watts": 1500,
  "hoursPerDay": 4,
  "surgeFactor": 5.0,
  "phase": 1,
  "nameAr": "مضخة غاطسة 2 حصان"
 },
 {
  "id": "pump_sub_3hp_3ph",
  "name": "Submersible well pump 3 HP (3-phase)",
  "category": "pump",
  "watts": 2200,
  "hoursPerDay": 5,
  "surgeFactor": 5.0,
  "phase": 3,
  "nameAr": "مضخة غاطسة 3 حصان (3 فاز)"
 },
 {
  "id": "pump_sub_5hp_3ph",
  "name": "Submersible well pump 5 HP (3-phase)",
  "category": "pump",
  "watts": 3700,
  "hoursPerDay": 6,
  "surgeFactor": 5.0,
  "phase": 3,
  "nameAr": "مضخة غاطسة 5 حصان (3 فاز)"
 },
 {
  "id": "pressure_booster",
  "name": "Pressure booster pump 0.75 HP",
  "category": "pump",
  "watts": 550,
  "hoursPerDay": 1.5,
  "surgeFactor": 3.0,
  "phase": 1,
  "nameAr": "مضخة ضغط 0.75 حصان"
 },
 {
  "id": "motor_3ph_5hp",
  "name": "3-phase induction motor 5 HP",
  "category": "motor",
  "watts": 3700,
  "hoursPerDay": 6,
  "surgeFactor": 4.0,
  "phase": 3,
  "nameAr": "موتور 3 فاز 5 حصان"
 },
 {
  "id": "motor_3ph_10hp",
  "name": "3-phase induction motor 10 HP",
  "category": "motor",
  "watts": 7500,
  "hoursPerDay": 6,
  "surgeFactor": 4.0,
  "phase": 3,
  "nameAr": "موتور 3 فاز 10 حصان"
 },
 {
  "id": "motor_3ph_20hp",
  "name": "3-phase induction motor 20 HP",
  "category": "motor",
  "watts": 15000,
  "hoursPerDay": 6,
  "surgeFactor": 4.0,
  "phase": 3,
  "nameAr": "موتور 3 فاز 20 حصان"
 },
 {
  "id": "grain_mill",
  "name": "Grain / flour mill 7.5 HP (3-phase)",
  "category": "agri",
  "watts": 5500,
  "hoursPerDay": 4,
  "surgeFactor": 4.0,
  "phase": 3,
  "nameAr": "طاحونة حبوب 7.5 حصان (3 فاز)"
 },
 {
  "id": "milking_machine",
  "name": "Milking machine 1 HP",
  "category": "agri",
  "watts": 750,
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
  "watts": 750,
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
  "watts": 1500,
  "hoursPerDay": 2,
  "surgeFactor": 4.0,
  "phase": 1,
  "nameAr": "كمبروسر هواء 2 حصان"
 },
 {
  "id": "angle_grinder",
  "name": "Angle grinder / power tool",
  "category": "workshop",
  "watts": 900,
  "hoursPerDay": 1,
  "surgeFactor": 2.0,
  "phase": 1,
  "nameAr": "صاروخ / عدة كهربائية"
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
  "nameAr": "وحدة تكييف مركزي 10 طن (3 فاز)"
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
  "nameAr": "عمود إنارة 60 واط"
 },
 {
  "id": "ev_charger_7kw",
  "name": "EV charger 7 kW",
  "category": "appliance",
  "watts": 7000,
  "hoursPerDay": 3,
  "surgeFactor": 1.0,
  "phase": 1,
  "nameAr": "شاحن سيارة كهربائية 7 ك.و"
 }
]

export const applianceCategories = Array.from(new Set(appliances.map((a) => a.category)))
// Default share of each category's daily energy that falls after sunset (drives battery sizing)
export const nightShareByCategory: Record<string, number> = { lighting: 90, cooling: 60, refrigeration: 50, electronics: 60, security: 50, office: 10, kitchen: 40, appliance: 30, heating: 50, pump: 20, motor: 20, agri: 20, workshop: 10, other: 40 }
