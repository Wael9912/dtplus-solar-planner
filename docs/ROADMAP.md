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
| 18 | Arabic/English UI with RTL | Arabic PDFs via embedded IBM Plex Sans Arabic |
| 19 | Multi-currency with manual FX rate | USD catalog base |
| 20 | Validation & warnings panel | OK / warning / error with fix hints |
| 21 | Generator sizing (kVA) | fuel-cost model not yet |
| 22 | Excel export | 6 sheets, live formulas in Loads, Sizing, Production, BOM |
| 25 | Monthly energy balance chart | production vs demand |
| 37 | 25-year cash flow, payback, LCOE, ROI | 3 % tariff escalation; no NPV/IRR yet |

## Delivered in v0.2 (2026-11-03) — flexibility

Multi-agent audit (sales desk, field engineer, design lead, owner) found that every feature sat behind one 7-step wizard driven by an appliance list. v0.2:

| Feature | Notes |
|---|---|
| Start hub | Load calculator · Quote a known size · Product quote · Full design · Engineering tools; header "New" menu |
| Load calculator | one screen, result card, copy / WhatsApp / 1-page PDF, promote to a full project |
| Project modes | `design` / `size` / `items` with their own steps; convert between them keeping the price |
| Alternative load entry (#4) | monthly kWh from the bill with residential / commercial / daytime profiles |
| Fixed sizes, backup-only, no battery | kWp / kWh / kW targets; 0 panels = UPS-style backup |
| Expansion | equipment already on site designed but not quoted |
| Outage hours | hybrid savings at the diesel cost during outages |
| Catalogue management (#14) | company prices, not-stocked products, own products with datasheets, services defaults |
| Company file & backup | share one setup across staff devices |
| Engineering tools | string checker, battery bank, cable & breaker at any ambient, generator & inverter |
| Quotation-only PDF | plus `proposalNote` (printed) separate from internal notes (never printed) |
| Pipeline | Lost status, New revision (-R2), search by phone/email |
| Engine fixes | unknown product ids raise errors (no silent swap), inverter stacking for large arrays, battery parallel over-limit error, autonomy 0 allowed |

## Next (suggested order)

1. **Compare 2–3 system options** (#24) — Good/Better/Best tabs in the proposal (today: duplicate / new revision per option).
2. **Supplier price lists** with landed cost (#33) and CSV import for the company price list.
3. **Frozen quote snapshots** — lock the figures of a sent revision so later price-list changes don't alter it.
4. **Export limit / zero-export** sizing for grid-tied commercial jobs; area-limited sizing ("fit to roof").
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
