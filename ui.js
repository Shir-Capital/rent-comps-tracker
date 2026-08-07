/* ============================================================================
   Rent Comps Tracker — ui.js
   Home screen, tab shell, and tabs 1–3 (Subject / Comps / Market Rents).
   Tab 4 (Export) lives in export.js.

   Rendering convention: build HTML with esc()'d values, then wire behaviour
   with delegated listeners keyed off data-* attributes. Text inputs mutate
   state on `input` and never re-render their own row, so typing is never
   interrupted; anything that changes a derived number calls a targeted
   refresh helper instead of a full re-render.
   ========================================================================= */

'use strict';

let CURRENT_PHASE = 1;
let OPEN_COMP_ID = null;      // when set, tab 2 shows the comp editor
const COLLAPSED = new Set();  // ui-only: collapsed row/card keys

// ============================================================================
// Field rendering
// ============================================================================

function fieldHtml(f, obj, path) {
  const v = obj[f.key] == null ? '' : obj[f.key];
  const dsa = `data-fpath="${esc(path)}" data-fkey="${esc(f.key)}"`;
  let control;

  if (f.type === 'select') {
    const opts = ['<option value=""></option>'].concat(
      optionsFor(f).map(o => `<option value="${esc(o)}"${o === v ? ' selected' : ''}>${esc(o)}</option>`)
    ).join('');
    control = `<select ${dsa}>${opts}</select>`;
  } else if (f.type === 'textarea') {
    control = `<textarea ${dsa} rows="2">${esc(v)}</textarea>`;
  } else if (f.type === 'category') {
    control = categoryPickerHtml(v, path);
  } else {
    const t = f.type === 'number' ? 'number' : (f.type || 'text');
    const extra = [
      f.step ? `step="${esc(f.step)}"` : (t === 'number' ? 'step="any"' : ''),
      f.maxlength ? `maxlength="${esc(f.maxlength)}"` : '',
      t === 'number' ? 'inputmode="decimal"' : '',
      t === 'tel' ? 'inputmode="tel"' : '',
    ].filter(Boolean).join(' ');
    control = `<input type="${t}" ${extra} ${dsa} value="${esc(v)}" />`;
  }

  /* The note rides as a tooltip on the label rather than a line under the input.
     Nine fields carry one, and rendered inline they added ~9 lines of prose to
     a card that has to fit on one screen. The label gets a dotted underline so
     there is still a visible cue that an explanation exists. */
  const hint = f.note ? ` title="${esc(f.note)}"` : '';
  return `<div class="field" data-row="${esc(f.row || '')}" data-fld="${esc(f.key)}">
    <label${hint}${f.note ? ' class="has-note"' : ''}>${esc(f.label)}</label>
    ${control}
  </div>`;
}

/** Consecutive fields sharing a `row` tag render side by side. */
function fieldsHtml(fields, obj, path) {
  const out = [];
  let i = 0;
  while (i < fields.length) {
    const f = fields[i];
    if (f.row) {
      const group = [];
      while (i < fields.length && fields[i].row === f.row) { group.push(fields[i]); i++; }
      out.push(`<div class="field-row">${group.map(g => fieldHtml(g, obj, path)).join('')}</div>`);
    } else {
      out.push(fieldHtml(f, obj, path));
      i++;
    }
  }
  return out.join('');
}

function categoryPickerHtml(current, path) {
  return `<div class="cat-picker" data-catpicker="${esc(path)}">`
    + CATEGORIES.map(c => `<button type="button" class="${esc(c.key)}${current === c.key ? ' on' : ''}"
         data-cat="${esc(c.key)}" title="${esc(c.hint)}">${esc(c.symbol)} ${esc(c.label)}</button>`).join('')
    + `</div>`;
}

/**
 * Resolve a dotted path like "comp:<id>" / "subject" / "comp:<id>.fees"
 * to the live object the inputs should write into.
 */
function resolveFieldTarget(path) {
  if (!STATE) return null;
  if (path === 'subject') return STATE.subject;
  const m = String(path).match(/^comp:([^.]+)(?:\.(\w+))?$/);
  if (m) {
    const c = getComp(m[1]);
    if (!c) return null;
    return m[2] ? c[m[2]] : c;
  }
  return null;
}

/** One delegated handler covers every generated field input on the page. */
function wireFieldDelegation(root) {
  root.addEventListener('input', (ev) => {
    const el = ev.target.closest('[data-fpath][data-fkey]');
    if (!el) return;
    const target = resolveFieldTarget(el.getAttribute('data-fpath'));
    if (!target) return;
    target[el.getAttribute('data-fkey')] = el.value;
    saveState();
    afterFieldEdit(el);
  });
  root.addEventListener('change', (ev) => {
    const el = ev.target.closest('select[data-fpath][data-fkey]');
    if (!el) return;
    const target = resolveFieldTarget(el.getAttribute('data-fpath'));
    if (!target) return;
    target[el.getAttribute('data-fkey')] = el.value;
    saveState();
    afterFieldEdit(el);
  });
  root.addEventListener('click', (ev) => {
    const btn = ev.target.closest('.cat-picker button[data-cat]');
    if (!btn) return;
    const wrap = btn.closest('.cat-picker');
    const target = resolveFieldTarget(wrap.getAttribute('data-catpicker'));
    if (!target) return;
    const cat = btn.getAttribute('data-cat');
    target.category = target.category === cat ? '' : cat;
    saveState();
    $$('button', wrap).forEach(b => b.classList.toggle('on', b.getAttribute('data-cat') === target.category));
    const card = btn.closest('.comp-card, #comp-editor');
    if (card) {
      CATEGORIES.forEach(c => card.classList.remove('cat-' + c.key));
      if (target.category) card.classList.add('cat-' + target.category);
    }
    toast(target.category ? 'Comp type: ' + target.category : 'Comp type cleared');
  });
}

/** Cheap targeted refresh after any edit that can move a derived number. */
function afterFieldEdit(el) {
  const key = el.getAttribute('data-fkey');
  if (key === 'name') {
    if (el.getAttribute('data-fpath') === 'subject' && STATE) {
      STATE.name = STATE.subject.name || STATE.name;
      const h = $('#header-title');
      if (h) h.textContent = STATE.name;
    }
    const bar = el.closest('#comp-editor') && $('#comp-editor-title');
    if (bar) bar.textContent = resolveFieldTarget(el.getAttribute('data-fpath')).name || 'Untitled comp';
  }
}

// ============================================================================
// Unit-mix rows (shared by the subject and every comp)
// ============================================================================

const UMIX_COMMON = [
  { key: 'plan',  label: 'Floor Plan',  type: 'text' },
  { key: 'beds',  label: 'Beds',  type: 'number', row: 'bb' },
  { key: 'baths', label: 'Baths', type: 'number', row: 'bb', step: '0.5' },
  { key: 'sqft',  label: 'SF',    type: 'number', row: 'sc' },
  { key: 'count', label: '# Units', type: 'number', row: 'sc' },
];
const UMIX_COMP_EXTRA = [
  { key: 'ask_rent',   label: 'Ask $/Mo', type: 'number', row: 'ro' },
  { key: 'occ_pct',    label: 'Occ %',    type: 'number', row: 'ro' },
  { key: 'concession', label: 'Concession (e.g. 1 mo free)', type: 'text' },
  { key: 'notes',      label: 'Notes',    type: 'text' },
];
const UMIX_SUBJECT_EXTRA = [
  { key: 'current_rent', label: 'Current $/Mo', type: 'number', row: 'ro' },
  { key: 'status',       label: 'Status',       type: 'select', options_ref: 'unitStatus', row: 'ro' },
];

function unitRowSummary(r, kind) {
  const bits = [];
  bits.push(r.plan || '(unnamed plan)');
  if (r.beds !== '' || r.baths !== '') bits.push(num(r.beds) + 'x' + num(r.baths));
  if (num(r.sqft) > 0) bits.push(int(r.sqft) + ' SF');
  if (num(r.count) > 0) bits.push(int(r.count) + 'u');
  const rent = kind === 'subject' ? num(r.current_rent) : num(r.ask_rent);
  if (rent > 0) {
    bits.push(money(rent));
    if (num(r.sqft) > 0) bits.push('$' + (rent / num(r.sqft)).toFixed(2) + '/SF');
  }
  return bits.join(' · ');
}

function unitRowHtml(r, idx, kind, listPath) {
  const bk = bucketFor(r.beds, r.baths);
  const b = bk ? bucketByKey(bk) : null;
  const collapsedKey = 'u:' + r.id;
  const isCollapsed = !COLLAPSED.has('open:' + r.id);
  const fields = UMIX_COMMON.concat(kind === 'subject' ? UMIX_SUBJECT_EXTRA : UMIX_COMP_EXTRA);
  return `<div class="urow${isCollapsed ? ' collapsed' : ''}${bk ? '' : ' no-bucket'}"
       data-urow="${esc(r.id)}" data-ulist="${esc(listPath)}" data-ckey="${esc(collapsedKey)}">
    <div class="urow-bar" data-utoggle="${esc(r.id)}">
      <span class="chev">${isCollapsed ? '▶' : '▼'}</span>
      <span class="sum">${esc(unitRowSummary(r, kind))}</span>
      <span class="bucket">${b ? esc(b.short) : '?'}</span>
    </div>
    <div class="urow-body">
      ${fieldsHtml(fields, r, 'unit:' + listPath + ':' + r.id)}
      <div class="btn-row">
        <button class="btn small danger" data-udel="${esc(r.id)}">Delete plan</button>
        <button class="btn small" data-udup="${esc(r.id)}">Duplicate</button>
      </div>
      ${bk ? '' : '<div class="note" style="color:#b91c1c">Enter Beds (and Baths) so this plan lands in a COMPS section — unassigned plans are left out of the export.</div>'}
    </div>
  </div>`;
}

function unitMixBlockHtml(list, kind, listPath) {
  const t = unitMixTotals(list);
  const grouped = groupByBucket(list);
  const chips = BUCKETS.filter(b => (grouped[b.key] || []).length)
    .map(b => `${b.short}:${(grouped[b.key] || []).length}`).join('  ');
  const unassigned = grouped.unassigned.length;
  return `<div class="umix-summary" data-umix-summary="${esc(listPath)}">
      ${list.length} plan${list.length === 1 ? '' : 's'} · ${int(t.units)} units · ${int(t.sf)} SF
      ${t.avgSf > 0 ? ' · avg ' + int(t.avgSf) + ' SF' : ''}
      ${t.avgRent > 0 ? ' · avg ' + money(t.avgRent) : ''}
      ${chips ? '<div class="tiny muted">' + esc(chips) + '</div>' : ''}
      ${unassigned ? '<div class="tiny" style="color:#b91c1c">' + unassigned + ' plan(s) not assigned to a COMPS section</div>' : ''}
    </div>
    <div data-umix-rows="${esc(listPath)}">
      ${list.map((r, i) => unitRowHtml(r, i, kind, listPath)).join('') || '<div class="muted small">No floor plans yet.</div>'}
    </div>
    <div class="btn-row" style="margin-top:7px">
      <button class="btn small primary" data-uadd="${esc(listPath)}">+ Floor Plan</button>
    </div>`;
}

function resolveUnitList(listPath) {
  if (!STATE) return null;
  if (listPath === 'subject') return STATE.subjectUnitMix;
  const m = String(listPath).match(/^comp:(.+)$/);
  if (m) { const c = getComp(m[1]); return c ? c.unitMix : null; }
  return null;
}

/** Unit-row inputs use their own path form: "unit:<listPath>:<rowId>". */
function resolveUnitFieldTarget(path) {
  const m = String(path).match(/^unit:(.+):([^:]+)$/);
  if (!m) return null;
  const list = resolveUnitList(m[1]);
  if (!list) return null;
  return list.find(r => r.id === m[2]) || null;
}

function wireUnitMixDelegation(root) {
  // Field edits inside unit rows.
  const handler = (ev) => {
    const el = ev.target.closest('[data-fpath^="unit:"][data-fkey]');
    if (!el) return;
    const row = resolveUnitFieldTarget(el.getAttribute('data-fpath'));
    if (!row) return;
    row[el.getAttribute('data-fkey')] = el.value;
    saveState();
    refreshUnitRowChrome(el);
  };
  root.addEventListener('input', handler);
  root.addEventListener('change', handler);

  root.addEventListener('click', (ev) => {
    const bar = ev.target.closest('[data-utoggle]');
    if (bar) {
      const id = bar.getAttribute('data-utoggle');
      const wrap = bar.closest('.urow');
      const nowOpen = wrap.classList.contains('collapsed');
      wrap.classList.toggle('collapsed', !nowOpen);
      if (nowOpen) COLLAPSED.add('open:' + id); else COLLAPSED.delete('open:' + id);
      const ch = $('.chev', bar);
      if (ch) ch.textContent = nowOpen ? '▼' : '▶';
      return;
    }
    const add = ev.target.closest('[data-uadd]');
    if (add) {
      const listPath = add.getAttribute('data-uadd');
      const list = resolveUnitList(listPath);
      if (!list) return;
      const r = listPath === 'subject' ? newSubjectUnitRow() : newUnitRow();
      list.push(r);
      COLLAPSED.add('open:' + r.id);
      saveState();
      rerenderUnitMix(listPath);
      return;
    }
    const del = ev.target.closest('[data-udel]');
    if (del) {
      const wrap = del.closest('.urow');
      const listPath = wrap.getAttribute('data-ulist');
      const list = resolveUnitList(listPath);
      const id = del.getAttribute('data-udel');
      const i = list.findIndex(r => r.id === id);
      if (i >= 0) { list.splice(i, 1); saveState(); rerenderUnitMix(listPath); }
      return;
    }
    const dup = ev.target.closest('[data-udup]');
    if (dup) {
      const wrap = dup.closest('.urow');
      const listPath = wrap.getAttribute('data-ulist');
      const list = resolveUnitList(listPath);
      const src = list.find(r => r.id === dup.getAttribute('data-udup'));
      if (src) {
        const copy = Object.assign({}, src, { id: uid() });
        list.splice(list.indexOf(src) + 1, 0, copy);
        COLLAPSED.add('open:' + copy.id);
        saveState();
        rerenderUnitMix(listPath);
      }
    }
  });
}

/** Update just the collapsed summary + bucket chip of the row being typed in. */
function refreshUnitRowChrome(inputEl) {
  const wrap = inputEl.closest('.urow');
  if (!wrap) return;
  const listPath = wrap.getAttribute('data-ulist');
  const row = resolveUnitFieldTarget(inputEl.getAttribute('data-fpath'));
  if (!row) return;
  const kind = listPath === 'subject' ? 'subject' : 'comp';
  const sum = $('.sum', wrap);
  if (sum) sum.textContent = unitRowSummary(row, kind);
  const bk = bucketFor(row.beds, row.baths);
  const chip = $('.bucket', wrap);
  if (chip) chip.textContent = bk ? bucketByKey(bk).short : '?';
  wrap.classList.toggle('no-bucket', !bk);
  refreshUnitMixSummary(listPath);
  if (CURRENT_PHASE === 3) renderPhase3();
}

function refreshUnitMixSummary(listPath) {
  const node = $(`[data-umix-summary="${listPath}"]`);
  if (!node) return;
  const list = resolveUnitList(listPath);
  if (!list) return;
  const t = unitMixTotals(list);
  const grouped = groupByBucket(list);
  const chips = BUCKETS.filter(b => (grouped[b.key] || []).length)
    .map(b => `${b.short}:${(grouped[b.key] || []).length}`).join('  ');
  const unassigned = grouped.unassigned.length;
  node.innerHTML = `${list.length} plan${list.length === 1 ? '' : 's'} · ${int(t.units)} units · ${int(t.sf)} SF`
    + (t.avgSf > 0 ? ' · avg ' + int(t.avgSf) + ' SF' : '')
    + (t.avgRent > 0 ? ' · avg ' + money(t.avgRent) : '')
    + (chips ? '<div class="tiny muted">' + esc(chips) + '</div>' : '')
    + (unassigned ? '<div class="tiny" style="color:#b91c1c">' + unassigned + ' plan(s) not assigned to a COMPS section</div>' : '');
}

function rerenderUnitMix(listPath) {
  const host = $(`[data-umix-host="${listPath}"]`);
  if (!host) { renderCurrentPhase(); return; }
  const list = resolveUnitList(listPath);
  const kind = listPath === 'subject' ? 'subject' : 'comp';
  host.innerHTML = unitMixBlockHtml(list, kind, listPath);
  if (CURRENT_PHASE === 3) renderPhase3();
}

// ============================================================================
// Tri-state Y / N / blank
// ============================================================================

/**
 * Three explicit buttons rather than a cycling toggle: blank must be reachable
 * in one tap and must not look like an unset default. A blank cell is honest
 * about a gap in the data; a false "N" claims the comp positively lacks it.
 */
function triHtml(items, obj, path) {
  return `<div class="tri-grid">` + items.map(it => {
    const v = obj[it.key] || '';
    return `<div class="lbl">${esc(it.label)}</div>
      <div class="tri" data-tri="${esc(path)}" data-trikey="${esc(it.key)}">
        <button type="button" data-triv="Y" class="${v === 'Y' ? 'on-y' : ''}">Y</button>
        <button type="button" data-triv="N" class="${v === 'N' ? 'on-n' : ''}">N</button>
        <button type="button" data-triv=""  class="${v === '' ? 'on-b' : ''}">—</button>
      </div>`;
  }).join('') + `</div>`;
}

function wireTriDelegation(root) {
  root.addEventListener('click', (ev) => {
    const btn = ev.target.closest('.tri button[data-triv]');
    if (!btn) return;
    const wrap = btn.closest('.tri');
    const target = resolveFieldTarget(wrap.getAttribute('data-tri'));
    if (!target) return;
    const key = wrap.getAttribute('data-trikey');
    target[key] = btn.getAttribute('data-triv');
    saveState();
    $$('button', wrap).forEach(b => {
      b.classList.remove('on-y', 'on-n', 'on-b');
      const v = b.getAttribute('data-triv');
      if (v === target[key]) b.classList.add(v === 'Y' ? 'on-y' : (v === 'N' ? 'on-n' : 'on-b'));
    });
  });
}

// ============================================================================
// Home screen
// ============================================================================

function renderHome() {
  const host = $('#home-content');
  if (!host) return;
  const local = Object.values(STORE.properties || {});
  const remote = (MANIFEST_CACHE && MANIFEST_CACHE.data && MANIFEST_CACHE.data.properties) || [];
  const localIds = new Set(local.map(p => p.id));
  const remoteOnly = remote.filter(e => !localIds.has(e.id));

  local.sort((a, b) => String(b.updated || '').localeCompare(String(a.updated || '')));

  const onboard = localStorage.getItem(ONBOARDING_DISMISSED_KEY) ? '' : `
    <div class="onboard" id="onboard">
      <h3>Rent Comps Tracker</h3>
      <div class="muted">Capture rent comps on your phone; everything lands in the deal's
        <b>3. Comps / Rent Comps Tracker</b> folder on Drive and exports straight into the
        proforma <b>COMPS</b> tab.</div>
      <ol>
        <li>Connect Google Drive (☰ menu).</li>
        <li><b>+ New Subject</b> — name it exactly like the deal folder.</li>
        <li>Fill the Subject unit mix, then add up to ${MAX_COMPS} comps.</li>
        <li>Mark the close ones <b>Direct</b> — those drive the suggested market rents.</li>
        <li>Export on tab 4.</li>
      </ol>
      <div class="btn-row" style="margin-top:8px">
        <button class="btn small" id="btn-onboard-dismiss">Got it</button>
      </div>
    </div>`;

  const statusLine = `<div class="home-head">
      <span class="grow">${driveConnected()
        ? '✅ ' + esc((CURRENT_USER && CURRENT_USER.email) || 'Drive connected')
        : '⚠️ Google Drive not connected'}</span>
      <button class="btn small" id="btn-home-refresh">🔄 Refresh</button>
    </div>`;

  const cards = local.map(p => {
    const rents = (function () {
      const prev = STATE; STATE = p;
      let n = 0;
      try { n = marketRentTable().filter(r => r.effective > 0).length; } catch (e) { n = 0; }
      STATE = prev;
      return n;
    })();
    const direct = (p.comps || []).filter(c => c.category === 'direct').length;
    return `<div class="prop-card" data-open="${esc(p.id)}">
      <div class="grow">
        <div class="pname">${esc(p.name)}</div>
        <div class="psub">${esc(p.drive.folderName || 'no Drive folder linked')} · edited ${esc(relTime(p.updated))}</div>
        <div class="badges">
          <span class="badge">${(p.comps || []).length}/${MAX_COMPS} comps</span>
          <span class="badge ${direct >= 4 ? 'b-ok' : 'b-warn'}">${direct} direct</span>
          <span class="badge ${rents > 0 ? 'b-direct' : ''}">${rents}/${BUCKETS.length} rents</span>
          ${p.drive.folderId ? '' : '<span class="badge b-warn">unlinked</span>'}
        </div>
      </div>
      <span class="muted">›</span>
    </div>`;
  }).join('');

  const remoteCards = remoteOnly.map(e => `
    <div class="prop-card" data-openremote="${esc(e.id)}">
      <div class="grow">
        <div class="pname">☁ ${esc(e.name)}</div>
        <div class="psub">${esc(e.dealFolderName || '')} · ${esc(e.lastEditor || '')} · ${esc(relTime(e.lastModified))}</div>
        <div class="badges">
          <span class="badge b-cloud">on Drive</span>
          <span class="badge">${e.compCount || 0} comps</span>
          <span class="badge">${e.directCompCount || 0} direct</span>
        </div>
      </div>
      <span class="muted">›</span>
    </div>`).join('');

  host.innerHTML = onboard + statusLine
    + (cards || `<div class="muted small" style="padding:8px 2px">No subjects on this device yet.</div>`)
    + (remoteCards ? `<div class="section-title">On Drive (other devices)</div>` + remoteCards : '')
    + `<button class="fab" id="btn-new-prop">+ New Subject</button>`;
}

async function refreshHomeIndex() {
  if (HOME_INDEX_LOADING || !driveConnected()) return;
  HOME_INDEX_LOADING = true;
  try {
    await fetchManifest(true);
    if ($('#home-content') && !$('#home-content').classList.contains('hidden')) renderHome();
  } finally {
    HOME_INDEX_LOADING = false;
  }
}

// ============================================================================
// Shell: open / close / phase switching
// ============================================================================

function showHome() {
  STATE = null;
  STORE.currentPropertyId = null;
  saveStore();
  stopAutoSync();
  hideSyncBar();
  $('#home-content').classList.remove('hidden');
  $('#phase-content').classList.add('hidden');
  $('#phase-tabs').classList.add('hidden');
  $('#btn-back').classList.add('hidden');
  $('#drawer-property-section').classList.add('hidden');
  $('#header-title').textContent = 'Rent Comps';
  renderHome();
  refreshHomeIndex();
}

function openProperty(id, opts) {
  const p = hydrateProperty(STORE.properties[id]);
  if (!p) { showHome(); return; }
  STATE = p;
  STORE.currentPropertyId = id;
  saveStore();
  OPEN_COMP_ID = null;
  $('#home-content').classList.add('hidden');
  $('#phase-content').classList.remove('hidden');
  $('#phase-tabs').classList.remove('hidden');
  $('#btn-back').classList.remove('hidden');
  $('#drawer-property-section').classList.remove('hidden');
  $('#header-title').textContent = p.name;
  if (!(opts && opts.noHash)) setHash(propertyHash(p));
  CURRENT_PHASE = 1;
  setActiveTab(1);
  renderCurrentPhase();
  updateFolderStatus();
  updateSyncStatus();
  startAutoSync();
  reconcileFromDrive();
  maybeAutoLinkFolder();
}

/** Download a property that exists on Drive but not on this device. */
async function openRemoteProperty(entry) {
  if (!driveConnected()) { toast('Connect Google Drive first'); return; }
  toast('Loading from Drive…');
  try {
    let fileId = entry.trackerFileId;
    if (!fileId && entry.dealFolderId) {
      const comps = await driveEnsureSubfolder(entry.dealFolderId, COMPS_FOLDER);
      const tracker = await driveEnsureSubfolder(comps, TRACKER_FOLDER);
      const hits = await driveList(
        `'${tracker}' in parents and name='${STATE_FILENAME}' and trashed=false`, 'id,name,modifiedTime');
      if (hits.length) fileId = hits[0].id;
    }
    if (!fileId) { toast('Could not find that property on Drive'); return; }
    const remote = JSON.parse(await driveDownloadText(fileId));
    const meta = await driveGetMeta(fileId, 'id,modifiedTime');
    const p = hydrateProperty(remote);
    p.id = entry.id || p.id || uid();
    p.drive.fileId = fileId;
    p.drive.lastPulled = nowISO();
    p.drive.lastPushed = meta.modifiedTime;
    p.drive.remoteModifiedTime = meta.modifiedTime;
    STORE.properties[p.id] = p;
    saveStore();
    openProperty(p.id);
  } catch (e) {
    console.error(e);
    toast('Load failed: ' + (e.message || e));
  }
}

function closeProperty() {
  releaseEditorLock();
  showHome();
  setHash('#/');
}

function setActiveTab(phase) {
  $$('#phase-tabs .tab').forEach(t => {
    t.classList.toggle('active', Number(t.getAttribute('data-phase')) === phase);
  });
}

function renderCurrentPhase() {
  if (!STATE) return;
  if (CURRENT_PHASE === 1) renderPhase1();
  else if (CURRENT_PHASE === 2) renderPhase2();
  else if (CURRENT_PHASE === 3) renderPhase3();
  else renderPhase4();
}

function gotoPhase(phase) {
  CURRENT_PHASE = phase;
  if (phase !== 2) OPEN_COMP_ID = null;
  setActiveTab(phase);
  window.scrollTo({ top: 0 });
  renderCurrentPhase();
}

// ============================================================================
// Tab 1 — Subject
// ============================================================================

function renderPhase1() {
  const host = $('#phase-content');
  const s = STATE.subject;
  host.innerHTML = `
    <div class="card">
      <div class="card-head"><span class="grow">Subject Property</span></div>
      <div class="card-body">${fieldsHtml(SCHEMA.subjectFields || [], s, 'subject')}</div>
    </div>

    <div class="card">
      <div class="card-head"><span class="grow">Subject Unit Mix</span></div>
      <div class="card-body">
        <div class="muted small" style="margin-bottom:7px">
          Drives the subject average SF per section (used by the $/SF market-rent
          method) and the in-place rent each suggested rent is compared against.
        </div>
        <div data-umix-host="subject">${unitMixBlockHtml(STATE.subjectUnitMix, 'subject', 'subject')}</div>
      </div>
    </div>

    <div class="card">
      <div class="card-head"><span class="grow">Drive</span></div>
      <div class="card-body">
        <div class="kv"><span class="k">Deal folder</span><span class="v">${esc(STATE.drive.folderName || '— not linked —')}</span></div>
        <div class="kv"><span class="k">Pipeline</span><span class="v">${esc(STATE.drive.pipelineName || '—')}</span></div>
        <div class="kv"><span class="k">Last saved</span><span class="v">${esc(relTime(STATE.drive.lastPushed))}</span></div>
        <div class="btn-row" style="margin-top:8px">
          <button class="btn small" id="btn-p1-find">🔍 Find Drive Folder</button>
          <button class="btn small" id="btn-p1-url">Link by URL</button>
        </div>
      </div>
    </div>`;

  const f = $('#btn-p1-find');
  if (f) f.onclick = () => promptFindFolder();
  const u = $('#btn-p1-url');
  if (u) u.onclick = () => promptLinkFolderByUrl();
}

// ============================================================================
// Tab 2 — Comps (list, then editor)
// ============================================================================

function renderPhase2() {
  if (OPEN_COMP_ID) { renderCompEditor(OPEN_COMP_ID); return; }
  const host = $('#phase-content');
  const comps = sortedComps();
  const full = STATE.comps.length >= MAX_COMPS;

  const counts = CATEGORIES.map(c => {
    const n = STATE.comps.filter(x => x.category === c.key).length;
    return `<span class="cat-pill ${esc(c.key)}">${esc(c.label)} ${n}</span>`;
  }).join(' ');
  const uncat = STATE.comps.filter(x => !x.category).length;

  const cards = comps.map((c, i) => {
    const st = compStats(c);
    const cap = bucketCapacityIssues(c);
    return `<div class="card comp-card${c.category ? ' cat-' + esc(c.category) : ''}" data-compcard="${esc(c.compId)}">
      <div class="card-head" data-openomp="${esc(c.compId)}">
        <span class="grow">${i + 1}. ${esc(c.name || '(unnamed comp)')}</span>
        <span class="cat-pill ${c.category ? esc(c.category) : 'none'}">${c.category ? esc(categoryMeta(c.category).label) : 'set type'}</span>
      </div>
      <div class="card-body" data-openomp="${esc(c.compId)}" style="cursor:pointer">
        <div class="comp-meta">${esc([streetOnly(c.address), c.city, c.state].filter(Boolean).join(', ') || 'no address')}</div>
        <div class="comp-meta">
          ${c.year_built ? esc(c.year_built) : '—'} ·
          ${c.total_units ? int(c.total_units) + 'u' : '—'} ·
          ${c.distance_miles !== '' ? num(c.distance_miles).toFixed(2) + ' mi' : '— mi'} ·
          ${esc(c.source || 'no source')}
        </div>
        <div class="comp-stat" style="margin-top:4px">
          ${st.planCount} plan${st.planCount === 1 ? '' : 's'}
          ${st.avgRent > 0 ? ' · avg ' + money(st.avgRent) : ''}
          ${st.psf > 0 ? ' · $' + st.psf.toFixed(2) + '/SF' : ''}
          ${st.minRent > 0 ? ' · ' + money(st.minRent) + '–' + money(st.maxRent) : ''}
        </div>
        ${st.buckets.length ? `<div class="tiny muted">sections: ${esc(st.buckets.join(', '))}</div>` : '<div class="tiny" style="color:#b45309">no unit mix yet</div>'}
        ${cap.length ? `<div class="tiny" style="color:#b91c1c">⚠ ${esc(cap.map(x => x.bucket.short + ': ' + x.count + ' plans > ' + x.cap + ' rows').join('; '))}</div>` : ''}
      </div>
    </div>`;
  }).join('');

  host.innerHTML = `
    <div class="card">
      <div class="card-body">
        <div style="display:flex;gap:5px;flex-wrap:wrap">${counts}
          ${uncat ? `<span class="cat-pill none">Untyped ${uncat}</span>` : ''}</div>
        <div class="muted small" style="margin-top:6px">
          ${STATE.comps.length}/${MAX_COMPS} comps. Only <b>Direct</b> comps feed the suggested
          market rents. Order on the COMPS tab is Direct → Aspirational → Inferior, then distance.
        </div>
        <div class="btn-row" style="margin-top:8px">
          <button class="btn small primary" id="btn-add-comp"${full ? ' disabled' : ''}>+ Add Comp</button>
          <button class="btn small" id="btn-hd-comparables">☁ Pull from HelloData</button>
        </div>
        ${full ? '<div class="tiny muted" style="margin-top:5px">The COMPS tab holds 8 comps — delete one to add another.</div>' : ''}
      </div>
    </div>
    ${cards || '<div class="muted small" style="padding:8px 2px">No comps yet. Add one, or pull candidates from HelloData.</div>'}`;

  const add = $('#btn-add-comp');
  if (add) add.onclick = () => {
    if (STATE.comps.length >= MAX_COMPS) { toast('Max ' + MAX_COMPS + ' comps'); return; }
    const c = newComp();
    STATE.comps.push(c);
    saveState();
    OPEN_COMP_ID = c.compId;
    renderPhase2();
  };
  const hd = $('#btn-hd-comparables');
  if (hd) hd.onclick = () => hdPullComparables();

  $$('[data-openomp]', host).forEach(n => {
    n.addEventListener('click', (ev) => {
      if (ev.target.closest('button, input, select')) return;
      OPEN_COMP_ID = n.getAttribute('data-openomp');
      window.scrollTo({ top: 0 });
      renderPhase2();
    });
  });
}

function renderCompEditor(compId) {
  const c = getComp(compId);
  if (!c) { OPEN_COMP_ID = null; renderPhase2(); return; }
  const host = $('#phase-content');
  const st = compStats(c);
  const path = 'comp:' + c.compId;

  host.innerHTML = `
    <div class="btn-row" style="margin-bottom:8px">
      <button class="btn small" id="btn-comp-back">← All comps</button>
      <button class="btn small" id="btn-comp-hd">☁ Fill from HelloData</button>
      <button class="btn small danger" id="btn-comp-del">Delete comp</button>
    </div>

    <div class="card comp-card${c.category ? ' cat-' + esc(c.category) : ''}" id="comp-editor">
      <div class="card-head"><span class="grow" id="comp-editor-title">${esc(c.name || 'Untitled comp')}</span></div>
      <div class="card-body">
        ${fieldsHtml(SCHEMA.compFields || [], c, path)}
        <div class="field-row">
          ${fieldHtml({ key: 'visited_at', label: 'Visited / Called On', type: 'date', row: 'v' }, c, path)}
          ${fieldHtml({ key: 'visited_by', label: 'By', type: 'text', row: 'v' }, c, path)}
        </div>
      </div>
    </div>

    <div class="card">
      <div class="card-head" title="One row per floor plan. Beds/Baths decide which COMPS section the plan lands in. Leave Ask $/Mo blank if you could not get it — blanks are skipped, not counted as $0.">
        <span class="grow">Unit Mix &amp; Asking Rents</span>
        ${st.planCount ? `<span class="head-stat">${st.avgRent > 0 ? 'avg ' + money(st.avgRent) : ''}${st.psf > 0 ? ' · $' + st.psf.toFixed(2) + '/SF' : ''}${st.minRent > 0 ? ' · ' + money(st.minRent) + '–' + money(st.maxRent) : ''}</span>` : ''}
      </div>
      <div class="card-body">
        <div class="card-hint">
          One row per floor plan. Beds/Baths decide which COMPS section the plan
          lands in. Leave <b>Ask $/Mo</b> blank if you could not get it — blanks
          are skipped, not counted as $0.
        </div>
        <div data-umix-host="${esc(path)}">${unitMixBlockHtml(c.unitMix, 'comp', path)}</div>
      </div>
    </div>

    <div class="card-pair">
      <div class="card">
        <div class="card-head" title="Leave “—” when you don't know. A blank cell is an honest gap; “N” claims the comp positively lacks it.">
          <span class="grow">Physical Attributes</span>
        </div>
        <div class="card-body">
          <div class="card-hint">Leave “—” when you don't know.
            A blank cell is an honest gap; “N” claims the comp positively lacks it.</div>
          ${triHtml(PHYSICAL, c.physical, path + '.physical')}
        </div>
      </div>

      <div class="card">
        <div class="card-head"><span class="grow">Amenities</span></div>
        <div class="card-body">${triHtml(AMENITIES, c.amenities, path + '.amenities')}</div>
      </div>
    </div>

    <div class="card${COLLAPSED.has('fees:' + c.compId) ? '' : ' collapsed'}" data-cardkey="fees:${esc(c.compId)}">
      <div class="card-head" data-cardtoggle="fees:${esc(c.compId)}" data-cardinvert="1"
           title="Required monthly fees are charged to ALL tenants and go into the COMPS FEES $/Mo column, feeding the template's Eff. $/Mo formulas. Leave blank when unknown — never guess. The tracker-only fees below are one-time or optional and are not written to the COMPS tab.">
        <span class="chev">${COLLAPSED.has('fees:' + c.compId) ? '▼' : '▶'}</span>
        <span class="grow">Fees &amp; Other Income</span>
      </div>
      <div class="card-body">
        <div class="sub-label" title="Charged to ALL tenants. Written to the COMPS FEES $/Mo column and fed into the template's Eff. $/Mo formulas. Leave blank when unknown — never guess.">Required monthly → COMPS FEES column</div>
        ${fieldsHtml((SCHEMA.fees || []).filter(f => f.compsRow), c.fees, path + '.fees')}
        <div class="sub-label" title="One-time or optional charges. Not written to the COMPS tab, but they travel in the export JSON.">Tracker-only (one-time / optional)</div>
        ${fieldsHtml((SCHEMA.fees || []).filter(f => !f.compsRow), c.fees, path + '.fees')}
      </div>
    </div>`;

  $('#btn-comp-back').onclick = () => { OPEN_COMP_ID = null; renderPhase2(); };
  $('#btn-comp-del').onclick = () => {
    if (!confirm('Delete "' + (c.name || 'this comp') + '"? This cannot be undone.')) return;
    STATE.comps = STATE.comps.filter(x => x.compId !== c.compId);
    saveState();
    OPEN_COMP_ID = null;
    renderPhase2();
  };
  $('#btn-comp-hd').onclick = () => hdFillComp(c.compId);

  /* `data-cardinvert` flips the key's meaning from "collapsed" to "opened", the
     same convention the unit-mix rows use. Cards that start closed need it, or
     the absent key would read as "expanded" on every re-render. */
  $$('[data-cardtoggle]', host).forEach(n => n.addEventListener('click', () => {
    const key = n.getAttribute('data-cardtoggle');
    const invert = n.getAttribute('data-cardinvert') === '1';
    const card = n.closest('.card');
    const nowCollapsed = !card.classList.contains('collapsed');
    card.classList.toggle('collapsed', nowCollapsed);
    const remember = invert ? !nowCollapsed : nowCollapsed;
    if (remember) COLLAPSED.add(key); else COLLAPSED.delete(key);
    const ch = $('.chev', n);
    if (ch) ch.textContent = nowCollapsed ? '▶' : '▼';
  }));
}

// ============================================================================
// Tab 3 — Market Rents
// ============================================================================

function renderPhase3() {
  const host = $('#phase-content');
  const rows = marketRentTable();
  const nDirect = directComps().length;

  const body = rows.map(r => {
    const has = r.suggested > 0 || r.override !== '';
    return `<tr class="${has ? '' : 'empty'}">
      <td>${esc(r.bucket.short)}<div class="tiny muted">${esc(r.bucket.compsLabel)}</div></td>
      <td>${r.subjectUnits ? int(r.subjectUnits) : '—'}</td>
      <td>${r.subjectAvgSf > 0 ? int(r.subjectAvgSf) : '—'}</td>
      <td>${r.subjectAvgRent > 0 ? money(r.subjectAvgRent) : '—'}</td>
      <td>${r.weighted > 0 ? money(r.weighted) : '—'}</td>
      <td>${r.psf > 0 ? '$' + r.psf.toFixed(2) : '—'}</td>
      <td>${r.psfApplied > 0 ? money(r.psfApplied) : '—'}</td>
      <td>${r.suggested > 0 ? money(r.suggested) : '—'}<div class="tiny muted">${esc(r.method)}${r.sampleRows ? ' · ' + r.sampleRows + 'r/' + r.sampleComps + 'c' : ''}</div></td>
      <td><input type="number" inputmode="decimal" step="any" data-mroverride="${esc(r.bucket.key)}"
            value="${esc(r.override)}" placeholder="—" /></td>
      <td class="mkt-final">${r.effective > 0 ? money(r.effective) : '—'}</td>
      <td class="${r.delta > 0 ? 'mkt-delta-up' : (r.delta < 0 ? 'mkt-delta-down' : '')}">
        ${r.delta !== 0 ? (r.delta > 0 ? '+' : '') + money(r.delta) : '—'}
        ${r.delta !== 0 && r.deltaPct ? `<div class="tiny">${(r.deltaPct * 100).toFixed(1)}%</div>` : ''}
      </td>
    </tr>`;
  }).join('');

  const priced = rows.filter(r => r.effective > 0).length;

  host.innerHTML = `
    <div class="card">
      <div class="card-body">
        ${nDirect === 0
          ? `<div class="chk err"><span class="ico">✖</span><span>No comps are marked <b>Direct</b>.
              Suggested rents come from Direct comps only — go to tab 2 and set at least one.</span></div>`
          : `<div class="chk ${nDirect >= 4 ? 'ok' : 'warn'}"><span class="ico">${nDirect >= 4 ? '✔' : '!'}</span>
              <span>${nDirect} Direct comp${nDirect === 1 ? '' : 's'} feeding these rents${nDirect < 4 ? ' — the playbook wants at least 4.' : '.'}</span></div>`}
        <div class="muted small">
          <b>Wtd Ask</b> = unit-count-weighted mean asking rent of Direct-comp plans in that
          section. <b>$/SF</b> = the same, per square foot; <b>× Subj SF</b> applies it to the
          subject's average SF. <b>Suggested</b> takes Wtd Ask when available, else × Subj SF,
          rounded to the nearest $5. Type in <b>Override</b> to win outright.
        </div>
      </div>
    </div>

    <div class="card">
      <div class="card-head"><span class="grow">Market Rents by COMPS Section</span></div>
      <div class="card-body">
        <div class="mkt-scroll">
          <table class="mkt-table">
            <thead><tr>
              <th>Section</th><th>Subj u</th><th>Subj SF</th><th>Subj Rent</th>
              <th>Wtd Ask</th><th>$/SF</th><th>× Subj SF</th><th>Suggested</th>
              <th>Override</th><th>Final</th><th>Δ vs in-place</th>
            </tr></thead>
            <tbody>${body}</tbody>
          </table>
        </div>
        <div class="muted small" style="margin-top:8px">
          ${priced}/${BUCKETS.length} sections priced. <b>Final</b> is what gets written to
          COMPS column G for every subject row in that section with a unit count &gt; 0.
        </div>
        <div class="btn-row" style="margin-top:8px">
          <button class="btn small" id="btn-mr-clear">Clear all overrides</button>
          <button class="btn small" id="btn-mr-accept">Freeze suggested as overrides</button>
        </div>
      </div>
    </div>`;

  $$('[data-mroverride]', host).forEach(inp => {
    inp.addEventListener('input', () => {
      const k = inp.getAttribute('data-mroverride');
      STATE.marketRents[k] = STATE.marketRents[k] || {};
      STATE.marketRents[k].override = inp.value;
      saveState();
      refreshMarketRentRow(inp);
    });
  });

  $('#btn-mr-clear').onclick = () => {
    BUCKETS.forEach(b => { if (STATE.marketRents[b.key]) STATE.marketRents[b.key].override = ''; });
    saveState();
    renderPhase3();
    toast('Overrides cleared');
  };
  $('#btn-mr-accept').onclick = () => {
    let n = 0;
    marketRentTable().forEach(r => {
      if (r.suggested > 0) {
        STATE.marketRents[r.bucket.key] = STATE.marketRents[r.bucket.key] || {};
        STATE.marketRents[r.bucket.key].override = String(r.suggested);
        n++;
      }
    });
    saveState();
    renderPhase3();
    toast(n + ' section' + (n === 1 ? '' : 's') + ' frozen');
  };
}

/** Update the Final and Δ cells for the row being typed in, without re-render. */
function refreshMarketRentRow(inp) {
  const key = inp.getAttribute('data-mroverride');
  const tr = inp.closest('tr');
  if (!tr) return;
  const r = marketRentTable().find(x => x.bucket.key === key);
  if (!r) return;
  const tds = $$('td', tr);
  const finalTd = tds[tds.length - 2];
  const deltaTd = tds[tds.length - 1];
  finalTd.textContent = r.effective > 0 ? money(r.effective) : '—';
  deltaTd.className = r.delta > 0 ? 'mkt-delta-up' : (r.delta < 0 ? 'mkt-delta-down' : '');
  deltaTd.innerHTML = (r.delta !== 0 ? (r.delta > 0 ? '+' : '') + money(r.delta) : '—')
    + (r.delta !== 0 && r.deltaPct ? `<div class="tiny">${(r.deltaPct * 100).toFixed(1)}%</div>` : '');
}
