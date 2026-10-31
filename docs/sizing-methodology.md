# Solar PV Project Sizing Tool — Engineering Methodology Specification

Version 1.0 — 2026-10-31. Scope: off-grid, hybrid/backup and grid-tied PV systems, single- and three-phase, residential / commercial / agricultural. This document is the implementation spec: every formula, default, rounding rule and standard-size list below is to be implemented as written. All quantities carry explicit units. "ceil" = round up to the next integer; "nextStd(x, list)" = smallest value in list that is ≥ x.

Conventions used throughout:
- Energy in Wh (daily) or kWh (annual); power in W / kW (real) and VA / kVA (apparent); voltage in V; current in A; cable area in mm²; temperature in °C; irradiation in kWh/m²/day (= Peak Sun Hours, PSH).
- STC = 1000 W/m², 25 °C cell, AM1.5. NOCT (NMOT) = 800 W/m², 20 °C ambient, 1 m/s wind.
- 1 HP = 746 W (motor shaft); use electrical input W from the appliance library (already includes motor efficiency).
- Inverter power factor default PF = 1.0 for sizing from W unless the user supplies kVA (then kW = kVA × 0.8).

---

## 1. LOAD ANALYSIS

### 1.1 Daily energy
```
E_day [Wh/day] = Σ_i ( W_i × qty_i × hours_i )
```
W_i = rated running watts of appliance i (electrical input), qty_i = count, hours_i = running hours per day. For thermostat-controlled loads (fridges, freezers, ACs, water heaters) hours_i is the compressor/element ON time, not the plugged-in time — the library values already reflect duty-cycled ON hours (e.g. a fridge plugged in 24 h runs ~8–10 h).

Optional user-supplied monthly variation: `E_day_month[m] = E_day × seasonFactor[m]` (default factor 1.0; a cooling-dominated home might use 1.3 in summer, 0.6 in winter). Use the worst month for off-grid sizing when the user enables seasonality.

### 1.2 Peak running power
```
P_sum [W]   = Σ_i ( W_i × qty_i )                    (everything on at once)
P_peak [W]  = P_sum × DF                              (design peak, DF = diversity/coincidence factor)
```
Diversity (coincidence) factor DF — fraction of connected load expected to run simultaneously. Defaults:

| Installation | DF default | Notes |
|---|---|---|
| ≤ 5 appliance lines, or any critical/backup-only panel | 1.00 | assume all on |
| Residential, 6–15 lines | 0.80 | IEEE/utility residential coincidence 0.7–0.9 |
| Residential, > 15 lines | 0.70 | |
| Office / retail | 0.80 | |
| Workshop / agri with several motors | 0.75 | motors seldom all start together |
| User override | any 0.5–1.0 | expose as an advanced input |

Reference for coincidence-factor concept and ranges (Schneider Electric Electrical Installation Guide, "Estimation of actual maximum kVA demand", ks factors 0.6–1.0): https://www.electrical-installation.org/enwiki/Estimation_of_actual_maximum_kVA_demand

Loads flagged `phase = 3` are balanced across three phases: per-phase W = W/3. For single-phase loads on a 3-phase system, the tool distributes them round-robin by descending W to the three phases and reports the max phase load (`P_phase_max`). Inverter sizing in a 3-phase system uses `3 × P_phase_max × 1.25` so an unbalanced phase does not overload one leg.

### 1.3 Surge (starting) power
```
S_i [W]        = W_i × surgeFactor_i                               (starting watts of one unit of appliance i)
P_surge [W]    = P_peak + max_i ( S_i − W_i )                       (largest single motor starts while everything else runs)
```
Only the single largest surge is added (motors are assumed not to start simultaneously; if the user marks two motors "start together", add both). Surge factors by appliance class (confirmed against generator/inverter sizing guides: https://backuppowercalc.com/guides/running-vs-starting-watts.html , https://solarsizecalculator.com/surge-watt-calculator/ , https://www.victronenergyus.com/blog/offgrid-victron-energy-checklist-inverter-sizing-bluesolar-mppt-7515-limits-and-the-136.html ):

| Class | Examples | surgeFactor (× running W) | Duration |
|---|---|---|---|
| Resistive | lights, heaters, kettle, iron, geyser, cooktop | 1.0 | — |
| Electronic (SMPS) | TV, router, laptop, LED drivers, chargers | 1.0–1.2 | ms |
| Universal / brushed motors | blender, drill, vacuum, hair dryer, grinder | 2.0 | < 1 s |
| Inverter-driven compressors | inverter split AC, inverter fridge | 1.5–2.0 | soft start |
| Induction motors, fixed-speed compressors, surface pumps, fans | fridge, freezer, fixed-speed AC, washing machine, surface pump | 3.0–5.0 (fridge 4, AC 3–3.5, fan 1.5) | 0.5–3 s |
| Submersible / well pumps, air compressors, 3-ph motors direct-on-line | borehole pump, compressor | 4.0–7.0 (default 5) | 1–3 s |
| Welders | inverter welder | 2.0 | |

If the nameplate gives LRA (locked-rotor amps): `S_i = LRA × V`. If the motor has a soft-starter or VFD, use surgeFactor 1.5–2.0.

### 1.4 Day / night energy split (hybrid and off-grid battery sizing)
Each appliance carries an optional `nightFraction_i` (0–1, share of its daily hours that fall in the no-sun window). Defaults by category: lighting 0.9, cooling (AC/fans) 0.6, refrigeration 0.5 (runs 24 h), electronics/TV 0.6, router/CCTV/server 0.5, kitchen 0.4, pumps 0.2 (schedule for daytime), office/POS 0.1, water heater 0.5, agri motors 0.2.
```
E_night [Wh] = Σ_i ( W_i × qty_i × hours_i × nightFraction_i )
E_day_sun [Wh] = E_day − E_night
f_night      = E_night / E_day            (0–1)
```
A global override `f_night` (e.g. 0.60 in worked example (b)) replaces the per-appliance split when supplied. Default f_night when nothing is known: residential 0.60, commercial/office 0.25, agri pumping 0.10, off-grid (conservative) 1.00 (i.e. size the battery for the full day's load with the autonomy term — see §4).

Reporting: show E_day (kWh/day), monthly kWh = E_day × 30.4, P_sum, P_peak, P_surge, f_night, E_night, and the largest-surge appliance name.

---

## 2. APPLIANCE LIBRARY

66 entries. Watts are typical electrical input for a mid-size current-production unit in a hot-climate market (Sudan / Gulf); `hoursPerDay` are typical ON hours (duty-cycled for thermostatic loads); `surgeFactor` per §1.3; `phase` 1 or 3. Users can edit every number. AC tonnage: 1 ton = 12,000 BTU/h = 3.517 kW cooling; input W ≈ cooling kW / COP (COP 2.8–3.5 for modern splits; fixed-speed units draw ~1.2 kW/ton, inverter units ~0.85–0.9 kW/ton average). Pump watts: HP × 746 W / motor efficiency (~0.75 for small single-phase, ~0.85 for 3-phase) ≈ HP × 750–1000 W input; library uses ~750 W/HP for ≥1 HP and 800 W/HP for 0.5 HP.

Sources for typical wattages: U.S. DOE appliance energy calculator https://www.energy.gov/energysaver/estimating-appliance-and-home-electronic-energy-use ; generator wattage charts https://whatsizeappliance.com/generator/wattage-chart/ , https://wattcalcs.com/tables/appliance-wattage/ ; AC input power per ton https://www.thegreenwatt.com/inverter-size-calculator/ .

| id | Appliance | Category | Rated W | Typical h/day | Daily Wh | Surge × | Phase |
|---|---|---|---|---|---|---|---|
| led_bulb_10w | LED bulb 10 W | lighting | 10 | 6 | 60 | 1.0 | 1 |
| led_tube_18w | LED tube light 18 W | lighting | 18 | 6 | 108 | 1.0 | 1 |
| led_flood_50w | LED floodlight 50 W | lighting | 50 | 10 | 500 | 1.0 | 1 |
| cfl_20w | CFL lamp 20 W | lighting | 20 | 5 | 100 | 1.0 | 1 |
| ceiling_fan | Ceiling fan | cooling | 70 | 8 | 560 | 1.5 | 1 |
| stand_fan | Pedestal / stand fan | cooling | 55 | 6 | 330 | 1.5 | 1 |
| evap_cooler | Evaporative (desert) air cooler | cooling | 250 | 8 | 2000 | 3.0 | 1 |
| ac_window_1ton | Window AC 1 ton (12,000 BTU) | cooling | 1300 | 8 | 10400 | 3.5 | 1 |
| ac_window_1_5ton | Window AC 1.5 ton (18,000 BTU) | cooling | 1900 | 8 | 15200 | 3.5 | 1 |
| ac_split_1ton_inv | Split AC 1 ton inverter | cooling | 1000 | 8 | 8000 | 2.0 | 1 |
| ac_split_1ton_fixed | Split AC 1 ton fixed-speed | cooling | 1200 | 8 | 9600 | 3.0 | 1 |
| ac_split_1_5ton_inv | Split AC 1.5 ton inverter | cooling | 1300 | 8 | 10400 | 2.0 | 1 |
| ac_split_1_5ton_fixed | Split AC 1.5 ton fixed-speed | cooling | 1800 | 8 | 14400 | 3.0 | 1 |
| ac_split_2ton_inv | Split AC 2 ton inverter | cooling | 1800 | 8 | 14400 | 2.0 | 1 |
| ac_split_2ton_fixed | Split AC 2 ton fixed-speed | cooling | 2400 | 8 | 19200 | 3.0 | 1 |
| ac_cassette_4ton_3ph | Cassette / ducted AC 4 ton (3-phase) | cooling | 4800 | 8 | 38400 | 3.0 | 3 |
| water_cooler | Water cooler / dispenser (hot+cold) | appliance | 120 | 10 | 1200 | 3.0 | 1 |
| fridge_small | Refrigerator 150-250 L | refrigeration | 120 | 8 | 960 | 4.0 | 1 |
| fridge_large | Refrigerator-freezer 400-600 L | refrigeration | 200 | 9 | 1800 | 4.0 | 1 |
| chest_freezer | Chest fridge / chest freezer 300 L | refrigeration | 150 | 8 | 1200 | 4.0 | 1 |
| deep_freezer | Deep freezer 500 L | refrigeration | 250 | 10 | 2500 | 4.0 | 1 |
| display_chiller | Commercial display chiller / cold cabinet | refrigeration | 600 | 12 | 7200 | 3.5 | 1 |
| tv_led_43 | LED TV 43 in | electronics | 80 | 5 | 400 | 1.0 | 1 |
| tv_led_65 | LED TV 65 in | electronics | 150 | 5 | 750 | 1.0 | 1 |
| satellite_receiver | Satellite receiver / decoder | electronics | 20 | 5 | 100 | 1.0 | 1 |
| router | Wi-Fi router / modem | electronics | 10 | 24 | 240 | 1.0 | 1 |
| phone_charger | Phone charger | electronics | 10 | 3 | 30 | 1.0 | 1 |
| laptop | Laptop | electronics | 60 | 6 | 360 | 1.0 | 1 |
| desktop_pc | Desktop PC with monitor | electronics | 200 | 8 | 1600 | 1.2 | 1 |
| printer_laser | Laser printer | office | 500 | 1 | 500 | 1.5 | 1 |
| printer_inkjet | Inkjet printer | office | 30 | 1 | 30 | 1.0 | 1 |
| photocopier | Photocopier (office) | office | 1200 | 2 | 2400 | 1.5 | 1 |
| pos_terminal | POS terminal + receipt printer | office | 50 | 10 | 500 | 1.0 | 1 |
| cctv_4ch | CCTV 4 cameras + DVR/NVR | security | 50 | 24 | 1200 | 1.0 | 1 |
| cctv_16ch | CCTV 16 cameras + NVR | security | 150 | 24 | 3600 | 1.0 | 1 |
| server_rack | Server / network rack (1 server + switch) | office | 400 | 24 | 9600 | 1.2 | 1 |
| washing_machine | Washing machine (front/top load) | appliance | 500 | 1 | 500 | 3.0 | 1 |
| electric_iron | Electric iron | appliance | 1200 | 0.5 | 600 | 1.0 | 1 |
| microwave | Microwave oven | kitchen | 1200 | 0.5 | 600 | 1.5 | 1 |
| kettle | Electric kettle | kitchen | 2000 | 0.3 | 600 | 1.0 | 1 |
| toaster | Toaster | kitchen | 900 | 0.2 | 180 | 1.0 | 1 |
| blender | Blender / juicer | kitchen | 400 | 0.2 | 80 | 2.0 | 1 |
| water_heater_geyser | Electric water heater 50-80 L (geyser) | heating | 2000 | 2 | 4000 | 1.0 | 1 |
| instant_water_heater | Instant electric water heater | heating | 4500 | 0.5 | 2250 | 1.0 | 1 |
| electric_stove | Electric cooktop (2 plates) | kitchen | 2500 | 1 | 2500 | 1.0 | 1 |
| hair_dryer | Hair dryer | appliance | 1500 | 0.2 | 300 | 1.2 | 1 |
| vacuum | Vacuum cleaner | appliance | 1200 | 0.3 | 360 | 2.0 | 1 |
| pump_surface_0_5hp | Surface water pump 0.5 HP | pump | 400 | 2 | 800 | 3.0 | 1 |
| pump_surface_1hp | Surface water pump 1 HP | pump | 750 | 2 | 1500 | 3.0 | 1 |
| pump_sub_0_5hp | Submersible well pump 0.5 HP | pump | 400 | 3 | 1200 | 5.0 | 1 |
| pump_sub_1hp | Submersible well pump 1 HP | pump | 750 | 3 | 2250 | 5.0 | 1 |
| pump_sub_1_5hp | Submersible well pump 1.5 HP | pump | 1100 | 4 | 4400 | 5.0 | 1 |
| pump_sub_2hp | Submersible well pump 2 HP | pump | 1500 | 4 | 6000 | 5.0 | 1 |
| pump_sub_3hp_3ph | Submersible well pump 3 HP (3-phase) | pump | 2200 | 5 | 11000 | 5.0 | 3 |
| pump_sub_5hp_3ph | Submersible well pump 5 HP (3-phase) | pump | 3700 | 6 | 22200 | 5.0 | 3 |
| pressure_booster | Pressure booster pump 0.75 HP | pump | 550 | 1.5 | 825 | 3.0 | 1 |
| motor_3ph_5hp | 3-phase induction motor 5 HP | motor | 3700 | 6 | 22200 | 4.0 | 3 |
| motor_3ph_10hp | 3-phase induction motor 10 HP | motor | 7500 | 6 | 45000 | 4.0 | 3 |
| motor_3ph_20hp | 3-phase induction motor 20 HP | motor | 15000 | 6 | 90000 | 4.0 | 3 |
| grain_mill | Grain / flour mill 7.5 HP (3-phase) | agri | 5500 | 4 | 22000 | 4.0 | 3 |
| milking_machine | Milking machine 1 HP | agri | 750 | 2 | 1500 | 3.0 | 1 |
| incubator | Egg incubator (medium) | agri | 150 | 24 | 3600 | 1.0 | 1 |
| poultry_fan | Poultry house ventilation fan 1 HP | agri | 750 | 12 | 9000 | 3.0 | 1 |
| welding_machine | Welding machine 200 A inverter | workshop | 5000 | 2 | 10000 | 2.0 | 1 |
| compressor_2hp | Air compressor 2 HP | workshop | 1500 | 2 | 3000 | 4.0 | 1 |
| angle_grinder | Angle grinder / power tool | workshop | 900 | 1 | 900 | 2.0 | 1 |

The same data as a JSON array is in Appendix A (fields: id, name, category, watts, hoursPerDay, surgeFactor, phase).

---

## 3. PV ARRAY SIZING

### 3.1 Core formula
```
PV_kWp_required = (E_day [Wh] / 1000) / ( PSH [kWh/m²/day] × D_eff )
N_panels        = ceil( PV_kWp_required × 1000 / P_module [W] )
PV_kWp_installed = N_panels × P_module / 1000
```
PSH = long-term average daily global irradiation on the array plane (GTI at the chosen tilt; if only GHI is available, use GHI — at latitude-tilt in the tropics GTI ≈ 1.0–1.08 × GHI). Source of PSH: Global Solar Atlas (https://globalsolaratlas.info — "GTI opta" or "GHI" annual kWh/m² ÷ 365.25) or PVGIS (https://re.jrc.ec.europa.eu/pvg_tools/en/ — monthly H(i) kWh/m² ÷ days). The tool should accept annual PSH plus optional 12 monthly PSH values.

Sizing basis selector: `annual` (uses average PSH; grid-tied default) or `worstMonth` (uses min monthly PSH; off-grid default when monthly data supplied). When only annual PSH is given for off-grid, apply `offGridMargin = 1.20` (covers worst-month and battery recharge after cloudy days):
```
PV_kWp_offgrid = PV_kWp_required × offGridMargin
```

### 3.2 Derate (performance ratio) components
D_eff is a product of independent factors. Each is user-editable; defaults below.

| Loss | Symbol | Default factor | Typical range | Notes / source |
|---|---|---|---|---|
| Module temperature | f_temp | computed (§3.3); hot climate ≈ 0.88–0.90 | 0.85–0.97 | γ_Pmax × (T_cell − 25) |
| Soiling | f_soil | 0.97 (dusty/desert 0.95) | 2–5 % loss | PVWatts default 2 % https://pvwatts.nrel.gov/downloads/pvwattsv5.pdf |
| Shading (horizon, no near obstacles) | f_shade | 0.97 | 0–3 % | PVWatts default 3 % |
| DC + AC wiring | f_wire | 0.98 | 2–3 % loss | PVWatts 2 % |
| Module mismatch | f_mm | 0.98 | 2 % | PVWatts 2 % |
| Connectors | f_conn | 0.995 | 0.5 % | PVWatts |
| LID | f_lid | 0.985 | 1.5 % | PVWatts |
| Nameplate tolerance | f_np | 0.99 | 1 % (0 % for positive-tolerance modules) | PVWatts |
| Availability / downtime | f_avail | 0.97 | 3 % | PVWatts |
| Inverter (DC→AC) | η_inv | 0.96 | 0.95–0.975 | datasheet "Euro/CEC efficiency"; Deye 50K 97.0 % Euro https://www.deyeinverter.com/deyeinverter/2023/12/18/datasheet_sun-29.9-50k-sg01hp3-eu-bm4_231218_en.pdf |
| MPPT charge controller (if separate) | η_cc | 0.97 | 0.95–0.98 | HOMER guidance to fold into derate https://homerenergy.com/docs/knowledgebase/article/can-homer-model-a-charge-controller/ |
| Battery round trip (energy that passes through the battery) | η_batt | LiFePO4 0.92; AGM/Gel 0.80; flooded 0.78 | LFP 0.85–0.95; lead-acid 0.75–0.85 | https://gridwright.com/blog/lifepo4-vs-agm |

PVWatts reference: default total DC-side system losses 14 % (→ 0.86) **excluding** inverter efficiency (default 96 %) and temperature (modelled hourly). Together ≈ 0.86 × 0.96 = 0.826 before temperature. Source: NREL PVWatts V5 manual, Table 6 (https://pvwatts.nrel.gov/downloads/pvwattsv5.pdf). HOMER uses a single "PV derating factor" with 80 % as the conventional value, into which temperature (if not modelled) and charge-controller efficiency are folded (https://homerenergy.com/products/pro/docs/latest/pv_derating_factor.html).

Composite derates the tool shall compute:
```
D_pv   = f_temp × f_soil × f_shade × f_wire × f_mm × f_conn × f_lid × f_np × f_avail × η_inv      (energy delivered directly to AC loads / grid)
D_eff  = D_pv × [ (1 − f_night) + f_night × η_batt ] × η_cc(if separate controller)              (hybrid / off-grid: only the night share passes through the battery)
```
Resulting typical values (the fixtures in §13 use the rounded defaults in bold so tests are deterministic):
- Grid-tied, temperate: D_pv ≈ 0.83; **grid-tied hot climate (Gulf/Sahel) D_pv = 0.80** (f_temp ≈ 0.90, soiling 0.95).
- Hybrid hot climate: D_pv = 0.80, η_batt 0.92 → D_eff = 0.80 × [(1−f_night) + 0.92 f_night]; with f_night 0.6 → **0.7616**.
- Off-grid (everything through battery + separate MPPT): 0.80 × 0.92 × 0.97 ≈ **0.70** (range 0.65–0.75; lead-acid ≈ 0.60–0.65).

### 3.3 Module temperature (NOCT method) and temperature loss
```
T_cell [°C]  = T_amb + ( (NOCT − 20) / 800 ) × G          G in W/m², NOCT from datasheet (typ. 42–47 °C)
f_temp       = 1 + γ_Pmax × ( T_cell − 25 )               γ_Pmax negative, e.g. −0.0030 /°C (−0.30 %/°C; range −0.26 to −0.45 %/°C)
```
Source: Sandia/Duffie-Beckman NOCT model, e.g. https://www.sciencedirect.com/topics/engineering/cell-temperature , https://www.solarnplus.com/how-to-calculate-pv-cell-temperature/ . For annual energy use the average daytime ambient at G = 800 W/m² (T_cell = T_amb_day + 25 for NOCT 45). Example: Khartoum average daytime ambient 36 °C → T_cell = 61 °C → f_temp = 1 − 0.0030 × 36 = 0.892. For string design (§7) use the extremes: cold = site design-low ambient at G ≈ 0 (T_cell = T_amb_min); hot = 70 °C cell (≥ 75 °C for roof-integrated / desert; derive from T_amb_max + 30 °C when known).

Users supply `T_amb_day_avg` (default 30 °C), `T_amb_min_design` (ASHRAE extreme annual mean minimum or record low; NEC 690.7(A) informational note points to the ASHRAE extreme mean minimum — https://www.mikeholt.com/newsletters.php?action=display&letterID=2809) and `T_cell_hot` (default 70 °C).

### 3.4 DC:AC ratio and oversizing
```
DC_AC = PV_kWp_installed / P_inverter_kW_AC
```
Guidance: grid-tied 1.10–1.30 (clipping losses < 1–2 % up to 1.25; hot climates tolerate higher ratios because output rarely reaches STC), hybrid 1.0–1.5 limited by the inverter's "max PV input power" (e.g. Deye SUN-50K: 65–100 kWp on a 50 kW unit), off-grid often 1.2–2.0 because the array also recharges the battery. Never exceed the inverter's datasheet max PV input power or max input current (§7). Reference: NREL PVWatts clipping note (https://pvwatts.nrel.gov/downloads/pvwattsv5.pdf); SMA/Deye design guides.

---

## 4. BATTERY SIZING

### 4.1 Capacity
```
E_batt_daily [Wh] = E_day × f_night                     (hybrid: night load only; off-grid default f_night = 1.0 → full day)
C_batt_Wh         = ( E_batt_daily × N_autonomy ) / ( DoD × η_inv × f_tempBatt )
C_batt_Ah_system  = C_batt_Wh / V_system_nominal
```
- N_autonomy [days]: hybrid/backup with grid 1 (one night, default), 0.5 for "essential loads only" backup; off-grid 1–3 (default 2 for lead-acid without generator, 1 for LiFePO4 with generator backup). Confirmed ranges: https://techfinepv.com/off-grid-battery-bank-sizing/ , https://www.unboundsolar.com/solar-information/battery-bank-sizing
- DoD: LiFePO4 0.80 (planning value; 0.90 allowed if manufacturer warrants 90 %+), AGM 0.50, Gel 0.50, flooded lead-acid 0.50, NMC 0.80 (https://bigbattery.com/2026/08/31/off-grid-cabin-battery-system-sizing/).
- η_inv: inverter efficiency on battery discharge, 0.95 default.
- f_tempBatt: lead-acid capacity derate 1.0 at 25 °C, 0.9 at 10 °C, 0.8 at 0 °C; LiFePO4 1.0 (BMS prohibits charge below 0 °C — note only).

### 4.2 Modules, series/parallel, system voltage
Battery units are defined by (V_unit, Ah_unit, kWh_unit, chemistry, maxChargeA, maxDischargeA). Example unit used in fixtures: 51.2 V, 100 Ah, 5.12 kWh LiFePO4 rack module.
```
N_series   = round( V_system_nominal / V_unit )          (must be an integer ≥ 1; 48 V system with 51.2 V unit → 1)
N_parallel = ceil( C_batt_Wh / ( kWh_unit × 1000 × N_series ) )
N_units    = N_series × N_parallel
C_installed_kWh = N_units × kWh_unit ;  C_usable_kWh = C_installed_kWh × DoD
Autonomy_actual_days = C_usable_kWh × 1000 × η_inv / E_batt_daily
```
Nominal/absorption/cut-off voltages: 12 V LFP unit = 12.8 V (4S cells), 24 V = 25.6 V, 48 V = 51.2 V (16S); lead-acid 12/24/48 V. Parallel strings: ≤ 4 parallel for lead-acid; LiFePO4 rack modules typically ≤ 16 in parallel per manufacturer with a busbar/combiner.

System voltage by inverter size (standard practice; also Victron sizing guides https://shop.alchemyindustrial.com/blogs/news/how-to-size-a-victron-off-grid-power-system):

| Inverter continuous power | Recommended DC bus | Max current at full power (approx.) |
|---|---|---|
| < 1 kW | 12 V | ≤ 90 A |
| 1–3 kW | 24 V | ≤ 130 A |
| 3–15 kW (most residential hybrids) | 48 V (51.2 V LFP) | ≤ 320 A |
| > 10–15 kW, three-phase hybrids | High-voltage battery 100–800 V (Deye 50K: 160–800 V) | ≤ 100 A per battery input |

The tool recommends: `V_system = 12 if P_inv ≤ 1 kW; 24 if ≤ 3 kW; 48 if ≤ 15 kW; HV (≥ 150 V) above 15 kW or if inverter is a 3-phase HV hybrid`.

### 4.3 C-rate checks
```
I_discharge_max [A] = P_inverter_W / ( V_system_nominal × η_inv )
C_rate_discharge    = I_discharge_max / ( Ah_unit × N_parallel )
I_charge_max [A]    = ( PV_kWp_installed × 1000 × 0.9 + P_charger_AC_W ) / V_system_nominal      (worst case, no loads)
C_rate_charge       = I_charge_max / ( Ah_unit × N_parallel )
```
Limits (warn if exceeded): LiFePO4 charge ≤ 0.5 C recommended (1 C max), discharge ≤ 1 C continuous (rack units often limit to 0.5–1 C = 50–100 A per 100 Ah module); AGM/Gel charge 0.1–0.2 C, discharge ≤ 0.2 C for rated capacity (C20); flooded charge 0.1 C. Sources: https://gridwright.com/blog/lifepo4-vs-agm , https://www.epever.com/articles/how-long-do-lifepo%E2%82%84-batteries-last-in-solar-energy-systems/ . If C_rate_charge exceeds the limit, add parallel units or cap the inverter's charge-current setting (report the required setting in A).

### 4.4 Cycle life and replacement (for financials)
| Chemistry | DoD planning | Cycles to 80 % capacity | Years at 1 cycle/day | Round-trip η |
|---|---|---|---|---|
| LiFePO4 | 0.80 | 4,000–6,000 (datasheet, 25 °C, ≤0.5 C) | 10–15 | 0.92–0.95 |
| NMC | 0.80 | 2,000–3,000 | 6–8 | 0.92 |
| AGM | 0.50 | 400–800 | 1.5–3 | 0.80–0.85 |
| Gel | 0.50 | 800–1,200 | 2–4 | 0.80–0.85 |
| Flooded (tubular OPzS) | 0.50 | 1,200–1,500 (deep-cycle tubular) | 4–6 | 0.75–0.80 |

Sources: https://www.ufinebattery.com/blog/lifepo4-cycle-life/ , https://gridwright.com/blog/lifepo4-vs-agm . Replacement year = min(cycles / 365, calendar life) → used in LCOE (§10).

---

## 5. INVERTER SIZING

```
P_inv_cont_required [W] = P_peak × 1.25                          (margin 1.20–1.25 for PF and headroom; https://shop.alchemyindustrial.com/blogs/news/how-to-size-a-victron-off-grid-power-system)
P_inv_kW_selected       = nextStd( P_inv_cont_required / 1000 , STD_INV_KW )
STD_INV_KW = [1, 1.5, 2, 3, 3.6, 5, 6, 8, 10, 12, 15, 20, 25, 30, 40, 50, 60, 80, 100, 110, 125, 150, 200, 250]
Surge check: P_inv_surge_rating (datasheet; default 2.0 × P_inv_cont for 5–10 s if unknown) ≥ P_surge, else step up one size.
Three-phase: P_inv_kW_selected ≥ 3 × P_phase_max × 1.25 / 1000 ; also check per-phase rating (= P_inv/3) ≥ P_phase_max × 1.25.
Inverter kVA = kW / PF_rating (PF_rating 0.8 for VA-rated off-grid units, 1.0 for kW-rated hybrids).
```
Grid-tied sizing is driven by the PV array instead: `P_inv_kW = PV_kWp_target / DC_AC_target` (DC_AC_target default 1.2), then nextStd. For grid-tied with export limits, cap at the utility-approved kW.

Topology selection:
| Mode | Inverter type | Battery | Grid | Notes |
|---|---|---|---|---|
| Grid-tied | string / micro inverter (no battery) | none | required (anti-islanding) | export or self-consumption; no backup |
| Hybrid / backup | hybrid (grid-interactive inverter-charger with MPPT) | yes | present but unreliable | EPS/backup output, generator input, time-of-use |
| Off-grid | off-grid inverter-charger (+ MPPT built in or separate) | yes | none | may include generator |

PV input limits to be stored per inverter model and checked in §7: `V_dc_max` (e.g. 500 V for 48 V LV hybrids 3–12 kW; 1000–1100 V for 3-phase string/HV hybrids), `V_mppt_min / V_mppt_max` (e.g. 150–425 V LV hybrid; 200–1000 V Deye/Huawei 3-ph; full-power window e.g. 500–850 V), `V_start`, `I_mppt_max` per MPPT (operating), `I_sc_max` per MPPT, `N_mppt`, `N_inputs_per_mppt`, `P_pv_max_W`. Example records (from datasheets): Deye SUN-50K-SG01HP3-EU-BM4: 1000 V max, MPPT 150–850 V, 4 MPPT × 36 A (Isc 55 A), 2 strings per MPPT, max PV 65–100 kW, AC 50 kW 3-ph 400 V, 79.8 A (https://www.deyeinverter.com/deyeinverter/2023/12/18/datasheet_sun-29.9-50k-sg01hp3-eu-bm4_231218_en.pdf). Generic 100 kW 3-ph string inverter used in fixture (c): 1100 V max, MPPT 200–1000 V, full power 500–850 V, 10 MPPT × 30 A (Isc 45 A), 2 inputs each, max PV 150 kWp. Generic 8 kW 48 V LV hybrid used in fixture (b): 500 V max, MPPT 150–425 V, 2 MPPT × 22 A (Isc 34 A), max PV 10.4 kW, 190 A charge/discharge, 230 V 1-ph, 16 kW surge 10 s.

Parallel stacking: most hybrids allow N units in parallel (Deye LV 48 V: up to 16 units single-phase or 3 × N for three-phase; Victron: up to 6 per phase; Deye 50K HV: up to 10). Rule: if required kW > largest single unit in the family, `N_inv = ceil(P_req / P_unit)`, all units identical, each with its own battery connection or shared HV bank per manufacturer rules. For 3-phase from single-phase hybrids, N_inv must be a multiple of 3 with equal kW per phase.

---

## 6. CHARGE CONTROLLER (separate MPPT, off-grid without all-in-one)
```
I_cc_rated [A] = ( PV_kWp_installed × 1000 / V_system_nominal ) × 1.25     (nominal battery V; 1.25 covers irradiance > STC and cold Voc boost)
I_cc_selected  = nextStd( I_cc_rated , [10, 15, 20, 30, 35, 45, 50, 60, 70, 85, 100, 150, 250] )
```
Voltage checks: `V_oc_string_cold < V_pv_max_controller` (Victron SmartSolar families 75 / 100 / 150 / 250 V); `V_mp_string_hot > V_batt_absorption + 5 V` (Victron: PV voltage must exceed battery voltage + 5 V to start, + 1 V to keep running). Source: Victron SmartSolar MPPT datasheets/manuals https://www.victronenergy.com/solar-charge-controllers . Controller nominal PV power (datasheet "nominal PV power" e.g. 150/35 at 48 V = 2000 W) must be ≥ PV_kWp × 1000 / 1.3 (Victron allows oversizing — controller simply clips). PWM controllers: only for ≤ 300 W, panel Vmp must equal battery nominal (36-cell on 12 V); the tool should default to MPPT.

---

## 7. STRING DESIGN (NEC 690.7 / IEC 62548-1)

Inputs per module: Voc_STC, Vmp_STC, Isc_STC, Imp_STC, β_Voc [%/°C or 1/°C, negative], γ_Pmax (used as Vmp coefficient if β_Vmp not given), I_module_max_fuse (max series fuse rating), V_module_max_system (1000 or 1500 V).

```
Voc_cold [V]  = Voc_STC × ( 1 + β_Voc × ( T_amb_min_design − 25 ) )          e.g. 51.5 × (1 + (−0.0025)(0 − 25)) = 54.72 V
Vmp_hot  [V]  = Vmp_STC × ( 1 + γ_Pmax × ( T_cell_hot − 25 ) )                e.g. 43.0 × (1 + (−0.0030)(70 − 25)) = 37.2 V
N_series_max  = floor( min( V_dc_max_inverter , V_module_max_system , V_code_limit ) / Voc_cold )
N_series_min  = ceil( V_mppt_min / Vmp_hot )          (recommended: also ceil( V_fullpower_min / Vmp_hot ) when the inverter publishes a full-power window)
Choose N_series with N_series_min ≤ N_series ≤ N_series_max; prefer the largest N_series whose Vmp_STC × N_series ≤ V_mppt_max and that divides the panel count into equal strings.
Check: Vmp_STC × N_series ≤ V_mppt_max  (otherwise MPPT clips at low temperature)
I_string_max [A]       = Isc_STC × 1.25                                        (NEC 690.8(A)(1); IEC 62548 uses the same 1.25 × Isc for design current)
N_parallel_per_mppt_max = floor( min( I_mppt_max / Imp_STC , I_sc_max_mppt / (Isc_STC × 1.25) ) )
```
V_code_limit: NEC 690.7 — 600 V for one- and two-family dwellings, 1000 V for other buildings (1500 V ground-mount non-building). IEC 62548 defers to inverter/module ratings (1000/1500 V). Sources: Mike Holt NEC 2023 Art. 690 https://www.mikeholt.com/newsletters.php?action=display&letterID=2809 ; https://www.surgepv.com/solar-compliance/usa/guides/nec-690-7-max-system-voltage ; https://heavendesigns.in/blog/iec-62548-pv-array-design-standard/ .

String overcurrent protection (IEC 62548-1 cl. 9.4 / NEC 690.9): required when the reverse current from the other parallel strings can exceed the module's max series fuse rating:
```
I_reverse = ( N_parallel − 1 ) × 1.25 × Isc_STC  ;  fuses required if I_reverse > I_module_max_fuse   (in practice: ≥ 3 strings in parallel on one input)
String fuse rating: 1.5 × Isc_STC ≤ I_fuse ≤ 2.4 × Isc_STC  and  I_fuse ≤ I_module_max_fuse  (gPV, rated ≥ system Voc_cold)  → nextStd(1.5 × Isc)
```
Sources: https://knowledge-center.solaredge.com/sites/kc/files/string_fusing_requirements_eu_and_apac_en.pdf , Eaton/Bussmann PV fuse guide https://docs.rs-online.com/fb65/A700000008518340.pdf .

Distribution of strings over MPPTs: `strings_per_mppt = floor(N_strings / N_mppt)`, remainder `N_strings mod N_mppt` MPPTs get one extra string; all strings on one MPPT must have identical N_series and orientation.

---

## 8. DC / AC CABLE SIZING AND PROTECTION

### 8.1 Voltage drop
```
DC and single-phase AC:  Vd [V] = 2 × L × I × ρ / A         L one-way length [m], I [A], ρ_Cu = 0.0172 Ω·mm²/m (20 °C; use 0.0225 at 70 °C for a conservative check), ρ_Al = 0.0282, A [mm²]
Three-phase AC:          Vd [V] = √3 × L × I × ρ / A
Vd% = Vd / V_circuit × 100         V_circuit = string Vmp_STC (PV), battery nominal V, 230 V (1-ph), 400 V (3-ph line-line)
Minimum area for a target drop:  A_min = 2 × L × I × ρ / ( Vd%_target/100 × V_circuit )
```
Targets: PV string/array DC ≤ 2 % (max 3 %); battery-to-inverter ≤ 1 % (keep leads ≤ 2–3 m); AC inverter-to-board ≤ 1 % (max 2 %). Sources: https://www.unboundsolar.com/solar-information/voltage-drop , https://solarmathlab.com/content/wiring/solar-voltage-drop-calculator.html , AS/NZS 5033 3 % DC https://oztradiecalc.com/electrician/solar-dc-cable-calculator .

### 8.2 Cable size table (copper, IEC 60364-5-52 Table B.52.2 / B.52.4, PVC 70 °C, 30 °C ambient; PV1-F/H1Z2Z2-K per EN 50618 at 60 °C ambient free air)

| mm² | AWG (nearest) | AWG exact mm² | DC/1-ph, clipped to wall (method C, 2 cond.) A | 1-ph in conduit (B1) A | 3-ph clipped (method C, 3 cond.) A | Single-core free air (method F, 2 cond.) A | PV cable 1-core free air 60 °C A |
|---|---|---|---|---|---|---|---|
| 1.5 | 16/15 | 1.31/1.65 | 19.5 | 17.5 | 17.5 | 24 | 30 |
| 2.5 | 14/13 | 2.08/2.62 | 27 | 24 | 24 | 33 | 41 |
| 4 | 12/11 | 3.31/4.17 | 36 | 32 | 32 | 45 | 55 |
| 6 | 10/9 | 5.26/6.63 | 46 | 41 | 41 | 58 | 70 |
| 10 | 8/7 | 8.37/10.5 | 63 | 57 | 57 | 80 | 98 |
| 16 | 6/5 | 13.3/16.8 | 85 | 76 | 76 | 107 | 132 |
| 25 | 4/3 | 21.2/26.7 | 112 | 101 | 96 | 138 | 176 |
| 35 | 2 | 33.6 | 138 | 125 | 119 | 171 | 218 |
| 50 | 1/0 | 53.5 | 168 | 151 | 144 | 209 | 276 |
| 70 | 2/0 | 67.4 | 213 | 192 | 184 | 269 | 347 |
| 95 | 3/0 | 85.0 | 258 | 232 | 223 | 328 | 416 |
| 120 | 4/0 | 107 | 299 | 269 | 259 | 382 | 488 |

Sources: IEC 60364-5-52 tables reproduced at https://www.ti-soft.com/en/support/help/electricaldesign/standards/iec-60364-5-52/current-carrying-capacity/table_b_52_2 and https://www.ti-soft.com/en/support/help/electricaldesign/standards/iec-60364-5-52/current-carrying-capacity/table_b_52_4 ; AWG areas https://www.rapidonline.com/news/wire-gauge-conversion-chart ; EN 50618 PV cable ratings (manufacturer tables, e.g. https://www.whxcable.com/news/how-long-can-pv-cables-be-understanding-maximum-length-and-voltage-drop-concerns/ ). Apply correction factors: ambient 40 °C × 0.87, 45 °C × 0.79, 50 °C × 0.71 (PVC); grouping 2 circuits × 0.80, 3 × 0.70. The tool shall apply `k_amb` from the user's ambient (default 40 °C → 0.87 for Sudan/Gulf) before comparing.

Selection algorithm for every circuit:
```
I_design      = per §8.3 (fuse/breaker rating or design current, whichever is larger)
A_amp         = smallest mm² with ampacity(method) × k_amb × k_group ≥ I_design
A_vd          = smallest mm² meeting Vd%_target (§8.1)
A_selected    = max( A_amp , A_vd , A_min_practical )
A_min_practical: PV string cable 4 mm² (6 mm² for runs > 25 m); battery cable 10 mm² (16 mm² ≥ 3 kW, 25 mm² ≥ 5 kW); AC output 2.5 mm²; earth/PE ≥ 6 mm² Cu (16 mm² for array frame bonding where lightning protection present).
```

### 8.3 Fuse / breaker sizing
```
PV string fuse (gPV, DC):        I_fuse = nextStd( 1.5 × Isc_STC ) with 1.5·Isc ≤ I_fuse ≤ 2.4·Isc and ≤ module max fuse rating.   NEC equivalent: ≥ 1.56 × Isc (690.8(A)×690.9), next standard size.
PV string conductor ampacity:    ≥ 1.56 × Isc_STC (NEC 690.8(B): 1.25 × 1.25) ; if fused, ≥ I_fuse.
Array/combiner output fuse:      ≥ 1.56 × Isc_STC × N_parallel (Bussmann) → nextStd
DC isolator (PV):                rated ≥ Voc_cold × N_series (V) and ≥ 1.25 × Isc × N_parallel (A), DC-PV rated (IEC 60947-3 utilisation DC-PV2)
Battery fuse / DC breaker:       I_dc_max = P_inv_W / ( V_batt_nominal × η_inv [0.94] ) ;  I_fuse_batt = nextStd( I_dc_max × 1.25 , STD_FUSES_DC ) ; class T / NH gG / ANL per voltage; ≤ battery cable ampacity
Per-battery-module fuse/breaker: = module max discharge current × 1.25 (rack modules usually ship with 100–125 A breakers)
AC breaker (inverter output and grid input): I_ac = P_inv_W / ( V_ph × PF )  (1-ph: V_ph = 230; 3-ph: P / (√3 × 400 × PF)) ;  I_breaker = nextStd( I_ac × 1.25 , STD_BREAKERS ) ; MCB type C (D for heavy motor loads), RCD 30 mA type A on backup output; 4-pole for 3-ph.
Grid-tied point of connection:   I_breaker ≥ 1.25 × I_ac_rated (NEC 705.28 / 690.8(A)(3)); also check ≤ 120 % of bus bar rating rule for backfeed (NEC 705.12(B)(3)(2)).
STD_BREAKERS  = [6, 10, 16, 20, 25, 32, 40, 50, 63, 80, 100, 125, 160, 200, 250, 315, 400] A
STD_FUSES_DC  = [10, 15, 20, 25, 30, 32, 40, 50, 63, 80, 100, 125, 150, 160, 175, 200, 225, 250, 300, 400] A   (class T/NH/gPV common ratings)
```
Sources: https://www.mayfield.energy/technical-articles/how-to-calculate-wire-size-amp-nec-690-8-b/ , https://www.mikeholt.com/newsletters.php?action=display&letterID=2809 , Mersen PV fuse sizing https://us.mersen.com/sites/default/files/files_imported_ep/TT-PVPN5-Sizing-Fuses-of-Photovoltaic-Systems-per-NEC-Tech-Topic.pdf .

Surge protection: DC SPD type 2 (Uc ≥ 1.2 × Voc_cold_string; e.g. 600 V for LV hybrids, 1000/1100 V for 3-ph) at the inverter and at the array if DC run > 10 m; AC SPD type 2 (275 V 1-ph / 275 V 3-ph+N) in the AC board; type 1+2 where external LPS exists. IEC 61643-32 / IEC 62548-1 cl. 10.

---

## 9. MOUNTING AND AREA

```
A_module [m²]      = module length × width (580 W, 144-half-cell: 2.278 × 1.134 = 2.583 m²; η ≈ 22.5 %)
A_array_flush [m²] = N_panels × A_module × 1.20          (pitched-roof flush mount: edge setbacks, walkways; ≈ 5.3 m²/kWp)
A_array_tilted[m²] = N_panels × A_module × k_row         (flat roof / ground: k_row 1.6–2.0 depending on tilt & latitude; ≈ 8–10 m²/kWp)
```
Rule of thumb check: pure module area ≈ 4.45 m²/kWp at 22.5 %; flush installations 5–6.6 m²/kWp; tilted rows 8–15 m²/kWp (https://www.maysunsolar.com/blog-what-are-the-standard-sizes-of-solar-photovoltaic-panels/ , https://www.thegreenwatt.com/solar-rooftop-calculator-how-many-solar-panels-can-fit-on-roof-kw/).

Tilt: annual-optimum ≈ latitude × 0.76 + 3 (≈ latitude − 2 to − 5° at low latitudes); rule of thumb tilt = latitude; winter-biased (off-grid) = latitude + 10–15°; summer-biased = latitude − 10–15°; minimum 10° for self-cleaning/dust shedding (desert sites 15°). Sources: https://www.greentechrenewables.com/article/solar-array-tilt-angle-and-energy-output , https://pvrack.com/materials-design/tilt-angle-optimization/ . Khartoum (15.6°N): 15–20°; Riyadh (24.7°N): 22–25°; Global Solar Atlas gives OPTA directly (e.g. 19° for Red Sea State Sudan).

Azimuth: true south (180°) in the northern hemisphere, true north in the southern; ±30° off-south costs ≤ 3–5 % annually; east/west split arrays flatten the daily profile (useful for self-consumption).

Inter-row spacing (flat roof / ground):
```
H [m]        = L_module_dim_along_tilt × sin(tilt)
D_row [m]    = H / tan( α_min )            α_min = solar elevation at 09:00 (or 10:00) on 21 Dec (N hemisphere) ≈ 90° − latitude − 23.45° − ~10° for 10:00 ; simpler: D_row ≥ 2 × H ; pitch = L × cos(tilt) + D_row
```
Source: https://www.surgepv.com/blog/solar-panel-tilt-azimuth-calculator ; GCR (ground coverage ratio) = L × cos(tilt) / pitch, typical 0.4–0.6.

Structure quantities per panel (portrait, rails perpendicular to module long side):
- Rails: 2 rails per row; rail length per panel = module width + 20 mm gap (1.154 m for 1.134 m wide) → **2.31 m of rail per panel**; rail stock lengths 4.2 / 4.7 / 6.0 m → `N_rails = ceil(total_m / stock_length)`, add 5 % waste; splices = N_rail_pieces − N_rows × 2.
- Clamps: **mid clamps = 2 × (N_panels − N_rows)**, **end clamps = 4 × N_rows** (≈ 4 clamps per panel); landscape doubles rows for the same count.
- Roof attachments (L-feet / hanger bolts / tile hooks): one per rail every 1.0–1.2 m → **≈ 2 per panel** (= 2 rails × 1.154 m / 1.2 m); on metal sheet roofs use clamps/standing-seam clamps.
- Flat roof: tilt frames (triangles) 1 per 1–2 panels + 2 ballast blocks 20–30 kg per frame (if non-penetrating; verify wind per ASCE 7 / EN 1991-1-4) or chemical anchors.
- Ground mount: 1 post pair per 3–4 panels; concrete 0.1–0.15 m³ per post.
- Grounding: WEEB/earth clip per panel-rail joint (1 per panel) + 1 earth lug per rail row; earth cable 6 mm² (16 mm² where LPS).

---

## 10. ENERGY AND FINANCIAL

```
E_annual [kWh]        = PV_kWp_installed × PSH_annual × 365 × D_pv                      (grid-tied: D_pv; hybrid/off-grid: D_eff for delivered energy)
E_month[m] [kWh]      = PV_kWp_installed × PSH[m] × days[m] × D_pv
Specific yield        = E_annual / PV_kWp_installed  [kWh/kWp/yr]      (sanity range: 1300–1900 for Sudan/Gulf)
Self-consumption share (grid-tied without battery): min(E_annual, E_load_annual × daytimeShare) — default daytime share 0.5 residential, 0.8 commercial; export = remainder
E_year[t] [kWh]       = E_annual × (1 − d)^(t−1)        d = 0.005 /yr (NREL median degradation ~0.5 %/yr https://www.renewableenergyworld.com/solar/insights-into-pv-lcoe-through-a-new-degradation-study/)
E_25yr  [kWh]         = Σ_{t=1..25} E_year[t]  = E_annual × (1 − (1−d)^25) / d  ≈ 23.55 × E_annual at d = 0.005
Annual savings [$]    = E_selfconsumed × tariff_import + E_exported × tariff_export + diesel_kWh_displaced × (fuel_L_per_kWh × diesel_price + O&M_gen_per_kWh)
Simple payback [yr]   = Net capex (after incentives) / Annual savings (year 1)
NPV                   = Σ_t (savings_t − O&M_t − replacements_t) / (1+r)^t − capex
LCOE [$/kWh]          = ( capex + Σ_t (O&M_t + replacement_t)/(1+r)^t ) / Σ_t E_year[t]/(1+r)^t        r = real discount rate, default 0.06 ; O&M default 1 %/yr of capex ; battery replacement at year = cycle life / 365 (cap 25); inverter replacement year 12–15 (default 15)
```
NREL LCOE documentation: https://www.nrel.gov/pv/lcoe-calculator/documentation and https://www.nrel.gov/analysis/tech-lcoe-documentation . Tariff escalation `g` (default 0.03/yr) multiplies savings_t by (1+g)^(t−1).

CO₂ avoided:
```
CO2_avoided [kg/yr] = E_displaced_grid × EF_grid + E_displaced_diesel × EF_diesel
```
EF_grid defaults by country (kg CO₂/kWh): Saudi Arabia 0.55 (IEA 2023 0.52–0.56; Ember 0.69) https://sustainability.ksu.edu.sa/sites/sustainability.ksu.edu.sa/files/2025-04/Carbon%20emissions%20for%20KSU%20main%20campus%20(2024).pdf ; Sudan 0.22 (hydro-heavy, 0.15–0.25) https://lowcarbonpower.org/region/Sudan ; Egypt 0.45; UAE 0.42; generic fossil grid 0.5–0.7 (tool default 0.55). EF_diesel = fuel_L_per_kWh × 2.68 kg CO₂/L → 0.67 kg/kWh at 0.25 L/kWh (full load), 0.80 at 0.30 L/kWh, 1.07 at 0.40 L/kWh (part load) — tool default 0.85 kg/kWh with 0.32 L/kWh. Sources: https://www.whjlmech.com/knowledge/how-much-co2-emissions-per-kwh-from-diesel-generator , https://yuripower.com/2026/08/17/real-cost-of-diesel-generated-electricity/ . Diesel genset fuel curve by load: 100 % 0.25, 75 % 0.26, 50 % 0.28, 25 % 0.36 L/kWh (modern 1500 rpm); small/old 3000 rpm sets 0.35–0.45 L/kWh. Equivalent trees: 1 tree ≈ 22 kg CO₂/yr (optional display).

Indicative monthly PSH (kWh/m²/day, GHI; verify with PVGIS/GSA for the exact site):
| Month | Khartoum 15.6°N | Riyadh 24.7°N |
|---|---|---|
| Jan | 5.5 | 4.0 |
| Feb | 6.2 | 5.0 |
| Mar | 6.6 | 5.6 |
| Apr | 6.9 | 6.3 |
| May | 6.7 | 7.1 |
| Jun | 6.4 | 7.8 |
| Jul | 6.0 | 7.5 |
| Aug | 5.9 | 7.1 |
| Sep | 6.1 | 6.5 |
| Oct | 6.0 | 5.6 |
| Nov | 5.7 | 4.4 |
| Dec | 5.3 | 3.8 |
| Annual avg | ~6.1 (≈ 2200 kWh/m²/yr) | ~5.9 (≈ 2150–2400 kWh/m²/yr) |
Riyadh literature GHI ≈ 2400 kWh/m²/yr (https://pvgis.com/en/solar-data-pvgis ; Saudi atlas https://www.researchgate.net/publication/295853408_Analysis_from_the_New_Solar_Radiation_Atlas_for_Saudi_Arabia); Sudan Red Sea GSA GHI 2117 kWh/m²/yr (https://globalsolaratlas.info/detail?c=19.6158%2C37.2164%2C11&m=site&s=19.6158%2C37.2164).

---

## 11. GENERATOR BACKUP SIZING (hybrid / off-grid)

```
P_charge_gen [kW]  = C_installed_kWh × C_charge_gen           C_charge_gen default 0.2 (0.2 C) for LiFePO4, 0.1 for lead-acid; capped at inverter max AC charge current × V_batt / 1000
P_gen_kW           = ( P_peak/1000 + P_charge_gen / η_charger[0.95] ) × 1.10
P_gen_kVA          = P_gen_kW / PF_gen[0.8]
P_gen_kVA_selected = nextStd( max( P_gen_kVA , 1.5 × P_inv_kVA ) , STD_GEN_KVA )  × altitude/temperature derate (add 10 % above 40 °C ambient, 3 % per 300 m above 1000 m)
STD_GEN_KVA = [5, 7.5, 10, 12.5, 15, 20, 25, 30, 40, 50, 60, 80, 100, 125, 150, 200]
Inverter AC-input current limit setting [A] = 0.8 × P_gen_kW × 1000 / V_ph   (Victron: start at 80 % of generator watts)
Generator runtime/day (off-grid, cloudy day) [h] = (E_day − PV_contribution) / (P_gen_kW × 0.7 load factor)
Fuel [L/yr] = generator kWh/yr × fuel_L_per_kWh
```
Victron's MultiPlus generator FAQ table (800 VA → 2 kVA … 3000 VA → 5 kVA, 5000 VA → 8 kVA, i.e. ≈ 1.6–2.5 × inverter VA; inverter-type generators +30 %) https://www.victronenergy.com/live/multiplus_faq . Automatic transfer switch (ATS)/changeover rated ≥ AC breaker of the larger source; generator auto-start relay from inverter (SOC-based: start at 20–30 % SOC, stop at 80–90 %).

---

## 12. BILL OF MATERIALS (installer quote checklist with quantity rules)

| # | Item | Quantity rule | Applies to |
|---|---|---|---|
| 1 | PV modules | N_panels (+ 1–2 % spares on > 100 panels) | all |
| 2 | Inverter(s) | N_inv (hybrid / off-grid / grid-tied per topology) | all |
| 3 | MPPT charge controller | 1 per array sub-section if separate (§6) | off-grid |
| 4 | Battery modules | N_units; BMS/communication cable 1 per unit; parallel busbar kit 1 per 4–16 units | hybrid / off-grid |
| 5 | Battery rack / cabinet | 1 per 4–6 rack modules (IP20 indoor) or 1 outdoor IP55 cabinet per 2–4 | hybrid / off-grid |
| 6 | Mounting rails | 2.31 m per panel (portrait) → stock lengths; splices | all |
| 7 | Mid clamps | 2 × (N_panels − N_rows) | all |
| 8 | End clamps | 4 × N_rows | all |
| 9 | L-feet / roof hooks / hanger bolts (+ flashing/EPDM) | ≈ 2 per panel (1 per rail per 1.2 m) | pitched roof |
| 10 | Tilt frames / triangles + ballast or anchors | 1 frame per 1–2 panels; 2 × 25 kg ballast per frame or 2 anchors | flat roof |
| 11 | Ground-mount posts / piles + concrete | 1 post pair per 3–4 panels; 0.12 m³ concrete per post | ground |
| 12 | DC combiner box (with fuse holders, isolator, SPD) | 1 per ≥ 3 parallel strings per MPPT, or 1 per inverter when runs > 20 m | commercial |
| 13 | String fuses gPV (10×38 mm or 14×51 mm) | 2 per string (+ and −) when required (§7); rating nextStd(1.5 × Isc), voltage ≥ 1000/1100 V | commercial / multi-string |
| 14 | DC isolator switch (PV-rated, 600/1000 V, 1.25 × Isc × N_parallel) | 1 per inverter (if not built-in) + 1 at array if > 10 m | all |
| 15 | DC SPD type 2 (PV) | 1 per inverter DC input (+1 at array if cable > 10 m) | all |
| 16 | AC SPD type 2 (1-ph or 3-ph+N) | 1 per AC distribution board | all |
| 17 | AC distribution board / enclosure | 1 (backup/essential-loads sub-board for hybrids) | all |
| 18 | AC breakers (MCB/MCCB, type C) | inverter output 1, grid input 1, generator input 1, per load circuit as per load schedule; 4-pole for 3-ph | all |
| 19 | RCD / RCBO 30 mA type A | 1 per backup output board (plus per final circuit where required) | all |
| 20 | Changeover switch / ATS | 1 (manual changeover or automatic ATS rated ≥ largest breaker, 2- or 4-pole) | hybrid / generator |
| 21 | Earthing: earth rods (1.5 m Cu-bonded), clamps, earth pit, bentonite | 1–2 rods per array + 1 at inverter/board; bond to existing earth (≤ 10 Ω; ≤ 5 Ω with LPS) | all |
| 22 | Earth cable (bare/green-yellow Cu) | 6 mm² : rail-to-rail bonding ≈ 1.2 m per panel + run to earth bar; 16 mm² main earthing conductor 10–20 m | all |
| 23 | Lightning protection (air terminals, down conductors) | per IEC 62305 risk assessment; typically 1 finial per 10 m of array edge on exposed sites | optional |
| 24 | DC solar cable 4 mm² (6 mm² > 25 m) red + black, H1Z2Z2-K | per string: 2 × (L_string_to_inverter + 1 m per panel for jumpers) ; rule of thumb 2 × run + 1 m/panel | all |
| 25 | MC4 connectors (pairs) | 2 pairs per string + 1 pair per Y/branch + 10 % spare | all |
| 26 | Battery cable (flexible, 10–95 mm² per §8) + lugs | 2 × 1.5–2 m per battery unit to busbar; 2 × 2–3 m inverter to busbar; 2 lugs per cable end | hybrid / off-grid |
| 27 | Battery fuse / DC breaker (class T / NH / 125–250 A MCCB) + holder | 1 main (+ 1 per unit if not built-in) | hybrid / off-grid |
| 28 | AC cable (per §8 size, 3-core 1-ph / 5-core 3-ph) | inverter→board run; grid→inverter run; generator→ATS run (each measured, +10 %) | all |
| 29 | Conduit / trunking / cable tray (UV-rated) | DC: 1 m per m of exposed run; AC: measured; tray 100–300 mm for > 10 strings | all |
| 30 | Cable ties (UV black), stainless clips, glands | 4 ties per panel + 1 per m of run; 1 gland per cable entry | all |
| 31 | Labels (PV DC danger, isolator, dual supply, string IDs) | 1 label kit per inverter + 1 per string + 1 per board (IEC 62548 cl. 13 / NEC 690.31, 690.56) | all |
| 32 | Monitoring: Wi-Fi/4G dongle, data logger | 1 per inverter (1 logger per 10 inverters for commercial) | all |
| 33 | Energy meter / CT clamps (export limiter) | 1 smart meter + 1 CT per phase (3 for 3-ph) | hybrid / grid-tied |
| 34 | Generator (if specified) + auto-start cable | 1 per §11 | hybrid / off-grid |
| 35 | Installation labour | residential: 1–1.5 man-days/kWp (2 installers, ~2 days for 5 kWp); commercial: 0.4–0.6 man-days/kWp; electrician 1 day per inverter | all |
| 36 | Transport / crane / scaffolding | 1 lot; crane half-day per 50 kWp on multi-storey roofs | all |
| 37 | Commissioning, testing (IEC 62446-1 report: Voc, Isc, insulation resistance, polarity, earth continuity), training, as-built drawings | 1 lot per system | all |
| 38 | Engineering, permits, utility application / net-metering fee | 1 lot | grid-tied / hybrid |
| 39 | Spares & consumables (fuses, MC4, ties, sealant), O&M year-1 | 2–3 % of material cost | all |

Rule-of-thumb per-kW cost structure for the quote (user-editable unit prices): modules 25–35 %, inverter 12–18 %, battery (if any) 25–40 %, mounting 8–12 %, BOS electrical 8–12 %, labour & logistics 10–15 %.

---

## 13. WORKED EXAMPLES (test fixtures)

Common fixture data. Module "M580": P = 580 W, Voc = 51.5 V, Vmp = 43.0 V, Isc = 14.0 A, Imp = 580/43 = 13.49 A, β_Voc = −0.25 %/°C (−0.0025), γ_Pmax = −0.30 %/°C (−0.0030), NOCT 45 °C, max series fuse 30 A, max system voltage 1500 V, 2.278 × 1.134 m = 2.583 m². Battery unit "B5": LiFePO4 51.2 V, 100 Ah, 5.12 kWh, max charge/discharge 100 A (1 C), DoD planning 0.80. Common defaults: η_inv 0.95 (battery sizing), 0.94 (DC current), DF per §1.2, inverter surge = 2 × continuous, k_amb = 0.87 (40 °C), ρ_Cu = 0.0172, T_cell_hot = 70 °C, cable methods: PV = EN 50618 free-air 1-core, battery = method F, AC = method C. Rounding: kWp to 3 decimals, Wh to integer, V/A to 1 decimal, % to 2 decimals, money to integer.

### 13 (a) Small off-grid home — Khartoum, 3 kWh/day, LiFePO4 48 V, 1 day autonomy

Inputs
| Appliance | W | qty | h/day | surge × | Wh/day |
|---|---|---|---|---|---|
| LED bulb | 10 | 5 | 6 | 1.0 | 300 |
| Ceiling fan | 60 | 2 | 8 | 1.5 | 960 |
| Refrigerator | 150 | 1 | 8 | 4.0 | 1,200 |
| LED TV 43" | 80 | 1 | 4 | 1.0 | 320 |
| Router | 10 | 1 | 22 | 1.0 | 220 |
| **Total** | **420 W connected** | | | | **3,000 Wh** |

Site: PSH 6.0 kWh/m²/day, T_amb_min_design 5 °C, T_amb_day_avg 36 °C, latitude 15.6°N. Mode off-grid, f_night = 1.0, N_autonomy = 1, DF = 1.0 (5 lines), D_eff = 0.70, offGridMargin 1.20. Topology: separate MPPT controller (V_pv_max 150 V) + 48 V inverter.

Expected outputs
| Quantity | Formula | Value |
|---|---|---|
| E_day | Σ W·qty·h | **3,000 Wh/day** (91.3 kWh/month, 1,095 kWh/yr) |
| P_sum = P_peak (DF 1.0) | | **420 W** |
| P_surge | 420 + (150×4 − 150) | **870 W** (fridge) |
| PV_kWp_required | 3/(6.0 × 0.70) | **0.714 kWp** |
| PV_kWp_offgrid | × 1.20 | **0.857 kWp** |
| N_panels | ceil(857/580) | **2 × 580 W = 1.160 kWp** |
| C_batt_Wh | 3000 × 1 /(0.80 × 0.95 × 1.0) | **3,947 Wh** |
| Battery units | ceil(3947/5120); 1S × 1P | **1 × B5 = 5.12 kWh, 100 Ah @ 51.2 V**; usable 4.096 kWh; actual autonomy 4096 × 0.95 / 3000 = **1.30 days** |
| Inverter continuous | 420 × 1.25 = 525 W → nextStd | **1 kW, 48 V** (surge 2 kW ≥ 870 W ✓). Note: if the catalogue's smallest 48 V all-in-one is 3 kW, report 3 kW and flag "oversized for load". |
| MPPT controller | 1160/48 = 24.2 A × 1.25 = 30.2 A → nextStd | **35 A, 150 V class** (e.g. 150/35; nominal PV 2000 W @ 48 V ≥ 1160 W ✓) |
| String config | 2 modules in series, 1 string | **2S1P** |
| Voc_cold (5 °C) | 51.5 × (1 − 0.0025 × (5−25)) = 54.08 V/module | **108.2 V string < 150 V ✓** |
| Vmp_hot (70 °C) | 43 × (1 − 0.0030 × 45) = 37.2 V/module | **74.4 V string > 57.6 + 5 = 62.6 V ✓**; Vmp_STC 86.0 V |
| String fuse | 1 string → I_reverse 0 | **not required**; DC isolator 150 V / 32 A, DC SPD 150–300 V type 2 |
| PV cable | 1.56 × 14 = 21.9 A → ≥ 4 mm² min; L = 12 m: Vd = 2×12×13.49×0.0172/4 = 1.39 V | **4 mm² H1Z2Z2-K, Vd 1.62 % ✓** (red/black 2 × 12 m + 2 m jumpers) |
| Battery current / fuse | 1000/(48 × 0.94) = 22.2 A; × 1.25 = 27.7 A → nextStd | **30 A fuse**; cable **10 mm²** (min practical; F 80 A × 0.87 = 69.6 A ≥ 30 ✓); L 2 m Vd = 2×2×22.2×0.0172/10 = 0.15 V = 0.32 % ✓ |
| AC output breaker | 1000/230 = 4.35 A × 1.25 = 5.4 A → nextStd | **6 A MCB type C + 30 mA RCD**; AC cable **2.5 mm²** |
| Annual PV energy delivered | 1.16 × 6.0 × 365 × 0.70 | **1,778 kWh/yr** (load 1,095 kWh/yr → 62 % average utilisation; surplus in high months) |
| Area | 2 × 2.583 = 5.17 m² × 1.2 | **6.2 m²** roof, tilt 15–20°, azimuth 180° |
| Mounting BOM | rail 2 × 2.31 m = 4.62 m → 1 × 4.7 m stock (or 2 × 2.4 m); mid clamps 2×(2−1) = 2; end clamps 4; L-feet 4 | |
| CO₂ avoided | 1095 kWh × 0.85 kg/kWh (displacing diesel) | **931 kg/yr** (241 kg/yr if displacing Sudan grid at 0.22) |

### 13 (b) Hybrid home with 2 × 1.5-ton AC — Riyadh, ≈ 25 kWh/day, night share 60 %

Inputs
| Appliance | W | qty | h/day | surge × | Wh/day |
|---|---|---|---|---|---|
| Split AC 1.5 ton fixed-speed | 1,300 | 2 | 6 | 3.0 | 15,600 |
| Refrigerator-freezer | 200 | 1 | 10 | 4.0 | 2,000 |
| Chest freezer | 150 | 1 | 8 | 4.0 | 1,200 |
| Washing machine | 500 | 1 | 1 | 3.0 | 500 |
| LED TV | 100 | 1 | 5 | 1.0 | 500 |
| LED bulbs | 10 | 12 | 6 | 1.0 | 720 |
| Ceiling fans | 70 | 4 | 8 | 1.5 | 2,240 |
| Router | 10 | 1 | 24 | 1.0 | 240 |
| Laptop | 60 | 1 | 4 | 1.0 | 240 |
| Surface pump 0.5 HP | 400 | 1 | 1 | 3.0 | 400 |
| Microwave | 1,200 | 1 | 0.3 | 1.5 | 360 |
| Kettle | 2,000 | 1 | 0.25 | 1.0 | 500 |
| Phone chargers / misc | 100 | 1 | 5 | 1.0 | 500 |
| **Total** | **7,720 W connected** | | | | **25,000 Wh** |

Site: PSH 5.8, T_amb_min_design 0 °C, T_amb_day_avg 38 °C (summer 45 °C), latitude 24.7°N. Mode hybrid (grid present, unreliable), f_night = 0.60 (global override), N_autonomy = 1 night, DF = 0.80 (13 lines), D_pv = 0.80, η_batt = 0.92, DoD 0.80. Inverter family: 48 V LV single-phase hybrid, spec: V_dc_max 500 V, MPPT 150–425 V, 2 MPPT × 22 A (Isc 34 A), max PV 10.4 kW, surge 2× for 10 s, max charge 190 A.

Expected outputs
| Quantity | Formula | Value |
|---|---|---|
| E_day | | **25,000 Wh/day**; E_night = 0.6 × 25,000 = **15,000 Wh**; E_day_sun 10,000 Wh |
| P_sum | | 7,720 W |
| P_peak | 7720 × 0.80 | **6,176 W** |
| P_surge | 6176 + (1300×3 − 1300) | **8,776 W** (AC compressor) |
| D_eff | 0.80 × (0.4 + 0.6 × 0.92) | **0.7616** |
| PV_kWp_required | 25/(5.8 × 0.7616) | **5.660 kWp** |
| N_panels | ceil(5660/580) | **10 × 580 W = 5.800 kWp** (≤ 10.4 kW max PV ✓) |
| C_batt_Wh | 15,000 × 1/(0.80 × 0.95) | **19,737 Wh** |
| Battery units | ceil(19737/5120); 1S × 4P | **4 × B5 = 20.48 kWh, 400 Ah @ 51.2 V**; usable 16.38 kWh; actual autonomy 16384 × 0.95/15000 = **1.04 nights** |
| Inverter | 6176 × 1.25 = 7,720 W → nextStd | **8 kW hybrid, 48 V**; surge 16 kW ≥ 8,776 W ✓; DC:AC = 5.8/8 = **0.73** (array sized for energy, inverter for AC peak — report as info, not error) |
| C-rate checks | discharge 8000/51.2 = 156.3 A → 39.1 A/unit = **0.39 C ✓** (≤ 1 C); PV charge 5800 × 0.9/51.2 = 102 A = **0.26 C ✓** (≤ 0.5 C) | |
| Voc_cold (0 °C) | 51.5 × 1.0625 = 54.72 V | N_series_max = floor(500/54.72) = **9** |
| Vmp_hot (70 °C) | 37.2 V | N_series_min = ceil(150/37.2) = **5** |
| String config | 10 panels, 2 MPPT → 2 strings × 5 | **2 × 5S**, one string per MPPT; Voc_cold 273.6 V ✓ < 500; Vmp_hot 186.0 V ✓ > 150; Vmp_STC 215 V ✓ ≤ 425; Isc 14 × 1.25 = 17.5 A ✓ ≤ 34; Imp 13.5 ✓ ≤ 22 |
| String fuses | 1 string per MPPT | **not required** (if combiner used: 25 A gPV 600 V, 1.5×14 = 21 → 25 A ≤ 33.6 ✓ ≤ 30 A module max ✓) |
| DC isolator / SPD | 2 × 2-pole 600 V 32 A (or built-in) ; DC SPD type 2 600 V × 1 ; AC SPD type 2 275 V × 1 | |
| PV cable | 1.56 × 14 = 21.9 A → 4 mm²; L = 25 m: Vd = 2×25×13.49×0.0172/4 = 2.90 V | **4 mm², Vd 1.35 % ✓** ; ≈ 2 × 2 × 25 m + 10 m jumpers = 110 m red+black total |
| Battery main fuse | 8000/(48 × 0.94) = 177.3 A × 1.25 = 221.6 A → nextStd | **225 A class T (250 A if 225 unavailable)**; main cable **70 mm²** (F 269 × 0.87 = 234 A ≥ 225 ✓; L 2 m Vd = 2×2×177.3×0.0172/70 = 0.17 V = 0.36 % ✓) with 2 × 70 mm² lugs each end; per-unit leads 44 A → 25 mm² (unit-supplied) |
| AC breakers | 8000/230 = 34.8 A × 1.25 = 43.5 A → nextStd | **50 A** inverter output, **50 A** grid input, 50 A generator input (2-pole type C); backup board RCD 63 A/30 mA |
| AC cable | ampacity ≥ 50 A: 10 mm² method C 63 × 0.87 = 54.8 ✓; L 15 m Vd = 2×15×34.8×0.0172/10 = 1.80 V = 0.78 % ✓ | **10 mm² 3-core** (×3 runs: grid-in, backup-out, gen-in) |
| Generator | P_charge = 20.48 × 0.2 = 4.10 kW; P_gen = (6.176 + 4.10/0.95) × 1.10 = 11.54 kW; /0.8 = 14.4 kVA; ≥ 1.5 × 8 = 12 ✓ | **15 kVA** (with 10 % hot-ambient derate → **20 kVA** recommended); set inverter AC-input limit = 0.8 × 12,000/230 = **40 A** |
| Annual PV energy (AC) | 5.8 × 5.8 × 365 × 0.80 | **9,823 kWh/yr** (specific yield 1,694 kWh/kWp); load 9,125 kWh/yr |
| Area | 10 × 2.583 = 25.8 m² × 1.2 | **31 m²** (flush); 44 m² if tilted rows on flat roof (× 1.7); tilt 22–25°, azimuth 180° |
| Mounting BOM | 2 rows × 5: rail 10 × 2.31 = 23.1 m → 6 × 4.2 m (incl. 5 %); mid clamps 2×(10−2) = 16; end clamps 8; L-feet 20 | |
| CO₂ avoided | 9125 kWh × 0.55 | **5.0 t/yr** |

### 13 (c) 3-phase commercial grid-tied — 100 kW AC roof, PSH 5.5

Inputs: inverter P_ac = 100 kW three-phase 400 V, PF 1.0, DC:AC target 1.20 → PV target 120 kWp; generic 100 kW string inverter spec: V_dc_max 1100 V, MPPT 200–1000 V, full-power window 500–850 V, 10 MPPT × 30 A (Isc 45 A), 2 inputs per MPPT, max PV 150 kWp; module M580; T_amb_min_design 0 °C, T_cell_hot 70 °C; building is commercial → V_code_limit 1000 V (NEC 690.7); D_pv = 0.80 (hot climate); capex $0.65/Wp, tariff $0.08/kWh (flat, 100 % self-consumed), O&M 1 %/yr, r = 6 %, d = 0.5 %/yr, EF_grid 0.55 kg/kWh.

Expected outputs
| Quantity | Formula | Value |
|---|---|---|
| PV target | 100 × 1.20 | 120 kWp → ceil(120000/580) = 207 panels (before string rounding) |
| Voc_cold | 54.72 V | N_series_max = floor(min(1100, 1500, 1000)/54.72) = floor(18.27) = **18** |
| Vmp_hot | 37.2 V | N_series_min = ceil(200/37.2) = 6; for full power ceil(500/37.2) = **14** |
| N_series chosen | largest ≤ 18 with Vmp_STC × N ≤ 1000 (18 × 43 = 774 ✓) | **18** |
| String check | Voc_cold 18 × 54.72 = **984.9 V** ✓ < 1000; Voc_STC 927 V; Vmp_STC **774 V** ✓ in 500–850; Vmp_hot **669.5 V** ✓ ≥ 500 | |
| N_strings | ceil(207/18) = 11.5 → **12** | **216 panels = 125.28 kWp**, DC:AC **1.253** ✓ (≤ 1.30, ≤ 150 kWp max PV) |
| MPPT allocation | 12 strings / 10 MPPT → floor 1 each + 2 remainder | **8 MPPTs × 1 string, 2 MPPTs × 2 strings**; 2-string MPPT: Imp 27.0 A ✓ ≤ 30; Isc 2 × 14 × 1.25 = 35 A ✓ ≤ 45 |
| String fuses | 2-string inputs: I_reverse = 1 × 1.25 × 14 = 17.5 A < 30 A module max | **not mandatory**; recommended 25 A gPV 1100 V in inverter fuse holders (24 fuses if fitted on all 12 strings) |
| DC isolation / SPD | built-in DC switch; **DC SPD type 2, Uc 1100 V, 1 per inverter** (+ 1 at roof combiner if run > 10 m); AC SPD type 2 3-ph+N | |
| PV cable | 21.9 A → 4 mm²; L = 60 m: Vd = 2×60×13.49×0.0172/4 = 6.96 V | **4 mm² H1Z2Z2-K, Vd 0.90 % ✓**; total ≈ 12 × 2 × 60 + 216 m jumpers ≈ 1,660 m |
| AC current | 100,000/(√3 × 400 × 1.0) | **144.3 A** per phase |
| AC breaker | 144.3 × 1.25 = 180.4 A → nextStd | **200 A 4-pole MCCB** (point of connection also ≥ 200 A; check bus-bar 120 % rule) |
| AC cable | ampacity ≥ 200 A, method C 3-loaded: 95 mm² PVC 223 × 0.87 = 194 ✗ → 120 mm² 259 × 0.87 = 225 ✓; Vd (L 40 m) = √3×40×144.3×0.0172/120 = 1.43 V = **0.36 %** ✓ | **4 × 120 mm² Cu PVC** (alternative: 4 × 95 mm² Cu XLPE 90 °C, 298 × 0.91 = 271 A ✓, Vd 0.45 %) + 70 mm² PE |
| Earthing | array frame bonding 6 mm² ≈ 216 × 1.2 = 260 m + 16 mm² main earth 30 m; 2 earth rods; 216 earth clips | |
| Annual energy | 125.28 × 5.5 × 365 × 0.80 | **201,200 kWh/yr**; specific yield **1,606 kWh/kWp** |
| 25-year production | 201,200 × (1 − 0.995^25)/0.005 | **4,739,450 kWh**; year-25 output 201,200 × 0.995^24 = **178,394 kWh** |
| Capex | 125,280 × 0.65 | **$81,432** |
| Annual savings (yr 1) | 201,200 × 0.08 | **$16,096** |
| Simple payback | 81,432/16,096 | **5.06 years** |
| LCOE (r 6 %, O&M 1 % = $814/yr, d 0.5 %, 25 yr) | (81,432 + Σ 814/1.06^t) / Σ 201,200 × 0.995^(t−1)/1.06^t | **$0.0373/kWh** |
| CO₂ avoided | 201,200 × 0.55 | **110.7 t/yr** (2,767 t over 25 yr at constant factor) |
| Area | 216 × 2.583 = 558 m² module; × 1.2 flush = **670 m²**; tilted rows × 1.8 ≈ **1,004 m²** | |
| Mounting BOM | 12 rows × 18 (portrait): rail 216 × 2.31 = 499 m × 1.05 → **88 × 6 m rails**; mid clamps 2 × (216 − 12) = **408**; end clamps 4 × 12 = **48**; attachments ≈ 2/panel = **432** L-feet (pitched) or 108–216 tilt frames + 216–432 × 25 kg ballast (flat); earth clips 216 | |
| Labour | 0.5 man-days/kWp × 125 = ≈ 63 man-days (e.g. 8 installers × 8 days) + 2 electrician-days | |

### 13.1 Machine-readable fixtures
```json
{
 "module": {"id":"M580","watts":580,"voc":51.5,"vmp":43.0,"isc":14.0,"imp":13.49,"betaVoc":-0.0025,"gammaPmax":-0.0030,"noct":45,"maxFuseA":30,"maxSystemV":1500,"lengthM":2.278,"widthM":1.134,"areaM2":2.583},
 "battery": {"id":"B5","chemistry":"LiFePO4","voltage":51.2,"ah":100,"kwh":5.12,"maxChargeA":100,"maxDischargeA":100,"dod":0.80,"roundTripEff":0.92},
 "cases": [
  {"id":"a_offgrid_khartoum",
   "inputs":{"mode":"offgrid","loads":[{"w":10,"qty":5,"h":6,"surge":1.0},{"w":60,"qty":2,"h":8,"surge":1.5},{"w":150,"qty":1,"h":8,"surge":4.0},{"w":80,"qty":1,"h":4,"surge":1.0},{"w":10,"qty":1,"h":22,"surge":1.0}],
     "psh":6.0,"tMinDesign":5,"tCellHot":70,"fNight":1.0,"autonomyDays":1,"diversity":1.0,"derateEff":0.70,"offGridMargin":1.2,"systemV":48,"invEffBatt":0.95,"invEffDc":0.94,"mpptMaxV":150,"battAbsorbV":57.6,"pvRunM":12,"battRunM":2,"kAmb":0.87},
   "expected":{"eDayWh":3000,"pPeakW":420,"pSurgeW":870,"pvKwpRequired":0.714,"pvKwpDesign":0.857,"panels":2,"pvKwpInstalled":1.16,"battWhRequired":3947,"battUnits":1,"battSeries":1,"battParallel":1,"battKwh":5.12,"battAh":100,"autonomyActualDays":1.30,"inverterReqW":525,"inverterKw":1,"mpptAReq":30.2,"mpptA":35,"nSeries":2,"nStrings":1,"vocColdString":108.2,"vmpHotString":74.4,"stringFuseRequired":false,"pvCableMm2":4,"pvVdPct":1.62,"battIdcA":22.2,"battFuseA":30,"battCableMm2":10,"acBreakerA":6,"acCableMm2":2.5,"annualKwh":1778,"areaFlushM2":6.2,"midClamps":2,"endClamps":4,"railM":4.62}},
  {"id":"b_hybrid_riyadh",
   "inputs":{"mode":"hybrid","loads":[{"w":1300,"qty":2,"h":6,"surge":3.0},{"w":200,"qty":1,"h":10,"surge":4.0},{"w":150,"qty":1,"h":8,"surge":4.0},{"w":500,"qty":1,"h":1,"surge":3.0},{"w":100,"qty":1,"h":5,"surge":1.0},{"w":10,"qty":12,"h":6,"surge":1.0},{"w":70,"qty":4,"h":8,"surge":1.5},{"w":10,"qty":1,"h":24,"surge":1.0},{"w":60,"qty":1,"h":4,"surge":1.0},{"w":400,"qty":1,"h":1,"surge":3.0},{"w":1200,"qty":1,"h":0.3,"surge":1.5},{"w":2000,"qty":1,"h":0.25,"surge":1.0},{"w":100,"qty":1,"h":5,"surge":1.0}],
     "psh":5.8,"tMinDesign":0,"tCellHot":70,"fNight":0.60,"autonomyDays":1,"diversity":0.80,"derratePv":0.80,"battRoundTrip":0.92,"systemV":48,"invEffBatt":0.95,"invEffDc":0.94,
     "inverter":{"vDcMax":500,"vMpptMin":150,"vMpptMax":425,"nMppt":2,"iMpptMaxA":22,"iscMaxA":34,"maxPvW":10400,"surgeFactor":2.0,"acV":230,"phases":1},
     "pvRunM":25,"battRunM":2,"acRunM":15,"kAmb":0.87,"genChargeC":0.2,"genPf":0.8,"genMargin":1.1,"chargerEff":0.95},
   "expected":{"eDayWh":25000,"eNightWh":15000,"pSumW":7720,"pPeakW":6176,"pSurgeW":8776,"dEff":0.7616,"pvKwpRequired":5.660,"panels":10,"pvKwpInstalled":5.8,"battWhRequired":19737,"battUnits":4,"battSeries":1,"battParallel":4,"battKwh":20.48,"battAh":400,"autonomyActualDays":1.04,"inverterReqW":7720,"inverterKw":8,"dcAcRatio":0.725,"dischargeCRate":0.39,"chargeCRate":0.26,"nSeriesMax":9,"nSeriesMin":5,"nSeries":5,"nStrings":2,"stringsPerMppt":[1,1],"vocColdString":273.6,"vmpHotString":186.0,"vmpStcString":215,"stringFuseRequired":false,"pvCableMm2":4,"pvVdPct":1.35,"battIdcA":177.3,"battFuseA":225,"battCableMm2":70,"acCurrentA":34.8,"acBreakerA":50,"acCableMm2":10,"acVdPct":0.78,"genKvaBase":15,"genKvaHotDerated":20,"genAcInputLimitA":40,"annualKwh":9823,"specificYield":1694,"areaFlushM2":31.0,"midClamps":16,"endClamps":8,"railM":23.1,"co2TonnesPerYr":5.0}},
  {"id":"c_gridtied_100kw_3ph",
   "inputs":{"mode":"gridtied","inverterKwAc":100,"phases":3,"acV":400,"pf":1.0,"dcAcTarget":1.2,"psh":5.5,"tMinDesign":0,"tCellHot":70,"codeLimitV":1000,"deratePv":0.80,
     "inverter":{"vDcMax":1100,"vMpptMin":200,"vMpptMax":1000,"vFullPowerMin":500,"vFullPowerMax":850,"nMppt":10,"inputsPerMppt":2,"iMpptMaxA":30,"iscMaxA":45,"maxPvW":150000},
     "pvRunM":60,"acRunM":40,"kAmb":0.87,"capexPerWp":0.65,"tariff":0.08,"omPct":0.01,"discountRate":0.06,"degradation":0.005,"years":25,"efGrid":0.55},
   "expected":{"pvKwpTarget":120,"panelsBeforeStringRounding":207,"vocColdModule":54.72,"vmpHotModule":37.2,"nSeriesMax":18,"nSeriesMinFullPower":14,"nSeries":18,"nStrings":12,"panels":216,"pvKwpInstalled":125.28,"dcAcRatio":1.253,"stringsPerMppt":[2,2,1,1,1,1,1,1,1,1],"vocColdString":984.9,"vmpStcString":774,"vmpHotString":669.5,"stringFuseRequired":false,"stringFuseRecommendedA":25,"pvCableMm2":4,"pvVdPct":0.90,"acCurrentA":144.3,"acBreakerA":200,"acCableMm2":120,"acVdPct":0.36,"annualKwh":201200,"specificYield":1606,"production25yrKwh":4739450,"year25Kwh":178394,"capex":81432,"annualSavings":16096,"paybackYears":5.06,"lcoe":0.0373,"co2TonnesPerYr":110.7,"areaModuleM2":558,"areaFlushM2":670,"areaTiltedM2":1004,"railM":499,"rails6m":88,"midClamps":408,"endClamps":48}}
 ]
}
```

---

## 14. INPUT / OUTPUT SUMMARY FOR THE DEVELOPER

Inputs: mode (offgrid | hybrid | gridtied); load lines (appliance id or custom W, qty, h/day, surgeFactor, phase, nightFraction); site (PSH annual + optional monthly, latitude, T_amb_min_design, T_amb_day_avg, T_amb_max, ambient for cables, country for EF_grid); module record; battery unit record + chemistry defaults; inverter family record (limits above) or "auto"; options (autonomyDays, DoD override, fNight override, DF override, DC:AC target, derate components, cable run lengths, unit prices, tariff, discount rate).

Outputs (each with the formula string used, for the PDF report): load table + E_day/P_peak/P_surge; PV kWp and panel count; string configuration with Voc_cold/Vmp_hot checks (pass/fail); battery kWh/Ah/units/series-parallel/autonomy/C-rate checks; inverter kW and surge check; MPPT controller A (off-grid separate); protective device ratings (string fuse, DC isolator, battery fuse, AC breakers, SPDs); cable sizes with Vd %; generator kVA; roof area, tilt, azimuth, row pitch; BOM with quantities; monthly and annual energy, 25-year table, payback, NPV, LCOE, CO₂. Every "nextStd" lookup must also return the computed pre-rounding value so engineers can override.

Validation warnings the tool must raise: Voc_cold string > inverter/code limit; Vmp_hot < MPPT min; Imp or Isc×1.25 per MPPT exceeded; DC:AC > 1.3 (grid-tied) or > inverter max PV; charge C-rate > 0.5 (LFP) / 0.2 (lead-acid); discharge C-rate > 1 (LFP) / 0.2 (lead-acid); Vd > 3 % DC or > 2 % AC; inverter surge < P_surge; 48 V bus with > 15 kW (recommend HV); lead-acid autonomy < 2 days off-grid; generator < 1.5 × inverter kVA.

---

## Appendix A — Appliance library (JSON)
```json
[
 {
  "id": "led_bulb_10w",
  "name": "LED bulb 10 W",
  "category": "lighting",
  "watts": 10,
  "hoursPerDay": 6,
  "surgeFactor": 1.0,
  "phase": 1
 },
 {
  "id": "led_tube_18w",
  "name": "LED tube light 18 W",
  "category": "lighting",
  "watts": 18,
  "hoursPerDay": 6,
  "surgeFactor": 1.0,
  "phase": 1
 },
 {
  "id": "led_flood_50w",
  "name": "LED floodlight 50 W",
  "category": "lighting",
  "watts": 50,
  "hoursPerDay": 10,
  "surgeFactor": 1.0,
  "phase": 1
 },
 {
  "id": "cfl_20w",
  "name": "CFL lamp 20 W",
  "category": "lighting",
  "watts": 20,
  "hoursPerDay": 5,
  "surgeFactor": 1.0,
  "phase": 1
 },
 {
  "id": "ceiling_fan",
  "name": "Ceiling fan",
  "category": "cooling",
  "watts": 70,
  "hoursPerDay": 8,
  "surgeFactor": 1.5,
  "phase": 1
 },
 {
  "id": "stand_fan",
  "name": "Pedestal / stand fan",
  "category": "cooling",
  "watts": 55,
  "hoursPerDay": 6,
  "surgeFactor": 1.5,
  "phase": 1
 },
 {
  "id": "evap_cooler",
  "name": "Evaporative (desert) air cooler",
  "category": "cooling",
  "watts": 250,
  "hoursPerDay": 8,
  "surgeFactor": 3.0,
  "phase": 1
 },
 {
  "id": "ac_window_1ton",
  "name": "Window AC 1 ton (12,000 BTU)",
  "category": "cooling",
  "watts": 1300,
  "hoursPerDay": 8,
  "surgeFactor": 3.5,
  "phase": 1
 },
 {
  "id": "ac_window_1_5ton",
  "name": "Window AC 1.5 ton (18,000 BTU)",
  "category": "cooling",
  "watts": 1900,
  "hoursPerDay": 8,
  "surgeFactor": 3.5,
  "phase": 1
 },
 {
  "id": "ac_split_1ton_inv",
  "name": "Split AC 1 ton inverter",
  "category": "cooling",
  "watts": 1000,
  "hoursPerDay": 8,
  "surgeFactor": 2.0,
  "phase": 1
 },
 {
  "id": "ac_split_1ton_fixed",
  "name": "Split AC 1 ton fixed-speed",
  "category": "cooling",
  "watts": 1200,
  "hoursPerDay": 8,
  "surgeFactor": 3.0,
  "phase": 1
 },
 {
  "id": "ac_split_1_5ton_inv",
  "name": "Split AC 1.5 ton inverter",
  "category": "cooling",
  "watts": 1300,
  "hoursPerDay": 8,
  "surgeFactor": 2.0,
  "phase": 1
 },
 {
  "id": "ac_split_1_5ton_fixed",
  "name": "Split AC 1.5 ton fixed-speed",
  "category": "cooling",
  "watts": 1800,
  "hoursPerDay": 8,
  "surgeFactor": 3.0,
  "phase": 1
 },
 {
  "id": "ac_split_2ton_inv",
  "name": "Split AC 2 ton inverter",
  "category": "cooling",
  "watts": 1800,
  "hoursPerDay": 8,
  "surgeFactor": 2.0,
  "phase": 1
 },
 {
  "id": "ac_split_2ton_fixed",
  "name": "Split AC 2 ton fixed-speed",
  "category": "cooling",
  "watts": 2400,
  "hoursPerDay": 8,
  "surgeFactor": 3.0,
  "phase": 1
 },
 {
  "id": "ac_cassette_4ton_3ph",
  "name": "Cassette / ducted AC 4 ton (3-phase)",
  "category": "cooling",
  "watts": 4800,
  "hoursPerDay": 8,
  "surgeFactor": 3.0,
  "phase": 3
 },
 {
  "id": "water_cooler",
  "name": "Water cooler / dispenser (hot+cold)",
  "category": "appliance",
  "watts": 120,
  "hoursPerDay": 10,
  "surgeFactor": 3.0,
  "phase": 1
 },
 {
  "id": "fridge_small",
  "name": "Refrigerator 150-250 L",
  "category": "refrigeration",
  "watts": 120,
  "hoursPerDay": 8,
  "surgeFactor": 4.0,
  "phase": 1
 },
 {
  "id": "fridge_large",
  "name": "Refrigerator-freezer 400-600 L",
  "category": "refrigeration",
  "watts": 200,
  "hoursPerDay": 9,
  "surgeFactor": 4.0,
  "phase": 1
 },
 {
  "id": "chest_freezer",
  "name": "Chest fridge / chest freezer 300 L",
  "category": "refrigeration",
  "watts": 150,
  "hoursPerDay": 8,
  "surgeFactor": 4.0,
  "phase": 1
 },
 {
  "id": "deep_freezer",
  "name": "Deep freezer 500 L",
  "category": "refrigeration",
  "watts": 250,
  "hoursPerDay": 10,
  "surgeFactor": 4.0,
  "phase": 1
 },
 {
  "id": "display_chiller",
  "name": "Commercial display chiller / cold cabinet",
  "category": "refrigeration",
  "watts": 600,
  "hoursPerDay": 12,
  "surgeFactor": 3.5,
  "phase": 1
 },
 {
  "id": "tv_led_43",
  "name": "LED TV 43 in",
  "category": "electronics",
  "watts": 80,
  "hoursPerDay": 5,
  "surgeFactor": 1.0,
  "phase": 1
 },
 {
  "id": "tv_led_65",
  "name": "LED TV 65 in",
  "category": "electronics",
  "watts": 150,
  "hoursPerDay": 5,
  "surgeFactor": 1.0,
  "phase": 1
 },
 {
  "id": "satellite_receiver",
  "name": "Satellite receiver / decoder",
  "category": "electronics",
  "watts": 20,
  "hoursPerDay": 5,
  "surgeFactor": 1.0,
  "phase": 1
 },
 {
  "id": "router",
  "name": "Wi-Fi router / modem",
  "category": "electronics",
  "watts": 10,
  "hoursPerDay": 24,
  "surgeFactor": 1.0,
  "phase": 1
 },
 {
  "id": "phone_charger",
  "name": "Phone charger",
  "category": "electronics",
  "watts": 10,
  "hoursPerDay": 3,
  "surgeFactor": 1.0,
  "phase": 1
 },
 {
  "id": "laptop",
  "name": "Laptop",
  "category": "electronics",
  "watts": 60,
  "hoursPerDay": 6,
  "surgeFactor": 1.0,
  "phase": 1
 },
 {
  "id": "desktop_pc",
  "name": "Desktop PC with monitor",
  "category": "electronics",
  "watts": 200,
  "hoursPerDay": 8,
  "surgeFactor": 1.2,
  "phase": 1
 },
 {
  "id": "printer_laser",
  "name": "Laser printer",
  "category": "office",
  "watts": 500,
  "hoursPerDay": 1,
  "surgeFactor": 1.5,
  "phase": 1
 },
 {
  "id": "printer_inkjet",
  "name": "Inkjet printer",
  "category": "office",
  "watts": 30,
  "hoursPerDay": 1,
  "surgeFactor": 1.0,
  "phase": 1
 },
 {
  "id": "photocopier",
  "name": "Photocopier (office)",
  "category": "office",
  "watts": 1200,
  "hoursPerDay": 2,
  "surgeFactor": 1.5,
  "phase": 1
 },
 {
  "id": "pos_terminal",
  "name": "POS terminal + receipt printer",
  "category": "office",
  "watts": 50,
  "hoursPerDay": 10,
  "surgeFactor": 1.0,
  "phase": 1
 },
 {
  "id": "cctv_4ch",
  "name": "CCTV 4 cameras + DVR/NVR",
  "category": "security",
  "watts": 50,
  "hoursPerDay": 24,
  "surgeFactor": 1.0,
  "phase": 1
 },
 {
  "id": "cctv_16ch",
  "name": "CCTV 16 cameras + NVR",
  "category": "security",
  "watts": 150,
  "hoursPerDay": 24,
  "surgeFactor": 1.0,
  "phase": 1
 },
 {
  "id": "server_rack",
  "name": "Server / network rack (1 server + switch)",
  "category": "office",
  "watts": 400,
  "hoursPerDay": 24,
  "surgeFactor": 1.2,
  "phase": 1
 },
 {
  "id": "washing_machine",
  "name": "Washing machine (front/top load)",
  "category": "appliance",
  "watts": 500,
  "hoursPerDay": 1,
  "surgeFactor": 3.0,
  "phase": 1
 },
 {
  "id": "electric_iron",
  "name": "Electric iron",
  "category": "appliance",
  "watts": 1200,
  "hoursPerDay": 0.5,
  "surgeFactor": 1.0,
  "phase": 1
 },
 {
  "id": "microwave",
  "name": "Microwave oven",
  "category": "kitchen",
  "watts": 1200,
  "hoursPerDay": 0.5,
  "surgeFactor": 1.5,
  "phase": 1
 },
 {
  "id": "kettle",
  "name": "Electric kettle",
  "category": "kitchen",
  "watts": 2000,
  "hoursPerDay": 0.3,
  "surgeFactor": 1.0,
  "phase": 1
 },
 {
  "id": "toaster",
  "name": "Toaster",
  "category": "kitchen",
  "watts": 900,
  "hoursPerDay": 0.2,
  "surgeFactor": 1.0,
  "phase": 1
 },
 {
  "id": "blender",
  "name": "Blender / juicer",
  "category": "kitchen",
  "watts": 400,
  "hoursPerDay": 0.2,
  "surgeFactor": 2.0,
  "phase": 1
 },
 {
  "id": "water_heater_geyser",
  "name": "Electric water heater 50-80 L (geyser)",
  "category": "heating",
  "watts": 2000,
  "hoursPerDay": 2,
  "surgeFactor": 1.0,
  "phase": 1
 },
 {
  "id": "instant_water_heater",
  "name": "Instant electric water heater",
  "category": "heating",
  "watts": 4500,
  "hoursPerDay": 0.5,
  "surgeFactor": 1.0,
  "phase": 1
 },
 {
  "id": "electric_stove",
  "name": "Electric cooktop (2 plates)",
  "category": "kitchen",
  "watts": 2500,
  "hoursPerDay": 1,
  "surgeFactor": 1.0,
  "phase": 1
 },
 {
  "id": "hair_dryer",
  "name": "Hair dryer",
  "category": "appliance",
  "watts": 1500,
  "hoursPerDay": 0.2,
  "surgeFactor": 1.2,
  "phase": 1
 },
 {
  "id": "vacuum",
  "name": "Vacuum cleaner",
  "category": "appliance",
  "watts": 1200,
  "hoursPerDay": 0.3,
  "surgeFactor": 2.0,
  "phase": 1
 },
 {
  "id": "pump_surface_0_5hp",
  "name": "Surface water pump 0.5 HP",
  "category": "pump",
  "watts": 400,
  "hoursPerDay": 2,
  "surgeFactor": 3.0,
  "phase": 1
 },
 {
  "id": "pump_surface_1hp",
  "name": "Surface water pump 1 HP",
  "category": "pump",
  "watts": 750,
  "hoursPerDay": 2,
  "surgeFactor": 3.0,
  "phase": 1
 },
 {
  "id": "pump_sub_0_5hp",
  "name": "Submersible well pump 0.5 HP",
  "category": "pump",
  "watts": 400,
  "hoursPerDay": 3,
  "surgeFactor": 5.0,
  "phase": 1
 },
 {
  "id": "pump_sub_1hp",
  "name": "Submersible well pump 1 HP",
  "category": "pump",
  "watts": 750,
  "hoursPerDay": 3,
  "surgeFactor": 5.0,
  "phase": 1
 },
 {
  "id": "pump_sub_1_5hp",
  "name": "Submersible well pump 1.5 HP",
  "category": "pump",
  "watts": 1100,
  "hoursPerDay": 4,
  "surgeFactor": 5.0,
  "phase": 1
 },
 {
  "id": "pump_sub_2hp",
  "name": "Submersible well pump 2 HP",
  "category": "pump",
  "watts": 1500,
  "hoursPerDay": 4,
  "surgeFactor": 5.0,
  "phase": 1
 },
 {
  "id": "pump_sub_3hp_3ph",
  "name": "Submersible well pump 3 HP (3-phase)",
  "category": "pump",
  "watts": 2200,
  "hoursPerDay": 5,
  "surgeFactor": 5.0,
  "phase": 3
 },
 {
  "id": "pump_sub_5hp_3ph",
  "name": "Submersible well pump 5 HP (3-phase)",
  "category": "pump",
  "watts": 3700,
  "hoursPerDay": 6,
  "surgeFactor": 5.0,
  "phase": 3
 },
 {
  "id": "pressure_booster",
  "name": "Pressure booster pump 0.75 HP",
  "category": "pump",
  "watts": 550,
  "hoursPerDay": 1.5,
  "surgeFactor": 3.0,
  "phase": 1
 },
 {
  "id": "motor_3ph_5hp",
  "name": "3-phase induction motor 5 HP",
  "category": "motor",
  "watts": 3700,
  "hoursPerDay": 6,
  "surgeFactor": 4.0,
  "phase": 3
 },
 {
  "id": "motor_3ph_10hp",
  "name": "3-phase induction motor 10 HP",
  "category": "motor",
  "watts": 7500,
  "hoursPerDay": 6,
  "surgeFactor": 4.0,
  "phase": 3
 },
 {
  "id": "motor_3ph_20hp",
  "name": "3-phase induction motor 20 HP",
  "category": "motor",
  "watts": 15000,
  "hoursPerDay": 6,
  "surgeFactor": 4.0,
  "phase": 3
 },
 {
  "id": "grain_mill",
  "name": "Grain / flour mill 7.5 HP (3-phase)",
  "category": "agri",
  "watts": 5500,
  "hoursPerDay": 4,
  "surgeFactor": 4.0,
  "phase": 3
 },
 {
  "id": "milking_machine",
  "name": "Milking machine 1 HP",
  "category": "agri",
  "watts": 750,
  "hoursPerDay": 2,
  "surgeFactor": 3.0,
  "phase": 1
 },
 {
  "id": "incubator",
  "name": "Egg incubator (medium)",
  "category": "agri",
  "watts": 150,
  "hoursPerDay": 24,
  "surgeFactor": 1.0,
  "phase": 1
 },
 {
  "id": "poultry_fan",
  "name": "Poultry house ventilation fan 1 HP",
  "category": "agri",
  "watts": 750,
  "hoursPerDay": 12,
  "surgeFactor": 3.0,
  "phase": 1
 },
 {
  "id": "welding_machine",
  "name": "Welding machine 200 A inverter",
  "category": "workshop",
  "watts": 5000,
  "hoursPerDay": 2,
  "surgeFactor": 2.0,
  "phase": 1
 },
 {
  "id": "compressor_2hp",
  "name": "Air compressor 2 HP",
  "category": "workshop",
  "watts": 1500,
  "hoursPerDay": 2,
  "surgeFactor": 4.0,
  "phase": 1
 },
 {
  "id": "angle_grinder",
  "name": "Angle grinder / power tool",
  "category": "workshop",
  "watts": 900,
  "hoursPerDay": 1,
  "surgeFactor": 2.0,
  "phase": 1
 }
]
```

## Appendix B — Source index

- NREL PVWatts V5 technical manual (loss defaults, 14 %): https://pvwatts.nrel.gov/downloads/pvwattsv5.pdf
- HOMER Pro PV derating factor: https://homerenergy.com/products/pro/docs/latest/pv_derating_factor.html ; charge-controller note: https://homerenergy.com/docs/knowledgebase/article/can-homer-model-a-charge-controller/
- NEC 2023 Article 690 (690.7 max voltage, 690.8 currents, 690.9 OCPD) explained by Mike Holt: https://www.mikeholt.com/newsletters.php?action=display&letterID=2809 ; Mayfield Renewables 690.8(B): https://www.mayfield.energy/technical-articles/how-to-calculate-wire-size-amp-nec-690-8-b/
- IEC 62548-1:2023 summary and string fusing: https://heavendesigns.in/blog/iec-62548-pv-array-design-standard/ ; SolarEdge string fusing note: https://knowledge-center.solaredge.com/sites/kc/files/string_fusing_requirements_eu_and_apac_en.pdf ; Eaton Bussmann PV fuses: https://docs.rs-online.com/fb65/A700000008518340.pdf
- IEC 60364-5-52 ampacity tables: https://www.ti-soft.com/en/support/help/electricaldesign/standards/iec-60364-5-52/current-carrying-capacity/table_b_52_2 , https://www.ti-soft.com/en/support/help/electricaldesign/standards/iec-60364-5-52/current-carrying-capacity/table_b_52_4
- AWG/mm2: https://www.rapidonline.com/news/wire-gauge-conversion-chart
- Voltage drop (DC, 3%): https://www.unboundsolar.com/solar-information/voltage-drop , https://oztradiecalc.com/electrician/solar-dc-cable-calculator
- NOCT cell temperature model: https://www.sciencedirect.com/topics/engineering/cell-temperature , https://www.solarnplus.com/how-to-calculate-pv-cell-temperature/
- Battery sizing (autonomy, DoD): https://techfinepv.com/off-grid-battery-bank-sizing/ , https://www.unboundsolar.com/solar-information/battery-bank-sizing , https://bigbattery.com/2026/08/31/off-grid-cabin-battery-system-sizing/
- Cycle life / C-rate: https://www.ufinebattery.com/blog/lifepo4-cycle-life/ , https://gridwright.com/blog/lifepo4-vs-agm , https://www.epever.com/articles/how-long-do-lifepo%E2%82%84-batteries-last-in-solar-energy-systems/
- Inverter sizing 1.25 and surge: https://shop.alchemyindustrial.com/blogs/news/how-to-size-a-victron-off-grid-power-system , https://eneronix.com/off-grid-inverter-sizing-example/ , https://backuppowercalc.com/guides/running-vs-starting-watts.html
- Victron generator FAQ: https://www.victronenergy.com/live/multiplus_faq ; Victron MPPT controllers: https://www.victronenergy.com/solar-charge-controllers
- Deye SUN-29.9-50K-SG01HP3 datasheet: https://www.deyeinverter.com/deyeinverter/2023/12/18/datasheet_sun-29.9-50k-sg01hp3-eu-bm4_231218_en.pdf
- Roof area per kWp and module dimensions: https://www.maysunsolar.com/blog-what-are-the-standard-sizes-of-solar-photovoltaic-panels/ , https://www.thegreenwatt.com/solar-rooftop-calculator-how-many-solar-panels-can-fit-on-roof-kw/
- Tilt / row spacing: https://www.greentechrenewables.com/article/solar-array-tilt-angle-and-energy-output , https://pvrack.com/materials-design/tilt-angle-optimization/ , https://www.surgepv.com/blog/solar-panel-tilt-azimuth-calculator
- LCOE: https://www.nrel.gov/pv/lcoe-calculator/documentation , https://www.nrel.gov/analysis/tech-lcoe-documentation ; degradation 0.5 %/yr: https://www.renewableenergyworld.com/solar/insights-into-pv-lcoe-through-a-new-degradation-study/
- Emission factors: Saudi grid https://sustainability.ksu.edu.sa/sites/sustainability.ksu.edu.sa/files/2025-04/Carbon%20emissions%20for%20KSU%20main%20campus%20(2024).pdf ; Sudan https://lowcarbonpower.org/region/Sudan ; diesel https://www.whjlmech.com/knowledge/how-much-co2-emissions-per-kwh-from-diesel-generator , https://yuripower.com/2026/08/17/real-cost-of-diesel-generated-electricity/
- Irradiation data: https://globalsolaratlas.info , https://re.jrc.ec.europa.eu/pvg_tools/en/
- Coincidence factor: https://www.electrical-installation.org/enwiki/Estimation_of_actual_maximum_kVA_demand
