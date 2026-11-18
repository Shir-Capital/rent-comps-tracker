/* ============================================================================
 * provenance.js — where every value came from, and when it was looked up.
 *
 * The Rent Comps Unified skill (v1.34+) writes a RESULTS JSON beside the COMPS
 * tab on every run:
 *
 *     <deal>/3. Comps/<Property> - rent comps results <YYYY-MM-DD HHMM>.json
 *     schema "shir-rent-comps-results/v1"
 *
 * Every comp value in it carries a provenance record —
 *     {source, looked_up_at, url, detail, time_note}            (looked up)
 *     {source: "computed", computed_at, detail}                 (derived)
 * — and each plan's asking rent says whether it came from the comp's own leasing
 * site (v1.36), with the exact page, the price text read and the rent it replaced.
 * The attribute backfill adds every cell it filled; the scorer adds each comp's
 * 0-100 score and the score-weighted column-G rents.
 *
 * This module carries that metadata into the tracker and shows it:
 *
 *  1. IMPORT. "Import from Proforma" reads the COMPS tab as before. After the
 *     read, this looks in the deal's `3. Comps` for results files, picks the one
 *     written for that workbook (else the newest whose comps match by name), and
 *     offers it as one more opt-in group: "Sources & lookup times". It can be
 *     applied on its own, to comps already in the tracker.
 *
 *  2. STORE. Records live on the objects they describe, so they ride
 *     serializeProperty() to Drive and survive re-renders:
 *        comp.prov[<field> | 'physical.<k>' | 'amenities.<k>' | 'fees.<k>']
 *        comp.unitMix[i].prov[<field>]
 *        comp.score                       ({value, rank, of, components, ...})
 *        STATE.subject.prov[...], STATE.subjectUnitMix[i].prov.market_rent
 *        STATE.marketRents[bucket].prov
 *        STATE.imports.results            (the file, match, counts, artifacts)
 *
 *  3. SHOW. A small corner tick on every field that has a record — the same cue
 *     as a cell comment in Excel — coloured by kind. Hover (or tap the tick on
 *     a phone) opens a card: source, lookup time, link, basis, notes.
 *
 *  4. EDITS. A value typed in the tracker is no longer the looked-up one, so the
 *     record becomes "Edited in the tracker" (who, when) and keeps what it was.
 *     A card that kept saying "Apartments.com" over a hand-typed number would be
 *     worse than no card.
 *
 * Values are NOT taken from the JSON. The workbook stays the value source (the
 * populator wrote both from the same run); the JSON adds the metadata. Where the
 * two disagree — the workbook was edited after the run — the card says so.
 *
 * Self-installing, like photos.js: it wraps the importer's globals and watches
 * #phase-content, so ui.js and proforma-import.js do not need to know it exists.
 * ========================================================================= */

const PV_SCHEMA = 'shir-rent-comps-results/v1';
const PV_FILE_RE = / - rent comps results \d{4}-\d{2}-\d{2} \d{4}(?: \(\d+\))?\.json$/i;
const PV_MAX_FILES = 12;          // newest N results files considered per import

// ------------------------------------------------------------------ helpers

function pvNorm(s) {
  return String(s == null ? '' : s).toLowerCase().replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, ' ').trim();
}
function pvBase(p) { return String(p || '').split(/[\\/]/).pop(); }
function pvNum(v) {
  if (v === '' || v == null) return null;
  const n = Number(String(v).replace(/[$,%\s]/g, ''));
  return isFinite(n) ? n : null;
}
function pvEmail() {
  return (typeof CURRENT_USER === 'object' && CURRENT_USER && CURRENT_USER.email) || '';
}

/** A provenance record trimmed to the keys the card shows. */
function pvRec(p, extra) {
  const r = {};
  ['source', 'looked_up_at', 'computed_at', 'url', 'detail', 'time_note', 'note',
   'basis', 'quote', 'replaced', 'script', 'cell', 'conflict'].forEach(k => {
    if (p && p[k] != null && p[k] !== '') r[k] = p[k];
  });
  return Object.assign(r, extra || {});
}

/** The rent record of one unit_mix entry (v1.36 site rents), else null. */
function pvRentRec(e) {
  if (!e || !e.rent_source) return null;
  return pvRec({
    source: e.rent_source, looked_up_at: e.rent_looked_up_at || null, url: e.rent_url,
    basis: e.rent_basis, quote: e.rent_quote, replaced: e.rent_replaced,
    time_note: e.rent_time_note || (e.rent_looked_up_at ? '' : 'lookup time not recorded'),
    note: e.rent_note,
  });
}

/** 'ok' | 'untimed' | 'computed' | 'edited' | 'differs' — drives the colour. */
function pvKind(r) {
  if (!r) return '';
  if (r.edited) return 'edited';
  if (r.differs) return 'differs';
  if (r.source === 'computed' || r.computed_at) return 'computed';
  return r.looked_up_at ? 'ok' : 'untimed';
}

/** Values equal enough that the workbook and the results file agree. */
function pvSame(a, b) {
  const na = pvNum(a), nb = pvNum(b);
  /* `a` is the run's value, `b` the tracker's. Compare at the precision the
     tracker holds: the importer keeps vacancy to one decimal (10.58 -> "10.6"),
     and that is rounding, not an edit. A relative band was wrong — 0.1% called
     1974 = 1975 and $1,149 = $1,150. */
  if (na != null && nb != null) {
    const m = /\.(\d+)$/.exec(String(b).trim());
    const dp = m ? m[1].length : 0;
    return Math.abs(Number(na.toFixed(dp)) - nb) <= Math.pow(10, -dp) / 2 + 1e-9;
  }
  const t = v => (v === true ? 'y' : v === false ? 'n' : pvNorm(v));
  return t(a) === t(b);
}

/* ----------------------------------------------------- label -> band field
   Backfill cells are named by their COMPS label ("W/D Hookups", "# of Pools").
   Rows do NOT identify a field — the physical and amenity bands share row
   numbers in different columns — so the label is the key, matched against the
   open family's own band labels. */
function pvBandIndex() {
  const idx = new Map();
  const add = (bag, items, labelOf) => (items || []).forEach(it => {
    const l = pvNorm(labelOf(it));
    if (l && !idx.has(l)) idx.set(l, { bag, key: it.key });
  });
  add('physical', typeof PHYSICAL !== 'undefined' ? PHYSICAL : [], it => it.label);
  add('amenities', typeof AMENITIES !== 'undefined' ? AMENITIES : [], it => it.label);
  add('fees', (SCHEMA.fees || []).filter(f => f.compsLabel), f => f.compsLabel);
  add('fees', SCHEMA.fees || [], f => f.label);
  return idx;
}

/* Payload keys (what the skill's comp payload calls a field) -> tracker keys. */
const PV_FIELD_ALIAS = {
  vacancy: 'vacancy_pct', vacancy_pct: 'vacancy_pct', occupancy_vacancy: 'vacancy_pct',
  concession: 'concession_amount', concession_amount: 'concession_amount',
  distance: 'distance_miles', building_website: 'website', units: 'total_units',
  street: 'address', full_address: 'address',
};

// ---------------------------------------------------------------- discovery

/**
 * The results file for this import: written for the picked workbook if one
 * exists, else the newest whose comp names overlap the comps being imported.
 * Returns {file, doc, match, note} or null. Never throws — a missing or
 * unreadable results file must not break an import that already succeeded.
 */
async function pvFindResults(pick, compNames) {
  try {
    const folders = new Set();
    if (STATE.drive.folderId) {
      const id = await driveFindSubfolder(STATE.drive.folderId, COMPS_FOLDER);
      if (id) folders.add(id);
    }
    if (pick && pick.folderId) {            // ModPack layout: 3. Comps beside the proforma
      const id = await driveFindSubfolder(pick.folderId, COMPS_FOLDER);
      if (id) folders.add(id);
    }
    let files = [];
    for (const id of folders) {
      (await listFiles(id)).forEach(f => { if (PV_FILE_RE.test(f.name)) files.push(f); });
    }
    if (!files.length) return null;
    files.sort((a, b) => String(b.modifiedTime).localeCompare(String(a.modifiedTime)));
    files = files.slice(0, PV_MAX_FILES);

    const want = new Set((compNames || []).map(pvNorm).filter(Boolean));
    let byNames = null;
    for (const f of files) {
      let doc;
      try { doc = JSON.parse(new TextDecoder().decode(await driveDownloadBuffer(f.id))); }
      catch (e) { continue; }
      if (!doc || doc.schema !== PV_SCHEMA || !Array.isArray(doc.comps)) continue;
      if (pick && pvBase(doc.workbook).toLowerCase() === String(pick.name).toLowerCase()) {
        return { file: f, doc, match: 'workbook', note: 'written for this workbook' };
      }
      if (!byNames && want.size) {
        const hit = doc.comps.filter(c => want.has(pvNorm(c.name))).length;
        if (hit && hit >= Math.ceil(Math.min(want.size, doc.comps.length) / 2)) {
          byNames = { file: f, doc, match: 'names',
            note: `matched by comp names (${hit} of ${doc.comps.length}); written for ${pvBase(doc.workbook) || 'another workbook'}` };
        }
      }
    }
    return byNames;
  } catch (e) {
    console.warn('results JSON lookup failed', e);
    return null;
  }
}

/** Counts for the preview line, against the comps that will exist after apply. */
function pvSummary(doc, comps) {
  const names = new Set((comps || []).map(c => pvNorm(c.name)));
  const matched = doc.comps.filter(c => names.has(pvNorm(c.name))).length;
  let values = 0, untimed = 0;
  const tally = r => { values++; if (!r.looked_up_at && !r.computed_at && r.source !== 'computed') untimed++; };
  doc.comps.forEach(c => {
    Object.keys(c.fields || {}).forEach(k => {
      if (k === 'unit_mix') {
        const um = c.fields[k];
        (um.value || []).forEach(e => tally(pvRentRec(e) || um));
      } else tally(c.fields[k]);
    });
    (c.backfill_runs || []).forEach(r => (r.cells || []).forEach(tally));
  });
  return { matched, inFile: doc.comps.length, values, untimed };
}

// -------------------------------------------------------------------- apply

/** Unit rows <- unit_mix entries: plan name, SF, rent and count, best first. */
function pvMatchUnits(rows, entries) {
  const used = new Set();
  const out = new Map();
  rows.forEach(r => {
    let best = -1, bestScore = 0;
    entries.forEach((e, i) => {
      if (used.has(i)) return;
      let s = 0;
      if (pvNorm(r.plan) && pvNorm(r.plan) === pvNorm(e.name)) s += 3;
      if (pvNum(r.sqft) != null && pvNum(r.sqft) === pvNum(e.sf)) s += 2;
      if (pvNum(r.ask_rent) != null && pvSame(r.ask_rent, e.rent)) s += 2;
      if (pvNum(r.count) != null && pvNum(r.count) === pvNum(e.count)) s += 1;
      if (s > bestScore) { bestScore = s; best = i; }
    });
    if (best >= 0 && bestScore >= 3) { used.add(best); out.set(r, entries[best]); }
  });
  return out;
}

function pvApplyComp(c, jc, bandIdx, stats) {
  c.prov = {};
  const fields = jc.fields || {};
  Object.keys(fields).forEach(k => {
    if (k === 'unit_mix') return;
    const f = fields[k];
    const key = PV_FIELD_ALIAS[k] || k;
    const r = pvRec(f);
    /* Disagreement is reported, never resolved here: the workbook is the value
       source and may have been edited after the run. Vacancy travels as a 0-1
       fraction in the payload and as a percent in the tracker. */
    if (f.value != null && c[key] != null && c[key] !== '') {
      let jv = f.value;
      if (key === 'vacancy_pct' && pvNum(jv) != null && pvNum(jv) <= 1 && pvNum(c[key]) > 1) jv = pvNum(jv) * 100;
      /* The COMPS address cell holds the street only; the payload has the full
         "street, city, ST zip". Compare streets. */
      if (key === 'address' && typeof jv === 'string') jv = jv.split(',')[0];
      if (typeof jv !== 'object' && !pvSame(jv, c[key])) r.differs = { file: jv };
    }
    c.prov[key] = r;
    stats.values++;
  });
  // Fill only what the workbook has no cell for.
  if (!c.website && fields.website && fields.website.value) c.website = String(fields.website.value);
  if (!c.hellodata_id && jc.hellodata_id) c.hellodata_id = String(jc.hellodata_id);
  if (fields.apartments_url && fields.apartments_url.value) c.apartments_url = String(fields.apartments_url.value);

  const um = fields.unit_mix;
  if (um && Array.isArray(um.value) && Array.isArray(c.unitMix)) {
    const base = pvRec(um);
    const pairs = pvMatchUnits(c.unitMix, um.value);
    c.unitMix.forEach(r => {
      const e = pairs.get(r);
      if (!e) { delete r.prov; return; }
      const rent = pvRentRec(e) || Object.assign({}, base);
      if (e.rent != null && r.ask_rent !== '' && r.ask_rent != null && !pvSame(e.rent, r.ask_rent)) rent.differs = { file: e.rent };
      /* Rent only. SF / # Units / plan all share the unit mix's one source
         (shown in this card's "How" line); ticking all four on every plan row
         was noise. The rent is the value whose source varies plan by plan. */
      r.prov = { ask_rent: rent };
      stats.values++;
      stats.units++;
    });
  }

  (jc.backfill_runs || []).forEach(run => (run.cells || []).forEach(cell => {
    const hit = bandIdx.get(pvNorm(cell.label));
    if (!hit) { stats.unmapped++; return; }
    const r = pvRec(cell, { script: run.script });
    const now = (c[hit.bag] || {})[hit.key];
    if (cell.value != null && now != null && now !== '' && !pvSame(cell.value, now)) r.differs = { file: cell.value };
    c.prov[hit.bag + '.' + hit.key] = r;        // later runs overwrite earlier ones
    stats.values++;
  }));

  if (jc.score && jc.score.value != null) {
    c.score = {
      value: jc.score.value, rank: jc.score.rank, of: jc.score.of, comp_type: jc.score.comp_type,
      components: jc.score.components || {}, computed_at: jc.score.computed_at || '', detail: jc.score.detail || '',
    };
  } else delete c.score;
}

/** Subject: backfilled attributes and the column-G market rents. */
function pvApplySubject(subj, bandIdx, stats) {
  const s = STATE.subject;
  s.prov = {};
  (subj.backfill_runs || []).forEach(run => (run.cells || []).forEach(cell => {
    const hit = bandIdx.get(pvNorm(cell.label));
    if (!hit) { stats.unmapped++; return; }
    s.prov[hit.bag + '.' + hit.key] = pvRec(cell, { script: run.script });
    stats.values++;
  }));

  /* Column G: the populator's rent (market_rents), then the scorer's
     (market_rents_scored) on top — same cell, later stage wins. Plan-level
     entries go on the subject unit row (the Screener's per-plan rent);
     section-level ones on the bucket (tab 3). */
  const byCell = new Map();
  (subj.market_rents || []).forEach(m => byCell.set(m.cell || (m.section + '|' + m.plan), m));
  (subj.market_rents_scored || []).forEach(m => {
    const prev = byCell.get(m.cell);
    byCell.set(m.cell || (m.section + '|' + m.plan), Object.assign({}, prev || {}, m));
  });
  (STATE.subjectUnitMix || []).forEach(r => { if (r.prov) delete r.prov.market_rent; });
  Object.keys(STATE.marketRents || {}).forEach(k => { if (STATE.marketRents[k]) delete STATE.marketRents[k].prov; });

  byCell.forEach(m => {
    const lines = (m.comp_lines_used || []).slice(0, 8).map(l => ({
      comp: l.comp, rent: l.asking_rent, sf: l.sf, adj: l.size_adjusted_rent, score: l.comp_score, share: l.weight_share,
    }));
    const r = pvRec(m, {
      source: 'computed', value: m.value, cell: m.cell,
      basis: m.basis || '', old_value: m.old_value != null ? m.old_value : undefined,
      lines: lines.length ? lines : undefined,
    });
    if (m.plan) {
      const rows = (STATE.subjectUnitMix || []).filter(x => pvNorm(x.plan) === pvNorm(m.plan));
      rows.forEach(x => { x.prov = x.prov || {}; x.prov.market_rent = r; });
      if (rows.length) stats.values++;
    } else if (m.section) {
      STATE.marketRents[m.section] = Object.assign({}, STATE.marketRents[m.section] || {}, { prov: r });
      stats.values++;
    }
  });
}

/** Apply one results file to the open subject. Returns the stats it recorded. */
function pvApply(found) {
  const { doc, file } = found;
  const bandIdx = pvBandIndex();
  const stats = { values: 0, units: 0, unmapped: 0, matched: 0 };
  const byName = new Map((STATE.comps || []).map(c => [pvNorm(c.name), c]));
  const unmatched = [];
  doc.comps.forEach(jc => {
    const c = byName.get(pvNorm(jc.name));
    if (!c) { unmatched.push(jc.name); return; }
    pvApplyComp(c, jc, bandIdx, stats);
    stats.matched++;
  });
  pvApplySubject(doc.subject || {}, bandIdx, stats);

  const sum = pvSummary(doc, STATE.comps);
  const artifacts = {};
  Object.keys(doc.artifacts || {}).forEach(k => {
    const a = doc.artifacts[k] || {};
    const p = String(a.path || '');
    artifacts[k] = /^https?:/i.test(p) ? { url: p } : { name: pvBase(p) };
  });
  STATE.imports = STATE.imports || {};
  STATE.imports.results = {
    fileId: file.id, fileName: file.name, driveModifiedTime: file.modifiedTime || '',
    createdAt: doc.created_at || '', updatedAt: doc.updated_at || '', status: doc.status || '',
    skillVersion: doc.skill_version || '', workbook: pvBase(doc.workbook), match: found.match,
    compsMatched: stats.matched, compsInFile: doc.comps.length, unmatched,
    values: stats.values, untimed: sum.untimed, unmappedCells: stats.unmapped, artifacts,
    stages: (doc.stages || []).map(s => s.stage),
    importedAt: nowISO(), importedBy: pvEmail(),
  };
  return stats;
}

// ------------------------------------------------------- importer hooks

function pvSel(id, dflt) {
  return PF.sel && Object.prototype.hasOwnProperty.call(PF.sel, id) ? PF.sel[id] : dflt;
}

function pvPreviewGroupHtml() {
  const r = PF.results;
  if (r === 'searching') return `<div class="tiny muted pv-grp-note">Looking in 3. Comps for a results file…</div>`;
  if (!r) return `<div class="tiny muted pv-grp-note" title="The Rent Comps Unified skill (v1.34+) writes one per run: 3. Comps/<Property> - rent comps results <date>.json">No results file in 3. Comps — no sources to attach.</div>`;
  const doComps = !!($('#pf-g-comps') ? $('#pf-g-comps').checked : pvSel('pf-g-comps', true));
  const target = doComps && PF.parsed ? PF.parsed.comps : STATE.comps;
  const s = pvSummary(r.doc, target);
  const on = pvSel('pf-g-prov', !!s.matched || !!(r.doc.subject && r.doc.subject.market_rents));
  return `<label class="pf-grp" title="${esc(r.file.name)} — ${esc(r.note)}">
      <input type="checkbox" id="pf-g-prov"${on ? ' checked' : ''}/>
      <span>Sources &amp; lookup times <b>${s.values}</b>
        <span class="muted tiny">${s.matched}/${s.inFile} comps${s.untimed ? ' · ' + s.untimed + ' with no lookup time' : ''}</span></span>
    </label>
    <div class="tiny muted pv-grp-note">${esc(r.file.name)}<br/>${esc(r.note)}</div>`;
}

function pvStampHtml() {
  const r = STATE && STATE.imports && STATE.imports.results;
  if (!r || !r.fileName) return '';
  const links = Object.keys(r.artifacts || {}).filter(k => r.artifacts[k].url)
    .map(k => `<a href="${esc(r.artifacts[k].url)}" target="_blank" rel="noopener">${esc(k === 'mymaps_url' ? 'comp map' : k)} ↗</a>`);
  let abs = r.importedAt;
  try { abs = new Date(r.importedAt).toLocaleString(); } catch (e) { /* ISO */ }
  return `<div class="pf-stamp" title="${esc(r.fileName + ' — attached ' + abs + (r.importedBy ? ' by ' + r.importedBy : '')
      + (r.unmatched && r.unmatched.length ? '\nNot matched: ' + r.unmatched.join(', ') : ''))}">
    <span class="pf-stamp-file">Sources: ${esc(r.fileName)}</span> · ${r.compsMatched}/${r.compsInFile} comps · ${r.values} values${
      r.untimed ? ' · ' + r.untimed + ' untimed' : ''}${links.length ? ' · ' + links.join(' · ') : ''} · attached ${esc(relTime(r.importedAt))}</div>`;
}

function pvInstallImportHooks() {
  if (typeof pfRead !== 'function' || window.__pvHooked) return;
  window.__pvHooked = true;

  const innerRead = window.pfRead;
  window.pfRead = async function () {
    await innerRead.apply(this, arguments);
    if (PF.step !== 'preview' || !PF.parsed) return;
    PF.results = 'searching';
    pfRerender();
    const found = await pvFindResults(pfPickedFile(), PF.parsed.comps.map(c => c.name));
    if (PF.step !== 'preview') return;            // user moved on meanwhile
    PF.results = found;
    pfRerender();
  };

  const innerPreview = window.pfPreviewHtml;
  window.pfPreviewHtml = function () {
    const html = innerPreview.apply(this, arguments);
    const marker = '<div class="pf-grps">';
    const at = html.indexOf(marker);
    if (at < 0) return html;
    const close = html.indexOf('</div>', at);           // the group list holds only <label>s
    return html.slice(0, close) + pvPreviewGroupHtml() + html.slice(close);
  };

  const innerStamp = window.pfStampHtml;
  window.pfStampHtml = function (key) {
    return innerStamp.apply(this, arguments) + (key === 'marketRents' ? pvStampHtml() : '');
  };

  const innerApply = window.pfApply;
  window.pfApply = function () {
    const box = $('#pf-g-prov');
    const res = box && box.checked && !box.disabled && PF.results && PF.results.doc ? PF.results : null;
    const others = ['pf-g-subject', 'pf-g-mix', 'pf-g-comps', 'pf-g-rents', 'pf-g-sband']
      .some(id => { const e = $('#' + id); return e && e.checked && !e.disabled; });
    if (!others) {
      if (!res) return innerApply.apply(this, arguments);
      const st = pvApply(res);
      saveState();
      pfResetImport();
      toast('Attached sources to ' + st.matched + ' comp' + (st.matched === 1 ? '' : 's') + ' · ' + st.values + ' values');
      renderPhase1();
      return;
    }
    const out = innerApply.apply(this, arguments);
    if (res && PF.step !== 'preview') {        // the import really applied (not the confirm step)
      const st = pvApply(res);
      saveState();
      toast('Imported · sources attached to ' + st.matched + ' comp' + (st.matched === 1 ? '' : 's'));
      renderPhase1();
    }
    return out;
  };
}

// ----------------------------------------------------------- locate / edit

/** Where the record for a control lives: {holder, key} or null. */
function pvLocate(path, key) {
  if (!STATE || !path) return null;
  if (path === 'subject') return { holder: STATE.subject, key };
  let m = /^subject\.(physical|amenities|fees)$/.exec(path);
  if (m) return { holder: STATE.subject, key: m[1] + '.' + key };
  m = /^comp:([^.:]+)(?:\.(\w+))?$/.exec(path);
  if (m) {
    const c = getComp(m[1]);
    return c ? { holder: c, key: m[2] ? m[2] + '.' + key : key } : null;
  }
  if (/^unit:/.test(path)) {
    const r = resolveUnitFieldTarget(path);
    return r ? { holder: r, key } : null;
  }
  return null;
}

function pvRecFor(loc) {
  return loc && loc.holder && loc.holder.prov ? loc.holder.prov[loc.key] || null : null;
}

/** A hand edit replaces the looked-up record, keeping what it was. */
function pvMarkEdited(loc) {
  const was = pvRecFor(loc);
  if (!was) return false;
  const by = pvEmail();
  loc.holder.prov[loc.key] = was.edited
    ? Object.assign({}, was, { edited_at: nowISO(), edited_by: by || was.edited_by })
    : { source: 'Edited in Rent Comps Tracker', edited: true, edited_at: nowISO(), edited_by: by, was };
  return true;
}

function pvScreenerRow(tr) {
  if (!tr || !STATE) return null;
  const tds = tr.querySelectorAll('td');
  if (tds.length < 2) return null;
  const plan = pvNorm((tds[0].childNodes[0] || {}).textContent || '');
  const status = pvNorm(tds[1].textContent);
  return (STATE.subjectUnitMix || []).find(r => pvNorm(r.plan) === plan && pvNorm(r.status) === status)
    || (STATE.subjectUnitMix || []).find(r => pvNorm(r.plan) === plan) || null;
}

function pvOnEdit(ev) {
  const t = ev.target;
  let loc = null;
  const field = t.closest && t.closest('[data-fpath][data-fkey]');
  const tri = t.closest && t.closest('.tri[data-tri] button[data-triv]');
  const mr = t.closest && t.closest('[data-mroverride]');
  const sc = t.closest && t.closest('[data-scmkt]');
  const cat = t.closest && t.closest('.cat-picker button[data-cat]');
  if (cat) {
    loc = pvLocate(cat.closest('.cat-picker').getAttribute('data-catpicker'), 'category');
  } else if (tri) {
    const w = tri.closest('.tri');
    loc = pvLocate(w.getAttribute('data-tri'), w.getAttribute('data-trikey'));
  } else if (field && ev.type === 'change') {
    loc = pvLocate(field.getAttribute('data-fpath'), field.getAttribute('data-fkey'));
  } else if (mr && ev.type === 'change') {
    const b = STATE.marketRents[mr.getAttribute('data-mroverride')];
    loc = b ? { holder: { prov: b.prov ? { v: b.prov } : null }, key: 'v', bucket: b } : null;
    if (loc && pvRecFor(loc)) { pvMarkEdited(loc); b.prov = loc.holder.prov.v; saveState(); pvSchedule(); }
    return;
  } else if (sc && ev.type === 'change') {
    const row = pvScreenerRow(sc.closest('tr'));
    if (row) {
      const plan = pvNorm(row.plan);
      let any = false;
      (STATE.subjectUnitMix || []).filter(r => pvNorm(r.plan) === plan)
        .forEach(r => { if (pvMarkEdited({ holder: r, key: 'market_rent' })) any = true; });
      if (any) { saveState(); pvSchedule(); }
    }
    return;
  }
  if (!loc) return;
  // After the app's own handler has written the value.
  setTimeout(() => { if (pvMarkEdited(loc)) { saveState(); pvSchedule(); } }, 0);
}

// ------------------------------------------------------------- decoration

const PV_KIND_LABEL = {
  ok: 'Looked up', untimed: 'No lookup time', computed: 'Computed',
  edited: 'Edited in the tracker', differs: 'Changed since the run',
};

/** "Nov 17, 2026, 1:42 PM" — date-only strings stay date-only (no UTC shift). */
function pvWhen(s) {
  if (!s) return '';
  const d0 = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(s));
  if (d0) return new Date(+d0[1], +d0[2] - 1, +d0[3]).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
  const d = new Date(s);
  if (isNaN(d)) return String(s);
  return d.toLocaleString(undefined, { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' });
}
function pvAgo(s) {
  if (!s || /^\d{4}-\d{2}-\d{2}$/.test(String(s))) return '';
  try { return relTime(new Date(s).toISOString()); } catch (e) { return ''; }
}
function pvHost(u) { try { return new URL(u).hostname.replace(/^www\./, ''); } catch (e) { return u; } }
function pvFmtVal(v) {
  if (v == null || v === '') return '—';
  if (typeof v === 'object') return JSON.stringify(v);
  return String(v);
}

function pvRow(k, v, cls) {
  return v ? `<div class="pv-r${cls ? ' ' + cls : ''}"><span class="pv-k">${esc(k)}</span><span class="pv-v">${v}</span></div>` : '';
}

/** The hover card for one record. `now` = the value the tracker holds today. */
function pvCardHtml(r, now) {
  const kind = pvKind(r);
  const parts = [];
  parts.push(`<div class="pv-h pv-${kind}"><span class="pv-chip">${esc(PV_KIND_LABEL[kind] || 'Source')}</span></div>`);
  if (r.edited) {
    parts.push(pvRow('By', esc(r.edited_by || 'someone')));
    parts.push(pvRow('When', esc(pvWhen(r.edited_at)) + (pvAgo(r.edited_at) ? ` <span class="pv-ago">${esc(pvAgo(r.edited_at))}</span>` : '')));
    if (r.was) {
      const w = r.was;
      parts.push(`<div class="pv-sep">Before the edit</div>`);
      parts.push(pvRow('Source', esc(w.source || '')));
      if (w.looked_up_at || w.computed_at) parts.push(pvRow(w.computed_at ? 'Computed' : 'Looked up', esc(pvWhen(w.looked_up_at || w.computed_at))));
      if (w.url) parts.push(pvRow('Link', `<a href="${esc(w.url)}" target="_blank" rel="noopener">${esc(pvHost(w.url))} ↗</a>`));
    }
    return parts.join('');
  }
  const computed = kind === 'computed';
  parts.push(pvRow('Source', esc(computed ? (r.detail || 'computed') : (r.source || '—'))));
  if (computed && r.computed_at) parts.push(pvRow('Computed', esc(pvWhen(r.computed_at))));
  if (!computed) {
    parts.push(pvRow('Looked up', r.looked_up_at
      ? esc(pvWhen(r.looked_up_at)) + (pvAgo(r.looked_up_at) ? ` <span class="pv-ago">${esc(pvAgo(r.looked_up_at))}</span>` : '')
      : '<span class="pv-warn">not recorded</span>'));
  }
  if (!computed && r.detail) parts.push(pvRow('How', esc(r.detail)));
  if (r.basis) parts.push(pvRow('Basis', esc(r.basis)));
  if (r.quote) parts.push(pvRow('Site text', `“${esc(String(r.quote).slice(0, 160))}${String(r.quote).length > 160 ? '…' : ''}”`));
  if (r.replaced && r.replaced.value != null) parts.push(pvRow('Replaced', esc('$' + Number(r.replaced.value).toLocaleString() + ' from ' + (r.replaced.source || 'an earlier source'))));
  if (r.old_value != null && r.value != null && String(r.old_value) !== String(r.value)) parts.push(pvRow('Changed', esc('$' + r.old_value + ' → $' + r.value)));
  if (Array.isArray(r.lines) && r.lines.length) {
    parts.push(`<div class="pv-sep">Comp lines used</div>` + r.lines.map(l =>
      `<div class="pv-line"><span>${esc(l.comp)}</span><span>${l.rent != null ? '$' + Math.round(l.rent) : ''}${l.sf ? ' · ' + Math.round(l.sf) + ' SF' : ''}${l.share != null ? ' · ' + Math.round(l.share * 100) + '%' : ''}</span></div>`).join(''));
  }
  if (r.url) parts.push(pvRow('Link', `<a href="${esc(r.url)}" target="_blank" rel="noopener">${esc(pvHost(r.url))} ↗</a>`));
  if (r.cell) parts.push(pvRow('Cell', esc(r.cell) + (r.script ? ` <span class="pv-ago">${esc(r.script)}</span>` : '')));
  if (r.note) parts.push(pvRow('Note', esc(r.note)));
  if (r.time_note) parts.push(pvRow('Time', esc(r.time_note), 'pv-warnrow'));
  if (r.conflict) parts.push(pvRow('Conflict', esc(typeof r.conflict === 'string' ? r.conflict : JSON.stringify(r.conflict)), 'pv-warnrow'));
  if (r.differs) parts.push(pvRow('Run value', esc(pvFmtVal(r.differs.file)) + ` <span class="pv-ago">the tracker now holds ${esc(pvFmtVal(now))}</span>`, 'pv-warnrow'));
  const f = STATE && STATE.imports && STATE.imports.results;
  if (f && f.fileName) parts.push(`<div class="pv-foot">${esc(f.fileName)}</div>`);
  return parts.join('');
}

function pvScoreCardHtml(c) {
  const s = c.score;
  const comp = s.components || {};
  const rows = Object.keys(comp).map(k => {
    const v = comp[k] || {};
    const pct = v.value != null ? Math.round(v.value * 100) : null;
    return `<div class="pv-line"><span>${esc(k)}</span><span>${pct != null ? pct + '%' : ''}${v.detail ? ' · ' + esc(v.detail) : ''}</span></div>`;
  }).join('');
  const tally = {};
  const add = r => { if (!r) return; const k = r.edited ? 'Edited in tracker' : (r.source === 'computed' ? 'computed' : (r.source || 'unknown')); tally[k] = (tally[k] || 0) + 1; };
  Object.values(c.prov || {}).forEach(add);
  (c.unitMix || []).forEach(u => add(u.prov && u.prov.ask_rent));
  const src = Object.keys(tally).sort((a, b) => tally[b] - tally[a])
    .map(k => `<div class="pv-line"><span>${esc(k)}</span><span>${tally[k]}</span></div>`).join('');
  return `<div class="pv-h pv-computed"><span class="pv-chip">Comp score ${esc(String(s.value))}${s.rank ? ' · #' + s.rank + (s.of ? ' of ' + s.of : '') : ''}</span></div>
    ${s.comp_type ? pvRow('Type', esc(s.comp_type)) : ''}
    ${s.computed_at ? pvRow('Computed', esc(pvWhen(s.computed_at))) : ''}
    ${rows ? `<div class="pv-sep">Components</div>${rows}` : ''}
    ${src ? `<div class="pv-sep">Where this comp's values came from</div>${src}` : ''}`;
}

/* setTimeout, not requestAnimationFrame: rAF does not fire in a hidden tab,
   and the pending flag would then stay set, so no tick would ever paint again
   once the tab came back. */
let _pvTimer = 0;
function pvSchedule() {
  if (_pvTimer) return;
  _pvTimer = setTimeout(() => {
    _pvTimer = 0;
    try { pvDecorate(); } catch (e) { console.warn('provenance decorate', e); }
  }, 30);
}

function pvMark(container, kind, payload) {
  if (!container) return;
  container.classList.add('pv-on');
  container.setAttribute('data-pvkind', kind);
  container.__pv = payload;
  let tick = container.querySelector(':scope > .pv-tick');
  if (!tick) {
    tick = document.createElement('span');
    tick.className = 'pv-tick';
    tick.setAttribute('role', 'button');
    tick.setAttribute('tabindex', '0');
    tick.setAttribute('aria-label', 'Show where this value came from');
    container.appendChild(tick);
  }
  /* The label's own note would pop a native tooltip over the card; carry it
     into the card instead. */
  const lbl = container.querySelector(':scope > label[title], :scope > .lbl[title]');
  if (lbl) { container.__pvNote = lbl.getAttribute('title'); lbl.removeAttribute('title'); }
}

function pvUnmark(container) {
  container.classList.remove('pv-on');
  container.removeAttribute('data-pvkind');
  delete container.__pv;
  const t = container.querySelector(':scope > .pv-tick');
  if (t) t.remove();
}

function pvDecorate() {
  const host = document.getElementById('phase-content');
  if (!host || !STATE) return;
  const seen = new Set();

  const mark = (container, rec, now) => {
    if (!container || !rec) return;
    seen.add(container);
    pvMark(container, pvKind(rec), { rec, now });
  };

  // Text / number / select fields (.field) and the attribute grids (.lbl + control).
  host.querySelectorAll('[data-fpath][data-fkey]').forEach(el => {
    const loc = pvLocate(el.getAttribute('data-fpath'), el.getAttribute('data-fkey'));
    const rec = pvRecFor(loc);
    if (!rec) return;
    const now = el.value;
    const fieldBox = el.closest('.field');
    if (fieldBox) { mark(fieldBox, rec, now); return; }
    const cell = el.closest('.fee-cell') || el;
    mark(cell.previousElementSibling && cell.previousElementSibling.classList.contains('lbl') ? cell.previousElementSibling : cell, rec, now);
  });
  host.querySelectorAll('.tri[data-tri]').forEach(w => {
    const loc = pvLocate(w.getAttribute('data-tri'), w.getAttribute('data-trikey'));
    const rec = pvRecFor(loc);
    if (!rec) return;
    const now = (w.querySelector('button.on-y') && 'Y') || (w.querySelector('button.on-n') && 'N') || '';
    const lbl = w.previousElementSibling;
    mark(lbl && lbl.classList.contains('lbl') ? lbl : w, rec, now);
  });
  // Tab 3 — bucket market rents.
  host.querySelectorAll('[data-mroverride]').forEach(inp => {
    const b = STATE.marketRents[inp.getAttribute('data-mroverride')];
    if (b && b.prov) mark(inp.closest('td') || inp, b.prov, inp.value);
  });
  // Screener — per-plan market rents.
  host.querySelectorAll('[data-scmkt]').forEach(inp => {
    const row = pvScreenerRow(inp.closest('tr'));
    const rec = row && row.prov && row.prov.market_rent;
    if (rec) mark(inp.closest('td') || inp, rec, inp.value);
  });
  // Comp score chips — comp list cards and the comp editor head.
  host.querySelectorAll('[data-compcard] > .card-head, #comp-editor > .card-head').forEach(head => {
    const card = head.parentElement;
    const id = card.getAttribute('data-compcard') || OPEN_COMP_ID;
    const c = id ? getComp(id) : null;
    let chip = head.querySelector('.pv-score');
    if (!c || !c.score) { if (chip) chip.remove(); return; }
    if (!chip) {
      chip = document.createElement('span');
      chip.className = 'pv-score';
      const grow = head.querySelector('.grow');
      if (grow && grow.nextSibling) head.insertBefore(chip, grow.nextSibling); else head.appendChild(chip);
    }
    // Only on change: rewriting the text is a childList mutation, which would
    // re-trigger the observer and loop.
    const label = 'Score ' + c.score.value;
    if (chip.textContent !== label) chip.textContent = label;
    chip.__pv = { score: c };
    chip.classList.add('pv-on');
    seen.add(chip);
  });

  host.querySelectorAll('.pv-on').forEach(n => { if (!seen.has(n) && !n.classList.contains('pv-score')) pvUnmark(n); });
}

// ------------------------------------------------------------- hover card

let _pvPop = null, _pvHideT = 0, _pvShowT = 0, _pvPinned = false, _pvFor = null;

function pvPop() {
  if (_pvPop) return _pvPop;
  _pvPop = document.createElement('div');
  _pvPop.id = 'pv-pop';
  _pvPop.setAttribute('role', 'tooltip');
  _pvPop.addEventListener('mouseenter', () => clearTimeout(_pvHideT));
  _pvPop.addEventListener('mouseleave', () => { if (!_pvPinned) pvHideSoon(); });
  document.body.appendChild(_pvPop);
  return _pvPop;
}

function pvShow(target) {
  const p = target.__pv;
  if (!p) return;
  const pop = pvPop();
  let html = p.score ? pvScoreCardHtml(p.score) : pvCardHtml(p.rec, p.now);
  if (target.__pvNote) html += `<div class="pv-sep">About this field</div><div class="pv-note">${esc(target.__pvNote)}</div>`;
  pop.innerHTML = html;
  pop.classList.add('show');
  _pvFor = target;
  const r = target.getBoundingClientRect();
  const w = Math.min(340, window.innerWidth - 16);
  pop.style.width = w + 'px';
  let left = Math.min(Math.max(8, r.left), window.innerWidth - w - 8);
  const h = pop.offsetHeight;
  let top = r.bottom + 6;
  if (top + h > window.innerHeight - 8 && r.top - h - 6 > 8) top = r.top - h - 6;
  pop.style.left = left + 'px';
  pop.style.top = Math.max(8, top) + 'px';
}

function pvHide() {
  if (_pvPop) _pvPop.classList.remove('show');
  _pvPinned = false;
  _pvFor = null;
}
function pvHideSoon() { clearTimeout(_pvHideT); _pvHideT = setTimeout(pvHide, 180); }

function pvInstallHover() {
  document.addEventListener('mouseover', ev => {
    const t = ev.target.closest && ev.target.closest('.pv-on');
    if (!t || _pvPinned) return;
    clearTimeout(_pvHideT);
    if (_pvFor === t) return;
    clearTimeout(_pvShowT);
    _pvShowT = setTimeout(() => pvShow(t), 220);
  });
  document.addEventListener('mouseout', ev => {
    const t = ev.target.closest && ev.target.closest('.pv-on');
    if (!t) return;
    if (ev.relatedTarget && (t.contains(ev.relatedTarget) || (_pvPop && _pvPop.contains(ev.relatedTarget)))) return;
    clearTimeout(_pvShowT);
    if (!_pvPinned) pvHideSoon();
  });
  // Tap / click the tick (or the score chip) pins the card — the phone path.
  document.addEventListener('click', ev => {
    const tick = ev.target.closest && ev.target.closest('.pv-tick, .pv-score');
    if (tick) {
      ev.preventDefault();
      ev.stopPropagation();
      const t = tick.classList.contains('pv-score') ? tick : tick.parentElement;
      if (_pvPinned && _pvFor === t) { pvHide(); return; }
      clearTimeout(_pvShowT);
      pvShow(t);
      _pvPinned = true;
      return;
    }
    if (_pvPinned && !(_pvPop && _pvPop.contains(ev.target))) pvHide();
  }, true);
  document.addEventListener('keydown', ev => {
    if (ev.key === 'Escape') pvHide();
    if ((ev.key === 'Enter' || ev.key === ' ') && ev.target.classList && ev.target.classList.contains('pv-tick')) {
      ev.preventDefault();
      pvShow(ev.target.parentElement);
      _pvPinned = true;
    }
  });
  window.addEventListener('scroll', () => { if (!_pvPinned) pvHide(); }, true);
}

// ------------------------------------------------------------ self-install

function pvInstall() {
  const host = document.getElementById('phase-content');
  if (!host) { setTimeout(pvInstall, 50); return; }
  pvInstallImportHooks();
  pvInstallHover();
  new MutationObserver(pvSchedule).observe(host, { childList: true, subtree: true });
  host.addEventListener('change', pvOnEdit, true);
  host.addEventListener('click', ev => {
    if (ev.target.closest && ev.target.closest('.tri[data-tri] button[data-triv], .cat-picker button[data-cat]')) pvOnEdit(ev);
  });
  pvSchedule();
}

window.PROVENANCE = { find: pvFindResults, apply: pvApply, summary: pvSummary, decorate: pvDecorate, locate: pvLocate, kind: pvKind, card: pvCardHtml };
pvInstall();
