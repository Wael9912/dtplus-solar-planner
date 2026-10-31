# DT+ Solar Planner — notes for Claude

- Stack: Vite 8 + React 19 + TypeScript + Tailwind v4 (`@tailwindcss/vite`), zustand (persisted to localStorage), recharts, exceljs, jspdf + jspdf-autotable. No backend.
- `src/engine/compute.ts` is the single source of truth for all calculations (BOM in `bom.ts`, economics in `economics.ts`, monthly tilt model in `irradiance.ts`); UI components only render `Results`. Every money figure on screen, in the PDFs and in Excel comes from `buildQuote()` in `src/engine/quote.ts` (display currency, rounded lines; `pricing.marginPct` is markup on cost). The client proposal shows sell prices only — never cost or markup. Formulas follow `docs/sizing-methodology.md` — update the doc if you change a formula.
- Data: `src/data/catalog.ts`, `appliances.ts`, `locations.ts` are generated from research JSON (keep them as plain arrays; edit directly). `items.ts` holds balance-of-system items referenced by id from `buildBom()`.
- Tailwind v4: custom classes cannot be composed with `@apply` of other custom classes — share base styles with grouped selectors (see `src/index.css`).
- i18n: `src/i18n/en.ts` is the type source (`Dict`); `ar.ts` must have the same keys. Engine checks carry `messageAr` + `step`; BOM lines carry `nameAr`/`specAr`; city names live in `src/i18n/places.ts`. Export strings live in `src/export/labels.ts`. PDFs support Arabic via the embedded IBM Plex Sans Arabic font (`src/export/fonts/`, lazy-loaded; run all PDF text through `pdfkit.ts` helpers).
- Tests: `npx vitest run` (tests/). Fixtures come from §13 of the methodology doc; note the doc's example (a) mis-adds connected load (410 W, not 420 W).
- Deploy: GitHub Pages via Actions on push to `main`; `base` is `/dtplus-solar-planner/` (override with `VITE_BASE`).
