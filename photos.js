/* ============================================================================
   Rent Comps Tracker — photos.js
   Drag-and-drop comp photography, stored in the DEAL FOLDER on Drive.

   WHAT IT ADDS
   A Photos card at the bottom of the expanded comp editor (tab 2), holding:
     * the four standard slots — Kitchen, Bathroom, Exterior, Amenities
     * one gallery per FLOOR PLAN, each taking many photos

   WHERE THE FILES GO — and why there is no second copy
       <deal>/3. Comps/<Comp Name>/kitchen.jpg      <- the four standard slots
       <deal>/3. Comps/<Comp Name>/bathroom.jpg
       <deal>/3. Comps/<Comp Name>/exterior.jpg
       <deal>/3. Comps/<Comp Name>/amenity.jpg      <- SINGULAR on disk, see below
       <deal>/3. Comps/<Comp Name>/<Plan Label>/*   <- one subfolder per plan

   Drive is the single source of truth. Nothing is cached in the record as image
   data and nothing is uploaded twice: a drop writes straight to the deal folder,
   then the card re-reads that folder and renders what is actually there. So a
   photo dropped by an analyst in the field and a photo dragged into the folder
   by someone on a laptop are the same photo, and the app cannot drift from it.

   ⚠️ THE FOUR SLOT FILENAMES ARE A CONTRACT, NOT A PREFERENCE
   screener.js already READS this layout (resolvePhotos -> pickSlot), and the
   Rent Comp Photo Populator reads it to place images on the COMPS tab. The
   amenities slot is written `amenity.jpg` — SINGULAR — because that is what the
   canonical named-subfolder layout on disk already uses. screener.js carries
   SLOT_ALIASES = { amenities: ['amenities','amenity'] } for exactly this reason.
   Write `amenities.jpg` here and the Screener still finds it, but the photo
   populator and every existing deal folder disagree with you. Do not "tidy" it.

   ⚠️ ONE FILE PER SLOT, ACROSS EXTENSIONS
   Dropping a .png over an existing kitchen.jpg must not leave both — the
   populator would then have two candidates for one cell and pick by list order.
   phWriteSlot() trashes every other file matching the slot's aliases after the
   new one lands, and it does so AFTER, so a failed upload never destroys the
   photo that was already there.

   ⚠️ PLAN FOLDERS ARE MIME-INVISIBLE TO THE SLOT READ, BY LUCK AND ON PURPOSE
   The slot read lists `mimeType contains 'image/'`, so per-plan subfolders can
   never be mistaken for a slot photo. The one collision that IS possible is a
   floor plan literally named "kitchen": phPlanFolderName() detects a plan label
   that collides with a slot alias and suffixes it, or a plan gallery would shadow
   a standard slot in every folder listing a human reads.

   THE EXCEL HANDOFF
   `⬇ Photo Index → Drive` writes a small standalone workbook with each photo
   embedded, its Drive link, and the COMPS row the photo populator targets
   (Kitchen/Bathroom row 89, Exterior/Amenities row 99). It is deliberately its
   OWN workbook: export.js never opens the deal's proforma, and this file does not
   change that. Folding these rows into the main reconciliation workbook is a
   follow-up that requires an export.js edit.
   ========================================================================= */

'use strict';

/* Display order is the order egordon asked for. `file` is what lands on disk;
   `aliases` is what counts as already-present when reading back. `compsRow` is
   informational — it is what the photo populator uses, not something we write. */
const PH_SLOTS = [
  { key: 'kitchen',   label: 'Kitchen',   file: 'kitchen',  aliases: ['kitchen'],                compsRow: 89 },
  { key: 'bathroom',  label: 'Bathroom',  file: 'bathroom', aliases: ['bathroom', 'bath'],       compsRow: 89 },
  { key: 'exterior',  label: 'Exterior',  file: 'exterior', aliases: ['exterior', 'ext'],        compsRow: 99 },
  { key: 'amenities', label: 'Amenities', file: 'amenity',  aliases: ['amenity', 'amenities'],   compsRow: 99 },
];

const PH_MAX_BYTES = 25 * 1024 * 1024;
const PH_OK_MIME = /^image\/(jpeg|jpg|png|gif|webp|heic|heif)$/i;

const PH = {
  compId: null,       // which comp the current read belongs to
  state: 'idle',      // idle | loading | ok | nodrive | nofolder | noname | error
  err: '',
  folderId: '',
  slots: {},          // slotKey -> {id, name, mimeType}
  plans: [],          // [{key, label, folderName, folderId, photos:[file]}]
  urls: new Map(),    // fileId -> objectURL, so a re-render reuses the download
  busy: new Set(),    // target keys currently uploading
};

// ------------------------------------------------------------------- helpers

/* Same rule screener.js uses, so a comp resolves to the SAME folder name in both
   files. Drive tolerates most characters; Windows sync clients do not, and these
   folders are browsed on desktops. */
function phSanitize(name) {
  return String(name || '').replace(/[\\/:*?"<>|]/g, '-').replace(/[.\s]+$/, '').trim();
}

function phExt(file) {
  const m = /\.([a-z0-9]+)$/i.exec(file && file.name || '');
  if (m) return m[1].toLowerCase();
  const mm = /^image\/([a-z0-9]+)$/i.exec(file && file.type || '');
  return mm ? mm[1].toLowerCase().replace('jpeg', 'jpg') : 'jpg';
}

function phBase(name) {
  return String(name || '').toLowerCase().replace(/\.[a-z0-9]+$/, '');
}

/* A slot matches on its own name or on the legacy `comp_3_kitchen` tail, the same
   two shapes pickSlot() accepts, so a folder written by the older flat layout
   still reads correctly here. */
function phMatchesSlot(fileName, slot) {
  const b = phBase(fileName);
  return slot.aliases.some(a => b === a || b.endsWith('_' + a));
}

function phQ(s) { return encodeURIComponent(s); }
function phLit(s) { return String(s == null ? '' : s).replace(/\\/g, '\\\\').replace(/'/g, "\\'"); }

/** A stable, human-readable folder name for one floor-plan row. */
function phPlanFolderName(row, idx) {
  const plan = String(row && row.plan || '').trim();
  let base = plan;
  if (!base) {
    const beds = row && row.beds !== '' && row.beds != null ? num(row.beds) : null;
    const baths = row && row.baths !== '' && row.baths != null ? num(row.baths) : null;
    if (beds != null && baths != null) base = beds + 'x' + baths;
    if (base && num(row.sqft) > 0) base += ' ' + Math.round(num(row.sqft)) + 'sf';
  }
  if (!base) base = 'Plan ' + (idx + 1);
  base = phSanitize(base) || ('Plan ' + (idx + 1));
  /* A plan called "Kitchen" would sit beside kitchen.jpg and read as a slot to
     any human scanning the folder. Disambiguate rather than allow it. */
  const collides = PH_SLOTS.some(s => s.aliases.includes(base.toLowerCase()));
  return collides ? base + ' (plan)' : base;
}

function phPlansOf(comp) {
  return (comp && comp.unitMix || []).map((row, i) => ({
    key: row.id || ('idx' + i),
    label: String(row.plan || '').trim()
      || ((row.beds !== '' && row.beds != null) ? num(row.beds) + 'x' + num(row.baths) : 'Plan ' + (i + 1)),
    folderName: phPlanFolderName(row, i),
    row: row,
  }));
}

// --------------------------------------------------------------- drive access

async function phFindChildFolder(parentId, name) {
  const rows = await driveList(
    `'${phLit(parentId)}' in parents and name='${phLit(name)}'`
    + ` and mimeType='application/vnd.google-apps.folder' and trashed=false`, 'id,name');
  return rows[0] || null;
}

async function phListImages(folderId) {
  return driveList(
    `'${phLit(folderId)}' in parents and trashed=false and mimeType contains 'image/'`,
    'id,name,mimeType,modifiedTime,size');
}

/* Trash rather than delete. These are analyst photographs in a live deal folder;
   an accidental replace has to be recoverable from Drive's own bin. */
async function phTrash(fileId) {
  return driveFetch('/drive/v3/files/' + phQ(fileId) + '?supportsAllDrives=true', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ trashed: true }),
  });
}

async function phObjectUrl(file) {
  if (PH.urls.has(file.id)) return PH.urls.get(file.id);
  const buf = await driveDownloadBuffer(file.id);
  const url = URL.createObjectURL(new Blob([buf], { type: file.mimeType || 'image/jpeg' }));
  PH.urls.set(file.id, url);
  return url;
}

/**
 * Resolve this comp's own folder under `3. Comps`.
 * `create` is false on every READ path: browsing a comp that has no photos yet
 * must not litter the deal folder with empty directories, exactly the reason
 * driveFindSubfolder exists alongside driveEnsureSubfolder.
 */
async function phCompFolder(comp, create) {
  if (!STATE || !STATE.drive || !STATE.drive.folderId) return '';
  const name = phSanitize(comp && comp.name);
  if (!name) return '';
  let compsId = STATE.drive.compsFolderId;
  if (!compsId) {
    compsId = create
      ? await driveEnsureSubfolder(STATE.drive.folderId, COMPS_FOLDER)
      : await driveFindSubfolder(STATE.drive.folderId, COMPS_FOLDER);
    /* Cache in memory only, exactly as ensureTrackerFolder() does — the next
       genuine save persists it.
       ⚠️ Do NOT saveState() here. Merely OPENING a comp to look at its photos
       would then stamp STATE.updated and queue an auto-push, which makes a
       read-only visit look like an edit to the co-editor conflict check. */
    if (compsId) STATE.drive.compsFolderId = compsId;
  }
  if (!compsId) return '';
  return create
    ? await driveEnsureSubfolder(compsId, name)
    : await driveFindSubfolder(compsId, name);
}

// ------------------------------------------------------------------ the read

async function phLoad(comp) {
  PH.compId = comp.compId;
  PH.slots = {};
  PH.plans = [];
  PH.folderId = '';
  PH.err = '';

  if (!driveConnected()) { PH.state = 'nodrive'; return; }
  if (!STATE.drive || !STATE.drive.folderId) { PH.state = 'nofolder'; return; }
  if (!phSanitize(comp.name)) { PH.state = 'noname'; return; }

  PH.state = 'loading';
  try {
    const folderId = await phCompFolder(comp, false);
    const plans = phPlansOf(comp);
    if (!folderId) {
      /* No folder yet is a normal empty state, not an error — the first drop
         creates it. Still list the plans so their drop zones render. */
      PH.plans = plans.map(p => Object.assign({}, p, { folderId: '', photos: [] }));
      PH.state = 'ok';
      return;
    }
    PH.folderId = folderId;

    const images = await phListImages(folderId);
    PH_SLOTS.forEach(s => {
      const hit = images.find(f => phMatchesSlot(f.name, s));
      if (hit) PH.slots[s.key] = hit;
    });

    /* One listing of the comp folder's subfolders, then match plans to it by
       name. Cheaper than a find-per-plan, and it also surfaces the case where a
       plan was renamed in the tracker after its photos were filed. */
    const subs = await driveList(
      `'${phLit(folderId)}' in parents and mimeType='application/vnd.google-apps.folder' and trashed=false`,
      'id,name');
    const byName = new Map(subs.map(f => [String(f.name).toLowerCase(), f]));

    PH.plans = [];
    for (const p of plans) {
      const hit = byName.get(p.folderName.toLowerCase());
      const photos = hit ? await phListImages(hit.id) : [];
      byName.delete(p.folderName.toLowerCase());
      PH.plans.push(Object.assign({}, p, { folderId: hit ? hit.id : '', photos: photos }));
    }
    /* Folders left over are plan galleries whose tracker row is gone or renamed.
       Show them rather than hiding them — the photos are real and someone took
       them; silently orphaning them is how a deal folder rots. */
    for (const [, f] of byName) {
      const photos = await phListImages(f.id);
      if (!photos.length) continue;
      PH.plans.push({
        key: 'orphan:' + f.id, label: f.name, folderName: f.name,
        folderId: f.id, photos: photos, orphan: true,
      });
    }

    PH.state = 'ok';
  } catch (e) {
    PH.state = 'error';
    PH.err = (e && e.message) || String(e);
  }
}

// ----------------------------------------------------------------- the writes

function phValidate(file) {
  if (!file) return 'No file';
  if (!PH_OK_MIME.test(file.type || '')) {
    return (file.name || 'That file') + ' is not an image';
  }
  if (file.size > PH_MAX_BYTES) {
    return (file.name || 'That file') + ' is over '
      + Math.round(PH_MAX_BYTES / 1024 / 1024) + ' MB';
  }
  return '';
}

/**
 * Write one of the four standard slots.
 * Order matters: upload FIRST, trash the superseded copies AFTER. A failed
 * upload then leaves the existing photo untouched rather than deleting it and
 * failing to replace it.
 */
async function phWriteSlot(comp, slot, file) {
  const folderId = await phCompFolder(comp, true);
  if (!folderId) throw new Error('Could not resolve the comp folder on Drive');
  const name = slot.file + '.' + phExt(file);
  const before = await phListImages(folderId);
  const sameName = before.find(f => String(f.name).toLowerCase() === name.toLowerCase());

  const buf = await file.arrayBuffer();
  const res = await driveUpload(folderId, name, file.type || 'image/jpeg',
    new Blob([buf], { type: file.type || 'image/jpeg' }), sameName ? sameName.id : '');

  const keepId = (res && res.id) || (sameName && sameName.id) || '';
  for (const f of before) {
    if (f.id === keepId) continue;
    if (!phMatchesSlot(f.name, slot)) continue;
    try { await phTrash(f.id); PH.urls.delete(f.id); } catch (e) { /* leave it */ }
  }
  if (keepId) PH.urls.delete(keepId);
  return res;
}

/** Write one photo into a floor plan's own subfolder. Many per plan is the point. */
async function phWritePlanPhoto(comp, plan, file) {
  const folderId = await phCompFolder(comp, true);
  if (!folderId) throw new Error('Could not resolve the comp folder on Drive');
  const planFolderId = await driveEnsureSubfolder(folderId, plan.folderName);
  const existing = await phListImages(planFolderId);
  const name = phSanitize(file.name) || ('photo.' + phExt(file));
  const same = existing.find(f => String(f.name).toLowerCase() === name.toLowerCase());
  const buf = await file.arrayBuffer();
  const res = await driveUpload(planFolderId, name, file.type || 'image/jpeg',
    new Blob([buf], { type: file.type || 'image/jpeg' }), same ? same.id : '');
  if (same) PH.urls.delete(same.id);
  return res;
}

/**
 * Accept a drop or a file-picker selection.
 * `target` is {kind:'slot', slotKey} or {kind:'plan', planKey}. A slot takes
 * exactly one photo (it is one cell on the COMPS tab); a plan takes all of them.
 */
async function phAccept(target, fileList) {
  const comp = getComp(PH.compId);
  if (!comp) return;
  const files = Array.from(fileList || []).filter(Boolean);
  if (!files.length) return;

  if (!driveConnected()) {
    toast('Connect Google Drive first — photos are stored in the deal folder');
    return;
  }
  if (!STATE.drive || !STATE.drive.folderId) {
    toast('Link this subject to its deal folder first (☰ → Find Drive Folder)');
    return;
  }
  if (!phSanitize(comp.name)) {
    toast('Give this comp a name first — the folder is named after it');
    return;
  }

  const tkey = target.kind + ':' + (target.slotKey || target.planKey);
  if (PH.busy.has(tkey)) return;

  const bad = files.map(phValidate).filter(Boolean);
  const good = files.filter(f => !phValidate(f));
  if (bad.length) toast(bad[0]);
  if (!good.length) return;

  PH.busy.add(tkey);
  phPaint();
  try {
    if (target.kind === 'slot') {
      const slot = PH_SLOTS.find(s => s.key === target.slotKey);
      if (good.length > 1) toast(slot.label + ' holds one photo — using ' + good[0].name);
      await phWriteSlot(comp, slot, good[0]);
      toast(slot.label + ' photo saved to Drive');
    } else {
      const plan = PH.plans.find(p => p.key === target.planKey);
      if (!plan) return;
      let n = 0;
      for (const f of good) { await phWritePlanPhoto(comp, plan, f); n++; }
      toast(n + (n === 1 ? ' photo' : ' photos') + ' saved to ' + plan.folderName);
    }
    await phLoad(comp);
  } catch (e) {
    toast('Upload failed: ' + ((e && e.message) || e));
    PH.state = 'error';
    PH.err = (e && e.message) || String(e);
  } finally {
    PH.busy.delete(tkey);
    phPaint();
  }
}

async function phDelete(fileId) {
  const comp = getComp(PH.compId);
  if (!comp || !fileId) return;
  if (!confirm('Move this photo to the Drive bin?')) return;
  try {
    await phTrash(fileId);
    PH.urls.delete(fileId);
    toast('Photo moved to the Drive bin');
    await phLoad(comp);
  } catch (e) {
    toast('Could not remove it: ' + ((e && e.message) || e));
  }
  phPaint();
}

// ------------------------------------------------------------------ rendering

function phZoneAttrs(target) {
  return `data-ph-kind="${esc(target.kind)}"`
    + ` data-ph-target="${esc(target.slotKey || target.planKey)}"`;
}

function phSlotTileHtml(slot) {
  const f = PH.slots[slot.key];
  const busy = PH.busy.has('slot:' + slot.key);
  const url = f ? PH.urls.get(f.id) : null;
  const target = { kind: 'slot', slotKey: slot.key };

  const inner = busy
    ? `<div class="ph-ph">uploading…</div>`
    : f
      ? (url
        ? `<img src="${esc(url)}" alt="${esc(slot.label)}" loading="lazy" />`
        : `<div class="ph-ph">loading…</div>`)
      : `<div class="ph-ph"><span class="ph-plus">＋</span><span>drop or tap</span></div>`;

  return `<div class="ph-tile${f ? ' has' : ''}${busy ? ' busy' : ''}" ${phZoneAttrs(target)}>
    <div class="ph-shot">${inner}</div>
    <div class="ph-cap">
      <span class="ph-name">${esc(slot.label)}</span>
      ${f ? `<button class="ph-x" data-ph-del="${esc(f.id)}" title="Move to Drive bin">✕</button>` : ''}
    </div>
    <input type="file" class="ph-input" accept="image/*" ${phZoneAttrs(target)} hidden />
  </div>`;
}

function phPlanBlockHtml(plan) {
  const busy = PH.busy.has('plan:' + plan.key);
  const target = { kind: 'plan', planKey: plan.key };
  const shots = plan.photos.map(f => {
    const url = PH.urls.get(f.id);
    return `<div class="ph-tile has small">
      <div class="ph-shot">${url
        ? `<img src="${esc(url)}" alt="${esc(f.name)}" loading="lazy" />`
        : `<div class="ph-ph">loading…</div>`}</div>
      <div class="ph-cap">
        <span class="ph-name" title="${esc(f.name)}">${esc(f.name)}</span>
        <button class="ph-x" data-ph-del="${esc(f.id)}" title="Move to Drive bin">✕</button>
      </div>
    </div>`;
  }).join('');

  return `<div class="ph-plan">
    <div class="ph-plan-head">
      <span class="ph-plan-name">${esc(plan.label)}</span>
      ${plan.orphan
        ? `<span class="ph-warn" title="These photos are in the comp folder but no floor plan in the Unit Mix matches this folder name. Rename the plan back, or move the photos.">no matching plan</span>`
        : ''}
      <span class="ph-count">${plan.photos.length || 0}</span>
      <span class="ph-path" title="Drive subfolder">${esc(plan.folderName)}/</span>
    </div>
    <div class="ph-plan-body">
      ${shots}
      <div class="ph-tile drop${busy ? ' busy' : ''}" ${phZoneAttrs(target)}>
        <div class="ph-shot"><div class="ph-ph">${busy
          ? 'uploading…'
          : `<span class="ph-plus">＋</span><span>drop or tap</span>`}</div></div>
        <div class="ph-cap"><span class="ph-name">Add photos</span></div>
        <input type="file" class="ph-input" accept="image/*" multiple ${phZoneAttrs(target)} hidden />
      </div>
    </div>
  </div>`;
}

function phBodyHtml(comp) {
  if (PH.state === 'nodrive') {
    return `<div class="ph-empty">Connect Google Drive to add photos —
      they are stored in the deal folder, not in this browser.</div>`;
  }
  if (PH.state === 'nofolder') {
    return `<div class="ph-empty">This subject has no deal folder linked yet.
      Use <b>☰ → Find Drive Folder</b>, then reopen this comp.</div>`;
  }
  if (PH.state === 'noname') {
    return `<div class="ph-empty">Name this comp first — its photo folder is
      named after it (<code>3. Comps/&lt;Comp Name&gt;/</code>).</div>`;
  }
  if (PH.state === 'loading') return `<div class="ph-empty">Reading the deal folder…</div>`;
  if (PH.state === 'error') {
    return `<div class="ph-empty err">Could not read the photo folder: ${esc(PH.err)}</div>`;
  }

  const have = PH_SLOTS.filter(s => PH.slots[s.key]).length;
  const planShots = PH.plans.reduce((n, p) => n + p.photos.length, 0);

  return `<div class="ph-sub">
      <span class="ph-sub-t">Standard</span>
      <span class="ph-sub-n">${have}/4</span>
      <span class="ph-sub-h">One photo each. These are the four the COMPS tab holds
        (Kitchen/Bathroom row 89, Exterior/Amenities row 99).</span>
    </div>
    <div class="ph-strip">${PH_SLOTS.map(phSlotTileHtml).join('')}</div>

    <div class="ph-sub">
      <span class="ph-sub-t">By floor plan</span>
      <span class="ph-sub-n">${planShots || 0}</span>
      <span class="ph-sub-h">Many per plan. Each plan gets its own subfolder inside
        <code>3. Comps/${esc(phSanitize(comp.name) || '<Comp Name>')}/</code>.</span>
    </div>
    ${PH.plans.length
      ? PH.plans.map(phPlanBlockHtml).join('')
      : `<div class="ph-empty">Add floor plans in <b>Unit Mix &amp; Asking Rents</b> above
          and each one gets its own photo gallery here.</div>`}`;
}

function phCardHtml(comp) {
  const total = PH_SLOTS.filter(s => PH.slots[s.key]).length
    + PH.plans.reduce((n, p) => n + p.photos.length, 0);
  return `<div class="card" id="ph-card">
    <div class="card-head" title="Photos live in the deal's own Drive folder — 3. Comps/<Comp Name>/ — so the app, the proforma's photo populator and anyone browsing Drive all see the same files.">
      <span class="grow">Photos</span>
      ${total ? `<span class="head-stat">${total} on Drive</span>` : ''}
      ${PH.state === 'ok' && total
        ? `<button class="btn small" id="ph-xlsx">⬇ Photo Index → Drive</button>` : ''}
    </div>
    <div class="card-body">
      <div class="card-hint">Drag photos in, or tap a tile to pick from the camera roll.
        Everything is saved straight to the deal folder on Drive — that folder is the
        source of truth, and this card shows what is in it.</div>
      <div id="ph-body">${phBodyHtml(comp)}</div>
    </div>
  </div>`;
}

/** Repaint just the card's body, so an upload does not lose the page's scroll. */
function phPaint() {
  const comp = getComp(PH.compId);
  const card = document.getElementById('ph-card');
  if (!comp || !card) return;
  const body = document.getElementById('ph-body');
  if (body) body.innerHTML = phBodyHtml(comp);
  const head = card.querySelector('.head-stat');
  const total = PH_SLOTS.filter(s => PH.slots[s.key]).length
    + PH.plans.reduce((n, p) => n + p.photos.length, 0);
  if (head) head.textContent = total + ' on Drive';
  phWireZones(card);
}

/* Thumbnails are fetched after the tiles exist, then patched in place. Painting
   first and downloading second is what keeps a comp with 20 plan photos from
   showing a blank card for several seconds. */
async function phLoadThumbs() {
  const comp = getComp(PH.compId);
  if (!comp) return;
  const files = [];
  PH_SLOTS.forEach(s => { if (PH.slots[s.key]) files.push(PH.slots[s.key]); });
  PH.plans.forEach(p => p.photos.forEach(f => files.push(f)));
  for (const f of files) {
    if (PH.urls.has(f.id)) continue;
    if (PH.compId !== comp.compId) return;         // user moved on
    try { await phObjectUrl(f); } catch (e) { continue; }
    if (document.getElementById('ph-card')) phPaint();
  }
}

// -------------------------------------------------------------------- wiring

function phTargetOf(el) {
  const kind = el.getAttribute('data-ph-kind');
  if (!kind) return null;
  const v = el.getAttribute('data-ph-target');
  return kind === 'slot' ? { kind: 'slot', slotKey: v } : { kind: 'plan', planKey: v };
}

/* Bound per repaint on the tiles themselves rather than delegated from document,
   because dragover/dragleave need to toggle a class on the specific tile and a
   delegated handler would have to re-derive it on every mousemove-rate event. */
function phWireZones(root) {
  Array.from(root.querySelectorAll('[data-ph-kind]')).forEach(el => {
    if (el.tagName === 'INPUT') {
      el.onchange = () => {
        const t = phTargetOf(el);
        const files = el.files;
        el.value = '';                 // so re-picking the same file fires again
        if (t) phAccept(t, files);
      };
      return;
    }
    const t = phTargetOf(el);
    if (!t) return;

    el.ondragover = (ev) => { ev.preventDefault(); el.classList.add('over'); };
    el.ondragenter = (ev) => { ev.preventDefault(); el.classList.add('over'); };
    el.ondragleave = () => el.classList.remove('over');
    el.ondrop = (ev) => {
      ev.preventDefault();
      ev.stopPropagation();
      el.classList.remove('over');
      const dt = ev.dataTransfer;
      if (dt && dt.files && dt.files.length) phAccept(t, dt.files);
    };
    el.onclick = (ev) => {
      if (ev.target.closest('[data-ph-del]')) return;   // the ✕, not the tile
      const input = el.querySelector('input.ph-input');
      if (input) input.click();
    };
  });

  Array.from(root.querySelectorAll('[data-ph-del]')).forEach(b => {
    b.onclick = (ev) => {
      ev.preventDefault();
      ev.stopPropagation();
      phDelete(b.getAttribute('data-ph-del'));
    };
  });

  const x = document.getElementById('ph-xlsx');
  if (x) x.onclick = () => phExportIndex();
}

/* The whole card swallows drops so a photo dropped between tiles does not make
   the browser NAVIGATE to the image file, which loses any unsaved edit on the
   page. Both handlers are required — preventing only `drop` still lets Chrome
   treat the dragover as a navigation. */
function phGuardCardDrop(card) {
  card.addEventListener('dragover', ev => ev.preventDefault());
  card.addEventListener('drop', ev => ev.preventDefault());
}

// ------------------------------------------------------------- Excel handoff

function phXlsxExt(mime, name) {
  const m = /^image\/(jpeg|jpg|png|gif)$/i.exec(mime || '');
  if (m) return m[1].toLowerCase() === 'jpg' ? 'jpeg' : m[1].toLowerCase();
  const e = /\.(jpe?g|png|gif)$/i.exec(name || '');
  if (!e) return '';                       // webp/heic: listed, not embedded
  const x = e[1].toLowerCase();
  return x === 'jpg' || x === 'jpeg' ? 'jpeg' : x;
}

/**
 * A standalone workbook: every photo embedded, with its Drive link and the COMPS
 * row the photo populator targets. Deliberately NOT the deal proforma — this app
 * never opens that file.
 */
async function phExportIndex() {
  const comp = getComp(PH.compId);
  if (!comp) return;
  if (typeof ExcelJS === 'undefined') { toast('Excel library not loaded'); return; }

  const rows = [];
  PH_SLOTS.forEach(s => {
    const f = PH.slots[s.key];
    if (f) rows.push({ group: 'Standard', label: s.label, file: f, compsRow: s.compsRow });
  });
  PH.plans.forEach(p => p.photos.forEach(f => {
    rows.push({ group: 'Floor plan', label: p.label, file: f, compsRow: '' });
  }));
  if (!rows.length) { toast('No photos to index yet'); return; }

  toast('Building the photo index…');
  try {
    const wb = new ExcelJS.Workbook();
    wb.creator = 'Rent Comps Tracker';
    const ws = wb.addWorksheet('Photos');
    ws.columns = [
      { header: 'Group', key: 'group', width: 12 },
      { header: 'Floor plan / Slot', key: 'label', width: 22 },
      { header: 'Photo', key: 'img', width: 30 },
      { header: 'File name', key: 'name', width: 30 },
      { header: 'COMPS row', key: 'row', width: 11 },
      { header: 'Drive link', key: 'link', width: 46 },
    ];
    ws.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
    ws.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1D2D47' } };
    ws.getRow(1).alignment = { vertical: 'middle' };

    ws.addRow([]);
    ws.getCell('A2').value = comp.name || 'Untitled comp';
    ws.getCell('A2').font = { bold: true, size: 12 };

    let r = 3;
    for (const item of rows) {
      const row = ws.getRow(r);
      row.height = 78;
      row.getCell(1).value = item.group;
      row.getCell(2).value = item.label;
      row.getCell(4).value = item.file.name;
      row.getCell(5).value = item.compsRow || '';
      const link = 'https://drive.google.com/file/d/' + item.file.id + '/view';
      row.getCell(6).value = { text: link, hyperlink: link };
      row.getCell(6).font = { color: { argb: 'FF1155CC' }, underline: true };
      row.commit();

      const ext = phXlsxExt(item.file.mimeType, item.file.name);
      if (ext) {
        try {
          const buf = await driveDownloadBuffer(item.file.id);
          const id = wb.addImage({ buffer: buf, extension: ext });
          /* Inset by a couple of pixels so the image does not paint over the
             cell's own gridlines and read as a merged block. */
          ws.addImage(id, {
            tl: { col: 2.05, row: r - 1 + 0.05 },
            ext: { width: 140, height: 95 },
          });
        } catch (e) { row.getCell(3).value = '(could not embed)'; }
      } else {
        row.getCell(3).value = '(not an Excel-embeddable format)';
      }
      r++;
    }

    const buf = await wb.xlsx.writeBuffer();
    const name = 'CompPhotos_' + (phSanitize(comp.name) || 'comp').replace(/\s+/g, '_')
      + '_' + todayISO() + '.xlsx';

    const trackerId = STATE.drive && STATE.drive.trackerFolderId;
    if (trackerId && driveConnected()) {
      const hits = await driveList(
        `'${phLit(trackerId)}' in parents and name='${phLit(name)}' and trashed=false`, 'id,name');
      await driveUpload(trackerId, name,
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        new Blob([buf]), hits.length ? hits[0].id : '');
      toast('Photo index saved to Rent Comps Tracker/' + name);
    } else {
      const a = document.createElement('a');
      a.href = URL.createObjectURL(new Blob([buf], {
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      }));
      a.download = name;
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 4000);
      toast('Photo index downloaded');
    }
  } catch (e) {
    toast('Photo index failed: ' + ((e && e.message) || e));
  }
}

// -------------------------------------------------------------------- mounting

/**
 * Append the card to the comp editor and kick off the read.
 * Called after renderCompEditor has replaced #phase-content wholesale, which is
 * why nothing here can be wired once at boot.
 */
function phMountCompEditor(compId) {
  const host = document.getElementById('phase-content');
  const comp = getComp(compId);
  if (!host || !comp) return;
  if (document.getElementById('ph-card')) return;

  /* Switching comps must not show the previous comp's photos for a frame. */
  const switched = PH.compId !== compId;
  if (switched) { PH.compId = compId; PH.state = 'loading'; PH.slots = {}; PH.plans = []; }

  host.insertAdjacentHTML('beforeend', phCardHtml(comp));
  const card = document.getElementById('ph-card');
  if (!card) return;
  phGuardCardDrop(card);
  phWireZones(card);

  phLoad(comp).then(() => {
    if (PH.compId !== compId) return;
    if (!document.getElementById('ph-card')) return;
    phPaint();
    phLoadThumbs();
  });
}

/* Same trick screener.js uses on renderPhase3 and paste-export.js on
   renderPhase4: renderCompEditor is a global function declaration in ui.js, so
   wrapping window.renderCompEditor re-points its existing call sites without
   re-emitting a 58 KB file. Deleting photos.js + photos.css removes the feature
   whole. */
(function () {
  const inner = window.renderCompEditor;
  if (typeof inner !== 'function') {
    console.warn('photos: renderCompEditor missing — photo card not mounted');
    return;
  }
  window.renderCompEditor = function (compId) {
    inner.apply(this, arguments);
    try { phMountCompEditor(compId); } catch (e) { console.error('photos card', e); }
  };
})();

/* Exposed for the node harness (Accessories/photos_harness.js). Same shape as
   window.SCREENER — the testable pieces, not the whole module. */
window.PHOTOS = {
  SLOTS: PH_SLOTS, PH: PH,
  sanitize: phSanitize, ext: phExt, base: phBase, matchesSlot: phMatchesSlot,
  planFolderName: phPlanFolderName, plansOf: phPlansOf,
  validate: phValidate, xlsxExt: phXlsxExt,
  load: phLoad, accept: phAccept, writeSlot: phWriteSlot,
  writePlanPhoto: phWritePlanPhoto, compFolder: phCompFolder,
  bodyHtml: phBodyHtml, cardHtml: phCardHtml, mount: phMountCompEditor,
};
