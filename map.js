/* ============================================================================
   Rent Comps Tracker — map.js
   The comp map that sits beside the tab-2 comp cards.

   WHERE THE GEOMETRY COMES FROM
   -----------------------------
   Nothing here geocodes. The tracker holds no lat/lon — the pins come from the
   deal's own KML, written by the "MFVAPF - Rent Comp Map Creator" skill into

       <deal folder>/3. Comps/<Property Name> - Map KML.kml

   so the map beside the cards is the SAME artifact that is hyperlinked off the
   static PNG in the proforma. If that file is absent we say so and name the
   skill — we do not invent coordinates, and we never create the "3. Comps"
   folder just to look inside it (driveFindSubfolder, not ...Ensure...).

   FOUR KML DIALECTS ARE IN THE WILD — all four must parse
   -------------------------------------------------------
   The Map Creator has been through more than one shape, and old deals keep
   whatever they were given. Every one of these is a real file on Drive:

     A. generator v5   styles subject/direct/aspirational/inferior,
                       names "⭐ The Lantern" / "● The Baxter at Westwood",
                       rich CDATA <description>.   (The Lantern, Crestwood)
     B. short-style    styles subj/direct/asp/inf, names
                       "SUBJECT: The Estara" / "1. Creekstone (Direct)",
                       no descriptions.                   (The Estara)
     C. no styles      names only: "S - Copperline at Village Oaks (Subject)"
                       / "1. Hunters Chase (Direct)".      (Copperline)
     D. UPPERCASE      "Houston Westlake Village (SUBJECT)" /
                       "Greentree Village (DIRECT)", and a 2-part
                       "lon,lat" with no altitude.  (Houston Westlake Village)

   So the category is read from styleUrl when there is one and from the NAME
   otherwise, and the name is stripped of every prefix/suffix all four use.
   Adding a fifth dialect means extending kmlCategory()/kmlCleanName() — not
   rewriting the caller. Do NOT "simplify" either one against a single sample
   file; the harness table in Accessories/map_harness.js is the regression net.

   THE TRACKER IS THE SOURCE OF TRUTH, THE KML IS ONLY POSITION
   ------------------------------------------------------------
   Pins are matched to STATE.comps by name, and a matched pin then renders the
   TRACKER's category, numbering and stats — never the KML's, which was frozen
   whenever the skill last ran. That asymmetry is also what makes the drift
   banner possible: comps with no pin, and pins with no comp, are both counted
   and reported instead of quietly looking fine.

   KML text is DATA, not markup. Descriptions are flattened to text and escaped
   before they reach the DOM (see kmlDescText) — a file on Drive does not get to
   inject HTML into this app.

   Load order: schema -> core -> drive -> ui -> export -> proforma-import ->
   screener -> MAP -> app(boot). Only renderPhase2() calls in, at runtime.
   ========================================================================= */

'use strict';

// ------------------------------------------------------------------ constants
const MAP_CACHE_KEY     = 'rent_comps_map_cache_v1';
const MAP_COLLAPSED_KEY = 'rent_comps_map_collapsed_v1';
const MAP_CREATOR_SKILL = 'MFVAPF - Rent Comp Map Creator';
/** What the skill names its output. Any other .kml in "3. Comps" is a fallback. */
const MAP_KML_PATTERN   = /map kml\.kml$/i;

/* Leaflet + OpenStreetMap, not the Google Maps JS API: this repo is PUBLIC, so
   an embedded `AIza…` key would be a leak (the Map Creator's static-PNG key
   lives in the skill's .py, which is not public). Leaflet needs no key.
   Loaded lazily — a user who never opens tab 2 never pays for 150 KB. */
const LEAFLET_CSS = 'https://cdn.jsdelivr.net/npm/leaflet@1.9.4/dist/leaflet.css';
const LEAFLET_JS  = 'https://cdn.jsdelivr.net/npm/leaflet@1.9.4/dist/leaflet.js';

/** How long a cached parse is trusted before we re-check Drive's modifiedTime. */
const MAP_REVALIDATE_MS = 10 * 60 * 1000;

// --------------------------------------------------------------------- state
/* MAP_EL is created once and MOVED between renders rather than rebuilt.
   renderPhase2() replaces #phase-content.innerHTML wholesale on every comp
   add / open / back, which would tear a freshly-built Leaflet instance down
   several times a minute. Detaching a node does not destroy the JS object, so
   we keep ours and re-append it — Leaflet only needs invalidateSize() after
   the move to notice its container has a size again. */
let MAP_EL       = null;   // the <div> Leaflet owns
let MAP_OBJ      = null;   // the L.Map
let MAP_PINLAYER = null;   // L.LayerGroup holding every marker
let MAP_PROP_ID  = '';     // which property MAP_OBJ is currently showing
let MAP_PINS     = [];     // [{ point, comp, index, marker }]
let MAP_BUSY     = false;  // a Drive read is in flight
let MAP_ERR      = '';     // last Drive/parse failure, shown in the panel
let MAP_WIRED    = false;  // card<->pin delegation attached to #phase-content
let LEAFLET_LOAD = null;   // in-flight loader promise
let MAP_PANEL_ID = '';     // which property the panel last mounted for

// ================================================================= KML parse
/** Namespace-agnostic child lookup — KML files carry a default xmlns, and a
    plain querySelector('Placemark') does not reliably match a namespaced
    element. getElementsByTagNameNS('*', …) always does. */
function kmlEls(root, tag) {
  return Array.from(root.getElementsByTagNameNS('*', tag));
}
function kmlText(root, tag) {
  const el = kmlEls(root, tag)[0];
  return el ? String(el.textContent || '').trim() : '';
}

/** Category from styleUrl if the file has styles, else from the name. */
function kmlCategory(styleUrl, rawName) {
  const s = String(styleUrl || '').replace(/^#/, '').toLowerCase();
  if (s) {
    if (s.indexOf('subj') === 0) return 'subject';
    if (s.indexOf('asp') === 0)  return 'aspirational';
    if (s.indexOf('inf') === 0)  return 'inferior';
    if (s.indexOf('dir') === 0)  return 'direct';
  }
  const n = String(rawName || '');
  const low = n.toLowerCase();
  // Dialect B/C spell the category out in parentheses or in a "SUBJECT:" prefix.
  if (/\(subject\)\s*$/i.test(n) || /^subject\s*[:\-–]/i.test(n) || /^s\s*[-–]\s/.test(n)) return 'subject';
  if (low.indexOf('(aspirational)') >= 0) return 'aspirational';
  if (low.indexOf('(inferior)') >= 0) return 'inferior';
  if (low.indexOf('(direct)') >= 0) return 'direct';
  // Dialect A prefixes a symbol instead. These match SCHEMA.categories[].symbol.
  if (n.indexOf('⭐') >= 0) return 'subject';        // ⭐
  if (n.indexOf('▲') >= 0) return 'aspirational';   // ▲
  if (n.indexOf('▼') >= 0) return 'inferior';       // ▼
  if (n.indexOf('●') >= 0) return 'direct';         // ●
  return 'direct';
}

/** Strip every prefix and suffix the three dialects use, leaving the name the
    property is actually called — which is what has to match STATE.comps. */
function kmlCleanName(raw) {
  let s = String(raw || '').trim();
  s = s.replace(/^[⭐★●▲▼◯•]+\s*/, '');  // ⭐★●▲▼◯•
  s = s.replace(/^subject\s*[:\-–]\s*/i, '');   // "SUBJECT: The Estara"
  s = s.replace(/^s\s*[-–]\s+/i, '');           // "S - Copperline at Village Oaks"
  s = s.replace(/^\d+\s*[.)]\s*/, '');          // "1. Hunters Chase"
  s = s.replace(/\s*\((?:subject|direct|aspirational|inferior)\)\s*$/i, '');
  return s.trim();
}

/**
 * Flatten a KML <description> to plain text.
 * The generator writes HTML in CDATA. We keep the line breaks and throw the
 * rest away rather than trusting it: this string came out of a file, and
 * file content is data. Callers still esc() the result.
 */
function kmlDescText(html) {
  return String(html || '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|li|tr)>/gi, '\n')
    .replace(/<[^>]*>/g, '')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&').replace(/&lt;/gi, '<').replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"').replace(/&#39;/gi, "'")
    .split('\n').map(l => l.trim()).filter(Boolean).join('\n');
}

/**
 * Parse a comp-map KML into { mapName, points, skipped }.
 * `points` carries only placemarks with a usable <Point>; `skipped` counts the
 * ones without, which is how an address-only KML (the generator falls back to
 * <address> when it has no coordinates) is reported instead of drawn empty.
 */
function parseCompMapKml(text) {
  const out = { mapName: '', points: [], skipped: 0 };
  if (!text || !text.trim()) return out;

  const doc = new DOMParser().parseFromString(text, 'application/xml');
  if (doc.getElementsByTagName('parsererror').length) {
    throw new Error('That .kml is not valid XML');
  }

  const docEl = kmlEls(doc, 'Document')[0] || doc.documentElement;
  if (docEl) {
    // The Document's own <name>, not a Placemark's — take the first direct child.
    const own = Array.from(docEl.children || [])
      .find(c => String(c.localName || c.nodeName).toLowerCase() === 'name');
    out.mapName = own ? String(own.textContent || '').trim() : '';
  }

  kmlEls(doc, 'Placemark').forEach(pm => {
    const rawName = kmlText(pm, 'name');
    const cat = kmlCategory(kmlText(pm, 'styleUrl'), rawName);

    let lat = null, lon = null;
    const pt = kmlEls(pm, 'Point')[0];
    if (pt) {
      // "lon,lat,alt" — KML is always longitude first. Whitespace-separated
      // tuples are legal, so take the first.
      const first = String(kmlText(pt, 'coordinates') || '').split(/\s+/)[0] || '';
      const bits = first.split(',');
      const a = Number(bits[0]), b = Number(bits[1]);
      if (Number.isFinite(a) && Number.isFinite(b)
          && Math.abs(b) <= 90 && Math.abs(a) <= 180) { lon = a; lat = b; }
    }
    if (lat == null) { out.skipped++; return; }

    out.points.push({
      rawName,
      name: kmlCleanName(rawName),
      category: cat,
      isSubject: cat === 'subject',
      lat, lon,
      desc: kmlDescText(kmlText(pm, 'description')),
      address: kmlText(pm, 'address'),
    });
  });

  return out;
}

// ==================================================================== cache
/* Cached in localStorage, deliberately NOT in STATE. STATE is the record that
   gets pushed to Drive and mirrored into the manifest; parking a copy of every
   deal's KML in there would bloat rent_comps.json, ride along on every
   auto-push, and put a second source of truth next to the file itself. This
   cache is a render accelerator and nothing else — losing it costs one Drive
   read. */
function mapCacheAll() {
  try { return JSON.parse(localStorage.getItem(MAP_CACHE_KEY)) || {}; }
  catch (e) { return {}; }
}
function mapCacheGet(propId) { return mapCacheAll()[propId] || null; }
function mapCacheSet(propId, rec) {
  const all = mapCacheAll();
  all[propId] = rec;
  try { localStorage.setItem(MAP_CACHE_KEY, JSON.stringify(all)); }
  catch (e) { console.warn('map cache write failed', e); }
}

function mapCollapsed() { return localStorage.getItem(MAP_COLLAPSED_KEY) === '1'; }
function setMapCollapsed(v) {
  if (v) localStorage.setItem(MAP_COLLAPSED_KEY, '1');
  else localStorage.removeItem(MAP_COLLAPSED_KEY);
}

// ============================================================== Drive lookup
/**
 * Locate the deal's comp-map KML. Returns one of:
 *   { state:'nofolder' }        no deal folder linked yet
 *   { state:'nocompsfolder' }   linked, but the deal has no "3. Comps"
 *   { state:'nokml' }           "3. Comps" exists, holds no .kml
 *   { state:'found', file }     file meta incl. webViewLink
 * Read-only by design — see the header note on driveFindSubfolder.
 */
async function findCompMapKmlFile(p) {
  if (!p.drive || !p.drive.folderId) return { state: 'nofolder' };

  const cached = mapCacheGet(p.id);
  let compsId = p.drive.compsFolderId || (cached && cached.compsFolderId) || '';
  if (!compsId) compsId = await driveFindSubfolder(p.drive.folderId, COMPS_FOLDER);
  if (!compsId) return { state: 'nocompsfolder' };

  const files = await driveList(
    `'${compsId}' in parents and trashed=false`,
    'id,name,mimeType,modifiedTime,webViewLink'
  );
  const kmls = files.filter(f => /\.kml$/i.test(f.name || ''));
  if (!kmls.length) return { state: 'nokml', compsFolderId: compsId };

  /* Prefer the Map Creator's own "… - Map KML.kml"; fall back to any .kml so a
     hand-made map still shows. Newest wins within whichever set we land in —
     a deal that has been re-mapped keeps the current one. */
  const named = kmls.filter(f => MAP_KML_PATTERN.test(f.name));
  const pick = (named.length ? named : kmls)
    .slice()
    .sort((a, b) => String(b.modifiedTime || '').localeCompare(String(a.modifiedTime || '')))[0];

  return { state: 'found', file: pick, compsFolderId: compsId };
}

/**
 * Resolve the map for a property, using the cache when Drive says the file has
 * not changed. Returns the cache record; never throws for "there is no map",
 * only for a real Drive/parse failure.
 */
async function loadCompMap(p, opts) {
  const force = !!(opts && opts.force);
  const found = await findCompMapKmlFile(p);

  if (found.state !== 'found') {
    const rec = {
      state: found.state,
      compsFolderId: found.compsFolderId || '',
      checkedAt: nowISO(),
    };
    mapCacheSet(p.id, rec);
    return rec;
  }

  const cached = mapCacheGet(p.id);
  if (!force && cached && cached.points
      && cached.fileId === found.file.id
      && cached.modifiedTime === found.file.modifiedTime) {
    cached.checkedAt = nowISO();
    cached.webViewLink = found.file.webViewLink || cached.webViewLink || '';
    mapCacheSet(p.id, cached);
    return cached;
  }

  const parsed = parseCompMapKml(await driveDownloadText(found.file.id));
  const rec = {
    state: parsed.points.length ? 'ok' : 'nocoords',
    compsFolderId: found.compsFolderId || '',
    fileId: found.file.id,
    fileName: found.file.name,
    modifiedTime: found.file.modifiedTime || '',
    webViewLink: found.file.webViewLink || '',
    mapName: parsed.mapName,
    points: parsed.points,
    skipped: parsed.skipped,
    fetchedAt: nowISO(),
    checkedAt: nowISO(),
  };
  mapCacheSet(p.id, rec);
  return rec;
}

// ============================================================ Leaflet loader
function loadLeaflet() {
  if (window.L && window.L.map) return Promise.resolve(window.L);
  if (LEAFLET_LOAD) return LEAFLET_LOAD;
  LEAFLET_LOAD = new Promise((resolve, reject) => {
    if (!document.querySelector('link[data-leaflet]')) {
      const css = document.createElement('link');
      css.rel = 'stylesheet';
      css.href = LEAFLET_CSS;
      css.setAttribute('data-leaflet', '1');
      document.head.appendChild(css);
    }
    const js = document.createElement('script');
    js.src = LEAFLET_JS;
    js.async = true;
    js.onload = () => {
      if (window.L && window.L.map) resolve(window.L);
      else { LEAFLET_LOAD = null; reject(new Error('Leaflet loaded without L.map')); }
    };
    js.onerror = () => {
      LEAFLET_LOAD = null;             // let a later ↻ retry
      reject(new Error('Could not load the map library — check the connection'));
    };
    document.head.appendChild(js);
  });
  return LEAFLET_LOAD;
}

// ================================================== pin <-> comp cross-match
/**
 * Match KML pins to STATE.comps by name so a pin can carry the CARD's number
 * and category rather than whatever the KML froze. Exact normalized match
 * first, then containment — comp names drift ("Balcones Club" vs "Balcones
 * Club Apartments") and a near-miss is still the same property.
 * Each comp is claimed at most once.
 */
function matchPinsToComps(points) {
  const comps = sortedComps();
  const keyed = comps.map((c, i) => ({
    comp: c, index: i, key: normalizeName(c.name),
  }));
  const taken = new Set();

  const pins = points.map(pt => {
    if (pt.isSubject) return { point: pt, comp: null, index: -1 };
    const want = normalizeName(pt.name);
    let hit = null;
    if (want) {
      hit = keyed.find(k => !taken.has(k.comp.compId) && k.key && k.key === want);
      if (!hit) {
        hit = keyed.find(k => !taken.has(k.comp.compId) && k.key
          && (k.key.indexOf(want) === 0 || want.indexOf(k.key) === 0));
      }
      if (!hit) {
        hit = keyed.find(k => !taken.has(k.comp.compId) && k.key.length > 3
          && (k.key.indexOf(want) >= 0 || want.indexOf(k.key) >= 0));
      }
    }
    if (hit) taken.add(hit.comp.compId);
    return { point: pt, comp: hit ? hit.comp : null, index: hit ? hit.index : -1 };
  });

  const unpinned = comps.filter(c => !taken.has(c.compId));
  return { pins, unpinned };
}

// ================================================================== markers
/** A CSS-only pin: no image assets, so Leaflet's icon-path problem never
    arises and the colours come straight from the category variables. */
function pinIconHtml(pin) {
  if (pin.point.isSubject) {
    return '<span class="mpin mpin-subject" title="Subject">★</span>';
  }
  const cat = pin.comp ? (pin.comp.category || '') : pin.point.category;
  const label = pin.index >= 0 ? String(pin.index + 1) : '•';
  const orphan = pin.comp ? '' : ' mpin-orphan';
  return '<span class="mpin mpin-' + esc(cat || 'none') + orphan + '">' + esc(label) + '</span>';
}

/** Popup body. Matched pins render the TRACKER's numbers; unmatched ones fall
    back to what the KML said, flagged as no longer in the tracker. */
function pinPopupHtml(pin) {
  const pt = pin.point;
  if (pt.isSubject) {
    const s = STATE.subject || {};
    const line = [streetOnly(s.address) || streetOnly(pt.address), s.city, s.state]
      .filter(Boolean).join(', ');
    return '<div class="mpop">'
      + '<div class="mpop-h">★ ' + esc(s.name || pt.name || 'Subject') + '</div>'
      + '<div class="mpop-tag subject">Subject</div>'
      + (line ? '<div class="mpop-r">' + esc(line) + '</div>' : '')
      + (s.year_built || s.total_units
          ? '<div class="mpop-r">' + esc(s.year_built || '—') + ' · '
            + (s.total_units ? int(s.total_units) + 'u' : '—') + '</div>'
          : '')
      + '</div>';
  }

  if (!pin.comp) {
    return '<div class="mpop">'
      + '<div class="mpop-h">' + esc(pt.name || '(unnamed pin)') + '</div>'
      + '<div class="mpop-tag none">Not in this tracker</div>'
      + (pt.desc ? '<div class="mpop-r pre">' + esc(pt.desc) + '</div>' : '')
      + '<div class="mpop-r muted">On the KML but not in the comp list — the map '
      + 'is older than the comps, or this one was dropped.</div>'
      + '</div>';
  }

  const c = pin.comp;
  const st = compStats(c);
  const meta = categoryMeta(c.category);
  const addr = [streetOnly(c.address), c.city, c.state].filter(Boolean).join(', ');
  const rows = [
    (c.year_built ? esc(c.year_built) : '—')
      + ' · ' + (c.total_units ? int(c.total_units) + 'u' : '—')
      + ' · ' + (c.distance_miles !== '' && c.distance_miles != null
          ? num(c.distance_miles).toFixed(2) + ' mi' : '— mi'),
    st.planCount
      ? st.planCount + ' plan' + (st.planCount === 1 ? '' : 's')
        + (st.avgRent > 0 ? ' · avg ' + money(st.avgRent) : '')
        + (st.psf > 0 ? ' · $' + st.psf.toFixed(2) + '/SF' : '')
      : 'no unit mix yet',
  ];
  return '<div class="mpop">'
    + '<div class="mpop-h">' + (pin.index + 1) + '. ' + esc(c.name || '(unnamed comp)') + '</div>'
    + '<div class="mpop-tag ' + esc(c.category || 'none') + '">'
    + esc(meta ? meta.label : 'Set type') + '</div>'
    + (addr ? '<div class="mpop-r">' + esc(addr) + '</div>' : '')
    + rows.map(r => '<div class="mpop-r">' + r + '</div>').join('')
    + '<div class="mpop-a"><button type="button" data-mapgo="' + esc(c.compId) + '">'
    + 'Show the card →</button></div>'
    + '</div>';
}

/** (Re)build the Leaflet instance and its pins for the property in STATE. */
function paintCompMapPins(rec) {
  const L = window.L;
  const host = MAP_EL;
  if (!L || !host) return;

  const matched = matchPinsToComps(rec.points || []);
  MAP_PINS = matched.pins;

  if (!MAP_OBJ) {
    MAP_OBJ = L.map(host, { zoomControl: true, attributionControl: true });
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
    }).addTo(MAP_OBJ);
    MAP_PINLAYER = L.layerGroup().addTo(MAP_OBJ);
  }
  MAP_PINLAYER.clearLayers();

  const latlngs = [];
  MAP_PINS.forEach(pin => {
    const icon = L.divIcon({
      html: pinIconHtml(pin),
      className: 'mpin-wrap',
      iconSize: [26, 26],
      iconAnchor: [13, 13],
      popupAnchor: [0, -13],
    });
    const m = L.marker([pin.point.lat, pin.point.lon], {
      icon,
      title: pin.point.name || '',
      // Subject on top, then whatever order the KML gave.
      zIndexOffset: pin.point.isSubject ? 1000 : 0,
    });
    m.bindPopup(pinPopupHtml(pin), { minWidth: 190, maxWidth: 260 });
    m.on('click', () => { if (pin.comp) highlightPinFor(pin.comp.compId); });
    m.addTo(MAP_PINLAYER);
    pin.marker = m;
    latlngs.push([pin.point.lat, pin.point.lon]);
  });

  /* Only re-frame when the property changed. Re-fitting on every render would
     yank the view back every time a comp is opened and closed. */
  if (MAP_PROP_ID !== STATE.id) {
    if (latlngs.length > 1) {
      MAP_OBJ.fitBounds(L.latLngBounds(latlngs), { padding: [26, 26], maxZoom: 15 });
    } else if (latlngs.length === 1) {
      MAP_OBJ.setView(latlngs[0], 14);
    }
    MAP_PROP_ID = STATE.id;
  }
  MAP_OBJ.invalidateSize();
  return matched;
}

// ============================================================== interactions
/** Grow the pin belonging to a card, so hovering the list finds it on the map. */
function highlightPinFor(compId) {
  MAP_PINS.forEach(pin => {
    if (!pin.marker) return;
    const el = pin.marker.getElement();
    if (!el) return;
    el.classList.toggle('mpin-hot', !!(compId && pin.comp && pin.comp.compId === compId));
  });
}

/** Scroll a comp card into view and flash it — what a pin click leads to. */
function focusCompCard(compId) {
  const card = $('[data-compcard="' + compId + '"]');
  if (!card) return;
  card.scrollIntoView({ behavior: 'smooth', block: 'center' });
  card.classList.add('card-flash');
  setTimeout(() => card.classList.remove('card-flash'), 1400);
}

/** Centre the map on a card's pin — the other direction of the same link. */
function focusPinFor(compId) {
  const pin = MAP_PINS.find(x => x.comp && x.comp.compId === compId);
  if (!pin || !pin.marker || !MAP_OBJ) { toast('That comp is not on the map'); return; }
  MAP_OBJ.setView(pin.marker.getLatLng(), Math.max(MAP_OBJ.getZoom(), 14));
  pin.marker.openPopup();
  highlightPinFor(compId);
}

/* One delegation pass, wired once. #phase-content itself survives every
   render — only its innerHTML is replaced — so listeners on it outlive the
   cards they serve, and re-wiring per render would stack duplicates. */
function wireMapDelegation() {
  if (MAP_WIRED) return;
  const host = $('#phase-content');
  if (!host) return;
  MAP_WIRED = true;

  host.addEventListener('click', (ev) => {
    const act = ev.target.closest('[data-mapact]');
    if (act) {
      ev.stopPropagation();
      const what = act.getAttribute('data-mapact');
      if (what === 'refresh')  refreshCompMap({ force: true });
      if (what === 'collapse') { setMapCollapsed(!mapCollapsed()); renderPhase2(); }
      if (what === 'connect')  driveConnect();
      return;
    }
    // "Show the card →" inside a popup.
    const go = ev.target.closest('[data-mapgo]');
    if (go) { focusCompCard(go.getAttribute('data-mapgo')); return; }
    // The pin chip on a card head jumps the map, without opening the editor.
    const jump = ev.target.closest('[data-mapjump]');
    if (jump) {
      ev.stopPropagation();
      focusPinFor(jump.getAttribute('data-mapjump'));
      return;
    }
  });

  /* Hover is a desktop affordance and harmless on a phone (a tap fires it once,
     then the click opens the comp). Kept on the container so it costs one
     listener rather than one per card. */
  host.addEventListener('mouseover', (ev) => {
    const card = ev.target.closest('[data-compcard]');
    if (card) highlightPinFor(card.getAttribute('data-compcard'));
  });
  host.addEventListener('mouseout', (ev) => {
    const card = ev.target.closest('[data-compcard]');
    if (card && !card.contains(ev.relatedTarget)) highlightPinFor(null);
  });
}

// =================================================================== render
function mapPlaceholderHtml(title, msg, extra) {
  return '<div class="map-ph">'
    + '<svg class="map-ph-art" viewBox="0 0 120 78" aria-hidden="true">'
    + '<rect x="1" y="1" width="118" height="76" rx="6" fill="#eef2f7" stroke="#cbd5e1"/>'
    + '<path d="M0 52 L34 40 L62 56 L92 34 L120 46" fill="none" stroke="#cbd5e1" stroke-width="2"/>'
    + '<path d="M0 24 L28 30 L54 18 L86 26 L120 14" fill="none" stroke="#dbe3ec" stroke-width="2"/>'
    + '<path d="M60 20c-6.6 0-12 5.4-12 12 0 9 12 22 12 22s12-13 12-22c0-6.6-5.4-12-12-12z" '
    + 'fill="#94a3b8"/><circle cx="60" cy="32" r="4.6" fill="#eef2f7"/>'
    + '</svg>'
    + '<div class="map-ph-title">' + esc(title) + '</div>'
    + '<div class="map-ph-msg">' + msg + '</div>'
    + (extra || '')
    + '</div>';
}

/** The one the user asked for: no KML on Drive -> name the skill that makes it. */
function mapMissingHtml(p) {
  const fname = (p.subject && p.subject.name) || p.name || 'Property Name';
  return mapPlaceholderHtml(
    'No rent comp map for this deal yet',
    'Run the <b>' + esc(MAP_CREATOR_SKILL) + '</b> skill to build one from these comps.',
    '<div class="map-ph-path">Expected at <b>' + esc(COMPS_FOLDER) + ' / '
      + esc(fname) + ' - Map KML.kml</b></div>'
    + '<div class="map-ph-hint">Then press ↻ above — nothing here has to be '
      + 're-entered.</div>'
  );
}

function mapStatusLine(rec) {
  if (MAP_BUSY) return 'reading Drive…';
  if (!rec) return '';
  if (rec.state === 'ok') {
    const n = (rec.points || []).length;
    return n + ' pin' + (n === 1 ? '' : 's') + ' · ' + relTime(rec.fetchedAt);
  }
  return '';
}

/**
 * Drift between the KML and the comp list. This is the reason the map is worth
 * having beside the cards rather than in a Drive tab: a stale map looks
 * perfectly fine on its own.
 */
function mapReconHtml(matched, rec) {
  if (!matched) return '';
  const orphans = matched.pins.filter(x => !x.point.isSubject && !x.comp);
  const missing = matched.unpinned;
  if (!orphans.length && !missing.length) {
    return '<div class="map-recon ok">✓ Every comp is on the map.</div>';
  }
  const bits = [];
  if (missing.length) {
    bits.push('<b>' + missing.length + '</b> comp' + (missing.length === 1 ? '' : 's')
      + ' not on the map: ' + esc(missing.map(c => c.name || '(unnamed)').join(', ')));
  }
  if (orphans.length) {
    bits.push('<b>' + orphans.length + '</b> pin' + (orphans.length === 1 ? '' : 's')
      + ' no longer in the comp list: '
      + esc(orphans.map(x => x.point.name || '(unnamed)').join(', ')));
  }
  if (rec && rec.skipped) {
    bits.push('<b>' + rec.skipped + '</b> placemark'
      + (rec.skipped === 1 ? '' : 's') + ' had no coordinates.');
  }
  return '<div class="map-recon warn">⚠ ' + bits.join('<br/>')
    + '<br/><span class="muted">Re-run <b>' + esc(MAP_CREATOR_SKILL)
    + '</b> to bring the KML back in line.</span></div>';
}

/**
 * Mount the panel into `panel` (created by renderPhase2). Paints from cache
 * first so the map is there on the first frame, then revalidates against Drive
 * in the background.
 */
function mountCompMapPanel(panel) {
  if (!panel || !STATE) return;
  wireMapDelegation();

  /* Everything below MAP_* is per-property, and the module is not. Opening a
     different subject has to drop the last one's pins and its error, or an
     unmapped deal inherits the previous deal's 📍 chips and a Drive failure on
     one subject reads as a failure on every subject after it. */
  if (MAP_PANEL_ID !== STATE.id) {
    MAP_PANEL_ID = STATE.id;
    MAP_PINS = [];
    MAP_ERR = '';
  }

  const rec = mapCacheGet(STATE.id);
  const collapsed = mapCollapsed();
  const status = mapStatusLine(rec);

  panel.innerHTML = `
    <div class="card map-card${collapsed ? ' collapsed' : ''}">
      <div class="card-head" title="Pins come from the deal's own KML in ${esc(COMPS_FOLDER)} — the same file the proforma's comp-map image links to. Hover a comp card to find it on the map; click a pin to jump to its card.">
        <span class="grow">Comp Map</span>
        ${status ? `<span class="head-stat">${esc(status)}</span>` : ''}
        <button type="button" class="btn-icon" data-mapact="refresh"
          title="Re-read the KML from Drive">${MAP_BUSY ? '⋯' : '↻'}</button>
        <button type="button" class="btn-icon" data-mapact="collapse"
          title="${collapsed ? 'Show the map' : 'Hide the map'}">${collapsed ? '▸' : '▾'}</button>
      </div>
      <div class="card-body" id="map-body"></div>
    </div>`;

  if (collapsed) { dropPins(); return; }
  const body = $('#map-body', panel);

  if (MAP_ERR) {
    dropPins();
    body.innerHTML = mapPlaceholderHtml('The map could not be loaded', esc(MAP_ERR),
      '<div class="map-ph-hint">Press ↻ to try again.</div>');
    return;
  }
  if (!driveConnected()) {
    dropPins();
    body.innerHTML = mapPlaceholderHtml('Google Drive is not connected',
      'The comp map lives in the deal folder, so it needs Drive.',
      '<div class="map-ph-hint"><button type="button" class="btn small primary" '
      + 'data-mapact="connect">Connect Google Drive</button></div>');
    return;
  }

  /* "No folder linked" is knowable without touching Drive, so it is decided
     here rather than waited for — a brand-new subject would otherwise sit on
     "Looking for the comp map…" until a round trip came back with the answer
     we already had. Checking it ahead of `rec` also covers a subject whose
     folder link was removed after a map had been cached. */
  const state = (!STATE.drive || !STATE.drive.folderId)
    ? 'nofolder'
    : (MAP_BUSY && !rec ? 'loading' : (rec ? rec.state : 'loading'));
  /* Every branch below except 'ok' means there is nothing to jump to, so the
     📍 chips have to go with the map — a chip whose pin does not exist is worse
     than no chip. The 'ok' path re-populates MAP_PINS in paintCompMapPins. */
  if (state !== 'ok') dropPins();

  if (state === 'loading') {
    body.innerHTML = mapPlaceholderHtml('Looking for the comp map…',
      'Reading <b>' + esc(COMPS_FOLDER) + '</b> in the deal folder.');
    revalidateCompMap();
    return;
  }
  if (state === 'nofolder') {
    body.innerHTML = mapPlaceholderHtml('No Drive deal folder linked',
      'Link this subject to its deal folder on tab 1 (or ☰ → Find Drive Folder), '
      + 'then press ↻.');
    return;
  }
  if (state === 'nocompsfolder' || state === 'nokml') {
    body.innerHTML = mapMissingHtml(STATE);
    revalidateCompMap();
    return;
  }
  if (state === 'nocoords') {
    body.innerHTML = mapPlaceholderHtml('The KML has no coordinates',
      esc(rec.fileName || 'That .kml') + ' holds ' + (rec.skipped || 0)
      + ' address-only placemark' + (rec.skipped === 1 ? '' : 's') + ', so there is '
      + 'nothing to plot.',
      '<div class="map-ph-hint">Re-run <b>' + esc(MAP_CREATOR_SKILL)
      + '</b> — it writes coordinates when it can geocode.</div>');
    return;
  }

  // --- state 'ok': the real map -------------------------------------------
  const legend = [{ key: 'subject', label: 'Subject' }]
    .concat(CATEGORIES.map(c => ({ key: c.key, label: c.label })))
    .map(x => `<span class="map-leg"><i class="mpin-dot mpin-${esc(x.key)}"></i>${esc(x.label)}</span>`)
    .join('');

  body.innerHTML = `
    <div class="map-legend">${legend}</div>
    <div class="map-canvas-host" id="map-canvas-host"></div>
    <div id="map-recon-host"></div>
    <div class="map-foot">
      <span class="muted tiny">${esc(rec.fileName || '')}</span>
      ${rec.webViewLink
        ? `<a class="map-link" href="${esc(rec.webViewLink)}" target="_blank" rel="noopener">Open in Drive ↗</a>`
        : ''}
    </div>`;

  if (!MAP_EL) {
    MAP_EL = document.createElement('div');
    MAP_EL.className = 'map-canvas';
  }
  $('#map-canvas-host', body).appendChild(MAP_EL);

  loadLeaflet().then(() => {
    // renderPhase2 may have run again while the CDN answered.
    if (!MAP_EL.isConnected || !STATE) return;
    const matched = paintCompMapPins(rec);
    const rh = $('#map-recon-host');
    if (rh) rh.innerHTML = mapReconHtml(matched, rec);
    syncPinChips();
  }).catch(e => {
    MAP_ERR = e.message || String(e);
    if (CURRENT_PHASE === 2 && !OPEN_COMP_ID) renderPhase2();
  });

  revalidateCompMap();
}

/** Background freshness check — silent, and only when the cache has aged out. */
function revalidateCompMap() {
  if (!STATE || MAP_BUSY || !driveConnected()) return;
  const rec = mapCacheGet(STATE.id);
  if (rec && rec.checkedAt
      && (Date.now() - new Date(rec.checkedAt).getTime()) < MAP_REVALIDATE_MS) return;
  refreshCompMap({ silent: true });
}

/** ↻ — re-read the KML. `force` re-downloads even if modifiedTime matches. */
async function refreshCompMap(opts) {
  if (!STATE) return;
  const silent = !!(opts && opts.silent);
  if (MAP_BUSY) return;
  if (!driveConnected()) { if (!silent) toast('Connect Google Drive first'); return; }

  const propId = STATE.id;
  const before = JSON.stringify(mapCacheGet(propId) || null);
  MAP_BUSY = true;
  MAP_ERR = '';
  if (!silent && CURRENT_PHASE === 2 && !OPEN_COMP_ID) renderPhase2();

  try {
    const rec = await loadCompMap(STATE, { force: !silent });
    MAP_BUSY = false;
    if (!STATE || STATE.id !== propId) return;   // user moved on
    /* A silent revalidate that changed nothing must not repaint — it would
       reset the map view and interrupt whatever the user is reading. */
    const changed = JSON.stringify(rec) !== before;
    if ((!silent || changed) && CURRENT_PHASE === 2 && !OPEN_COMP_ID) {
      if (changed) MAP_PROP_ID = '';           // re-frame on genuinely new pins
      renderPhase2();
    }
    if (!silent) {
      if (rec.state === 'ok') toast((rec.points || []).length + ' pins from ' + rec.fileName);
      else if (rec.state === 'nokml' || rec.state === 'nocompsfolder') {
        toast('No comp map KML in ' + COMPS_FOLDER + ' yet');
      }
    }
  } catch (e) {
    MAP_BUSY = false;
    MAP_ERR = e.message || String(e);
    if (!silent) toast('Map read failed: ' + MAP_ERR);
    if (CURRENT_PHASE === 2 && !OPEN_COMP_ID) renderPhase2();
  }
}

/** Does this comp have a pin? renderPhase2 uses it for the card-head chip. */
function compHasPin(compId) {
  return MAP_PINS.some(x => x.comp && x.comp.compId === compId);
}

/** Forget the pins and take the 📍 chips down with them. */
function dropPins() {
  if (!MAP_PINS.length) return;
  MAP_PINS = [];
  syncPinChips();
}

/**
 * Add/remove the 📍 chip on cards that are already on screen.
 * renderPhase2 paints the chips from MAP_PINS, but on a cold start Leaflet is
 * still coming off the CDN when it runs, so MAP_PINS is empty and every card
 * renders without one. Calling renderPhase2() again from the loader's callback
 * would re-enter mountCompMapPanel -> loadLeaflet (now resolved) -> paint ->
 * render, i.e. a loop. Patching the six-odd heads in place cannot recurse.
 */
function syncPinChips() {
  $$('[data-compcard]').forEach(card => {
    const id = card.getAttribute('data-compcard');
    const head = $('.card-head', card);
    if (!head) return;
    const chip = $('.pin-chip', head);
    const want = compHasPin(id);
    if (want && !chip) {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'pin-chip';
      b.setAttribute('data-mapjump', id);
      b.title = 'Centre the map on this comp';
      b.textContent = '📍';
      const pill = $('.cat-pill', head);
      if (pill) head.insertBefore(b, pill); else head.appendChild(b);
    } else if (!want && chip) {
      chip.remove();
    }
  });
}
