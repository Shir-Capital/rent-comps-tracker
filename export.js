/* ============================================================================
   Rent Comps Tracker — export.js
   Tab 4 (validation + exports), the populate_comps.py handoff payload, the
   branded reconciliation workbook, Drive folder linking, HelloData import,
   and the Asana deal-task link.

   Deliberate design choice: this app does NOT write into the deal's proforma
   .xlsx directly. Round-tripping a 2 MB SHIR proforma through a browser Excel
   library risks losing array formulas, conditional formats and the COM-openable
   structure. Instead the app emits the exact JSON that the proven
   rent-comp-data-populator (populate_comps.py) already consumes, plus a
   human-readable workbook that shows every value and the COMPS cell it targets.
   ========================================================================= */

'use strict';

const HELLODATA_BASE = 'https://api.hellodata.ai';
const ASANA_API = 'https://app.asana.com/api/1.0';
const ASANA_DEAL_PROJECTS = ['701270220756366', '1214742025664401']; // PIPELINE + ExStay Conv.
const ASANA_TASK_PAGE_LIMIT = 100;
const ASANA_TASK_MAX_PAGES = 12;

// ============================================================================
// Validation
// ============================================================================

/**
 * Everything that would make the export wrong or incomplete.
 * level: 'err' blocks a clean export, 'warn' is worth knowing, 'ok' is a pass.
 */
function collectChecks() {
  const out = [];
  const s = STATE.subject || {};
  const comps = STATE.comps || [];

  if (!String(s.name || '').trim()) out.push({ level: 'err', msg: 'Subject property name is blank.' });
  if (!STATE.drive.folderId) {
    out.push({ level: 'warn', msg: 'No Drive deal folder linked — exports will download locally instead of filing themselves.' });
  }

  if (!comps.length) {
    out.push({ level: 'err', msg: 'No comps entered.' });
  } else if (comps.length > MAX_COMPS) {
    out.push({ level: 'err', msg: `${comps.length} comps but the COMPS tab holds ${MAX_COMPS}.` });
  }

  const untyped = comps.filter(c => !c.category);
  if (untyped.length) {
    out.push({
      level: 'err',
      msg: `${untyped.length} comp(s) have no Comp Type: ${untyped.map(c => c.name || '(unnamed)').join(', ')}.`,
    });
  }

  const nDirect = comps.filter(c => c.category === 'direct').length;
  if (nDirect === 0) out.push({ level: 'err', msg: 'No Direct comps — column G market rents cannot be computed.' });
  else if (nDirect < 4) out.push({ level: 'warn', msg: `Only ${nDirect} Direct comp(s); the playbook wants at least 4.` });
  if (!comps.some(c => c.category === 'aspirational')) out.push({ level: 'warn', msg: 'No Aspirational comp (rent ceiling reference).' });
  if (!comps.some(c => c.category === 'inferior')) out.push({ level: 'warn', msg: 'No Inferior comp (rent floor reference).' });

  const unnamed = comps.filter(c => !String(c.name || '').trim()).length;
  if (unnamed) out.push({ level: 'err', msg: `${unnamed} comp(s) have no name.` });

  const noMix = comps.filter(c => !(c.unitMix || []).some(rowHasData));
  if (noMix.length) {
    out.push({
      level: 'err',
      msg: `No unit mix on: ${noMix.map(c => c.name || '(unnamed)').join(', ')}.`,
    });
  }

  const noRent = comps.filter(c => (c.unitMix || []).some(rowHasData)
    && !(c.unitMix || []).some(r => num(r.ask_rent) > 0));
  if (noRent.length) {
    out.push({
      level: 'err',
      msg: `Unit mix present but no asking rents on: ${noRent.map(c => c.name || '(unnamed)').join(', ')}.`,
    });
  }

  comps.forEach(c => {
    const unassigned = groupByBucket(c.unitMix).unassigned.filter(rowHasData);
    if (unassigned.length) {
      out.push({
        level: 'warn',
        msg: `${c.name || '(unnamed)'}: ${unassigned.length} plan(s) have no Beds and will be left out of the COMPS tab.`,
      });
    }
    bucketCapacityIssues(c).forEach(iss => {
      out.push({
        level: 'warn',
        msg: `${c.name || '(unnamed)'}: ${iss.count} plans in ${iss.bucket.short} but that section has only ${iss.cap} rows — the extras are dropped.`,
      });
    });
  });

  if (!(STATE.subjectUnitMix || []).some(rowHasData)) {
    out.push({ level: 'warn', msg: 'Subject unit mix is empty — the $/SF market-rent method and the Δ-vs-in-place column will be blank.' });
  }

  const rents = marketRentTable();
  const priced = rents.filter(r => r.effective > 0);
  const subjectSections = rents.filter(r => r.subjectUnits > 0);
  const missing = subjectSections.filter(r => r.effective <= 0);
  if (missing.length) {
    out.push({
      level: 'warn',
      msg: `The subject has units in ${missing.map(r => r.bucket.short).join(', ')} but no market rent resolved for those sections.`,
    });
  }
  if (priced.length) out.push({ level: 'ok', msg: `${priced.length}/${BUCKETS.length} sections have a market rent.` });

  const partialAttrs = comps.filter(c => {
    const all = PHYSICAL.concat(AMENITIES);
    const set = all.filter(a => (c.physical[a.key] || c.amenities[a.key])).length;
    return set === 0;
  });
  if (partialAttrs.length) {
    out.push({
      level: 'warn',
      msg: `${partialAttrs.length} comp(s) have no attributes or amenities recorded — those cells stay blank.`,
    });
  }

  if (!out.some(c => c.level === 'err')) out.unshift({ level: 'ok', msg: 'No blocking problems — ready to export.' });
  return out;
}

// ============================================================================
// Handoff payload — the populate_comps.py contract
// ============================================================================

/** Tri-state 'Y'/'N'/'' -> true/false/null, so blanks stay blank downstream. */
function triToJson(v) {
  if (v === 'Y') return true;
  if (v === 'N') return false;
  return null;
}

function compUnitMixForJson(comp) {
  const out = [];
  BUCKETS.forEach(b => {
    (groupByBucket(comp.unitMix)[b.key] || []).forEach(r => {
      if (!rowHasData(r)) return;
      out.push({
        type: bucketTypeLabel(b.key),
        bucket: b.key,
        name: r.plan || '',
        count: num(r.count) || 1,
        sf: numOrNull(r.sqft),
        rent: numOrNull(r.ask_rent),
        occupancy_pct: numOrNull(r.occ_pct),
        concession: r.concession || '',
        notes: r.notes || '',
      });
    });
  });
  return out;
}

/**
 * The JSON to hand to populate_comps.py --skip-fetch.
 * `selected_comps` order IS the COMPS tab column order (1-8).
 */
function buildPopulatorPayload() {
  const s = STATE.subject || {};
  const rents = marketRentTable();

  return {
    skill_chain: 'rent-comps-tracker -> rent-comp-data-populator (populate_comps.py --skip-fetch)',
    generator: 'rent-comps-tracker',
    generated_at: nowISO(),
    generated_by: (CURRENT_USER && CURRENT_USER.email) || '',
    property_url: APP_BASE_URL + propertyHash(STATE).replace(/^#/, '#'),

    subject_property: {
      name: s.name || STATE.name || '',
      address: [s.address, s.city, s.state, s.zip].filter(Boolean).join(', '),
      street_address: streetOnly(s.address),
      city: s.city || '',
      state: s.state || '',
      zip: s.zip || '',
      msa: s.msa || '',
      year_built: numOrNull(s.year_built),
      total_units: numOrNull(s.total_units),
      stories: numOrNull(s.stories),
      occupancy_pct: numOrNull(s.occupancy_pct),
      wd_type: s.wd_type || '',
      reno_level: s.reno_level || '',
      hellodata_id: s.hellodata_id || '',
      unit_mix: (STATE.subjectUnitMix || []).filter(rowHasData).map(r => ({
        type: (function () { const k = bucketFor(r.beds, r.baths); return k ? bucketTypeLabel(k) : ''; })(),
        bucket: bucketFor(r.beds, r.baths),
        name: r.plan || '',
        count: num(r.count) || 1,
        sf: numOrNull(r.sqft),
        rent: numOrNull(r.current_rent),
        status: r.status || '',
      })),
    },

    /* Explicit market rents so the populator does not have to re-derive them
       and so a manual override is honoured. Keyed by COMPS section. */
    market_rents: rents.reduce((acc, r) => {
      acc[r.bucket.key] = {
        comps_label: r.bucket.compsLabel,
        subtotal_row: r.bucket.subtotalRow,
        start_row: r.bucket.startRow,
        end_row: r.bucket.endRow,
        suggested: r.suggested || null,
        override: numOrNull(r.override),
        final: r.effective || null,
        method: r.effectiveSource,
        weighted_ask: r.weighted || null,
        psf: r.psf || null,
        sample_rows: r.sampleRows,
        sample_comps: r.sampleComps,
      };
      return acc;
    }, {}),

    selected_comps: sortedComps().map((c, i) => ({
      comp_number: i + 1,
      comps_base_col: (TAB.compBaseCols || [])[i] || null,
      name: c.name || '',
      address: streetOnly(c.address),
      full_address: [c.address, c.city, c.state, c.zip].filter(Boolean).join(', '),
      city: c.city || '',
      state: c.state || '',
      zip: c.zip || '',
      category: c.category || '',
      year_built: numOrNull(c.year_built),
      total_units: numOrNull(c.total_units),
      stories: numOrNull(c.stories),
      distance_miles: numOrNull(c.distance_miles),
      occupancy_pct: numOrNull(c.occupancy_pct),
      wd_type: c.wd_type || '',
      reno_level: c.reno_level || '',
      source: c.source || '',
      hellodata_id: c.hellodata_id || '',
      phone: c.phone || '',
      contact_name: c.contact_name || '',
      website: c.website || '',
      visited_at: c.visited_at || '',
      visited_by: c.visited_by || '',
      notes: c.notes || '',
      unit_mix: compUnitMixForJson(c),
      physical: PHYSICAL.reduce((a, p) => { a[p.key] = triToJson(c.physical[p.key]); return a; }, {}),
      amenities: AMENITIES.reduce((a, m) => { a[m.key] = triToJson(c.amenities[m.key]); return a; }, {}),
      fees: (SCHEMA.fees || []).reduce((a, f) => {
        a[f.key] = f.type === 'number' ? numOrNull(c.fees[f.key]) : (c.fees[f.key] || '');
        return a;
      }, {}),
    })),
  };
}

function exportFileBase() {
  const nm = slugify(STATE.subject.name || STATE.name);
  return 'RentComps_' + nm + '_' + todayISO();
}

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

function exportPopulatorJson() {
  const payload = buildPopulatorPayload();
  downloadBlob(
    new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' }),
    exportFileBase() + '.json'
  );
  toast('Populator JSON downloaded');
}

// ============================================================================
// Reconciliation workbook (ExcelJS)
// ============================================================================

const BRAND = (SCHEMA.brand || {});
const ARGB = (hex) => 'FF' + String(hex || '000000').replace('#', '').toUpperCase();

function styleHeaderRow(ws, rowNum, lastCol) {
  const row = ws.getRow(rowNum);
  for (let c = 1; c <= lastCol; c++) {
    const cell = row.getCell(c);
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: ARGB(BRAND.navy || '1D2D47') } };
    cell.font = { name: BRAND.font || 'Arial Narrow', size: BRAND.fontSize || 11, bold: true, color: { argb: 'FFFFFFFF' } };
    cell.alignment = { vertical: 'middle', wrapText: true };
  }
  row.height = 26;
}

function titleRow(ws, text, lastCol) {
  ws.mergeCells(1, 1, 1, lastCol);
  const c = ws.getCell(1, 1);
  c.value = text;
  c.font = { name: BRAND.font || 'Arial Narrow', size: 14, bold: true, color: { argb: 'FFFFFFFF' } };
  c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: ARGB(BRAND.navy || '1D2D47') } };
  c.alignment = { vertical: 'middle' };
  ws.getRow(1).height = 24;
}

function colLetter(n) {
  let s = '';
  while (n > 0) { const m = (n - 1) % 26; s = String.fromCharCode(65 + m) + s; n = Math.floor((n - m - 1) / 26); }
  return s;
}

/**
 * Five sheets:
 *   Comp Summary  — one row per comp, header data + rent stats
 *   Unit Mix      — one row per comp floor plan, with its COMPS target cell
 *   Attributes    — physical + amenity matrix, blanks preserved
 *   Market Rents  — the column-G derivation, method and sample size
 *   COMPS Cell Map— every value with the exact COMPS address it targets, so a
 *                   populated proforma can be reconciled cell by cell
 */
async function buildCompsWorkbook() {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'SHIR Rent Comps Tracker';
  wb.created = new Date();

  const s = STATE.subject || {};
  const comps = sortedComps();
  const bases = TAB.compBaseCols || [];
  const off = TAB.offsets || {};
  const font = { name: BRAND.font || 'Arial Narrow', size: BRAND.fontSize || 11 };

  // ---------------------------------------------------------- Comp Summary
  {
    const ws = wb.addWorksheet('Comp Summary');
    const heads = ['#', 'Comp Name', 'Type', 'Street Address', 'City', 'ST', 'Year', 'Units',
      'Stories', 'Dist (mi)', 'Occ %', 'W/D', 'Reno', 'Source', 'Plans', 'Avg SF',
      'Avg Ask $', '$/SF', 'Min $', 'Max $', 'Sections', 'Visited', 'By', 'Phone', 'Notes'];
    titleRow(ws, `RENT COMPS — ${s.name || STATE.name} — ${todayISO()}`, heads.length);
    ws.addRow([]);
    ws.addRow(heads);
    styleHeaderRow(ws, 3, heads.length);

    comps.forEach((c, i) => {
      const st = compStats(c);
      const r = ws.addRow([
        i + 1, c.name || '', c.category ? categoryMeta(c.category).label : '',
        streetOnly(c.address), c.city || '', c.state || '',
        numOrNull(c.year_built), numOrNull(c.total_units), numOrNull(c.stories),
        numOrNull(c.distance_miles), numOrNull(c.occupancy_pct),
        c.wd_type || '', c.reno_level || '', c.source || '',
        st.planCount, st.avgSf ? Math.round(st.avgSf) : null,
        st.avgRent ? Math.round(st.avgRent) : null,
        st.psf ? Number(st.psf.toFixed(2)) : null,
        st.minRent || null, st.maxRent || null,
        st.buckets.join(', '), c.visited_at || '', c.visited_by || '', c.phone || '', c.notes || '',
      ]);
      r.eachCell(cell => { cell.font = font; });
      if (c.category) {
        const cell = r.getCell(3);
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: ARGB(categoryMeta(c.category).color) } };
        cell.font = Object.assign({}, font, { bold: true, color: { argb: 'FFFFFFFF' } });
      }
    });

    ws.columns.forEach((col, i) => { col.width = i === 1 ? 26 : (i === 3 ? 24 : (i >= 20 ? 20 : 9)); });
    ws.views = [{ state: 'frozen', ySplit: 3, xSplit: 2 }];
  }

  // -------------------------------------------------------------- Unit Mix
  {
    const ws = wb.addWorksheet('Unit Mix');
    const heads = ['Comp #', 'Comp Name', 'Type', 'COMPS Section', 'COMPS Row', 'Floor Plan',
      'Beds', 'Baths', 'SF', '# Units', 'Occ %', 'Ask $/Mo', '$/SF', 'Concession', 'Notes'];
    titleRow(ws, `COMP UNIT MIX — ${s.name || STATE.name}`, heads.length);
    ws.addRow([]);
    ws.addRow(heads);
    styleHeaderRow(ws, 3, heads.length);

    comps.forEach((c, ci) => {
      BUCKETS.forEach(b => {
        const rows = (groupByBucket(c.unitMix)[b.key] || []).filter(rowHasData);
        rows.forEach((r, j) => {
          const targetRow = b.startRow + j;
          const overflow = targetRow > b.endRow;
          const rent = numOrNull(r.ask_rent);
          const sf = numOrNull(r.sqft);
          const row = ws.addRow([
            ci + 1, c.name || '', c.category || '', b.compsLabel,
            overflow ? 'DROPPED (section full)' : targetRow,
            r.plan || '', numOrNull(r.beds), numOrNull(r.baths), sf,
            numOrNull(r.count), numOrNull(r.occ_pct), rent,
            rent && sf ? Number((rent / sf).toFixed(2)) : null,
            r.concession || '', r.notes || '',
          ]);
          row.eachCell(cell => { cell.font = font; });
          if (overflow) {
            row.getCell(5).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFEE2E2' } };
            row.getCell(5).font = Object.assign({}, font, { bold: true, color: { argb: 'FFB91C1C' } });
          }
        });
      });
      const un = groupByBucket(c.unitMix).unassigned.filter(rowHasData);
      un.forEach(r => {
        const row = ws.addRow([ci + 1, c.name || '', c.category || '', '(no section)', 'NOT EXPORTED',
          r.plan || '', numOrNull(r.beds), numOrNull(r.baths), numOrNull(r.sqft),
          numOrNull(r.count), numOrNull(r.occ_pct), numOrNull(r.ask_rent), null,
          r.concession || '', r.notes || '']);
        row.eachCell(cell => {
          cell.font = font;
          cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFEF3C7' } };
        });
      });
    });

    ws.columns.forEach((col, i) => { col.width = i === 1 ? 26 : (i === 5 ? 18 : (i >= 13 ? 22 : 10)); });
    ws.views = [{ state: 'frozen', ySplit: 3 }];
  }

  // ------------------------------------------------------------ Attributes
  {
    const ws = wb.addWorksheet('Attributes');
    const heads = ['Attribute', 'Kind', 'COMPS Row'].concat(comps.map((c, i) => `${i + 1}. ${c.name || '(unnamed)'}`));
    titleRow(ws, `PHYSICAL ATTRIBUTES & AMENITIES — blank = not known`, heads.length);
    ws.addRow([]);
    ws.addRow(heads);
    styleHeaderRow(ws, 3, heads.length);

    const emit = (items, kind, bag) => items.forEach(it => {
      const row = ws.addRow([it.label, kind, it.row].concat(comps.map(c => bag(c)[it.key] || '')));
      row.eachCell((cell, n) => {
        cell.font = font;
        if (n > 3) {
          cell.alignment = { horizontal: 'center' };
          if (cell.value === 'Y') cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFDCFCE7' } };
          else if (cell.value === 'N') cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFEE2E2' } };
        }
      });
    });
    emit(PHYSICAL, 'Physical', c => c.physical);
    ws.addRow([]);
    emit(AMENITIES, 'Amenity', c => c.amenities);

    ws.columns.forEach((col, i) => { col.width = i === 0 ? 20 : (i < 3 ? 11 : 16); });
    ws.views = [{ state: 'frozen', ySplit: 3, xSplit: 1 }];
  }

  // ---------------------------------------------------------- Market Rents
  {
    const ws = wb.addWorksheet('Market Rents');
    const heads = ['COMPS Section', 'Label', 'Rows', 'Subj Units', 'Subj Avg SF', 'Subj Avg Rent',
      'Wtd Ask (direct)', '$/SF (direct)', '$/SF x Subj SF', 'Suggested', 'Override',
      'FINAL -> col G', 'Method', 'Sample rows', 'Sample comps', 'Delta vs in-place'];
    titleRow(ws, `MARKET RENTS — from Direct comps only — ${s.name || STATE.name}`, heads.length);
    ws.addRow([]);
    ws.addRow(heads);
    styleHeaderRow(ws, 3, heads.length);

    marketRentTable().forEach(r => {
      const row = ws.addRow([
        r.bucket.short, r.bucket.compsLabel, `${r.bucket.startRow}-${r.bucket.endRow}`,
        r.subjectUnits || null, r.subjectAvgSf ? Math.round(r.subjectAvgSf) : null,
        r.subjectAvgRent ? Math.round(r.subjectAvgRent) : null,
        r.weighted ? Math.round(r.weighted) : null,
        r.psf ? Number(r.psf.toFixed(2)) : null,
        r.psfApplied ? Math.round(r.psfApplied) : null,
        r.suggested || null, numOrNull(r.override), r.effective || null,
        r.effectiveSource, r.sampleRows || null, r.sampleComps || null,
        r.delta ? Math.round(r.delta) : null,
      ]);
      row.eachCell(cell => { cell.font = font; });
      const fin = row.getCell(12);
      if (r.effective > 0) {
        fin.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: ARGB(BRAND.suggestedRentFill || 'FF0000') } };
        fin.font = Object.assign({}, font, { bold: true, color: { argb: ARGB(BRAND.suggestedRentFont || 'FFFFFF') } });
      }
    });

    ws.columns.forEach((col, i) => { col.width = i < 2 ? 14 : 13; });
    ws.views = [{ state: 'frozen', ySplit: 3, xSplit: 1 }];
  }

  // -------------------------------------------------------- COMPS Cell Map
  {
    const ws = wb.addWorksheet('COMPS Cell Map');
    const heads = ['Cell', 'Row', 'Col', 'Belongs To', 'Field', 'Value'];
    titleRow(ws, `COMPS TAB CELL MAP — what populate_comps.py should write`, heads.length);
    ws.addRow([]);
    ws.addRow(heads);
    styleHeaderRow(ws, 3, heads.length);

    const put = (row, col, who, field, value) => {
      if (value === '' || value == null) return;
      const r = ws.addRow([colLetter(col) + row, row, colLetter(col), who, field, value]);
      r.eachCell(cell => { cell.font = font; });
    };

    // Subject column G market rents — one per subject row with units > 0.
    marketRentTable().forEach(r => {
      if (r.effective <= 0) return;
      const rows = subjectBucketAgg(r.bucket.key).rows.filter(x => num(x.count) > 0);
      const n = Math.max(1, Math.min(rows.length, r.bucket.endRow - r.bucket.startRow + 1));
      for (let k = 0; k < n; k++) {
        put(r.bucket.startRow + k, TAB.subjectMktRentCol || 7, 'Subject',
          `Mkt $/Mo (${r.bucket.short})`, r.effective);
      }
    });

    comps.forEach((c, i) => {
      const base = bases[i];
      if (!base) return;
      const who = `Comp ${i + 1}: ${c.name || '(unnamed)'}`;
      put(TAB.rowHeader, base + off.compNum, who, 'Comp #', i + 1);
      put(TAB.rowHeader, base + off.compName, who, 'Comp name', c.name || '');
      put(TAB.rowHeader, base + off.compAddress, who, 'Street address', streetOnly(c.address));

      put(TAB.rowDetails, base + off.yearBuilt, who, 'Year built', numOrNull(c.year_built));
      put(TAB.rowDetails, base + off.totalUnits, who, 'Total units', numOrNull(c.total_units));
      put(TAB.rowDetails, base + off.stories, who, 'Stories', numOrNull(c.stories));
      put(TAB.rowDetails, base + off.distanceMiles, who, 'Distance (mi)', numOrNull(c.distance_miles));
      put(TAB.rowDetails, base + off.wdType, who, 'W/D type', c.wd_type || '');
      put(TAB.rowDetails, base + off.renoLevel, who, 'Reno level', c.reno_level || '');

      put(TAB.rowCompType, base + off.compTypeValue, who, 'Comp Type',
        c.category ? categoryMeta(c.category).label : '');
      put(TAB.rowCompType, base + off.compSourceValue, who, 'Comp Source', c.source || '');

      BUCKETS.forEach(b => {
        const rows = (groupByBucket(c.unitMix)[b.key] || []).filter(rowHasData);
        rows.forEach((r, j) => {
          const row = b.startRow + j;
          if (row > b.endRow) return;   // section full — dropped, flagged on Unit Mix
          const tag = `${b.short} ${r.plan || '#' + (j + 1)}`;
          put(row, base + off.unitRowNum, who, tag + ' — row #', j + 1);
          put(row, base + off.unitCount, who, tag + ' — # units', numOrNull(r.count));
          put(row, base + off.unitSf, who, tag + ' — SF', numOrNull(r.sqft));
          put(row, base + off.unitOccPct, who, tag + ' — Occ %', numOrNull(r.occ_pct));
          put(row, base + off.unitAskRent, who, tag + ' — Ask $/Mo', numOrNull(r.ask_rent));
        });
      });

      PHYSICAL.forEach(pa => put(pa.row, base + off.physicalValue, who, pa.label, c.physical[pa.key] || ''));
      AMENITIES.forEach(am => put(am.row, base + off.amenityValue, who, am.label, c.amenities[am.key] || ''));
    });

    ws.columns = [{ width: 10 }, { width: 7 }, { width: 7 }, { width: 30 }, { width: 30 }, { width: 16 }];
    ws.views = [{ state: 'frozen', ySplit: 3 }];
    ws.autoFilter = { from: { row: 3, column: 1 }, to: { row: 3, column: heads.length } };
  }

  return wb;
}

async function exportWorkbook(opts) {
  const toDrive = !!(opts && opts.toDrive);
  try {
    toast('Building workbook…');
    const wb = await buildCompsWorkbook();
    const buf = await wb.xlsx.writeBuffer();
    const name = exportFileBase() + '.xlsx';
    const mime = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

    if (toDrive && driveConnected() && STATE.drive.folderId) {
      const folder = await ensureTrackerFolder(STATE);
      const hits = await driveList(
        `'${folder}' in parents and name='${name.replace(/'/g, "\\'")}' and trashed=false`, 'id,name');
      const r = await driveUploadBinary(folder, name, buf, mime, hits.length ? hits[0].id : undefined);
      saveState();
      toast('Filed in 3. Comps / Rent Comps Tracker');
      return r;
    }

    downloadBlob(new Blob([buf], { type: mime }), name);
    toast(toDrive ? 'No Drive folder — downloaded locally' : 'Workbook downloaded');
    return null;
  } catch (e) {
    console.error('exportWorkbook', e);
    toast('Export failed: ' + (e.message || e));
    return null;
  }
}

/** Both artifacts into the deal folder in one action. */
async function exportBothToDrive() {
  if (!driveConnected()) { toast('Connect Google Drive first'); return; }
  if (!STATE.drive.folderId) { toast('Link a Drive deal folder first'); return; }
  await exportWorkbook({ toDrive: true });
  try {
    const folder = await ensureTrackerFolder(STATE);
    const name = exportFileBase() + '.json';
    const hits = await driveList(
      `'${folder}' in parents and name='${name.replace(/'/g, "\\'")}' and trashed=false`, 'id,name');
    await driveUploadJson(folder, name, buildPopulatorPayload(), hits.length ? hits[0].id : undefined);
    toast('Workbook + populator JSON filed on Drive');
  } catch (e) {
    console.error(e);
    toast('JSON upload failed: ' + (e.message || e));
  }
}

// ============================================================================
// Tab 4 — Export
// ============================================================================

function renderPhase4() {
  const host = $('#phase-content');
  const checks = collectChecks();
  const errs = checks.filter(c => c.level === 'err').length;
  const comps = sortedComps();
  const rents = marketRentTable();

  const order = comps.map((c, i) => {
    const base = (TAB.compBaseCols || [])[i];
    return `<div class="kv">
      <span class="k">${i + 1}. ${esc(c.name || '(unnamed)')}
        <span class="cat-pill ${c.category ? esc(c.category) : 'none'}" style="margin-left:4px">${c.category ? esc(categoryMeta(c.category).label) : '—'}</span></span>
      <span class="v">col ${esc(base ? colLetter(base) : '?')}</span>
    </div>`;
  }).join('');

  host.innerHTML = `
    <div class="card">
      <div class="card-head"><span class="grow">Pre-flight</span></div>
      <div class="card-body">
        ${checks.map(c => `<div class="chk ${esc(c.level)}">
          <span class="ico">${c.level === 'ok' ? '✔' : (c.level === 'warn' ? '!' : '✖')}</span>
          <span>${esc(c.msg)}</span></div>`).join('')}
      </div>
    </div>

    <div class="card">
      <div class="card-head"><span class="grow">COMPS Tab Layout</span></div>
      <div class="card-body">
        ${order || '<div class="muted small">No comps to place.</div>'}
        <hr class="hr-soft"/>
        <div class="kv"><span class="k">Sections priced (col G)</span><span class="v">${rents.filter(r => r.effective > 0).length}/${BUCKETS.length}</span></div>
        <div class="kv"><span class="k">Target</span><span class="v">COMPS rows ${esc(TAB.rowHeader)}–${esc(TAB.attrRowLast)}</span></div>
      </div>
    </div>

    <div class="card">
      <div class="card-head"><span class="grow">Export</span></div>
      <div class="card-body">
        <div class="muted small" style="margin-bottom:9px">
          This app does not edit the proforma directly — round-tripping a SHIR
          proforma through a browser Excel library risks its array formulas.
          Instead it emits the JSON that <b>populate_comps.py</b> already consumes,
          plus a workbook showing every value and the COMPS cell it targets.
        </div>
        <div class="stack">
          <button class="btn primary" id="btn-x-both">⬆ Workbook + JSON → Drive</button>
          <button class="btn" id="btn-x-xlsx">⬇ Download workbook (.xlsx)</button>
          <button class="btn" id="btn-x-json">⬇ Download populator JSON</button>
          <button class="btn" id="btn-x-copy">📋 Copy JSON to clipboard</button>
        </div>
        ${errs ? `<div class="chk err" style="margin-top:9px"><span class="ico">✖</span>
          <span>${errs} blocking problem${errs === 1 ? '' : 's'} above — exports still work, but
          the COMPS tab will be incomplete.</span></div>` : ''}
      </div>
    </div>

    <div class="card">
      <div class="card-head"><span class="grow">Then, on a machine with the proforma</span></div>
      <div class="card-body">
        <div class="muted small">Run the proven populator against the deal's proforma:</div>
        <pre class="tiny" style="white-space:pre-wrap;background:#f1f5f9;padding:8px;border-radius:6px;margin:7px 0 0">python "SKILLS\\MFVAPF - Rent Comp Data Populator Skill\\rent-comp-data-populator-populate_comps-v27.py" ^
  "&lt;proforma_in.xlsx&gt;" "&lt;proforma_out.xlsx&gt;" "$(cat ${esc(exportFileBase())}.json)" --skip-fetch</pre>
        <div class="tiny muted" style="margin-top:6px">
          Then reconcile the populated COMPS tab against the <b>COMPS Cell Map</b> sheet.
        </div>
      </div>
    </div>`;

  $('#btn-x-both').onclick = () => exportBothToDrive();
  $('#btn-x-xlsx').onclick = () => exportWorkbook({ toDrive: false });
  $('#btn-x-json').onclick = () => exportPopulatorJson();
  $('#btn-x-copy').onclick = async () => {
    try {
      await navigator.clipboard.writeText(JSON.stringify(buildPopulatorPayload()));
      toast('JSON copied');
    } catch (e) { toast('Clipboard blocked — use Download instead'); }
  };
}

// ============================================================================
// Drive folder linking (UI prompts)
// ============================================================================

function updateFolderStatus() {
  const n = $('#folder-status');
  if (!n || !STATE) return;
  n.textContent = STATE.drive.folderId
    ? (STATE.drive.folderName || 'linked') + (STATE.drive.pipelineName ? ' · ' + STATE.drive.pipelineName : '')
    : 'No deal folder linked';
}

async function promptFindFolder() {
  if (!driveConnected()) { const ok = await driveConnect(); if (!ok) return; }
  const s = STATE.subject || {};
  const name = (s.name || STATE.name || '').trim();
  if (!name) { toast('Give the subject a name first'); return; }
  toast('Searching pipelines…');
  let cands;
  try { cands = await findDealFolderCandidates(name, s.city, s.state); }
  catch (e) { toast('Search failed: ' + (e.message || e)); return; }

  if (!cands.length) {
    if (confirm('No pipeline folder matched "' + name + '".\n\nPaste a folder URL or ID instead?')) {
      promptLinkFolderByUrl();
    }
    return;
  }
  for (let i = 0; i < Math.min(5, cands.length); i++) {
    const c = cands[i];
    const more = Math.min(5, cands.length) - i - 1;
    const msg = `Link this deal folder?\n\n${c.name}\n(${c.pipelineName}, match ${c.score})`
      + (more ? `\n\nOK = link · Cancel = see next best (${more} more)` : `\n\nOK = link · Cancel = stop`);
    if (confirm(msg)) {
      await linkDealFolder(STATE, c.id, c.name, c.pipelineName);
      updateFolderStatus();
      renderCurrentPhase();
      toast('Linked ' + c.name);
      return;
    }
  }
  if (confirm('None of those matched.\n\nPaste a folder URL or ID instead?')) promptLinkFolderByUrl();
}

async function promptLinkFolderByUrl() {
  if (!driveConnected()) { const ok = await driveConnect(); if (!ok) return; }
  const inp = prompt('Paste the Drive deal-folder URL or folder ID:');
  if (!inp) return;
  const id = extractFolderId(inp);
  if (!id) { toast('Could not find a folder ID in that'); return; }
  try {
    await linkDealFolder(STATE, id, '', '');
    updateFolderStatus();
    renderCurrentPhase();
    toast('Linked ' + (STATE.drive.folderName || id));
  } catch (e) {
    toast('Link failed: ' + (e.message || e));
  }
}

/** One silent attempt per property to find its deal folder by exact name. */
async function maybeAutoLinkFolder() {
  if (!STATE || STATE.drive.folderId || STATE.drive.autoSearchAttempted) return;
  if (!driveConnected()) return;
  const name = (STATE.subject.name || STATE.name || '').trim();
  if (!name) return;
  STATE.drive.autoSearchAttempted = true;
  saveState({ noPush: true });
  try {
    const cands = await findDealFolderCandidates(name, STATE.subject.city, STATE.subject.state);
    if (cands.length && cands[0].score >= 100) {
      await linkDealFolder(STATE, cands[0].id, cands[0].name, cands[0].pipelineName);
      updateFolderStatus();
      toast('Auto-linked ' + cands[0].name);
      if (CURRENT_PHASE === 1) renderPhase1();
    }
  } catch (e) { /* silent */ }
}

// ============================================================================
// HelloData
// ============================================================================

async function hdFetch(path) {
  const key = await resolveHelloDataKey();
  if (!key) throw new Error('No HelloData API key — set one in the ☰ menu');
  const res = await fetch(HELLODATA_BASE + path, { headers: { 'x-api-key': key } });
  if (!res.ok) throw new Error('HelloData ' + res.status + ' ' + res.statusText);
  return res.json();
}
async function hdPost(path, body) {
  const key = await resolveHelloDataKey();
  if (!key) throw new Error('No HelloData API key — set one in the ☰ menu');
  const res = await fetch(HELLODATA_BASE + path, {
    method: 'POST',
    headers: { 'x-api-key': key, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error('HelloData ' + res.status + ' ' + res.statusText);
  return res.json();
}

const HD_EXCLUDE_NAME = ['condo', 'condominium', 'townhome', 'townhouse', 'co-op', 'coop', 'cooperative'];

/** The locator's Phase-1D hard filter: MF only, never condos/SFR/hotels. */
function hdIsEligibleMf(p) {
  if (p.is_condo === true) return false;
  if (p.is_single_family === true) return false;
  if (p.is_apartment === false) return false;
  if (p.is_senior === true) return false;
  if (p.is_student === true) return false;
  const nm = String(p.building_name || p.name || '').toLowerCase();
  return !HD_EXCLUDE_NAME.some(sub => nm.includes(sub));
}

/** Collapse building_availability[] into one row per (bed, bath, sqft). */
function hdUnitMix(hd) {
  const av = hd.building_availability || hd.availability || [];
  const groups = new Map();
  av.forEach(u => {
    const bed = num(u.bed != null ? u.bed : u.beds);
    const bath = num(u.bath != null ? u.bath : u.baths);
    const sf = num(u.sqft != null ? u.sqft : u.sq_ft);
    const rent = num(u.price != null ? u.price : u.rent);
    const k = bed + '|' + bath + '|' + sf;
    if (!groups.has(k)) {
      groups.set(k, { plan: u.floorplan_name || u.floorplan || '', beds: bed, baths: bath, sqft: sf, rents: [], count: 0 });
    }
    const g = groups.get(k);
    g.count += num(u.unit_count) || 1;
    if (rent > 0) g.rents.push(rent);
    if (!g.plan && (u.floorplan_name || u.floorplan)) g.plan = u.floorplan_name || u.floorplan;
  });
  return Array.from(groups.values()).map(g => {
    g.rents.sort((a, b) => a - b);
    const median = g.rents.length ? g.rents[Math.floor(g.rents.length / 2)] : 0;
    return Object.assign(newUnitRow(), {
      plan: g.plan,
      beds: g.beds === 0 ? '0' : String(g.beds),
      baths: String(g.baths),
      sqft: g.sqft ? String(g.sqft) : '',
      count: String(g.count),
      ask_rent: median ? String(median) : '',
    });
  });
}

/** v27's real field names — building_amenities / unit_amenities token lists. */
function hdApplyAttrs(comp, hd) {
  const bAm = (hd.building_amenities || []).map(x => String(x).toLowerCase());
  const uAm = (hd.unit_amenities || []).map(x => String(x).toLowerCase());
  const has = (list, token) => (token ? (list.includes(token) ? 'Y' : 'N') : '');

  PHYSICAL.forEach(p => {
    if (!p.hellodata) return;              // HelloData cannot answer -> leave blank
    comp.physical[p.key] = has(uAm.concat(bAm), p.hellodata);
  });
  AMENITIES.forEach(a => {
    if (!a.hellodata) return;
    comp.amenities[a.key] = has(bAm.concat(uAm), a.hellodata);
  });
}

function hdApplyToComp(comp, hd, distanceMiles) {
  comp.name = hd.building_name || hd.name || comp.name;
  comp.address = hd.street_address || comp.address;
  comp.city = hd.city || comp.city;
  comp.state = hd.state || comp.state;
  comp.zip = hd.zip_code || hd.zip || comp.zip;
  comp.year_built = hd.year_built != null ? String(hd.year_built) : comp.year_built;
  comp.total_units = (hd.number_units || hd.unit_count || hd.total_units) != null
    ? String(hd.number_units || hd.unit_count || hd.total_units) : comp.total_units;
  comp.stories = (hd.number_stories || hd.stories || hd.floors) != null
    ? String(hd.number_stories || hd.stories || hd.floors) : comp.stories;
  if (distanceMiles != null) comp.distance_miles = String(Number(distanceMiles).toFixed(2));
  comp.hellodata_id = hd.id || comp.hellodata_id;
  comp.source = comp.source || 'HelloData';
  const mix = hdUnitMix(hd);
  if (mix.length) comp.unitMix = mix;
  hdApplyAttrs(comp, hd);
  return mix.length;
}

async function hdFillComp(compId) {
  const c = getComp(compId);
  if (!c) return;
  try {
    let id = c.hellodata_id;
    if (!id) {
      const q = [c.name, c.address, c.city, c.state].filter(Boolean).join(' ').trim();
      if (!q) { toast('Enter a name or address first'); return; }
      toast('Searching HelloData…');
      const found = await hdFetch('/property/search?q=' + encodeURIComponent(q));
      const list = Array.isArray(found) ? found : (found.results || found.properties || []);
      if (!list.length) { toast('No HelloData match'); return; }
      const pick = list[0];
      if (!confirm(`Use this HelloData record?\n\n${pick.building_name || pick.name || '(unnamed)'}\n${pick.street_address || ''} ${pick.city || ''} ${pick.state || ''}`)) return;
      id = pick.id;
    }
    toast('Fetching unit mix…');
    const hd = await hdFetch('/property/' + encodeURIComponent(id));
    if (!hdIsEligibleMf(hd)) {
      if (!confirm('HelloData flags this as non-multifamily (condo / SFR / senior / student).\n\n'
        + 'The locator playbook drops these because their rents distort market rents.\n\nImport anyway?')) return;
    }
    const n = hdApplyToComp(c, hd, c.distance_miles === '' ? null : num(c.distance_miles));
    saveState();
    renderCompEditor(compId);
    toast(n ? `Filled — ${n} floor plan${n === 1 ? '' : 's'}` : 'Filled (no unit mix in HelloData)');
  } catch (e) {
    console.error(e);
    toast('HelloData failed: ' + (e.message || e));
  }
}

/** Pull comparables for the subject and add the eligible ones as comps. */
async function hdPullComparables() {
  const s = STATE.subject || {};
  try {
    let id = s.hellodata_id;
    if (!id) {
      const q = [s.name, s.address, s.city, s.state].filter(Boolean).join(' ').trim();
      if (!q) { toast('Fill the subject address first'); return; }
      toast('Finding the subject in HelloData…');
      const found = await hdFetch('/property/search?q=' + encodeURIComponent(q));
      const list = Array.isArray(found) ? found : (found.results || found.properties || []);
      if (!list.length) { toast('Subject not found in HelloData'); return; }
      id = list[0].id;
      s.hellodata_id = id;
      saveState();
    }
    toast('Loading subject record…');
    const subject = await hdFetch('/property/' + encodeURIComponent(id));

    toast('Requesting comparables…');
    const resp = await hdPost('/property/comparables', { subject });
    const raw = resp.comparables || [];
    const eligible = raw.filter(hdIsEligibleMf);
    const dropped = raw.length - eligible.length;

    if (!eligible.length) { toast(`No eligible MF comparables (${raw.length} returned, ${dropped} filtered)`); return; }

    const room = MAX_COMPS - STATE.comps.length;
    if (room <= 0) { toast('Already at ' + MAX_COMPS + ' comps'); return; }

    const names = eligible.slice(0, room).map((c, i) =>
      `${i + 1}. ${c.building_name || '(unnamed)'} — ${c.year_built || '?'} · ${c.number_units || '?'}u · ${c.distance_miles != null ? Number(c.distance_miles).toFixed(2) + ' mi' : '? mi'}`
    ).join('\n');
    if (!confirm(`Add ${Math.min(room, eligible.length)} comparable(s)?\n\n${names}\n\n`
      + `${dropped} non-MF filtered out. Unit mix is fetched per comp; set Comp Type yourself.`)) return;

    let added = 0, withMix = 0;
    for (const cand of eligible.slice(0, room)) {
      const comp = newComp();
      comp.hellodata_id = cand.id;
      comp.source = 'HelloData';
      try {
        const hd = await hdFetch('/property/' + encodeURIComponent(cand.id));
        const n = hdApplyToComp(comp, hd, cand.distance_miles);
        if (n) withMix++;
      } catch (e) {
        comp.name = cand.building_name || '';
        comp.address = cand.street_address || '';
        comp.city = cand.city || '';
        comp.state = cand.state || '';
        comp.year_built = cand.year_built != null ? String(cand.year_built) : '';
        comp.total_units = cand.number_units != null ? String(cand.number_units) : '';
        comp.distance_miles = cand.distance_miles != null ? String(Number(cand.distance_miles).toFixed(2)) : '';
      }
      STATE.comps.push(comp);
      added++;
    }
    saveState();
    renderPhase2();
    toast(`Added ${added} comp(s); ${withMix} with unit mix. Set Comp Type on each.`);
  } catch (e) {
    console.error(e);
    toast('HelloData failed: ' + (e.message || e));
  }
}

// ============================================================================
// Asana
// ============================================================================

async function asanaFetch(path, init) {
  const token = await resolveAsanaToken();
  if (!token) throw new Error('No Asana token — set one in the ☰ menu');
  const opts = Object.assign({}, init || {});
  opts.headers = Object.assign({ Authorization: 'Bearer ' + token }, opts.headers || {});
  const res = await fetch(ASANA_API + path, opts);
  if (!res.ok) throw new Error('Asana ' + res.status + ' ' + res.statusText);
  return res.json();
}

async function findAsanaCandidates(propName) {
  const byGid = new Map();
  for (const proj of ASANA_DEAL_PROJECTS) {
    let path = `/projects/${proj}/tasks?opt_fields=name&limit=${ASANA_TASK_PAGE_LIMIT}`;
    for (let page = 0; page < ASANA_TASK_MAX_PAGES && path; page++) {
      const r = await asanaFetch(path);
      (r.data || []).forEach(t => byGid.set(t.gid, t));
      const off = r.next_page && r.next_page.offset;
      path = off ? `/projects/${proj}/tasks?opt_fields=name&limit=${ASANA_TASK_PAGE_LIMIT}&offset=${off}` : '';
    }
  }
  const want = normalizeName(propName);
  const wantTokens = want.split(' ').filter(t => t.length > 2);
  const out = [];
  byGid.forEach(t => {
    const got = normalizeName(t.name);
    let score = 0;
    if (got === want) score = 100;
    else if (got.includes(want) || want.includes(got)) score = 80;
    else {
      const gotTokens = got.split(' ');
      const hits = wantTokens.filter(x => gotTokens.includes(x)).length;
      if (hits) score = Math.min(60, Math.round((hits / Math.max(1, wantTokens.length)) * 60));
    }
    if (score) out.push({ gid: t.gid, name: t.name, score });
  });
  out.sort((a, b) => b.score - a.score);
  return out;
}

/**
 * Write this property's shareable URL into the deal's Asana task.
 * Needs a "Rent Comps Link" text custom field; its gid lives in the shared
 * config as `asana_rent_comps_link_field`. Until that field exists in Asana
 * this no-ops with an explicit message rather than guessing a gid.
 */
async function syncLinkToAsana(interactive) {
  try {
    const cfg = await loadSharedConfig();
    const fieldGid = cfg.asana_rent_comps_link_field || '';
    if (!fieldGid) {
      if (interactive) {
        alert('No "Rent Comps Link" custom field is configured yet.\n\n'
          + 'Create a text custom field on the PIPELINE and ExStay Conv. projects, then store its\n'
          + 'gid as "asana_rent_comps_link_field" in ' + CONFIG_FILENAME + ' in the applet\'s Drive folder.');
      }
      return false;
    }
    const name = (STATE.subject.name || STATE.name || '').trim();
    if (!name) { if (interactive) toast('Name the subject first'); return false; }

    let gid = STATE.asana.taskGid;
    if (!gid) {
      const cands = await findAsanaCandidates(name);
      if (!cands.length) { if (interactive) toast('No Asana deal task matched'); return false; }
      if (cands.length === 1 || cands[0].score >= 100) {
        if (interactive && !confirm('Write the Rent Comps link to this Asana task?\n\n' + cands[0].name)) return false;
        gid = cands[0].gid;
      } else {
        const pick = prompt('Which Asana task?\n\n'
          + cands.slice(0, 5).map((c, i) => `${i + 1}. ${c.name} (${c.score})`).join('\n')
          + '\n\nType a number:');
        const i = Number(pick) - 1;
        if (!(i >= 0 && i < Math.min(5, cands.length))) return false;
        gid = cands[i].gid;
      }
      STATE.asana.taskGid = gid;
      saveState();
    }

    const url = APP_BASE_URL + propertyHash(STATE);
    await asanaFetch('/tasks/' + gid, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ data: { custom_fields: { [fieldGid]: url } } }),
    });
    if (interactive) toast('Rent Comps link written to Asana');
    return true;
  } catch (e) {
    console.error('syncLinkToAsana', e);
    if (interactive) toast('Asana write failed: ' + (e.message || e));
    return false;
  }
}
