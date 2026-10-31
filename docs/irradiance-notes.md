# irradiance.json — derivation notes

Compiled 2026-10-31 for the browser solar sizing tool. 70 locations (all requested cities plus a few extras in the same countries).

## Field-by-field derivation

| Field | How it was derived |
|---|---|
| `monthlyPsh` | Monthly mean of daily **GHI on the horizontal** (kWh/m²/day = peak sun hours), from the NASA POWER climatology API, parameter `ALLSKY_SFC_SW_DWN`, Renewable Energy community, 25-year climatology Jan 2001–Dec 2025 (CERES SYN1deg + MERRA-2). Fetched per city lat/lon on 2026-10-31. |
| `annualPsh` | Simple mean of the 12 monthly values (equivalent to annual GHI kWh/m²/yr ÷ 365 within rounding). |
| Dust correction | For the 8 Sudan cities, N'Djamena and Kano, POWER values were multiplied by **0.96**. MERRA-2/CERES is known to under-represent Sahel/Saharan dust aerosol; Global Solar Atlas gives Khartoum ≈ 2,300 kWh/m²/yr (≈ 6.3/day) vs POWER 6.60. The scaled result (6.34) matches GSA. Each record carries a `source` string that says whether scaling was applied. |
| `optimalTiltDeg` | Rule of thumb for fixed, year-round-optimised tilt (Landau / PVGIS-consistent): `0.87·|lat|` for |lat| < 25°, `0.76·|lat| + 3.1` for 25°–50°, floored at 10° so panels self-clean/shed rain. Azimuth is due south in the northern hemisphere, due north in the southern hemisphere (Nairobi, Mombasa, Dar es Salaam, Jakarta, Johannesburg, Cape Town, São Paulo, Sydney, Perth). PVGIS "optimal slope" output typically agrees within ±3°. |
| `avgHighTempC` | 12 monthly average daily highs = NASA POWER `T2M` (monthly mean 2 m temperature) + `T2M_RANGE`/2. MERRA-2 is a 0.5° grid, so coastal and mountain cities (Port Sudan, Muscat, Addis Ababa, Mexico City) can be 1–3 °C off station climatology. Use for cell-temperature derating (NOCT / Ross coefficient). |
| `recordLowTempC` | Approximate station record low (°C) from published climate tables (Wikipedia/WMO/national met services, cross-checked against POWER `T2M_MIN`). Use this for **Voc string sizing**: Voc_max = Voc_STC × (1 + βVoc × (T_recordLow − 25)). |
| `gridEmissionKgPerKwh` | Approximate national grid CO₂ intensity (kg CO₂/kWh), ~2022–2024, from IEA/Ember/EPA eGRID-style public figures. Hydro-heavy grids (Ethiopia 0.03, Uganda 0.04, Kenya 0.09, Brazil 0.08, France 0.06, Ontario/Toronto 0.03) are low; coal/oil/diesel grids (South Africa 0.90, India 0.71, Indonesia 0.72, Sudan ~0.33 hydro+thermal mix) are high. Yemen, Somalia, South Sudan, Chad, Eritrea assume diesel/HFO-dominated generation (~0.6). |
| `typicalTariffUsdPerKwh` | Rough **residential** tariff in USD/kWh at 2024–2025 exchange rates. Heavily subsidised markets (Kuwait, Qatar, Sudan, Egypt, Iraq, Libya) are < 0.05; Europe 0.22–0.40; East Africa 0.13–0.25. Sudan is listed at ~0.03 because of subsidy and SDG depreciation, but real-world cost of diesel/generator backup there is 0.40–0.60+ — the tool should let users override. |
| `currency` | ISO 4217 code. |

## Sources

- NASA POWER climatology API (primary data for GHI and temperature):
  `https://power.larc.nasa.gov/api/temporal/climatology/point?parameters=ALLSKY_SFC_SW_DWN,T2M,T2M_RANGE,T2M_MIN&community=RE&longitude=<lon>&latitude=<lat>&format=JSON`
  Docs: https://power.larc.nasa.gov/docs/
- Global Solar Atlas (World Bank / Solargis) — used to calibrate Sahel values and to cross-check optimum tilt: https://globalsolaratlas.info/
- PVGIS (EU JRC) — cross-check for European/Mediterranean/African sites and optimal slope: https://re.jrc.ec.europa.eu/pvg_tools/en/
- NREL NSRDB / PVWatts — cross-check for US cities: https://nsrdb.nrel.gov/ and https://pvwatts.nrel.gov/
- Climate tables (record lows, average highs sanity check): Weatherspark https://weatherspark.com/ and Wikipedia city climate boxes.
- Grid factors: IEA emissions factors, Ember Yearly Electricity Data https://ember-energy.org/data/, EPA eGRID (US), Our World in Data carbon intensity of electricity.

Raw POWER responses are kept beside this file in `power_raw.json` (keyed by id) so values can be re-derived.

## Horizontal PSH → tilted-plane PSH ("Custom" location guidance)

The JSON stores **horizontal** GHI. A fixed array at optimal tilt sees more annual energy. Simple rule used by the tool:

```
PSH_tilt = PSH_horizontal × tiltGain
```

Approximate annual `tiltGain` at optimal tilt, facing the equator:

| |lat| | Optimal tilt | tiltGain (annual) |
|---|---|---|
| 0–10° | 10° (min) | 1.00–1.03 |
| 10–15° | ≈ |lat| | 1.03–1.05 |
| 15–25° | ≈ 0.87·|lat| | 1.05–1.10 |
| 25–35° | ≈ 0.76·|lat|+3 | 1.10–1.15 |
| 35–45° | ≈ 0.76·|lat|+3 | 1.15–1.22 |
| 45–55° | ≈ 0.76·|lat|+3 | 1.20–1.30 |

Reasonable compact formula: `tiltGain ≈ 1 + 0.0045 × |lat|` (clamped to 1.00–1.30), e.g. Khartoum (15.6°) → 1.07, Cairo (30°) → 1.135, London (51.5°) → 1.23.

Month-by-month behaviour (useful if the tool shows seasonal output): tilting **boosts winter months** (Dec/Jan gain can be 1.3–1.6× at 30° latitude) and **slightly reduces summer months** (0.92–0.98× in Jun/Jul). For a worst-month off-grid design, use the winter gain on the lowest-PSH month rather than the annual factor.

Other knobs for a "Custom" location:
- Flat/horizontal mount: tiltGain = 1.00.
- Tilt = latitude + 15° (winter-optimised, off-grid): annual ≈ 0.97× optimal, worst winter month ≈ 1.05–1.10× optimal-tilt value.
- Azimuth off by ±45° from equator-facing: multiply by ~0.95; east/west facing (±90°): ~0.85.
- Single-axis tracker: ~1.25–1.35× horizontal; dual-axis: ~1.35–1.45× horizontal in sunny climates.
- Soiling in dusty Sahel/Gulf sites: apply an additional 0.90–0.95 unless panels are cleaned at least monthly (haboob season in Khartoum, Apr–Sep, can push soiling losses past 15%).

## Realism check (Khartoum)

Khartoum annual 6.34 PSH; peak Apr 7.31 / Mar 6.97 / May 7.04; dips Aug 6.10 (rainy-season cloud + dust) and Dec 5.39 (low sun). Matches the Global Solar Atlas profile and the brief's expectation (~6.3 annual, 7+ in Apr–May, ~5.5–6 in Aug and Dec).

## Caveats

- Precision ±5% on irradiance, ±2 °C on temperature. NASA POWER is ~1°×1° (solar) / 0.5° (temperature) gridded, so small coastal or high-altitude sites inherit some grid-cell smoothing.
- Tariffs and grid factors change yearly and some (Sudan, Yemen, Somalia, South Sudan) are estimates; expose them as editable defaults in the UI.
- Southern-hemisphere sites have their peak PSH in Dec–Jan and trough in Jun–Jul; the array indexes are still Jan→Dec.
