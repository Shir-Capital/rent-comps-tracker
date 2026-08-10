/* ============================================================================
   Rent Comps Tracker — paste-export.js
   A paste-ready mirror of the COMPS tab: copy one rectangle out of the export
   file, paste it into the deal's proforma, land on INPUT CELLS ONLY.

   WHY THIS EXISTS
   export.js deliberately does not write into the deal workbook — round-tripping
   a 2 MB SHIR proforma through a browser Excel library risks its array formulas
   — so the handoff has always been "download JSON, then run populate_comps.py on
   a machine that has Python". This file is the other half: the same values, laid
   out on a positional mirror of the COMPS tab, so an analyst with nothing but
   Excel can move them across.

   HOW IT IS SAFE
   The mirror uses COMPS' own row and column numbering. A cell that is an input
   in the template carries our value; a cell that is a formula, a subtotal, a
   template-owned serial or simply unknown is left EMPTY. Pasted with
       Paste Special -> Values -> [x] Skip blanks
   every empty cell is a no-op, so the whole Y3:DJ87 grid crosses in one action
   and not one formula is touched.

   This is the only layout the template actually permits. Inputs interleave with
   formulas both horizontally (unit-row offsets 1-4 are inputs, 5-7 are the
   derived $/SF and Eff. columns) and vertically (the subtotal rows 15/25/.../75
   sit inside the unit bands), so no contiguous rectangle of pure inputs bigger
   than 9x4 exists anywhere on the tab. Without skip-blanks the same job is 56
   separate pastes.

   THE THREE THINGS THAT WOULD BREAK IT
   1. An empty STRING is a value. Skip blanks skips EMPTY cells; a cell holding
      '' pastes over the formula underneath it and wipes it. Nothing here may
      ever assign '' — pxPut refuses, and pxAssertMirror re-checks the finished
      sheet before it is handed to the user.
   2. COMPS row 2 is a live column-index chain (A2=1, B2=A2+1, ...). Every paste
      anchors at row 3 or below; SCHEMA.pasteMap.minRow says so and
      build_schema.py enforces it.
   3. Skip blanks cannot CLEAR. A paste can set and overwrite but never empty a
      cell, so replacing a comp slot that already holds data needs the
      Go To Special -> Constants -> Delete step the CLEAR FIRST sheet lists.
      That operation deletes typed values and leaves every formula standing,
      which is exactly the distinction we need and the reason it is one step
      rather than seven per slot.
   ========================================================================= */

'use strict';

const PX_MAP = (SCHEMA.pasteMap || {});
const PX_SHEET = PX_MAP.sheetName || 'COMPS_PASTE';
const PX_DASH_SHEET = PX_MAP.dashSheetName || 'DASH_PASTE';
const PX_MIN_ROW = PX_MAP.minRow || 3;

/* Last comp column: the template's tenth slot, not the app's eighth. The paste
   rectangle spans it so the range reads as "the whole comp grid", but slots 9-10
   are never written — they are populate_comps' pristine copy of the unit line-#
   serials, and pxIsWritable rejects them. */
function pxLastCol() {
  const slots = TAB.templateSlotBaseCols || TAB.compBaseCols || [];
  const last = slots[slots.length - 1] || 106;
  return last + (TAB.compBlockWidth || 9) - 1;
}

function pxSubtotalRows() {
  const rows = BUCKETS.map(b => b.subtotalRow);
  rows.push(TAB.rowTotals);
  return rows;
}

function pxBaseFor(col) {
  const bases = TAB.compBaseCols || [];
  const w = TAB.compBlockWidth || 9;
  for (let i = 0; i < bases.length; i++) {
    if (col >= bases[i] && col < bases[i] + w) return { base: bases[i], slot: i + 1 };
  }
  return null;
}

/**
 * The whole safety contract in one predicate: may the paste fill (row, col)?
 *
 * Driven by SCHEMA.pasteMap, which names offsets rather than numbering them, so
 * a template that renumbers one is caught by build_schema.py's assert instead of
 * by a wrong figure in a live model. Everything not explicitly allowed is
 * refused — the default has to be "no", because the failure mode of a false
 * "yes" is a destroyed formula nobody notices for weeks.
 */
function pxIsWritable(row, col) {
  if (row < PX_MIN_ROW) return false;                    // row 2 = live index chain
  if (pxSubtotalRows().indexOf(row) !== -1) return false; // every offset is a formula
  const off = TAB.offsets || {};
  const cw = PX_MAP.compWritable || {};
  const sw = PX_MAP.subjectWritable || {};
  const has = (group, name) => (cw[group] || []).indexOf(name) !== -1;

  // ---- subject band B..H -------------------------------------------------
  if (col >= 2 && col <= 8) {
    if (row === TAB.rowDetails) return (sw.detailsCols || []).indexOf(col) !== -1;
    if (row >= BUCKETS[0].startRow && row <= BUCKETS[BUCKETS.length - 1].endRow) {
      return (sw.unitCols || []).indexOf(col) !== -1;     // column G only
    }
    return false;                                         // B array formula, C/D/F/H computed
  }

  // ---- comp slots --------------------------------------------------------
  const hit = pxBaseFor(col);
  if (!hit) return false;                                 // gap, or slots 9-10
  const o = col - hit.base;
  const isOff = (group, name) => has(group, name) && off[name] === o;

  if (row === TAB.rowHeader) {
    return ['compNum', 'compName', 'compAddress'].some(n => isOff('header', n));
  }
  if (row === TAB.rowDetails) {
    return ['yearBuilt', 'distanceMiles', 'vacancyPct', 'concessionDollars',
      'wdType', 'utilStructure'].some(n => isOff('details', n));
  }
  if (row === TAB.rowCompType) {
    return ['compTypeValue', 'compSourceValue'].some(n => isOff('compType', n));
  }
  if (row >= TAB.attrRowFirst && row <= TAB.attrRowLast) {
    return ['physicalValue', 'amenityValue', 'feeLabel', 'feeValue']
      .some(n => isOff('attr', n));
  }
  const inSection = BUCKETS.some(b => row >= b.startRow && row <= b.endRow);
  if (inSection) {
    return ['unitCount', 'unitSf', 'unitOccPct', 'unitAskRent'].some(n => isOff('unit', n));
  }
  return false;
}

// ============================================================================
// The mirror
// ============================================================================

/**
 * @param {object|null} tgt  the destination workbook read by pxReadTarget(), or
 *                           null for generic mode
 */
function pxBuildMirror(tgt) {
  const cells = {};            // 'r:c' -> { v, who, what }
  const warn = [];
  const clears = [];
  const stats = { comps: 0, unitRows: 0, fees: 0, planRents: 0, cells: 0 };
  const off = TAB.offsets || {};
  const s = STATE.subject || {};

  /* The one gate every value passes through. Refusing '' is not defensive
     tidiness: skip-blanks treats an empty string as a value, so a single ''
     would paste over an array formula and blank it. Throwing (rather than
     dropping) is deliberate — a self-check that silently skips is a self-check
     that isn't there. */
  const put = (row, col, v, who, what) => {
    if (v == null || v === '') return;
    if (typeof v === 'number' && !isFinite(v)) return;
    if (!pxIsWritable(row, col)) {
      throw new Error('paste-export refused ' + colLetter(col) + row +
        ' (' + what + ') — not an input cell on ' + (TAB.templateVersion || 'this template'));
    }
    cells[row + ':' + col] = { v: v, who: who, what: what };
  };

  // ------------------------------------------------------------- subject
  const swCols = (PX_MAP.subjectWritable || {}).detailsCols || [];
  if (swCols.indexOf(7) !== -1) put(TAB.rowDetails, 7, s.wd_type || '', 'Subject', 'W/D type');
  if (swCols.indexOf(8) !== -1) put(TAB.rowDetails, 8, s.util_structure || '', 'Subject', 'Utilities');

  /* Column G, per plan, resolved BY LABEL against the destination's own column
     B. Positionally this is wrong twice over — the tracker holds one row per
     plan+finish (Lantern's 2x2 is 18 rows) while COMPS holds one per plan — and
     writing it positionally once replaced six distinct 1x1 rents with a single
     average on a real deal. Without the workbook we cannot know the rows, so
     generic mode writes nothing here and says so. */
  const byPlan = subjectMarketRentsByPlan();
  const planKeys = Object.keys(byPlan);
  if (planKeys.length) {
    if (tgt && tgt.planRows) {
      planKeys.forEach(plan => {
        const row = tgt.planRows[pxNorm(plan)];
        if (!row) { warn.push('Subject plan "' + plan + '" has no row in the workbook’s COMPS column B — market rent not written'); return; }
        put(row, TAB.subjectMktRentCol, byPlan[plan].market_rent, 'Subject', 'Mkt $/Mo — ' + plan);
        stats.planRents++;
      });
    } else {
      warn.push(planKeys.length + ' per-plan market rent' + (planKeys.length === 1 ? '' : 's') +
        ' NOT written — column G is resolved by plan label, which needs the deal workbook attached');
    }
  }

  // --------------------------------------------------------------- comps
  const comps = sortedComps();
  const bases = TAB.compBaseCols || [];
  const used = {};
  comps.forEach((c, i) => {
    /* Slot assignment. With the workbook we reuse the slot that already carries
       this comp's name, so a re-export updates in place instead of duplicating
       it into the next free column; without it we fall back to export order,
       which is what the Cell Map has always assumed. */
    let slot = i;
    if (tgt) {
      const match = tgt.slotByName[pxNorm(c.name || '')];
      if (match != null) slot = match;
      else {
        slot = -1;
        for (let k = 0; k < bases.length; k++) {
          if (!used[k] && !tgt.slotNames[k]) { slot = k; break; }
        }
        if (slot === -1) {
          for (let k = 0; k < bases.length; k++) if (!used[k]) { slot = k; break; }
        }
      }
    }
    if (slot < 0 || slot >= bases.length || used[slot]) {
      warn.push('Comp "' + (c.name || '(unnamed)') + '" overflows the ' + bases.length +
        '-slot COMPS grid — NOT written');
      return;
    }
    used[slot] = true;
    const base = bases[slot];
    const who = 'Comp ' + (slot + 1) + ': ' + (c.name || '(unnamed)');
    stats.comps++;

    if (tgt && tgt.slotNames[slot] && pxNorm(tgt.slotNames[slot]) !== pxNorm(c.name || '')) {
      warn.push('Slot ' + (slot + 1) + ' (' + colLetter(base) + ') currently holds "' +
        tgt.slotNames[slot] + '" and will be replaced by "' + (c.name || '(unnamed)') + '"');
    }

    put(TAB.rowHeader, base + off.compNum, slot + 1, who, 'Comp #');
    put(TAB.rowHeader, base + off.compName, c.name || '', who, 'Comp name');
    put(TAB.rowHeader, base + off.compAddress, streetOnly(c.address), who, 'Street address');

    put(TAB.rowDetails, base + off.yearBuilt, numOrNull(c.year_built), who, 'Year built');
    /* Rounded, matching the populator: a live record once carried 635.4 units. */
    put(TAB.rowDetails, base + off.distanceMiles, numOrNull(c.distance_miles), who, 'Distance (mi)');
    put(TAB.rowDetails, base + off.vacancyPct, pctToFraction(c.vacancy_pct), who, 'Vacancy % (property)');
    put(TAB.rowDetails, base + off.concessionDollars,
      numOrNull(c.concession_amount) != null ? numOrNull(c.concession_amount) : concessionFromMonths(c),
      who, 'Concession $ (one-time)');
    /* Offsets 6-7 ARE written here, and this is the one place the paste does
       more than populate_comps does. They are validated dropdowns the populator
       leaves to the analyst; we fill them because the tracker captured them
       standing in the leasing office, which beats a desk guess. They are listed
       on READ ME so nobody is surprised to find their dropdown moved. */
    put(TAB.rowDetails, base + off.wdType, c.wd_type || '', who, 'W/D type (dropdown)');
    put(TAB.rowDetails, base + off.utilStructure, c.util_structure || '', who, 'Utilities (dropdown)');

    put(TAB.rowCompType, base + off.compTypeValue,
      c.category ? categoryMeta(c.category).label : '', who, 'Comp Type');
    put(TAB.rowCompType, base + off.compSourceValue, c.source || '', who, 'Comp Source');

    BUCKETS.forEach(b => {
      const rows = (groupByBucket(c.unitMix)[b.key] || []).filter(rowHasData);
      rows.forEach((r, j) => {
        const row = b.startRow + j;
        if (row > b.endRow) {
          warn.push(who + ': ' + b.short + ' section is full (' +
            (b.endRow - b.startRow + 1) + ' rows) — "' + (r.plan || 'row ' + (j + 1)) + '" dropped');
          return;
        }
        const tag = b.short + ' ' + (r.plan || '#' + (j + 1));
        /* Offset 0 — the unit line-# serial — is never written. populate_comps
           v34+ RESTORES the template's own section-prefixed serials from the
           pristine slot 9; the template already has them, and asserting our own
           produced 59 false mismatches on one Lantern reconciliation. */
        put(row, base + off.unitCount, numOrNull(r.count), who, tag + ' — # units');
        put(row, base + off.unitSf, numOrNull(r.sqft), who, tag + ' — SF');
        /* A literal 0 poisons the section SUMPRODUCT exactly the way a
           half-filled section does, and a 0%-occupied floor plan is not a
           thing — so an uncaptured Occ % stays blank rather than becoming 0. */
        const occ = pctToFraction(r.occ_pct);
        if (occ) put(row, base + off.unitOccPct, occ, who, tag + ' — Occ %');
        put(row, base + off.unitAskRent, numOrNull(r.ask_rent), who, tag + ' — Ask $/Mo');
        stats.unitRows++;
      });
    });

    PHYSICAL.forEach(pa => put(pa.row, base + off.physicalValue, c.physical[pa.key] || '', who, pa.label));
    AMENITIES.forEach(am => put(am.row, base + off.amenityValue, c.amenities[am.key] || '', who, am.label));

    // ---- FEES: a fee's identity is its LABEL, never its row ---------------
    const fees = (SCHEMA.fees || []).filter(f => f.compsLabel &&
      numOrNull(c.fees[f.key]) != null && numOrNull(c.fees[f.key]) !== '');
    if (fees.length) {
      const labels = tgt ? (tgt.feeLabels[slot] || {}) : null;
      /* Rows the destination already labels for this comp, so we write the
         value and leave the label alone. Analysts free-type these (Lantern comp
         2 carries "V Trash" where comp 1 has the v7 defaults) and the fee column
         is summed into every unit's Eff. $/Mo, so writing the same fee onto a
         second row would double-charge the comp with nothing on screen to say
         why. */
      const taken = {};
      const spare = [];
      if (labels) {
        for (let r = TAB.feeRowFirst; r <= TAB.feeRowLast; r++) {
          if (!labels[r]) spare.push(r);
        }
      }
      fees.forEach(f => {
        const v = numOrNull(c.fees[f.key]);
        let row = null;
        if (labels) {
          for (let r = TAB.feeRowFirst; r <= TAB.feeRowLast; r++) {
            if (!taken[r] && labels[r] && pxNorm(labels[r]) === pxNorm(f.compsLabel)) { row = r; break; }
          }
          if (row) {
            taken[row] = true;
            put(row, base + off.feeValue, v, who, 'Fee — ' + f.compsLabel + ' (existing row)');
            stats.fees++;
            return;
          }
          row = spare.shift() || null;
          if (row == null) {
            warn.push(who + ': fee "' + f.compsLabel + '" ($' + v + ') NOT written — ' +
              'no free labelled row (' + TAB.feeRowFirst + '-' + TAB.feeRowLast + ') left on that comp');
            return;
          }
        } else {
          /* Generic mode. The template pre-labels the first rows and leaves the
             rest as blank dropdowns, so we write label + value as a pair, in
             fee order, from the top. Self-consistent on a fresh workbook; on a
             used one it can duplicate a fee the analyst already typed further
             down, which is why the READ ME points at the aligned export and the
             CLEAR FIRST sheet lists the fee band. */
          row = TAB.feeRowFirst + Object.keys(taken).length;
          if (row > TAB.feeRowLast) {
            warn.push(who + ': fee "' + f.compsLabel + '" ($' + v + ') NOT written — ' +
              'more fees than labelled rows');
            return;
          }
          taken[row] = true;
        }
        put(row, base + off.feeLabel, f.compsLabel, who, 'Fee label — ' + f.compsLabel);
        put(row, base + off.feeValue, v, who, 'Fee — ' + f.compsLabel);
        stats.fees++;
      });
    }

    /* CLEAR FIRST. Only for a slot that already holds data — on a fresh template
       the step does not arise. One range per slot: Go To Special -> Constants
       spares the subtotal rows inside it, so this stays one selection instead of
       the seven a blind Delete would need. */
    if (tgt && tgt.slotHasData[slot]) {
      const u = [off.unitCount, off.unitSf, off.unitOccPct, off.unitAskRent].sort((a, b2) => a - b2);
      clears.push({
        what: 'Comp ' + (slot + 1) + ' — ' + (tgt.slotNames[slot] || '(unnamed)') + ' — unit rows',
        range: colLetter(base + u[0]) + BUCKETS[0].startRow + ':' +
          colLetter(base + u[u.length - 1]) + BUCKETS[BUCKETS.length - 1].endRow,
      });
    }
    if (!tgt && fees.length) {
      clears.push({
        what: 'Comp ' + (slot + 1) + ' — fee labels + $ (generic mode only)',
        range: colLetter(base + off.feeLabel) + TAB.feeRowFirst + ':' +
          colLetter(base + off.feeValue) + TAB.feeRowLast,
      });
    }
  });

  stats.cells = Object.keys(cells).length;
  return { cells: cells, warn: warn, clears: clears, stats: stats, aligned: !!tgt, tgt: tgt };
}

function pxNorm(v) {
  return String(v == null ? '' : v).toLowerCase().replace(/[^a-z0-9]+/g, '');
}

// ============================================================================
// Reading the destination workbook (alignment mode)
// ============================================================================

function pxCell(ws, r, c) { return ws[XLSX.utils.encode_cell({ r: r - 1, c: c - 1 })]; }
function pxV(ws, r, c) { const x = pxCell(ws, r, c); return x ? x.v : undefined; }
function pxS(ws, r, c) { const v = pxV(ws, r, c); return typeof v === 'string' ? v.trim() : ''; }
function pxN(ws, r, c) { const v = pxV(ws, r, c); return typeof v === 'number' && isFinite(v) ? v : null; }

/**
 * Everything the mirror needs that only the destination knows: which row carries
 * which subject plan, which slot holds which comp, and which fee row each comp
 * labels with what.
 */
function pxReadTarget(buf, fileName) {
  const wb = XLSX.read(new Uint8Array(buf), { type: 'array', cellNF: true, cellStyles: false });
  const ws = wb.Sheets['COMPS'];
  if (!ws) throw new Error('That workbook has no COMPS tab.');

  /* Guard 1 — the openpyxl cache trap, and the reason it matters MORE here than
     on import. Column B is an array formula; a workbook whose last writer was a
     script carries no cached results, so every plan label reads empty, every
     by-label match misses, and the export would quietly come back with no
     market rents and no fee alignment — looking like a clean run. */
  const totalUnits = pxN(ws, TAB.rowTotals, TAB.subjectUnitCountCol);
  if (pxS(ws, TAB.rowTotals, 2).toLowerCase().indexOf('tot') === -1) {
    throw new Error('COMPS!B' + TAB.rowTotals + ' does not read "Tot./Avg." — this is not a ' +
      (TAB.templateVersion || 'SHIR MF') + ' layout, or the geometry moved.');
  }
  if (totalUnits == null) {
    throw new Error('This workbook has no calculated values — it was last written by a script. ' +
      'Open it in Excel, save, and try again.');
  }

  /* Guard 2 — geometry by label, never by filename or row number. The same
     check that caught both historical geometry bugs. */
  const geomErrs = [];
  if (pxS(ws, TAB.rowAttrHeader, 2).toLowerCase().indexOf('physical') === -1) geomErrs.push('B' + TAB.rowAttrHeader + ' != "Physical Attributes"');
  BUCKETS.forEach(b => {
    if (pxS(ws, b.subtotalRow, 2) !== b.compsLabel) {
      geomErrs.push('B' + b.subtotalRow + ' reads "' + pxS(ws, b.subtotalRow, 2) + '", expected "' + b.compsLabel + '"');
    }
  });
  if (geomErrs.length) throw new Error('COMPS geometry does not match the schema: ' + geomErrs.join('; '));

  const planRows = {};
  const planList = [];
  BUCKETS.forEach(b => {
    for (let r = b.startRow; r <= b.endRow; r++) {
      const nm = pxS(ws, r, 2);
      if (!nm || nm === '0') continue;
      if (!planRows[pxNorm(nm)]) { planRows[pxNorm(nm)] = r; planList.push({ plan: nm, row: r }); }
    }
  });

  const bases = TAB.compBaseCols || [];
  const off = TAB.offsets || {};
  const slotNames = [], slotByName = {}, feeLabels = [], slotHasData = [];
  bases.forEach((base, i) => {
    const nm = pxS(ws, TAB.rowHeader, base + off.compName);
    slotNames[i] = nm;
    if (nm) slotByName[pxNorm(nm)] = i;
    const labels = {};
    for (let r = TAB.attrRowFirst; r <= TAB.attrRowLast; r++) {
      const lb = pxS(ws, r, base + off.feeLabel);
      if (lb) labels[r] = lb;
    }
    feeLabels[i] = labels;
    let hasData = !!nm;
    if (!hasData) {
      for (let r = BUCKETS[0].startRow; r <= BUCKETS[BUCKETS.length - 1].endRow && !hasData; r++) {
        if (pxN(ws, r, base + off.unitCount) || pxN(ws, r, base + off.unitAskRent)) hasData = true;
      }
    }
    slotHasData[i] = hasData;
  });

  return {
    fileName: fileName || 'workbook.xlsx',
    totalUnits: totalUnits,
    planRows: planRows, planList: planList,
    slotNames: slotNames, slotByName: slotByName,
    feeLabels: feeLabels, slotHasData: slotHasData,
  };
}

// ============================================================================
// The workbook
// ============================================================================

const PX_INK = 'FFFFC7CE';   // the template's own comp-input pink

function pxAssertMirror(ws, cells) {
  /* Belt and braces: re-read the finished sheet rather than trusting the writer
     that just filled it. Two failures matter — a value on a non-input cell, and
     an empty string, which skip-blanks would happily paste over a formula. */
  let n = 0;
  ws.eachRow({ includeEmpty: false }, (row, rowNum) => {
    row.eachCell({ includeEmpty: false }, (cell, colNum) => {
      /* Row 1 is the banner and column A is the human-readable spine. Both sit
         outside every named range (PASTE_COMPS starts at Y3, PASTE_SUBJECT at
         B3), so neither can reach the workbook — and neither is counted. */
      if (rowNum === 1 || colNum === 1) return;
      const v = cell.value;
      if (v == null) return;
      if (v === '') throw new Error('paste-export: empty string at ' + colLetter(colNum) + rowNum +
        ' — skip-blanks would paste it over a formula');
      if (!pxIsWritable(rowNum, colNum)) {
        throw new Error('paste-export: ' + colLetter(colNum) + rowNum + ' is not an input cell');
      }
      n++;
    });
  });
  if (n !== Object.keys(cells).length) {
    throw new Error('paste-export: wrote ' + n + ' cells, expected ' + Object.keys(cells).length);
  }
  return n;
}

async function pxBuildWorkbook(mirror) {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'SHIR Rent Comps Tracker';
  wb.created = new Date();
  const font = { name: BRAND.font || 'Arial Narrow', size: BRAND.fontSize || 11 };
  const s = STATE.subject || {};
  const lastCol = pxLastCol();

  // ------------------------------------------------------------- READ ME
  {
    const ws = wb.addWorksheet('READ ME');
    const W = 4;
    titleRow(ws, 'PASTE INTO THE PROFORMA — ' + (s.name || STATE.name) + ' — ' + todayISO(), W);
    const line = (a, b, bold) => {
      const r = ws.addRow([a, b]);
      r.getCell(1).font = Object.assign({}, font, { bold: !!bold });
      r.getCell(2).font = font;
      r.getCell(2).alignment = { wrapText: true, vertical: 'top' };
      return r;
    };
    ws.addRow([]);
    line('STEP 1', 'In THIS file: click the Name Box (left of the formula bar), type PASTE_COMPS, press Enter, then Ctrl+C.', true);
    line('STEP 2', 'In the DEAL workbook, COMPS tab: click cell Y3, then Alt E S  →  choose Values  →  tick "Skip blanks"  →  OK.', true);
    line('STEP 3', 'Repeat with PASTE_SUBJECT, pasting at cell B3. (Per-plan market rents, W/D, utilities.)', true);
    ws.addRow([]);
    line('WHY SKIP BLANKS', 'Every formula cell is left EMPTY in this file, so "Skip blanks" makes the paste a no-op on all of them. '
      + 'Without that tick the paste will destroy the subtotal rows, the Eff. $/Mo columns and column B’s array formula. It is not optional.', true);
    line('IT CANNOT CLEAR', 'A paste can set and overwrite but never empty a cell. If a comp slot already holds data, do the CLEAR FIRST sheet first.', true);
    ws.addRow([]);
    line('Built against', TAB.templateVersion || 'SHIR_MF_Template_v9');
    line('Mode', mirror.aligned
      ? 'ALIGNED to ' + mirror.tgt.fileName + ' — fee rows and subject plan rows resolved against that workbook'
      : 'GENERIC — no workbook attached. Per-plan market rents are NOT written and fee labels use the template default rows.');
    line('Cells written', String(mirror.stats.cells));
    line('Comps', String(mirror.stats.comps));
    line('Unit rows', String(mirror.stats.unitRows));
    line('Fees', String(mirror.stats.fees));
    line('Per-plan market rents', mirror.aligned ? String(mirror.stats.planRents) : '0 (needs the workbook)');
    ws.addRow([]);
    line('ALSO WRITTEN', 'Row 4 W/D type and Utilities are validated dropdowns that populate_comps deliberately leaves alone. '
      + 'This export DOES write them, from what was captured on site. If you would rather keep the desk values, clear those two cells in this file before copying.', true);
    ws.addRow([]);
    const wh = ws.addRow(['WARNINGS', mirror.warn.length ? '' : 'none']);
    wh.getCell(1).font = Object.assign({}, font, { bold: true });
    wh.getCell(2).font = font;
    mirror.warn.forEach(w => {
      const r = ws.addRow(['', w]);
      r.getCell(2).font = font;
      r.getCell(2).alignment = { wrapText: true, vertical: 'top' };
    });
    ws.columns = [{ width: 24 }, { width: 96 }];
  }

  // --------------------------------------------------------- COMPS_PASTE
  const ws = wb.addWorksheet(PX_SHEET);
  ws.getCell(1, 1).value = 'MIRROR OF THE COMPS TAB — same rows, same columns. Select PASTE_COMPS / PASTE_SUBJECT from the Name Box; do not copy whole columns.';
  ws.getCell(1, 1).font = { name: BRAND.font || 'Arial Narrow', size: 11, bold: true, color: { argb: ARGB(BRAND.navy || '1D2D47') } };

  Object.keys(mirror.cells).forEach(k => {
    const parts = k.split(':');
    const r = Number(parts[0]), c = Number(parts[1]);
    const cell = ws.getCell(r, c);
    cell.value = mirror.cells[k].v;
    cell.font = font;
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: PX_INK } };
  });

  /* Row 5's headers and the comp names on row 3 are NOT written into the mirror
     — they are template text, and a mirror that carries them would paste them
     back over themselves for no reason. Column A instead carries a read-only
     spine so a human scrolling this sheet can see which row is which. It sits
     outside every named range. */
  ws.getCell(TAB.rowHeader, 1).value = 'row 3 — names';
  ws.getCell(TAB.rowDetails, 1).value = 'row 4 — details';
  BUCKETS.forEach(b => {
    ws.getCell(b.startRow, 1).value = b.short + ' rows ' + b.startRow + '-' + b.endRow;
    ws.getCell(b.subtotalRow, 1).value = '(subtotal — never written)';
  });
  ws.getCell(TAB.rowTotals, 1).value = '(Tot./Avg. — never written)';
  ws.getCell(TAB.rowCompType, 1).value = 'row 77 — type/source';
  ws.getCell(TAB.attrRowFirst, 1).value = 'attrs / amenities / fees';
  for (let r = 1; r <= TAB.attrRowLast; r++) {
    const c = ws.getCell(r, 1);
    if (c.value != null && r !== 1) c.font = { name: BRAND.font || 'Arial Narrow', size: 9, italic: true, color: { argb: 'FF64748B' } };
  }

  const written = pxAssertMirror(ws, mirror.cells);
  if (written !== mirror.stats.cells) throw new Error('paste-export: mirror count drift');

  ws.getColumn(1).width = 22;
  for (let c = 2; c <= lastCol; c++) ws.getColumn(c).width = 11;
  ws.views = [{ state: 'frozen', xSplit: 1, ySplit: 5 }];

  // ---------------------------------------------------------- DASH_PASTE
  {
    const d = wb.addWorksheet(PX_DASH_SHEET);
    d.getCell(1, 1).value = 'MIRROR OF THE DASH TAB — E5:E9 only. E10 (units) and E18 (occupancy) are formulas off RR and are left empty on purpose.';
    d.getCell(1, 1).font = { name: BRAND.font || 'Arial Narrow', size: 11, bold: true, color: { argb: ARGB(BRAND.navy || '1D2D47') } };
    const vals = {
      name: s.name || STATE.name || '',
      street: streetOnly(s.address),
      citystzip: [s.city, [s.state, s.zip].filter(Boolean).join(' ')].filter(Boolean).join(', '),
      msa: s.msa || '',
      year_built: numOrNull(s.year_built),
    };
    (PX_MAP.dashCells || []).forEach(dc => {
      const v = vals[dc.field];
      if (v == null || v === '') return;
      const cell = d.getCell(dc.row, dc.col);
      cell.value = v;
      cell.font = font;
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: PX_INK } };
      d.getCell(dc.row, 3).value = dc.label;
      d.getCell(dc.row, 3).font = { name: BRAND.font || 'Arial Narrow', size: 9, italic: true, color: { argb: 'FF64748B' } };
    });
    d.getColumn(3).width = 20;
    d.getColumn(5).width = 34;
  }

  // ---------------------------------------------------------- CLEAR FIRST
  if (mirror.clears.length) {
    const cw = wb.addWorksheet('CLEAR FIRST');
    titleRow(cw, 'CLEAR THESE RANGES BEFORE PASTING — ' + (s.name || STATE.name), 3);
    cw.addRow([]);
    const note = cw.addRow(['', 'Select the range in the DEAL workbook, press F5 → Special → Constants → OK, then Delete. '
      + 'That removes typed values ONLY and leaves every formula standing — which is why this is one selection per comp and not seven. '
      + 'Needed because a paste with "Skip blanks" can overwrite a cell but never empty one, so a stale row below your new rows would survive.']);
    note.getCell(2).font = font;
    note.getCell(2).alignment = { wrapText: true, vertical: 'top' };
    cw.addRow([]);
    cw.addRow(['#', 'Range', 'What']);
    styleHeaderRow(cw, 5, 3);
    mirror.clears.forEach((c, i) => {
      const r = cw.addRow([i + 1, c.range, c.what]);
      r.eachCell(cell => { cell.font = font; });
    });
    cw.columns = [{ width: 5 }, { width: 18 }, { width: 70 }];
  }

  // -------------------------------------------------------- named ranges
  (PX_MAP.regions || []).forEach(reg => {
    if (reg.sheet === PX_DASH_SHEET || reg.sheet === PX_SHEET) {
      wb.definedNames.add(reg.sheet + '!' + reg.range, reg.name);
    }
  });

  return wb;
}

// ============================================================================
// Actions
// ============================================================================

function pxFileName() { return exportFileBase() + '_PASTE.xlsx'; }

async function pxExport(tgt) {
  const mirror = pxBuildMirror(tgt);
  const wb = await pxBuildWorkbook(mirror);
  const buf = await wb.xlsx.writeBuffer();
  const mime = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
  downloadBlob(new Blob([buf], { type: mime }), pxFileName());
  toast(mirror.stats.cells + ' cells' + (mirror.warn.length ? ' · ' + mirror.warn.length + ' warning' + (mirror.warn.length === 1 ? '' : 's') : '')
    + (mirror.aligned ? ' · aligned' : ' · generic'));
  return mirror;
}

function pxPickWorkbook() {
  return new Promise(resolve => {
    const inp = document.createElement('input');
    inp.type = 'file';
    inp.accept = '.xlsx,.xlsm';
    inp.onchange = () => {
      const f = inp.files && inp.files[0];
      if (!f) { resolve(null); return; }
      const rd = new FileReader();
      rd.onload = () => resolve({ buf: rd.result, name: f.name });
      rd.onerror = () => resolve(null);
      rd.readAsArrayBuffer(f);
    };
    inp.click();
  });
}

// ============================================================================
// Tab 4 card — appended to whatever export.js rendered
// ============================================================================

function pxRenderCard() {
  const host = document.getElementById('phase-content');
  if (!host || document.getElementById('px-card')) return;
  const stamp = (STATE.imports && STATE.imports.subject && STATE.imports.subject.fileName) || '';

  const card = document.createElement('div');
  card.className = 'card';
  card.id = 'px-card';
  card.innerHTML = `
    <div class="card-head"><span class="grow">Or: paste it in yourself (no Python)</span></div>
    <div class="card-body">
      <div class="muted small" style="margin-bottom:9px">
        Builds a workbook that <b>mirrors the COMPS tab position for position</b>. Copy one
        rectangle, paste it into the deal file with <b>Paste Special → Values → ☑ Skip blanks</b>,
        and it lands on input cells only — every formula, subtotal and dropdown survives, because
        this file leaves those cells empty.
      </div>
      <div class="stack">
        <button class="btn primary" id="px-btn-aligned">⧉ Paste-Ready Excel — attach the deal workbook</button>
        <button class="btn" id="px-btn-generic">⧉ Paste-Ready Excel — generic (fresh template)</button>
      </div>
      <div class="tiny muted" style="margin-top:7px">
        <b>Attach the workbook</b> whenever you have it${stamp ? ' (you imported <b>' + esc(stamp) + '</b> earlier)' : ''}: only the
        destination knows which row carries which floor plan and which fee label sits on which
        row, so the aligned export is the one that can write <b>column G per-plan market rents</b>
        and drop fees onto the comp's own labels instead of renumbering them. Generic mode skips
        both and says so on the READ ME sheet.
      </div>
      <div id="px-out" class="tiny" style="margin-top:8px"></div>
    </div>`;
  host.appendChild(card);

  const out = card.querySelector('#px-out');
  const show = (mirror) => {
    const w = mirror.warn;
    out.innerHTML = `<div class="chk ${w.length ? 'warn' : 'ok'}"><span class="ico">${w.length ? '!' : '✔'}</span>
      <span><b>${mirror.stats.cells}</b> cells · ${mirror.stats.comps} comps · ${mirror.stats.unitRows} unit rows ·
      ${mirror.stats.fees} fees · ${mirror.stats.planRents} per-plan rents${mirror.aligned ? '' : ' (generic)'}</span></div>`
      + (w.length ? '<ul class="tiny muted" style="margin:6px 0 0 16px">' + w.map(x => '<li>' + esc(x) + '</li>').join('') + '</ul>' : '');
  };
  const fail = (e) => {
    console.error('paste-export', e);
    out.innerHTML = `<div class="chk err"><span class="ico">✖</span><span>${esc(e.message || String(e))}</span></div>`;
    toast('Paste export failed');
  };

  card.querySelector('#px-btn-generic').onclick = async () => {
    try { show(await pxExport(null)); } catch (e) { fail(e); }
  };
  card.querySelector('#px-btn-aligned').onclick = async () => {
    try {
      const picked = await pxPickWorkbook();
      if (!picked) return;
      toast('Reading ' + picked.name + '…');
      const tgt = pxReadTarget(picked.buf, picked.name);
      show(await pxExport(tgt));
    } catch (e) { fail(e); }
  };
}

/* Same trick screener.js uses on renderPhase3: renderPhase4 is a global function
   declaration in export.js, so reassigning window.renderPhase4 after it loads
   re-points ui.js's existing call site without touching a 56 KB file. */
(function () {
  const inner = window.renderPhase4;
  if (typeof inner !== 'function') { console.warn('paste-export: renderPhase4 missing'); return; }
  window.renderPhase4 = function () {
    inner.apply(this, arguments);
    try { pxRenderCard(); } catch (e) { console.error('paste-export card', e); }
  };
})();
