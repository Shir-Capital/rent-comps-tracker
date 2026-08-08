/* ============================================================================
 * proforma-import.js — pull the subject + comps back OUT of a deal's proforma.
 *
 * The export path writes a populator payload; this is the other direction. It
 * reads the COMPS tab of a workbook in the deal's `2. UW-Analysis` folder and
 * offers its field items — subject basics, subject unit mix, comps (with unit
 * mixes, attributes, amenities and fees) and the column-G market rents — for
 * the analyst to accept into this subject.
 *
 * TWO RULES THIS FILE EXISTS TO KEEP:
 *
 * 1. NOTHING IS READ BY FIXED OFFSET that can be read by label or number
 *    format. Comp block starts come from the comp-number cells on row 3, each
 *    block's unit columns from its own header labels, and the row-4 band
 *    (distance / vacancy / concession / W-D / utilities) from number formats —
 *    exactly as `proforma-version-compare_extract.py` does it. The MF v7 tab
 *    strides 9 columns from Y; the ExStay v9 tab strides 7 from W and has no
 *    Eff. $ pair. A hardcoded map reads one of them as blank and the other as
 *    another comp's numbers.
 *
 * 2. NOTHING IS APPLIED WITHOUT THE USER SEEING IT FIRST. Import is a two-step
 *    flow — pick the file, then review counts and the exact subject values —
 *    and each group is opt-in. Replacing a captured comp set is destructive and
 *    is labelled as such.
 * ========================================================================= */

const PF_UW_FOLDER_RE = /^\s*2[.\s_-]*UW/i;
const PF_STATE_FILE_RE = /\.xls[xm]$/i;
const PF_EXCLUDE = ['backup', 'reconcile_report', '~$', '_working', 'template'];

/* Tier markers, same vocabulary as the proforma-version-compare skill. A
   keyword may be followed by a CONTENT token — `AcqRevCOMPS_v6` is the Acq Team
   build that happens to be comps-populated, not an unclassifiable file.
   Written without lookbehind so it runs on older iOS Safari. */
const PF_CONTENT = '(?:comps|comp|capex|unitmix|umix|mix|rr|t12|uw)?';
function pfMarker(kw) {
  return new RegExp('(?:^|[^A-Za-z])(?:' + kw + ')' + PF_CONTENT + '(?![A-Za-z])', 'i');
}
const PF_MARKERS = [
  [/(?:^|[^A-Za-z])Acq[ _-]?Team(?![A-Za-z])/i, 'Junior'],
  [pfMarker('ICFinal|IC|Final|Team'), 'ICFinal'],
  [pfMarker('AM(?:Rev)?'), 'AM'],
  // Deliberately only the canonical spelling. A misspelling like `HOAAcq_v5`
  // (live on Havenwood) lands in the untiered list with the rename hint rather
  // than being quietly promoted above a correctly-named Acq Team build — same
  // rule the proforma-version-compare skill follows, so both agree on the pick.
  [pfMarker('HOAcq(?:Rev)?'), 'Senior'],
  [pfMarker('Acq(?:Rev)?'), 'Junior'],
];
const PF_INIT_UW = /(?:^|[^A-Za-z])Init[ _-]?UW(?![A-Za-z])/i;

/* Highest-priority acquisition file first — the Asana `PF Version` ladder:
   Init UW (AI) → Acq Team → H of Acq → Asset Mgmt → Owner IC / Final. */
const PF_TIER_RANK = { ICFinal: 5, AM: 4, Senior: 3, Junior: 2, InitUW: 1, '': 0 };
const PF_TIER_LABEL = {
  ICFinal: 'IC / Final', AM: 'Asset Mgmt', Senior: 'Head of Acq',
  Junior: 'Acq Team', InitUW: 'Init UW', '': 'no tier marker',
};

let PF = { step: 'idle', busy: '', files: [], pickId: '', parsed: null, error: '', confirmReplace: '' };

function pfResetImport() {
  PF = { step: 'idle', busy: '', files: [], pickId: '', parsed: null, error: '', confirmReplace: '' };
}

// ---------------------------------------------------------------- discovery

function pfClassify(name) {
  for (const [rx, tier] of PF_MARKERS) if (rx.test(name)) return tier;
  if (PF_INIT_UW.test(name)) return 'InitUW';
  return '';
}

/** Trailing version as a sortable pair. `v5.10` must sort ABOVE `v5.2`. */
function pfVersion(name) {
  const m = /v(\d+)(?:[_.](\d+))?(?!\d)/i.exec(name || '');
  return m ? [parseInt(m[1], 10), m[2] ? parseInt(m[2], 10) : 0] : [0, 0];
}

function pfCmp(a, b) {
  const t = PF_TIER_RANK[b.tier] - PF_TIER_RANK[a.tier];
  if (t) return t;
  if (b.version[0] !== a.version[0]) return b.version[0] - a.version[0];
  if (b.version[1] !== a.version[1]) return b.version[1] - a.version[1];
  return String(b.modifiedTime || '').localeCompare(String(a.modifiedTime || ''));
}

/**
 * Every .xlsx in `2. UW-Analysis` and its immediate subfolders (Archive
 * included — a file being archived mid-review should not change which build is
 * the newest), classified and ranked.
 */
async function pfFindCandidates(dealFolderId) {
  const subs = await listSubfolders(dealFolderId);
  const uw = subs.find(f => PF_UW_FOLDER_RE.test(f.name));
  if (!uw) throw new Error('This deal folder has no "2. UW-Analysis" subfolder');

  const folders = [{ id: uw.id, sub: '' }];
  for (const s of await listSubfolders(uw.id)) folders.push({ id: s.id, sub: s.name });

  const out = [];
  for (const f of folders) {
    for (const file of await listFiles(f.id)) {
      if (!PF_STATE_FILE_RE.test(file.name)) continue;
      const low = file.name.toLowerCase();
      if (PF_EXCLUDE.some(t => low.includes(t))) continue;
      out.push({
        id: file.id, name: file.name, sub: f.sub,
        modifiedTime: file.modifiedTime, size: Number(file.size || 0),
        tier: pfClassify(file.name), version: pfVersion(file.name),
      });
    }
  }
  out.sort(pfCmp);
  return out;
}

// ------------------------------------------------------- workbook plumbing

function pfC(ws, r, c) { return ws[XLSX.utils.encode_cell({ r: r - 1, c: c - 1 })]; }
function pfV(ws, r, c) { const x = pfC(ws, r, c); return x ? x.v : undefined; }
function pfF(ws, r, c) { const x = pfC(ws, r, c); return (x && x.z) || ''; }
function pfN(v) { return typeof v === 'number' && isFinite(v) ? v : null; }
function pfS(v) { return typeof v === 'string' ? v.trim() : ''; }

function pfRange(ws) {
  const r = XLSX.utils.decode_range(ws['!ref'] || 'A1:A1');
  return { maxRow: r.e.r + 1, maxCol: r.e.c + 1 };
}

const PF_FMT_MI = /"\s*Mi/i;
const PF_FMT_VAC = /Vac/i;
const PF_FMT_CONC_AMT = /Conc.*\$/i;
const PF_FMT_CONC_PCT = /Conc(?!.*\$)/i;
const pfWdLike = v => typeof v === 'string' && v.toLowerCase().includes('w/d');
const pfUtilLike = v => typeof v === 'string' && !pfWdLike(v)
  && /^[WGE+]+\s*-\s*[A-Za-z]+$/.test(v.trim());

/**
 * `{field: column}` for one row-4 header band, classified by number format and
 * value shape rather than position. v3 put W/D and Utilities at +4/+5; v4
 * inserted the concession pair there and pushed them to +6/+7. Reading a v4
 * band at v3 offsets files concession dollars as the Washer/Dryer type.
 */
function pfBandCols(ws, row, base, span) {
  const cols = {};
  for (let off = 2; off <= span; off++) {
    const col = base + off;
    const v = pfV(ws, row, col);
    if (v === undefined || v === '') continue;
    const fmt = pfF(ws, row, col);
    if (pfWdLike(v)) { if (!cols.wd) cols.wd = col; }
    else if (pfUtilLike(v)) { if (!cols.util) cols.util = col; }
    else if (PF_FMT_MI.test(fmt)) { if (!cols.distance_mi) cols.distance_mi = col; }
    else if (PF_FMT_CONC_AMT.test(fmt)) { if (!cols.conc_amt) cols.conc_amt = col; }
    else if (PF_FMT_CONC_PCT.test(fmt)) { if (!cols.conc_pct) cols.conc_pct = col; }
    else if (PF_FMT_VAC.test(fmt)) { if (!cols.vacancy) cols.vacancy = col; }
  }
  return cols;
}

function pfBandFields(ws, row, base, span) {
  const cols = pfBandCols(ws, row, base, span);
  const out = { distance_mi: null, vacancy: null, conc_amt: null, conc_pct: null, wd: null, util: null };
  Object.keys(cols).forEach(k => {
    const v = pfV(ws, row, cols[k]);
    out[k] = (k === 'wd' || k === 'util') ? pfS(v) : pfN(v);
  });
  return out;
}

/** '+1/1(.5)' -> [1,1] · '+2x2(.5)' -> [2,2] · '+Eff' -> [0,1] */
function pfBandLabel(label) {
  if (typeof label !== 'string') return null;
  const txt = label.trim().replace(/^\+/, '').replace(/\(.*?\)/g, '').trim();
  if (!txt) return null;
  if (/^eff/i.test(txt)) return [0, 1];
  const nums = txt.match(/\d+(?:\.\d+)?/g) || [];
  if (nums.length >= 2) return [parseFloat(nums[0]), parseFloat(nums[1])];
  if (nums.length === 1) return [parseFloat(nums[0]), 1];
  return null;
}

/** 'A1-1B1B-C' -> [1,1] · 'A3-1B1.5B-S' -> [1,1.5] */
function pfPlanBedBath(name) {
  const m = /(\d+(?:\.\d+)?)\s*B\s*(\d+(?:\.\d+)?)\s*B/i.exec(String(name || ''));
  return m ? [parseFloat(m[1]), parseFloat(m[2])] : null;
}

/** Leading number out of a text cell. '1(.5)' -> 1 · 'Eff' -> 0 · '' -> null. */
function pfNumLead(v) {
  if (typeof v === 'number') return isFinite(v) ? v : null;
  const s = pfS(v);
  if (!s) return null;
  if (/^(eff|studio|std)/i.test(s)) return 0;
  const m = s.match(/-?\d+(?:\.\d+)?/);
  return m ? parseFloat(m[0]) : null;
}

// ---------------------------------------------------------- the DASH reader
//
// DASH is the authority on the property's identity, and the COMPS tab simply has
// nowhere to hold most of it — street address, city/state/zip and the market are
// on DASH only. It is also the authority on the UNIT COUNT: `COMPS!C4` is
// supposed to be `=DASH!E10`, but on a workbook old enough it is a hardcoded
// number that no longer tracks. Miramar's Init UW v2 carries 272 there against
// DASH's real 143 — reconciling the imported mix against that cell would report
// a 129-unit shortfall that does not exist.
//
// Every field is found by its LABEL in the label column, then the first non-empty
// cell to its right. Row numbers move between template versions; these labels
// have not.

const PF_DASH_FIELDS = [
  ['name', /^name$/i],
  ['address', /^address$/i],
  ['citystatezip', /^city\s*,?\s*st\s*,?\s*zip$/i],
  ['msa', /^market$/i],
  ['year_built', /^built\s*\/\s*renovated$/i],
  ['total_units', /^number of units$/i],
  ['occupancy_pct', /^current physical occ/i],
];

/* The stock template ships prompts in these cells — 'Prop Name', 'Prop Street',
   'Prop City, ST, Zip', 'Market Name', 'Year Built'. A deal file copied from the
   template but not yet filled in still carries them, and importing them writes
   a subject called "Prop Name". */
const PF_DASH_PLACEHOLDER = /^(prop\b|market name$|year built$|address$|name$|city\s*,?\s*st\s*,?\s*zip$)/i;

function pfReadDash(ws) {
  const { maxRow, maxCol } = pfRange(ws);
  const out = {};
  const lastRow = Math.min(maxRow, 60), lastCol = Math.min(maxCol, 12);
  for (let r = 1; r <= lastRow; r++) {
    for (let c = 1; c <= lastCol; c++) {
      const lbl = pfS(pfV(ws, r, c));
      if (!lbl) continue;
      const hit = PF_DASH_FIELDS.find(([k, rx]) => rx.test(lbl) && out[k] === undefined);
      if (!hit) continue;
      for (let vc = c + 1; vc <= lastCol; vc++) {
        const v = pfV(ws, r, vc);
        if (v === undefined || v === '') continue;
        if (typeof v === 'string' && PF_DASH_PLACEHOLDER.test(v.trim())) break;  // unfilled template
        out[hit[0]] = v;
        break;
      }
    }
  }
  return out;
}

/** "Austin, TX 78750" -> {city, state, zip}. Anything else -> city only. */
function pfSplitCityStateZip(s) {
  const txt = pfS(s);
  if (!txt) return {};
  const m = /^(.*?),\s*([A-Za-z]{2})\s+([\d-]{5,10})\s*$/.exec(txt);
  if (m) return { city: m[1].trim(), state: m[2].toUpperCase(), zip: m[3] };
  const m2 = /^(.*?),\s*([A-Za-z]{2})\s*$/.exec(txt);
  if (m2) return { city: m2[1].trim(), state: m2[2].toUpperCase() };
  return { city: txt };
}

/** '1984' or '1984 / 2019' -> '1984'. */
function pfYear(v) {
  if (typeof v === 'number' && isFinite(v)) return String(Math.round(v));
  const m = /\b(1[89]\d{2}|20\d{2})\b/.exec(pfS(v));
  return m ? m[1] : '';
}

// ------------------------------------------------------------ the RR reader
//
// The RR tab is the RIGHT source for the subject unit mix, and the COMPS
// subject block is a poor substitute for it. `COMPS!C6` is
// `SUMIF(RR!$C$6:$C$365, COMPS!$B6, RR!$E$6:$E$365)`, which does three things
// that lose data: it collapses Original/Partial/Reno into one row per plan, its
// range stops at row 365 so it never sees the VACANTS block, and it drops any
// plan with no matching label. On Lantern that block totals 176 units against
// DASH's 316.
//
// RR carries TWO unit-mix blocks with identical column layouts: the top one is
// OCCUPIED units only (which is why `U Mix Sum` is footnoted "* Leased Only"),
// and a second under a `VACANTS` banner. Total units is the sum of the pair;
// the in-place rent lives only on the occupied side. Both blocks are found by
// scanning for their labels — the row numbers happen to be 6-350 and 401-750 on
// both the v7 and v8 templates, and neither number is written down here.

const PF_RR_STATUS = /^(original|partial|reno)$/i;

/** Column map for an RR unit-mix header row, by label. */
function pfRRCols(ws, hdr, maxCol) {
  const cols = {};
  let inPlaceAt = 0, marketAt = 0;
  // Row above the header carries the group banners that disambiguate the two
  // identical '$/Mo' columns — In-Place at K, Market at R.
  for (let c = 1; c <= maxCol; c++) {
    const g = pfS(pfV(ws, hdr - 1, c)).toLowerCase();
    if (/^in.?place/.test(g) && !inPlaceAt) inPlaceAt = c;
    if (/^market/.test(g) && !marketAt) marketAt = c;
  }
  for (let c = 1; c <= maxCol; c++) {
    const l = pfS(pfV(ws, hdr, c)).toLowerCase().replace(/\s+/g, ' ').replace(/\.$/, '');
    if (!l) continue;
    if (l === 'unit name' && !cols.plan) cols.plan = c;
    else if (l === 'status' && !cols.status) cols.status = c;
    else if (l === '# units' && !cols.units) cols.units = c;
    else if (l === '# brs' && !cols.beds) cols.beds = c;
    else if (l === '# bas' && !cols.baths) cols.baths = c;
    else if (l === 'sf/ unit' || l === 'sf/unit') { if (!cols.sf) cols.sf = c; }
    else if (l === '$/mo') {
      // Two columns share this label; the banner above decides which is which.
      if (marketAt && c >= marketAt) { if (!cols.market) cols.market = c; }
      else if (inPlaceAt && c >= inPlaceAt) { if (!cols.inPlace) cols.inPlace = c; }
      else if (!cols.inPlace) cols.inPlace = c;
    }
  }
  return cols;
}

/**
 * Where a unit-mix block stops.
 *
 * Load-bearing: RR continues past the mix into the LEASE-LEVEL table (header
 * `Unit Type Name` around row 800), whose rows also carry a plan name in the
 * plan column and `Reno`/`Unreno` in the status column — and whose `# Units`
 * column holds the UNIT NUMBER. Scanning into it sums unit numbers as unit
 * counts: on Lantern that read 1,431,784 units instead of 316.
 */
const PF_RR_TERMINAL = /^(occupied|all vacant|all|vacant|grand tot|unit type name)\b/i;

function pfRRBlockEnd(ws, first, hardEnd, cols) {
  for (let r = first; r <= hardEnd; r++) {
    const p = pfS(pfV(ws, r, cols.plan));
    if (p && PF_RR_TERMINAL.test(p)) return r - 1;
  }
  return hardEnd;
}

/**
 * Section labels, harvested from the block's own `Subtotal/Avg <label>` rows.
 *
 * Each section is followed by a three-row roll-up BY FINISH whose plan cell
 * holds the section label rather than a plan name (`2x1(.5)` / Original,
 * Partial, Reno) — a shape indistinguishable from a real plan row by type
 * alone. Reading those as plans double-counts every section.
 */
function pfRRSectionLabels(ws, first, last, cols) {
  const set = new Set();
  for (let r = first; r <= last; r++) {
    const m = /^subtotal\s*\/\s*avg\s+(.+)$/i.exec(pfS(pfV(ws, r, cols.plan)));
    if (m) set.add(m[1].trim().toLowerCase());
  }
  return set;
}

/** Data rows of one RR unit-mix block, from `first` until its summary rows. */
function pfRRBlock(ws, first, lastBound, cols, sections) {
  const out = [];
  for (let r = first; r <= lastBound; r++) {
    const plan = pfS(pfV(ws, r, cols.plan));
    const status = pfS(pfV(ws, r, cols.status));
    if (!plan || /^subtotal/i.test(plan) || PF_RR_TERMINAL.test(plan)) continue;
    if (sections && sections.has(plan.toLowerCase())) continue;   // section roll-up
    if (!PF_RR_STATUS.test(status)) continue;
    out.push({
      row: r,
      plan,
      status: status.charAt(0).toUpperCase() + status.slice(1).toLowerCase(),
      units: pfN(pfV(ws, r, cols.units)) || 0,
      beds: pfNumLead(pfV(ws, r, cols.beds)),
      baths: pfNumLead(pfV(ws, r, cols.baths)),
      sf: cols.sf ? pfN(pfV(ws, r, cols.sf)) : null,
      inPlace: cols.inPlace ? pfN(pfV(ws, r, cols.inPlace)) : null,
      market: cols.market ? pfN(pfV(ws, r, cols.market)) : null,
    });
  }
  return out;
}

/**
 * Read the subject unit mix out of an RR worksheet.
 * Returns null when the tab does not look like an RR unit mix, so the caller can
 * fall back to the COMPS subject block rather than importing an empty mix.
 */
function pfReadRR(ws) {
  const { maxRow, maxCol } = pfRange(ws);
  const scanTo = Math.min(maxRow, 1000);

  let hdr = 0;
  for (let r = 1; r <= Math.min(30, maxRow) && !hdr; r++) {
    for (let c = 1; c <= Math.min(20, maxCol); c++) {
      if (pfS(pfV(ws, r, c)).toLowerCase() === 'unit name') { hdr = r; break; }
    }
  }
  if (!hdr) return null;

  const cols = pfRRCols(ws, hdr, Math.min(maxCol, 40));
  if (!cols.plan || !cols.status || !cols.units) return null;

  // The VACANTS banner sits in the plan column, on its own row.
  let vacBanner = 0;
  for (let r = hdr + 1; r <= scanTo && !vacBanner; r++) {
    if (/^vacants?$/i.test(pfS(pfV(ws, r, cols.plan)))) vacBanner = r;
  }

  const occFirst = hdr + 1;
  const occLast = pfRRBlockEnd(ws, occFirst, vacBanner ? vacBanner - 1 : scanTo, cols);
  const occSections = pfRRSectionLabels(ws, occFirst, occLast, cols);
  const occupied = pfRRBlock(ws, occFirst, occLast, cols, occSections);

  let vacant = [];
  if (vacBanner) {
    const vFirst = vacBanner + 1;
    const vLast = pfRRBlockEnd(ws, vFirst, scanTo, cols);
    vacant = pfRRBlock(ws, vFirst, vLast, cols, pfRRSectionLabels(ws, vFirst, vLast, cols));
  }
  if (!occupied.length && !vacant.length) return null;

  // Stated totals, for the reconciliation the preview shows. Located by label.
  const stated = {};
  for (let r = hdr + 1; r <= scanTo; r++) {
    const p = pfS(pfV(ws, r, cols.plan)), d = pfS(pfV(ws, r, cols.status));
    const n = pfN(pfV(ws, r, cols.units));
    if (n === null) continue;
    if (/^subtotal\/avg occupied$/i.test(p)) stated.occupied = n;
    else if (/^grand tot/i.test(p)) stated.grand = n;
    else if (/^all vacant$/i.test(p) && /^vac tot/i.test(d)) stated.vacant = n;
  }

  /* Full OUTER join on plan+finish. A 100%-vacant plan exists only in the
     second block and still has to produce a row — left-joining the occupied
     block would drop it and undercount the property. */
  const key = x => x.plan.toLowerCase() + ' | ' + x.status.toLowerCase();
  const byKey = new Map();
  const order = [];
  const slot = x => {
    const k = key(x);
    if (!byKey.has(k)) {
      byKey.set(k, {
        plan: x.plan, status: x.status, beds: x.beds, baths: x.baths,
        sf: null, occUnits: 0, vacUnits: 0, inPlace: null, market: null,
      });
      order.push(k);
    }
    return byKey.get(k);
  };

  occupied.forEach(x => {
    if (!x.units) return;
    const t = slot(x);
    t.occUnits += x.units;
    if (t.sf == null && x.sf) t.sf = x.sf;
    if (t.inPlace == null && x.inPlace) t.inPlace = x.inPlace;
    if (t.market == null && x.market) t.market = x.market;
    if (t.beds == null) t.beds = x.beds;
    if (t.baths == null) t.baths = x.baths;
  });
  vacant.forEach(x => {
    if (!x.units) return;
    const t = slot(x);
    t.vacUnits += x.units;
    // A fully-vacant plan has no SF or market rent on the occupied side.
    if (t.sf == null && x.sf) t.sf = x.sf;
    if (t.market == null && x.market) t.market = x.market;
    if (t.beds == null) t.beds = x.beds;
    if (t.baths == null) t.baths = x.baths;
  });

  const rows = order.map(k => byKey.get(k))
    .map(t => Object.assign(t, { units: t.occUnits + t.vacUnits }))
    .filter(t => t.units > 0);

  return {
    rows,
    stated,
    totals: {
      units: rows.reduce((a, t) => a + t.units, 0),
      occupied: rows.reduce((a, t) => a + t.occUnits, 0),
      vacant: rows.reduce((a, t) => a + t.vacUnits, 0),
    },
    hadVacantsBlock: !!vacBanner,
  };
}

// -------------------------------------------------------------- the reader

/** Read a COMPS worksheet into a geometry-neutral shape. */
function pfReadComps(ws) {
  const { maxRow, maxCol } = pfRange(ws);

  // header row: the one carrying 'Floor Plan'
  let hdr = 0, planCol = 0;
  for (let r = 1; r <= Math.min(15, maxRow) && !hdr; r++) {
    for (let c = 1; c <= Math.min(40, maxCol); c++) {
      if (pfS(pfV(ws, r, c)).toLowerCase() === 'floor plan') { hdr = r; planCol = c; break; }
    }
  }
  if (!hdr) throw new Error('COMPS tab has no "Floor Plan" header row');
  const S = planCol, numRow = hdr - 2, detRow = hdr - 1;

  // bed/bath bands, located by their '+' aggregate labels
  const aggs = [];
  for (let r = hdr + 1; r <= Math.min(maxRow, 260); r++) {
    const v = pfV(ws, r, S);
    if (typeof v === 'string' && v.trim().startsWith('+')) aggs.push([r, v.trim()]);
  }
  const bands = [];
  let prev = hdr;
  aggs.forEach(([aggRow, label]) => {
    bands.push({ first: prev + 1, last: aggRow - 1, agg: aggRow,
                 bb: pfBandLabel(label), label: label.replace(/^\+/, '').trim() });
    prev = aggRow;
  });
  if (!bands.length) throw new Error('COMPS tab has no unit-type sections');
  const totRow = bands[bands.length - 1].agg + 1;

  // ---- subject
  const subject = Object.assign({
    name: pfS(pfV(ws, numRow, S)).replace(/^\s*Property\s*:\s*/i, ''),
    year_built: pfN(pfV(ws, detRow, S)),
    units_stated: pfN(pfV(ws, detRow, S + 1)),
    types: [], bandMkt: [],
  }, pfBandFields(ws, detRow, S, 8));

  bands.forEach(b => {
    for (let r = b.first; r <= b.last; r++) {
      const name = pfV(ws, r, S), units = pfN(pfV(ws, r, S + 1));
      if (typeof name !== 'string' || !name.trim() || name.trim() === '0' || !units) continue;
      subject.types.push({
        plan: name.trim(), bb: pfPlanBedBath(name) || b.bb, units,
        sf: pfN(pfV(ws, r, S + 2)), eff_mo: pfN(pfV(ws, r, S + 3)),
        mkt_mo: pfN(pfV(ws, r, S + 5)),
      });
    }
    subject.bandMkt.push({ bb: b.bb, label: b.label, mkt_mo: pfN(pfV(ws, b.agg, S + 5)) });
  });

  // ---- label blocks (subject side)
  let attrHdr = 0;
  for (let r = totRow; r <= totRow + 8 && !attrHdr; r++) {
    if (/physical attribute/i.test(pfS(pfV(ws, r, S)))) attrHdr = r;
  }
  const labelBlock = (col) => {
    const out = [];
    for (let r = attrHdr + 1; r <= attrHdr + 14; r++) {
      const v = pfS(pfV(ws, r, col));
      if (v) out.push([r, v]);
      else if (out.length) break;
    }
    return out;
  };
  const blocks = attrHdr
    ? { attrs: labelBlock(S), amens: labelBlock(S + 2), fees: labelBlock(S + 5) }
    : { attrs: [], amens: [], fees: [] };

  // ---- comp blocks: starts from the comp-number cells on row 3
  const starts = [];
  for (let c = S + 8; c <= maxCol; c++) {
    const v = pfV(ws, numRow, c);
    if (typeof v === 'number' && Number.isInteger(v) && v >= 1 && v <= 10) starts.push(c);
  }
  const strides = starts.slice(1).map((v, i) => v - starts[i]);
  const stride = strides.length ? Math.min.apply(null, strides) : 9;

  const comps = [], placeholders = [];
  starts.forEach((b, i) => {
    const end = i + 1 < starts.length ? starts[i + 1] - 1 : Math.min(b + stride - 1, maxCol);
    const name = pfS(pfV(ws, numRow, b + 1));
    if (!name) return;

    let addr = '';
    for (let c = b + 2; c <= end; c++) { const a = pfS(pfV(ws, numRow, c)); if (a) addr = a; }

    const labels = {};
    for (let c = b; c <= end; c++) {
      const l = pfS(pfV(ws, hdr, c)).toLowerCase().replace(/\.$/, '');
      if (l && !(l in labels)) labels[l] = c;
    }
    const cU = labels['# units'], cSf = labels['sf'],
          cOcc = labels['occ %'], cAsk = labels['ask $/mo'];

    const c = Object.assign({
      name, addr,
      year_built: pfN(pfV(ws, detRow, b)), units: pfN(pfV(ws, detRow, b + 1)),
      comp_type: pfS(pfV(ws, totRow + 1, b + 2)),
      source: pfS(pfV(ws, totRow + 1, b + 5)) || pfS(pfV(ws, totRow + 1, b + 4)),
      tot_eff_mo: stride === 9 ? pfN(pfV(ws, totRow, b + 6)) : null,
      types: [],
    }, pfBandFields(ws, detRow, b, end - b));

    // Attribute / amenity / fee value offsets are only known for the MF v7
    // nine-column block. On any other stride they stay unread — a guessed
    // offset writes a neighbouring comp's answers onto this one.
    if (attrHdr && stride === 9) {
      c.attrs = blocks.attrs.map(([r, l]) => [l, pfV(ws, r, b + 2)]);
      c.amens = blocks.amens.map(([r, l]) => [l, pfV(ws, r, b + 5)]);
      c.fees = blocks.fees.map(([r, l]) => [l, pfV(ws, r, b + 7)]);
    } else {
      c.attrs = []; c.amens = []; c.fees = [];
    }

    bands.forEach(bd => {
      for (let r = bd.first; r <= bd.last; r++) {
        const units = cU ? pfN(pfV(ws, r, cU)) : null;
        const sf = cSf ? pfN(pfV(ws, r, cSf)) : null;
        const ask = cAsk ? pfN(pfV(ws, r, cAsk)) : null;
        const occ = cOcc ? pfN(pfV(ws, r, cOcc)) : null;
        // Real if it carries SF **or** an asking rent. Demanding a unit COUNT
        // drops whole comps — live files fill SF and Ask $/Mo and never touch
        // the '# Units' column.
        if (!sf && !ask) continue;
        c.types.push({ bb: bd.bb, band: bd.label, units, sf, occ, ask });
      }
    });

    const hasData = c.types.length || (c.tot_eff_mo || 0) > 0 || c.comp_type;
    if (!hasData && (/^\s*(COMP|SHIR|COMPARABLE)\s*\d*\s*$/i.test(name)
                     || (!c.year_built && !c.units))) {
      placeholders.push(name);
      return;
    }
    comps.push(c);
  });

  return { subject, comps, placeholders, bands, stride, attrHdr,
           labels: { attrs: blocks.attrs.map(x => x[1]), amens: blocks.amens.map(x => x[1]),
                     fees: blocks.fees.map(x => x[1]) } };
}

// ------------------------------------------------- COMPS read -> our record

function pfNumStr(v, dp) {
  const x = pfN(v);
  if (x === null) return '';
  const r = dp === undefined ? x : Number(x.toFixed(dp));
  return Number.isInteger(r) ? String(r) : String(Number(r.toFixed(2)));
}

/** A fraction (0.062) or a whole percent (6.2) -> '6.2'. */
function pfPct(v) {
  const x = pfN(v);
  if (x === null) return '';
  return String(Number((Math.abs(x) <= 1.5 ? x * 100 : x).toFixed(1)));
}

/** COMPS attribute cell -> tri-state. 'RUBS' / 'Tenant' / 'Pitched' are NOT
    tri-state answers and become a note rather than a silent Yes. */
function pfTri(v) {
  const t = pfS(v).toLowerCase();
  if (t === 'y' || t === 'yes') return ['Y', ''];
  if (t === 'n' || t === 'no') return ['N', ''];
  if (t && t !== '?') return ['', pfS(v)];
  return ['', ''];
}

function pfOption(value, options) {
  const v = pfS(value);
  if (!v) return '';
  const hit = (options || []).find(o => o.toLowerCase() === v.toLowerCase())
    || (options || []).find(o => o.toLowerCase().replace(/\s/g, '') === v.toLowerCase().replace(/\s/g, ''));
  return hit || '';
}

/** The bucket RECORD for a beds/baths pair. `bucketFor()` returns the key
    string, not the record — reading `.key`/`.short` off it yields undefined and
    files every market rent under a single "undefined" section. */
function pfBucket(beds, baths) {
  if (beds === null || beds === undefined || beds === '') return null;
  return bucketByKey(bucketFor(beds, baths === null || baths === undefined ? 1 : baths));
}

/** The whole mapping from a COMPS read to the field items this app holds. */
function pfToImport(det) {
  const warn = [];
  const FEE_ROWS = (SCHEMA.fees || []).filter(f => f.compsLabel);

  const dash = det.dash || {};
  const loc = pfSplitCityStateZip(dash.citystatezip);

  /* COMPS!B3 is `="Property: "&DASH!E5`, so the name placeholder survives the
     DASH filter by arriving through the fallback instead. */
  const fallbackName = pfS(det.subject.name);
  const subject = {
    name: pfS(dash.name) || (PF_DASH_PLACEHOLDER.test(fallbackName) ? '' : fallbackName),
    address: streetOnly(pfS(dash.address)),
    city: loc.city || '',
    state: loc.state || '',
    zip: loc.zip || '',
    msa: pfS(dash.msa),
    year_built: pfYear(dash.year_built !== undefined ? dash.year_built : det.subject.year_built),
    /* DASH over the COMPS header: `COMPS!C4` is meant to be `=DASH!E10` but on
       older workbooks it is a stale hardcode (Miramar: 272 vs a real 143). */
    total_units: pfNumStr(dash.total_units !== undefined ? pfN(dash.total_units) : det.subject.units_stated),
    occupancy_pct: '',
    wd_type: pfOption(det.subject.wd, SCHEMA.wdTypes),
    util_structure: pfOption(det.subject.util, SCHEMA.utilStructures),
  };

  /* Is there anything in this workbook at all? An unfilled copy of the template
     has a DASH, a COMPS tab and an RR — all empty — and every "0" in it would
     otherwise import as a real measurement. */
  const hasUnitData = !!(det.rr && det.rr.rows.length) || det.subject.types.length > 0;

  /* Occupancy: DASH's own physical-occupancy figure first, the COMPS vacancy
     cell (itself `=DASH!N5`) as the fallback. A zero on an empty workbook is an
     empty cell, not a fully-leased property — hence the hasUnitData gate, without
     which a blank template imports as "100% occupied". */
  const dashOcc = pfN(dash.occupancy_pct);
  const vac = pfN(det.subject.vacancy);
  if (dashOcc !== null && dashOcc > 0 && dashOcc <= 1.5) {
    subject.occupancy_pct = String(Number((dashOcc * 100).toFixed(1)));
  } else if (hasUnitData && vac !== null && vac >= 0 && vac <= 1.5) {
    subject.occupancy_pct = String(Number(((1 - vac) * 100).toFixed(1)));
  }
  if (!hasUnitData) {
    warn.push('This workbook has no unit mix on RR and none on the COMPS subject block — '
      + 'it looks like a template copy that has not been underwritten yet. Check the file before applying.');
  }

  /* A COMPS header that disagrees with DASH is a stale hardcode, and it is worth
     saying so — it is the number a reader of the COMPS tab sees. */
  const dashUnits = pfN(dash.total_units), compsUnits = pfN(det.subject.units_stated);
  if (dashUnits !== null && compsUnits !== null && Math.abs(dashUnits - compsUnits) > 0.5) {
    warn.push('COMPS header says ' + Math.round(compsUnits) + ' units but DASH says '
      + Math.round(dashUnits) + ' — the COMPS cell is a stale hardcode, not =DASH!E10. '
      + 'DASH was used.');
  }
  /* What the imported mix is reconciled against, everywhere below. */
  const statedUnits = dashUnits !== null ? dashUnits : compsUnits;

  /* Subject unit mix: RR when the workbook has one, the COMPS subject block
     only as a fallback. See pfReadRR() for why the fallback is a poor one. */
  let subjectUnitMix, mixSource, mixTotals = null;
  if (det.rr && det.rr.rows.length) {
    mixSource = 'RR';
    mixTotals = det.rr.totals;
    subjectUnitMix = det.rr.rows.map(t => {
      const row = newSubjectUnitRow();
      row.plan = t.plan;
      row.beds = pfNumStr(t.beds);
      row.baths = pfNumStr(t.baths);
      row.sqft = pfNumStr(t.sf);
      row.count = pfNumStr(t.units);            // TOTAL: occupied + vacant
      row.vacant_count = String(t.vacUnits);    // always known from the two blocks
      row.status = pfOption(t.status, SCHEMA.unitStatus);
      row.current_rent = pfNumStr(t.inPlace, 0);
      return row;
    });

    if (!det.rr.hadVacantsBlock) {
      warn.push('RR has no VACANTS block — every plan was imported as fully occupied. '
        + 'Check the unit counts against the rent roll before relying on them.');
    }
    const st = det.rr.stated;
    if (st.grand != null && Math.abs(st.grand - mixTotals.units) > 0.5) {
      warn.push('Imported unit mix totals ' + Math.round(mixTotals.units)
        + ' units but RR\'s own Grand Tot/Avg says ' + Math.round(st.grand) + ' — some rows were not read');
    }
    if (statedUnits !== null && Math.abs(statedUnits - mixTotals.units) > 0.5) {
      warn.push('Imported unit mix totals ' + Math.round(mixTotals.units)
        + ' units against the proforma\'s stated ' + Math.round(statedUnits)
        + '. Verify before exporting.');
    }
    const bad = subjectUnitMix.filter(r => !r.status).length;
    if (bad) warn.push(bad + ' subject plan(s) carry a finish the tracker does not recognise');
  } else {
    mixSource = 'COMPS';
    subjectUnitMix = det.subject.types.map(t => {
      const row = newSubjectUnitRow();
      row.plan = t.plan;
      row.beds = pfNumStr(t.bb ? t.bb[0] : null);
      row.baths = pfNumStr(t.bb ? t.bb[1] : null);
      row.sqft = pfNumStr(t.sf);
      row.count = pfNumStr(t.units);
      row.vacant_count = '';   // unknowable from COMPS — blank, never 0
      row.status = '';
      row.current_rent = pfNumStr(t.eff_mo, 0);
      return row;
    });
    if (subjectUnitMix.length) {
      const tot = subjectUnitMix.reduce((a, r) => a + num(r.count), 0);
      warn.push('No readable RR unit mix — the subject mix came from the COMPS subject block, '
        + 'which merges Original/Partial/Reno into one row per plan and cannot see vacant units'
        + (statedUnits !== null && Math.abs(statedUnits - tot) > 0.5
            ? ' (it totals ' + Math.round(tot) + ' units against the stated ' + Math.round(statedUnits) + ')' : '')
        + '. Finish and vacancy were left blank rather than guessed.');
    }
  }

  const comps = det.comps.slice(0, MAX_COMPS).map(c => {
    const comp = newComp();
    const notes = [];
    comp.name = c.name;
    comp.address = streetOnly(c.addr);
    comp.year_built = pfNumStr(c.year_built);
    comp.total_units = pfNumStr(c.units);
    comp.distance_miles = pfNumStr(c.distance_mi, 2);
    comp.vacancy_pct = pfPct(c.vacancy);
    comp.concession_amount = pfNumStr(c.conc_amt, 0);
    comp.wd_type = pfOption(c.wd, SCHEMA.wdTypes);
    comp.util_structure = pfOption(c.util, SCHEMA.utilStructures);
    comp.source = pfOption(c.source, SCHEMA.sources);

    const ct = pfS(c.comp_type).toLowerCase();
    comp.category = CATEGORIES.some(x => x.key === ct) ? ct : '';
    if (!comp.category && ct) notes.push('Comp Type in proforma: ' + pfS(c.comp_type));

    // Attributes, amenities and fees are matched POSITIONALLY — row order is
    // the contract, the labels are analyst-editable text (one live file calls
    // fee row 6 'Dep.Waiver', not 'Cable/Internet').
    (c.attrs || []).slice(0, PHYSICAL.length).forEach(([lbl, val], i) => {
      const [t, raw] = pfTri(val);
      comp.physical[PHYSICAL[i].key] = t;
      if (raw) notes.push(lbl + ': ' + raw);
    });
    (c.amens || []).slice(0, AMENITIES.length).forEach(([lbl, val], i) => {
      const [t, raw] = pfTri(val);
      comp.amenities[AMENITIES[i].key] = t;
      if (raw) notes.push(lbl + ': ' + raw);
    });
    /* Fees are matched BY LABEL, per comp. The band's row order is not a
       contract: v8 made these cells dropdowns and dropped five of the eight v7
       defaults, and analysts free-type per comp — in this very file, comp 2 has
       `V Trash` / `Adm Trash` on the rows where comp 1 has the v7 set. Reading
       the label and then assigning by INDEX (which is what this did until
       2026-08-08) files a valet-trash charge as insurance, and the fee column is
       summed into every unit's Eff. $/Mo. */
    (c.fees || []).forEach(([lbl, val]) => {
      const label = pfS(lbl);
      const hasVal = pfN(val) !== null || pfS(val);
      if (!hasVal) return;
      if (!label) {
        // The v7 band's 9th row has no label but IS inside the Eff. $/Mo SUM.
        notes.push('Fee with no label: ' + pfS(val) + ' — it is still summed into Eff. $/Mo');
        return;
      }
      const f = FEE_ROWS.find(x => (x.compsLabel || '').toLowerCase() === label.toLowerCase());
      if (f && pfN(val) !== null) comp.fees[f.key] = pfNumStr(val);
      else if (f) notes.push('Fee ' + label + ': ' + pfS(val));
      else {
        // A real charge the tracker has no field for — keep it rather than drop it.
        notes.push('Fee ' + label + ': ' + pfS(val) + ' (no tracker field for this label)');
        if (pfN(val) !== null && !comp.fees.other) {
          comp.fees.other = pfNumStr(val);
          comp.fees.other_label = label;
        }
      }
    });

    comp.unitMix = c.types.map(t => {
      const r = newUnitRow();
      const beds = t.bb ? t.bb[0] : null, baths = t.bb ? t.bb[1] : null;
      const b = pfBucket(beds, baths);
      r.plan = (b ? b.short : '?') + '-' + pfNumStr(t.sf);
      r.beds = pfNumStr(beds); r.baths = pfNumStr(baths);
      r.sqft = pfNumStr(t.sf); r.count = pfNumStr(t.units);
      r.occ_pct = t.occ ? pfPct(t.occ) : '';
      r.ask_rent = pfNumStr(t.ask, 0);
      return r;
    });

    // A concession in the 1960-2030 range is the known miskey — a year typed
    // into the Conc $ cell. Kept (it IS what the workbook holds) but flagged,
    // so it is not silently exported as a $1,984 credit.
    const ca = pfN(c.conc_amt);
    if (ca !== null && ca >= 1960 && ca <= 2030) {
      notes.push('Conc $ reads ' + ca + ' — verify, this looks like a year built');
      warn.push(c.name + ': Conc $ reads ' + ca + ', which looks like a year built');
    }
    const vp = pfN(c.vacancy) === null ? null
      : (Math.abs(c.vacancy) <= 1.5 ? c.vacancy * 100 : c.vacancy);
    if (vp !== null && vp > 60) {
      warn.push(c.name + ': vacancy reads ' + vp.toFixed(0) + '% — may be an occupancy figure');
    }
    if (!comp.category) warn.push(c.name + ': no Comp Type recorded in the proforma');
    if (!comp.unitMix.length) warn.push(c.name + ': no unit rows in the proforma');

    comp.notes = notes.join(' | ');
    return comp;
  });

  // The storeys-in-distance bug shows up as every comp carrying the same small
  // whole number — an older populator wrote a storey count into the 0.0 "Mi" cell.
  const dists = comps.map(c => parseFloat(c.distance_miles)).filter(d => !isNaN(d));
  if (dists.length >= 3) {
    if (dists.every(d => Number.isInteger(d) && d <= 5)) {
      warn.push('Every comp distance is a small whole number (' + dists.slice(0, 4).join(', ')
        + ') — the classic "storeys written into the distance cell" signature; verify before exporting');
    } else if (new Set(dists).size === 1) {
      warn.push('Every comp carries the same distance (' + dists[0] + ' mi) — looks filled down');
    }
  }
  if (det.comps.length > MAX_COMPS) {
    warn.push('The proforma carries ' + det.comps.length + ' comps; only the first '
      + MAX_COMPS + ' fit the COMPS tab and were read');
  }
  if (det.stride !== 9) {
    warn.push('This workbook\'s comp blocks stride ' + det.stride
      + ' columns, not the MF v7 nine — it is the ExStay template layout. Comp attributes, '
      + 'amenities and fees were NOT read (their offsets differ and a guess would write the wrong cells).');
  }
  if (det.placeholders.length) {
    warn.push('Skipped ' + det.placeholders.length + ' empty template slot(s): '
      + det.placeholders.join(', '));
  }

  const marketRents = {};
  det.subject.bandMkt.forEach(b => {
    if (!b.bb || !b.mkt_mo) return;
    const bucket = pfBucket(b.bb[0], b.bb[1]);
    if (bucket) marketRents[bucket.key] = { override: pfNumStr(b.mkt_mo, 0) };
  });

  return { subject, subjectUnitMix, comps, marketRents, warnings: warn, stride: det.stride,
           mixSource, mixTotals };
}

// ------------------------------------------------------------------ the UI

function pfPickedFile() { return PF.files.find(f => f.id === PF.pickId) || null; }

function pfFileRowHtml(f, checked) {
  const ver = f.version[0] ? 'v' + f.version[0] + (f.version[1] ? '.' + f.version[1] : '') : '—';
  return `<label class="pf-file${checked ? ' sel' : ''}">
    <input type="radio" name="pf-file" value="${esc(f.id)}"${checked ? ' checked' : ''}/>
    <span class="pf-file-main">
      <span class="pf-file-name">${esc(f.name)}</span>
      <span class="pf-file-meta">${esc(PF_TIER_LABEL[f.tier])} · ${esc(ver)}${f.sub ? ' · ' + esc(f.sub) : ''}</span>
    </span>
  </label>`;
}

const PF_HINT_IDLE = 'Pulls the subject, its unit mix, the comps and the column-G market '
  + 'rents out of a proforma in this deal\'s 2. UW-Analysis folder. Nothing is applied until you review it.';
const PF_HINT_LIST = 'Ranked by review tier first (IC / Final, Asset Mgmt, Head of Acq, Acq Team, '
  + 'Init UW), then by version within that tier. A version number never outranks a tier.';

function pfImportCardHtml() {
  if (!STATE) return '';
  const linked = !!STATE.drive.folderId;
  const hint = PF.step === 'list' ? PF_HINT_LIST : (PF.step === 'idle' ? PF_HINT_IDLE : '');

  let body;
  if (PF.busy) {
    body = `<div class="muted small">${esc(PF.busy)}…</div>`;
  } else if (PF.error) {
    body = `<div class="chk err"><span class="ico">✖</span><span>${esc(PF.error)}</span></div>
      <div class="btn-row" style="margin-top:8px"><button class="btn small" id="btn-pf-reset">Start over</button></div>`;
  } else if (PF.step === 'preview' && PF.parsed) {
    body = pfPreviewHtml();
  } else if (PF.step === 'list') {
    const untiered = PF.files.filter(f => !f.tier);
    body = `
      <div class="card-hint">
        Ranked by review tier first (IC / Final → Asset Mgmt → Head of Acq → Acq Team → Init UW),
        then by version within that tier. A version number never outranks a tier —
        <code>AcqRev v9</code> is still an Acq Team build.
      </div>
      <div class="pf-files">${PF.files.filter(f => f.tier).map((f, i) => pfFileRowHtml(f, i === 0)).join('')
        || '<div class="muted small">No file in 2. UW-Analysis carries a tier marker.</div>'}</div>
      ${untiered.length ? `<details class="pf-more"><summary>${untiered.length} file(s) with no tier marker</summary>
        <div class="pf-files">${untiered.map(f => pfFileRowHtml(f, false)).join('')}</div>
        <div class="tiny muted">A file lands here when its marker ran into another word.
        Selectable, but the durable fix is to rename it so every later run agrees with this one.</div>
      </details>` : ''}
      <div class="btn-row" style="margin-top:9px">
        <button class="btn primary small" id="btn-pf-read">Read COMPS tab</button>
        <button class="btn small" id="btn-pf-cancel">Cancel</button>
      </div>`;
  } else {
    body = `
      <div class="card-hint">
        Pulls the subject, its unit mix, the comps and the column-G market rents
        out of a proforma in this deal's <b>2. UW-Analysis</b> folder. Nothing is
        applied until you review it.
      </div>
      <div class="btn-row">
        <button class="btn primary small" id="btn-pf-start"${linked ? '' : ' disabled'}>⤓ Import from Proforma</button>
      </div>
      ${linked ? '' : '<div class="tiny muted" style="margin-top:6px">Link a Drive deal folder first — the proformas are read from it.</div>'}
      ${['subject', 'unitMix', 'comps', 'marketRents'].map(pfStampHtml).filter(Boolean).join('')}`;
  }

  return `<div class="card" id="pf-card">
    <div class="card-head"${hint ? ' title="' + esc(hint) + '"' : ''}><span class="grow">Import from Proforma</span></div>
    <div class="card-body">${body}</div>
  </div>`;
}

function pfPreviewHtml() {
  const p = PF.parsed, f = pfPickedFile();
  const s = STATE.subject || {};
  const subjRows = [
    ['name', 'Property name'], ['address', 'Address'], ['city', 'City'],
    ['state', 'State'], ['zip', 'ZIP'], ['msa', 'Market'],
    ['year_built', 'Year built'], ['total_units', 'Total units'],
    ['occupancy_pct', 'Occupancy %'], ['wd_type', 'W/D type'], ['util_structure', 'Utilities'],
  ].filter(([k]) => p.subject[k] !== '' && p.subject[k] !== undefined)
   .map(([k, lbl]) => {
     const now = (s[k] === undefined || s[k] === '') ? '—' : String(s[k]);
     const next = String(p.subject[k]);
     return `<div class="kv"><span class="k">${esc(lbl)}</span>
       <span class="v">${esc(now)} <span class="muted">→</span> ${esc(next)}</span></div>`;
   }).join('');

  const compRows = p.comps.map(c => `<div class="kv">
      <span class="k">${esc(c.name || '(unnamed)')}
        <span class="cat-pill ${c.category ? esc(c.category) : 'none'}" style="margin-left:4px">${
          c.category ? esc(categoryMeta(c.category).label) : '—'}</span></span>
      <span class="v">${c.unitMix.length} plan${c.unitMix.length === 1 ? '' : 's'}</span>
    </div>`).join('');

  const grp = (id, label, count, danger) => `<label class="pf-grp${count ? '' : ' off'}">
    <input type="checkbox" id="${id}"${count ? ' checked' : ' disabled'}/>
    <span>${esc(label)} <b>${count}</b>${danger ? ` <span class="pf-danger">${esc(danger)}</span>` : ''}</span>
  </label>`;

  const nComps = (STATE.comps || []).length;
  const nMix = (STATE.subjectUnitMix || []).length;

  const mt = p.mixTotals;
  const mixNote = p.mixSource === 'RR'
    ? `RR · ${int(mt.units)} units (${int(mt.occupied)} occ / ${int(mt.vacant)} vac)`
    : 'COMPS subject block — no vacancy';

  return `
    <div class="kv"><span class="k">Source</span><span class="v">${esc(f ? f.name : '—')}</span></div>
    <div class="kv"><span class="k">Comp block geometry</span>
      <span class="v">${p.stride === 9 ? 'MF v7 (9-col)' : 'ExStay (' + p.stride + '-col)'}</span></div>
    <div class="kv"><span class="k">Unit mix read from</span><span class="v">${esc(mixNote)}</span></div>
    <hr class="hr-soft"/>
    <div class="pf-grps">
      ${grp('pf-g-subject', 'Subject basics', Object.keys(p.subject).filter(k => p.subject[k] !== '').length, '')}
      ${grp('pf-g-mix', 'Subject unit mix', p.subjectUnitMix.length, nMix ? 'replaces ' + nMix : '')}
      ${grp('pf-g-comps', 'Comps', p.comps.length, nComps ? 'replaces ' + nComps : '')}
      ${grp('pf-g-rents', 'Market rent overrides', Object.keys(p.marketRents).length, '')}
    </div>
    ${subjRows ? `<hr class="hr-soft"/><div class="pf-sub">${subjRows}</div>` : ''}
    ${compRows ? `<hr class="hr-soft"/><div class="pf-sub">${compRows}</div>` : ''}
    ${p.warnings.length ? `<hr class="hr-soft"/>${p.warnings.map(w =>
      `<div class="chk warn"><span class="ico">!</span><span>${esc(w)}</span></div>`).join('')}` : ''}
    ${PF.confirmReplace ? `<hr class="hr-soft"/>
      <div class="chk err"><span class="ico">!</span><span>${esc(PF.confirmReplace)}
        This cannot be undone from here — the previous values are only in this deal's
        Drive backups.</span></div>
      <div class="btn-row" style="margin-top:8px">
        <button class="btn primary small danger" id="btn-pf-apply">Yes, replace</button>
        <button class="btn small" id="btn-pf-keep">Keep what I have</button>
      </div>`
    : `<div class="btn-row" style="margin-top:9px">
      <button class="btn primary small" id="btn-pf-apply">Apply checked</button>
      <button class="btn small" id="btn-pf-back">Back</button>
      <button class="btn small" id="btn-pf-cancel">Cancel</button>
    </div>`}`;
}

function pfRerender() {
  if (typeof CURRENT_PHASE !== 'undefined' && CURRENT_PHASE !== 1) return;
  const card = $('#pf-card');
  if (!card) { renderPhase1(); return; }
  card.outerHTML = pfImportCardHtml();
  pfWire();
}

function pfWire() {
  const on = (id, fn) => { const el = $('#' + id); if (el) el.onclick = fn; };
  on('btn-pf-start', pfStart);
  on('btn-pf-read', pfRead);
  on('btn-pf-apply', pfApply);
  on('btn-pf-back', () => { PF.step = 'list'; PF.parsed = null; PF.confirmReplace = ''; pfRerender(); });
  on('btn-pf-keep', () => { PF.confirmReplace = ''; pfRerender(); });
  on('btn-pf-cancel', () => { pfResetImport(); pfRerender(); });
  on('btn-pf-reset', () => { pfResetImport(); pfRerender(); });
  $$('#pf-card input[name="pf-file"]').forEach(r => {
    r.onchange = () => {
      PF.pickId = r.value;
      $$('#pf-card .pf-file').forEach(l => l.classList.toggle('sel', l.contains(r) && r.checked));
    };
  });
}

async function pfStart() {
  if (!STATE.drive.folderId) { toast('Link a Drive deal folder first'); return; }
  if (!driveConnected()) { const ok = await driveConnect(); if (!ok) return; }
  PF.busy = 'Listing 2. UW-Analysis';
  PF.error = '';
  pfRerender();
  try {
    PF.files = await pfFindCandidates(STATE.drive.folderId);
    if (!PF.files.length) throw new Error('No .xlsx files found in 2. UW-Analysis');
    const first = PF.files.find(f => f.tier) || PF.files[0];
    PF.pickId = first.id;
    PF.step = 'list';
  } catch (e) {
    PF.error = e.message || String(e);
  } finally {
    PF.busy = '';
    pfRerender();
  }
}

async function pfRead() {
  const f = pfPickedFile();
  if (!f) { toast('Pick a file first'); return; }
  PF.busy = 'Downloading ' + f.name;
  pfRerender();
  try {
    const buf = await driveDownloadBuffer(f.id);
    PF.busy = 'Reading COMPS';
    pfRerender();
    // cellNF keeps each cell's number format — the row-4 band is classified by
    // format, not position, so this flag is load-bearing, not cosmetic.
    const wb = XLSX.read(new Uint8Array(buf), { type: 'array', cellNF: true, cellStyles: false });
    const sheet = wb.SheetNames.find(n => n.trim().toUpperCase() === 'COMPS');
    if (!sheet) throw new Error('That workbook has no COMPS tab');
    const det = pfReadComps(wb.Sheets[sheet]);

    /* The subject unit mix comes off RR when there is one. Its absence is not an
       error — an ExStay workbook keeps the same table on UNITS, and some early
       files have neither — so a failure here downgrades to the COMPS block
       rather than failing the whole import. */
    const rrName = wb.SheetNames.find(n => n.trim().toUpperCase() === 'RR')
      || wb.SheetNames.find(n => n.trim().toUpperCase() === 'UNITS');
    if (rrName) {
      try { det.rr = pfReadRR(wb.Sheets[rrName]); }
      catch (e) { console.warn('RR read failed, falling back to the COMPS block', e); det.rr = null; }
    }

    /* DASH holds the address, city/state/zip and market that the COMPS tab has
       no cell for, and the authoritative unit count. Also non-fatal. */
    const dashName = wb.SheetNames.find(n => n.trim().toUpperCase() === 'DASH');
    if (dashName) {
      try { det.dash = pfReadDash(wb.Sheets[dashName]); }
      catch (e) { console.warn('DASH read failed', e); det.dash = null; }
    }

    PF.parsed = pfToImport(det);
    PF.step = 'preview';
  } catch (e) {
    console.error('pfRead', e);
    PF.error = 'Could not read that workbook: ' + (e.message || e);
  } finally {
    PF.busy = '';
    pfRerender();
  }
}

function pfApply() {
  const p = PF.parsed;
  if (!p) return;
  const want = id => { const el = $('#' + id); return !!(el && el.checked && !el.disabled); };
  const doSubject = want('pf-g-subject'), doMix = want('pf-g-mix');
  const doComps = want('pf-g-comps'), doRents = want('pf-g-rents');
  if (!doSubject && !doMix && !doComps && !doRents) { toast('Nothing checked'); return; }

  /* Two-press confirmation rather than confirm(). A native dialog cannot be
     dismissed by anything driving this page, and this is the one button in the
     app that destroys captured field work — it needs to be scriptable so the
     re-import of a whole pipeline can be checked, not just clicked. */
  const lost = [];
  if (doMix && (STATE.subjectUnitMix || []).length) lost.push(STATE.subjectUnitMix.length + ' subject plan(s)');
  if (doComps && (STATE.comps || []).length) lost.push(STATE.comps.length + ' captured comp(s)');
  if (lost.length && !PF.confirmReplace) {
    PF.confirmReplace = 'This replaces ' + lost.join(' and ') + '.';
    pfRerender();
    return;
  }

  const applied = [];
  if (doSubject) {
    Object.keys(p.subject).forEach(k => { if (p.subject[k] !== '') STATE.subject[k] = p.subject[k]; });
    applied.push('subject basics');
  }
  if (doMix) {
    STATE.subjectUnitMix = p.subjectUnitMix.map(r => Object.assign({}, r, { id: uid() }));
    applied.push(p.subjectUnitMix.length + ' subject plans');
  }
  if (doComps) {
    STATE.comps = p.comps.map(c => {
      const copy = JSON.parse(JSON.stringify(c));
      copy.compId = uid();
      copy.unitMix = copy.unitMix.map(r => Object.assign({}, r, { id: uid() }));
      return hydrateComp(copy);
    });
    applied.push(p.comps.length + ' comps');
  }
  if (doRents) {
    Object.keys(p.marketRents).forEach(k => {
      STATE.marketRents[k] = Object.assign({}, STATE.marketRents[k], p.marketRents[k]);
    });
    applied.push(Object.keys(p.marketRents).length + ' market rents');
  }

  /* Provenance, recorded as data rather than appended to the notes textarea.
     Keyed per group because the subject and the comps can legitimately come from
     different revisions of a workbook, or different workbooks entirely, and a
     line of prose in `notes` cannot say which half came from where — nor survive
     the analyst editing the field. It rides serializeProperty() to Drive, so a
     teammate opening this on another device sees the same source. */
  const f = pfPickedFile();
  const rec = () => ({
    fileId: f ? f.id : '', fileName: f ? f.name : '',
    driveModifiedTime: f ? f.modifiedTime : '',
    importedAt: nowISO(),
    importedBy: (typeof CURRENT_USER === 'object' && CURRENT_USER && CURRENT_USER.email) || '',
  });
  STATE.imports = STATE.imports || {};
  if (doSubject) STATE.imports.subject = Object.assign(rec(), { fields: applied.includes('subject basics') ? 1 : 0 });
  if (doMix) {
    STATE.imports.unitMix = Object.assign(rec(), {
      rows: p.subjectUnitMix.length,
      source: p.mixSource,
      units: p.mixTotals ? Math.round(p.mixTotals.units) : null,
      vacant: p.mixTotals ? Math.round(p.mixTotals.vacant) : null,
    });
  }
  if (doComps) STATE.imports.comps = Object.assign(rec(), { comps: p.comps.length });
  if (doRents) STATE.imports.marketRents = Object.assign(rec(), { rents: Object.keys(p.marketRents).length });

  saveState();
  pfResetImport();
  toast('Imported ' + applied.join(' · '));
  renderPhase1();
}

/** "IC_v8.xlsx · 12 rows · 316u (116 vac) · imported 2h ago" */
function pfStampHtml(key) {
  const rec = STATE && STATE.imports && STATE.imports[key];
  if (!rec || !rec.fileName) return '';
  const bits = [];
  if (rec.rows != null) bits.push(rec.rows + ' row' + (rec.rows === 1 ? '' : 's'));
  if (rec.comps != null) bits.push(rec.comps + ' comp' + (rec.comps === 1 ? '' : 's'));
  if (rec.units != null) bits.push(int(rec.units) + 'u' + (rec.vacant ? ' (' + int(rec.vacant) + ' vac)' : ''));
  if (rec.source) bits.push('via ' + rec.source);
  let abs = rec.importedAt;
  try { abs = new Date(rec.importedAt).toLocaleString(); } catch (e) { /* keep the ISO */ }
  return `<div class="pf-stamp" title="${esc(rec.fileName + ' — imported ' + abs
      + (rec.importedBy ? ' by ' + rec.importedBy : ''))}">
    <span class="pf-stamp-file">${esc(rec.fileName)}</span>${
      bits.length ? ' · ' + esc(bits.join(' · ')) : ''} · imported ${esc(relTime(rec.importedAt))}</div>`;
}

// ------------------------------------------------------------ self-install
//
// The card mounts itself at the top of tab 1 instead of being rendered from
// `renderPhase1()`. That keeps this feature to ONE file plus its stylesheet:
// ui.js does not have to know the importer exists, and deleting these two files
// removes it completely. `renderPhase1` replaces `#phase-content.innerHTML`
// wholesale on every render (and on every unit-mix edit that falls back to a
// full re-render), so an observer is what survives that — a one-time
// `prepend()` would vanish on the next keystroke.
//
// The guard is `#pf-card` already being present, so this can never double-mount,
// and it only ever fires on tab 1 of an open property.
//
// ⚠️ If ui.js is ever edited for another reason, the tidier form is two lines in
// `renderPhase1` — `${pfImportCardHtml()}` in the template and `pfWire()` after
// it — and this observer can go.
function pfMount() {
  const host = document.getElementById('phase-content');
  if (!host || host.classList.contains('hidden')) return;
  if (typeof STATE === 'undefined' || !STATE) return;
  if (typeof CURRENT_PHASE !== 'undefined' && CURRENT_PHASE !== 1) return;
  if (host.querySelector('#pf-card')) return;
  const html = pfImportCardHtml();
  if (!html) return;
  host.insertAdjacentHTML('afterbegin', html);
  pfWire();
}

function pfInstall() {
  const host = document.getElementById('phase-content');
  if (!host) { setTimeout(pfInstall, 50); return; }
  new MutationObserver(() => pfMount()).observe(host, { childList: true });
  pfMount();
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', pfInstall);
} else {
  pfInstall();
}
