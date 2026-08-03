# Rent Comps Tracker

Mobile-first capture of multifamily rent comparables for SHIR Capital. Syncs to
Google Drive and exports straight into the proforma **COMPS** tab.

Live: https://rent-comps-tracker.pages.dev/ *(not yet deployed)*

## What it does

For one **subject** property:

- Subject basics + unit mix with in-place rents.
- Up to **8 comps** — header data, per-floorplan unit mix with asking rents,
  tri-state physical attributes and amenities, fees, and a visit log.
- **Suggested market rents per COMPS section**, from Direct comps only, with a
  manual override.
- Export that feeds the existing `populate_comps.py` populator rather than
  editing the proforma directly.

## Files

Static SPA, no build step. Load order matters.

| File | Responsibility |
|---|---|
| `index.html` | Shell, tab bar, drawer, CDN libs. |
| `styles.css` | All styling. Mobile-first. |
| `schema.js` | **Generated** — COMPS geometry + field definitions. |
| `core.js` | Store, routing, schema helpers, all rent math. No DOM, no network. |
| `drive.js` | OAuth, Drive I/O, sync, manifest, shared secrets. |
| `ui.js` | Home screen and tabs 1–3. |
| `export.js` | Validation, exports, HelloData, Asana. |
| `app.js` | Boot and event wiring. |
| `_headers` | Cloudflare COOP header — required for the OAuth popup. |

`schema.js` is generated from `../Accessories/comps_schema.json`:

```bash
python Accessories/build_schema.py
```

The build script validates that the section rows, comp column spacing and
attribute rows still agree with the template, and refuses to emit a schema that
would write comp data at the wrong offset.

## Local development

```bash
python -m http.server 8775 --directory webapp
```

The rent math, the UI and the Excel export all work locally. Drive, HelloData and
Asana need the deployed origin because of OAuth.

## Deployment

Web files live at the **repo root**, not under `webapp/`. Cloudflare Pages:
production branch `main`, build command blank, output dir `/`.

The Google OAuth client must list this origin under Authorized JavaScript origins,
or sign-in silently hangs.

See `../STATE_OF_THE_BUILD.md` for the full architecture, the COMPS cell contract,
verification notes and open follow-ups.
