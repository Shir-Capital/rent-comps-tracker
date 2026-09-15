// GENERATED FILE — do not edit by hand.
// Source: Accessories/comps_schema.json
// Rebuild: python Accessories/build_schema.py
window.SCHEMA = {
  "compsTab": {
    "_v44Note": "Bumped v9 -> v44 on 2026-09-15 (the schema had gone stale across v10-v43; populate_comps-v44.py's own geometry dispatcher was already fixed for the independent bands, this file and the two scripts that build/verify it were not). Two structural changes: (1) attrRowFirst/attrRowLast (one shared span) is RETIRED — replaced with physRowFirst/physRowLast, amenRowFirst/amenRowLast, and a Mandatory-only feeRowFirst/feeRowLast/feeSumLastRow, each resolved independently, matching populate_comps-v44.py's _resolve_bands_new(). (2) the FEES vocabulary is settled against the template's OWN dropdown (read via openpyxl data_validations, not assumed): only 5 of its 12 options route to a real dollar fee (Amenity, Cable/Internet, Cleaning, V Trash, Trash) — Insurance/Pest/Parking/Utilities/W-D are NOT on the v44 dropdown at all; they were redesigned as Y/N or allocation-flag AMENITY items ('Insurance Required', the Parking sub-band, 'Property Allocated Expenses' Tenant Water/Gas/Electric/Cable). Those five keys are demoted to tracker-only (compsLabel removed) in `fees` below, same treatment app_fee/admin_fee/pet_rent/pet_deposit already had. Also: rowTotals moved 76->176, rowCompType 77->177, rowAttrHeader 78->199 (unit sections grew from 9 to up to 24 rows each — verified live against every unit bucket's subtotal row, not assumed), and the paste-export regions (`pasteMap.regions`) are widened from row 87 to row 269 — the old bound silently excluded roughly two-thirds of the comp block (everything from the widened unit sections through the whole attribute/amenity/fee area). Verified against the live SHIR_MF_Template_v44.xlsx; `verify_against_template.py` needed NO code changes for any of this (it already resolves rows from the JSON rather than assuming a shared span) — only comps_schema.json's data and build_schema.py's internal-consistency checks did.",
    "_versionNote": "Historical, pre-v44: bumped v7 -> v8 on 2026-08-08. The COMPS GEOMETRY was identical in v7 and v8 — every row, column, offset and section was unchanged, and the schema verified 67/67 against both. What changed in v8 was only what the FEES label cells CONTAIN (they became dropdowns, and five of the eight v7 labels were dropped), which is why fees are routed by `compsLabel` and never by row. `populatorScript` moved to v36 in the same pass, then v37 on 2026-08-10 (per-plan subject market rents). Superseded by the v44 band rebuild above — kept for the fee-routing-by-label history, not as current geometry.",
    "_v9Note": "Historical: bumped v8 -> v9 on 2026-08-10, a pure stamp — SHIR_MF_Template_v9's entire delta was 274 cells inside COMPS!R3:W76 (a lease-recency window on the INTERNAL comps block), byte-identical COMPS geometry otherwise. Superseded by v44 above.",
    "templateVersion": "SHIR_MF_Template_v44",
    "populatorScript": "rent-comp-data-populator-populate_comps-v44.py",
    "compBaseCols": [
      25,
      34,
      43,
      52,
      61,
      70,
      79,
      88
    ],
    "compBlockWidth": 9,
    "maxComps": 8,
    "templateSlots": 10,
    "templateSlotBaseCols": [
      25,
      34,
      43,
      52,
      61,
      70,
      79,
      88,
      97,
      106
    ],
    "reservedSlotNote": "The COMPS tab has ten comp slots (through DB), but slots 9-10 (CS, DB) are deliberately never populated: populate_comps v34+ read their pristine offset-0 columns as the reference for restoring unit line-# serials a pre-v34 run clobbered. Filling them destroys that reference, so maxComps stays 8. Unaffected by the v41 band rebuild.",
    "rowHeader": 3,
    "rowDetails": 4,
    "rowColHeaders": 5,
    "rowTotals": 176,
    "rowCompType": 177,
    "rowAttrHeader": 199,
    "_bandNote": "The three attribute bands share their header row (199) and first data row (200) but are INDEPENDENTLY SIZED below that — never derive one band's span from another's. Resolved live against SHIR_MF_Template_v44.xlsx via populate_comps-v44.py's own resolve_comps_geometry(), not re-derived by hand.",
    "physRowFirst": 200,
    "physRowLast": 223,
    "amenRowFirst": 200,
    "amenRowLast": 269,
    "feeMandatoryHeaderRow": 200,
    "feeRowFirst": 201,
    "feeRowLast": 205,
    "feeSumLastRow": 205,
    "_feeSumLastRowNote": "Unlike v7-v9 (feeSumLastRow = feeRowLast + 1, an unlabelled row past the last printed label that the Eff. $/Mo SUM still covered), v44's Mandatory band has no trailing unlabelled row: all 5 rows (3 pre-labelled + 2 blank-but-labelable via the dropdown) are inside 201-205, and the Eff. $/Mo formula sums exactly that range — confirmed against the live SUM($AF$201:$AF$205) formula.",
    "feeOptionalHeaderRow": 206,
    "feeOptionalFirst": 207,
    "feeOptionalLast": 211,
    "feeOneTimeHeaderRow": 212,
    "feeOneTimeFirst": 213,
    "feeOneTimeLast": 215,
    "_feeOptionalOneTimeNote": "Optional Fees (207-211, same 12-item dropdown as Mandatory) and One-Time Fees (213-215, fixed pre-printed labels: Application Fee / Admin Fee / Pet Deposit, no dropdown) exist on the template but do NOT feed Eff. $/Mo and are out of scope for this pass — `fees` below still treats app_fee/admin_fee/pet_deposit as tracker-only, same as pre-v44. Recorded here only so a future pass does not have to re-resolve these rows from scratch.",
    "subjectMktRentCol": 7,
    "subjectUnitCountCol": 3,
    "offsets": {
      "compNum": 0,
      "compName": 1,
      "compAddress": 7,
      "yearBuilt": 0,
      "totalUnits": 1,
      "distanceMiles": 2,
      "vacancyPct": 3,
      "concessionDollars": 4,
      "concessionPct": 5,
      "wdType": 6,
      "utilStructure": 7,
      "unitRowNum": 0,
      "unitCount": 1,
      "unitSf": 2,
      "unitOccPct": 3,
      "unitAskRent": 4,
      "unitAskPsf": 5,
      "unitEffRent": 6,
      "unitEffPsf": 7,
      "compTypeValue": 2,
      "compSourceValue": 5,
      "compSourceLegacyValue": 4,
      "physicalValue": 2,
      "amenityValue": 5,
      "feeLabel": 6,
      "feeValue": 7
    },
    "_offsetsNote": "Every offset above is UNCHANGED across v9 -> v44 — confirmed live (row 4 number formats, OFFSET_PHYS=2 / OFFSET_AMEN=5 in populate_comps-v44.py, and the row-3 comp-name convention all matched byte-for-byte between SHIR_MF_Template_v35 and v44). Only the ROW numbers each offset lands on moved."
  },
  "_pasteMapNote": "The paste-ready export (paste-export.js) mirrors the COMPS tab positionally and is pasted back with Paste Special -> Values -> [x] Skip blanks, so a cell we leave EMPTY is a cell the paste cannot touch. This block is the list of cells it is allowed to fill; everything else on the tab is a formula, a template-owned serial, or a subtotal. Row bound widened 87 -> 269 for v44 (verified: zero merged cells and zero content below row 269 in either the comp columns Y:DJ or the subject columns B:H) — the old row-87 bound predates the v41 band rebuild and silently excluded most of the unit sections (which now run through row 176) plus the entire attribute/amenity/fee area (177-269). Three facts this depends on, unchanged by the rebuild: (1) COMPS row 2 is a LIVE column-index chain (A2=1, B2=A2+1, ...) so nothing may ever anchor above row 3; (2) row 3 holds two merged ranges (J3:P3 and R3:S3), both outside both paste regions' columns; (3) unit-row offsets 1-4 are contiguous inputs while 0 (line serial) and 5-7 (Ask $/SF, Eff. $/Mo, Eff. $/SF) are not.",
  "pasteMap": {
    "sheetName": "COMPS_PASTE",
    "dashSheetName": "DASH_PASTE",
    "minRow": 3,
    "regions": [
      {
        "key": "comps",
        "name": "PASTE_COMPS",
        "sheet": "COMPS_PASTE",
        "range": "$Y$3:$DJ$269",
        "anchor": "Y3",
        "default": true,
        "label": "All 8 comps — names, row 4, unit rows, type/source, attributes, fees"
      },
      {
        "key": "subject",
        "name": "PASTE_SUBJECT",
        "sheet": "COMPS_PASTE",
        "range": "$B$3:$H$269",
        "anchor": "B3",
        "default": true,
        "label": "Subject — W/D, utilities, and per-plan market rents in column G"
      },
      {
        "key": "dash",
        "name": "PASTE_DASH",
        "sheet": "DASH_PASTE",
        "range": "$E$5:$E$9",
        "anchor": "E5",
        "default": false,
        "label": "DASH — name, street, city/ST/zip, market, year built"
      }
    ],
    "compWritable": {
      "header": [
        "compNum",
        "compName",
        "compAddress"
      ],
      "details": [
        "yearBuilt",
        "distanceMiles",
        "vacancyPct",
        "concessionDollars",
        "wdType",
        "utilStructure"
      ],
      "unit": [
        "unitCount",
        "unitSf",
        "unitOccPct",
        "unitAskRent"
      ],
      "compType": [
        "compTypeValue",
        "compSourceValue"
      ],
      "attr": [
        "physicalValue",
        "amenityValue",
        "feeLabel",
        "feeValue"
      ]
    },
    "subjectWritable": {
      "detailsCols": [
        5,
        7,
        8
      ],
      "unitCols": [
        7
      ]
    },
    "_neverWriteNote": "Asserted in build_schema.py against compsTab.offsets rather than restated as numbers: row 4 offsets totalUnits (=Z176 on v44) and concessionPct are formulas; unit-row offsets unitRowNum, unitAskPsf, unitEffRent and unitEffPsf are the template's serial and its three derived columns; every offset of every subtotal row and of rowTotals is a formula. Subject side, only E4/G4/H4 and G6:G175 are inputs — B is an array formula and C/D/F/H are formulas.",
    "dashCells": [
      {
        "row": 5,
        "col": 5,
        "field": "name",
        "label": "Property name"
      },
      {
        "row": 6,
        "col": 5,
        "field": "street",
        "label": "Street address"
      },
      {
        "row": 7,
        "col": 5,
        "field": "citystzip",
        "label": "City, ST Zip"
      },
      {
        "row": 8,
        "col": 5,
        "field": "msa",
        "label": "Market"
      },
      {
        "row": 9,
        "col": 5,
        "field": "year_built",
        "label": "Year built"
      }
    ],
    "_dashNote": "DASH!E5:E9 are typed constants. E10 (units) is =IF(OR(RR!E365=\"\",RR!E365=0),1,RR!E365) and E18 (occupancy) is =RR!J355 — both formulas, both inside no paste range, and both additionally protected by skip-blanks. Basics!C3:D11 mirrors all of this off DASH, so DASH is the only place to write."
  },
  "unitBuckets": [
    {
      "key": "efficiency",
      "label": "Efficiency / Studio",
      "short": "Eff",
      "compsLabel": "+Eff",
      "startRow": 6,
      "endRow": 24,
      "subtotalRow": 25,
      "beds": 0,
      "baths": 1
    },
    {
      "key": "1br1ba",
      "label": "1BR / 1BA",
      "short": "1x1",
      "compsLabel": "+1/1(.5)",
      "startRow": 26,
      "endRow": 49,
      "subtotalRow": 50,
      "beds": 1,
      "baths": 1
    },
    {
      "key": "2br1ba",
      "label": "2BR / 1BA",
      "short": "2x1",
      "compsLabel": "+2x1(.5)",
      "startRow": 51,
      "endRow": 74,
      "subtotalRow": 75,
      "beds": 2,
      "baths": 1
    },
    {
      "key": "2br2ba",
      "label": "2BR / 2BA",
      "short": "2x2",
      "compsLabel": "+2x2(.5)",
      "startRow": 76,
      "endRow": 99,
      "subtotalRow": 100,
      "beds": 2,
      "baths": 2
    },
    {
      "key": "3br1ba",
      "label": "3BR / 1BA",
      "short": "3x1",
      "compsLabel": "+3/1(.5)",
      "startRow": 101,
      "endRow": 124,
      "subtotalRow": 125,
      "beds": 3,
      "baths": 1
    },
    {
      "key": "3br2ba",
      "label": "3BR / 2BA",
      "short": "3x2",
      "compsLabel": "+3/2(.5)",
      "startRow": 126,
      "endRow": 149,
      "subtotalRow": 150,
      "beds": 3,
      "baths": 2
    },
    {
      "key": "4br2ba",
      "label": "4BR / 2BA",
      "short": "4x2",
      "compsLabel": "+4/2(.5)",
      "startRow": 151,
      "endRow": 174,
      "subtotalRow": 175,
      "beds": 4,
      "baths": 2
    }
  ],
  "_unitBucketsNote": "Rows widened on SHIR_MF_Template_v41 (efficiency 19 data rows, the rest 24 each — the efficiency section cannot hold as many as the others; unchanged since). compsLabel text (+Eff, +1/1(.5), ...) and subtotalRow = endRow + 1 are unchanged from v9 — verified live at rows 25/50/75/100/125/150/175 on v44.",
  "_physicalNote": "These 9 keys are UNCHANGED since v9 — same internal key, same display label, same populate_comps.py logic. What moved is only the ROW: on v44 they live inside the Physical band's 'Unit Systems' sub-group (rows 207-215) rather than being the whole Physical block (which is now 200-223 and also carries a 'Building' sub-group — Property Type/Stories/Residential Buildings/Renovated - Year/Renovated - Scope — and 'Terms'/'Location' sub-groups the tracker does not populate). Rows resolved live via populate_comps-v44.py's own resolve_comps_geometry(), not re-derived by hand.",
  "physical": [
    {
      "key": "hvac_indiv",
      "label": "HVAC Indiv.",
      "row": 207,
      "hellodata": "central_air_conditioning"
    },
    {
      "key": "wd_inunit",
      "label": "W/D In-Unit",
      "row": 208,
      "hellodata": "washer_dryer_in_unit"
    },
    {
      "key": "wd_hookups",
      "label": "W/D Hookups",
      "row": 209,
      "hellodata": "washer_dryer_hookups"
    },
    {
      "key": "water_util",
      "label": "Water Util.",
      "row": 210,
      "hellodata": null
    },
    {
      "key": "gas_util",
      "label": "Gas Util.",
      "row": 211,
      "hellodata": null
    },
    {
      "key": "elec_util",
      "label": "Elec. Util.",
      "row": 212,
      "hellodata": null
    },
    {
      "key": "roof_type",
      "label": "Roof Type",
      "row": 213,
      "hellodata": null
    },
    {
      "key": "priv_yards",
      "label": "Priv. Yards",
      "row": 214,
      "hellodata": "patio_or_balcony"
    },
    {
      "key": "indiv_hwh",
      "label": "Indiv. HWH",
      "row": 215,
      "hellodata": null
    }
  ],
  "_amenitiesNote": "v44's Amenities band replaced the old 9-item vocabulary with a 59-item one (11 sub-groups); it is NOT a superset of the v9 list. These 9 keys are the same crosswalk populate_comps-v44.py's AMENITY_LABEL_MAP uses: 7 map cleanly to a same-meaning v44 label at a new row, 2 are LOSSY (flagged with `lossy: true` and a `note`) — `pool` used to be a Y/N and is now a COUNT ('# of Pools'; a truthy flag writes 1, a floor, not a reading), and `sport_court` now names one specific court type out of three the new vocabulary splits out (Basketball / Volleyball / # of Tennis Courts). Rows are NOT contiguous — they are scattered across the 70-row band interleaved with the ~50 amenity items and 11 sub-group headers this schema does not track — so build_schema.py validates them by band-membership and uniqueness, never by a fixed anchor + index.",
  "amenities": [
    {
      "key": "fitness_center",
      "label": "Fitness Room / Gym",
      "row": 208,
      "hellodata": "fitness_center"
    },
    {
      "key": "clubhouse",
      "label": "Clubroom",
      "row": 206,
      "hellodata": "club_house_party_room"
    },
    {
      "key": "business_center",
      "label": "Business Center",
      "row": 241,
      "hellodata": "business_center"
    },
    {
      "key": "pool",
      "label": "# of Pools",
      "row": 215,
      "hellodata": "swimming_pool",
      "lossy": true,
      "valueType": "count",
      "note": "v44 changed this from a Y/N amenity to a pool COUNT. A truthy HelloData flag writes 1 (a floor on the real count, not a reading), never 'Y'."
    },
    {
      "key": "dog_park",
      "label": "Dog Park",
      "row": 207,
      "hellodata": "dog_park"
    },
    {
      "key": "bbq_grill",
      "label": "Grill(s)",
      "row": 209,
      "hellodata": "barbecue_grill"
    },
    {
      "key": "gated",
      "label": "Access Gates (Driving)",
      "row": 261,
      "hellodata": "gated_community_access"
    },
    {
      "key": "sport_court",
      "label": "Basketball Court",
      "row": 205,
      "hellodata": "basketball_court",
      "lossy": true,
      "note": "v44 splits the old generic 'Sport Court' three ways (Basketball Court / Volleyball / # of Tennis Courts); this key routes to Basketball Court only."
    },
    {
      "key": "playground",
      "label": "Playground",
      "row": 212,
      "hellodata": "playground"
    }
  ],
  "categories": [
    {
      "key": "direct",
      "label": "Direct",
      "symbol": "●",
      "color": "3B82F6",
      "hint": "Similar vintage (±10 yrs), size (±50%) and amenities to subject. Drives the suggested market rents."
    },
    {
      "key": "aspirational",
      "label": "Aspirational",
      "symbol": "▲",
      "color": "22C55E",
      "hint": "Better product — shows the rent ceiling post-renovation."
    },
    {
      "key": "inferior",
      "label": "Inferior",
      "symbol": "▼",
      "color": "EF4444",
      "hint": "Weaker product — shows the rent floor / downside protection."
    }
  ],
  "wdTypes": [
    "No W/D",
    "W/D IU",
    "W/D HU"
  ],
  "utilStructures": [
    "ABP",
    "W+G-R",
    "W-R",
    "E+W+G-R",
    "Fixed"
  ],
  "renoLevels": [
    "Orig",
    "W-P",
    "W-R",
    "F-R",
    "New"
  ],
  "unitStatus": [
    "Original",
    "Partial",
    "Reno"
  ],
  "sources": [
    "Site Visit",
    "Phone Call",
    "HelloData",
    "Apartments.com",
    "Property Website",
    "Broker",
    "CoStar",
    "Other"
  ],
  "_subjectFieldsNote": "Order is load-bearing: on desktop these fill a 12-column grid in source order, and the spans in styles.css are chosen so the 14 fields land in exactly three rows (identity+market / location+size / condition+notes). Reordering or adding a field without adjusting the spans will push it to a fourth row. `reno_level` was removed 2026-08-07 — the subject's finish is captured per floor plan in the unit mix, which is where it actually varies.",
  "subjectFields": [
    {
      "key": "name",
      "label": "Property Name",
      "type": "text",
      "note": "Never auto-filled — use the Drive deal-folder name so the folder search matches."
    },
    {
      "key": "address",
      "label": "Street Address",
      "type": "text"
    },
    {
      "key": "msa",
      "label": "MSA / Submarket",
      "type": "text"
    },
    {
      "key": "city",
      "label": "City",
      "type": "text",
      "row": "citystzip"
    },
    {
      "key": "state",
      "label": "State",
      "type": "text",
      "row": "citystzip",
      "maxlength": 2
    },
    {
      "key": "zip",
      "label": "ZIP",
      "type": "text",
      "row": "citystzip"
    },
    {
      "key": "year_built",
      "label": "Year Built",
      "type": "number",
      "row": "yrunits"
    },
    {
      "key": "total_units",
      "label": "Total Units",
      "type": "number",
      "row": "yrunits"
    },
    {
      "key": "stories",
      "label": "Stories",
      "type": "number",
      "row": "yrunits"
    },
    {
      "key": "occupancy_pct",
      "label": "Occupancy %",
      "type": "number",
      "row": "occwd",
      "note": "Tracker-only — the subject's COMPS row-4 vacancy cell (D4) is a formula off DASH!N5."
    },
    {
      "key": "wd_type",
      "label": "W/D Type",
      "type": "select",
      "options_ref": "wdTypes",
      "row": "occwd"
    },
    {
      "key": "util_structure",
      "label": "Utilities",
      "type": "select",
      "options_ref": "utilStructures",
      "row": "occwd",
      "note": "Subject COMPS!H4 — MANUAL analyst dropdown."
    },
    {
      "key": "hellodata_id",
      "label": "HelloData ID",
      "type": "text",
      "note": "Optional — lets the tracker pull comparables without re-searching."
    },
    {
      "key": "notes",
      "label": "Notes",
      "type": "textarea"
    }
  ],
  "_compFieldsNote": "PROPERTY BASICS — the facts that drive the COMPS tab, nothing else. `city`/`state`/`zip`/`stories`/`concession_months` are deliberately ABSENT as inputs but remain live keys on the record: HelloData still fills them and they still ride the export payload and the Comp Summary sheet. Dropping the input is a UI decision; dropping the key would silently lose data an import already gathered.",
  "compFields": [
    {
      "key": "name",
      "label": "Comp Name",
      "type": "text",
      "required": true
    },
    {
      "key": "category",
      "label": "Comp Type",
      "type": "category",
      "required": true
    },
    {
      "key": "address",
      "label": "Street Address",
      "type": "text",
      "note": "Street only — city/state/zip are stripped on export."
    },
    {
      "key": "source",
      "label": "Comp Source",
      "type": "select",
      "options_ref": "sources"
    },
    {
      "key": "year_built",
      "label": "Year Built",
      "type": "number"
    },
    {
      "key": "total_units",
      "label": "Units",
      "type": "number"
    },
    {
      "key": "distance_miles",
      "label": "Dist (mi)",
      "type": "number",
      "step": "0.01"
    },
    {
      "key": "vacancy_pct",
      "label": "Vac %",
      "type": "number",
      "note": "Property-level, row 4 offset 3 (\"Vac:\"). Distinct from the per-floorplan Occ % on each unit row."
    },
    {
      "key": "concession_amount",
      "label": "Conc $",
      "type": "number",
      "note": "One-time concession, row 4 offset 4. Feeds the concession roll-up and the Suggested Subject Concession."
    },
    {
      "key": "wd_type",
      "label": "W/D",
      "type": "select",
      "options_ref": "wdTypes",
      "note": "Row 4 offset 6 — MANUAL analyst dropdown; the populator never writes it."
    },
    {
      "key": "util_structure",
      "label": "Utilities",
      "type": "select",
      "options_ref": "utilStructures",
      "note": "Row 4 offset 7 — MANUAL analyst dropdown; the populator never writes it."
    },
    {
      "key": "website",
      "label": "Website",
      "type": "url"
    },
    {
      "key": "hellodata_id",
      "label": "HelloData ID",
      "type": "text"
    },
    {
      "key": "notes",
      "label": "Notes",
      "type": "textarea"
    }
  ],
  "_compExtraFieldsNote": "Moved out of Property Basics: still captured, still exported, just not part of the at-a-glance underwriting picture. Rendered in the collapsed 'More' card with the tracker-only fees.",
  "compExtraFields": [
    {
      "key": "phone",
      "label": "Leasing Phone",
      "type": "tel"
    },
    {
      "key": "contact_name",
      "label": "Contact",
      "type": "text"
    },
    {
      "key": "reno_level",
      "label": "Reno Level",
      "type": "select",
      "options_ref": "renoLevels",
      "note": "Tracker-only — the populator has no per-comp reno cell to write this to (v44 added 'Renovated - Year'/'Renovated - Scope' physical cells at rows 204-205, but the populator does not yet write them)."
    }
  ],
  "_feeVocabularyNote": "The 12 options the FEES label dropdowns offer, identical across the Mandatory (201-205) and Optional (207-211) sub-bands and unchanged from v8 through the live v44 template (re-read directly off v44's own data validations, not assumed). Validation constrains humans typing, NOT programmatic writes — openpyxl and COM can still put any string in those cells — so anything reading or writing the fee band must know this list separately. `Storm water admin` is the corrected spelling; the audit sheet was marked KEEP on the misspelling `Storm watet admin`, which survives on exactly one live cell (Lantern COMPS!BX84, a pre-v41 workbook) and does not validate on any current dropdown.",
  "feeVocabulary": [
    "Amenity",
    "Cable/Internet",
    "Cleaning",
    "V Trash",
    "Trash",
    "Adm Trash",
    "Facility",
    "Conservice",
    "Package",
    "Storm drain",
    "Storm water admin",
    "Water admin"
  ],
  "_feesNote": "A fee's COMPS identity is its LABEL, never its row. `compsLabel` is the text that must appear in a comp block's FEES label column (offset 6) for that fee's value to be written at offset 7, and it is only ever checked against the Mandatory sub-band (feeRowFirst..feeSumLastRow = 201-205 on v44) — Optional and One-Time never reach Eff. $/Mo. v44 SETTLED the vocabulary against the template's own dropdown: only 5 of its 12 options route to a real payload key (amenity, cable_internet, cleaning, valet_trash, trash — exactly the non-null entries of populate_comps-v44.py's FEE_LABEL_TO_KEY for this vocabulary). `insurance`/`pest`/`parking`/`utilities`/`wd` are NOT on the v44 dropdown at all — those concepts were redesigned as Y/N or allocation-flag AMENITY items ('Insurance Required', the 'Parking' sub-band, 'Property Allocated Expenses' Tenant Water/Gas/Electric/Cable) — so those five keys are demoted here to tracker-only (compsLabel removed), the same treatment app_fee/admin_fee/pet_rent/pet_deposit already had. They remain live keys on the record (a pre-v41 workbook's populator run still routes them via FEE_LABEL_TO_KEY's legacy branch) but this schema — which describes the CURRENT v44 template — no longer claims they reach a COMPS cell.",
  "fees": [
    {
      "key": "amenity",
      "label": "Amenity",
      "type": "number",
      "compsLabel": "Amenity"
    },
    {
      "key": "cleaning",
      "label": "Cleaning",
      "type": "number",
      "compsLabel": "Cleaning"
    },
    {
      "key": "cable_internet",
      "label": "Cable/Internet",
      "type": "number",
      "compsLabel": "Cable/Internet"
    },
    {
      "key": "trash",
      "label": "Trash / Mo",
      "type": "number",
      "compsLabel": "Trash"
    },
    {
      "key": "valet_trash",
      "label": "Valet Trash / Mo",
      "type": "number",
      "compsLabel": "V Trash"
    },
    {
      "key": "insurance",
      "label": "Insurance",
      "type": "number",
      "note": "Tracker-only as of v44 — not on the FEES dropdown; the template's own 'Insurance Required' amenity Y/N flag covers this now."
    },
    {
      "key": "pest",
      "label": "Pest",
      "type": "number",
      "note": "Tracker-only as of v44 — dropped from the FEES dropdown, no v44 replacement cell."
    },
    {
      "key": "parking",
      "label": "Parking",
      "type": "number",
      "note": "Tracker-only as of v44 — not on the FEES dropdown; the template's own 'Parking' amenity sub-band (Assigned/Attached Garage/Covered/etc.) covers this now."
    },
    {
      "key": "utilities",
      "label": "Utilities",
      "type": "number",
      "note": "Tracker-only as of v44 — not on the FEES dropdown; the template's own 'Property Allocated Expenses' amenity items (Tenant Water/Gas/Electric/Cable) cover this now."
    },
    {
      "key": "wd",
      "label": "W/D",
      "type": "number",
      "note": "Tracker-only as of v44 — not on the FEES dropdown; the template's own W/D In-Unit / W/D Hookups physical attributes cover this now."
    },
    {
      "key": "app_fee",
      "label": "Application Fee",
      "type": "number"
    },
    {
      "key": "admin_fee",
      "label": "Admin Fee",
      "type": "number"
    },
    {
      "key": "pet_rent",
      "label": "Pet Rent / Mo",
      "type": "number"
    },
    {
      "key": "pet_deposit",
      "label": "Pet Deposit",
      "type": "number"
    },
    {
      "key": "other",
      "label": "Other / Mo",
      "type": "number"
    },
    {
      "key": "other_label",
      "label": "Other — what?",
      "type": "text"
    }
  ],
  "brand": {
    "navy": "1D2D47",
    "shirInputFill": "D9E1F2",
    "shirInputFont": "002060",
    "suggestedRentFill": "FF0000",
    "suggestedRentFont": "FFFFFF",
    "font": "Arial Narrow",
    "fontSize": 11,
    "tabColorDone": "33CC33"
  }
};
