import type { Project, LoadItem } from '../engine/types'
import { newProject, siteFromLocation, defaultDesign, defaultPricing, loadFromAppliance } from '../engine/defaults'
import { appliances } from './appliances'

const A = (id: string, qty = 1, patch: Partial<LoadItem> = {}): LoadItem | null => {
  const a = appliances.find((x) => x.id === id); if (!a) return null
  return { ...loadFromAppliance(a, qty), ...patch }
}
const pick = (...xs: (LoadItem | null)[]) => xs.filter((x): x is LoadItem => !!x)

export const loadTemplates: { key: 'tplSmallHome' | 'tplFamilyHome' | 'tplShop' | 'tplFarm' | 'tplClinic'; build: () => LoadItem[] }[] = [
  { key: 'tplSmallHome', build: () => pick(A('led_bulb_10w', 6), A('ceiling_fan', 2), A('tv_led_43', 1), A('fridge_small', 1), A('phone_charger', 3), A('router', 1)) },
  { key: 'tplFamilyHome', build: () => pick(A('led_bulb_10w', 12), A('ceiling_fan', 4), A('ac_split_1_5ton_inv', 2, { hoursPerDay: 8, nightSharePct: 70 }), A('fridge_large', 1), A('deep_freezer', 1), A('tv_led_65', 1), A('washing_machine', 1), A('pump_surface_1hp', 1), A('router', 1), A('laptop', 2), A('microwave', 1), A('electric_iron', 1)) },
  { key: 'tplShop', build: () => pick(A('led_tube_18w', 10), A('ac_split_2ton_inv', 1, { hoursPerDay: 9, nightSharePct: 10 }), A('desktop_pc', 2, { nightSharePct: 5 }), A('printer_laser', 1), A('pos_terminal', 1), A('display_chiller', 1), A('cctv_4ch', 1), A('router', 1)) },
  { key: 'tplFarm', build: () => pick(A('pump_sub_2hp', 1, { hoursPerDay: 6, nightSharePct: 0, critical: true }), A('led_bulb_10w', 4), A('phone_charger', 2)) },
  { key: 'tplClinic', build: () => pick(A('led_tube_18w', 12), A('ac_split_1_5ton_inv', 2, { hoursPerDay: 10 }), A('vaccine_fridge', 1), A('desktop_pc', 2), A('printer_laser', 1), A('sterilizer', 1), A('pump_surface_1hp', 1), A('cctv_4ch', 1), A('router', 1)) },
]

export function sampleProjects(): Project[] {
  const fam = newProject({ name: 'Al-Riyadh Villa — Hybrid 10 kW', clientName: 'Ahmed Al-Fahad', clientAddress: 'Al Yasmin, Riyadh', reference: 'Q-2026-0112', status: 'quoted' })
  fam.site = siteFromLocation('riyadh'); fam.design = { ...defaultDesign('hybrid'), systemVoltage: 48, autonomyDays: 1 }; fam.loads = loadTemplates[1].build(); fam.pricing = defaultPricing(20, 15)
  const off = newProject({ name: 'El Obeid Farm — Off-grid pump', clientName: 'Mariam Osman', clientAddress: 'El Obeid, North Kordofan', reference: 'Q-2026-0098', status: 'draft' })
  off.site = { ...siteFromLocation('el-obeid'), gridTariff: 0.45 }; off.design = { ...defaultDesign('offgrid'), systemVoltage: 48, autonomyDays: 0.5, generatorBackup: false }; off.loads = loadTemplates[3].build(); off.pricing = defaultPricing(18, 0)
  const shop = newProject({ name: 'Khartoum Pharmacy — Hybrid backup', clientName: 'Dr. Salah Pharmacy', clientAddress: 'Al Amarat St 15, Khartoum', reference: 'Q-2026-0105', status: 'approved' })
  shop.site = { ...siteFromLocation('khartoum'), gridTariff: 0.35 }; shop.design = { ...defaultDesign('hybrid'), systemVoltage: 48, autonomyDays: 1 }; shop.loads = loadTemplates[2].build(); shop.pricing = defaultPricing(22, 0)
  const grid = newProject({ name: 'Dubai Warehouse — 100 kW grid-tied', clientName: 'Gulf Logistics LLC', clientAddress: 'Jebel Ali Free Zone', reference: 'Q-2026-0120', status: 'draft' })
  grid.site = { ...siteFromLocation('dubai'), roofType: 'metal-sheet', availableAreaM2: 900 }; grid.design = { ...defaultDesign('gridtie'), phase: 3, coincidenceFactor: 0.9 }
  grid.loads = pick(A('led_highbay_150w', 60, { hoursPerDay: 10, nightSharePct: 20 }), A('ac_package_10ton_3ph', 2, { hoursPerDay: 10, nightSharePct: 10, phase: 3 }), A('motor_3ph_10hp', 1, { hoursPerDay: 8, nightSharePct: 0, phase: 3 }), A('desktop_pc', 15, { nightSharePct: 5 }), A('server_rack', 1)); grid.pricing = defaultPricing(15, 5)
  return [fam, off, shop, grid]
}
