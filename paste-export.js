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
   every empty cell is a no-op, so the whole comp grid (Y3:DJ269 on the current
   template) crosses in one action and not one formula is touched.

   This is the only layout the template actually permits. Inputs interleave with
   formulas both horizontally (unit-row offsets 1-4 are inputs, 5-7 are the
   derived $/SF and Eff. columns) and vertically (the subtotal rows sit inside
   the unit bands — 25/50/.../175 on the current template), so no contiguous
   rectangle of pure inputs bigger
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

/* THE ATTRIBUTE BAND OF THE WORKBOOK BEING TARGETED (2026-11-19).
   MF v73 / ExStay v69 re-ordered the Physical / Amenities band ('Key
   Attributes' first, three Amenities rows retired) and the schema now carries
   those rows. Most pipeline deals are still on v72 or older, whose band has the
   SAME labels on DIFFERENT rows. So in aligned mode every field's row, and the
   band bounds pxIsWritable() checks, come from the target workbook BY LABEL
   (pxReadBand); in generic mode (no workbook picked) they are the schema's,
   i.e. a v73 / v69 layout. Set by pxBuildMirror and pxBuildWorkbook, the two
   places that call pxIsWritable, so the writer and the self-check agree. */
let PX_BAND = null;
function pxBounds() {
  if (PX_BAND) return PX_BAND;
  return { physFirst: TAB.physRowFirst, physLast: TAB.physRowLast,
           amenFirst: TAB.amenRowFirst, amenLast: TAB.amenRowLast,
           feeFirst: TAB.feeRowFirst, feeLast: TAB.feeRowLast };
}
/** The row a band item lands on: the target's, by label, else the schema's. */
function pxAttrRow(kind, item) {
  if (PX_BAND) return PX_BAND[kind][item.key] || null;
  return item.row;
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
    /* The subject's attribute band (2026-11-17). Its columns are NAMED in
       compsTab.subjectAttrCols (the subject block is packed into B:H and does
       not share the comp offsets) and listed in subjectWritable.attr; each
       column is allowed only inside its OWN band's rows, exactly as the comp
       side does with isOff(). B and D, the template's labels, can never match,
       and build_schema.py refuses a map that would point at them. */
    const sac = TAB.subjectAttrCols || {};
    const sIs = name => (sw.attr || []).indexOf(name) !== -1 && sac[name] === col;
    const bb = pxBounds();
    if (row >= bb.physFirst && row <= bb.physLast && sIs('physicalValue')) return true;
    if (row >= bb.amenFirst && row <= bb.amenLast && sIs('amenityValue')) return true;
    if (row >= bb.feeFirst && row <= bb.feeLast && (sIs('feeLabel') || sIs('feeValue'))) return true;
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
  /* v41+: Physical / Amenities / FEES share a start row but are INDEPENDENTLY
     SIZED below that (on MF v57: Physical 201-224, Amenities 201-270, FEES
     201-218 — and ExStay v38 puts the same bands 86 rows higher, which is why
     nothing here may hardcode them —
     Mandatory 201-205 only). They are checked as three separate bands, never
     as one combined attrRowFirst..attrRowLast span (retired) — that shared
     span is exactly the assumption that broke populate_comps-v43 against this
     template. The bands overlap in row-space by design; the column offset
     (isOff) is what actually disambiguates which field a cell belongs to. */
  const bnd = pxBounds();
  const inPhys = row >= bnd.physFirst && row <= bnd.physLast && isOff('attr', 'physicalValue');
  const inAmen = row >= bnd.amenFirst && row <= bnd.amenLast && isOff('attr', 'amenityValue');
  const inFee = row >= bnd.feeFirst && row <= bnd.feeLast &&
    (isOff('attr', 'feeLabel') || isOff('attr', 'feeValue'));
  if (inPhys || inAmen || inFee) return true;
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
  const stats = { comps: 0, unitRows: 0, fees: 0, planRents: 0, cells: 0, subjectAttrs: 0, subjectFees: 0 };
  const off = TAB.offsets || {};
  const s = STATE.subject || {};
  PX_BAND = tgt && tgt.band ? tgt.band : null;

  /* One band value. Its row is the target workbook's (by label) in aligned
     mode, the schema's in generic mode. A field the target's band does not
     carry is skipped and counted, never guessed onto a neighbouring row. */
  const noRow = {};
  const putAttr = (kind, item, col, v, who) => {
    const row = pxAttrRow(kind, item);
    if (!row) {
      if (v !== '' && v != null) noRow[item.label] = (noRow[item.label] || 0) + 1;
      return;
    }
    put(row, col, v, who, item.label);
  };

  /* The one gate every value passes through. Refusing '' is not defensive
     tidiness: skip-blanks treats an empty string as a value, so a single ''
     would paste over an array formula and blank it. Throwing (rather than
     dropping) is deliberate — a self-check that silently skips is a self-check
     that isn't there. */
  const formulaSkips = [];
  const put = (row, col, v, who, what) => {
    if (v == null || v === '') return;
    if (typeof v === 'number' && !isFinite(v)) return;
    /* Aligned mode: the deal workbook computes this cell, so a value pasted
       here would replace its formula. Skipped and reported — see the
       formulaCells note in pxReadTarget(). Generic mode has no workbook to ask. */
    if (tgt && tgt.formulaCells && tgt.formulaCells.has(row + ':' + col)) {
      formulaSkips.push(colLetter(col) + row + ' (' + who + ' — ' + what + ')');
      return;
    }
    if (!pxIsWritable(row, col)) {
      throw new Error('paste-export refused ' + colLetter(col) + row +
        ' (' + what + ') — not an input cell on ' + (TAB.templateVersion || 'this template'));
    }
    cells[row + ':' + col] = { v: v, who: who, what: what };
  };

  /* FEES: a fee's identity is its LABEL, never its row. Shared by every comp
     slot AND the subject (2026-11-17): the two must route a fee identically,
     and before this the logic lived inline in the comp loop. `labels` is the
     destination's existing labels for this block ({row: text}) or null for
     generic mode; labelCol/valueCol are absolute columns. Returns how many fees
     were captured and how many were placed. */
  const putFees = (feeBag, labels, labelCol, valueCol, who) => {
    const FF = pxBounds().feeFirst, FL = pxBounds().feeLast;
    /* The five fixed fees, then the named mandatory fees (fees.extra, open slots on v76) as {compsLabel, v}:
       the same routing — the row already carrying that label, else the first blank-label Mandatory row — so a
       re-paste reuses the slot that has the name, exactly as populate_comps-v54 does. */
    const extra = extraFeesOf(feeBag)
      .filter(x => String(x.label).trim() !== '' && numOrNull(x.amount) != null && numOrNull(x.amount) !== '' && Number(numOrNull(x.amount)) !== 0)   // $0 = 'no such fee': kept on the record, not given a slot
      .map(x => ({ key: null, compsLabel: String(x.label).trim(), v: numOrNull(x.amount) }));
    extraFeesOf(feeBag).filter(x => String(x.label).trim() === '' && numOrNull(x.amount) != null && numOrNull(x.amount) !== '')
      .forEach(x => warn.push(who + ': a mandatory fee of $' + numOrNull(x.amount) + ' has no name — NOT written (name it on the comp)'));
    const fees = (SCHEMA.fees || []).filter(f => f.compsLabel &&
      numOrNull(feeBag[f.key]) != null && numOrNull(feeBag[f.key]) !== '')
      .map(f => ({ key: f.key, compsLabel: f.compsLabel, v: numOrNull(feeBag[f.key]) }))
      .concat(extra);
    let placed = 0;
    if (fees.length) {
      /* Rows the destination already labels for this comp, so we write the
         value and leave the label alone. Analysts free-type these (Lantern comp
         2 carries "V Trash" where comp 1 has the v7 defaults) and the fee column
         is summed into every unit's Eff. $/Mo, so writing the same fee onto a
         second row would double-charge the comp with nothing on screen to say
         why. */
      const taken = {};
      const spare = [];
      if (labels) {
        for (let r = FF; r <= FL; r++) {
          if (!labels[r]) spare.push(r);
        }
      }
      fees.forEach(f => {
        const v = f.v;
        let row = null;
        if (labels) {
          for (let r = FF; r <= FL; r++) {
            if (!taken[r] && labels[r] && pxNorm(labels[r]) === pxNorm(f.compsLabel)) { row = r; break; }
          }
          if (row) {
            taken[row] = true;
            put(row, valueCol, v, who, 'Fee — ' + f.compsLabel + ' (existing row)');
            placed++;
            return;
          }
          row = spare.shift() || null;
          if (row == null) {
            warn.push(who + ': fee "' + f.compsLabel + '" ($' + v + ') NOT written — ' +
              'no free Mandatory Fees row (' + FF + '-' + FL + ') left' + (FL - FF + 1 < 10 ? ' — this workbook is older than template v76, which has 5 open slots' : ''));
            return;
          }
        } else {
          /* Generic mode (no workbook attached), template v76+ (2026-11-24). The Mandatory span is fixed by
             design: TAB.feeFixedLabels on the first rows (MF 202-206 Amenity / Cable/Internet / Cleaning /
             Trash / V Trash; ExStay 116-120), five OPEN slots after them (207-211 / 121-125). So, like aligned
             paste on a fresh v76 sheet: a fee whose name is one of the fixed five goes on ITS row, value only
             (the template already carries the label — never relabel those rows); every other named fee fills
             the open slots in order, label + value; more than the open slots are refused with a reason. On
             schema rows older than v76 (no open slots) a named fee is refused: only the workbook can say. */
          const fixedLab = TAB.feeFixedLabels || [];
          const iFix = fixedLab.findIndex(l => pxNorm(l) === pxNorm(f.compsLabel));
          if (iFix >= 0 && FF + iFix <= FL && !taken[FF + iFix]) {
            taken[FF + iFix] = true;
            put(FF + iFix, valueCol, v, who, 'Fee — ' + f.compsLabel + ' (fixed row)');
            placed++;
            return;
          }
          const openFirst = FF + fixedLab.length;
          if (!fixedLab.length || FL < openFirst) {
            warn.push(who + ': fee "' + f.compsLabel + '" ($' + v + ') NOT written — ' +
              'without the deal workbook only the fixed fees can be placed; attach it (aligned mode) to place named fees');
            return;
          }
          row = null;
          for (let r = openFirst; r <= FL; r++) { if (!taken[r]) { row = r; break; } }
          if (row == null) {
            warn.push(who + ': fee "' + f.compsLabel + '" ($' + v + ') NOT written — ' +
              'all ' + (FL - openFirst + 1) + ' open Mandatory Fees slots (' + openFirst + '-' + FL + ') are used');
            return;
          }
          taken[row] = true;
          if (!putFees.openWarned) {
            putFees.openWarned = true;
            warn.push('Named mandatory fees were placed in the template v76 open slots (' + openFirst + '-' + FL + ') without the deal workbook — '
              + 'paste only into a v76-or-later workbook; on an older one those rows are Optional Fees. Attach the workbook to be sure.');
          }
        }
        put(row, labelCol, f.compsLabel, who, 'Fee label — ' + f.compsLabel);
        put(row, valueCol, v, who, 'Fee — ' + f.compsLabel);
        placed++;
      });
    }
    return { placed: placed, captured: fees.length };
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

  /* The subject's attribute band (2026-11-17): Physical at column C, Amenities
     at F, FEES label/$ at G/H (compsTab.subjectAttrCols, never the comp
     offsets). Same attrOut() typing as the comp side, so a tri is Y/N, a count
     is a number, and a blank stays blank and is therefore skipped: skip-blanks
     leaves whatever the workbook already holds. Stories falls back to the
     basics' Stories when the band value is blank (subjectPhysicalValue). Rows
     are the target workbook's by label in aligned mode (pxAttrRow), else the
     schema's, which verify_against_template.py label-checks at B / D. */
  const sac = TAB.subjectAttrCols;
  if (sac && ((PX_MAP.subjectWritable || {}).attr || []).length) {
    const before = Object.keys(cells).length;
    PHYSICAL.forEach(pa => putAttr('physical', pa, sac.physicalValue, attrOut(pa, subjectPhysicalValue(pa, s)), 'Subject'));
    AMENITIES.forEach(am => putAttr('amenities', am, sac.amenityValue, attrOut(am, (s.amenities || {})[am.key]), 'Subject'));
    stats.subjectAttrs = Object.keys(cells).length - before;
    const sf = putFees(s.fees || {}, tgt ? (tgt.subjectFeeLabels || {}) : null, sac.feeLabel, sac.feeValue, 'Subject');
    stats.subjectFees = sf.placed;
    if (!tgt && sf.captured) {
      clears.push({
        what: 'Subject — fee labels + $ (generic mode only)',
        range: colLetter(sac.feeLabel) + pxBounds().feeFirst + ':' + colLetter(sac.feeValue) + pxBounds().feeLast,
      });
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

    /* Both bands go out through attrOut(), which types the value off the schema
       field. This used to be a single hand-rolled special case here for
       '# of Pools' keyed on `am.valueType` — a field name the schema stopped
       carrying when every field gained a real `type` on 2026-09-16, so the guard
       had quietly become dead and pools would have gone back to writing 'Y' into
       a count column. One helper now, shared with the Cell Map and the HelloData
       fill, so the three cannot disagree again. */
    PHYSICAL.forEach(pa => putAttr('physical', pa, base + off.physicalValue, attrOut(pa, c.physical[pa.key]), who));
    AMENITIES.forEach(am => putAttr('amenities', am, base + off.amenityValue, attrOut(am, c.amenities[am.key]), who));

    // ---- FEES: by label, through the shared putFees() ---------------------
    const feeRes = putFees(c.fees, tgt ? (tgt.feeLabels[slot] || {}) : null,
      base + off.feeLabel, base + off.feeValue, who);
    stats.fees += feeRes.placed;
    const fees = { length: feeRes.captured };   // read by the generic-mode CLEAR FIRST entry below

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
        range: colLetter(base + off.feeLabel) + pxBounds().feeFirst + ':' +
          colLetter(base + off.feeValue) + pxBounds().feeLast,
      });
    }
  });

  if (formulaSkips.length) {
    warn.push(formulaSkips.length + ' cell' + (formulaSkips.length === 1 ? '' : 's') +
      ' NOT written because ' + (tgt ? tgt.fileName : 'the workbook') + ' holds a FORMULA there ' +
      '(the template has an input; this file computes it, so pasting would destroy the formula): ' +
      formulaSkips.slice(0, 12).join(', ') + (formulaSkips.length > 12 ? ', …' : ''));
  }
  stats.formulaSkips = formulaSkips.length;
  const missing = Object.keys(noRow);
  if (missing.length) {
    warn.push(missing.length + ' attribute' + (missing.length === 1 ? '' : 's') + ' NOT written because ' +
      (tgt ? tgt.fileName : 'the template') + '\'s band has no row labelled ' +
      missing.slice(0, 8).map(l => '"' + l + '"').join(', ') + (missing.length > 8 ? ', …' : ''));
  }
  stats.bandMissing = missing.length;
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
  const band = pxReadBand(ws);

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
    /* Fee labels live only in the FEES Mandatory band (feeRowFirst..feeRowLast
       = 202-206 on v57) — scanning the old shared attrRowFirst..attrRowLast
       span would also walk Physical/Amenities rows that never carry a fee
       label at this column and cost nothing extra, but the fee band is the
       only span with actual meaning here now that the three bands diverge. */
    for (let r = band.feeFirst; r <= band.feeLast; r++) {
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

  /* The subject's own fee labels (2026-11-17), column G on the Mandatory rows,
     read for the same reason each comp's are: write a fee onto the row already
     carrying its label, never onto a second row that would double it. */
  const subjectFeeLabels = {};
  const sacT = TAB.subjectAttrCols;
  if (sacT) {
    for (let r = band.feeFirst; r <= band.feeLast; r++) {
      const lb = pxS(ws, r, sacT.feeLabel);
      if (lb) subjectFeeLabels[r] = lb;
    }
  }

  /* Every cell the DEAL workbook computes (2026-11-17). pxIsWritable() knows the
     TEMPLATE's formulas; it cannot know a formula an analyst or a filler script
     typed into a cell the template leaves as an input. Found on Hedge Plus
     ModPack v20: row 4's W/D type and Utilities cells (subject G4/H4 and every
     comp's offsets 6/7) are template DROPDOWNS, but that file derives them from
     the band's Y/N rows with =IF(...) — and a real Excel paste of the aligned
     mirror replaced 19 of those formulas with typed values. So in aligned mode
     every such cell is refused here (pxBuildMirror's put() checks this set) and
     reported, rather than trusted to the template map. SheetJS marks a formula
     with `.f`; an array formula carries its range in `.F` on the anchor, which
     is expanded so every cell it spans is protected. */
  const formulaCells = new Set();
  Object.keys(ws).forEach(addr => {
    if (addr[0] === '!') return;
    const cell = ws[addr];
    if (!cell) return;
    if (cell.F) {
      const rg = XLSX.utils.decode_range(cell.F);
      for (let r = rg.s.r; r <= rg.e.r; r++) {
        for (let c = rg.s.c; c <= rg.e.c; c++) formulaCells.add((r + 1) + ':' + (c + 1));
      }
    }
    if (cell.f) {
      const rc = XLSX.utils.decode_cell(addr);
      formulaCells.add((rc.r + 1) + ':' + (rc.c + 1));
    }
  });

  return {
    fileName: fileName || 'workbook.xlsx',
    totalUnits: totalUnits,
    formulaCells: formulaCells,
    subjectFeeLabels: subjectFeeLabels,
    planRows: planRows, planList: planList,
    slotNames: slotNames, slotByName: slotByName,
    feeLabels: feeLabels, slotHasData: slotHasData,
    band: band,
  };
}

/**
 * The target workbook's Physical / Amenities band, BY LABEL (2026-11-19).
 * Labels are read from the subject block's own label columns, B (Physical) and
 * D (Amenities); every comp block repeats them on the same rows. Each list
 * runs from the row under the 'Physical Attributes' header to its first blank
 * label — the bands are contiguous, which is also what the populator assumes.
 * A pre-v73 workbook and a v73+ one carry the same labels on different rows,
 * so this is what lets one tracker paste into either. Rows the template retired
 * at v73 (W/D Provided ...) are simply never written: no schema item names them.
 */
function pxReadBand(ws) {
  const hdr = TAB.rowAttrHeader;
  const scan = (col, items) => {
    const byLabel = {};
    let first = 0, last = 0;
    for (let r = hdr + 1; r <= hdr + 90; r++) {
      const l = pxS(ws, r, col);
      if (!l) break;
      if (!first) first = r;
      last = r;
      const k = l.toLowerCase();
      if (!(k in byLabel)) byLabel[k] = r;
    }
    const rows = {};
    items.forEach(it => {
      const r = byLabel[it.label.trim().toLowerCase()];
      if (r) rows[it.key] = r;
    });
    return { rows: rows, first: first, last: last,
             keyAttributes: pxS(ws, hdr + 1, col).toLowerCase() === 'key attributes' };
  };
  const ph = scan(2, PHYSICAL), am = scan(4, AMENITIES);
  if (!ph.first || !am.first) {
    throw new Error('COMPS!B' + (hdr + 1) + ' / D' + (hdr + 1) + ' are blank — this workbook has no attribute band to align to.');
  }
  /* The FEES Mandatory span, by its headers (2026-11-24): the rows from under 'Mandatory Fees' to above
     'Optional Fees' in the subject's fee label column (G) — 5 rows up to template v75 / v71, 10 on v76 (5 fixed
     + 5 open slots). Falls back to the schema's rows when the headers are missing. */
  let feeFirst = 0, feeLast = 0;
  const fc = (TAB.subjectAttrCols || {}).feeLabel || 7;
  let mand = 0;
  for (let r = hdr + 1; r <= hdr + 100; r++) {
    const l = pxS(ws, r, fc).toLowerCase();
    if (!mand && l === 'mandatory fees') mand = r;
    else if (mand && l === 'optional fees') { if (r > mand + 1) { feeFirst = mand + 1; feeLast = r - 1; } break; }
  }
  if (!feeFirst) { feeFirst = TAB.feeRowFirst; feeLast = TAB.feeRowLast; }
  return {
    physical: ph.rows, amenities: am.rows,
    physFirst: ph.first, physLast: ph.last, amenFirst: am.first, amenLast: am.last,
    feeFirst: feeFirst, feeLast: feeLast,
    layout: (ph.keyAttributes ? 'key-attributes (v73+ / v69+)' : 'pre-v73')
      + (feeLast - feeFirst + 1 >= 10 ? ', 10 Mandatory fee rows (v76+)' : ''),
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
  /* The self-check below re-runs pxIsWritable over the finished sheet; it must
     see the same band the mirror was built against. */
  PX_BAND = mirror.tgt && mirror.tgt.band ? mirror.tgt.band : null;
  const bb = pxBounds();

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
    line('STEP 3', 'Repeat with PASTE_SUBJECT, pasting at cell B3. (Per-plan market rents, W/D, utilities, and the subject’s attributes, amenities and fees in columns C / F / G:H.)', true);
    ws.addRow([]);
    line('WHY SKIP BLANKS', 'Every formula cell is left EMPTY in this file, so "Skip blanks" makes the paste a no-op on all of them. '
      + 'Without that tick the paste will destroy the subtotal rows, the Eff. $/Mo columns and column B’s array formula. It is not optional.', true);
    line('IT CANNOT CLEAR', 'A paste can set and overwrite but never empty a cell. If a comp slot already holds data, do the CLEAR FIRST sheet first.', true);
    ws.addRow([]);
    line('Built against', TAB.templateVersion || 'SHIR_MF_Template_v75');
    line('Mode', mirror.aligned
      ? 'ALIGNED to ' + mirror.tgt.fileName + ' — fee rows, subject plan rows and every attribute row resolved against that workbook' +
        (mirror.tgt.band ? ' (attribute band: ' + mirror.tgt.band.layout + ' layout)' : '')
      : 'GENERIC — no workbook attached. Per-plan market rents are NOT written, fee labels use the template default rows, ' +
        'and attribute rows are the ' + (TAB.templateVersion || 'current template') + ' layout: attach the deal workbook to paste into a deal on an older template.');
    line('Cells written', String(mirror.stats.cells));
    line('Comps', String(mirror.stats.comps));
    line('Unit rows', String(mirror.stats.unitRows));
    line('Fees', String(mirror.stats.fees));
    line('Subject attributes', String(mirror.stats.subjectAttrs || 0));
    line('Subject fees', String(mirror.stats.subjectFees || 0));
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
  ws.getCell(TAB.rowHeader, 1).value = 'row ' + TAB.rowHeader + ' — names';
  ws.getCell(TAB.rowDetails, 1).value = 'row ' + TAB.rowDetails + ' — details';
  BUCKETS.forEach(b => {
    ws.getCell(b.startRow, 1).value = b.short + ' rows ' + b.startRow + '-' + b.endRow;
    ws.getCell(b.subtotalRow, 1).value = '(subtotal — never written)';
  });
  ws.getCell(TAB.rowTotals, 1).value = '(Tot./Avg. — never written)';
  ws.getCell(TAB.rowCompType, 1).value = 'row ' + TAB.rowCompType + ' — type/source';
  /* v41+: three independently-sized bands, not one — labelled separately so
     the spine reflects what is actually on the tab instead of a single stale
     range. Physical/Amenities/FEES all start together (row 201 on MF v57) but
     end at different rows (224 / 270 / 218; FEES Mandatory sums only 202-206).
     Every number here is illustrative — the code reads TAB, which follows the
     record's family. */
  ws.getCell(bb.physFirst, 1).value = 'Physical ' + bb.physFirst + '-' + bb.physLast +
    ' / Amenities ' + bb.amenFirst + '-' + bb.amenLast +
    ' / FEES (Mandatory) ' + bb.feeFirst + '-' + bb.feeLast;
  const spineLast = Math.max(bb.physLast || 0, bb.amenLast || 0, bb.feeLast || 0);
  for (let r = 1; r <= spineLast; r++) {
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
