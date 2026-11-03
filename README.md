# DT+ Solar Planner

Browser-based solar PV design, sizing and quotation tool for solar installation companies.
Use one piece on its own — a load calculator, a quote for a system size the client already chose, a product quote, an engineering
calculator — or walk the full design from appliances (or the electricity bill) to a priced bill of materials and branded documents.
Runs entirely in the browser (no backend); projects and the company price list are saved locally and can be exported/imported as JSON.

**Product developed by DT+.**

## Features

- Start hub — pick only what the job needs:
  - **Load calculator**: appliances (or monthly bill) → kWh/day, peak, recommended panels / battery / inverter and an indicative price on one screen; copy, WhatsApp share, 1-page PDF, "make full proposal"
  - **Quote a known size**: the client already chose e.g. 5 kWp + 5 kW + 10 kWh → priced quote without a load list; "no panels" (battery backup / UPS) and "no battery" options
  - **Product quote**: counter sale / spare parts — pick products from the catalogue, get a quotation
  - **Full design**: 7-step wizard Client → Loads (appliances or electricity bill) → Site & sun → System → Results → Pricing → Export
  - **Engineering tools**: string checker, battery bank, cable & breaker, generator & inverter sizing — no project needed
- Projects convert between modes; equipment already on site (upgrades) is designed but not quoted; daily grid-outage hours value hybrid savings at the diesel cost
- Company price list: own prices, products not stocked (never auto-selected), own products with datasheet values, services rates; company file and full backup to share one setup across staff devices
- Sent quotes keep the prices they were quoted with ("Use current prices" to re-price); Arabic company name, tagline and terms for Arabic documents
- Off-grid, hybrid (grid + battery backup) and grid-tied systems; single- and three-phase
- Appliance library (72 items, EN/AR) with typical watts, hours, surge factors; quick templates (home, shop, farm pump, clinic)
- 70 locations with monthly peak-sun-hours from NASA POWER climatology, plus custom location
- Catalog: 19 panels (100–720 W), 22 batteries (12 V lead-acid to HV LiFePO4), 34 inverters (1–110 kW), 9 MPPT controllers, full balance-of-system items
- Engine: derate chain (NOCT temperature, soiling, shading, wiring, mismatch, inverter, battery round-trip), PV kWp, string design (Voc cold / Vmp hot / Isc per MPPT, IEC 62548 / NEC 690), battery sizing (autonomy, DoD, series/parallel, C-rate), inverter auto-selection with parallel stacking, cable sizing (voltage drop, ampacity derating), fuse/breaker rounding, generator kVA, roof area, monthly production, savings, payback, LCOE, CO₂
- Design checks (OK / warning / error) explaining every issue
- Bill of materials with editable prices and quantities, catalogue picker, custom lines, margin, discount, VAT, multi-currency
- Exports: branded client proposal PDF, quotation-only PDF, technical design PDF, 1-page estimate PDF, Excel workbook with live formulas, project JSON
- Pipeline: draft / quoted / approved / installed / lost, search by name, phone, email or reference, new revision (-R2, -R3 …)
- English / Arabic (RTL) interface; company branding (logo, colour, terms) for quotations
- Works offline after first load; mobile friendly

## Development

```bash
npm install
npm run dev        # http://localhost:5173/
npm test           # vitest – engine tests against worked examples in docs/sizing-methodology.md
npm run build      # production build to dist/
```

Deployment: hosted on Cloudflare Pages at https://dtplus-solar-planner.pages.dev. Run `npm run deploy` to build and upload `dist/` with Wrangler (run `npx wrangler login` once first); pushing to `main` does not deploy. Open copies of the app (phones keep tabs for days) pick up a deploy by themselves: they check `version.json`, reload when the user is between tasks, and show what changed. For a release, bump `version` in `package.json` and add its notes in `src/i18n/updates.ts`.
Any other static host: `npm run build` and upload `dist/` (routing is hash-based, so no rewrite rules are needed).

## Documentation

- `docs/sizing-methodology.md` — formulas, standards, appliance table and worked examples the engine implements
- `docs/catalog-notes.md` — sources and caveats for every catalog entry; indicative pricing basis
- `docs/irradiance-notes.md` — how location data was derived; tilt conversion
- `docs/features.md` — competitive review and prioritised feature backlog

## Disclaimer

Catalog prices are indicative international wholesale figures (2025) and must be replaced with supplier quotes.
Results are a design aid; final designs must be verified by a qualified engineer against local codes.
