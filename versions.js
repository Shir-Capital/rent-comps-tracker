/* ============================================================================
   Rent Comps Tracker — versions.js
   Multiple named VERSIONS of the comp set per subject (2026-11-24), modelled
   on Capex Builder's budget versions (BUDGET_VERSIONING_PLAN.md there).

   Owner's call: each version holds its own COMPS + MARKET RENTS — the comp
   list (with every comp's data, fees, category), the market-rent overrides and
   the internal-comp filters. Everything else (subject, subject unit mix,
   subject rent-roll leases, the deal-folder link, imports) stays ONE shared
   record that everyone edits live, exactly as before.

   STORAGE
     <deal>/3. Comps/Rent Comps Tracker/rent_comps.json      shared record (no comps)
     <deal>/3. Comps/Rent Comps Tracker/Versions/<Label>_<user>.json   one per version
     manifest  properties[] (unchanged) + versions[] (one row per version)

   IN MEMORY  STATE stays the FULL record every existing screen reads
   (STATE.comps, STATE.marketRents, STATE.internalComp). Those three fields are
   the open version's; saveState() hands them back to CURRENT_VERSION and works
   out, by content signature, which of the two files actually changed — so no
   edit path anywhere had to learn about versions.

   Lessons carried over from Capex Builder (each one cost a real clean-up there):
   - no default version: the most recently edited one is picked and listed first;
   - names are unique per subject (case-insensitive, local + index);
   - the first push of a version resolves its file under a per-version lock and
     ADOPTS an existing file carrying the same versionId (create race, re-mint);
   - a version created as a guess (index not loaded yet) is PROVISIONAL and never
     pushed until someone actually puts work in it;
   - Drive is authoritative for which versions exist: the Versions folder is
     walked on open, unindexed files are adopted, rows whose file is gone dropped;
   - the legacy split (one file -> shared + "Original") uses a DETERMINISTIC
     version id, so two devices migrating the same subject converge on one file.
   ========================================================================= */

'use strict';

const VERSION_FIELDS = ['comps', 'marketRents', 'internalComp'];
const VERSIONS_FOLDER = 'Versions';
let CURRENT_VERSION = null;

function versionStore() {
  if (!STORE.versions || typeof STORE.versions !== 'object') STORE.versions = {};
  if (!STORE.currentVersionByProperty || typeof STORE.currentVersionByProperty !== 'object') STORE.currentVersionByProperty = {};
  return STORE.versions;
}
function newVersionId() {
  return 'v_' + Math.random().toString(36).slice(2, 10) + '_' + Date.now().toString(36);
}
/** The id the legacy split gives a subject's first version: the same on every device. */
function legacyVersionId(propertyId) { return 'v_' + propertyId + '_orig'; }
function meEmail() { return (typeof CURRENT_USER === 'object' && CURRENT_USER && CURRENT_USER.email) || ''; }

function blankVersion(propertyId, label) {
  const now = nowISO();
  return {
    versionId: newVersionId(), propertyId, label: label || 'Original', archived: false,
    versionCreatedAt: now, versionCreatedBy: meEmail(), versionUpdated: now, versionLastEditor: meEmail(),
    versionDrive: { fileId: '', fileName: '', lastPushed: null, lastPulled: null, remoteModifiedTime: null },
    comps: [], marketRents: {}, internalComp: Object.assign({}, INTERNAL_DEFAULTS),
  };
}
function hydrateVersion(v) {
  if (!v) return v;
  v.versionDrive = Object.assign({ fileId: '', fileName: '', lastPushed: null, lastPulled: null, remoteModifiedTime: null }, v.versionDrive || {});
  if (!Array.isArray(v.comps)) v.comps = [];
  if (!v.marketRents || typeof v.marketRents !== 'object') v.marketRents = {};
  v.internalComp = Object.assign({}, INTERNAL_DEFAULTS, v.internalComp || {});
  v.comps.forEach(c => hydrateComp(c));
  if (v.archived === undefined) v.archived = false;
  return v;
}
function versionsOf(propertyId) {
  return Object.values(versionStore()).filter(v => v && v.propertyId === propertyId);
}

// ---------------------------------------------------------- change tracking
/* FNV-1a over the JSON. Kept in a WeakMap (never serialised) per object, and
   re-baselined whenever an object is attached or replaced by a pull. */
const _SIG = new WeakMap();
function _hash(str) {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 0x01000193); }
  return (h >>> 0).toString(36) + ':' + str.length;
}
function versionSig(o) { return _hash(JSON.stringify(VERSION_FIELDS.map(k => o[k]))); }
const SHARED_SKIP = ['drive', 'updated', 'lastEditor', 'created'].concat(VERSION_FIELDS);
function sharedSig(p) {
  const o = {};
  Object.keys(p).sort().forEach(k => { if (SHARED_SKIP.indexOf(k) === -1) o[k] = p[k]; });
  return _hash(JSON.stringify(o));
}
function baselineSigs(p, v) {
  if (p) _SIG.set(p, sharedSig(p));
  if (v) _SIG.set(v, versionSig(v));
}
function versionIsDirty(v) {
  if (!v || v.provisional || v._stub) return false;
  return !v.versionDrive.lastPushed || String(v.versionUpdated || '') > String(v.versionDrive.lastPushed);
}
/** True once a version holds work a person did (a comp, a market-rent override, a filter). */
function versionHasAuthoredWork(v) {
  if (!v) return false;
  if ((v.comps || []).length) return true;
  if (Object.keys(v.marketRents || {}).some(k => v.marketRents[k] && String(v.marketRents[k].override || '').trim() !== '')) return true;
  const ic = v.internalComp || {};
  return Object.keys(INTERNAL_DEFAULTS).some(k => String(ic[k] == null ? '' : ic[k]) !== String(INTERNAL_DEFAULTS[k]))
    || Object.keys(ic.excluded || {}).length > 0;
}

/**
 * Called by saveState(). Hands STATE's three version fields back to the open
 * version and reports which file changed. Returns null when versions are not in
 * play for STATE (then saveState behaves exactly as it always has).
 */
function versionTrackSave(p, me) {
  const v = CURRENT_VERSION;
  if (!p || !v || v.propertyId !== p.id) return null;
  VERSION_FIELDS.forEach(k => { v[k] = p[k]; });
  const vs = versionSig(v);
  if (_SIG.get(v) !== vs) {
    _SIG.set(v, vs);
    v.versionUpdated = nowISO();
    if (me) v.versionLastEditor = me;
    if (v.provisional && versionHasAuthoredWork(v)) delete v.provisional;
  }
  const ss = sharedSig(p);
  const sharedChanged = _SIG.get(p) !== ss;
  _SIG.set(p, ss);
  return { shared: sharedChanged };
}

/** localStorage copy: a subject that has versions does not also carry their fields. */
function storeForPersist(store) {
  const withVersions = new Set(Object.values(store.versions || {}).map(v => v && v.propertyId));
  if (!withVersions.size) return store;
  const props = {};
  Object.keys(store.properties || {}).forEach(id => {
    const p = store.properties[id];
    if (!p || !withVersions.has(id)) { props[id] = p; return; }
    const q = {};
    Object.keys(p).forEach(k => { if (VERSION_FIELDS.indexOf(k) === -1) q[k] = p[k]; });
    props[id] = q;
  });
  return Object.assign({}, store, { properties: props });
}

/** The Drive payload of the SHARED file: the record without the version fields. */
function sharedPayload(p) {
  const out = JSON.parse(JSON.stringify(p));
  VERSION_FIELDS.forEach(k => delete out[k]);
  out._versioned = 1;
  return out;
}
/** The Drive payload of a version file. */
function versionPayload(v) {
  const out = JSON.parse(JSON.stringify(v));
  delete out.versionDrive; delete out.provisional;
  out._app = 'rent-comps-tracker-version';
  return out;
}
/* A record from before versions carries the comp set itself and no `_versioned`
   marker. Every record written by this code carries the marker: a new subject
   (newProperty), a split one, and every shared file pushed to Drive
   (sharedPayload) — so a device that pulls an already-split subject never
   mistakes its empty comp list for a legacy record to split again. */
function isLegacyRecord(raw) { return !!raw && !raw._versioned; }

// ---------------------------------------------------------- ordering / names
function versionLastEdited(local, row) {
  const a = (local && (local.versionUpdated || local.versionCreatedAt)) || '';
  const b = (row && (row.lastModified || row.createdAt)) || '';
  return a > b ? a : b;
}
function versionLabelOf(local, row) {
  const lt = (local && (local.versionUpdated || local.versionCreatedAt)) || '';
  const rt = (row && (row.lastModified || row.createdAt)) || '';
  const pick = (!local || (row && rt > lt)) ? row : local;
  return (pick && pick.label) || (local || {}).label || (row || {}).label || 'Untitled';
}
function manifestVersionRows(propertyId) {
  const d = MANIFEST_CACHE && MANIFEST_CACHE.data;
  return (d && Array.isArray(d.versions) ? d.versions : []).filter(r => r && r.propertyId === propertyId);
}
/** Local + index versions of one subject, MOST RECENTLY EDITED FIRST. */
function mergedVersionsFor(propertyId) {
  const m = new Map();
  versionsOf(propertyId).forEach(v => m.set(v.versionId, { local: v, row: null }));
  manifestVersionRows(propertyId).forEach(r => { const c = m.get(r.id) || { local: null, row: null }; c.row = r; m.set(r.id, c); });
  return Array.from(m.entries()).map(([id, e]) => ({
    id, local: e.local, row: e.row,
    label: versionLabelOf(e.local, e.row),
    archived: !!((e.local && e.local.archived) || (e.row && e.row.archived)),
    edited: versionLastEdited(e.local, e.row),
  })).sort((x, y) => y.edited.localeCompare(x.edited) || x.label.localeCompare(y.label));
}
function versionCountFor(propertyId) {
  return mergedVersionsFor(propertyId).filter(e => !e.archived).length;
}
function versionLabelTaken(propertyId, label, exceptId) {
  const want = String(label || '').trim().toLowerCase();
  return !!want && mergedVersionsFor(propertyId).some(e => e.id !== exceptId && String(e.label).trim().toLowerCase() === want);
}
function promptUniqueVersionName(propertyId, message, initial, exceptId) {
  let value = initial || '';
  for (;;) {
    const a = prompt(message, value);
    if (a === null) return null;
    value = String(a).trim();
    if (!value) { message = 'Enter a name for this version:'; continue; }
    if (versionLabelTaken(propertyId, value, exceptId)) {
      message = '"' + value + '" is already the name of another version of this subject.\n\nPick a different name:';
      continue;
    }
    return value;
  }
}

// ---------------------------------------------------------- attach / compose
/** Point STATE's version fields at `v` (by reference) and make it current. */
function composeVersion(p, v) {
  CURRENT_VERSION = v;
  if (p && v) {
    VERSION_FIELDS.forEach(k => { p[k] = v[k]; });
    versionStore()[v.versionId] = v;
    STORE.currentVersionByProperty[p.id] = v.versionId;
  }
  baselineSigs(p, v);
}

/**
 * Which version a just-opened subject uses. Order: (1) the record is still in
 * the pre-versions shape -> split it into the shared record + "Original"; (2) the
 * version this device last had open for it; (3) its most recently edited local
 * version; (4) the index's most recently edited row, as a stub that pulls its
 * content right after; (5) a PROVISIONAL blank that can never push by itself.
 */
function attachVersionForOpen(p) {
  versionStore();
  const mine = versionsOf(p.id);
  if (!mine.length && isLegacyRecord(p)) {   // local copy from before versions: split it
    const v = hydrateVersion(blankVersion(p.id, 'Original'));
    v.versionId = legacyVersionId(p.id);
    v.versionCreatedBy = p.lastEditor || meEmail();
    v.versionCreatedAt = p.created || v.versionCreatedAt;
    v.versionUpdated = p.updated || v.versionUpdated;
    v.versionLastEditor = p.lastEditor || '';
    VERSION_FIELDS.forEach(k => { if (p[k] !== undefined) v[k] = p[k]; });
    hydrateVersion(v);
    /* Not dirty: whether Drive needs it is decided by migrateLegacyVersion(),
       which first looks for a file another device may already have written. A
       device with unpushed edits keeps them as edits (lastPushed stays behind). */
    const localDirty = !p.drive.lastPushed || String(p.updated || '') > String(p.drive.lastPushed);
    v.versionDrive.lastPushed = localDirty ? null : v.versionUpdated;
    v._legacySplit = true;
    composeVersion(p, v);
    return v;
  }
  const remembered = STORE.currentVersionByProperty[p.id];
  let v = (remembered && versionStore()[remembered] && versionStore()[remembered].propertyId === p.id) ? versionStore()[remembered] : null;
  if (!v && mine.length) v = mine.slice().sort((a, b) => String(b.versionUpdated || '').localeCompare(String(a.versionUpdated || '')))[0];
  if (!v) {
    const row = manifestVersionRows(p.id).filter(r => r.fileId && !r.archived)
      .sort((a, b) => String(b.lastModified || '').localeCompare(String(a.lastModified || '')))[0];
    v = hydrateVersion(blankVersion(p.id, row ? row.label : 'Original'));
    if (row) {
      v.versionId = row.id; v.label = row.label || 'Original';
      v.versionCreatedAt = row.createdAt || v.versionCreatedAt; v.versionCreatedBy = row.createdBy || '';
      v.versionDrive.fileId = row.fileId; v.versionDrive.fileName = row.fileName || '';
      v.versionUpdated = '';                     // older than anything Drive has -> reconcile pulls
      v.versionDrive.lastPushed = '0';
      v._stub = true;
    } else {
      v.provisional = true;                      // a guess: never pushed unless someone puts work in it
      v.versionDrive.lastPushed = v.versionUpdated;
    }
  }
  hydrateVersion(v);
  composeVersion(p, v);
  return v;
}

// ---------------------------------------------------------- Drive: files
async function resolveVersionsFolder(p) {
  p = p || STATE;
  if (!p || !p.drive.folderId) throw new Error('No deal folder linked');
  if (p.drive.versionsFolderId) return p.drive.versionsFolderId;
  const tracker = await ensureTrackerFolder(p);
  p.drive.versionsFolderId = await driveEnsureSubfolder(tracker, VERSIONS_FOLDER);
  saveStore();
  return p.drive.versionsFolderId;
}
function versionFilename(label, creator) {
  const clean = s => String(s || '').trim().replace(/@.*$/, '').replace(/[^a-z0-9]+/gi, '_').replace(/^_+|_+$/g, '');
  return (clean(label) || 'Version') + '_' + (clean(creator) || 'user') + '.json';
}
function uniqueVersionFilename(files, label, creator) {
  const base = versionFilename(label, creator);
  const taken = new Set(files.map(f => String(f.name).toLowerCase()));
  if (!taken.has(base.toLowerCase())) return base;
  const stem = base.slice(0, -5);
  for (let i = 2; i < 50; i++) { const c = stem + '_' + i + '.json'; if (!taken.has(c.toLowerCase())) return c; }
  return stem + '_' + Date.now().toString(36) + '.json';
}
/** Name to PATCH on an ordinary push: follows a rename, keeps any _N the file was created with. */
function versionFilenameForPush(v) {
  const base = versionFilename(v.label, v.versionCreatedBy);
  const m = String(v.versionDrive.fileName || '').match(/_(\d+)\.json$/);
  return m ? base.slice(0, -5) + '_' + m[1] + '.json' : base;
}
async function listVersionFiles(folderId) {
  return driveList(`'${folderId}' in parents and trashed=false`, 'id,name,modifiedTime,createdTime');
}

/* Resolve the Drive file of a version with no fileId yet, creating one only when
   it is genuinely not there. Concurrent calls for one version share ONE flight
   (create race); a file whose CONTENT carries this versionId is adopted, not
   duplicated (re-mint). Returns {id, name, modifiedTime, adopted}. */
const _ensureVersionInflight = new Map();
async function ensureVersionFile(folderId, v) {
  const key = v.versionId;
  if (_ensureVersionInflight.has(key)) return _ensureVersionInflight.get(key);
  const work = (async () => {
    const files = await listVersionFiles(folderId);
    for (const f of files.filter(f => /\.json$/i.test(f.name))) {
      try {
        const d = JSON.parse(await driveDownloadText(f.id));
        if (d && d.versionId === key) return { id: f.id, name: f.name, modifiedTime: f.modifiedTime, adopted: true };
      } catch (e) { console.warn('ensureVersionFile: could not read Versions/' + f.name, e); }
    }
    const name = uniqueVersionFilename(files, v.label, v.versionCreatedBy);
    const r = await driveUploadJson(folderId, name, versionPayload(v));
    return { id: r.id, name, modifiedTime: r.modifiedTime, adopted: false, created: true };
  })();
  _ensureVersionInflight.set(key, work);
  try { return await work; } finally { _ensureVersionInflight.delete(key); }
}

/** Push one version's file. true = written, false = failed, 'conflict' = Drive newer, undefined = nothing to do. */
async function pushVersionToDrive(v, opts) {
  const silent = !!(opts && opts.silent), force = !!(opts && opts.force);
  const p = STATE;
  if (!v || !p || v.propertyId !== p.id || !STORE.properties[p.id] || !versionStore()[v.versionId]) return undefined;
  if (v.provisional && !versionHasAuthoredWork(v)) return undefined;
  if (v._stub) return undefined;                            // content not loaded yet: never write a stub
  if (!p.drive.folderId || !driveConnected()) return undefined;
  const folder = await resolveVersionsFolder(p);
  let fileId = v.versionDrive.fileId, name;
  if (fileId) {
    name = versionFilenameForPush(v);
    /* No remoteModifiedTime = this device has never read the Drive copy (an
       adopted file, a stale pre-versions copy): Drive is presumed newer, so a
       silent push is a conflict, never an overwrite. Found by the two-device
       fake-Drive test (2026-11-24): a stale device's tick overwrote a rename. */
    if (!force) {
      try {
        const meta = await driveGetMeta(fileId, 'id,modifiedTime');
        const known = v.versionDrive.remoteModifiedTime;
        if (!known || (meta.modifiedTime > known
            && (!v.versionDrive.lastPushed || meta.modifiedTime > v.versionDrive.lastPushed))) {
          if (silent) return 'conflict';
          if (!confirm('The Drive copy of version "' + v.label + '" changed since this device last synced it.\n\nOverwrite it with this device\'s copy?')) return undefined;
        }
      } catch (e) { /* write */ }
    }
  } else {
    const got = await ensureVersionFile(folder, v);
    fileId = got.id; name = got.name;
    v.versionDrive.fileId = fileId; v.versionDrive.fileName = name;
    /* Adopted a file another device already wrote: if it is newer than this
       copy, Drive wins — pull it instead of overwriting someone's work. */
    if (got.adopted && !force && got.modifiedTime && got.modifiedTime > String(v.versionUpdated || '')) {
      v.versionDrive.remoteModifiedTime = null;
      v.versionDrive.lastPushed = v.versionUpdated;
      saveStore();
      await pullVersionFromDrive(v, { silent: true });
      return undefined;
    }
  }
  const r = await driveUploadJson(folder, name, versionPayload(v), fileId);
  v.versionDrive.fileId = r.id; v.versionDrive.fileName = name;
  v.versionDrive.lastPushed = nowISO();
  v.versionDrive.remoteModifiedTime = r.modifiedTime || nowISO();
  delete v._legacySplit;
  saveStore();
  return true;
}

/** Adopt a version's Drive copy into the local record (and STATE, if it is open). */
async function pullVersionFromDrive(v, opts) {
  if (!v || !v.versionDrive.fileId) return false;
  try {
    const data = JSON.parse(await driveDownloadText(v.versionDrive.fileId));
    const meta = await driveGetMeta(v.versionDrive.fileId, 'id,modifiedTime,name');
    if (!data || (data.versionId && data.versionId !== v.versionId)) return false;
    VERSION_FIELDS.forEach(k => { v[k] = data[k]; });
    ['label', 'archived', 'versionCreatedAt', 'versionCreatedBy', 'versionLastEditor'].forEach(k => { if (data[k] !== undefined) v[k] = data[k]; });
    hydrateVersion(v);
    v.versionUpdated = data.versionUpdated || meta.modifiedTime;
    v.versionDrive.fileName = meta.name || v.versionDrive.fileName;
    v.versionDrive.lastPulled = nowISO();
    v.versionDrive.remoteModifiedTime = meta.modifiedTime;
    v.versionDrive.lastPushed = v.versionUpdated > meta.modifiedTime ? v.versionUpdated : meta.modifiedTime;
    delete v._stub; delete v.provisional; delete v._legacySplit;
    if (STATE && CURRENT_VERSION === v) {
      composeVersion(STATE, v);
      if (typeof renderCurrentPhase === 'function') renderCurrentPhase();
    }
    saveStore();
    if (!(opts && opts.silent)) toast('Loaded version "' + v.label + '" from Drive');
    return true;
  } catch (e) {
    console.warn('pullVersionFromDrive', e);
    if (!(opts && opts.silent)) toast('Could not load that version: ' + (e.message || e));
    return false;
  }
}

/** On open: the open version's Drive copy is newer and this device is clean -> adopt it. */
async function reconcileVersionFromDrive() {
  const v = CURRENT_VERSION;
  if (!v || !STATE || !v.versionDrive.fileId || !driveConnected()) return;
  try {
    const meta = await driveGetMeta(v.versionDrive.fileId, 'id,modifiedTime');
    if (CURRENT_VERSION !== v) return;
    const newer = !v.versionDrive.remoteModifiedTime || meta.modifiedTime > v.versionDrive.remoteModifiedTime;
    if (newer && (v._stub || !versionIsDirty(v))) await pullVersionFromDrive(v, { silent: true });
    else if (newer) {
      showSyncBar('⚠️ <b>Drive has a newer copy of version “' + esc(v.label) + '”</b>, and this device has unsynced edits to it. One of the two has to win.', {
        reason: 'vconflict',
        actions: [
          { key: 'vpull', cls: 'primary', label: '↓ Take the Drive version', title: "Loads Drive's copy of this version (this device's copy goes to Backups first)" },
          { key: 'vpush', cls: 'danger', label: '↑ Keep this device’s version', title: 'Overwrites the newer Drive copy of this version' },
        ],
      });
    }
  } catch (e) { console.warn('reconcileVersionFromDrive', e); }
}

/**
 * Drive is authoritative for WHICH versions exist. Walks the Versions folder:
 * indexes any version file the manifest is missing (it belongs to this subject,
 * and its versionId is not already listed), and drops rows whose file Drive
 * confirms is gone. Never drops a row on a network error.
 */
async function reconcileVersionsFolder() {
  const p = STATE;
  if (!p || !p.drive.folderId || !driveConnected()) return;
  const propId = p.id;
  let folder;
  try { folder = await resolveVersionsFolder(p); } catch (e) { return; }
  const files = (await listVersionFiles(folder)).filter(f => /\.json$/i.test(f.name));
  const m = await fetchManifest(true);
  if (!m || !STATE || STATE.id !== propId) return;
  if (!Array.isArray(m.data.versions)) m.data.versions = [];
  const rows = m.data.versions;
  const byFile = new Set(rows.map(r => r.fileId).filter(Boolean));
  const byId = new Set(rows.map(r => r.id));
  const added = [], dropped = [];
  for (const f of files) {
    if (byFile.has(f.id)) continue;
    let d = null;
    try { d = JSON.parse(await driveDownloadText(f.id)); } catch (e) { continue; }
    if (!d || d.propertyId !== propId || !d.versionId || byId.has(d.versionId)) continue;
    rows.push({ id: d.versionId, propertyId: propId, label: d.label || 'Untitled', archived: !!d.archived,
      fileId: f.id, fileName: f.name, createdAt: d.versionCreatedAt || f.createdTime || '', createdBy: d.versionCreatedBy || '',
      lastModified: d.versionUpdated || f.modifiedTime || '', lastEditor: d.versionLastEditor || '',
      compCount: (d.comps || []).length, currentEditor: '', currentEditorHeartbeatAt: null });
    byFile.add(f.id); byId.add(d.versionId); added.push(d.label || f.name);
  }
  const present = new Set(files.map(f => f.id));
  const keep = [];
  for (const r of rows) {
    if (r.propertyId !== propId || !r.fileId || present.has(r.fileId)) { keep.push(r); continue; }
    let gone = false;
    try { const meta = await driveGetMeta(r.fileId, 'id,trashed'); gone = !!meta.trashed; }
    catch (e) { gone = /404/.test(String(e && e.message)); }
    if (gone && !(CURRENT_VERSION && CURRENT_VERSION.versionId === r.id && versionIsDirty(CURRENT_VERSION))) {
      dropped.push(r.label);
      const lv = versionStore()[r.id];
      if (lv && lv !== CURRENT_VERSION) delete versionStore()[r.id];
    } else keep.push(r);
  }
  if (!added.length && !dropped.length) return;
  if (!STATE || STATE.id !== propId) return;
  m.data.versions = keep;
  m.data.updatedAt = nowISO();
  const r = await driveUploadJson(SYNC_FOLDER_ID, MANIFEST_FILENAME, m.data, m.fileId || undefined);
  m.fileId = r.id;
  saveStore();
  if (added.length) toast('Found ' + added.length + ' version' + (added.length > 1 ? 's' : '') + ' on Drive: ' + added.join(', '));
  if (dropped.length) toast('Removed ' + dropped.length + ' version' + (dropped.length > 1 ? 's' : '') + ' whose Drive file is gone: ' + dropped.join(', '));
  renderVersionStrip();
}

/** Find-only: the file in the Versions folder whose CONTENT carries this versionId. */
async function findVersionFileById(folderId, versionId) {
  const files = (await listVersionFiles(folderId)).filter(f => /\.json$/i.test(f.name));
  for (const f of files) {
    try { const d = JSON.parse(await driveDownloadText(f.id)); if (d && d.versionId === versionId) return f; }
    catch (e) { console.warn('findVersionFileById: could not read Versions/' + f.name, e); }
  }
  return null;
}

/**
 * The legacy split on Drive — run by pushToDrive (under its in-flight guard),
 * BEFORE the shared file is written, because the shared file goes up without
 * the comps: they must already be in a version file. Returns true once the
 * open version is safely on Drive (or the split turned out to be unnecessary).
 *   Drive's rent_comps.json already split by another device:
 *     - the same deterministic "Original" is on Drive -> adopt it (pull, or a
 *       conflict bar if this device has unpushed edits);
 *     - it is not (renamed away / deleted) -> a clean local copy is just stale:
 *       drop it and take the index's versions; a dirty one is kept as its own
 *       version, "Original (unsynced copy)", so no edit is lost.
 *   Drive's rent_comps.json still legacy (or absent): write the Original (the
 *   per-version lock + adopt-by-id stop a twin), then flag the shared file for
 *   its rewrite without the comps.
 */
async function migrateLegacyVersion(p, v) {
  if (!p || !v || !v._legacySplit) return true;
  let fileId = p.drive.fileId, remote = null;
  try {
    if (!fileId) {
      const folder = await ensureTrackerFolder(p);
      const hits = await driveList(`'${folder}' in parents and name='${STATE_FILENAME}' and trashed=false`, 'id,name,modifiedTime');
      if (hits.length) fileId = hits[0].id;
    }
    if (fileId) remote = JSON.parse(await driveDownloadText(fileId));
  } catch (e) { console.warn('migrateLegacyVersion: could not read the shared file', e); return false; }

  if (remote && remote._versioned) {
    const vfolder = await resolveVersionsFolder(p);
    const found = await findVersionFileById(vfolder, v.versionId);
    p._versioned = 1;
    if (found) {
      delete v._legacySplit;
      v.versionDrive.fileId = found.id; v.versionDrive.fileName = found.name;
      v.versionDrive.remoteModifiedTime = null;          // unknown -> reconcile treats Drive as newer
      if (!versionIsDirty(v)) await pullVersionFromDrive(v, { silent: true });
      saveStore();
      return true;
    }
    if (!versionIsDirty(v)) {
      delete versionStore()[v.versionId];
      CURRENT_VERSION = null;
      await fetchManifest(true);
      attachVersionForOpen(p);                         // index row stub (pulled below) or a provisional blank
      saveStore();
      if (CURRENT_VERSION && CURRENT_VERSION._stub) await pullVersionFromDrive(CURRENT_VERSION, { silent: true });
      return true;
    }
    const oldId = v.versionId;
    v.versionId = newVersionId();
    let label = 'Original (unsynced copy)', n = 2;
    while (versionLabelTaken(p.id, label, v.versionId)) label = 'Original (unsynced copy ' + (n++) + ')';
    v.label = label;
    delete versionStore()[oldId];
    delete v._legacySplit;
    composeVersion(p, v);
    v.versionDrive.lastPushed = null;
    const r = await pushVersionToDrive(v, { silent: true });
    toast('This device had unsynced comps from before versions: kept as version “' + label + '”', 6000);
    return r === true;
  }

  const r = await pushVersionToDrive(v, { silent: true });
  if (r === true || (r === undefined && v.versionDrive.fileId)) {
    delete v._legacySplit;
    p._versioned = 1;
    p.drive.sharedNeedsRewrite = true;
    saveStore();
    return true;
  }
  return false;
}

/**
 * Late recovery when the subject was opened before the index loaded: the open
 * version is a provisional guess. If the org has real versions, swap to the
 * most recent one. Never replaces a version someone has put work in.
 */
async function adoptIndexedVersionIfProvisional() {
  const p = STATE, v = CURRENT_VERSION;
  if (!p || !v || !v.provisional || versionHasAuthoredWork(v)) return;
  const row = manifestVersionRows(p.id).filter(r => r.fileId && !r.archived && r.id !== v.versionId)
    .sort((a, b) => String(b.lastModified || '').localeCompare(String(a.lastModified || '')))[0];
  if (!row) return;
  const nv = hydrateVersion(blankVersion(p.id, row.label));
  nv.versionId = row.id; nv.versionDrive.fileId = row.fileId; nv.versionDrive.fileName = row.fileName || '';
  nv.versionCreatedBy = row.createdBy || ''; nv.versionCreatedAt = row.createdAt || nv.versionCreatedAt;
  versionStore()[nv.versionId] = nv;
  const ok = await pullVersionFromDrive(nv, { silent: true });
  if (!ok || STATE !== p || CURRENT_VERSION !== v || versionHasAuthoredWork(v)) { if (!ok) delete versionStore()[nv.versionId]; return; }
  delete versionStore()[v.versionId];
  composeVersion(p, nv);
  saveStore();
  if (typeof renderCurrentPhase === 'function') renderCurrentPhase();
}

/** Everything the open path runs once Drive is reachable. */
async function versionsOnOpen() {
  if (!STATE || !driveConnected()) return;
  const id = STATE.id;
  try {
    await fetchManifest(true);
    if (!STATE || STATE.id !== id) return;
    if (CURRENT_VERSION && CURRENT_VERSION._legacySplit) await pushToDrive({ silent: true });   // runs migrateLegacyVersion
    if (!STATE || STATE.id !== id) return;
    await reconcileVersionsFolder();
    await adoptIndexedVersionIfProvisional();
    await reconcileVersionFromDrive();
  } catch (e) { console.warn('versionsOnOpen', e); }
  renderVersionStrip();
}

// ---------------------------------------------------------- manifest rows
function versionManifestRow(v, asEditor) {
  const me = meEmail();
  const row = {
    id: v.versionId, propertyId: v.propertyId, label: v.label, archived: !!v.archived,
    fileId: v.versionDrive.fileId || '', fileName: v.versionDrive.fileName || '',
    createdAt: v.versionCreatedAt, createdBy: v.versionCreatedBy,
    lastModified: v.versionUpdated, lastEditor: v.versionLastEditor || me,
    compCount: (v.comps || []).length,
  };
  if (asEditor) { row.currentEditor = me; row.currentEditorHeartbeatAt = nowISO(); }
  return row;
}
/** Folded into upsertManifestEntry's ONE write: the open version's row + heartbeat. */
function upsertVersionRowInto(data, v, asEditor) {
  if (!v || v.provisional || v._stub || !v.versionDrive.fileId) return;
  if (!Array.isArray(data.versions)) data.versions = [];
  const row = versionManifestRow(v, asEditor);
  const i = data.versions.findIndex(r => r.id === row.id);
  if (i >= 0) {
    const cur = data.versions[i];
    const merged = Object.assign({}, cur, row);
    if ((cur.lastModified || '') > (row.lastModified || '')) merged.label = cur.label;   // last edited wins on the name
    data.versions[i] = merged;
  } else data.versions.push(row);
}
async function writeVersionRow(v, mutate) {
  if (!driveConnected()) return;
  try {
    const m = await fetchManifest(true);
    if (!m) return;
    if (!Array.isArray(m.data.versions)) m.data.versions = [];
    mutate(m.data.versions);
    m.data.updatedAt = nowISO();
    const r = await driveUploadJson(SYNC_FOLDER_ID, MANIFEST_FILENAME, m.data, m.fileId || undefined);
    m.fileId = r.id;
  } catch (e) { console.warn('writeVersionRow', e); }
}
/** Another teammate on the SAME version: shown by syncTick. */
function versionCoEditor(propertyId) {
  const v = CURRENT_VERSION;
  if (!v) return null;
  const r = manifestVersionRows(propertyId).find(x => x.id === v.versionId);
  const me = meEmail();
  if (!r || !r.currentEditor || r.currentEditor === me || !r.currentEditorHeartbeatAt) return null;
  return (Date.now() - new Date(r.currentEditorHeartbeatAt).getTime()) < HEARTBEAT_STALE_MS ? r : null;
}

// ---------------------------------------------------------- actions
async function flushOpenVersion() {
  if (typeof cancelAutoPush === 'function') cancelAutoPush();
  if (STATE && CURRENT_VERSION && versionIsDirty(CURRENT_VERSION) && driveConnected() && STATE.drive.folderId) {
    try { await pushVersionToDrive(CURRENT_VERSION, { silent: true }); } catch (e) { console.warn('flushOpenVersion', e); }
  }
}
function releaseVersionHeartbeat(v) {
  if (!v || !driveConnected()) return Promise.resolve();
  const me = meEmail();
  return writeVersionRow(v, rows => {
    const r = rows.find(x => x.id === v.versionId);
    if (r && r.currentEditor === me) { r.currentEditor = ''; r.currentEditorHeartbeatAt = null; }
  });
}

async function switchVersion(versionId) {
  const p = STATE;
  if (!p || (CURRENT_VERSION && CURRENT_VERSION.versionId === versionId)) return;
  saveState({ noPush: true });
  await flushOpenVersion();
  const prev = CURRENT_VERSION;
  let v = versionStore()[versionId];
  if (!v || v.propertyId !== p.id) {
    const row = manifestVersionRows(p.id).find(r => r.id === versionId);
    if (!row || !row.fileId) { toast('That version is not on Drive yet'); return; }
    v = hydrateVersion(blankVersion(p.id, row.label));
    v.versionId = row.id; v.versionDrive.fileId = row.fileId; v.versionDrive.fileName = row.fileName || '';
    v.versionCreatedBy = row.createdBy || ''; v.versionCreatedAt = row.createdAt || v.versionCreatedAt;
    versionStore()[v.versionId] = v;
    toast('Loading version "' + row.label + '" from Drive…');
    if (!(await pullVersionFromDrive(v, { silent: true }))) { delete versionStore()[v.versionId]; toast('Could not load that version'); return; }
  }
  if (STATE !== p) return;
  composeVersion(p, v);
  saveStore();
  OPEN_COMP_ID = null;
  renderCurrentPhase();
  toast('Now on version "' + v.label + '"');
  releaseVersionHeartbeat(prev);
  reconcileVersionFromDrive();
  if (driveConnected()) upsertManifestEntry(p);
}

/** New version from the open one's comps + market rents (default) or blank. */
function createVersion(label, opts) {
  const p = STATE;
  if (!p) return null;
  saveState({ noPush: true });
  const v = hydrateVersion(blankVersion(p.id, label));
  const src = (opts && opts.from) || (!(opts && opts.blank) ? CURRENT_VERSION : null);
  if (src) {
    v.comps = JSON.parse(JSON.stringify(src.comps || [])).map(c => Object.assign(c, { compId: uid() }));
    v.marketRents = JSON.parse(JSON.stringify(src.marketRents || {}));
    v.internalComp = JSON.parse(JSON.stringify(src.internalComp || INTERNAL_DEFAULTS));
    hydrateVersion(v);
  }
  v.versionDrive.lastPushed = null;              // dirty: it gets its own Drive file on the next push
  const prev = CURRENT_VERSION;
  flushOpenVersion().then(() => releaseVersionHeartbeat(prev));
  composeVersion(p, v);
  _SIG.set(v, '');                               // force the first save to stamp it
  saveState();
  return v;
}

async function copyVersion(versionId) {
  const p = STATE;
  if (!p) return;
  let src = versionStore()[versionId];
  if (!src) {
    const row = manifestVersionRows(p.id).find(r => r.id === versionId);
    if (!row) return;
    src = hydrateVersion(blankVersion(p.id, row.label));
    src.versionId = row.id; src.versionDrive.fileId = row.fileId;
    if (!(await pullVersionFromDrive(src, { silent: true }))) { toast('Could not load that version'); return; }
  }
  const from = src.label || 'this version';
  const label = promptUniqueVersionName(p.id, 'Name for the copy of "' + from + '":', from + ' copy');
  if (label === null) return;
  createVersion(label, { from: src });
  renderCurrentPhase();
  toast('Copied "' + from + '" to "' + label + '" — you are now editing the copy');
}

function renameVersion(versionId, label) {
  const v = versionStore()[versionId];
  if (!v || !label) return;
  v.label = label;
  v.versionUpdated = nowISO(); v.versionLastEditor = meEmail();
  if (v === CURRENT_VERSION) { saveState(); }
  else { saveStore(); pushSiblingVersion(v); }
  renderVersionStrip();
}
function setVersionArchived(versionId, archived) {
  const v = versionStore()[versionId];
  if (!v) return;
  v.archived = !!archived;
  v.versionUpdated = nowISO();
  if (v === CURRENT_VERSION) saveState(); else { saveStore(); pushSiblingVersion(v); }
  writeVersionRow(v, rows => { const r = rows.find(x => x.id === v.versionId); if (r) r.archived = !!archived; });
  if (archived && v === CURRENT_VERSION) {
    const next = mergedVersionsFor(STATE.id).find(e => !e.archived && e.id !== v.versionId);
    if (next) switchVersion(next.id);
  }
  renderVersionStrip();
}
/** A version that is not open (rename / archive): write its own file, not STATE's. */
async function pushSiblingVersion(v) {
  if (!v || !v.versionDrive.fileId || !driveConnected() || !STATE || !STATE.drive.folderId) return;
  try {
    const folder = await resolveVersionsFolder(STATE);
    const name = versionFilenameForPush(v);
    const r = await driveUploadJson(folder, name, versionPayload(v), v.versionDrive.fileId);
    v.versionDrive.fileName = name; v.versionDrive.lastPushed = nowISO(); v.versionDrive.remoteModifiedTime = r.modifiedTime || nowISO();
    saveStore();
    writeVersionRow(v, rows => { const i = rows.findIndex(x => x.id === v.versionId); const row = versionManifestRow(v, false);
      if (i >= 0) rows[i] = Object.assign({}, rows[i], row); else rows.push(row); });
  } catch (e) { console.warn('pushSiblingVersion', e); }
}

/**
 * Delete a version for EVERYONE: its Drive file goes to Drive's trash (restorable
 * from there for 30 days), its index row is removed and this device's copy
 * dropped. The subject always keeps at least one live version.
 */
async function deleteVersion(versionId) {
  const p = STATE;
  if (!p) return false;
  const live = mergedVersionsFor(p.id).filter(e => !e.archived || e.id === versionId);
  if (live.length <= 1) { toast('A subject always keeps at least one version'); return false; }
  const local = versionStore()[versionId];
  const row = manifestVersionRows(p.id).find(r => r.id === versionId);
  const fileId = (local && local.versionDrive.fileId) || (row && row.fileId) || '';
  const wasOpen = CURRENT_VERSION && CURRENT_VERSION.versionId === versionId;
  if (wasOpen) {
    if (typeof cancelAutoPush === 'function') cancelAutoPush();
    const next = mergedVersionsFor(p.id).find(e => e.id !== versionId && !e.archived);
    if (next) await switchVersion(next.id);
    if (CURRENT_VERSION && CURRENT_VERSION.versionId === versionId) return false;
  }
  if (fileId && driveConnected()) {
    try {
      await driveRaw('/drive/v3/files/' + fileId + '?supportsAllDrives=true', {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ trashed: true }) });
    } catch (e) { toast('Could not move the version file to Drive trash: ' + (e.message || e)); return false; }
  }
  delete versionStore()[versionId];
  Object.keys(STORE.currentVersionByProperty).forEach(k => { if (STORE.currentVersionByProperty[k] === versionId) delete STORE.currentVersionByProperty[k]; });
  saveStore();
  await writeVersionRow({ versionId }, rows => { const i = rows.findIndex(x => x.id === versionId); if (i >= 0) rows.splice(i, 1); });
  renderVersionStrip();
  return true;
}

function dropLocalVersionsFor(propertyId) {
  Object.keys(versionStore()).forEach(id => { if (versionStore()[id].propertyId === propertyId) delete versionStore()[id]; });
  delete STORE.currentVersionByProperty[propertyId];
  if (CURRENT_VERSION && CURRENT_VERSION.propertyId === propertyId) CURRENT_VERSION = null;
}

// ---------------------------------------------------------- UI
function promptNewVersion() {
  const p = STATE;
  if (!p) return;
  const name = promptUniqueVersionName(p.id, 'Name this version (e.g. "Conservative", "Elan v2"):');
  if (name === null) return;
  const cur = (CURRENT_VERSION && CURRENT_VERSION.label) || 'the current version';
  const choice = prompt('Start "' + name + '" from:\n\n1. ' + cur + '’s comps and market rents (recommended)\n2. Blank (no comps, no market-rent overrides)\n\nEnter 1-2:', '1');
  if (choice === null) return;
  createVersion(name, { blank: String(choice).trim() === '2' });
  renderCurrentPhase();
  toast('Created version "' + name + '"');
}
function versionMenu(versionId) {
  const e = mergedVersionsFor(STATE.id).find(x => x.id === versionId);
  if (!e) return;
  const choice = prompt('"' + e.label + '"\n\n1. Rename\n2. Copy (same comps and market rents, new name)\n3. '
    + (e.archived ? 'Unarchive' : 'Archive') + '\n4. Delete (for everyone; the file goes to Drive trash)\n\nEnter 1-4:');
  if (choice === '1') {
    if (!e.local) { toast('Open that version first, then rename it'); return; }
    const n = promptUniqueVersionName(STATE.id, 'New name for this version:', e.label, versionId);
    if (n !== null) renameVersion(versionId, n);
  } else if (choice === '2') {
    copyVersion(versionId);
  } else if (choice === '3') {
    if (!e.local) { toast('Open that version first, then archive it'); return; }
    setVersionArchived(versionId, !e.archived);
    toast(e.archived ? 'Restored "' + e.label + '"' : 'Archived "' + e.label + '"');
  } else if (choice === '4') {
    if (confirm('Delete version "' + e.label + '" for everyone?\n\nIts file moves to the Drive trash (restorable there for 30 days). The other versions and the subject are not touched.')) {
      deleteVersion(versionId).then(ok => { if (ok) toast('Deleted "' + e.label + '"'); });
    }
  }
}
function manageVersionsMenu() {
  const list = mergedVersionsFor(STATE.id);
  if (!list.length) return;
  const pick = prompt('Versions of this subject (most recently edited first):\n\n'
    + list.map((e, i) => (i + 1) + '. ' + e.label + (e.archived ? ' (archived)' : '') + (CURRENT_VERSION && e.id === CURRENT_VERSION.versionId ? '  ← open' : '')).join('\n')
    + '\n\nEnter 1-' + list.length + ':', '1');
  const i = parseInt(pick, 10);
  if (i >= 1 && i <= list.length) versionMenu(list[i - 1].id);
}

/** The pill strip above tabs 2-4 (the version-held tabs). */
function renderVersionStrip() {
  const host = document.getElementById('version-strip');
  if (!host) return;
  if (!STATE || typeof CURRENT_PHASE === 'undefined' || CURRENT_PHASE === 1) { host.classList.add('hidden'); host.innerHTML = ''; return; }
  host.classList.remove('hidden');
  const list = mergedVersionsFor(STATE.id);
  const live = list.filter(e => !e.archived || (CURRENT_VERSION && e.id === CURRENT_VERSION.versionId));
  const curId = CURRENT_VERSION && CURRENT_VERSION.versionId;
  const pills = live.map(e => {
    const active = e.id === curId;
    const who = e.row && e.row.currentEditor && e.row.currentEditor !== meEmail() && e.row.currentEditorHeartbeatAt
      && (Date.now() - new Date(e.row.currentEditorHeartbeatAt).getTime()) < HEARTBEAT_STALE_MS ? e.row.currentEditor : '';
    const tip = (active ? 'Open now: click to rename, copy, archive or delete' : 'Switch to “' + e.label + '”')
      + (e.edited ? ' · edited ' + relTime(e.edited) : '') + (who ? ' · ' + who + ' is in it' : '');
    return `<button type="button" class="vpill${active ? ' on' : ''}" data-vid="${esc(e.id)}" title="${esc(tip)}">${esc(e.label)}${who ? ' <span class="vdot" aria-hidden="true">●</span>' : ''}</button>`;
  }).join('');
  const hasMore = list.length > 1 || list.some(e => e.archived);
  host.innerHTML = `<span class="vlab" title="Each version has its own comps and market rents. The subject, its unit mix and leases are shared by all versions.">Version</span>${pills}
    <button type="button" class="vpill vnew" data-vnew="1" title="Create a new version of the comps and market rents">+ New version</button>
    ${hasMore ? '<button type="button" class="vpill vmgr" data-vmgr="1" title="Rename, copy, archive or delete a version">⚙ Manage</button>' : ''}`;
}
function wireVersionStrip() {
  const host = document.getElementById('version-strip');
  if (!host || host.__wired) return;
  host.__wired = true;
  host.addEventListener('click', ev => {
    const b = ev.target.closest('button');
    if (!b || !STATE) return;
    if (b.hasAttribute('data-vnew')) return promptNewVersion();
    if (b.hasAttribute('data-vmgr')) return manageVersionsMenu();
    const id = b.getAttribute('data-vid');
    if (!id) return;
    if (CURRENT_VERSION && id === CURRENT_VERSION.versionId) versionMenu(id);
    else switchVersion(id);
  });
}

/** The open version, as the exports name it (2026-11-25). null when versions are not in play. */
function exportVersionInfo() {
  const v = CURRENT_VERSION;
  if (!v || !STATE || v.propertyId !== STATE.id) return null;
  return {
    id: v.versionId, label: v.label || 'Original',
    last_edited: v.versionUpdated || '', last_editor: v.versionLastEditor || '',
    created_by: v.versionCreatedBy || '', file_name: v.versionDrive.fileName || '',
    versions_of_subject: Math.max(1, versionCountFor(STATE.id)),
  };
}
/** "Elan v2" -> "_Elan_v2" for file names; '' when versions are not in play. */
function exportVersionSlug() {
  const x = exportVersionInfo();
  return x ? '_' + String(x.label).replace(/[^a-z0-9]+/gi, '_').replace(/^_+|_+$/g, '') : '';
}

/** Home card: the counts of the version this device would open. */
function homeVersionView(p) {
  const vs = versionsOf(p.id);
  if (!vs.length) return p;
  const rem = STORE.currentVersionByProperty && STORE.currentVersionByProperty[p.id];
  const v = (rem && versionStore()[rem]) || vs.sort((a, b) => String(b.versionUpdated || '').localeCompare(String(a.versionUpdated || '')))[0];
  const o = Object.assign({}, p);
  VERSION_FIELDS.forEach(k => { o[k] = v[k]; });
  o._versionLabel = v.label;
  return o;
}
