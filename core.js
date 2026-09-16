/* ============================================================================
   Rent Comps Tracker — core.js
   Utilities, localStorage store, hash routing, schema helpers, and every
   rent/market-rent computation. No DOM rendering and no network here.
   Load order: schema.js -> core.js -> drive.js -> ui.js -> export.js -> app.js
   ========================================================================= */

'use strict';

// ---------------------------------------------------------------- constants
const STORE_KEY               = 'rent_comps_store_v1';
const DRIVE_TOKEN_KEY         = 'rent_comps_drive_token';
const DRIVE_TOKEN_EXP_KEY     = 'rent_comps_drive_token_exp';
const CURRENT_USER_KEY        = 'rent_comps_current_user';
const DRIVE_EVER_CONNECTED_KEY = 'rent_comps_drive_ever_connected_v1';
const ONBOARDING_DISMISSED_KEY = 'rent_comps_onboarding_dismissed_v1';
const HELLODATA_KEY_STORAGE   = 'rent_comps_hellodata_key_v1';
const MANIFEST_FILE_ID_KEY    = 'rent_comps_manifest_file_id';
// Home-list sort, remembered per device (see HOME_SORT_FIELD / _DIR in ui.js).
const HOME_SORT_FIELD_KEY     = 'rent_comps_home_sort_field';
const HOME_SORT_DIR_KEY       = 'rent_comps_home_sort_dir';

const STATE_FILENAME  = 'rent_comps.json';
const COMPS_FOLDER    = '3. Comps';           // numbered deal subfolder
const TRACKER_FOLDER  = 'Rent Comps Tracker'; // our subfolder inside it

// Derived from wherever the app is actually served, NOT hardcoded — the shareable
// link in the export payload then stays correct whether this is on pages.dev,
// workers.dev, or a custom domain. Falls back to the canonical host only if
// `location` is somehow unavailable.
const APP_BASE_URL = (typeof location !== 'undefined' && location.origin)
  ? location.origin + '/'
  : 'https://rent-comps-tracker.pages.dev/';

const STORE_VERSION = 1;

// ------------------------------------------------------------- tiny helpers
const $  = (sel, root) => (root || document).querySelector(sel);
const $$ = (sel, root) => Array.from((root || document).querySelectorAll(sel));

function esc(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

/** Numeric coercion that treats '' / null / junk as 0. */
function num(v) {
  if (v === '' || v == null) return 0;
  const n = Number(String(v).replace(/[$,\s%]/g, ''));
  return Number.isFinite(n) ? n : 0;
}

/** Like num() but preserves "no value" as null so blanks stay blank. */
function numOrNull(v) {
  if (v === '' || v == null) return null;
  const n = Number(String(v).replace(/[$,\s%]/g, ''));
  return Number.isFinite(n) ? n : null;
}

function money(v, dp) {
  const n = num(v);
  return '$' + n.toLocaleString('en-US', {
    minimumFractionDigits: dp || 0, maximumFractionDigits: dp == null ? 0 : dp,
  });
}
function money2(v) { return money(v, 2); }
function int(v) { return Math.round(num(v)).toLocaleString('en-US'); }

function uid() {
  return 'x' + Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);
}
function nowISO() { return new Date().toISOString(); }
function todayISO() { return new Date().toISOString().slice(0, 10); }

function relTime(iso) {
  if (!iso) return 'never';
  const ms = Date.now() - new Date(iso).getTime();
  if (!Number.isFinite(ms)) return 'never';
  const m = Math.round(ms / 60000);
  if (m < 1) return 'just now';
  if (m < 60) return m + 'm ago';
  const h = Math.round(m / 60);
  if (h < 24) return h + 'h ago';
  return Math.round(h / 24) + 'd ago';
}

let TOAST_TIMER = null;
function toast(msg, ms) {
  const t = $('#toast');
  if (!t) return;
  t.textContent = msg;
  t.classList.remove('hidden');
  clearTimeout(TOAST_TIMER);
  TOAST_TIMER = setTimeout(() => t.classList.add('hidden'), ms || 2600);
}

function normalizeName(s) {
  return String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

/** "AUS TX - Crestwood" -> "AUSTX_Crestwood" (URL-safe, human readable). */
function slugify(s) {
  return String(s || '')
    .replace(/[^A-Za-z0-9]+/g, ' ')
    .trim()
    .split(/\s+/)
    .map((w, i) => (i === 0 ? w : w.charAt(0).toUpperCase() + w.slice(1)))
    .join('_')
    .replace(/_+/g, '_')
    .slice(0, 60) || 'property';
}

/** Strip city/state/zip so only the street address reaches the COMPS tab. */
function streetOnly(addr) {
  const s = String(addr || '').trim();
  if (!s) return '';
  return s.split(',')[0].trim();
}

// ------------------------------------------------------------ schema access
const SCHEMA = window.SCHEMA || {};
const CATEGORIES = SCHEMA.categories || [];

/* ---------------------------------------------------------------- families
   A deal is underwritten on one of two proforma templates, and their COMPS tabs
   put the same fields on DIFFERENT ROWS (MF v45's attribute header is row 200,
   ExStay v38's is 114). comps_schema.json carries both: MF at the top level,
   ExStay under `exstay`.

   TAB / BUCKETS / PHYSICAL / AMENITIES used to be `const`s bound once at load to
   the MF keys, and roughly 180 call sites across six files read them by those
   bare names. They are now GETTERS that resolve against the open property's
   family, so every one of those call sites became family-aware without being
   touched — which is the only reason this was a safe change to make at all.
   Re-binding them as consts would silently pin the whole app to MF again.

   Deliberately NOT per-family: `fees` / `feeVocabulary` (the FEES dropdown was
   copied verbatim between the two templates, so there is nothing to switch) and
   every Tracker-UI vocabulary (categories, wdTypes, sources, …), none of which
   name a COMPS row. Only genuinely row-dependent structures branch. */
const FAMILIES = ['MF', 'ExStay'];
const DEFAULT_FAMILY = 'MF';

/** Normalise anything a record or a UI control might carry to a known family. */
function normFamily(v) {
  const s = String(v == null ? '' : v).trim().toLowerCase().replace(/[^a-z]/g, '');
  if (s === 'exstay' || s === 'extendedstay' || s === 'es') return 'ExStay';
  if (s === 'mf' || s === 'multifamily') return 'MF';
  return DEFAULT_FAMILY;
}

/** The family of a given record. Absent (every pre-2026-09-16 record) => MF,
    which is what those records were captured against. */
function familyOf(p) { return normFamily(p && p.family); }

/** The family currently in effect — the open property's, else the default.

    The try/catch is load-order, not paranoia: `STATE` is declared with `let`
    further down this file, and a `let` in its temporal dead zone throws on bare
    reference AND on `typeof` — unlike `var`, which is why the usual
    `typeof X !== 'undefined'` guard does not help here. Any TAB/BUCKETS read
    that happens while this file is still evaluating would otherwise take down
    the whole app at load. */
function currentFamily() {
  try {
    return STATE ? familyOf(STATE) : DEFAULT_FAMILY;
  } catch (e) {
    return DEFAULT_FAMILY;
  }
}

/** The schema branch for a family. ExStay falls back to the MF keys rather than
    to {} if the branch is somehow missing, because empty geometry would let a
    writer compute row `undefined` and land values nowhere. */
function schemaFor(family) {
  if (normFamily(family) === 'ExStay' && SCHEMA.exstay) return SCHEMA.exstay;
  return SCHEMA;
}

/** The schema branch in effect right now. */
function FAM() { return schemaFor(currentFamily()); }

[
  ['TAB', () => FAM().compsTab || {}],
  ['BUCKETS', () => FAM().unitBuckets || []],
  ['PHYSICAL', () => FAM().physical || []],
  ['AMENITIES', () => FAM().amenities || []],
  ['MAX_COMPS', () => (FAM().compsTab || {}).maxComps || 8],
].forEach(([name, get]) => {
  /* On globalThis, not as a lexical `const`: a bare `TAB` in any of the other
     files resolves through the global object once no lexical binding shadows it.
     `configurable` so a reload of this file in a harness does not throw. */
  Object.defineProperty(globalThis, name, { get, configurable: true });
});

/* ------------------------------------------- attribute values, by field type

   Before 2026-09-16 every physical/amenity field was a Y/N/blank tri-state, so
   "the value" needed no interpretation and each writer just passed the captured
   string through. The band's real vocabulary is not all tri-state — 20 of the 79
   fields are text, number, count or alloc — and there were already THREE places
   coercing values independently (the paste mirror, the Cell Map, the HelloData
   fill), which is exactly how the '# of Pools' column ended up with a 'Y' in it
   on the Cell Map while the paste wrote 1. One helper, used by all of them.

   Blank in stays blank out, always. An uncaptured field is not a zero and not an
   'N' — that distinction is the whole point of the tri-state control, and it
   matters just as much for a count nobody researched. */
function attrOut(item, v) {
  const s = (v == null ? '' : String(v)).trim();
  if (s === '') return '';
  const t = (item && item.type) || 'tri';
  if (t === 'count' || t === 'number') {
    /* 'Y' on a count column is a legacy or HelloData answer to a question that
       used to be Y/N. It means "at least one" — a floor, not a reading — which
       is the same lossy conversion populate_comps-v45.py documents for pools. */
    if (s === 'Y') return 1;
    if (s === 'N') return 0;
    const n = Number(s.replace(/,/g, ''));
    return Number.isFinite(n) ? n : '';
  }
  if (t === 'text' || t === 'alloc') return s;
  return s === 'Y' ? 'Y' : (s === 'N' ? 'N' : '');
}

/** The same value for the populate_comps.py JSON payload. Tri-state keeps its
    true/false/null encoding — the populator has read it that way since v27 and
    this is not the pass to change that contract — while the typed fields travel
    as their own type instead of being flattened to null by triToJson(). */
function attrJson(item, v) {
  const out = attrOut(item, v);
  if (out === '') return null;
  const t = (item && item.type) || 'tri';
  if (t === 'tri') return out === 'Y';
  return out;
}

function bucketByKey(key) { return BUCKETS.find(b => b.key === key) || null; }

/**
 * Map a unit's beds/baths onto one of the 7 COMPS-tab sections.
 * Mirrors classify_unit_type() in populate_comps.py: bath count only splits
 * 2BR and 3BR; 4BR+ all land in the single 4/2 section.
 * Returns null when beds is blank so the UI can flag the row instead of
 * silently filing it under Efficiency.
 */
function bucketFor(beds, baths) {
  if (beds === '' || beds == null) return null;
  const b = num(beds);
  const ba = num(baths);
  if (b <= 0) return 'efficiency';
  if (b === 1) return '1br1ba';
  if (b === 2) return ba >= 2 ? '2br2ba' : '2br1ba';
  if (b === 3) return ba >= 2 ? '3br2ba' : '3br1ba';
  return '4br2ba';
}

/** "2BR/2BA" style label the populator's classify_unit_type() also accepts. */
function bucketTypeLabel(bucketKey) {
  const b = bucketByKey(bucketKey);
  if (!b) return '';
  if (b.beds === 0) return 'Studio';
  return b.beds + 'BR/' + b.baths + 'BA';
}

function optionsFor(field) {
  if (field.options) return field.options.slice();
  if (field.options_ref) return (SCHEMA[field.options_ref] || []).slice();
  return [];
}

function categoryMeta(key) {
  return CATEGORIES.find(c => c.key === key) || null;
}

// -------------------------------------------------------------------- store
let STORE = { version: STORE_VERSION, properties: {}, currentPropertyId: null };
let STATE = null;           // the open property record (a reference into STORE)

function loadStore() {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && parsed.properties) STORE = parsed;
    }
  } catch (e) {
    console.warn('store parse failed, starting fresh', e);
  }
  if (!STORE.properties) STORE.properties = {};
  if (!STORE.version) STORE.version = STORE_VERSION;
  return STORE;
}

function saveStore() {
  try {
    localStorage.setItem(STORE_KEY, JSON.stringify(STORE));
  } catch (e) {
    console.error('saveStore failed', e);
    toast('⚠ Local storage full — export and clear old properties');
  }
}

/**
 * Persist the open property. Stamps `updated`/`lastEditor` and schedules the
 * debounced Drive push (Drive is authoritative; localStorage is a cache).
 */
function saveState(opts) {
  if (!STATE) return;
  STATE.updated = nowISO();
  if (typeof CURRENT_USER === 'object' && CURRENT_USER && CURRENT_USER.email) {
    STATE.lastEditor = CURRENT_USER.email;
  }
  saveStore();
  if (!(opts && opts.noPush) && typeof scheduleAutoPush === 'function') {
    scheduleAutoPush();
  }
}

function blankPhysical() {
  const o = {};
  PHYSICAL.forEach(p => { o[p.key] = ''; });
  return o;
}
function blankAmenities() {
  const o = {};
  AMENITIES.forEach(a => { o[a.key] = ''; });
  return o;
}
function blankFees() {
  const o = {};
  (SCHEMA.fees || []).forEach(f => { o[f.key] = ''; });
  return o;
}

function newProperty(name) {
  const id = uid();
  const p = {
    id,
    name: String(name || '').trim() || 'Untitled',
    created: nowISO(),
    updated: nowISO(),
    lastEditor: (typeof CURRENT_USER === 'object' && CURRENT_USER && CURRENT_USER.email) || '',
    drive: {
      folderId: '', folderName: '', pipelineName: '',
      compsFolderId: '', trackerFolderId: '', backupFolderId: '', fileId: '',
      lastPushed: null, lastPulled: null, remoteModifiedTime: null,
      lastBackupAt: null,
      autoSearchAttempted: false,
    },
    /* Which proforma template this deal is underwritten on. Drives every COMPS
       row number the app reads; see the families block above. */
    family: DEFAULT_FAMILY,
    subject: { name: String(name || '').trim() },
    subjectUnitMix: [],
    comps: [],
    marketRents: {},   // bucketKey -> { override: '' }
    imports: {},       // group -> { fileName, fileId, importedAt, ... }
  };
  STORE.properties[id] = p;
  STORE.currentPropertyId = id;
  saveStore();
  return p;
}

/** Fill in any keys added by a later schema version. */
function hydrateProperty(p) {
  if (!p) return p;
  p.drive = Object.assign({
    folderId: '', folderName: '', pipelineName: '',
    compsFolderId: '', trackerFolderId: '', backupFolderId: '', fileId: '',
    lastPushed: null, lastPulled: null, remoteModifiedTime: null,
    lastBackupAt: null,
    autoSearchAttempted: false,
  }, p.drive || {});
  delete p.asana;   // Asana integration removed 2026-08-03; drop it from old records
  /* Archive flag (2026-08-10). Absent on every pre-existing record, and absent
     must read as Live — `!!undefined` already does, so this is only here to keep
     the key present in the JSON we push to Drive. The ORG MANIFEST is the source
     of truth whenever it has an opinion (see isEntryArchived); this is the
     same-device hint used for the drawer's button label and offline. */
  if (p.archived === undefined) p.archived = false;
  /* Family (2026-09-16). Absent on every record captured before this, and those
     were all captured against the MF template, so normFamily()'s MF default is
     the historically correct reading — not merely a convenient one. Normalised
     rather than trusted so a hand-edited or round-tripped record cannot put an
     unknown string in front of schemaFor(). */
  p.family = normFamily(p.family);
  p.subject = p.subject || {};
  if (p.subject.util_structure === undefined) p.subject.util_structure = '';
  if (p.subject.wd_type && WD_TYPE_MIGRATION[p.subject.wd_type]) {
    p.subject.wd_type = WD_TYPE_MIGRATION[p.subject.wd_type];
  }
  if (!Array.isArray(p.subjectUnitMix)) p.subjectUnitMix = [];
  if (!Array.isArray(p.comps)) p.comps = [];
  p.marketRents = p.marketRents || {};
  /* `vacant_count` arrived with the RR import. Blank — NOT 0 — is the right
     default on every pre-existing row: 0 would assert "fully leased" about a
     property nobody recorded occupancy for, and unitMixTotals() reads blank as
     "unknown" and weights by the full count, exactly as it did before the field
     existed. See occupiedUnitsOf(). */
  p.subjectUnitMix.forEach(r => {
    if (!r.id) r.id = uid();
    if (r.vacant_count === undefined) r.vacant_count = '';
  });
  /* Per-import provenance: which workbook each half of this record came from.
     Keyed by group because the subject and the comps can legitimately come from
     different revisions, or different workbooks entirely. */
  p.imports = p.imports || {};
  p.comps.forEach(c => hydrateComp(c));
  return p;
}

/* Pre-v7 W/D values came from a list the COMPS dropdown never had. Map them onto
   the template's own three options so an old record still matches its cell. */
const WD_TYPE_MIGRATION = {
  'W/D Conn': 'W/D HU',
  'Comm. Laundry': 'No W/D',
  'None': 'No W/D',
};

function hydrateComp(c) {
  if (!c.compId) c.compId = uid();
  if (!Array.isArray(c.unitMix)) c.unitMix = [];
  c.physical = Object.assign(blankPhysical(), c.physical || {});
  c.amenities = Object.assign(blankAmenities(), c.amenities || {});
  c.fees = Object.assign(blankFees(), c.fees || {});
  if (!c.category) c.category = '';

  /* v7 migration. Records captured against the v3 geometry stored a
     property-level `occupancy_pct`; the cell it was headed for is the VACANCY
     cell (row 4 offset 3), so invert rather than drop. Per-floorplan occ_pct on
     the unit rows is a different field and is left alone. */
  if (c.vacancy_pct === undefined) {
    const occ = num(c.occupancy_pct);
    c.vacancy_pct = occ > 0 && occ <= 100 ? String(Number((100 - occ).toFixed(1))) : '';
  }
  if (c.concession_amount === undefined) c.concession_amount = '';
  if (c.concession_months === undefined) c.concession_months = '';
  if (c.util_structure === undefined) c.util_structure = '';
  if (c.wd_type && WD_TYPE_MIGRATION[c.wd_type]) c.wd_type = WD_TYPE_MIGRATION[c.wd_type];
  return c;
}

function newComp() {
  return {
    compId: uid(),
    name: '', address: '', city: '', state: '', zip: '',
    category: '',
    year_built: '', total_units: '', stories: '',
    distance_miles: '', vacancy_pct: '',
    concession_amount: '', concession_months: '',
    wd_type: '', util_structure: '', reno_level: '',
    source: '', hellodata_id: '',
    phone: '', contact_name: '', website: '',
    visited_at: '', visited_by: '',
    unitMix: [],
    physical: blankPhysical(),
    amenities: blankAmenities(),
    fees: blankFees(),
    notes: '',
  };
}

function newUnitRow() {
  return { id: uid(), plan: '', beds: '', baths: '', sqft: '', count: '', occ_pct: '', ask_rent: '', status: '', concession: '', notes: '' };
}
/**
 * `count` is TOTAL units for the plan+finish — occupied AND vacant. `vacant_count`
 * is how many of them are down.
 *
 * The subject stores a COUNT where a comp row stores an `occ_pct` percentage, and
 * the asymmetry is deliberate: the proforma import has the exact figure from both
 * of RR's unit-mix blocks, and a stored, rounded percentage would feed rounding
 * error straight into the occupied-weighted rent average in unitMixTotals().
 * Comp occupancy arrives from HelloData as a percentage and the counts behind it
 * are never visible, so each side stores what its source actually knows.
 */
function newSubjectUnitRow() {
  return { id: uid(), plan: '', beds: '', baths: '', sqft: '', count: '', vacant_count: '', status: '', current_rent: '' };
}

function getComp(compId) {
  if (!STATE) return null;
  return STATE.comps.find(c => c.compId === compId) || null;
}

// ------------------------------------------------------------------ routing
function propertySlug(p) { return slugify(p && (p.name || (p.subject && p.subject.name))); }
function propertyHash(p) { return '#/prop/' + propertySlug(p); }

function parseHash() {
  const h = String(location.hash || '').replace(/^#/, '');
  let m = h.match(/^\/prop\/(.+)$/);
  if (m) return { kind: 'slug', value: decodeURIComponent(m[1]) };
  m = h.match(/^\/p\/(.+)$/);           // legacy id form, rename-proof
  if (m) return { kind: 'id', value: decodeURIComponent(m[1]) };
  return { kind: 'home', value: '' };
}

let SUPPRESS_HASH_ROUTE = false;
function setHash(hash) {
  if (location.hash === hash) return;
  SUPPRESS_HASH_ROUTE = true;
  location.hash = hash;
  setTimeout(() => { SUPPRESS_HASH_ROUTE = false; }, 0);
}

/** Most-recently-updated local property whose slug (or id) matches. */
function findLocalPropertyByHash(route) {
  const list = Object.values(STORE.properties || {});
  let hits;
  if (route.kind === 'id') {
    hits = list.filter(p => p.id === route.value);
  } else {
    const want = route.value.toLowerCase();
    hits = list.filter(p => propertySlug(p).toLowerCase() === want);
  }
  hits.sort((a, b) => String(b.updated || '').localeCompare(String(a.updated || '')));
  return hits[0] || null;
}

// ============================================================================
// COMPUTATION — unit-mix aggregation and suggested market rents
// ============================================================================

/** Group a unit-mix array into { bucketKey: [rows] }, plus an `unassigned` list. */
function groupByBucket(rows) {
  const out = { unassigned: [] };
  BUCKETS.forEach(b => { out[b.key] = []; });
  (rows || []).forEach(r => {
    const k = bucketFor(r.beds, r.baths);
    if (k && out[k]) out[k].push(r);
    else out.unassigned.push(r);
  });
  return out;
}

/** Rows that carry enough data to matter: a rent, an SF, or a unit count. */
function rowHasData(r) {
  return num(r.count) > 0 || num(r.sqft) > 0 || num(r.ask_rent) > 0 || num(r.current_rent) > 0;
}

/** True when this row records an occupancy figure at all. Blank = unknown. */
function hasVacancyFigure(r) {
  return !!r && r.vacant_count !== '' && r.vacant_count != null;
}

/**
 * Leased units on a subject unit-mix row.
 * A row with no vacancy figure returns its full count — "unknown" must behave
 * exactly as it did before the field existed, not as "all vacant".
 */
function occupiedUnitsOf(r) {
  const total = num(r && r.count);
  if (total <= 0) return 0;
  if (!hasVacancyFigure(r)) return total;
  return Math.max(0, total - num(r.vacant_count));
}

/** Occupied share of a row, 0-100, or null when no vacancy was recorded. */
function occPctOf(r) {
  const total = num(r && r.count);
  if (total <= 0 || !hasVacancyFigure(r)) return null;
  return Math.max(0, Math.min(100, (occupiedUnitsOf(r) / total) * 100));
}

function unitMixTotals(rows) {
  let units = 0, sf = 0, rentTotal = 0, rentedUnits = 0, vacant = 0, knownVac = 0;
  (rows || []).forEach(r => {
    const c = num(r.count) || 0;
    units += c;
    sf += c * num(r.sqft);
    if (hasVacancyFigure(r)) { vacant += Math.min(c, num(r.vacant_count)); knownVac += c; }
    const rent = num(r.ask_rent) || num(r.current_rent);
    /* Weight the average by OCCUPIED units, not total.
       `count` includes vacants (the RR import sums the occupied block and the
       VACANTS block) while `current_rent` is an average over leased units only.
       Weighting by total would give a half-empty plan more pull on the in-place
       average than it has leases to justify. Rows with no vacancy figure weight
       by their full count, and a row carrying a rent but no count still counts
       once — both preserve the pre-existing behaviour exactly. */
    if (rent > 0) {
      const w = c > 0 ? occupiedUnitsOf(r) : 1;
      if (w > 0) { rentTotal += rent * w; rentedUnits += w; }
    }
  });
  return {
    units,
    sf,
    vacant,
    /* Only meaningful over the rows that actually recorded occupancy — mixing in
       rows that never did would read as 0% vacant and understate it. */
    occPct: knownVac > 0 ? ((knownVac - vacant) / knownVac) * 100 : null,
    avgSf: units > 0 ? sf / units : 0,
    avgRent: rentedUnits > 0 ? rentTotal / rentedUnits : 0,
    psf: sf > 0 && rentTotal > 0 ? rentTotal / sf : 0,
  };
}

function directComps() {
  if (!STATE) return [];
  return STATE.comps.filter(c => c.category === 'direct');
}

/** Comps sorted the way the COMPS tab expects: direct -> aspirational -> inferior, then distance. */
function sortedComps() {
  if (!STATE) return [];
  const order = { direct: 0, aspirational: 1, inferior: 2, '': 3 };
  return STATE.comps.slice().sort((a, b) => {
    const oa = order[a.category] == null ? 3 : order[a.category];
    const ob = order[b.category] == null ? 3 : order[b.category];
    if (oa !== ob) return oa - ob;
    const da = numOrNull(a.distance_miles);
    const db = numOrNull(b.distance_miles);
    if (da == null && db == null) return 0;
    if (da == null) return 1;
    if (db == null) return -1;
    return da - db;
  });
}

/** Subject-side aggregate for one bucket (from the subject unit mix). */
function subjectBucketAgg(bucketKey) {
  const grouped = groupByBucket(STATE ? STATE.subjectUnitMix : []);
  const rows = grouped[bucketKey] || [];
  const t = unitMixTotals(rows);
  return { rows, units: t.units, avgSf: t.avgSf, avgRent: t.avgRent, psf: t.psf };
}

/**
 * Suggested market rent for one bucket, from DIRECT comps only.
 *
 * Two independent methods, mirroring populate_comps.py:
 *   weighted — unit-count-weighted mean asking rent of direct-comp rows in
 *              this bucket. Preferred: it is a like-for-like comparison.
 *   psf      — unit-count-weighted mean $/SF of those same rows, applied to
 *              the SUBJECT's average SF for the bucket. Fallback when the
 *              comps' floorplans are sized differently than the subject's.
 *
 * `suggested` = weighted when available, else psf, rounded to the nearest $5.
 * Rows missing rent are skipped rather than counted as $0.
 */
function computeSuggested(bucketKey) {
  const comps = directComps();
  let rentNum = 0, rentDen = 0;   // sum(rent*count) / sum(count)
  let psfNum = 0, psfDen = 0;     // sum(rent) / sum(sf)  weighted by count
  let sampleRows = 0, sampleComps = 0;

  comps.forEach(c => {
    const rows = groupByBucket(c.unitMix)[bucketKey] || [];
    let used = 0;
    rows.forEach(r => {
      const rent = num(r.ask_rent);
      if (rent <= 0) return;
      const cnt = num(r.count) || 1;
      const sf = num(r.sqft);
      rentNum += rent * cnt;
      rentDen += cnt;
      if (sf > 0) { psfNum += rent * cnt; psfDen += sf * cnt; }
      used++;
    });
    if (used) { sampleRows += used; sampleComps++; }
  });

  const subj = subjectBucketAgg(bucketKey);
  const weighted = rentDen > 0 ? rentNum / rentDen : 0;
  const psf = psfDen > 0 ? psfNum / psfDen : 0;
  const psfApplied = psf > 0 && subj.avgSf > 0 ? psf * subj.avgSf : 0;

  const raw = weighted > 0 ? weighted : psfApplied;
  const suggested = raw > 0 ? Math.round(raw / 5) * 5 : 0;

  return {
    bucketKey,
    weighted, psf, psfApplied, suggested,
    method: weighted > 0 ? 'weighted' : (psfApplied > 0 ? 'psf' : 'none'),
    sampleRows, sampleComps,
    subjectUnits: subj.units, subjectAvgSf: subj.avgSf, subjectAvgRent: subj.avgRent,
  };
}

/** The number that actually gets written to COMPS column G: override wins. */
function effectiveMarketRent(bucketKey) {
  const mr = (STATE && STATE.marketRents && STATE.marketRents[bucketKey]) || {};
  const ov = numOrNull(mr.override);
  if (ov != null && ov > 0) return { value: ov, source: 'override' };
  const s = computeSuggested(bucketKey);
  return { value: s.suggested, source: s.method };
}

/** All buckets, with everything the Market Rents tab and the export need. */
function marketRentTable() {
  return BUCKETS.map(b => {
    const s = computeSuggested(b.key);
    const eff = effectiveMarketRent(b.key);
    const mr = (STATE && STATE.marketRents && STATE.marketRents[b.key]) || {};
    const delta = s.subjectAvgRent > 0 && eff.value > 0 ? eff.value - s.subjectAvgRent : 0;
    return {
      bucket: b,
      suggested: s.suggested,
      weighted: s.weighted,
      psf: s.psf,
      psfApplied: s.psfApplied,
      method: s.method,
      sampleRows: s.sampleRows,
      sampleComps: s.sampleComps,
      subjectUnits: s.subjectUnits,
      subjectAvgSf: s.subjectAvgSf,
      subjectAvgRent: s.subjectAvgRent,
      override: mr.override || '',
      effective: eff.value,
      effectiveSource: eff.source,
      delta,
      deltaPct: s.subjectAvgRent > 0 ? delta / s.subjectAvgRent : 0,
    };
  });
}

/** Per-comp roll-up used by the comp cards and the summary sheet. */
function compStats(comp) {
  const rows = (comp.unitMix || []).filter(rowHasData);
  const t = unitMixTotals(rows);
  const rents = rows.map(r => num(r.ask_rent)).filter(v => v > 0);
  return {
    planCount: rows.length,
    units: t.units,
    avgSf: t.avgSf,
    avgRent: t.avgRent,
    psf: t.psf,
    minRent: rents.length ? Math.min.apply(null, rents) : 0,
    maxRent: rents.length ? Math.max.apply(null, rents) : 0,
    buckets: BUCKETS.filter(b => (groupByBucket(comp.unitMix)[b.key] || []).some(rowHasData)).map(b => b.short),
  };
}

/**
 * Per-comp, per-bucket overflow check. Each COMPS-tab section has a fixed
 * number of rows; anything past that is silently dropped by the populator,
 * so surface it here instead.
 */
function bucketCapacityIssues(comp) {
  const grouped = groupByBucket(comp.unitMix);
  const out = [];
  BUCKETS.forEach(b => {
    const n = (grouped[b.key] || []).filter(rowHasData).length;
    const cap = b.endRow - b.startRow + 1;
    if (n > cap) out.push({ bucket: b, count: n, cap });
  });
  return out;
}
