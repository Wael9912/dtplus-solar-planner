# Competitive review and feature list for a solar installer planning/quoting web app
Research date 2026-10-31. Target: browser-based, step-by-step sizing + quoting tool for an installation company serving Sudan / East Africa / Gulf plus general international; Arabic + English.

---

## 1. What the existing tools offer

| Tool | Positioning | Strengths relevant to us | Gaps / why installers in our market still need something else |
|---|---|---|---|
| **OpenSolar** (free, 1.5% on payments; API/connectors chargeable since Apr-2026) | Residential design + proposal + CRM, worldwide | Free; satellite roof design; module/inverter database; interactive online proposal with e-signature; payment options; CRM pipeline; team roles; proposal templates with branding; multi-currency; many languages (Arabic partial) | 500 kW cap; no bankable shading; weak off-grid/battery-only and generator-hybrid logic; needs good satellite imagery (poor in Sudan); online-only; proposal focus is utility bill savings, not load-list sizing |
| **Aurora Solar** ($135-220/user/mo) | Premium US residential sales + design | LIDAR 3-D roof, AI auto-design, bankable shade reports, Sales Mode, battery/backup modelling, plan sets, CRM integrations (Salesforce/HubSpot), consumption modelling from bills | US-centric (utilities, incentives, imagery); expensive; no off-grid first-principles sizing; no RTL |
| **HelioScope** (Aurora-owned, $159-259/user/mo) | Commercial/utility simulation | 8,760-hour simulation, single-line diagrams, string sizing with temperature checks, wiring/loss tree, module-level shade, PAN-file components, PDF production report | No proposal/quote builder, no CRM, no battery/off-grid, project caps (10/mo), 1-3 weeks onboarding |
| **PVsyst** (desktop, CHF ~1,000/yr) | Engineering reference | Most trusted yield/loss model (Meteonorm, PAN/OND files, bifacial, trackers, batteries, pumping, stand-alone); detailed loss diagram; P50/P90 | Desktop, steep learning curve, no quoting, no BOM pricing, English/French only |
| **PV*SOL premium** (desktop, ~EUR 900) | Engineering + 3-D | 3-D shading, battery and EV, economic analysis, circuit diagram, Excel/PDF report, component DB, many languages | Desktop-only, no proposal/CRM, pricing manual |
| **Solargraf** (Enphase) | Residential sales | Fast proposal, financing, permit packs, Enphase-centric | US/Canada only |
| **Victron MPPT calculator** (mppt.victronenergy.com) | Component matcher | Wizard; 164k-module DB; Voc at -10 °C / Vmp at 60 °C checks; charge current at 60 °C; series/parallel suggestions; cable length/cross-section; share link; PDF; 13 languages; remembers session | Victron-only, MPPT-only |
| **Victron ESS/Energy Storage design** (docs + VRM) | Design guidance | ESS sizing rules, VE.Configure | No web calculator per se |
| **Deye Assisted Design** (deyeinverter.com/deye-assisted-design) | String checker + hybrid calculator | PV String Calculator (inverter + module + lowest temperature → connection scheme); Hybrid Systems Calculator; dealer verification | Deye-only; no pricing, no load profile |
| **HOMER Pro / HOMER Grid** ($) | Hybrid microgrid optimisation | Hourly simulation of PV + battery + generator + grid with fuel price, LCOE, sensitivity; optimises component sizes; best-in-class for generator-hybrid economics | Expensive, slow, engineering tool, no quotes |
| **altE off-grid calculator** | Simple online | Monthly kWh → battery bank kWh (lead vs lithium), days of autonomy, PSH; array/inverter/controller steps | US only, no BOM |
| **Renogy calculator / sizing guide** | Simple online | Appliance load list (W x h = Wh), PSH by state, controller + inverter efficiency factors, inverter > sum of loads | 12/24 V DIY scope |
| **Unbound Solar / other off-grid calculators** (OffGridAuthority, SolarCalculatorHQ, OffGridSolarCalc) | Simple online | Daily Wh, PSH auto-detect by location, autonomy days, DoD by chemistry, derate (0.75), 1.25 safety factor, shoppable parts list, wire gauge & fuse sizes, winter vs year-round PSH | No branding, no quotes, no save |
| **SMA Sunny Design, Fronius Solar.creator, Huawei FusionSolar design, Growatt ShinePlanner** | OEM design tools | Free, string checks, yield estimate, some have BOM | Brand-locked |

**Take-away:** no single tool combines (a) load-list / off-grid-and-hybrid first-principles sizing with generator, (b) string/battery-current compatibility checks across brands, (c) a priced BOM with margin, and (d) a branded bilingual (Arabic RTL) quotation/proposal — which is exactly the gap for a Sudan/East Africa/Gulf installer. OpenSolar is the closest free competitor; Victron's calculator and Deye's string tool are the UX benchmarks for the "checker" step; HOMER and PVsyst define the "credible numbers" the proposal should approximate (hourly or at least monthly PSH, temperature derates, autonomy).

---

## 2. Feature list (prioritised)

### MUST (v1 — needed to produce a defensible quote)
1. **Project wizard** with numbered steps and a persistent summary sidebar: Customer → Site/Location → Loads → System type → Panels → Inverter → Battery → Controller/Protection → Mounting & cables → BOM & pricing → Quote/Proposal.
2. **Customer & site record**: name, phone/WhatsApp, address, lat/long (map pin or manual), roof type (flat concrete / tin / tile / ground), grid availability (none / unreliable hours/day / stable), existing generator kVA.
3. **Load profile builder**: appliance library with regional defaults (AC split 1.5 HP, fridge, freezer, water pump, lights, TV, fans, cooler, well pump, shop equipment, clinic/school loads), qty x W x hours/day, day/night split, surge factor per appliance (motors 3x), seasonal (summer/winter) toggle → daily kWh, peak kW, surge kW, night kWh (drives battery).
4. **Alternative load entry**: monthly kWh from bills or metered kWh/day, with a simple hourly shape template (residential / shop / office / farm) for grid-tied customers.
5. **Peak Sun Hours by location**: city table (Sudan/East Africa/Gulf cities built-in) plus lat/long lookup via Global Solar Atlas/PVGIS/NASA POWER API, monthly values, design month = worst month (off-grid) or annual average (grid-tie); manual override.
6. **System type selection**: off-grid, hybrid (grid + battery), grid-tie (zero-export / net-metering), generator-hybrid, pump-only; sets which steps/rules apply.
7. **Array sizing**: kWh/day ÷ PSH ÷ system efficiency (editable derates: soiling, temperature via module tcPmax and ambient, wiring, inverter, battery round-trip) with safety factor; shows panel count for the selected module and alternative modules; DC/AC ratio warning against `maxPvInputKw`.
8. **Battery sizing**: night/backup kWh x autonomy days ÷ DoD (chemistry-aware) ÷ efficiency; choose module → count in parallel/series; checks total battery max A vs inverter charge/discharge A; warns on lead-acid at high ambient.
9. **Inverter selection**: continuous kW ≥ peak load x margin, surge ≥ motor start, phase match, battery voltage match, PV input power, 48 V vs HV guidance; parallel units when needed (`parallelMax`).
10. **String checker** (Victron/Deye-style): series count range from Voc at Tmin and Vmp at Tcell_max vs MPPT window and max PV voltage; strings per MPPT vs `maxInputCurrentPerMppt` / Isc; visual pass/fail; recommended configuration; same for MPPT charge controllers (nominal PV W per battery voltage).
11. **Cable & protection auto-sizing**: PV string cable, battery cable (by current and length, 2-3% drop), AC cable; string fuse (1.56 x Isc, ≤ module max fuse), DC isolator, battery fuse/MCCB (1.25 x max A), AC MCB, SPDs, earth; added to BOM automatically with ampacity derating for ambient.
12. **Mounting & BOM auto-generation**: rails per metre from panel dimensions and layout (portrait/landscape rows), clamps, feet/hooks per roof type, structure per kW for ground/flat; MC4 pairs, combiner box by string count, trunking/conduit length, labour per kW, transport, commissioning.
13. **Editable priced BOM**: catalog defaults, per-line override of qty/unit price, add free-text lines, cost vs sell price, margin % per category or global, discount, tax/VAT, currency; totals and $/W.
14. **Product catalog management**: CRUD for panels/batteries/inverters/controllers/cables/protection/accessories with the datasheet fields; import/export JSON/CSV; "favourite" items; hide out-of-stock; price lists with date and supplier.
15. **Quotation PDF with company branding**: logo, colours, address, VAT/CR number, bank details, terms, validity, signatures; itemised or summarised view; Arabic and English versions.
16. **Proposal (customer-facing) PDF**: system summary, monthly production chart, coverage of loads, savings vs grid tariff + generator fuel, simple payback/ROI, environmental (CO₂), equipment photos and warranties, assumptions page.
17. **Save/load projects** (local IndexedDB + optional cloud sync), project list with status (draft / quoted / won / lost), duplicate project, version history of quotes (Q-001 rev A/B).
18. **Arabic/English UI with full RTL** layout mirroring, Arabic numerals option, Hijri/Gregorian date, translated PDFs.
19. **Multi-currency**: base USD catalog with per-project currency and exchange rate (SDG, AED, SAR, KES, ETB, EGP, EUR); manual rate entry with date; show both.
20. **Validation & warnings panel**: every rule violation (over-voltage, under-current, DoD, DC/AC ratio, surge) listed with severity and a fix suggestion before the quote can be marked final.
21. **Generator-hybrid inputs**: generator kVA, fuel price and consumption (L/kWh), hours/day today → fuel savings in proposal; inverter generator-input compatibility (`generatorInput`) and charger current from genset.
22. **Excel/CSV export** of BOM and load list (for procurement and accounting).
23. **Offline-capable PWA**: works without internet on site (Sudan connectivity), syncs later.

### SHOULD (v1.1-v2 — wins deals and saves time)
24. **Compare 2-3 system options** side by side (e.g. Good/Better/Best: PERC vs TOPCon, lead-acid vs LiFePO4, 5 kW vs 8 kW hybrid) with cost, autonomy, payback; include in proposal.
25. **Monthly energy balance chart**: production vs consumption per month using monthly PSH; battery state-of-charge illustration for a design day.
26. **Tilt/azimuth & shading factor**: tilt-angle guidance (lat-based) with monthly correction factors; simple shading % per string; optional roof sketch with panel layout grid (count that fits a W x L roof) — not full 3-D.
27. **Templates**: saved system templates (e.g. "3 kW home Khartoum", "10 kW clinic", "solar pump 5.5 kW") and quote text templates (terms, scope, exclusions).
28. **Share link / online proposal view** (read-only web page with accept button and WhatsApp share), e-signature or "accept" with name/date.
29. **Customer portal lite**: customer sees their quote versions, documents, installation photos, warranty cards.
30. **Installation checklist & commissioning report**: per project, with photos, measured Voc/Isc per string, insulation test, settings screenshot; generates handover PDF.
31. **Maintenance schedule & reminders**: panel cleaning (monthly in dust zones), battery check, inverter firmware, tightening torque; calendar export.
32. **Warranty tracking**: serial numbers per component, warranty end dates, supplier, claim notes; expiring-warranty list.
33. **Supplier price lists**: multiple suppliers per item with landed cost calculation (FOB + freight + duty + clearing) and date; pick cheapest or preferred.
34. **Roles & team**: sales vs engineer vs admin; approval before discount beyond X%; audit trail.
35. **Pipeline/CRM lite**: lead source, follow-up date, status, win/loss reason; dashboard of quotes by month and conversion.
36. **Single-line diagram** auto-generated (SVG) from the design: arrays → combiner → inverter → battery → AC DB → loads/grid/generator; included in quote/permit pack.
37. **Tariff & financial model**: grid tariff tiers, escalation %, generator fuel escalation, inflation, 25-year cashflow, NPV/IRR, LCOE; financing option (down payment + monthly).
38. **Unit-conversion & regional presets**: 230/400 V 50 Hz vs 120/240 V 60 Hz, hot-climate derate presets, temperature extremes by city.
39. **Import datasheet by model search** (ENF/Solar-stack-style lookup or PAN-file parse) to add catalog items quickly.
40. **Print-ready Arabic quotation with official letterhead and stamp placeholder**; WhatsApp-sized PDF (<2 MB).

### NICE (later / differentiators)
41. Hourly (8,760) simulation with battery dispatch and generator run-time (HOMER-lite), P50/P90 using PVGIS TMY.
42. Satellite roof drawing with panel auto-layout and simple obstruction shading (OpenSolar-style) where imagery exists.
43. Solar water-pump sizing module (head, flow m³/day, pump curve → array, controller).
44. Street-light / telecom-tower / cold-room packaged calculators.
45. Monitoring integration (Deye Cloud, Growatt ShineServer, VRM, FusionSolar) to show as-built vs predicted in the customer portal.
46. Stock/inventory & purchase orders from won quotes.
47. Mobile camera: scan serial barcodes to fill warranty tracking; site survey form with photos, compass tilt/azimuth measurement.
48. Public embeddable "instant estimate" widget for the company website that feeds leads into the app.
49. AI assistant: explain design choices to the customer in Arabic/English; draft proposal text.
50. Carbon credit / net-metering regulatory notes per country (Sudan SEDC, KSA SEC net billing, UAE DEWA Shams Dubai, Kenya EPRA net-metering).
51. Multi-tenant SaaS mode so other installers can subscribe (white-label).

---

## 3. UX conventions worth copying
- **Victron MPPT calculator**: wizard that cannot skip required inputs; always shows the two voltage checks and current check numerically with pass/fail; share link + PDF; remembers last session.
- **OpenSolar**: proposal as an interactive web page first, PDF second; payment/financing cards; "system options" tabs.
- **HelioScope**: loss tree / waterfall of derates so engineers trust the yield number.
- **HOMER**: generator + battery + PV economics with fuel price sensitivity — simplify to a table of "today's fuel spend vs after solar".
- **altE/Renogy**: plain-language formulas shown next to each result (kWh ÷ PSH ÷ 0.75 = W) — builds trust with non-engineer sales staff and customers.

---

## 4. Sources
- OpenSolar vs Aurora vs HelioScope comparisons: https://www.sunbasedata.com/blog/top-5-solar-design-platforms-in-2026-comparing-tools-installers-actually-use ; https://www.heavengreenenergy.com/blog/solar-design-software ; https://www.surgepv.com/best-solar-software/helioscope-alternatives ; https://fervorstudio.ca/news/aurora-solar-review-pricing-alternatives/ (competitor-authored — pricing figures approximate)
- Aurora review: https://www.sunbasedata.com/blog/the-ultimate-guide-to-aurora-solar
- Victron MPPT calculator and release notes: https://mppt.victronenergy.com/ ; https://professional.victronenergy.com/news/detail/268/ ; https://professional.victronenergy.com/news/detail/223/ ; https://professional.victronenergy.com/news/detail/185/
- Deye Assisted Design (string + hybrid calculator): https://www.deyeinverter.com/deye-assisted-design/ ; distributor sizing page: https://deyeinverters.net/en/news/solar-energy-calculation-program ; third-party Deye calculator: https://solarsizecalculator.com/deye-inverter-calculator/
- altE off-grid calculator: https://www.altestore.com/pages/off-grid-solar-system-sizing-calculator
- Renogy sizing guide: https://www.renogy.com/blogs/learn-center/learn-system-sizing
- Other off-grid calculators reviewed: https://offgridauthority.com/off-grid-solar-calculator/ ; https://solarcalculatorhq.com/calculators/off-grid-solar-system-calculator/ ; https://theoffgridcalculator.com/ ; https://offgridsolarcalc.com/calculator/
- PVsyst, PV*SOL, HOMER, Solargraf, SMA Sunny Design: characterised from product documentation knowledge (not re-fetched this session); pricing indicative.
