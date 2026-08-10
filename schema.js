// GENERATED FILE — do not edit by hand.
// Source: Accessories/comps_schema.json
// Rebuild: python Accessories/build_schema.py
window.SCHEMA = {
  "compsTab": {
    "_versionNote": "Bumped v7 -> v8 on 2026-08-08. The COMPS GEOMETRY is identical in v7 and v8 — every row, column, offset and section below is unchanged, and the schema verifies 67/67 against both. What changed in v8 is only what the FEES label cells CONTAIN (they became dropdowns, and five of the eight v7 labels were dropped), which is why fees are routed by `compsLabel` and never by row. `populatorScript` moved to v36 in the same pass: v35 and earlier build their fee map positionally and silently mislabel fees on a v8 workbook, and this string is the command the Export tab tells the analyst to run. Moved again to v37 on 2026-08-10, and that floor is data-bearing rather than cosmetic: export.js emits a `subject_market_rents_by_plan` block and resolves subject column G BY PLAN LABEL, and only v37 consumes it. v36 runs to completion without error on the same payload and silently falls back to bucket-level figures for column G — the per-plan market rents are simply lost, with nothing in the output to say so. Which is the reason this string has to lead the populator and never trail it: a stale hint here is not a wrong version number, it is a silent data loss the analyst cannot see.",
    "_v9Note": "Bumped v8 -> v9 on 2026-08-10, and this one really is only a stamp. SHIR_MF_Template_v9's entire delta is 274 cells inside COMPS!R3:W76 — a lease-recency window on the INTERNAL comps block (new T4 move-in-after / W4 lookback controls). The comp grid was re-read out of the shipped v9 file for the paste export and is byte-for-byte the v7/v8 geometry: all TEN slots verified identical at row 5 and at row-4 number formats, unit sections still 9 rows, attribute + fee band still 79-87. Nothing downstream changes; populate_comps does not read this string at all, and the app's own geometry asserts pass unchanged.",
    "templateVersion": "SHIR_MF_Template_v9",
    "populatorScript": "rent-comp-data-populator-populate_comps-v37.py",
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
    "reservedSlotNote": "The v7 COMPS tab has ten comp slots (through DB), but slots 9-10 (CS, DB) are deliberately never populated: populate_comps v34/v35 read their pristine offset-0 columns as the reference for restoring unit line-# serials a pre-v34 run clobbered. Filling them destroys that reference, so maxComps stays 8.",
    "rowHeader": 3,
    "rowDetails": 4,
    "rowColHeaders": 5,
    "rowTotals": 76,
    "rowCompType": 77,
    "rowAttrHeader": 78,
    "attrRowFirst": 79,
    "attrRowLast": 87,
    "feeRowFirst": 79,
    "feeRowLast": 86,
    "feeSumLastRow": 87,
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
    }
  },
  "_pasteMapNote": "The paste-ready export (paste-export.js) mirrors the COMPS tab positionally and is pasted back with Paste Special -> Values -> [x] Skip blanks, so a cell we leave EMPTY is a cell the paste cannot touch. This block is the list of cells it is allowed to fill; everything else on the tab is a formula, a template-owned serial, or a subtotal. Read out of SHIR_MF_Template_v9.xlsx on 2026-08-10, all ten slots verified. Three facts this depends on: (1) COMPS row 2 is a LIVE column-index chain (A2=1, B2=A2+1, ...) so nothing may ever anchor above row 3; (2) rows 3-87 hold exactly two merged ranges, J3:P3 and R3:S3, and Y3:DJ87 has NONE, which is what lets the whole comp grid go across as one rectangle; (3) unit-row offsets 1-4 are contiguous inputs while 0 (line serial) and 5-7 (Ask $/SF, Eff. $/Mo, Eff. $/SF) are not. Offsets are named, never numbered, so a template that moves one is caught by build_schema.py rather than by a wrong number in a model.",
  "pasteMap": {
    "sheetName": "COMPS_PASTE",
    "dashSheetName": "DASH_PASTE",
    "minRow": 3,
    "regions": [
      {
        "key": "comps",
        "name": "PASTE_COMPS",
        "sheet": "COMPS_PASTE",
        "range": "$Y$3:$DJ$87",
        "anchor": "Y3",
        "default": true,
        "label": "All 8 comps — names, row 4, unit rows, type/source, attributes, fees"
      },
      {
        "key": "subject",
        "name": "PASTE_SUBJECT",
        "sheet": "COMPS_PASTE",
        "range": "$B$3:$H$87",
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
    "_neverWriteNote": "Asserted in build_schema.py against compsTab.offsets rather than restated as numbers: row 4 offsets totalUnits (=Z76) and concessionPct are formulas; unit-row offsets unitRowNum, unitAskPsf, unitEffRent and unitEffPsf are the template's serial and its three derived columns; every offset of every subtotal row and of rowTotals is a formula. Subject side, only E4/G4/H4 and G6:G75 are inputs — B is an array formula and C/D/F/H are formulas.",
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
    "_dashNote": "DASH!E5:E9 are typed constants in v9. E10 (units) is =IF(OR(RR!E365=\"\",RR!E365=0),1,RR!E365) and E18 (occupancy) is =RR!J355 — both formulas, both inside no paste range, and both additionally protected by skip-blanks. Basics!C3:D11 mirrors all of this off DASH, so DASH is the only place to write."
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
  "physical": [
    {
      "key": "hvac_indiv",
      "label": "HVAC Indiv.",
      "row": 79,
      "hellodata": "central_air_conditioning"
    },
    {
      "key": "wd_inunit",
      "label": "W/D In-Unit",
      "row": 80,
      "hellodata": "washer_dryer_in_unit"
    },
    {
      "key": "wd_hookups",
      "label": "W/D Hookups",
      "row": 81,
      "hellodata": "washer_dryer_hookups"
    },
    {
      "key": "water_util",
      "label": "Water Util.",
      "row": 82,
      "hellodata": null
    },
    {
      "key": "gas_util",
      "label": "Gas Util.",
      "row": 83,
      "hellodata": null
    },
    {
      "key": "elec_util",
      "label": "Elec. Util.",
      "row": 84,
      "hellodata": null
    },
    {
      "key": "roof_type",
      "label": "Roof Type",
      "row": 85,
      "hellodata": null
    },
    {
      "key": "priv_yards",
      "label": "Priv. Yards",
      "row": 86,
      "hellodata": "patio_or_balcony"
    },
    {
      "key": "indiv_hwh",
      "label": "Indiv. HWH",
      "row": 87,
      "hellodata": null
    }
  ],
  "amenities": [
    {
      "key": "fitness_center",
      "label": "Fitness Center",
      "row": 79,
      "hellodata": "fitness_center"
    },
    {
      "key": "clubhouse",
      "label": "Clubhouse",
      "row": 80,
      "hellodata": "club_house_party_room"
    },
    {
      "key": "business_center",
      "label": "Business Center",
      "row": 81,
      "hellodata": "business_center"
    },
    {
      "key": "pool",
      "label": "Pool",
      "row": 82,
      "hellodata": "swimming_pool"
    },
    {
      "key": "dog_park",
      "label": "Dog Park",
      "row": 83,
      "hellodata": "dog_park"
    },
    {
      "key": "bbq_grill",
      "label": "BBQ/Grill Area",
      "row": 84,
      "hellodata": "barbecue_grill"
    },
    {
      "key": "gated",
      "label": "Gated Access",
      "row": 85,
      "hellodata": "gated_community_access"
    },
    {
      "key": "sport_court",
      "label": "Sport Court",
      "row": 86,
      "hellodata": "basketball_court"
    },
    {
      "key": "playground",
      "label": "Playground",
      "row": 87,
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
      "note": "One-time concession, row 4 offset 4. Feeds the R111:W123 roll-up and the Suggested Subject Concession."
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
      "note": "Tracker-only — v7 has no per-comp reno cell (offset 7 is the utility structure)."
    }
  ],
  "_feeVocabularyNote": "The 12 options template v8 put in the FEES label dropdowns, identical in the MF and ExStay families. Validation constrains humans typing, NOT programmatic writes — openpyxl and COM can still put any string in those cells — so anything reading or writing the fee band must know this list separately. `Storm water admin` is the corrected spelling; the audit sheet was marked KEEP on the misspelling `Storm watet admin`, which survives on exactly one live cell (Lantern COMPS!BX84) and no longer validates.",
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
  "_feesNote": "A fee's COMPS identity is its LABEL, never its row. `compsLabel` is the text that must appear in a comp block's FEES label column (offset 6) for that fee's value to be written at offset 7. Template v7 pre-printed 8 labels at rows 79-86; v8 (2026-08-07) made those cells DROPDOWNS, kept only Amenity / Cable-Internet / Cleaning pre-selected, and dropped Insurance / Pest / Parking / Utilities / W-D from the list entirely. So the row a label sits on differs by template version AND by comp — analysts free-type, and one live deal (Lantern) has `V Trash` on comp 2 row 86 while comp 1 still has the v7 defaults on the same rows. Anything keyed to a row number mislabels silently, and the fee column is summed into every unit's Eff. $/Mo. Keys with no compsLabel are tracker-only: one-time or optional charges with no cell in the template.",
  "fees": [
    {
      "key": "amenity",
      "label": "Amenity",
      "type": "number",
      "compsLabel": "Amenity",
      "row": "tfee1"
    },
    {
      "key": "insurance",
      "label": "Insurance",
      "type": "number",
      "compsLabel": "Insurance",
      "row": "tfee1"
    },
    {
      "key": "pest",
      "label": "Pest",
      "type": "number",
      "compsLabel": "Pest",
      "row": "tfee2"
    },
    {
      "key": "parking",
      "label": "Parking",
      "type": "number",
      "compsLabel": "Parking",
      "row": "tfee2"
    },
    {
      "key": "cleaning",
      "label": "Cleaning",
      "type": "number",
      "compsLabel": "Cleaning",
      "row": "tfee3"
    },
    {
      "key": "cable_internet",
      "label": "Cable/Internet",
      "type": "number",
      "compsLabel": "Cable/Internet",
      "row": "tfee3"
    },
    {
      "key": "utilities",
      "label": "Utilities",
      "type": "number",
      "compsLabel": "Utilities",
      "row": "tfee4"
    },
    {
      "key": "wd",
      "label": "W/D",
      "type": "number",
      "compsLabel": "W/D",
      "row": "tfee4"
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
