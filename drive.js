/* ============================================================================
   Rent Comps Tracker — drive.js
   Google OAuth (GIS), Drive I/O, deal-folder linking, Drive-authoritative
   sync, the org-wide manifest, and shared-secret resolution.

   Drive is the source of truth; localStorage is a transient cache. Edits
   auto-push on a ~2s debounce; a 60s tick is a backstop plus the presence
   heartbeat. There is no manual Save — only "Re-sync from Drive" recovery.
   ========================================================================= */

'use strict';

// OAuth client is shared with the other SHIR applets (same Cloud project,
// consent screen = Internal, which covers all four company domains).
// NOTE: this origin must be added to the client's Authorized JavaScript
// origins before sign-in will work from rent-comps-tracker.pages.dev.
const GOOGLE_CLIENT_ID = '434286194253-gjfctl5vkdgvfk5vve9r272o7mr2n82q.apps.googleusercontent.com';
const DRIVE_SCOPE = 'https://www.googleapis.com/auth/drive';

// This applet's OWN Drive folder (APPLETS/Rent Comps Tracker) doubles as the
// org sync folder — separate database from Capex Builder by construction.
const SYNC_FOLDER_ID   = '1BNTmunNrE-firtH-EbTa14VyOAhTeqN0';
const MANIFEST_FILENAME = 'rent_comps_manifest.json';
const CONFIG_FILENAME   = 'rent_comps_config.json';

const SYNC_INTERVAL_MS    = 60_000;
const HEARTBEAT_STALE_MS  = 2.5 * 60_000;
const AUTO_PUSH_DEBOUNCE_MS = 2_000;

// Per-deal dated backups of the property JSON, kept alongside the live file
// inside the deal's "3. Comps" folder. The live `rent_comps.json` is overwritten
// on every push, so without these the only history is Drive's own file versions.
const BACKUP_FOLDER = 'Backups';
const BACKUP_MIN_INTERVAL_MS = 6 * 60 * 60 * 1000;  // at most one write per 6 h
const BACKUP_KEEP = 40;                             // prune oldest beyond this

// Defence-in-depth mirror of the Workspace domains.
const ALLOWED_EMAIL_DOMAINS = [
  'shircapital.com',
  'pghnexus.com',
  'signaturenexus.com',
  'avasconstruction.com',
];

const DEAL_PIPELINE_FOLDERS = [
  { name: '0_Under Contract',                   id: '1IrPlaRICRzdqN7SmG_ShDkSnCP0g7tHL' },
  { name: '1_PIPELINE (MAIN)',                  id: '104S0wT09iDs3EWnZoWQrf7IWaw6zqsbd' },
  { name: '4_Brokered Pipeline',                id: '1_t3k60rmSWJY3aXYAMIgn6SjFRE1tg-R' },
  { name: '4_ExStay Conv (Brokered) Pipeline',  id: '1_IiLYMEtGMptdzS50hFXRFz9nK5JB7f9' },
  { name: '4_PROSPECTS (OFF Mkt)',              id: '1xCcCTPP2qLhUapPiQT1h2TQxnLL3nAdH' },
];

let CURRENT_USER = null;
let TOKEN_CLIENT = null;
let MANIFEST_CACHE = null;
let SYNC_INTERVAL_ID = null;
let HOME_INDEX_LOADING = false;
let _autoPushTimer = null;
let SHARED_CONFIG_CACHE = null;   // null = not fetched yet

try {
  const cached = localStorage.getItem(CURRENT_USER_KEY);
  if (cached) CURRENT_USER = JSON.parse(cached);
} catch (e) { /* ignore */ }

// ------------------------------------------------------------------- tokens
function getDriveToken() {
  const tok = localStorage.getItem(DRIVE_TOKEN_KEY);
  const exp = Number(localStorage.getItem(DRIVE_TOKEN_EXP_KEY) || 0);
  return tok && exp > Date.now() ? tok : null;
}
function setDriveToken(tok, expiresInSec) {
  localStorage.setItem(DRIVE_TOKEN_KEY, tok);
  localStorage.setItem(DRIVE_TOKEN_EXP_KEY, String(Date.now() + (expiresInSec - 60) * 1000));
}
function clearDriveToken() {
  localStorage.removeItem(DRIVE_TOKEN_KEY);
  localStorage.removeItem(DRIVE_TOKEN_EXP_KEY);
}
function driveConnected() { return !!getDriveToken(); }

function isAllowedEmail(email) {
  if (!email || email.indexOf('@') < 0) return false;
  return ALLOWED_EMAIL_DOMAINS.includes(email.split('@').pop().trim().toLowerCase());
}

function updateDriveStatus() {
  const s = $('#drive-status');
  if (!s) return;
  if (CURRENT_USER && driveConnected()) {
    s.textContent = 'Connected — ' + CURRENT_USER.email;
  } else if (driveConnected()) {
    s.textContent = 'Connected';
  } else {
    s.textContent = 'Not connected';
  }
  const b = $('#btn-drive-connect');
  if (b) b.textContent = driveConnected() ? 'Reconnect Google Drive' : 'Connect Google Drive';
}

function loadGis() {
  if (window.google && window.google.accounts && window.google.accounts.oauth2) {
    return Promise.resolve();
  }
  return new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = 'https://accounts.google.com/gsi/client';
    s.async = true;
    s.onload = resolve;
    s.onerror = () => reject(new Error('Could not load Google sign-in'));
    document.head.appendChild(s);
  });
}

async function ensureTokenClient() {
  await loadGis();
  if (TOKEN_CLIENT) return TOKEN_CLIENT;
  TOKEN_CLIENT = google.accounts.oauth2.initTokenClient({
    client_id: GOOGLE_CLIENT_ID,
    scope: DRIVE_SCOPE,
    callback: () => {},   // replaced per-request
  });
  return TOKEN_CLIENT;
}

/**
 * Ask GIS for an access token.
 *
 * ⚠️ GIS opens a popup, and a popup not triggered by a user gesture is blocked
 * by the browser. When that happens GIS logs "Failed to open popup window" and
 * — unless `error_callback` is wired — invokes NOTHING, so a bare promise here
 * would never settle. `boot()` awaits this, so an unsettled promise silently
 * skipped deep-link opening, reconcileFromDrive and startAutoSync on every load
 * with an expired token. Hence both the error_callback and the hard timeout.
 */
const TOKEN_REQUEST_TIMEOUT_MS = 30_000;

function requestToken(prompt) {
  return new Promise(async (resolve, reject) => {
    let settled = false;
    const done = (fn, arg) => { if (!settled) { settled = true; clearTimeout(timer); fn(arg); } };
    const timer = setTimeout(
      () => done(reject, new Error('Google sign-in did not respond (popup blocked?)')),
      TOKEN_REQUEST_TIMEOUT_MS
    );
    try {
      const client = await ensureTokenClient();
      client.callback = (resp) => {
        if (resp && resp.access_token) {
          setDriveToken(resp.access_token, Number(resp.expires_in || 3600));
          done(resolve, resp.access_token);
        } else {
          done(reject, new Error((resp && resp.error) || 'Authorization failed'));
        }
      };
      client.error_callback = (err) => {
        done(reject, new Error((err && (err.type || err.message)) || 'Sign-in was cancelled'));
      };
      client.requestAccessToken({ prompt: prompt || '' });
    } catch (e) { done(reject, e); }
  });
}

async function revokeDriveAccess() {
  const tok = localStorage.getItem(DRIVE_TOKEN_KEY);
  clearDriveToken();
  CURRENT_USER = null;
  localStorage.removeItem(CURRENT_USER_KEY);
  try {
    if (tok && window.google && google.accounts && google.accounts.oauth2) {
      google.accounts.oauth2.revoke(tok, () => {});
    }
  } catch (e) { /* best effort */ }
}

async function fetchCurrentUser() {
  const r = await driveFetch('/drive/v3/about?fields=user');
  const u = (r && r.user) || {};
  if (!isAllowedEmail(u.emailAddress)) {
    await revokeDriveAccess();
    const err = new Error('This app is limited to SHIR Capital accounts.');
    err.code = 'ACCESS_DENIED';
    throw err;
  }
  CURRENT_USER = { email: u.emailAddress, name: u.displayName, photoLink: u.photoLink };
  localStorage.setItem(CURRENT_USER_KEY, JSON.stringify(CURRENT_USER));
  return CURRENT_USER;
}

async function driveConnect(opts) {
  try {
    await requestToken(driveConnected() ? '' : 'consent');
    await fetchCurrentUser();
    localStorage.setItem(DRIVE_EVER_CONNECTED_KEY, '1');
    updateDriveStatus();
    SHARED_CONFIG_CACHE = null;
    if (!(opts && opts.quiet)) toast('Drive connected — ' + CURRENT_USER.email);
    if (typeof refreshHomeIndex === 'function') refreshHomeIndex();
    return true;
  } catch (e) {
    if (e && e.code === 'ACCESS_DENIED') {
      updateDriveStatus();
      alert(e.message);
    } else if (!(opts && opts.quiet)) {
      toast('Drive connect failed: ' + (e.message || e));
    }
    return false;
  }
}

/** Silent refresh on load if the user has connected before. */
async function driveSilentResume() {
  if (driveConnected()) { updateDriveStatus(); return true; }
  if (!localStorage.getItem(DRIVE_EVER_CONNECTED_KEY)) return false;
  try {
    await requestToken('');
    await fetchCurrentUser();
    updateDriveStatus();
    return true;
  } catch (e) {
    updateDriveStatus();
    return false;
  }
}

// ---------------------------------------------------------------- Drive I/O
async function driveRaw(path, init) {
  const tok = getDriveToken();
  if (!tok) throw new Error('Google Drive is not connected');
  const opts = Object.assign({}, init || {});
  opts.headers = Object.assign({ Authorization: 'Bearer ' + tok }, opts.headers || {});
  const res = await fetch('https://www.googleapis.com' + path, opts);
  if (res.status === 401) {
    clearDriveToken();
    throw new Error('Drive session expired — reconnect from the ☰ menu');
  }
  if (!res.ok) {
    let detail = '';
    try { detail = (await res.json()).error.message; } catch (e) { detail = res.statusText; }
    throw new Error('Drive ' + res.status + ': ' + detail);
  }
  return res;
}

async function driveFetch(path, init) {
  const res = await driveRaw(path, init);
  const txt = await res.text();
  return txt ? JSON.parse(txt) : null;
}

const Q = encodeURIComponent;

/** List children matching a Drive query, paginated. */
async function driveList(q, fields) {
  const all = [];
  let pageToken = '';
  const f = fields || 'id,name,mimeType,modifiedTime,size';
  do {
    const path = '/drive/v3/files?q=' + Q(q)
      + '&fields=' + Q('nextPageToken,files(' + f + ')')
      + '&pageSize=200&supportsAllDrives=true&includeItemsFromAllDrives=true'
      + (pageToken ? '&pageToken=' + Q(pageToken) : '');
    const r = await driveFetch(path);
    (r.files || []).forEach(x => all.push(x));
    pageToken = r.nextPageToken || '';
  } while (pageToken);
  return all;
}

function listSubfolders(parentId) {
  return driveList(`'${parentId}' in parents and mimeType='application/vnd.google-apps.folder' and trashed=false`, 'id,name');
}
function listFiles(parentId) {
  return driveList(`'${parentId}' in parents and trashed=false`, 'id,name,mimeType,modifiedTime,size');
}

/** Find a subfolder by name under parent, creating it if absent. */
/* Two concurrent callers (e.g. the auto-push debounce and a backup, right after
   linkDealFolder) can both list-then-create the same subfolder and leave a
   duplicate on Drive. Memoize the in-flight promise per parent+name so
   concurrent ensures share one create. */
const ENSURE_INFLIGHT = new Map();

async function driveEnsureSubfolder(parentId, name) {
  const key = parentId + '/' + name;
  if (ENSURE_INFLIGHT.has(key)) return ENSURE_INFLIGHT.get(key);
  const job = (async () => {
    const safe = name.replace(/'/g, "\\'");
    const hits = await driveList(
      `'${parentId}' in parents and name='${safe}' and mimeType='application/vnd.google-apps.folder' and trashed=false`,
      'id,name'
    );
    if (hits.length) return hits[0].id;
    const created = await driveFetch('/drive/v3/files?fields=id&supportsAllDrives=true', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name,
        mimeType: 'application/vnd.google-apps.folder',
        parents: [parentId],
      }),
    });
    return created.id;
  })();
  ENSURE_INFLIGHT.set(key, job);
  try {
    return await job;
  } finally {
    ENSURE_INFLIGHT.delete(key);
  }
}

async function driveGetMeta(fileId, fields) {
  return driveFetch('/drive/v3/files/' + fileId
    + '?fields=' + Q(fields || 'id,name,modifiedTime,size')
    + '&supportsAllDrives=true');
}

async function driveDownloadText(fileId) {
  const res = await driveRaw('/drive/v3/files/' + fileId + '?alt=media&supportsAllDrives=true');
  return res.text();
}
async function driveDownloadBuffer(fileId) {
  const res = await driveRaw('/drive/v3/files/' + fileId + '?alt=media&supportsAllDrives=true');
  return res.arrayBuffer();
}

/** Multipart create-or-update. Returns {id, modifiedTime}. */
async function driveUpload(parentId, name, mimeType, body, existingFileId) {
  const boundary = 'rcb' + Math.random().toString(36).slice(2);
  const meta = existingFileId ? { name } : { name, parents: [parentId] };
  const head = `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n`
    + JSON.stringify(meta)
    + `\r\n--${boundary}\r\nContent-Type: ${mimeType}\r\n\r\n`;
  const tail = `\r\n--${boundary}--`;

  let payload;
  if (typeof body === 'string') {
    payload = new Blob([head, body, tail], { type: 'multipart/related; boundary=' + boundary });
  } else {
    payload = new Blob([head, body, tail], { type: 'multipart/related; boundary=' + boundary });
  }

  const path = '/upload/drive/v3/files' + (existingFileId ? '/' + existingFileId : '')
    + '?uploadType=multipart&fields=id,modifiedTime&supportsAllDrives=true';
  return driveFetch(path, {
    method: existingFileId ? 'PATCH' : 'POST',
    headers: { 'Content-Type': 'multipart/related; boundary=' + boundary },
    body: payload,
  });
}

function driveUploadJson(parentId, name, obj, existingFileId) {
  return driveUpload(parentId, name, 'application/json', JSON.stringify(obj, null, 2), existingFileId);
}
function driveUploadBinary(parentId, name, arrayBuffer, mimeType, existingFileId) {
  return driveUpload(parentId, name, mimeType || 'application/octet-stream',
    new Blob([arrayBuffer]), existingFileId);
}

// -------------------------------------------------- shared org-wide secrets
async function loadSharedConfig(force) {
  if (SHARED_CONFIG_CACHE && !force) return SHARED_CONFIG_CACHE;
  if (!driveConnected()) return {};
  try {
    const hits = await driveList(
      `'${SYNC_FOLDER_ID}' in parents and name='${CONFIG_FILENAME}' and trashed=false`, 'id,name');
    if (!hits.length) { SHARED_CONFIG_CACHE = {}; return SHARED_CONFIG_CACHE; }
    SHARED_CONFIG_CACHE = JSON.parse(await driveDownloadText(hits[0].id)) || {};
    SHARED_CONFIG_CACHE._fileId = hits[0].id;
  } catch (e) {
    console.warn('shared config load failed', e);
    SHARED_CONFIG_CACHE = {};
  }
  return SHARED_CONFIG_CACHE;
}

async function saveSharedConfigKey(key, value) {
  const cfg = await loadSharedConfig(true);
  const fileId = cfg._fileId;
  const out = Object.assign({}, cfg);
  delete out._fileId;
  out[key] = value;
  const r = await driveUploadJson(SYNC_FOLDER_ID, CONFIG_FILENAME, out, fileId);
  SHARED_CONFIG_CACHE = Object.assign(out, { _fileId: r.id });
  return r;
}

function getHelloDataKey() { return localStorage.getItem(HELLODATA_KEY_STORAGE) || ''; }
async function resolveHelloDataKey() {
  const personal = getHelloDataKey();
  if (personal) return personal;
  const cfg = await loadSharedConfig();
  return cfg.hellodata_api_key || '';
}

// ------------------------------------------------- deal-folder link + paths
/**
 * Search the 5 deal pipelines for a folder matching `name`.
 * Scores exact 100 / startsWith 85 / contains 70 / token-overlap <=60, with a
 * small boost when the city/state prefix also matches.
 */
async function findDealFolderCandidates(name, city, state) {
  const want = normalizeName(name);
  const wantTokens = want.split(' ').filter(Boolean);
  const cityTok = normalizeName(city);
  const stTok = normalizeName(state);
  const out = [];

  for (const pipe of DEAL_PIPELINE_FOLDERS) {
    let folders;
    try { folders = await listSubfolders(pipe.id); }
    catch (e) { console.warn('pipeline read failed', pipe.name, e); continue; }
    folders.forEach(f => {
      const got = normalizeName(f.name);
      let score = 0;
      if (got === want) score = 100;
      else if (got.startsWith(want) || want.startsWith(got)) score = 85;
      else if (got.includes(want) || want.includes(got)) score = 70;
      else {
        const gotTokens = got.split(' ').filter(Boolean);
        const hits = wantTokens.filter(t => t.length > 2 && gotTokens.includes(t)).length;
        if (hits) score = Math.min(60, Math.round((hits / Math.max(1, wantTokens.length)) * 60));
      }
      if (!score) return;
      if (cityTok && got.includes(cityTok)) score += 4;
      if (stTok && got.includes(' ' + stTok + ' ')) score += 2;
      out.push({ id: f.id, name: f.name, pipelineName: pipe.name, score });
    });
  }
  out.sort((a, b) => b.score - a.score);
  return out;
}

function extractFolderId(input) {
  const s = String(input || '').trim();
  const m = s.match(/[-\w]{25,}/);
  return m ? m[0] : '';
}

/** Ensure <deal>/3. Comps/Rent Comps Tracker exists; cache both ids. */
async function ensureTrackerFolder(p) {
  if (!p.drive.folderId) throw new Error('No deal folder linked');
  if (!p.drive.compsFolderId) {
    p.drive.compsFolderId = await driveEnsureSubfolder(p.drive.folderId, COMPS_FOLDER);
  }
  if (!p.drive.trackerFolderId) {
    p.drive.trackerFolderId = await driveEnsureSubfolder(p.drive.compsFolderId, TRACKER_FOLDER);
  }
  return p.drive.trackerFolderId;
}

async function linkDealFolder(p, folderId, folderName, pipelineName) {
  p.drive.folderId = folderId;
  p.drive.folderName = folderName || '';
  p.drive.pipelineName = pipelineName || '';
  p.drive.compsFolderId = '';
  p.drive.trackerFolderId = '';
  p.drive.fileId = '';
  if (!folderName) {
    try {
      const meta = await driveGetMeta(folderId, 'id,name');
      p.drive.folderName = meta.name;
    } catch (e) { /* leave blank */ }
  }
  saveState();
  await ensureTrackerFolder(p);
  saveState();
  return p.drive.folderName;
}

// ------------------------------------------------------------- push / pull
/** The JSON body written to Drive. Excludes nothing — it IS the record. */
function serializeProperty(p) {
  const out = JSON.parse(JSON.stringify(p));
  out._app = 'rent-comps-tracker';
  out._schemaVersion = STORE_VERSION;
  return out;
}

let PUSH_IN_FLIGHT = false;

async function pushToDrive(opts) {
  const silent = !!(opts && opts.silent);
  if (!STATE) return false;
  // A deleted property must never be resurrected by a late push, even if this
  // call was already queued when the delete happened.
  if (!STORE.properties[STATE.id]) return false;
  if (!driveConnected()) { if (!silent) toast('Connect Google Drive first'); return false; }
  if (!STATE.drive.folderId) { if (!silent) toast('Link a Drive deal folder first'); return false; }
  if (PUSH_IN_FLIGHT) return false;

  PUSH_IN_FLIGHT = true;
  try {
    const folder = await ensureTrackerFolder(STATE);

    // Locate the remote file if we do not have its id cached.
    if (!STATE.drive.fileId) {
      const hits = await driveList(
        `'${folder}' in parents and name='${STATE_FILENAME}' and trashed=false`, 'id,name,modifiedTime');
      if (hits.length) STATE.drive.fileId = hits[0].id;
    }

    // Never auto-clobber a newer remote copy on a silent push.
    if (silent && STATE.drive.fileId) {
      try {
        const meta = await driveGetMeta(STATE.drive.fileId, 'id,modifiedTime');
        const known = STATE.drive.remoteModifiedTime;
        if (known && meta.modifiedTime > known) {
          console.warn('silent push skipped — remote is newer');
          return false;
        }
      } catch (e) { /* fall through and write */ }
    }

    const r = await driveUploadJson(folder, STATE_FILENAME, serializeProperty(STATE), STATE.drive.fileId);
    STATE.drive.fileId = r.id;
    STATE.drive.lastPushed = nowISO();
    STATE.drive.remoteModifiedTime = r.modifiedTime || nowISO();
    saveStore();
    await upsertManifestEntry(STATE);
    // Dated backup, throttled. Never allowed to fail the save.
    try { await writeBackup(STATE, { force: !silent && !!(opts && opts.forceBackup) }); }
    catch (e) { console.warn('backup skipped', e); }
    if (!silent) toast('Saved to Drive');
    updateSyncStatus();
    return true;
  } catch (e) {
    console.error('pushToDrive', e);
    if (!silent) toast('Save failed: ' + (e.message || e));
    return false;
  } finally {
    PUSH_IN_FLIGHT = false;
  }
}

/**
 * Write a dated backup of the property JSON into
 *   <deal>/3. Comps/Rent Comps Tracker/Backups/rent_comps_<slug>_<YYYY-MM-DD>.json
 *
 * One file per calendar day per property: repeat pushes on the same day update
 * that day's file rather than piling up hundreds of copies (auto-push fires on a
 * 2 s debounce, so anything per-push would be unusable). Writes are additionally
 * throttled to BACKUP_MIN_INTERVAL_MS so a long editing session does not
 * re-upload constantly, and the folder is pruned to BACKUP_KEEP newest files.
 *
 * Returns true if a file was written. Callers must treat failure as non-fatal —
 * a backup problem must never stop the live save from succeeding.
 */
async function writeBackup(p, opts) {
  const force = !!(opts && opts.force);
  if (!p || !driveConnected() || !p.drive.folderId) return false;

  const today = todayISO();
  const last = p.drive.lastBackupAt;
  if (!force && last) {
    const sameDay = String(last).slice(0, 10) === today;
    const fresh = (Date.now() - new Date(last).getTime()) < BACKUP_MIN_INTERVAL_MS;
    if (sameDay && fresh) return false;
  }

  await ensureTrackerFolder(p);
  const folder = await driveEnsureSubfolder(p.drive.trackerFolderId, BACKUP_FOLDER);
  p.drive.backupFolderId = folder;

  const name = `rent_comps_${propertySlug(p)}_${today}.json`;
  const safe = name.replace(/'/g, "\\'");
  const hits = await driveList(
    `'${folder}' in parents and name='${safe}' and trashed=false`, 'id,name');
  await driveUploadJson(folder, name, serializeProperty(p), hits.length ? hits[0].id : undefined);

  p.drive.lastBackupAt = nowISO();
  saveStore();

  await pruneBackups(folder);
  return true;
}

/** Keep the newest BACKUP_KEEP dated backups; trash the rest. */
async function pruneBackups(folderId) {
  try {
    const files = await driveList(
      `'${folderId}' in parents and trashed=false`, 'id,name,modifiedTime');
    if (files.length <= BACKUP_KEEP) return;
    // Filenames end in the ISO date, so a plain name sort is chronological.
    files.sort((a, b) => String(b.name).localeCompare(String(a.name)));
    for (const f of files.slice(BACKUP_KEEP)) {
      await driveRaw('/drive/v3/files/' + f.id + '?supportsAllDrives=true', { method: 'DELETE' });
    }
  } catch (e) {
    console.warn('pruneBackups', e);
  }
}

function scheduleAutoPush() {
  if (!STATE || !STATE.drive.folderId || !driveConnected()) return;
  clearTimeout(_autoPushTimer);
  _autoPushTimer = setTimeout(() => { pushToDrive({ silent: true }); }, AUTO_PUSH_DEBOUNCE_MS);
}

/**
 * Drop any pending debounced push.
 *
 * Must be called before deleting a property. Otherwise an in-flight
 * `scheduleAutoPush` timer fires during `removeManifestEntry`'s awaits and
 * re-upserts the entry it just removed — the property reappears on the home
 * screen as a remote `☁` card seconds after being deleted. Caught by the live
 * sync test on 2026-08-03.
 */
function cancelAutoPush() {
  clearTimeout(_autoPushTimer);
  _autoPushTimer = null;
}

function deviceIsDirty() {
  if (!STATE) return false;
  const pushed = STATE.drive.lastPushed;
  if (!pushed) return true;
  return String(STATE.updated || '') > String(pushed);
}

async function pullFromDrive(opts) {
  const silent = !!(opts && opts.silent);
  if (!STATE) return false;
  if (!driveConnected()) { if (!silent) toast('Connect Google Drive first'); return false; }
  if (!STATE.drive.folderId) { if (!silent) toast('No Drive deal folder linked'); return false; }

  if (!silent && deviceIsDirty()) {
    const ok = confirm('This device has edits that have not reached Drive yet.\n\n'
      + 'Re-syncing will REPLACE them with the Drive copy. Continue?');
    if (!ok) return false;
  }

  try {
    const folder = await ensureTrackerFolder(STATE);
    let fileId = STATE.drive.fileId;
    if (!fileId) {
      const hits = await driveList(
        `'${folder}' in parents and name='${STATE_FILENAME}' and trashed=false`, 'id,name,modifiedTime');
      if (!hits.length) { if (!silent) toast('Nothing on Drive for this property yet'); return false; }
      fileId = hits[0].id;
    }
    const txt = await driveDownloadText(fileId);
    const remote = JSON.parse(txt);
    const meta = await driveGetMeta(fileId, 'id,modifiedTime');

    // Keep our local id + Drive pointers; adopt everything else.
    const localId = STATE.id;
    const keepDrive = Object.assign({}, STATE.drive, {
      fileId,
      lastPulled: nowISO(),
      remoteModifiedTime: meta.modifiedTime,
      lastPushed: meta.modifiedTime,
    });
    const merged = hydrateProperty(Object.assign({}, remote, { id: localId, drive: keepDrive }));
    STORE.properties[localId] = merged;
    STATE = merged;
    saveStore();
    if (!silent) toast('Re-synced from Drive');
    if (typeof renderCurrentPhase === 'function') renderCurrentPhase();
    updateSyncStatus();
    return true;
  } catch (e) {
    console.error('pullFromDrive', e);
    if (!silent) toast('Re-sync failed: ' + (e.message || e));
    return false;
  }
}

/**
 * On open: if the device has no unsynced edits and Drive holds a newer copy,
 * adopt Drive silently. Drive wins.
 */
async function reconcileFromDrive() {
  if (!STATE || !driveConnected() || !STATE.drive.folderId) return;
  try {
    let fileId = STATE.drive.fileId;
    if (!fileId) {
      const folder = await ensureTrackerFolder(STATE);
      const hits = await driveList(
        `'${folder}' in parents and name='${STATE_FILENAME}' and trashed=false`, 'id,name,modifiedTime');
      if (!hits.length) return;
      fileId = hits[0].id;
      STATE.drive.fileId = fileId;
    }
    const meta = await driveGetMeta(fileId, 'id,modifiedTime');
    const known = STATE.drive.remoteModifiedTime;
    const remoteIsNewer = !known || meta.modifiedTime > known;
    if (remoteIsNewer && !deviceIsDirty()) {
      await pullFromDrive({ silent: true });
      toast('Loaded the latest copy from Drive');
    } else if (remoteIsNewer && deviceIsDirty()) {
      showSyncBar('⚠️ Drive has a newer copy of this property and this device has '
        + 'unsynced edits. Use ☰ → Re-sync from Drive to take the Drive version.');
    }
  } catch (e) {
    console.warn('reconcileFromDrive', e);
  }
}

function updateSyncStatus() {
  const s = $('#sync-status');
  if (!s || !STATE) return;
  if (!STATE.drive.folderId) { s.textContent = 'No Drive folder linked.'; return; }
  s.textContent = 'Last saved to Drive ' + relTime(STATE.drive.lastPushed)
    + (deviceIsDirty() ? ' · unsynced edits pending' : '')
    + ' · last backup ' + relTime(STATE.drive.lastBackupAt);
}

function showSyncBar(html) {
  const bar = $('#sync-bar');
  if (!bar) return;
  bar.innerHTML = html;
  bar.classList.remove('hidden');
}
function hideSyncBar() {
  const bar = $('#sync-bar');
  if (bar) bar.classList.add('hidden');
}

// ----------------------------------------------------------------- manifest
async function fetchManifest(force) {
  if (!driveConnected()) return null;
  if (MANIFEST_CACHE && !force) return MANIFEST_CACHE;
  try {
    let fileId = localStorage.getItem(MANIFEST_FILE_ID_KEY) || '';
    if (!fileId) {
      const hits = await driveList(
        `'${SYNC_FOLDER_ID}' in parents and name='${MANIFEST_FILENAME}' and trashed=false`, 'id,name');
      if (hits.length) {
        fileId = hits[0].id;
        localStorage.setItem(MANIFEST_FILE_ID_KEY, fileId);
      }
    }
    if (!fileId) { MANIFEST_CACHE = { fileId: '', data: { properties: [] } }; return MANIFEST_CACHE; }
    const data = JSON.parse(await driveDownloadText(fileId)) || {};
    if (!Array.isArray(data.properties)) data.properties = [];
    MANIFEST_CACHE = { fileId, data };
    return MANIFEST_CACHE;
  } catch (e) {
    console.warn('fetchManifest', e);
    return MANIFEST_CACHE;
  }
}

function manifestEntryFor(p) {
  const rents = marketRentTableSafe();
  return {
    id: p.id,
    name: p.name,
    slug: propertySlug(p),
    dealFolderId: p.drive.folderId || '',
    dealFolderName: p.drive.folderName || '',
    pipelineName: p.drive.pipelineName || '',
    trackerFileId: p.drive.fileId || '',
    lastModified: p.updated,
    lastEditor: p.lastEditor || (CURRENT_USER && CURRENT_USER.email) || '',
    currentEditor: (CURRENT_USER && CURRENT_USER.email) || '',
    currentEditorHeartbeatAt: nowISO(),
    compCount: (p.comps || []).length,
    directCompCount: (p.comps || []).filter(c => c.category === 'direct').length,
    subjectUnitTypes: (p.subjectUnitMix || []).length,
    bucketsPriced: rents.filter(r => r.effective > 0).length,
  };
}

/** marketRentTable() needs STATE; guard so manifest writes never throw. */
function marketRentTableSafe() {
  try { return marketRentTable(); } catch (e) { return []; }
}

async function upsertManifestEntry(p) {
  if (!driveConnected()) return;
  try {
    const m = await fetchManifest(true);
    if (!m) return;
    const entry = manifestEntryFor(p);
    const list = m.data.properties;
    const i = list.findIndex(x => x.id === entry.id);
    if (i >= 0) list[i] = Object.assign({}, list[i], entry);
    else list.push(entry);
    m.data.updatedAt = nowISO();
    const r = await driveUploadJson(SYNC_FOLDER_ID, MANIFEST_FILENAME, m.data, m.fileId || undefined);
    m.fileId = r.id;
    localStorage.setItem(MANIFEST_FILE_ID_KEY, r.id);
  } catch (e) {
    console.warn('upsertManifestEntry', e);
  }
}

async function removeManifestEntry(id) {
  if (!driveConnected()) return;
  try {
    const m = await fetchManifest(true);
    if (!m || !m.fileId) return;
    m.data.properties = m.data.properties.filter(x => x.id !== id);
    m.data.updatedAt = nowISO();
    await driveUploadJson(SYNC_FOLDER_ID, MANIFEST_FILENAME, m.data, m.fileId);
  } catch (e) {
    console.warn('removeManifestEntry', e);
  }
}

async function releaseEditorLock() {
  if (!STATE || !driveConnected()) return;
  try {
    const m = await fetchManifest(true);
    if (!m || !m.fileId) return;
    const e = m.data.properties.find(x => x.id === STATE.id);
    if (!e) return;
    if (e.currentEditor === ((CURRENT_USER && CURRENT_USER.email) || '')) {
      e.currentEditor = '';
      e.currentEditorHeartbeatAt = null;
      await driveUploadJson(SYNC_FOLDER_ID, MANIFEST_FILENAME, m.data, m.fileId);
    }
  } catch (e) { /* heartbeat goes stale on its own */ }
}

async function syncTick() {
  if (!STATE || !driveConnected()) return;
  try {
    if (deviceIsDirty()) await pushToDrive({ silent: true });

    const m = await fetchManifest(true);
    if (m) {
      const e = m.data.properties.find(x => x.id === STATE.id);
      const me = (CURRENT_USER && CURRENT_USER.email) || '';
      if (e && e.currentEditor && e.currentEditor !== me && e.currentEditorHeartbeatAt) {
        const age = Date.now() - new Date(e.currentEditorHeartbeatAt).getTime();
        if (age < HEARTBEAT_STALE_MS) {
          showSyncBar('⚠️ ' + esc(e.currentEditor) + ' is also editing this property (active '
            + esc(relTime(e.currentEditorHeartbeatAt)) + ') — your edits may overwrite theirs.');
        } else { hideSyncBar(); }
      } else { hideSyncBar(); }
    }
    await upsertManifestEntry(STATE);
    updateSyncStatus();
  } catch (e) {
    console.warn('syncTick', e);
  }
}

function startAutoSync() {
  stopAutoSync();
  if (!driveConnected()) return;
  SYNC_INTERVAL_ID = setInterval(syncTick, SYNC_INTERVAL_MS);
}
function stopAutoSync() {
  if (SYNC_INTERVAL_ID) clearInterval(SYNC_INTERVAL_ID);
  SYNC_INTERVAL_ID = null;
}

window.addEventListener('beforeunload', () => {
  stopAutoSync();
  releaseEditorLock();
});
