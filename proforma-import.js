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

let PF = { step: 'idle', busy: '', files: [], pickId: '', parsed: null, error: '' };

function pfResetImport() {
  PF = { step: 'idle', busy: '', files: [], pickId: '', parsed: null, error: '' };
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
  const FEE_ROWS = (SCHEMA.fees || []).filter(f => f.compsRow);

  const subject = {
    name: det.subject.name || '',
    year_built: pfNumStr(det.subject.year_built),
    total_units: pfNumStr(det.subject.units_stated),
    occupancy_pct: '',
    wd_type: pfOption(det.subject.wd, SCHEMA.wdTypes),
    util_structure: pfOption(det.subject.util, SCHEMA.utilStructures),
  };
  const vac = pfN(det.subject.vacancy);
  if (vac !== null && vac >= 0 && vac <= 1.5) {
    subject.occupancy_pct = String(Number(((1 - vac) * 100).toFixed(1)));
  }

  const subjectUnitMix = det.subject.types.map(t => ({
    id: uid(), plan: t.plan,
    beds: pfNumStr(t.bb ? t.bb[0] : null), baths: pfNumStr(t.bb ? t.bb[1] : null),
    sqft: pfNumStr(t.sf), count: pfNumStr(t.units),
    status: '', current_rent: pfNumStr(t.eff_mo, 0),
  }));

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
    (c.fees || []).slice(0, FEE_ROWS.length).forEach(([lbl, val], i) => {
      const f = FEE_ROWS[i];
      if (pfN(val) !== null) comp.fees[f.key] = pfNumStr(val);
      else if (pfS(val)) notes.push('Fee ' + lbl + ': ' + pfS(val));
      if (pfS(lbl) && lbl.toLowerCase() !== f.label.toLowerCase()
          && (pfN(val) !== null || pfS(val))) {
        notes.push('Fee row ' + (i + 1) + ' is labelled "' + lbl + '" in the proforma (tracker key: ' + f.label + ')');
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

  return { subject, subjectUnitMix, comps, marketRents, warnings: warn, stride: det.stride };
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
      ${linked ? '' : '<div class="tiny muted" style="margin-top:6px">Link a Drive deal folder first — the proformas are read from it.</div>'}`;
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
    ['name', 'Property name'], ['year_built', 'Year built'], ['total_units', 'Total units'],
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

  return `
    <div class="kv"><span class="k">Source</span><span class="v">${esc(f ? f.name : '—')}</span></div>
    <div class="kv"><span class="k">Comp block geometry</span>
      <span class="v">${p.stride === 9 ? 'MF v7 (9-col)' : 'ExStay (' + p.stride + '-col)'}</span></div>
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
    <div class="btn-row" style="margin-top:9px">
      <button class="btn primary small" id="btn-pf-apply">Apply checked</button>
      <button class="btn small" id="btn-pf-back">Back</button>
      <button class="btn small" id="btn-pf-cancel">Cancel</button>
    </div>`;
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
  on('btn-pf-back', () => { PF.step = 'list'; PF.parsed = null; pfRerender(); });
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
    PF.parsed = pfToImport(pfReadComps(wb.Sheets[sheet]));
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

  const lost = [];
  if (doMix && (STATE.subjectUnitMix || []).length) lost.push(STATE.subjectUnitMix.length + ' subject plan(s)');
  if (doComps && (STATE.comps || []).length) lost.push(STATE.comps.length + ' captured comp(s)');
  if (lost.length && !confirm('This replaces ' + lost.join(' and ') + '.\n\nContinue?')) return;

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

  const f = pfPickedFile();
  const stamp = 'Imported ' + applied.join(', ') + ' from ' + (f ? f.name : 'a proforma')
    + ' on ' + todayISO() + '.';
  STATE.subject.notes = (STATE.subject.notes ? STATE.subject.notes + '\n' : '') + stamp;

  saveState();
  pfResetImport();
  toast('Imported ' + applied.join(' · '));
  renderPhase1();
}
