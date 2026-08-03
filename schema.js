// GENERATED FILE — do not edit by hand.
// Source: Accessories/comps_schema.json
// Rebuild: python Accessories/build_schema.py
window.SCHEMA = {
  "compsTab": {
    "templateVersion": "SHIR_MF_Template_v3",
    "populatorScript": "rent-comp-data-populator-populate_comps-v30.py",
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
    "rowHeader": 3,
    "rowDetails": 4,
    "rowColHeaders": 5,
    "rowTotals": 86,
    "rowCompType": 87,
    "rowAttrHeader": 88,
    "attrRowFirst": 89,
    "attrRowLast": 97,
    "feeRowFirst": 89,
    "feeRowLast": 96,
    "subjectMktRentCol": 7,
    "subjectUnitCountCol": 3,
    "offsets": {
      "compNum": 0,
      "compName": 1,
      "compAddress": 7,
      "yearBuilt": 0,
      "totalUnits": 1,
      "stories": 2,
      "distanceMiles": 3,
      "wdType": 4,
      "renoLevel": 5,
      "unitRowNum": 0,
      "unitCount": 1,
      "unitSf": 2,
      "unitOccPct": 3,
      "unitAskRent": 4,
      "unitAskPsf": 5,
      "unitEffRent": 6,
      "unitEffPsf": 7,
      "compTypeValue": 2,
      "compSourceValue": 4,
      "physicalValue": 2,
      "amenityValue": 5,
      "feeLabel": 6,
      "feeValue": 7
    }
  },
  "unitBuckets": [
    {
      "key": "efficiency",
      "label": "Efficiency / Studio",
      "short": "Eff",
      "compsLabel": "+Eff",
      "startRow": 6,
      "endRow": 15,
      "subtotalRow": 16,
      "beds": 0,
      "baths": 1
    },
    {
      "key": "1br1ba",
      "label": "1BR / 1BA",
      "short": "1x1",
      "compsLabel": "+1/1(.5)",
      "startRow": 17,
      "endRow": 26,
      "subtotalRow": 27,
      "beds": 1,
      "baths": 1
    },
    {
      "key": "2br1ba",
      "label": "2BR / 1BA",
      "short": "2x1",
      "compsLabel": "+2x1(.5)",
      "startRow": 28,
      "endRow": 37,
      "subtotalRow": 38,
      "beds": 2,
      "baths": 1
    },
    {
      "key": "2br2ba",
      "label": "2BR / 2BA",
      "short": "2x2",
      "compsLabel": "+2x2(.5)",
      "startRow": 39,
      "endRow": 49,
      "subtotalRow": 50,
      "beds": 2,
      "baths": 2
    },
    {
      "key": "3br1ba",
      "label": "3BR / 1BA",
      "short": "3x1",
      "compsLabel": "+3/1(.5)",
      "startRow": 51,
      "endRow": 61,
      "subtotalRow": 62,
      "beds": 3,
      "baths": 1
    },
    {
      "key": "3br2ba",
      "label": "3BR / 2BA",
      "short": "3x2",
      "compsLabel": "+3/2(.5)",
      "startRow": 63,
      "endRow": 72,
      "subtotalRow": 73,
      "beds": 3,
      "baths": 2
    },
    {
      "key": "4br2ba",
      "label": "4BR / 2BA",
      "short": "4x2",
      "compsLabel": "+4/2(.5)",
      "startRow": 74,
      "endRow": 84,
      "subtotalRow": 85,
      "beds": 4,
      "baths": 2
    }
  ],
  "physical": [
    {
      "key": "hvac_indiv",
      "label": "HVAC Indiv.",
      "row": 89,
      "hellodata": "central_air_conditioning"
    },
    {
      "key": "wd_inunit",
      "label": "W/D In-Unit",
      "row": 90,
      "hellodata": "washer_dryer_in_unit"
    },
    {
      "key": "wd_hookups",
      "label": "W/D Hookups",
      "row": 91,
      "hellodata": "washer_dryer_hookups"
    },
    {
      "key": "water_util",
      "label": "Water Util.",
      "row": 92,
      "hellodata": null
    },
    {
      "key": "gas_util",
      "label": "Gas Util.",
      "row": 93,
      "hellodata": null
    },
    {
      "key": "elec_util",
      "label": "Elec. Util.",
      "row": 94,
      "hellodata": null
    },
    {
      "key": "roof_type",
      "label": "Roof Type",
      "row": 95,
      "hellodata": null
    },
    {
      "key": "priv_yards",
      "label": "Priv. Yards",
      "row": 96,
      "hellodata": "patio_or_balcony"
    },
    {
      "key": "indiv_hwh",
      "label": "Indiv. HWH",
      "row": 97,
      "hellodata": null
    }
  ],
  "amenities": [
    {
      "key": "fitness_center",
      "label": "Fitness Center",
      "row": 89,
      "hellodata": "fitness_center"
    },
    {
      "key": "clubhouse",
      "label": "Clubhouse",
      "row": 90,
      "hellodata": "club_house_party_room"
    },
    {
      "key": "business_center",
      "label": "Business Center",
      "row": 91,
      "hellodata": "business_center"
    },
    {
      "key": "pool",
      "label": "Pool",
      "row": 92,
      "hellodata": "swimming_pool"
    },
    {
      "key": "dog_park",
      "label": "Dog Park",
      "row": 93,
      "hellodata": "dog_park"
    },
    {
      "key": "bbq_grill",
      "label": "BBQ/Grill Area",
      "row": 94,
      "hellodata": "barbecue_grill"
    },
    {
      "key": "gated",
      "label": "Gated Access",
      "row": 95,
      "hellodata": "gated_community_access"
    },
    {
      "key": "sport_court",
      "label": "Sport Court",
      "row": 96,
      "hellodata": "basketball_court"
    },
    {
      "key": "playground",
      "label": "Playground",
      "row": 97,
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
    "W/D IU",
    "W/D Conn",
    "Comm. Laundry",
    "None"
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
      "key": "msa",
      "label": "MSA / Submarket",
      "type": "text"
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
      "row": "occwd"
    },
    {
      "key": "wd_type",
      "label": "W/D Type",
      "type": "select",
      "options_ref": "wdTypes",
      "row": "occwd"
    },
    {
      "key": "reno_level",
      "label": "Reno Level",
      "type": "select",
      "options_ref": "renoLevels",
      "row": "occwd"
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
      "key": "distance_miles",
      "label": "Distance (mi)",
      "type": "number",
      "step": "0.01",
      "row": "distocc"
    },
    {
      "key": "occupancy_pct",
      "label": "Occupancy %",
      "type": "number",
      "row": "distocc"
    },
    {
      "key": "wd_type",
      "label": "W/D Type",
      "type": "select",
      "options_ref": "wdTypes",
      "row": "wdreno"
    },
    {
      "key": "reno_level",
      "label": "Reno Level",
      "type": "select",
      "options_ref": "renoLevels",
      "row": "wdreno"
    },
    {
      "key": "source",
      "label": "Comp Source",
      "type": "select",
      "options_ref": "sources"
    },
    {
      "key": "hellodata_id",
      "label": "HelloData ID",
      "type": "text"
    },
    {
      "key": "phone",
      "label": "Leasing Phone",
      "type": "tel",
      "row": "contact"
    },
    {
      "key": "contact_name",
      "label": "Contact",
      "type": "text",
      "row": "contact"
    },
    {
      "key": "website",
      "label": "Website",
      "type": "url"
    },
    {
      "key": "notes",
      "label": "Notes",
      "type": "textarea"
    }
  ],
  "fees": [
    {
      "key": "amenity",
      "label": "Amenity / Mo",
      "type": "number",
      "compsRow": 89,
      "row": "tfee1"
    },
    {
      "key": "insurance",
      "label": "Insurance / Mo",
      "type": "number",
      "compsRow": 90,
      "row": "tfee1"
    },
    {
      "key": "pest",
      "label": "Pest / Mo",
      "type": "number",
      "compsRow": 91,
      "row": "tfee2"
    },
    {
      "key": "parking",
      "label": "Parking / Mo",
      "type": "number",
      "compsRow": 92,
      "row": "tfee2"
    },
    {
      "key": "cleaning",
      "label": "Cleaning / Mo",
      "type": "number",
      "compsRow": 93,
      "row": "tfee3"
    },
    {
      "key": "cable_internet",
      "label": "Cable/Internet / Mo",
      "type": "number",
      "compsRow": 94,
      "row": "tfee3"
    },
    {
      "key": "utilities",
      "label": "Utilities / Mo",
      "type": "number",
      "compsRow": 95,
      "row": "tfee4"
    },
    {
      "key": "wd",
      "label": "W/D / Mo",
      "type": "number",
      "compsRow": 96,
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
      "type": "number"
    },
    {
      "key": "valet_trash",
      "label": "Valet Trash / Mo",
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
