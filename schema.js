// GENERATED FILE — do not edit by hand.
// Source: Accessories/comps_schema.json
// Rebuild: python Accessories/build_schema.py
window.SCHEMA = {
  "compsTab": {
    "_v45Note": "Bumped v44 -> v45 on 2026-09-16. PURE ROW SHIFT, no structural change: SHIR_MF_Template_v45 inserts ONE blank spacer row at COMPS!199, so every row from the old 199 down moved +1 and nothing at or above 198 moved at all. Confirmed two independent ways, not assumed from the v45 changelog: (a) populate_comps-v45.py's own resolve_comps_geometry() run live against both workbooks returns row_totals 176 / row_comp_type 177 / the seven unit sections / the concession roll-up (179-191) / both photo rows (179, 189) IDENTICAL, and row_phys_header 199->200, every phys_row and amen_row +1, fee_row_span (201,205)->(202,206); (b) a cell-by-cell diff of COMPS column Y rows 170-330 between v44 and v45 shows v45[r] == v44[r-1] for EVERY r >= 200 with zero exceptions, and rows 170-198 byte-identical. So the edit here is mechanical: +1 on every MF row >= 199 (the 15 compsTab band scalars, all 9 physical rows, all 9 amenity rows) plus the two pasteMap regions widening from $269 to $270 (amenRowLast, the tallest band). Offsets, columns, compBaseCols, unitBuckets, fee vocabulary and the label-based fee routing are untouched — v45 changed no geometry other than where the attribute block starts. The ExStay branch is NOT affected (its template is still v38) and was deliberately not walked by the bump. verify_against_template.py needed no code changes, again: 67/67 against SHIR_MF_Template_v45.xlsx after the bump, 21 failures before it.",
    "_v44Note": "Bumped v9 -> v44 on 2026-09-15 (the schema had gone stale across v10-v43; populate_comps-v44.py's own geometry dispatcher was already fixed for the independent bands, this file and the two scripts that build/verify it were not). Two structural changes: (1) attrRowFirst/attrRowLast (one shared span) is RETIRED — replaced with physRowFirst/physRowLast, amenRowFirst/amenRowLast, and a Mandatory-only feeRowFirst/feeRowLast/feeSumLastRow, each resolved independently, matching populate_comps-v44.py's _resolve_bands_new(). (2) the FEES vocabulary is settled against the template's OWN dropdown (read via openpyxl data_validations, not assumed): only 5 of its 12 options route to a real dollar fee (Amenity, Cable/Internet, Cleaning, V Trash, Trash) — Insurance/Pest/Parking/Utilities/W-D are NOT on the v44 dropdown at all; they were redesigned as Y/N or allocation-flag AMENITY items ('Insurance Required', the Parking sub-band, 'Property Allocated Expenses' Tenant Water/Gas/Electric/Cable). Those five keys are demoted to tracker-only (compsLabel removed) in `fees` below, same treatment app_fee/admin_fee/pet_rent/pet_deposit already had. Also: rowTotals moved 76->176, rowCompType 77->177, rowAttrHeader 78->199 (unit sections grew from 9 to up to 24 rows each — verified live against every unit bucket's subtotal row, not assumed), and the paste-export regions (`pasteMap.regions`) are widened from row 87 to row 269 — the old bound silently excluded roughly two-thirds of the comp block (everything from the widened unit sections through the whole attribute/amenity/fee area). Verified against the live SHIR_MF_Template_v44.xlsx; `verify_against_template.py` needed NO code changes for any of this (it already resolves rows from the JSON rather than assuming a shared span) — only comps_schema.json's data and build_schema.py's internal-consistency checks did.",
    "_versionNote": "Historical, pre-v44: bumped v7 -> v8 on 2026-08-08. The COMPS GEOMETRY was identical in v7 and v8 — every row, column, offset and section was unchanged, and the schema verified 67/67 against both. What changed in v8 was only what the FEES label cells CONTAIN (they became dropdowns, and five of the eight v7 labels were dropped), which is why fees are routed by `compsLabel` and never by row. `populatorScript` moved to v36 in the same pass, then v37 on 2026-08-10 (per-plan subject market rents). Superseded by the v44 band rebuild above — kept for the fee-routing-by-label history, not as current geometry.",
    "_v9Note": "Historical: bumped v8 -> v9 on 2026-08-10, a pure stamp — SHIR_MF_Template_v9's entire delta was 274 cells inside COMPS!R3:W76 (a lease-recency window on the INTERNAL comps block), byte-identical COMPS geometry otherwise. Superseded by v44 above.",
    "templateVersion": "SHIR_MF_Template_v45",
    "populatorScript": "rent-comp-data-populator-populate_comps-v45.py",
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
    "rowAttrHeader": 200,
    "_bandNote": "The three attribute bands share their header row (200) and first data row (201) but are INDEPENDENTLY SIZED below that — never derive one band's span from another's. Resolved live against SHIR_MF_Template_v45.xlsx via populate_comps-v45.py's own resolve_comps_geometry(), not re-derived by hand.",
    "physRowFirst": 201,
    "physRowLast": 224,
    "amenRowFirst": 201,
    "amenRowLast": 270,
    "feeMandatoryHeaderRow": 201,
    "feeRowFirst": 202,
    "feeRowLast": 206,
    "feeSumLastRow": 206,
    "_feeSumLastRowNote": "Unlike v7-v9 (feeSumLastRow = feeRowLast + 1, an unlabelled row past the last printed label that the Eff. $/Mo SUM still covered), v45's Mandatory band has no trailing unlabelled row: all 5 rows (3 pre-labelled + 2 blank-but-labelable via the dropdown) are inside 202-206, and the Eff. $/Mo formula sums exactly that range — confirmed against the live SUM($AF$202:$AF$206) formula.",
    "feeOptionalHeaderRow": 207,
    "feeOptionalFirst": 208,
    "feeOptionalLast": 212,
    "feeOneTimeHeaderRow": 213,
    "feeOneTimeFirst": 214,
    "feeOneTimeLast": 216,
    "_feeOptionalOneTimeNote": "Optional Fees (208-212, same 12-item dropdown as Mandatory) and One-Time Fees (214-216, fixed pre-printed labels: Application Fee / Admin Fee / Pet Deposit, no dropdown) exist on the template but do NOT feed Eff. $/Mo and are out of scope for this pass — `fees` below still treats app_fee/admin_fee/pet_deposit as tracker-only, same as pre-v44. Recorded here only so a future pass does not have to re-resolve these rows from scratch.",
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
    "_offsetsNote": "Every offset above is UNCHANGED across v9 -> v45 — confirmed live (row 4 number formats, OFFSET_PHYS=2 / OFFSET_AMEN=5 in populate_comps-v44.py, and the row-3 comp-name convention all matched byte-for-byte between SHIR_MF_Template_v35 and v44). Only the ROW numbers each offset lands on moved."
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
        "range": "$Y$3:$DJ$270",
        "anchor": "Y3",
        "default": true,
        "label": "All 8 comps — names, row 4, unit rows, type/source, attributes, fees"
      },
      {
        "key": "subject",
        "name": "PASTE_SUBJECT",
        "sheet": "COMPS_PASTE",
        "range": "$B$3:$H$270",
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
  "_physicalNote": "All 20 Physical fields the v41+ band actually carries, in 4 sub-groups (Building 5, Unit Systems 9, Terms 5, Location 1) — expanded 2026-09-16 from the 9 Unit Systems fields this schema tracked before, which were the whole vocabulary back on v9 and only a third of it from v41 on. Every row is resolved live out of THIS family's own workbook by label (Accessories/gen_bands.py), never by applying an offset to the other family's numbers. `group` carries the sub-group header the field sits under, and item order is group order — the capture UI renders straight off it. `type` is one of tri (Y/N/blank, 59 of the 79 fields across both bands), text, number, count or alloc; see _bandTypesNote. The 9 pre-existing keys are byte-identical (key, label, row, hellodata) so no saved record is orphaned and populate_comps-v45.py's PHYSICAL_ATTR_LABELS still routes them.",
  "physical": [
    {
      "key": "property_type",
      "label": "Property Type",
      "group": "Building",
      "row": 202,
      "type": "text",
      "hellodata": null
    },
    {
      "key": "stories",
      "label": "Stories",
      "group": "Building",
      "row": 203,
      "type": "number",
      "hellodata": null
    },
    {
      "key": "residential_buildings",
      "label": "Residential Buildings",
      "group": "Building",
      "row": 204,
      "type": "number",
      "hellodata": null
    },
    {
      "key": "renovated_year",
      "label": "Renovated - Year",
      "group": "Building",
      "row": 205,
      "type": "number",
      "hellodata": null
    },
    {
      "key": "renovated_scope",
      "label": "Renovated - Scope",
      "group": "Building",
      "row": 206,
      "type": "text",
      "hellodata": null
    },
    {
      "key": "hvac_indiv",
      "label": "HVAC Indiv.",
      "group": "Unit Systems",
      "row": 208,
      "type": "tri",
      "hellodata": "central_air_conditioning"
    },
    {
      "key": "wd_inunit",
      "label": "W/D In-Unit",
      "group": "Unit Systems",
      "row": 209,
      "type": "tri",
      "hellodata": "washer_dryer_in_unit"
    },
    {
      "key": "wd_hookups",
      "label": "W/D Hookups",
      "group": "Unit Systems",
      "row": 210,
      "type": "tri",
      "hellodata": "washer_dryer_hookups"
    },
    {
      "key": "water_util",
      "label": "Water Util.",
      "group": "Unit Systems",
      "row": 211,
      "type": "tri",
      "hellodata": null
    },
    {
      "key": "gas_util",
      "label": "Gas Util.",
      "group": "Unit Systems",
      "row": 212,
      "type": "tri",
      "hellodata": null
    },
    {
      "key": "elec_util",
      "label": "Elec. Util.",
      "group": "Unit Systems",
      "row": 213,
      "type": "tri",
      "hellodata": null
    },
    {
      "key": "roof_type",
      "label": "Roof Type",
      "group": "Unit Systems",
      "row": 214,
      "type": "text",
      "hellodata": null
    },
    {
      "key": "priv_yards",
      "label": "Priv. Yards",
      "group": "Unit Systems",
      "row": 215,
      "type": "tri",
      "hellodata": "patio_or_balcony"
    },
    {
      "key": "indiv_hwh",
      "label": "Indiv. HWH",
      "group": "Unit Systems",
      "row": 216,
      "type": "tri",
      "hellodata": null
    },
    {
      "key": "lease_terms",
      "label": "Lease Terms",
      "group": "Terms",
      "row": 218,
      "type": "text",
      "hellodata": null
    },
    {
      "key": "locator_commission",
      "label": "Locator Commission",
      "group": "Terms",
      "row": 219,
      "type": "text",
      "hellodata": null
    },
    {
      "key": "views",
      "label": "Views",
      "group": "Terms",
      "row": 220,
      "type": "text",
      "hellodata": null
    },
    {
      "key": "specials",
      "label": "Specials",
      "group": "Terms",
      "row": 221,
      "type": "text",
      "hellodata": null
    },
    {
      "key": "other_notes",
      "label": "Other Notes",
      "group": "Terms",
      "row": 222,
      "type": "text",
      "hellodata": null
    },
    {
      "key": "near_transit",
      "label": "Near Transit",
      "group": "Location",
      "row": 224,
      "type": "tri",
      "hellodata": null
    }
  ],
  "_amenitiesNote": "All 59 Amenity fields the v41+ band carries, in 11 sub-groups (Building & Common 2, Activity / Lifestyle 13, Parking 6, Floorplan 9, Kitchen / Bath 5, Services 6, Utilities 3, Property Allocated Expenses 5, Internet / Broadband 2, Security 5, Pets 3) — expanded 2026-09-16 from the 9-key v9 vocabulary, which was NOT a subset of this one. Rows are NOT contiguous: they interleave with the 11 sub-group header rows, so build_schema.py validates by band-membership and uniqueness, never by anchor + index. The 9 pre-existing keys keep their exact key/label/row/hellodata, including the two that read oddly against the new vocabulary and are kept anyway because renaming them would orphan live records and break the populator: `pool` is the key for '# of Pools' and `sport_court` for 'Basketball Court'. Both still carry `lossy: true` and their note.",
  "_bandTypesNote": "Field input types. The template carries almost NO type metadata — every value cell in both bands is General format with no data validation — so only ONE of these is measured and the rest are decisions, recorded here so they can be argued with rather than silently re-guessed. MEASURED: `alloc` (5 fields, the Property Allocated Expenses sub-group) is the one case the workbook itself types, via a real 'To Property,To City/Utility' dropdown read off ws.data_validations; its `options` come from that list. DECIDED: `count` = any label starting with '#' (# Common Laundry Rms, # of Pools, # of Tennis Courts) — a count column cannot hold a Y/N string, which is the bug v44 introduced for pools; `number` = Stories, Residential Buildings, Renovated - Year; `text` = Property Type, Renovated - Scope, Roof Type, Lease Terms, Locator Commission, Views, Specials, Other Notes, Pets Policy; `tri` = everything else, the Y/N/blank tri-state all 18 pre-existing fields already used. Note `roof_type` stays `text` here but populate_comps-v45.py still writes it 'Y'/'N' through the legacy PHYSICAL_ATTR_LABELS route — the paste-export route honours the type, the populator route does not, and only the populator can fix that.",
  "amenities": [
    {
      "key": "elevators",
      "label": "Elevators",
      "group": "Building & Common",
      "row": 202,
      "type": "tri",
      "hellodata": null
    },
    {
      "key": "num_common_laundry_rms",
      "label": "# Common Laundry Rms",
      "group": "Building & Common",
      "row": 203,
      "type": "count",
      "hellodata": null
    },
    {
      "key": "24hr_fitness_room",
      "label": "24hr Fitness Room",
      "group": "Activity / Lifestyle",
      "row": 205,
      "type": "tri",
      "hellodata": null
    },
    {
      "key": "sport_court",
      "label": "Basketball Court",
      "group": "Activity / Lifestyle",
      "row": 206,
      "type": "tri",
      "hellodata": "basketball_court",
      "lossy": true,
      "note": "v44 splits the old generic 'Sport Court' three ways (Basketball Court / Volleyball / # of Tennis Courts); this key routes to Basketball Court only."
    },
    {
      "key": "clubhouse",
      "label": "Clubroom",
      "group": "Activity / Lifestyle",
      "row": 207,
      "type": "tri",
      "hellodata": "club_house_party_room"
    },
    {
      "key": "dog_park",
      "label": "Dog Park",
      "group": "Activity / Lifestyle",
      "row": 208,
      "type": "tri",
      "hellodata": "dog_park"
    },
    {
      "key": "fitness_center",
      "label": "Fitness Room / Gym",
      "group": "Activity / Lifestyle",
      "row": 209,
      "type": "tri",
      "hellodata": "fitness_center"
    },
    {
      "key": "bbq_grill",
      "label": "Grill(s)",
      "group": "Activity / Lifestyle",
      "row": 210,
      "type": "tri",
      "hellodata": "barbecue_grill"
    },
    {
      "key": "hot_tub_jacuzzi",
      "label": "Hot Tub / Jacuzzi",
      "group": "Activity / Lifestyle",
      "row": 211,
      "type": "tri",
      "hellodata": null
    },
    {
      "key": "jogging_trail",
      "label": "Jogging Trail",
      "group": "Activity / Lifestyle",
      "row": 212,
      "type": "tri",
      "hellodata": null
    },
    {
      "key": "playground",
      "label": "Playground",
      "group": "Activity / Lifestyle",
      "row": 213,
      "type": "tri",
      "hellodata": "playground"
    },
    {
      "key": "sauna",
      "label": "Sauna",
      "group": "Activity / Lifestyle",
      "row": 214,
      "type": "tri",
      "hellodata": null
    },
    {
      "key": "volleyball",
      "label": "Volleyball",
      "group": "Activity / Lifestyle",
      "row": 215,
      "type": "tri",
      "hellodata": null
    },
    {
      "key": "pool",
      "label": "# of Pools",
      "group": "Activity / Lifestyle",
      "row": 216,
      "type": "count",
      "hellodata": "swimming_pool",
      "lossy": true,
      "note": "v44 changed this from a Y/N amenity to a pool COUNT. A truthy HelloData flag writes 1 (a floor on the real count, not a reading), never 'Y'."
    },
    {
      "key": "num_of_tennis_courts",
      "label": "# of Tennis Courts",
      "group": "Activity / Lifestyle",
      "row": 217,
      "type": "count",
      "hellodata": null
    },
    {
      "key": "assigned_parking",
      "label": "Assigned Parking",
      "group": "Parking",
      "row": 219,
      "type": "tri",
      "hellodata": null
    },
    {
      "key": "attached_garages",
      "label": "Attached Garages",
      "group": "Parking",
      "row": 220,
      "type": "tri",
      "hellodata": null
    },
    {
      "key": "community_parking_garage",
      "label": "Community Parking Garage",
      "group": "Parking",
      "row": 221,
      "type": "tri",
      "hellodata": null
    },
    {
      "key": "covered_parking",
      "label": "Covered Parking",
      "group": "Parking",
      "row": 222,
      "type": "tri",
      "hellodata": null
    },
    {
      "key": "detached_garages",
      "label": "Detached Garages",
      "group": "Parking",
      "row": 223,
      "type": "tri",
      "hellodata": null
    },
    {
      "key": "ev_charging_stations",
      "label": "EV Charging Stations",
      "group": "Parking",
      "row": 224,
      "type": "tri",
      "hellodata": null
    },
    {
      "key": "extra_storage",
      "label": "Extra Storage",
      "group": "Floorplan",
      "row": 226,
      "type": "tri",
      "hellodata": null
    },
    {
      "key": "fireplaces",
      "label": "Fireplaces",
      "group": "Floorplan",
      "row": 227,
      "type": "tri",
      "hellodata": null
    },
    {
      "key": "hardwood_floors",
      "label": "Hardwood Floors",
      "group": "Floorplan",
      "row": 228,
      "type": "tri",
      "hellodata": null
    },
    {
      "key": "high_ceilings",
      "label": "High Ceilings",
      "group": "Floorplan",
      "row": 229,
      "type": "tri",
      "hellodata": null
    },
    {
      "key": "patio_balcony",
      "label": "Patio / Balcony",
      "group": "Floorplan",
      "row": 230,
      "type": "tri",
      "hellodata": null
    },
    {
      "key": "private_yards",
      "label": "Private Yards",
      "group": "Floorplan",
      "row": 231,
      "type": "tri",
      "hellodata": null
    },
    {
      "key": "w_d_connections",
      "label": "W/D Connections",
      "group": "Floorplan",
      "row": 232,
      "type": "tri",
      "hellodata": null
    },
    {
      "key": "w_d_provided",
      "label": "W/D Provided",
      "group": "Floorplan",
      "row": 233,
      "type": "tri",
      "hellodata": null
    },
    {
      "key": "walk_in_closets",
      "label": "Walk-in Closets",
      "group": "Floorplan",
      "row": 234,
      "type": "tri",
      "hellodata": null
    },
    {
      "key": "dishwashers",
      "label": "Dishwashers",
      "group": "Kitchen / Bath",
      "row": 236,
      "type": "tri",
      "hellodata": null
    },
    {
      "key": "granite_stone_countertops",
      "label": "Granite / Stone Countertops",
      "group": "Kitchen / Bath",
      "row": 237,
      "type": "tri",
      "hellodata": null
    },
    {
      "key": "pantry",
      "label": "Pantry",
      "group": "Kitchen / Bath",
      "row": 238,
      "type": "tri",
      "hellodata": null
    },
    {
      "key": "stainless_steel_appliances",
      "label": "Stainless Steel Appliances",
      "group": "Kitchen / Bath",
      "row": 239,
      "type": "tri",
      "hellodata": null
    },
    {
      "key": "walk_in_showers",
      "label": "Walk-in Showers",
      "group": "Kitchen / Bath",
      "row": 240,
      "type": "tri",
      "hellodata": null
    },
    {
      "key": "business_center",
      "label": "Business Center",
      "group": "Services",
      "row": 242,
      "type": "tri",
      "hellodata": "business_center"
    },
    {
      "key": "corporate_units",
      "label": "Corporate Units",
      "group": "Services",
      "row": 243,
      "type": "tri",
      "hellodata": null
    },
    {
      "key": "doorman",
      "label": "Doorman",
      "group": "Services",
      "row": 244,
      "type": "tri",
      "hellodata": null
    },
    {
      "key": "package_delivery",
      "label": "Package Delivery",
      "group": "Services",
      "row": 245,
      "type": "tri",
      "hellodata": null
    },
    {
      "key": "valet_trash",
      "label": "Valet Trash",
      "group": "Services",
      "row": 246,
      "type": "tri",
      "hellodata": null
    },
    {
      "key": "recycling",
      "label": "Recycling",
      "group": "Services",
      "row": 247,
      "type": "tri",
      "hellodata": null
    },
    {
      "key": "all_bills_paid",
      "label": "All Bills Paid",
      "group": "Utilities",
      "row": 249,
      "type": "tri",
      "hellodata": null
    },
    {
      "key": "commercial_electric",
      "label": "Commercial Electric",
      "group": "Utilities",
      "row": 250,
      "type": "tri",
      "hellodata": null
    },
    {
      "key": "insurance_required",
      "label": "Insurance Required",
      "group": "Utilities",
      "row": 251,
      "type": "tri",
      "hellodata": null
    },
    {
      "key": "tenant_trash",
      "label": "Tenant Trash",
      "group": "Property Allocated Expenses",
      "row": 253,
      "type": "alloc",
      "options": [
        "To Property",
        "To City/Utility"
      ],
      "hellodata": null
    },
    {
      "key": "tenant_water",
      "label": "Tenant Water",
      "group": "Property Allocated Expenses",
      "row": 254,
      "type": "alloc",
      "options": [
        "To Property",
        "To City/Utility"
      ],
      "hellodata": null
    },
    {
      "key": "tenant_gas",
      "label": "Tenant Gas",
      "group": "Property Allocated Expenses",
      "row": 255,
      "type": "alloc",
      "options": [
        "To Property",
        "To City/Utility"
      ],
      "hellodata": null
    },
    {
      "key": "tenant_electric",
      "label": "Tenant Electric",
      "group": "Property Allocated Expenses",
      "row": 256,
      "type": "alloc",
      "options": [
        "To Property",
        "To City/Utility"
      ],
      "hellodata": null
    },
    {
      "key": "tenant_cable",
      "label": "Tenant Cable",
      "group": "Property Allocated Expenses",
      "row": 257,
      "type": "alloc",
      "options": [
        "To Property",
        "To City/Utility"
      ],
      "hellodata": null
    },
    {
      "key": "fiber_optic_cable",
      "label": "Fiber Optic Cable",
      "group": "Internet / Broadband",
      "row": 259,
      "type": "tri",
      "hellodata": null
    },
    {
      "key": "satellite",
      "label": "Satellite",
      "group": "Internet / Broadband",
      "row": 260,
      "type": "tri",
      "hellodata": null
    },
    {
      "key": "gated",
      "label": "Access Gates (Driving)",
      "group": "Security",
      "row": 262,
      "type": "tri",
      "hellodata": "gated_community_access"
    },
    {
      "key": "alarm_systems",
      "label": "Alarm Systems",
      "group": "Security",
      "row": 263,
      "type": "tri",
      "hellodata": null
    },
    {
      "key": "courtesy_patrol",
      "label": "Courtesy Patrol",
      "group": "Security",
      "row": 264,
      "type": "tri",
      "hellodata": null
    },
    {
      "key": "limited_building_access",
      "label": "Limited Building Access",
      "group": "Security",
      "row": 265,
      "type": "tri",
      "hellodata": null
    },
    {
      "key": "video_surveillance",
      "label": "Video Surveillance",
      "group": "Security",
      "row": 266,
      "type": "tri",
      "hellodata": null
    },
    {
      "key": "pets_accepted",
      "label": "Pets Accepted",
      "group": "Pets",
      "row": 268,
      "type": "tri",
      "hellodata": null
    },
    {
      "key": "large_pets",
      "label": "Large Pets",
      "group": "Pets",
      "row": 269,
      "type": "tri",
      "hellodata": null
    },
    {
      "key": "pets_policy",
      "label": "Pets Policy",
      "group": "Pets",
      "row": 270,
      "type": "text",
      "hellodata": null
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
  "_feesNote": "A fee's COMPS identity is its LABEL, never its row. `compsLabel` is the text that must appear in a comp block's FEES label column (offset 6) for that fee's value to be written at offset 7, and it is only ever checked against the Mandatory sub-band (feeRowFirst..feeSumLastRow = 202-206 on v45) — Optional and One-Time never reach Eff. $/Mo. v44 SETTLED the vocabulary against the template's own dropdown: only 5 of its 12 options route to a real payload key (amenity, cable_internet, cleaning, valet_trash, trash — exactly the non-null entries of populate_comps-v44.py's FEE_LABEL_TO_KEY for this vocabulary). `insurance`/`pest`/`parking`/`utilities`/`wd` are NOT on the v44 dropdown at all — those concepts were redesigned as Y/N or allocation-flag AMENITY items ('Insurance Required', the 'Parking' sub-band, 'Property Allocated Expenses' Tenant Water/Gas/Electric/Cable) — so those five keys are demoted here to tracker-only (compsLabel removed), the same treatment app_fee/admin_fee/pet_rent/pet_deposit already had. They remain live keys on the record (a pre-v41 workbook's populator run still routes them via FEE_LABEL_TO_KEY's legacy branch) but this schema — which describes the CURRENT v45 template — no longer claims they reach a COMPS cell.",
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
  },
  "_exstayNote": "Added 2026-09-15. `compsTab` (top-level) through this point is MF-only and stays exactly as-is — untouched, so nothing about live MF capture changes. `SHIR_ExStay_Template_v38` ported MF v44's independent-band COMPS attribute-block redesign onto ExStay (see SHIR_ExStay_Template_v38_CHANGELOG.md in TEMPLATES\\EXStay Proforma Template Excel\\), but landed it at DIFFERENT ROW NUMBERS (attribute header row 114, not 199) and kept the concession roll-up at its legacy R:W columns (not MF's J:O) — a genuine family branch, not a constant swap. This 'exstay' block is a fully self-contained sibling of the top-level compsTab/unitBuckets/physical/amenities/pasteMap — same shapes, same field names, same label vocabulary and hellodata crosswalk (verbatim-copied from MF v44 per the changelog), only the row numbers and rollup columns differ. Kept as an ADDITIVE sibling rather than folding both families into one nested structure so existing webapp/build/verify code that reads top-level compsTab keeps working for MF unmodified; consuming a family other than MF is left to a later webapp-wiring pass (paste-export.js / app.js do not yet select 'exstay' — this ships the schema + build_schema.py/verify_against_template.py support only, per the 2026-09-15 task scope). Fees vocabulary (`fees`/`feeVocabulary`) and Tracker-UI-only vocab (`categories`/`wdTypes`/`utilStructures`/`renoLevels`/`sources`/`subjectFields`/`compFields`/`compExtraFields`/`brand`) are SHARED across both families — none of those reference a COMPS row, and the FEES dropdown + label vocabulary were copied verbatim from the same MF v44 source, so there is nothing family-specific to duplicate. Every row/column number below was read live off SHIR_ExStay_Template_v38.xlsx's COMPS sheet (label-by-label, the same method resolve_comps_geometry() in populate_comps-v45.py uses), not transcribed from the changelog prose alone — verify_against_template.py's exstay pass re-confirms this on every run.",
  "exstay": {
    "compsTab": {
      "_note": "Row map verified live against SHIR_ExStay_Template_v38.xlsx on 2026-09-15 (row_totals=76, row_comp_type=77, row_phys_header=114, layout='new' — same dispatcher tag as MF v41+ since row 115 col Y reads 'Building', not 'HVAC Indiv.'). Column layout (compBaseCols, compBlockWidth, all `offsets`) is IDENTICAL to MF — only rows moved. The concession roll-up stayed at its legacy R:W columns (rollupCols below) instead of moving to MF's J:O — confirmed live and called out explicitly in populate_comps-v45.py's module docstring (the v44.1 fix) and the v38 changelog §1's reference table.",
      "templateVersion": "SHIR_ExStay_Template_v38",
      "populatorScript": "rent-comp-data-populator-populate_comps-v45.py",
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
      "reservedSlotNote": "Same reservation as MF (see compsTab.reservedSlotNote above) — the populator script and its pristine-serial-restore logic are shared across both families.",
      "rowHeader": 3,
      "rowDetails": 4,
      "rowColHeaders": 5,
      "rowTotals": 76,
      "rowCompType": 77,
      "rowAttrHeader": 114,
      "_bandNote": "The three attribute bands share their header row (114) and first data row (115) but are INDEPENDENTLY SIZED below that, exactly like MF v41+ — never derive one band's span from another's. Resolved live against SHIR_ExStay_Template_v38.xlsx by label, not re-derived by hand.",
      "physRowFirst": 115,
      "physRowLast": 138,
      "amenRowFirst": 115,
      "amenRowLast": 184,
      "feeMandatoryHeaderRow": 115,
      "feeRowFirst": 116,
      "feeRowLast": 120,
      "feeSumLastRow": 120,
      "_feeSumLastRowNote": "Same v41+ shape as MF: the Mandatory band has no trailing unlabelled row past feeRowLast — all 5 rows (116-120; 3 pre-labelled Amenity/Cable-Internet/Cleaning + 2 blank-but-labelable via the dropdown) sit inside feeRowFirst..feeRowLast, and the changelog's §1 'What had to be fixed explicitly' documents the Eff. $/Mo formulas being rewritten to SUM($<col>$116:$<col>$120) per comp, matching this span.",
      "feeOptionalHeaderRow": 121,
      "feeOptionalFirst": 122,
      "feeOptionalLast": 126,
      "feeOneTimeHeaderRow": 127,
      "feeOneTimeFirst": 128,
      "feeOneTimeLast": 132,
      "_feeOptionalOneTimeNote": "Optional Fees (122-126) and One-Time Fees (128-132) exist on the template but do NOT feed Eff. $/Mo and are out of scope for this pass, same as MF. Only 3 of One-Time's 5 rows carry a pre-printed label live (Application Fee/Admin Fee/Pet Deposit, rows 128-130); 131-132 are blank continuations of the same band, mirroring the Mandatory band's 2 blank dropdown slots.",
      "subjectMktRentCol": 7,
      "subjectUnitCountCol": 3,
      "rollupCols": {
        "index": 18,
        "name": 19,
        "units": 20,
        "conc": 21,
        "concPct": 22,
        "incl": 23,
        "_note": "R:W — the legacy position, UNCHANGED from pre-v38. MF's own v41+ port moved this roll-up to J:O; ExStay's v38 port did not follow that part of MF's design (column position was never in scope for this port — see changelog §1 reference table and populate_comps-v45.py's v44.1 fix). Header row 101 (verified live): '#'/'Comp Name'/'# Units'/'Conc $'/'Conc %'/'Incl?' at R/S/T/U/V/W; data rows 102-111 (10 comp slots); Wtd Avg Concession at 112; Suggested Subject Concession at 113.",
        "headerRow": 101,
        "firstRow": 102,
        "lastRow": 111,
        "wtdAvgRow": 112,
        "suggestedRow": 113
      },
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
      "_offsetsNote": "Byte-identical to the top-level MF offsets — verified live (row 4/5 headers and comp1 row 3/4/5 all matched the same offset convention on SHIR_ExStay_Template_v38.xlsx). Only the ROW numbers moved; ExStay never diverged from MF's column layout."
    },
    "unitBuckets": [
      {
        "key": "efficiency",
        "label": "Efficiency / Studio",
        "short": "Eff",
        "compsLabel": "+Eff",
        "startRow": 6,
        "endRow": 14,
        "subtotalRow": 15,
        "beds": 0,
        "baths": 1
      },
      {
        "key": "1br1ba",
        "label": "1BR / 1BA",
        "short": "1x1",
        "compsLabel": "+1/1(.5)",
        "startRow": 16,
        "endRow": 24,
        "subtotalRow": 25,
        "beds": 1,
        "baths": 1
      },
      {
        "key": "2br1ba",
        "label": "2BR / 1BA",
        "short": "2x1",
        "compsLabel": "+2x1(.5)",
        "startRow": 26,
        "endRow": 34,
        "subtotalRow": 35,
        "beds": 2,
        "baths": 1
      },
      {
        "key": "2br2ba",
        "label": "2BR / 2BA",
        "short": "2x2",
        "compsLabel": "+2x2(.5)",
        "startRow": 36,
        "endRow": 44,
        "subtotalRow": 45,
        "beds": 2,
        "baths": 2
      },
      {
        "key": "3br1ba",
        "label": "3BR / 1BA",
        "short": "3x1",
        "compsLabel": "+3/1(.5)",
        "startRow": 46,
        "endRow": 54,
        "subtotalRow": 55,
        "beds": 3,
        "baths": 1
      },
      {
        "key": "3br2ba",
        "label": "3BR / 2BA",
        "short": "3x2",
        "compsLabel": "+3/2(.5)",
        "startRow": 56,
        "endRow": 64,
        "subtotalRow": 65,
        "beds": 3,
        "baths": 2
      },
      {
        "key": "4br2ba",
        "label": "4BR / 2BA",
        "short": "4x2",
        "compsLabel": "+4/2(.5)",
        "startRow": 66,
        "endRow": 74,
        "subtotalRow": 75,
        "beds": 4,
        "baths": 2
      }
    ],
    "_unitBucketsNote": "Same 7 sections, same compsLabel text, as MF — 'UNITS is byte-identical to v37' per the v38 changelog, i.e. ExStay's grid never grew past its original 9-row-per-section shape (63 plan rows/comp total) the way MF's did on v41. Rows verified live: subtotal labels '+Eff'/'+1/1(.5)'/.../'+4/2(.5)' found at 15/25/35/45/55/65/75, each exactly endRow+1, each bucket's startRow exactly prev subtotal + 1, last subtotal (75) + 1 = rowTotals (76).",
    "physical": [
      {
        "key": "property_type",
        "label": "Property Type",
        "group": "Building",
        "row": 116,
        "type": "text",
        "hellodata": null
      },
      {
        "key": "stories",
        "label": "Stories",
        "group": "Building",
        "row": 117,
        "type": "number",
        "hellodata": null
      },
      {
        "key": "residential_buildings",
        "label": "Residential Buildings",
        "group": "Building",
        "row": 118,
        "type": "number",
        "hellodata": null
      },
      {
        "key": "renovated_year",
        "label": "Renovated - Year",
        "group": "Building",
        "row": 119,
        "type": "number",
        "hellodata": null
      },
      {
        "key": "renovated_scope",
        "label": "Renovated - Scope",
        "group": "Building",
        "row": 120,
        "type": "text",
        "hellodata": null
      },
      {
        "key": "hvac_indiv",
        "label": "HVAC Indiv.",
        "group": "Unit Systems",
        "row": 122,
        "type": "tri",
        "hellodata": "central_air_conditioning"
      },
      {
        "key": "wd_inunit",
        "label": "W/D In-Unit",
        "group": "Unit Systems",
        "row": 123,
        "type": "tri",
        "hellodata": "washer_dryer_in_unit"
      },
      {
        "key": "wd_hookups",
        "label": "W/D Hookups",
        "group": "Unit Systems",
        "row": 124,
        "type": "tri",
        "hellodata": "washer_dryer_hookups"
      },
      {
        "key": "water_util",
        "label": "Water Util.",
        "group": "Unit Systems",
        "row": 125,
        "type": "tri",
        "hellodata": null
      },
      {
        "key": "gas_util",
        "label": "Gas Util.",
        "group": "Unit Systems",
        "row": 126,
        "type": "tri",
        "hellodata": null
      },
      {
        "key": "elec_util",
        "label": "Elec. Util.",
        "group": "Unit Systems",
        "row": 127,
        "type": "tri",
        "hellodata": null
      },
      {
        "key": "roof_type",
        "label": "Roof Type",
        "group": "Unit Systems",
        "row": 128,
        "type": "text",
        "hellodata": null
      },
      {
        "key": "priv_yards",
        "label": "Priv. Yards",
        "group": "Unit Systems",
        "row": 129,
        "type": "tri",
        "hellodata": "patio_or_balcony"
      },
      {
        "key": "indiv_hwh",
        "label": "Indiv. HWH",
        "group": "Unit Systems",
        "row": 130,
        "type": "tri",
        "hellodata": null
      },
      {
        "key": "lease_terms",
        "label": "Lease Terms",
        "group": "Terms",
        "row": 132,
        "type": "text",
        "hellodata": null
      },
      {
        "key": "locator_commission",
        "label": "Locator Commission",
        "group": "Terms",
        "row": 133,
        "type": "text",
        "hellodata": null
      },
      {
        "key": "views",
        "label": "Views",
        "group": "Terms",
        "row": 134,
        "type": "text",
        "hellodata": null
      },
      {
        "key": "specials",
        "label": "Specials",
        "group": "Terms",
        "row": 135,
        "type": "text",
        "hellodata": null
      },
      {
        "key": "other_notes",
        "label": "Other Notes",
        "group": "Terms",
        "row": 136,
        "type": "text",
        "hellodata": null
      },
      {
        "key": "near_transit",
        "label": "Near Transit",
        "group": "Location",
        "row": 138,
        "type": "tri",
        "hellodata": null
      }
    ],
    "_physicalNote": "ExStay v38's copy of the same 20-field, 4-sub-group Physical vocabulary as MF — the label set was copied verbatim from MF v44 (changelog §1), so the structure is identical and only the rows differ. Resolved live out of SHIR_ExStay_Template_v38.xlsx by label, independently of MF; the constant 86-row delta between the two families is asserted afterwards as a cross-check, never used as the source. See the top-level _physicalNote for the typing rules and the pre-existing-key guarantee.",
    "amenities": [
      {
        "key": "elevators",
        "label": "Elevators",
        "group": "Building & Common",
        "row": 116,
        "type": "tri",
        "hellodata": null
      },
      {
        "key": "num_common_laundry_rms",
        "label": "# Common Laundry Rms",
        "group": "Building & Common",
        "row": 117,
        "type": "count",
        "hellodata": null
      },
      {
        "key": "24hr_fitness_room",
        "label": "24hr Fitness Room",
        "group": "Activity / Lifestyle",
        "row": 119,
        "type": "tri",
        "hellodata": null
      },
      {
        "key": "sport_court",
        "label": "Basketball Court",
        "group": "Activity / Lifestyle",
        "row": 120,
        "type": "tri",
        "hellodata": "basketball_court",
        "lossy": true,
        "note": "v44 splits the old generic 'Sport Court' three ways (Basketball Court / Volleyball / # of Tennis Courts); this key routes to Basketball Court only."
      },
      {
        "key": "clubhouse",
        "label": "Clubroom",
        "group": "Activity / Lifestyle",
        "row": 121,
        "type": "tri",
        "hellodata": "club_house_party_room"
      },
      {
        "key": "dog_park",
        "label": "Dog Park",
        "group": "Activity / Lifestyle",
        "row": 122,
        "type": "tri",
        "hellodata": "dog_park"
      },
      {
        "key": "fitness_center",
        "label": "Fitness Room / Gym",
        "group": "Activity / Lifestyle",
        "row": 123,
        "type": "tri",
        "hellodata": "fitness_center"
      },
      {
        "key": "bbq_grill",
        "label": "Grill(s)",
        "group": "Activity / Lifestyle",
        "row": 124,
        "type": "tri",
        "hellodata": "barbecue_grill"
      },
      {
        "key": "hot_tub_jacuzzi",
        "label": "Hot Tub / Jacuzzi",
        "group": "Activity / Lifestyle",
        "row": 125,
        "type": "tri",
        "hellodata": null
      },
      {
        "key": "jogging_trail",
        "label": "Jogging Trail",
        "group": "Activity / Lifestyle",
        "row": 126,
        "type": "tri",
        "hellodata": null
      },
      {
        "key": "playground",
        "label": "Playground",
        "group": "Activity / Lifestyle",
        "row": 127,
        "type": "tri",
        "hellodata": "playground"
      },
      {
        "key": "sauna",
        "label": "Sauna",
        "group": "Activity / Lifestyle",
        "row": 128,
        "type": "tri",
        "hellodata": null
      },
      {
        "key": "volleyball",
        "label": "Volleyball",
        "group": "Activity / Lifestyle",
        "row": 129,
        "type": "tri",
        "hellodata": null
      },
      {
        "key": "pool",
        "label": "# of Pools",
        "group": "Activity / Lifestyle",
        "row": 130,
        "type": "count",
        "hellodata": "swimming_pool",
        "lossy": true,
        "note": "v44 changed this from a Y/N amenity to a pool COUNT. A truthy HelloData flag writes 1 (a floor on the real count, not a reading), never 'Y'."
      },
      {
        "key": "num_of_tennis_courts",
        "label": "# of Tennis Courts",
        "group": "Activity / Lifestyle",
        "row": 131,
        "type": "count",
        "hellodata": null
      },
      {
        "key": "assigned_parking",
        "label": "Assigned Parking",
        "group": "Parking",
        "row": 133,
        "type": "tri",
        "hellodata": null
      },
      {
        "key": "attached_garages",
        "label": "Attached Garages",
        "group": "Parking",
        "row": 134,
        "type": "tri",
        "hellodata": null
      },
      {
        "key": "community_parking_garage",
        "label": "Community Parking Garage",
        "group": "Parking",
        "row": 135,
        "type": "tri",
        "hellodata": null
      },
      {
        "key": "covered_parking",
        "label": "Covered Parking",
        "group": "Parking",
        "row": 136,
        "type": "tri",
        "hellodata": null
      },
      {
        "key": "detached_garages",
        "label": "Detached Garages",
        "group": "Parking",
        "row": 137,
        "type": "tri",
        "hellodata": null
      },
      {
        "key": "ev_charging_stations",
        "label": "EV Charging Stations",
        "group": "Parking",
        "row": 138,
        "type": "tri",
        "hellodata": null
      },
      {
        "key": "extra_storage",
        "label": "Extra Storage",
        "group": "Floorplan",
        "row": 140,
        "type": "tri",
        "hellodata": null
      },
      {
        "key": "fireplaces",
        "label": "Fireplaces",
        "group": "Floorplan",
        "row": 141,
        "type": "tri",
        "hellodata": null
      },
      {
        "key": "hardwood_floors",
        "label": "Hardwood Floors",
        "group": "Floorplan",
        "row": 142,
        "type": "tri",
        "hellodata": null
      },
      {
        "key": "high_ceilings",
        "label": "High Ceilings",
        "group": "Floorplan",
        "row": 143,
        "type": "tri",
        "hellodata": null
      },
      {
        "key": "patio_balcony",
        "label": "Patio / Balcony",
        "group": "Floorplan",
        "row": 144,
        "type": "tri",
        "hellodata": null
      },
      {
        "key": "private_yards",
        "label": "Private Yards",
        "group": "Floorplan",
        "row": 145,
        "type": "tri",
        "hellodata": null
      },
      {
        "key": "w_d_connections",
        "label": "W/D Connections",
        "group": "Floorplan",
        "row": 146,
        "type": "tri",
        "hellodata": null
      },
      {
        "key": "w_d_provided",
        "label": "W/D Provided",
        "group": "Floorplan",
        "row": 147,
        "type": "tri",
        "hellodata": null
      },
      {
        "key": "walk_in_closets",
        "label": "Walk-in Closets",
        "group": "Floorplan",
        "row": 148,
        "type": "tri",
        "hellodata": null
      },
      {
        "key": "dishwashers",
        "label": "Dishwashers",
        "group": "Kitchen / Bath",
        "row": 150,
        "type": "tri",
        "hellodata": null
      },
      {
        "key": "granite_stone_countertops",
        "label": "Granite / Stone Countertops",
        "group": "Kitchen / Bath",
        "row": 151,
        "type": "tri",
        "hellodata": null
      },
      {
        "key": "pantry",
        "label": "Pantry",
        "group": "Kitchen / Bath",
        "row": 152,
        "type": "tri",
        "hellodata": null
      },
      {
        "key": "stainless_steel_appliances",
        "label": "Stainless Steel Appliances",
        "group": "Kitchen / Bath",
        "row": 153,
        "type": "tri",
        "hellodata": null
      },
      {
        "key": "walk_in_showers",
        "label": "Walk-in Showers",
        "group": "Kitchen / Bath",
        "row": 154,
        "type": "tri",
        "hellodata": null
      },
      {
        "key": "business_center",
        "label": "Business Center",
        "group": "Services",
        "row": 156,
        "type": "tri",
        "hellodata": "business_center"
      },
      {
        "key": "corporate_units",
        "label": "Corporate Units",
        "group": "Services",
        "row": 157,
        "type": "tri",
        "hellodata": null
      },
      {
        "key": "doorman",
        "label": "Doorman",
        "group": "Services",
        "row": 158,
        "type": "tri",
        "hellodata": null
      },
      {
        "key": "package_delivery",
        "label": "Package Delivery",
        "group": "Services",
        "row": 159,
        "type": "tri",
        "hellodata": null
      },
      {
        "key": "valet_trash",
        "label": "Valet Trash",
        "group": "Services",
        "row": 160,
        "type": "tri",
        "hellodata": null
      },
      {
        "key": "recycling",
        "label": "Recycling",
        "group": "Services",
        "row": 161,
        "type": "tri",
        "hellodata": null
      },
      {
        "key": "all_bills_paid",
        "label": "All Bills Paid",
        "group": "Utilities",
        "row": 163,
        "type": "tri",
        "hellodata": null
      },
      {
        "key": "commercial_electric",
        "label": "Commercial Electric",
        "group": "Utilities",
        "row": 164,
        "type": "tri",
        "hellodata": null
      },
      {
        "key": "insurance_required",
        "label": "Insurance Required",
        "group": "Utilities",
        "row": 165,
        "type": "tri",
        "hellodata": null
      },
      {
        "key": "tenant_trash",
        "label": "Tenant Trash",
        "group": "Property Allocated Expenses",
        "row": 167,
        "type": "alloc",
        "options": [
          "To Property",
          "To City/Utility"
        ],
        "hellodata": null
      },
      {
        "key": "tenant_water",
        "label": "Tenant Water",
        "group": "Property Allocated Expenses",
        "row": 168,
        "type": "alloc",
        "options": [
          "To Property",
          "To City/Utility"
        ],
        "hellodata": null
      },
      {
        "key": "tenant_gas",
        "label": "Tenant Gas",
        "group": "Property Allocated Expenses",
        "row": 169,
        "type": "alloc",
        "options": [
          "To Property",
          "To City/Utility"
        ],
        "hellodata": null
      },
      {
        "key": "tenant_electric",
        "label": "Tenant Electric",
        "group": "Property Allocated Expenses",
        "row": 170,
        "type": "alloc",
        "options": [
          "To Property",
          "To City/Utility"
        ],
        "hellodata": null
      },
      {
        "key": "tenant_cable",
        "label": "Tenant Cable",
        "group": "Property Allocated Expenses",
        "row": 171,
        "type": "alloc",
        "options": [
          "To Property",
          "To City/Utility"
        ],
        "hellodata": null
      },
      {
        "key": "fiber_optic_cable",
        "label": "Fiber Optic Cable",
        "group": "Internet / Broadband",
        "row": 173,
        "type": "tri",
        "hellodata": null
      },
      {
        "key": "satellite",
        "label": "Satellite",
        "group": "Internet / Broadband",
        "row": 174,
        "type": "tri",
        "hellodata": null
      },
      {
        "key": "gated",
        "label": "Access Gates (Driving)",
        "group": "Security",
        "row": 176,
        "type": "tri",
        "hellodata": "gated_community_access"
      },
      {
        "key": "alarm_systems",
        "label": "Alarm Systems",
        "group": "Security",
        "row": 177,
        "type": "tri",
        "hellodata": null
      },
      {
        "key": "courtesy_patrol",
        "label": "Courtesy Patrol",
        "group": "Security",
        "row": 178,
        "type": "tri",
        "hellodata": null
      },
      {
        "key": "limited_building_access",
        "label": "Limited Building Access",
        "group": "Security",
        "row": 179,
        "type": "tri",
        "hellodata": null
      },
      {
        "key": "video_surveillance",
        "label": "Video Surveillance",
        "group": "Security",
        "row": 180,
        "type": "tri",
        "hellodata": null
      },
      {
        "key": "pets_accepted",
        "label": "Pets Accepted",
        "group": "Pets",
        "row": 182,
        "type": "tri",
        "hellodata": null
      },
      {
        "key": "large_pets",
        "label": "Large Pets",
        "group": "Pets",
        "row": 183,
        "type": "tri",
        "hellodata": null
      },
      {
        "key": "pets_policy",
        "label": "Pets Policy",
        "group": "Pets",
        "row": 184,
        "type": "text",
        "hellodata": null
      }
    ],
    "_amenitiesNote": "ExStay v38's copy of the same 59-field, 11-sub-group Amenity vocabulary as MF, resolved live out of SHIR_ExStay_Template_v38.xlsx by label and cross-checked against MF's rows for the constant 86-row delta. See the top-level _amenitiesNote.",
    "pasteMap": {
      "sheetName": "COMPS_PASTE",
      "dashSheetName": "DASH_PASTE",
      "minRow": 3,
      "regions": [
        {
          "key": "comps",
          "name": "PASTE_COMPS",
          "sheet": "COMPS_PASTE",
          "range": "$Y$3:$DJ$184",
          "anchor": "Y3",
          "default": true,
          "label": "All 8 comps — names, row 4, unit rows, type/source, attributes, fees"
        },
        {
          "key": "subject",
          "name": "PASTE_SUBJECT",
          "sheet": "COMPS_PASTE",
          "range": "$B$3:$H$184",
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
      "_neverWriteNote": "Same shape as MF's pasteMap._neverWriteNote — row 2 is a live column-index chain, unit-row offsets 0/5/6/7 and every subtotal/rowTotals row is a formula, subject side only E4/G4/H4 and G6:G75 are inputs. Row bound is $DJ$184 here (amenRowLast, the tallest ExStay band) instead of MF's $DJ$269 — the same 'widen to the tallest band' rule, just a shorter tallest band.",
      "_dashNote": "DASH!E5:E9 typed constants and the E10/E18/N5 formula wiring are unchanged between families — confirmed by row 4 on COMPS itself (=DASH!E9, =DASH!E10, =DASH!N5 all present and live on SHIR_ExStay_Template_v38.xlsx, same as MF)."
    }
  }
};
