/* ===========================================================================
   The Screener — tab 3, which IS the Market Rents page.
   ---------------------------------------------------------------------------
   One unit type at a time: the subject fixed on the LEFT, one comp at a time on
   the RIGHT, with attributes and photos held below on the same split. The market
   rent is set here, per subject floor plan.

   This file REPLACES window.renderPhase3 rather than editing ui.js, the same way
   proforma-import.js mounts itself: the feature is exactly screener.js +
   screener.css, and deleting the pair restores the old Market Rents table.
   `renderPhase3()` is a global function declaration in ui.js, so reassigning
   window.renderPhase3 after ui.js loads re-points every existing call site
   (renderCurrentPhase, and the four post-edit re-renders inside ui.js).

   MARKET RENT MODEL
   -----------------
   Stored per subject unit-mix row as `market_rent`, with `market_rent_src`
   recording whether it came from the proforma seed or was typed here. Rows of
   the SAME PLAN move together — a plan's Original and Reno rows share one market
   rent by default, because COMPS carries one subject row per plan, not per
   plan+finish.

   ⚠️ EXPORT IS DELIBERATELY UNCHANGED. `marketRents[bucket].override` is kept in
   sync as the unit-weighted roll-up of the per-row values, so export.js keeps
   writing exactly what it wrote before. Writing the per-row numbers into COMPS
   column G positionally would MIS-ASSIGN them: the tracker holds one row per
   plan+finish (Lantern 2x2 = 18) while COMPS holds one per plan (9), so tracker
   index k is not COMPS row startRow+k. Doing it properly means emitting column G
   BY PLAN LABEL and letting the populator resolve the row — exactly the pattern
   commit 2ee89e7 established for fees — which needs a populator change too.
   ========================================================================= */

(function () {
  'use strict';

  const PHOTO_SLOTS = ['exterior', 'kitchen', 'bathroom', 'amenities'];
  // The named-subfolder layout writes `amenity.jpg`; the legacy flat one writes
  // `comp_N_amenities.jpg`. Match both or the fourth tile reads as missing.
  const SLOT_ALIASES = { amenities: ['amenities', 'amenity'] };
  const PICTURES_FOLDER = '11. Pictures';
  const VISIBLE_ROWS = 9;          // COMPS section capacity; scroll past it

  /* KEY ATTRIBUTES — the fields shown first, above the other Physical /
     Amenities fields. THE OWNER'S LIST (2026-11-19): column K = Y in
     `Market Rents - Attribute Priority v2.xlsx` (APPLETS/Rent Comps Tracker),
     20 fields. Change it there first, then here. Keys, not labels; schema order
     wins over the order written here. The same keys exist in both families. */
  const PRIMARY = {
    physical: ['property_type', 'hvac_indiv', 'wd_hookups', 'roof_type', 'specials'],
    amenities: ['num_common_laundry_rms', 'dog_park', 'fitness_center', 'pool',
      'attached_garages', 'covered_parking', 'hardwood_floors', 'patio_balcony',
      'granite_stone_countertops', 'stainless_steel_appliances', 'valet_trash',
      'all_bills_paid', 'gated', 'courtesy_patrol', 'large_pets'],
  };
  /* FEES are not in PRIMARY: every COMPS fee is always shown, as its own strip
     at the top of the key block (owner, 2026-11-19), even when blank. */

  /* DUPLICATE PAIRS — RETIRED with the rows (MF v73 / ExStay v69, 2026-11-19).
     The band used to ask Priv. Yards / W/D Hookups / W/D In-Unit twice, once
     under Amenities too, and this tab folded each pair for display only. The
     template has since retired the Amenities rows, and core.js
     foldRetiredAttrs() now folds stored answers into the Physical key on load,
     so there is nothing left to merge here. A pair that DISAGREED keeps the
     Physical answer and records the other in `retired_conflicts`; it is still
     shown both ways, flagged (attrSource below), until someone edits it. */
  function amenitiesShown() { return AMENITIES; }

  /* Per-browser show / hide switches. Storage failing just means "shown". */
  const OTHER_KEY = 'rct.screener.showOther';
  const PHOTOS_KEY = 'rct.screener.showPhotos';
  function readOn(k) {
    try { return localStorage.getItem(k) !== '0'; } catch (e) { return true; }
  }
  function writeOn(k, on) {
    try { localStorage.setItem(k, on ? '1' : '0'); } catch (e) { /* ignore */ }
  }
  function showOther() { return readOn(OTHER_KEY); }
  function setShowOther(on) { writeOn(OTHER_KEY, on); }
  function showPhotos() { return readOn(PHOTOS_KEY); }

  const SC = {
    bucket: null,
    compIdx: 0,
    anchor: 0,
    photos: {},                    // cacheKey -> {slot: objectURL} | 'none'
    photoBusy: {},
    photoUp: {},                   // 'subject:<slot>' / 'comp:<compId>:<slot>' -> true while uploading a drop
    photoComp: null,               // the comp whose strip is on screen (the drop target's owner)
  };

  // ---------------------------------------------------------------- helpers
  function bucketsWithSubject() {
    return BUCKETS.filter(b => subjectRowsFor(b.key).length > 0);
  }
  function subjectRowsFor(key) {
    return groupByBucket(STATE ? STATE.subjectUnitMix : [])[key] || [];
  }
  function compRowsFor(comp, key) {
    return groupByBucket(comp.unitMix || [])[key] || [];
  }
  /** Comps with at least one row in this bucket — the cycle order. */
  function compsWithBucket(key) {
    const ordered = sortedComps();
    const out = [];
    ordered.forEach(c => { if (compRowsFor(c, key).length) out.push(c); });
    return out;
  }
  /* INTERNAL COMP (2026-11-23): the subject's own recent leases (core.js
     internalCompFor, the proforma's COMPS "Internal:" block). It rides the same
     ◀ ▶ cycle as the real comps, LAST, so the tab still opens on the top comp;
     the "Internal" button in the cycle header jumps straight to it. */
  const INTERNAL = { __internal: true, compId: '__internal', name: 'Internal' };
  function cycleFor(key) { return compsWithBucket(key).concat([INTERNAL]); }
  function isInternal(c) { return !!(c && c.__internal); }
  /** The subject plan carrying the most units — the default anchor. */
  function anchorRowFor(key) {
    const rows = subjectRowsFor(key);
    let best = 0, bestCount = -1;
    rows.forEach((r, i) => {
      const c = num(r.count);
      if (c > bestCount) { bestCount = c; best = i; }
    });
    return best;
  }
  function occupiedOf(r) {
    const total = num(r.count);
    const vac = String(r.vacant_count == null ? '' : r.vacant_count).trim();
    if (vac === '') return total;
    return Math.max(0, total - num(vac));
  }
  /** Unit-count-weighted mean of `key`, skipping rows where it is <= 0. */
  function weightedBy(rows, valueOf, weightOf) {
    let n = 0, d = 0;
    rows.forEach(r => {
      const v = valueOf(r), w = weightOf ? weightOf(r) : num(r.count) || 1;
      if (v > 0 && w > 0) { n += v * w; d += w; }
    });
    return d > 0 ? n / d : 0;
  }
  function avgSfOf(rows) {
    return weightedBy(rows, r => num(r.sqft));
  }

  // ------------------------------------------------------------ market rent
  /**
   * The proforma-imported figure for this bucket, used as the grey default on
   * every row in it.
   *
   * ⚠️ Read from `.seed`, NOT `.override`. syncBucketOverride() writes the
   * per-row roll-up back into `.override` to keep export.js correct, so if the
   * default were read from there the two would form a loop: clearing a row would
   * fall back to a "default" that is really an average of your own edits, and the
   * original proforma number would be unrecoverable. `.seed` is captured once,
   * before the first write, and never touched again.
   */
  function proformaSeed(key) {
    const mr = (STATE.marketRents && STATE.marketRents[key]) || {};
    const raw = Object.prototype.hasOwnProperty.call(mr, 'seed') ? mr.seed : mr.override;
    const v = numOrNull(raw);
    return v != null && v > 0 ? v : 0;
  }
  /** Freeze the imported figure the first time we are about to overwrite it. */
  function captureSeed(key) {
    if (!STATE.marketRents) STATE.marketRents = {};
    if (!STATE.marketRents[key]) STATE.marketRents[key] = {};
    const mr = STATE.marketRents[key];
    if (!Object.prototype.hasOwnProperty.call(mr, 'seed')) {
      mr.seed = mr.override == null ? '' : String(mr.override);
    }
  }
  /** Effective market rent for one row: typed value wins, else the seed. */
  function marketOf(row, key) {
    const own = String(row.market_rent == null ? '' : row.market_rent).trim();
    if (own !== '') {
      const n = num(own);
      return { value: n, src: row.market_rent_src === 'user' ? 'user' : 'proforma' };
    }
    const seed = proformaSeed(key);
    return seed > 0 ? { value: seed, src: 'proforma' } : { value: 0, src: 'none' };
  }
  /**
   * Write a market rent onto every row sharing this plan.
   * COMPS carries one subject row per PLAN, so a plan's finishes cannot hold
   * different market rents without one of them being dropped on export.
   */
  function setMarketForPlan(key, plan, value) {
    const rows = subjectRowsFor(key);
    let touched = 0;
    rows.forEach(r => {
      if ((r.plan || '') !== (plan || '')) return;
      r.market_rent = value === '' ? '' : String(value);
      r.market_rent_src = value === '' ? '' : 'user';
      touched++;
    });
    syncBucketOverride(key);
    saveState();
    return touched;
  }
  /**
   * Keep marketRents[bucket].override equal to the unit-weighted roll-up of the
   * per-row values, so export.js — which writes one figure per section — keeps
   * emitting a correct number without being changed.
   */
  function syncBucketOverride(key) {
    captureSeed(key);                       // must run BEFORE override is touched
    const rows = subjectRowsFor(key);
    const priced = rows.filter(r => marketOf(r, key).value > 0);
    if (!priced.length) { STATE.marketRents[key].override = ''; return; }
    const roll = weightedBy(priced, r => marketOf(r, key).value);
    STATE.marketRents[key].override = roll > 0 ? String(Math.round(roll)) : '';
  }
  function bucketRollup(key) {
    const rows = subjectRowsFor(key);
    const priced = rows.filter(r => marketOf(r, key).value > 0);
    return {
      value: weightedBy(priced, r => marketOf(r, key).value),
      priced: priced.length,
      total: rows.length,
    };
  }

  // ------------------------------------------------------------------ photos
  function sanitizeFolderName(name) {
    return String(name || '').replace(/[\\/:*?"<>|]/g, '-').replace(/[.\s]+$/, '').trim();
  }
  function aliasesFor(slot) { return SLOT_ALIASES[slot] || [slot]; }

  async function findFolderChild(parentId, name) {
    const rows = await driveList(
      `'${parentId}' in parents and name='${String(name).replace(/'/g, "\\'")}'`
      + ` and mimeType='application/vnd.google-apps.folder' and trashed=false`, 'id,name');
    return rows[0] || null;
  }
  async function listImages(folderId) {
    return driveList(
      `'${folderId}' in parents and trashed=false and mimeType contains 'image/'`,
      'id,name,mimeType');
  }
  function pickSlot(files, wanted) {
    const names = aliasesFor(wanted);
    for (const f of files) {
      const base = String(f.name || '').toLowerCase().replace(/\.[a-z0-9]+$/, '');
      if (names.some(a => base === a || base.endsWith('_' + a))) return f;
    }
    return null;
  }
  async function toObjectUrl(fileId, mime) {
    const buf = await driveDownloadBuffer(fileId);
    return URL.createObjectURL(new Blob([buf], { type: mime || 'image/jpeg' }));
  }

  /**
   * Resolve one entity's four photos.
   *   subject -> 11. Pictures/subject_<slot>.jpg
   *   comp    -> 3. Comps/<Comp Name>/<slot>.jpg   (canonical, 2026-08-04+)
   *              3. Comps/photos/comp_<N>_<slot>.jpg  (legacy, still on disk)
   * Never falls back to positional matching inside the named form — a renamed
   * comp shows placeholders rather than another comp's photos.
   */
  async function resolvePhotos(kind, comp, slot1Index) {
    const key = kind === 'subject' ? 'subject' : 'comp:' + (comp.compId || slot1Index);
    if (SC.photos[key]) return SC.photos[key];
    if (SC.photoBusy[key]) return null;
    if (!driveConnected() || !STATE.drive || !STATE.drive.folderId) return 'none';

    SC.photoBusy[key] = true;
    try {
      let files = [];
      if (kind === 'subject') {
        const pics = await findFolderChild(STATE.drive.folderId, PICTURES_FOLDER);
        if (pics) files = (await listImages(pics.id))
          .filter(f => /^subject[_-]/i.test(f.name || ''));
      } else {
        const compsFolder = STATE.drive.compsFolderId
          ? { id: STATE.drive.compsFolderId }
          : await findFolderChild(STATE.drive.folderId, COMPS_FOLDER);
        if (compsFolder) {
          /* Same folder rule as the tab-2 Photos card (photos.js phCompFolder, read mode): exact name, else the
             ONE unambiguous loose match (`Alma` -> `Alma Apartments`). So a photo dropped here lands in, and
             is read back from, the folder tab 2 shows — never a second exact-name folder. */
          let namedId = '';
          if (window.PHOTOS && window.PHOTOS.compFolder) namedId = await window.PHOTOS.compFolder(comp, false);
          else {
            const n = await findFolderChild(compsFolder.id, sanitizeFolderName(comp.name));
            namedId = n ? n.id : '';
          }
          if (namedId) {
            files = await listImages(namedId);
          } else {
            const flat = await findFolderChild(compsFolder.id, 'photos');
            if (flat) {
              const all = await listImages(flat.id);
              const pre = 'comp_' + (slot1Index + 1) + '_';
              files = all.filter(f => String(f.name || '').toLowerCase().startsWith(pre));
            }
          }
        }
      }

      const out = {};
      for (const s of PHOTO_SLOTS) {
        const hit = pickSlot(files, s);
        if (!hit) continue;
        try { out[s] = await toObjectUrl(hit.id, hit.mimeType); } catch (e) { /* skip */ }
      }
      SC.photos[key] = Object.keys(out).length ? out : 'none';
      return SC.photos[key];
    } catch (e) {
      SC.photos[key] = 'none';
      return 'none';
    } finally {
      SC.photoBusy[key] = false;
    }
  }

  // ------------------------------------------------------------------ render
  /* The record + field a cell shows, for provenance.js's source cards. Paths use
     the same grammar as the tracker's own inputs ('subject', 'comp:<id>',
     'comp:<id>.physical', 'unit:subject:<rowId>', 'unit:comp:<id>:<rowId>'). */
  function pv(path, key) {
    return 'data-pvpath="' + esc(path) + '" data-pvkey="' + esc(key) + '"';
  }

  function statusClass(s) {
    const t = String(s || '').toLowerCase();
    if (t.indexOf('orig') === 0) return 'orig';
    if (t.indexOf('part') === 0) return 'part';
    if (t.indexOf('reno') === 0) return 'reno';
    return 'none';
  }

  function railHtml() {
    const chips = BUCKETS.map(b => {
      const rows = subjectRowsFor(b.key);
      const on = rows.length > 0;
      const units = rows.reduce((a, r) => a + num(r.count), 0);
      return `<button class="sc-bkt${SC.bucket === b.key ? ' active' : ''}"
        data-scbkt="${esc(b.key)}"${on ? '' : ' disabled'} title="${esc(b.label)}">
        <span class="k">${esc(b.short)}</span>
        <span class="m">${on ? rows.length + ' pl · ' + int(units) + 'u' : 'none'}</span>
      </button>`;
    }).join('');

    const s = computeSuggested(SC.bucket);
    const roll = bucketRollup(SC.bucket);
    const rows = subjectRowsFor(SC.bucket);
    const inPlace = weightedBy(rows, r => num(r.current_rent), r => occupiedOf(r));
    const delta = inPlace > 0 && roll.value > 0 ? roll.value - inPlace : 0;

    return `<div class="sc-band1">
      <div class="sc-b1lab">Unit<br>type</div>
      <div class="sc-rail">${chips}</div>
      <div class="sc-mkt">
        <div class="sc-fig"><div class="lab">Comps suggest</div>
          <div class="vl"><span class="val">${s.suggested > 0 ? money(s.suggested) : '—'}</span>
          <span class="sub">${esc(s.method)}${s.sampleRows ? ' · ' + s.sampleRows + 'r/' + s.sampleComps + 'c direct' : ''}</span></div></div>
        <button class="sc-apply" id="sc-apply"${s.suggested > 0 ? '' : ' disabled'}
          title="Write ${s.suggested > 0 ? money(s.suggested) : 'the suggested rent'} into every ${esc(bucketShortOf(SC.bucket))} plan below">
          Apply to all ${rows.length} &rarr;</button>
        <div class="sc-fig"><div class="lab">Set below</div>
          <div class="vl"><span class="val">${roll.value > 0 ? money(roll.value) : '—'}</span>
          <span class="sub${roll.priced < roll.total ? ' warn' : ''}">${roll.priced}/${roll.total} rows · unit-wtd</span></div></div>
        <div class="sc-fig"><div class="lab">vs in-place</div>
          <div class="vl"><span class="val ${delta >= 0 ? 'up' : 'dn'}">${delta ? (delta > 0 ? '+' : '−') + money(Math.abs(delta)).slice(1) : '—'}</span>
          <span class="sub">in-place ${inPlace > 0 ? money(inPlace) : '—'}</span></div></div>
      </div>
    </div>`;
  }

  function bucketShortOf(key) {
    const b = bucketByKey(key);
    return b ? b.short : key;
  }

  function subjectPaneHtml() {
    const rows = subjectRowsFor(SC.bucket);
    const s = STATE.subject;
    const head = `<div class="sc-head">
      <div class="sc-htop"><span class="sc-tag subject">Subject</span>
        <span class="sc-name" ${pv('subject', 'name')}>${esc(s.name || STATE.name || '(unnamed)')}</span>
      <div class="sc-facts">
        <span ${pv('subject', 'year_built')}>${esc(s.year_built || '—')}</span>
        <span ${pv('subject', 'total_units')}>${s.total_units ? int(num(s.total_units)) + ' units' : '—'}</span>
        <span ${pv('subject', 'wd_type')}>W/D ${esc(s.wd_type || '—')}</span>
        <span ${pv('subject', 'util_structure')}>${esc(s.util_structure || '—')}</span>
      </div></div></div>`;

    if (!rows.length) {
      return head + `<div class="sc-body"><div class="sc-empty">
        <span class="big">No ${esc(bucketShortOf(SC.bucket))} plans</span></div></div>`;
    }

    const body = rows.map((r, i) => {
      const m = marketOf(r, SC.bucket);
      const inPlace = num(r.current_rent);
      const lift = m.value > 0 && inPlace > 0 ? m.value - inPlace : null;
      const vac = String(r.vacant_count == null ? '' : r.vacant_count).trim();
      const vacN = vac === '' ? null : num(vac);
      const hiVac = vacN != null && num(r.count) > 0 && vacN / num(r.count) >= 0.5;
      const up = 'unit:subject:' + r.id;
      return `<tr class="sc-pick${i === SC.anchor ? ' anchor' : ''}" data-scrow="${i}">
        <td class="l plan" ${pv(up, 'plan')}>${esc(r.plan || '—')}${i === SC.anchor ? ' <span class="sc-near">ANCHOR</span>' : ''}</td>
        <td class="l" ${pv(up, 'status')}><span class="sc-st ${statusClass(r.status)}">${esc(r.status || '—')}</span></td>
        <td ${pv(up, 'sqft')}>${r.sqft ? int(num(r.sqft)) : '—'}</td>
        <td ${pv(up, 'count')}>${r.count ? int(num(r.count)) : '—'}</td>
        <td class="sc-vac${hiVac ? ' hi' : ''}" ${pv(up, 'vacant_count')}>${vacN == null ? '—' : int(vacN)}</td>
        <td class="rent" ${pv(up, 'current_rent')}>${inPlace > 0 ? money(inPlace) : '—'}</td>
        <td ${pv(up, 'market_rent')}><input type="number" inputmode="decimal" step="any"
              class="sc-mrent ${m.src === 'user' ? 'user' : (m.src === 'proforma' ? 'seed' : 'none')}"
              data-scmkt="${i}" value="${m.value > 0 ? Math.round(m.value) : ''}"
              placeholder="—" aria-label="Market rent for ${esc(r.plan)} ${esc(r.status)}" /></td>
        <td><span class="sc-dlt ${lift == null ? 'flat' : (lift > 0 ? 'up' : (lift < 0 ? 'dn' : 'flat'))}">${
          lift == null ? '—' : (lift > 0 ? '+' : '−') + money(Math.abs(lift)).slice(1)}</span></td>
      </tr>`;
    }).join('');

    const totalUnits = rows.reduce((a, r) => a + num(r.count), 0);
    const inPlaceAvg = weightedBy(rows, r => num(r.current_rent), r => occupiedOf(r));
    const roll = bucketRollup(SC.bucket);
    const plans = new Set(rows.map(r => r.plan || '')).size;
    const cap = bucketByKey(SC.bucket);
    const capacity = cap ? (cap.endRow - cap.startRow + 1) : VISIBLE_ROWS;

    return head + `<div class="sc-body sc-scroll9"><table class="sc-mix">
      <thead><tr><th class="l">Plan</th><th class="l">Fin.</th><th>SF</th><th>#</th>
        <th>Vac</th><th>In-place</th><th>Market $</th><th>Lift</th></tr></thead>
      <tbody>${body}</tbody></table></div>
      <div class="sc-foot">
        <div class="kv"><span class="k">Units</span><span class="v">${int(totalUnits)}</span></div>
        <div class="kv"><span class="k">Avg SF</span><span class="v">${int(avgSfOf(rows))}</span></div>
        <div class="kv"><span class="k">Avg in-place</span><span class="v">${inPlaceAvg > 0 ? money(inPlaceAvg) : '—'}</span></div>
        <div class="kv"><span class="k">Priced</span><span class="v${roll.priced < roll.total ? ' warn' : ''}">${roll.priced}/${roll.total}</span></div>
        ${plans > capacity ? `<div class="kv"><span class="k warn">⚠ COMPS fits ${capacity} plans</span><span class="v warn">${plans} here</span></div>` : ''}
        <div class="sc-mlg"><i><span class="sc-mrent seed sample">seed</span> from proforma</i>
          <i><span class="sc-mrent none sample"></span> needs a value</i></div>
      </div>`;
  }

  /** ◀ n / N ▶ + one dot per comp (+ the internal comp) + the Internal jump. */
  function cycleHtml(list, c, key) {
    const all = sortedComps();
    const dots = all.map(x => {
      const present = list.indexOf(x) !== -1;
      return `<button class="sc-dot${x === c ? ' on' : ''}${present ? '' : ' absent'}"
        ${present ? '' : 'disabled'} data-sccomp="${esc(x.compId)}"
        title="${esc(x.name || 'comp')}${present ? '' : ' — no ' + esc(bucketShortOf(key))}"
        aria-label="${esc(x.name || 'comp')}"></button>`;
    }).join('') + `<button class="sc-dot int${isInternal(c) ? ' on' : ''}" data-sccomp="${INTERNAL.compId}"
        title="Internal: the subject's own recent leases" aria-label="Internal comp"></button>`;
    return `<div class="sc-cyc">
        <button id="sc-prev" title="Previous comp with this unit type" aria-label="Previous comp">◀</button>
        <span class="pos">${SC.compIdx + 1} / ${list.length}</span>
        <button id="sc-next" title="Next comp with this unit type" aria-label="Next comp">▶</button>
        <div class="sc-dots">${dots}</div>
        <button id="sc-int" class="sc-intbtn${isInternal(c) ? ' on' : ''}" title="The subject's own recent leases, from the rent roll">Internal</button>
      </div>`;
  }

  function fmtDate(iso) {
    const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(iso || ''));
    return m ? (+m[2]) + '/' + (+m[3]) + '/' + m[1].slice(2) : '—';
  }

  /** The internal comp's pane: the proforma's COMPS "Internal:" block, live. */
  function internalPaneHtml(list) {
    const key = SC.bucket;
    const ic = internalCompFor(key);
    const set = internalCompSettings();
    const sl = (STATE && STATE.subjectLeases) || null;
    const head = `<div class="sc-head">
        <div class="sc-htop">
          <span class="sc-tag internal">Internal</span>
          <span class="sc-name">${esc((STATE.subject && STATE.subject.name) || STATE.name || 'Subject')} — own leases</span>
          <div class="sc-facts">
            <span>${ic.hasLeases ? int(ic.leaseCount) + ' units on the RR' : 'no lease table yet'}</span>
            <span title="${esc(sl && sl.fileName ? sl.fileName + ' · ' + (sl.sheet || 'RR') + ' row ' + (sl.headerRow || '') : '')}">${
              sl && sl.importedAt ? 'imported ' + esc(relTime(sl.importedAt)) : '—'}</span>
          </div>
          ${cycleHtml(list, INTERNAL, key)}
        </div></div>`;
    const filt = `<div class="sc-ifilt">
        <label>Move-in after <input type="date" id="sc-int-after" value="${esc(set.moveInAfter || '')}"
          title="COMPS!T4 'Move-In After:' — blank = any move-in date"/></label>
        <label>LXP look-back <input type="number" id="sc-int-lb" min="0" max="36" step="1" inputmode="numeric"
          value="${esc(set.lookbackMonths)}" title="COMPS!W4 'Start # Mos LookBack' — blank = no LXP filter"/> mos</label>
        <span class="sc-icut" title="Leases counted: occupied, LXP on or after this date (= signed in the last N months on a 12-month lease)${
          ic.moveInAfter ? ', moved in on or after ' + esc(fmtDate(ic.moveInAfter)) : ''}">LXP ≥ ${ic.cutoff ? esc(fmtDate(ic.cutoff)) : 'any'}</span>
        <button type="button" id="sc-int-reset" class="sc-other" title="Back to 12 months, no move-in date">Reset</button>
      </div>`;
    if (!ic.hasLeases) {
      return head + filt + `<div class="sc-body"><div class="sc-empty">
        <span class="big">No rent-roll leases on this record</span>
        <span>Import from Proforma (tab 1) and tick <b>Subject leases</b>: it reads the RR tab's lease table
        (the "Unit Type Name" block), as the proforma's COMPS "Internal:" block does.</span></div></div>`;
    }
    const anchor = subjectRowsFor(key)[SC.anchor] || null;
    const aRent = anchor ? num(anchor.current_rent) : 0;
    /* Each plan row opens to EVERY unit of that plan + finish (2026-11-23):
       counted ones in full, excluded ones greyed with the reason, newest move-in
       first. Open rows are remembered per plan + finish while the tab is open. */
    SC.openInt = SC.openInt || {};
    const ikey = x => (x.plan || '') + '|' + (x.status || '');
    const why = s => s.replace(/(\d{4}-\d{2}-\d{2})/, m => fmtDate(m));
    const unitsHtml = x => {
      const us = x.units.slice().sort((a, b) => (b.move_in || '').localeCompare(a.move_in || '') || String(a.unit).localeCompare(String(b.unit)));
      return `<tr class="sc-iunits"><td colspan="8"><table class="sc-mix sc-iutab">
        <thead><tr><th class="l">Unit</th><th>SF</th><th>Move-in</th><th>LXP</th><th>Eff. $</th><th class="l">Counted</th></tr></thead>
        <tbody>${us.map(u => {
          /* A lease that passes the filters gets a checkbox: untick it to drop it
             from the averages (saved on the record). A filtered-out one just says why. */
          const can = !u.excluded || u.excluded === 'unchecked';
          const last = can
            ? `<label class="sc-uchk"><input type="checkbox" data-scunit="${esc(u.key)}"${u.excluded ? '' : ' checked'}
                 aria-label="Count unit ${esc(u.unit || '')} in the average"/>${u.excluded ? '<span>unchecked</span>' : ''}</label>`
            : esc(why(u.excluded));
          return `<tr class="${u.excluded ? 'out' : 'in'}${u.excluded === 'unchecked' ? ' man' : ''}">
          <td class="l">${esc(u.unit || '—')}</td><td>${u.sf ? int(num(u.sf)) : '—'}</td>
          <td>${esc(fmtDate(u.move_in))}</td><td>${esc(fmtDate(u.lxp))}</td>
          <td class="rent">${u.eff ? money(num(u.eff)) : '—'}</td>
          <td class="l">${last}</td></tr>`;
        }).join('')}</tbody></table></td></tr>`;
    };
    const body = ic.rows.map((x, i) => {
      const d = aRent > 0 && x.rent != null ? x.rent - aRent : null;
      const open = !!SC.openInt[ikey(x)];
      return `<tr class="sc-irow${open ? ' open' : ''}" data-scint="${i}" title="${open ? 'Hide' : 'Show'} all ${x.total} ${esc(x.plan)} ${esc(x.status)} units">
        <td class="l plan"><span class="sc-chev">${x.total ? (open ? '▾' : '▸') : ''}</span>${esc(x.plan || '—')}</td>
        <td class="l"><span class="sc-st ${statusClass(x.status)}">${esc(x.status || '—')}</span></td>
        <td>${x.sf ? int(x.sf) : '—'}</td>
        <td title="${x.leases} of ${x.total} ${esc(x.plan)} ${esc(x.status)} units counted${x.unchecked ? ' (' + x.unchecked + ' unchecked by hand)' : ''}">${x.leases}<span class="muted">/${x.total}</span>${
          x.unchecked ? `<span class="sc-ioff">−${x.unchecked}</span>` : ''}</td>
        <td>${x.lxp ? esc(fmtDate(x.lxp)) : '—'}</td>
        <td class="rent">${x.rent != null ? money(x.rent) : '—'}</td>
        <td class="psf">${x.psf != null ? '$' + x.psf.toFixed(2) : '—'}</td>
        <td><span class="sc-dlt ${d == null ? 'flat' : (d > 0 ? 'up' : (d < 0 ? 'dn' : 'flat'))}">${
          d == null ? '—' : (d > 0 ? '+' : '−') + money(Math.abs(d)).slice(1)}</span></td>
      </tr>${open && x.total ? unitsHtml(x) : ''}`;
    }).join('');
    const anyOpen = ic.rows.some(x => SC.openInt[ikey(x)]);
    const s = ic.section;
    const subjAvg = weightedBy(subjectRowsFor(key), r => num(r.current_rent), r => occupiedOf(r));
    const gap = s.rent != null && subjAvg > 0 ? s.rent - subjAvg : 0;
    const leases = ic.matched.slice().sort((a, b) => (b.move_in || '').localeCompare(a.move_in || ''));
    const list2 = SC.showLeases ? `<div class="sc-ileases"><table class="sc-mix">
        <thead><tr><th class="l">Unit</th><th class="l">Plan</th><th class="l">Fin.</th><th>SF</th>
          <th>Move-in</th><th>LXP</th><th>Eff. $</th></tr></thead><tbody>${leases.map(l => `<tr>
          <td class="l">${esc(l.unit || '—')}</td><td class="l">${esc(l.plan || '')}</td><td class="l">${esc(l.finish || '')}</td>
          <td>${l.sf ? int(num(l.sf)) : '—'}</td><td>${esc(fmtDate(l.move_in))}</td><td>${esc(fmtDate(l.lxp))}</td>
          <td class="rent">${l.eff != null ? money(num(l.eff)) : '—'}</td></tr>`).join('')}</tbody></table></div>` : '';
    return head + filt + `<div class="sc-body sc-scroll9"><table class="sc-mix">
        <thead><tr><th class="l">Plan</th><th class="l">Fin.</th><th>SF</th><th title="Leases that pass the filters / all units of that plan and finish">Leases</th>
          <th>Avg LXP</th><th>$/Mo</th><th>$/SF</th><th>Δ vs anchor</th></tr></thead><tbody>${body}</tbody></table></div>
      <div class="sc-foot">
        <div class="kv" title="Simple average of the plan rows above, as the proforma's section row (T25 = AVERAGE(T6:T14))"><span class="k">Section $/Mo</span><span class="v">${s.rent != null ? money(s.rent) : '—'}</span></div>
        <div class="kv"><span class="k">$/SF</span><span class="v">${s.psf != null ? '$' + s.psf.toFixed(2) : '—'}</span></div>
        <div class="kv"><span class="k">Avg LXP</span><span class="v">${s.lxp ? esc(fmtDate(s.lxp)) : '—'}</span></div>
        <div class="kv"><span class="k">vs in-place</span><span class="v ${gap >= 0 ? 'up' : 'dn'}">${
          gap ? (gap > 0 ? '+' : '−') + money(Math.abs(gap)).slice(1) : '—'}</span></div>
        ${ic.uncheckedAll ? `<span class="sc-inote" title="Leases unticked by hand are left out of the averages. The proforma's Internal block has no such switch, so these figures now differ from it.">${ic.uncheckedAll} lease${ic.uncheckedAll === 1 ? '' : 's'} unchecked by hand — differs from the proforma</span>
        <button type="button" id="sc-int-recheck" class="sc-other" title="Count every lease that passes the filters again">Re-check all</button>` : ''}
        <button type="button" id="sc-int-expand" class="sc-other" title="Show or hide every unit under every plan row">${anyOpen ? 'Collapse all' : 'Expand all'}</button>
        <button type="button" id="sc-int-list" class="sc-other">${SC.showLeases ? 'Hide' : 'Show'} the ${leases.length} lease${leases.length === 1 ? '' : 's'}</button>
      </div>${list2}`;
  }

  function compPaneHtml() {
    const key = SC.bucket;
    const list = cycleFor(key);
    const all = sortedComps();

    if (SC.compIdx >= list.length) SC.compIdx = 0;
    const c = list[SC.compIdx];
    if (isInternal(c)) return internalPaneHtml(list);
    const meta = categoryMeta(c.category);
    const vac = num(c.vacancy_pct);
    const dists = all.map(x => num(x.distance_miles)).filter(v => v > 0);
    const allSameDist = dists.length > 2 && new Set(dists).size === 1;

    const rows = compRowsFor(c, key).slice();
    const anchor = subjectRowsFor(key)[SC.anchor] || null;
    const aSf = anchor ? num(anchor.sqft) : 0;
    const aRent = anchor ? num(anchor.current_rent) : 0;
    if (aSf > 0) rows.sort((x, y) => Math.abs(num(x.sqft) - aSf) - Math.abs(num(y.sqft) - aSf));
    const nearest = rows.length && aSf > 0 ? rows[0] : null;

    const body = rows.map(r => {
      const ask = num(r.ask_rent);
      const d = aRent > 0 && ask > 0 ? ask - aRent : null;
      const sf = num(r.sqft);
      const cu = 'unit:comp:' + c.compId + ':' + r.id;
      return `<tr>
        <td class="l plan" ${pv(cu, 'plan')}>${esc(r.plan || '—')}${r === nearest ? ' <span class="sc-near">NEAREST</span>' : ''}</td>
        <td ${pv(cu, 'sqft')}>${sf ? int(sf) : '—'}</td>
        <td ${pv(cu, 'count')}>${r.count ? int(num(r.count)) : '—'}</td>
        <td class="rent" ${pv(cu, 'ask_rent')}>${ask > 0 ? money(ask) : '—'}</td>
        <td class="psf">${ask > 0 && sf > 0 ? '$' + (ask / sf).toFixed(2) : '—'}</td>
        <td><span class="sc-dlt ${d == null ? 'flat' : (d > 0 ? 'up' : (d < 0 ? 'dn' : 'flat'))}">${
          d == null ? '—' : (d > 0 ? '+' : '−') + money(Math.abs(d)).slice(1)}</span></td>
      </tr>`;
    }).join('');

    const askAvg = weightedBy(rows, r => num(r.ask_rent));
    const subjAvg = weightedBy(subjectRowsFor(key), r => num(r.current_rent), r => occupiedOf(r));
    const gap = askAvg > 0 && subjAvg > 0 ? askAvg - subjAvg : 0;

    return `<div class="sc-head">
        <div class="sc-htop">
          <span class="sc-tag ${esc(c.category || 'untyped')}">${esc(meta ? meta.label : 'Untyped')}</span>
          <span class="sc-name" ${pv('comp:' + c.compId, 'name')}>${esc(c.name || '(unnamed)')}</span>
          <div class="sc-facts">
          <span ${pv('comp:' + c.compId, 'year_built')}${String(c.year_built) === '1950' ? ' class="flag"' : ''}>${esc(c.year_built || '—')}${String(c.year_built) === '1950' ? ' ⚑' : ''}</span>
          <span ${pv('comp:' + c.compId, 'total_units')}>${c.total_units ? int(num(c.total_units)) + ' units' : '—'}</span>
          <span ${pv('comp:' + c.compId, 'distance_miles')}${allSameDist ? ' class="flag"' : ''}>${c.distance_miles ? num(c.distance_miles).toFixed(2) + ' mi' : '—'}${allSameDist ? ' ⚑' : ''}</span>
          <span ${pv('comp:' + c.compId, 'vacancy_pct')}${vac > 30 ? ' class="flag"' : ''}>${c.vacancy_pct !== '' && c.vacancy_pct != null ? vac + '% vac' : '—'}${vac > 30 ? ' ⚑' : ''}</span>
          </div>
          ${cycleHtml(list, c, key)}
        </div></div>
      <div class="sc-body sc-scroll9"><table class="sc-mix">
        <thead><tr><th class="l">Plan</th><th>SF</th><th>#</th><th>Ask</th><th>$/SF</th>
          <th>Δ vs anchor</th></tr></thead><tbody>${body}</tbody></table></div>
      <div class="sc-foot">
        <div class="kv"><span class="k">Avg ask</span><span class="v">${askAvg > 0 ? money(askAvg) : '—'}</span></div>
        <div class="kv"><span class="k">Avg SF</span><span class="v">${int(avgSfOf(rows))}</span></div>
        <div class="kv"><span class="k">vs subject</span><span class="v ${gap >= 0 ? 'up' : 'dn'}">${
          gap ? (gap > 0 ? '+' : '−') + money(Math.abs(gap)).slice(1) : '—'}</span></div>
      </div>`;
  }

  // --------------------------------------------------------- attribute band
  function triGlyph(v) {
    if (v === 'Y') return '<span class="sc-g y">Y</span>';
    if (v === 'N') return '<span class="sc-g n">N</span>';
    if (v === '' || v == null) return '<span class="sc-g b">·</span>';
    return '<span class="sc-txt" title="' + esc(v) + '">' + esc(v) + '</span>';
  }
  function feeGlyph(v) {
    const s = String(v == null ? '' : v).trim();
    if (s === '') return '<span class="sc-fee zero">·</span>';
    const n = Number(s);
    return '<span class="sc-fee">' + (isNaN(n) ? esc(s) : money(n)) + '</span>';
  }
  function attrPanel(title, items, valueOf, glyph, extra, path) {
    if (!items.length) return '';
    const filled = items.filter(it => {
      const v = valueOf(it);
      return v !== '' && v != null;
    }).length;
    const rows = items.map(it => `<tr>
        <td class="al" title="${esc(it.label)}">${esc(it.label)}</td>
        <td class="av"${path ? ' ' + pv(path, it.key) : ''}>${glyph(valueOf(it))}</td></tr>`).join('');
    return `<div class="sc-panel"><h4><span>${esc(title)}</span>${extra || ''}
      <span class="cov">${filled}/${items.length}</span></h4>
      <table class="sc-arow"><tbody>${rows}</tbody></table></div>`;
  }
  /** COMPS-bound fees only — the tracker-only ones have no compsLabel. */
  function compsFees() {
    return (SCHEMA.fees || []).filter(f => f.compsLabel);
  }
  function isPrimary(group, key) { return (PRIMARY[group] || []).indexOf(key) !== -1; }

  /** The values one side shows, read once and shared by both attribute blocks. */
  function attrSource(who, isSubject) {
    /* PHYSICAL / AMENITIES, not SCHEMA.physical / SCHEMA.amenities: those are the
       MF branch specifically, so reading them here pinned the Screener to MF's
       field list and row map no matter which template the open deal is on. The
       getters follow the record's family. (SCHEMA.fees is correct as-is — fees
       are shared across both templates and name no row.) */
    const P = isSubject && who
      ? PHYSICAL.reduce((a, it) => { a[it.key] = subjectPhysicalValue(it, who); return a; }, {})
      : ((who && who.physical) || {});
    /* The subject's band has been captured since 2026-11-17 (tab 1, or Import
       from Proforma). The badge says so only when nothing is recorded yet, and
       points at where to fill it. */
    const src = isSubject && !subjectBandHasData(who)
      ? '<span class="src" title="Nothing recorded for the subject yet — fill it on tab 1, or import it from the proforma">not captured</span>'
      : '';
    const A = (who && who.amenities) || {};
    /* A retired Amenities answer that disagreed with its Physical twin when
       foldRetiredAttrs() ran: show both, flagged, while the Physical answer is
       still the one that was kept. `from` stays empty now that no value is
       borrowed from another group; physPath() keeps reading it for safety. */
    const PM = Object.assign({}, P), from = {}, clash = {};
    const rc = (who && who.retired_conflicts) || {};
    Object.keys(rc).forEach(k => {
      const x = rc[k] || {};
      if (String(P[k] == null ? '' : P[k]).trim().toUpperCase() === String(x.kept == null ? '' : x.kept).trim().toUpperCase()) {
        clash[k] = { a: P[k], b: x.value, label: x.label };
      }
    });
    return {
      P: PM, A, F: (who && who.fees) || {}, src, from, clash,
      base: isSubject ? 'subject' : (who && who.compId ? 'comp:' + who.compId : ''),
      fees: compsFees().map(f => ({ key: f.key, label: f.compsLabel || f.label })),
    };
  }
  /** Source-card path for a Physical row that may be showing its Amenities twin. */
  function physPath(d, key) {
    if (!d.base) return '';
    const f = d.from[key];
    return f ? pv(d.base + '.amenities', f.split(':')[1]) : pv(d.base + '.physical', key);
  }
  function physGlyph(d, key) {
    const c = d.clash[key];
    if (!c) return triGlyph(d.P[key]);
    const t = 'Physical says ' + c.a + '; the retired Amenities row "' + (c.label || 'Amenities') + '" said ' + c.b +
      '. Physical is kept: edit the value to clear this.';
    return '<span class="sc-txt sc-clash" title="' + esc(t) + '">' + esc(c.a + ' / ' + c.b) + '</span>';
  }

  /** Key attributes: every primary field from all three groups in one panel,
      in two columns. Both sides list the same items in the same order, so the
      subject and comp rows line up across the split. */
  /** The fee strip: every COMPS fee, always, in one row of label-over-value
      cells. Same order on both sides. */
  function feesStripHtml(d) {
    const cells = d.fees.map(f => `<div class="sc-fcell">
        <span class="fl" title="${esc(f.label)}">${esc(f.label)}</span>
        <span class="fv"${d.base ? ' ' + pv(d.base + '.fees', f.key) : ''}>${feeGlyph(d.F[f.key])}</span></div>`).join('');
    const filled = d.fees.filter(f => { const v = d.F[f.key]; return v !== '' && v != null; }).length;
    return `<div class="sc-panel sc-feesp"><h4><span>Fees</span>
        <span class="cov">${filled}/${d.fees.length}</span></h4>
      <div class="sc-frow">${cells}</div></div>`;
  }

  function primaryHtml(who, isSubject) {
    const d = attrSource(who, isSubject);
    const items = [];
    PHYSICAL.forEach(it => { if (isPrimary('physical', it.key)) items.push({ label: it.label, v: d.P[it.key], at: physPath(d, it.key), html: physGlyph(d, it.key) }); });
    amenitiesShown().forEach(it => { if (isPrimary('amenities', it.key)) items.push({ label: it.label, v: d.A[it.key], at: d.base ? pv(d.base + '.amenities', it.key) : '', html: triGlyph(d.A[it.key]) }); });
    const fees = feesStripHtml(d);
    if (!items.length) return fees;
    const filled = items.filter(x => x.v !== '' && x.v != null).length;
    const row = x => `<tr><td class="al" title="${esc(x.label)}">${esc(x.label)}</td>
        <td class="av"${x.at ? ' ' + x.at : ''}>${x.html}</td></tr>`;
    const half = Math.ceil(items.length / 2);
    return fees + `<div class="sc-panel sc-prim"><h4><span>Key attributes</span>${d.src}
        <span class="cov">${filled}/${items.length}</span></h4>
      <div class="sc-pcols">
        <table class="sc-arow"><tbody>${items.slice(0, half).map(row).join('')}</tbody></table>
        <table class="sc-arow"><tbody>${items.slice(half).map(row).join('')}</tbody></table>
      </div></div>`;
  }

  /** Everything not in the key block: Physical and Amenities (fees are all up top). */
  function otherAttrsHtml(who, isSubject) {
    const d = attrSource(who, isSubject);
    const phys = PHYSICAL.filter(it => !isPrimary('physical', it.key));
    const physRows = phys.length ? `<div class="sc-panel"><h4><span>Physical</span>${d.src}
        <span class="cov">${phys.filter(it => d.P[it.key] !== '' && d.P[it.key] != null).length}/${phys.length}</span></h4>
      <table class="sc-arow"><tbody>${phys.map(it => `<tr>
        <td class="al" title="${esc(it.label)}">${esc(it.label)}</td>
        <td class="av"${d.base ? ' ' + physPath(d, it.key) : ''}>${physGlyph(d, it.key)}</td></tr>`).join('')}</tbody></table></div>` : '';
    return physRows
      + attrPanel('Amenities', amenitiesShown().filter(it => !isPrimary('amenities', it.key)),
        it => d.A[it.key], triGlyph, d.src, d.base && d.base + '.amenities');
  }
  function otherCount() {
    return PHYSICAL.filter(it => !isPrimary('physical', it.key)).length
      + amenitiesShown().filter(it => !isPrimary('amenities', it.key)).length;
  }

  // -------------------------------------------------------------- photo band
  /* `side` = 'subject' | 'comp'. An EMPTY tile (read finished, no photo) is a drop target and a click-to-pick
     button (owner, 2026-11-24): the photo goes to the deal folder through photos.js phScreenerDrop, exactly where
     the tab-1 / tab-2 Photos cards put it, then the strip re-reads Drive. Filled tiles are not targets — replacing
     a photo stays on tab 1 / tab 2, where the ✕ and the full card are. */
  function photoStripHtml(set, label, side) {
    const have = set && set !== 'none' ? Object.keys(set).length : 0;
    const canDrop = !!(side && window.PHOTOS && window.PHOTOS.screenerDrop);
    const owner = side === 'comp' && SC.photoComp ? SC.photoComp.compId + ':' : '';
    const tiles = PHOTO_SLOTS.map(s => {
      const src = set && set !== 'none' ? set[s] : null;
      if (src) {
        return `<div class="sc-shot"><img src="${src}" alt="${esc(s)}" loading="lazy" />
          <div class="cap">${esc(s)}</div></div>`;
      }
      const pending = set == null;
      const up = SC.photoUp[side + ':' + owner + s];
      if (pending || !canDrop) {
        return `<div class="sc-shot none"><div class="ph">${pending ? 'loading' : 'no photo'}</div>
        <div class="cap">${esc(s)}</div></div>`;
      }
      return `<div class="sc-shot none drop${up ? ' busy' : ''}" data-scdrop="${esc(side)}" data-scslot="${esc(s)}"
        title="Drop a photo here, or click to choose one — saved to the deal folder on Drive">
        <div class="ph">${up ? 'uploading…' : 'no photo<small>drop or click</small>'}</div>
        <div class="cap">${esc(s)}</div>
        <input type="file" accept="image/*" class="sc-pick" hidden /></div>`;
    }).join('');
    return `<div class="sc-phead"><span>${esc(label)}</span>
      <span class="cov">${set == null ? '' : have + '/' + PHOTO_SLOTS.length}</span></div>
      <div class="sc-strip">${tiles}</div>`;
  }

  // ------------------------------------------------------------------- shell
  function renderScreener() {
    const host = $('#phase-content');
    host.classList.remove('narrow');

    const withSubject = bucketsWithSubject();
    if (!SC.bucket || !subjectRowsFor(SC.bucket).length) {
      let best = null, bestUnits = -1;
      withSubject.forEach(b => {
        const u = subjectRowsFor(b.key).reduce((a, r) => a + num(r.count), 0);
        if (u > bestUnits) { bestUnits = u; best = b.key; }
      });
      SC.bucket = best || (BUCKETS[0] && BUCKETS[0].key);
      SC.anchor = anchorRowFor(SC.bucket);
      SC.compIdx = 0;
    }
    if (SC.anchor >= subjectRowsFor(SC.bucket).length) SC.anchor = anchorRowFor(SC.bucket);

    if (!withSubject.length) {
      host.innerHTML = `<div class="card"><div class="card-body">
        <div class="chk err"><span class="ico">✖</span><span>The subject has no unit mix.
        Add floor plans on tab 1 — or import them from the proforma — before setting market rents.</span></div>
      </div></div>`;
      return;
    }

    const list = cycleFor(SC.bucket);
    const sel = list[Math.min(SC.compIdx, list.length - 1)];
    /* The internal comp IS the subject: no photos or attributes of its own. */
    const comp = isInternal(sel) ? null : sel;
    const sameAsSubject = isInternal(sel)
      ? '<div class="sc-empty"><span>Internal comp — same property as the subject (left).</span></div>' : '';
    const other = showOther();
    const photos = showPhotos();
    SC.photoComp = comp;

    host.innerHTML = `<div class="screener">
      ${railHtml()}
      <div class="sc-split sc-band2">
        <div class="sc-side left" id="sc-subj">${subjectPaneHtml()}</div>
        <div class="sc-side" id="sc-comp">${compPaneHtml()}</div>
      </div>
      <div class="sc-legend sc-pbar">
        <b>Photos</b>
        <button type="button" class="sc-other" id="sc-photos-tog" aria-expanded="${photos ? 'true' : 'false'}">${
          photos ? 'Hide photos' : 'Show photos'}</button>
      </div>
      ${photos ? `<div class="sc-split sc-band4">
        <div class="sc-side left"><div class="sc-photos" id="sc-sphotos">${
          photoStripHtml(SC.photos['subject'], 'Subject', 'subject')}</div></div>
        <div class="sc-side"><div class="sc-photos" id="sc-cphotos">${
          comp ? photoStripHtml(SC.photos['comp:' + comp.compId], 'Comp', 'comp') : sameAsSubject}</div></div>
      </div>` : ''}
      <div class="sc-legend">
        <b>Attributes</b>
        <i><span class="sc-g y">Y</span> has</i>
        <i><span class="sc-g n">N</span> hasn't</i>
        <i><span class="sc-g b">·</span> not captured</i>
        <button type="button" class="sc-other" id="sc-other" aria-expanded="${other ? 'true' : 'false'}">${
          other ? 'Hide' : 'Show'} the other ${otherCount()} fields</button>
      </div>
      <div class="sc-split sc-band3">
        <div class="sc-side left"><div class="sc-attrs col">${primaryHtml(STATE.subject, true)}</div></div>
        <div class="sc-side"><div class="sc-attrs col">${comp ? primaryHtml(comp, false) : sameAsSubject}</div></div>
      </div>
      ${other ? `<div class="sc-split sc-band3 sc-band3b">
        <div class="sc-side left"><div class="sc-attrs">${otherAttrsHtml(STATE.subject, true)}</div></div>
        <div class="sc-side"><div class="sc-attrs">${comp ? otherAttrsHtml(comp, false) : ''}</div></div>
      </div>` : ''}
    </div>`;

    wire();
    if (photos) { wirePhotoDrops(); loadPhotos(comp); }   // no Drive calls while the section is shut
  }

  function loadPhotos(comp) {
    if (SC.photos['subject'] == null) {
      resolvePhotos('subject').then(set => {
        if (set == null) return;
        repaintStrip('subject');
      });
    }
    if (comp) {
      const k = 'comp:' + comp.compId;
      if (SC.photos[k] == null) {
        const idx = sortedComps().indexOf(comp);
        resolvePhotos('comp', comp, idx).then(set => {
          if (set == null) return;
          if (SC.photoComp !== comp) return;           // user moved to another comp meanwhile
          repaintStrip('comp');
        });
      }
    }
  }

  /** Re-render one strip in place (still on Market Rents) and re-wire its drop targets. */
  function repaintStrip(side) {
    if (CURRENT_PHASE !== 3) return;
    const el = $(side === 'subject' ? '#sc-sphotos' : '#sc-cphotos');
    if (!el) return;
    if (side === 'subject') el.innerHTML = photoStripHtml(SC.photos['subject'], 'Subject', 'subject');
    else if (SC.photoComp) el.innerHTML = photoStripHtml(SC.photos['comp:' + SC.photoComp.compId], 'Comp', 'comp');
    wirePhotoDrops();
  }

  /* Drop / click-to-pick on the empty tiles. Handlers are bound on the tiles each paint (they toggle a class on
     the tile under the pointer). The whole photo band also swallows drops, so a photo let go between tiles does
     not make the browser open the image and leave the page. */
  function wirePhotoDrops() {
    const band = $('#phase-content .sc-band4');
    if (band && !band.dataset.guarded) {
      band.dataset.guarded = '1';
      band.addEventListener('dragover', ev => ev.preventDefault());
      band.addEventListener('drop', ev => ev.preventDefault());
    }
    $$('#phase-content [data-scdrop]').forEach(el => {
      const side = el.getAttribute('data-scdrop'), slot = el.getAttribute('data-scslot');
      const send = files => dropPhoto(side, slot, files);
      el.ondragover = ev => { ev.preventDefault(); el.classList.add('over'); };
      el.ondragenter = ev => { ev.preventDefault(); el.classList.add('over'); };
      el.ondragleave = () => el.classList.remove('over');
      el.ondrop = ev => {
        ev.preventDefault(); ev.stopPropagation(); el.classList.remove('over');
        const dt = ev.dataTransfer;
        if (dt && dt.files && dt.files.length) send(Array.from(dt.files));
      };
      const input = el.querySelector('input.sc-pick');
      el.onclick = ev => { if (input && ev.target !== input) input.click(); };
      if (input) input.onchange = () => {
        const files = Array.from(input.files || []);   // copy BEFORE clearing: input.files is live
        input.value = '';
        if (files.length) send(files);
      };
    });
  }

  async function dropPhoto(side, slot, files) {
    const comp = side === 'comp' ? SC.photoComp : null;
    if (side === 'comp' && !comp) return;
    const upKey = side + ':' + (comp ? comp.compId + ':' : '') + slot;
    if (SC.photoUp[upKey]) return;
    SC.photoUp[upKey] = true;
    repaintStrip(side);
    let ok = false;
    try { ok = await window.PHOTOS.screenerDrop(side, comp, slot, files); }
    finally { delete SC.photoUp[upKey]; }
    if (ok) {
      /* phScreenerDrop already dropped the cached strip; read Drive again for the side that changed. */
      if (side === 'subject') delete SC.photos['subject'];
      else delete SC.photos['comp:' + comp.compId];
      if (CURRENT_PHASE === 3 && showPhotos()) loadPhotos(side === 'comp' ? (SC.photoComp === comp ? comp : null) : null);
    }
    if (side === 'subject' || SC.photoComp === comp) repaintStrip(side);
  }

  function wire() {
    $$('#phase-content [data-scbkt]').forEach(b => {
      b.onclick = () => {
        SC.bucket = b.getAttribute('data-scbkt');
        SC.compIdx = 0;
        SC.anchor = anchorRowFor(SC.bucket);
        renderScreener();
      };
    });
    $$('#phase-content [data-scrow]').forEach(tr => {
      tr.onclick = e => {
        if (e.target && e.target.classList.contains('sc-mrent')) return;
        SC.anchor = Number(tr.getAttribute('data-scrow'));
        renderScreener();
      };
    });
    $$('#phase-content [data-scmkt]').forEach(inp => {
      inp.oninput = () => {
        const rows = subjectRowsFor(SC.bucket);
        const r = rows[Number(inp.getAttribute('data-scmkt'))];
        if (!r) return;
        setMarketForPlan(SC.bucket, r.plan, inp.value.trim());
        repaintMarket();
      };
    });
    $$('#phase-content [data-sccomp]').forEach(d => {
      d.onclick = () => {
        const list = cycleFor(SC.bucket);
        const i = list.findIndex(x => x.compId === d.getAttribute('data-sccomp'));
        if (i >= 0) { SC.compIdx = i; renderScreener(); }
      };
    });
    const prev = $('#sc-prev'), next = $('#sc-next'), apply = $('#sc-apply');
    const otherBtn = $('#sc-other');
    if (otherBtn) otherBtn.onclick = () => { setShowOther(!showOther()); renderScreener(); };
    const photoBtn = $('#sc-photos-tog');
    if (photoBtn) photoBtn.onclick = () => { writeOn(PHOTOS_KEY, !showPhotos()); renderScreener(); };
    if (prev) prev.onclick = () => {
      const n = cycleFor(SC.bucket).length;
      if (n) { SC.compIdx = (SC.compIdx - 1 + n) % n; renderScreener(); }
    };
    if (next) next.onclick = () => {
      const n = cycleFor(SC.bucket).length;
      if (n) { SC.compIdx = (SC.compIdx + 1) % n; renderScreener(); }
    };
    /* Internal comp controls. The two filters are saved on the record (and so
       pushed to Drive), like COMPS!T4 / W4 live in the workbook. */
    const intBtn = $('#sc-int');
    if (intBtn) intBtn.onclick = () => { SC.compIdx = cycleFor(SC.bucket).length - 1; renderScreener(); };
    const setInt = patch => {
      STATE.internalComp = Object.assign({}, internalCompSettings(), patch);
      saveState();
      renderScreener();
    };
    const after = $('#sc-int-after');
    if (after) after.onchange = () => setInt({ moveInAfter: after.value || '' });
    const lb = $('#sc-int-lb');
    if (lb) lb.onchange = () => {
      const v = lb.value.trim();
      setInt({ lookbackMonths: v === '' ? '' : Math.max(0, Math.min(36, Math.round(Number(v)) || 0)) });
    };
    const reset = $('#sc-int-reset');
    if (reset) reset.onclick = () => setInt(Object.assign({}, INTERNAL_DEFAULTS));
    const lst = $('#sc-int-list');
    if (lst) lst.onclick = () => { SC.showLeases = !SC.showLeases; renderScreener(); };
    /* Internal comp: a plan row opens / closes its full unit list. */
    const ic = $('#sc-comp .sc-irow') ? internalCompFor(SC.bucket) : null;
    const ikey = x => (x.plan || '') + '|' + (x.status || '');
    $$('#sc-comp [data-scint]').forEach(tr => {
      tr.onclick = () => {
        const x = ic && ic.rows[Number(tr.getAttribute('data-scint'))];
        if (!x || !x.total) return;
        SC.openInt = SC.openInt || {};
        SC.openInt[ikey(x)] = !SC.openInt[ikey(x)];
        renderScreener();
      };
    });
    /* Hand-untick a lease (saved on the record, pushed to Drive). The click must
       not bubble to anything that re-renders first. */
    $$('#sc-comp [data-scunit]').forEach(cb => {
      cb.onclick = e => e.stopPropagation();
      cb.onchange = () => {
        const cur = internalCompSettings();
        const ex = Object.assign({}, cur.excluded || {});
        const k = cb.getAttribute('data-scunit');
        if (cb.checked) delete ex[k]; else ex[k] = true;
        setInt({ excluded: ex });
      };
    });
    const rechk = $('#sc-int-recheck');
    if (rechk) rechk.onclick = () => setInt({ excluded: {} });
    const exp = $('#sc-int-expand');
    if (exp) exp.onclick = () => {
      if (!ic) return;
      SC.openInt = SC.openInt || {};
      const anyOpen = ic.rows.some(x => SC.openInt[ikey(x)]);
      ic.rows.forEach(x => { SC.openInt[ikey(x)] = !anyOpen && x.total > 0; });
      renderScreener();
    };
    if (apply) apply.onclick = () => {
      const s = computeSuggested(SC.bucket);
      if (!(s.suggested > 0)) return;
      const seen = {};
      subjectRowsFor(SC.bucket).forEach(r => {
        if (seen[r.plan || '']) return;
        seen[r.plan || ''] = 1;
        setMarketForPlan(SC.bucket, r.plan, s.suggested);
      });
      renderScreener();
    };
  }

  /** Repaint only what a market-rent edit changes, so the input keeps focus. */
  function repaintMarket() {
    const rows = subjectRowsFor(SC.bucket);
    $$('#phase-content [data-scrow]').forEach(tr => {
      const r = rows[Number(tr.getAttribute('data-scrow'))];
      if (!r) return;
      const m = marketOf(r, SC.bucket);
      const inPlace = num(r.current_rent);
      const lift = m.value > 0 && inPlace > 0 ? m.value - inPlace : null;
      const cell = tr.cells[7] && tr.cells[7].firstElementChild;
      if (cell) {
        cell.className = 'sc-dlt ' + (lift == null ? 'flat' : (lift > 0 ? 'up' : (lift < 0 ? 'dn' : 'flat')));
        cell.textContent = lift == null ? '—'
          : (lift > 0 ? '+' : '−') + money(Math.abs(lift)).slice(1);
      }
      const inp = tr.querySelector('.sc-mrent');
      if (inp) {
        inp.className = 'sc-mrent ' + (m.src === 'user' ? 'user' : (m.src === 'proforma' ? 'seed' : 'none'));
        if (document.activeElement !== inp) inp.value = m.value > 0 ? Math.round(m.value) : '';
      }
    });
    const band = $('#phase-content .sc-band1');
    if (band) {
      const tmp = document.createElement('div');
      tmp.innerHTML = railHtml();
      band.parentNode.replaceChild(tmp.firstElementChild, band);
      wire();
    }
    const foot = $('#sc-subj .sc-foot');
    if (foot) {
      const roll = bucketRollup(SC.bucket);
      const kv = foot.querySelectorAll('.kv')[3];
      if (kv) {
        const v = kv.querySelector('.v');
        if (v) {
          v.textContent = roll.priced + '/' + roll.total;
          v.className = 'v' + (roll.priced < roll.total ? ' warn' : '');
        }
      }
    }
  }

  // Replace ui.js's Market Rents table. renderPhase3 is a global function
  // declaration, so every existing call site picks this up.
  window.renderPhase3 = renderScreener;

  /* A named surface for the pieces worth testing without a DOM — the node
     harness drives these directly. Everything else stays private to the IIFE. */
  window.SCREENER = {
    compsWithBucket, anchorRowFor, marketOf, setMarketForPlan,
    syncBucketOverride, bucketRollup, proformaSeed, sanitizeFolderName,
    primary: PRIMARY, retired: SCHEMA.retiredAmenities || [], state: SC,
    cycleFor, internal: INTERNAL,
  };
})();
