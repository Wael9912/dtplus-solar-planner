# DT+ Solar Planner

Browser-based solar PV design, sizing and quotation tool for solar installation companies.
Walks the user step by step from appliance loads to a priced bill of materials, with Excel and PDF export.
Runs entirely in the browser (no backend); projects are saved locally and can be exported/imported as JSON.

**Product developed by DT+.**

## Features

- 7-step wizard: Project → Loads → Site & sun → System → Sizing → Bill of materials → Export
- Off-grid, hybrid (grid + battery backup) and grid-tied systems; single- and three-phase
- Appliance library (72 items, EN/AR) with typical watts, hours, surge factors; quick templates (home, shop, farm pump, clinic)
- 70 locations with monthly peak-sun-hours from NASA POWER climatology, plus custom location
- Catalog: 19 panels (100–720 W), 22 batteries (12 V lead-acid to HV LiFePO4), 34 inverters (1–110 kW), 9 MPPT controllers, full balance-of-system items
- Engine: derate chain (NOCT temperature, soiling, shading, wiring, mismatch, inverter, battery round-trip), PV kWp, string design (Voc cold / Vmp hot / Isc per MPPT, IEC 62548 / NEC 690), battery sizing (autonomy, DoD, series/parallel, C-rate), inverter auto-selection with parallel stacking, cable sizing (voltage drop, ampacity derating), fuse/breaker rounding, generator kVA, roof area, monthly production, savings, payback, LCOE, CO₂
- Design checks (OK / warning / error) explaining every issue
- Bill of materials with editable prices and quantities, custom lines, margin, discount, VAT, multi-currency
- Exports: branded client proposal PDF, technical design PDF, Excel workbook with live formulas, project JSON
- English / Arabic (RTL) interface; company branding (logo, colour, terms) for quotations
- Works offline after first load; mobile friendly

## Development

```bash
npm install
npm run dev        # http://localhost:5173/dtplus-solar-planner/
npm test           # vitest – engine tests against worked examples in docs/sizing-methodology.md
npm run build      # production build to dist/
```

Deployment: pushing to `main` runs `.github/workflows/deploy.yml` which builds and publishes to GitHub Pages.
Cloudflare Pages (https://dtplus-solar-planner.pages.dev): `npm run deploy:cf` builds with `VITE_BASE=/` and uploads `dist/` with Wrangler (run `npx wrangler login` once first).
Any other static host: build with `VITE_BASE=/ npm run build` and upload `dist/` (drop `404.html`, which redirects to the GitHub Pages path).

## Documentation

- `docs/sizing-methodology.md` — formulas, standards, appliance table and worked examples the engine implements
- `docs/catalog-notes.md` — sources and caveats for every catalog entry; indicative pricing basis
- `docs/irradiance-notes.md` — how location data was derived; tilt conversion
- `docs/features.md` — competitive review and prioritised feature backlog

## Disclaimer

Catalog prices are indicative international wholesale figures (2025) and must be replaced with supplier quotes.
Results are a design aid; final designs must be verified by a qualified engineer against local codes.
