# Roadmap — DT+ Solar Planner

Status of the prioritised backlog from `features.md` (competitive review of OpenSolar, Aurora, HelioScope, PVsyst, PV*SOL, Victron, Deye, HOMER and the off-grid calculators).

## Delivered in v0.1 (2026-10-31)

| # | Feature | Notes |
|---|---------|-------|
| 1 | Project wizard, 7 numbered steps, status bar with error/warning count | |
| 2 | Customer & site record | name, phone, email, address, reference, status, roof type, available area |
| 3 | Load profile builder | 72-item EN/AR library, qty × W × h, night %, surge factor, backup tick, 5 quick templates, coincidence factor |
| 5 | Peak sun hours by location | 70 cities (NASA POWER monthly), custom location, monthly editable |
| 6 | System type: off-grid / hybrid / grid-tied; 1-ph / 3-ph | generator-hybrid via toggle |
| 7 | Array sizing with editable derates, panel count, DC/AC warning | loss breakdown shown |
| 8 | Battery sizing: autonomy, DoD by chemistry, series/parallel, C-rate checks | |
| 9 | Inverter selection: continuous, surge, phase, voltage, PV input, parallel stacking | auto-recommend or manual |
| 10 | String checker: Voc cold, Vmp hot, Isc/MPPT, strings per MPPT | also for separate MPPT controllers |
| 11 | Cable & protection auto-sizing | DC / battery / AC, voltage drop, ampacity derating, fuse/MCB rounding |
| 12 | Mounting & BOM auto-generation | rails, clamps, hooks/feet/ballast/ground structure, MC4, combiner, SPD, isolators, earthing, conduit, labour, transport, commissioning |
| 13 | Editable priced BOM | qty/price overrides, exclude lines, custom lines, margin, discount, VAT, $/Wp |
| 15 | Quotation PDF with branding | logo, colour, terms, validity, signature lines |
| 16 | Proposal PDF | tiles, system description, monthly production chart, cash-flow table |
| 17 | Save/load projects, duplicate, delete, JSON import/export, status | localStorage |
| 18 | Arabic/English UI with RTL | PDFs English only (see below) |
| 19 | Multi-currency with manual FX rate | USD catalog base |
| 20 | Validation & warnings panel | OK / warning / error with fix hints |
| 21 | Generator sizing (kVA) | fuel-cost model not yet |
| 22 | Excel export | 6 sheets, live formulas in Loads, Sizing, Production, BOM |
| 25 | Monthly energy balance chart | production vs demand |
| 37 | 25-year cash flow, payback, LCOE, ROI | 3 % tariff escalation; no NPV/IRR yet |

## Next (suggested order)

1. **Arabic PDF** — embed a Noto Sans Arabic font and shape text (jsPDF needs a shaping helper), or render the proposal from HTML via print CSS.
2. **Alternative load entry from monthly kWh bills** (#4) with hourly shape templates — important for grid-tied customers.
3. **Catalog management screen** (#14): add/edit/hide items, supplier price lists with landed cost (#33), import CSV.
4. **Compare 2–3 system options** (#24) — Good/Better/Best tabs in the proposal.
5. **Fuel-savings model for generator-hybrid** (#21): litres/kWh, diesel price, today's hours → savings in proposal.
6. **Share link / read-only online proposal** (#28) — needs a small backend or static JSON hosting; WhatsApp share.
7. **Single-line diagram SVG** (#36) auto-drawn from the design.
8. **Offline PWA manifest + service worker** (#23) for site visits with poor connectivity.
9. **Installation checklist & commissioning report** (#30), warranty tracking (#32), maintenance reminders (#31).
10. **Solar water-pump module** (#43): head, flow, pump curve → array and controller.
11. Cloud sync & team roles (#17, #34) once the client confirms they want multi-user.

## Known limitations in v0.1

- Prices are indicative 2025 wholesale USD; they must be replaced by the company's supplier prices (BOM step or `src/data/items.ts` / `catalog.ts`).
- Yield uses monthly PSH × derate, not an hourly simulation; battery dispatch is not simulated.
- Tilt gain is a latitude rule of thumb (`1 + 0.0045·|lat|`), not a transposition model.
- Datasheet values for some catalog entries are typical rather than verified (listed in `catalog-notes.md`).
