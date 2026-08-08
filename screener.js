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

  const SC = {
    bucket: null,
    compIdx: 0,
    anchor: 0,
    photos: {},                    // cacheKey -> {slot: objectURL} | 'none'
    photoBusy: {},
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
          const named = await findFolderChild(compsFolder.id, sanitizeFolderName(comp.name));
          if (named) {
            files = await listImages(named.id);
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
          <div class="val">${s.suggested > 0 ? money(s.suggested) : '—'}</div>
          <div class="sub">${esc(s.method)}${s.sampleRows ? ' · ' + s.sampleRows + 'r/' + s.sampleComps + 'c direct' : ''}</div></div>
        <button class="sc-apply" id="sc-apply"${s.suggested > 0 ? '' : ' disabled'}
          title="Write ${s.suggested > 0 ? money(s.suggested) : 'the suggested rent'} into every ${esc(bucketShortOf(SC.bucket))} plan below">
          Apply to all ${rows.length} &rarr;</button>
        <div class="sc-fig"><div class="lab">Set below</div>
          <div class="val">${roll.value > 0 ? money(roll.value) : '—'}</div>
          <div class="sub${roll.priced < roll.total ? ' warn' : ''}">${roll.priced}/${roll.total} rows · unit-wtd</div></div>
        <div class="sc-fig"><div class="lab">vs in-place</div>
          <div class="val ${delta >= 0 ? 'up' : 'dn'}">${delta ? (delta > 0 ? '+' : '−') + money(Math.abs(delta)).slice(1) : '—'}</div>
          <div class="sub">in-place ${inPlace > 0 ? money(inPlace) : '—'}</div></div>
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
        <span class="sc-name">${esc(s.name || STATE.name || '(unnamed)')}</span></div>
      <div class="sc-facts">
        <span>${esc(s.year_built || '—')}</span>
        <span>${s.total_units ? int(num(s.total_units)) + ' units' : '—'}</span>
        <span>W/D ${esc(s.wd_type || '—')}</span>
        <span>${esc(s.util_structure || '—')}</span>
      </div></div>`;

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
      return `<tr class="sc-pick${i === SC.anchor ? ' anchor' : ''}" data-scrow="${i}">
        <td class="l plan">${esc(r.plan || '—')}${i === SC.anchor ? ' <span class="sc-near">ANCHOR</span>' : ''}</td>
        <td class="l"><span class="sc-st ${statusClass(r.status)}">${esc(r.status || '—')}</span></td>
        <td>${r.sqft ? int(num(r.sqft)) : '—'}</td>
        <td>${r.count ? int(num(r.count)) : '—'}</td>
        <td class="sc-vac${hiVac ? ' hi' : ''}">${vacN == null ? '—' : int(vacN)}</td>
        <td class="rent">${inPlace > 0 ? money(inPlace) : '—'}</td>
        <td><input type="number" inputmode="decimal" step="any"
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
      </div>`;
  }

  function compPaneHtml() {
    const key = SC.bucket;
    const list = compsWithBucket(key);
    const all = sortedComps();

    if (!list.length) {
      return `<div class="sc-head">
          <div class="sc-htop"><span class="sc-tag untyped">None</span>
            <span class="sc-name">—</span></div>
          <div class="sc-facts"></div></div>
        <div class="sc-body"><div class="sc-empty">
          <span class="big">No comp has a ${esc(bucketShortOf(key))}</span>
          <span>${all.length} comps captured, none with this unit type</span></div></div>`;
    }
    if (SC.compIdx >= list.length) SC.compIdx = 0;
    const c = list[SC.compIdx];
    const meta = categoryMeta(c.category);
    const vac = num(c.vacancy_pct);
    const dists = all.map(x => num(x.distance_miles)).filter(v => v > 0);
    const allSameDist = dists.length > 2 && new Set(dists).size === 1;

    const dots = all.map(x => {
      const present = list.indexOf(x) !== -1;
      return `<button class="sc-dot${x === c ? ' on' : ''}${present ? '' : ' absent'}"
        ${present ? '' : 'disabled'} data-sccomp="${esc(x.compId)}"
        title="${esc(x.name || 'comp')}${present ? '' : ' — no ' + esc(bucketShortOf(key))}"
        aria-label="${esc(x.name || 'comp')}"></button>`;
    }).join('');

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
      return `<tr>
        <td class="l plan">${esc(r.plan || '—')}${r === nearest ? ' <span class="sc-near">NEAREST</span>' : ''}</td>
        <td>${sf ? int(sf) : '—'}</td>
        <td>${r.count ? int(num(r.count)) : '—'}</td>
        <td class="rent">${ask > 0 ? money(ask) : '—'}</td>
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
          <span class="sc-name">${esc(c.name || '(unnamed)')}</span>
          <div class="sc-cyc">
            <button id="sc-prev" title="Previous comp with this unit type" aria-label="Previous comp">◀</button>
            <span class="pos">${SC.compIdx + 1} / ${list.length}</span>
            <button id="sc-next" title="Next comp with this unit type" aria-label="Next comp">▶</button>
            <div class="sc-dots">${dots}</div>
          </div>
        </div>
        <div class="sc-facts">
          <span${String(c.year_built) === '1950' ? ' class="flag"' : ''}>${esc(c.year_built || '—')}${String(c.year_built) === '1950' ? ' ⚑' : ''}</span>
          <span>${c.total_units ? int(num(c.total_units)) + ' units' : '—'}</span>
          <span${allSameDist ? ' class="flag"' : ''}>${c.distance_miles ? num(c.distance_miles).toFixed(2) + ' mi' : '—'}${allSameDist ? ' ⚑' : ''}</span>
          <span${vac > 30 ? ' class="flag"' : ''}>${c.vacancy_pct !== '' && c.vacancy_pct != null ? vac + '% vac' : '—'}${vac > 30 ? ' ⚑' : ''}</span>
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
    return '<span class="sc-txt">' + esc(v) + '</span>';
  }
  function feeGlyph(v) {
    const s = String(v == null ? '' : v).trim();
    if (s === '') return '<span class="sc-fee zero">·</span>';
    const n = Number(s);
    return '<span class="sc-fee">' + (isNaN(n) ? esc(s) : money(n)) + '</span>';
  }
  function attrPanel(title, items, valueOf, glyph, extra) {
    const filled = items.filter(it => {
      const v = valueOf(it);
      return v !== '' && v != null;
    }).length;
    const rows = items.map(it => `<tr>
        <td class="al" title="${esc(it.label)}">${esc(it.label)}</td>
        <td class="av">${glyph(valueOf(it))}</td></tr>`).join('');
    return `<div class="sc-panel"><h4><span>${esc(title)}</span>${extra || ''}
      <span class="cov">${filled}/${items.length}</span></h4>
      <table class="sc-arow"><tbody>${rows}</tbody></table></div>`;
  }
  /** COMPS-bound fees only — the tracker-only ones have no compsLabel. */
  function compsFees() {
    return (SCHEMA.fees || []).filter(f => f.compsLabel);
  }
  function attrsHtml(who, isSubject) {
    const phys = SCHEMA.physical || [];
    const amen = SCHEMA.amenities || [];
    const fees = compsFees();
    const src = isSubject
      ? '<span class="src" title="The tracker does not capture attributes on the subject yet — see Comp Screen Design.md §9.1">not captured</span>'
      : '';
    const P = (who && who.physical) || {};
    const A = (who && who.amenities) || {};
    const F = (who && who.fees) || {};
    return attrPanel('Physical', phys, it => P[it.key], triGlyph, src)
      + attrPanel('Amenities', amen, it => A[it.key], triGlyph, src)
      + attrPanel('Fees', fees.map(f => ({ key: f.key, label: f.compsLabel || f.label })),
        it => F[it.key], feeGlyph, src);
  }

  // -------------------------------------------------------------- photo band
  function photoStripHtml(set, label) {
    const have = set && set !== 'none' ? Object.keys(set).length : 0;
    const tiles = PHOTO_SLOTS.map(s => {
      const src = set && set !== 'none' ? set[s] : null;
      if (src) {
        return `<div class="sc-shot"><img src="${src}" alt="${esc(s)}" loading="lazy" />
          <div class="cap">${esc(s)}</div></div>`;
      }
      const pending = set == null;
      return `<div class="sc-shot none"><div class="ph">${pending ? 'loading' : 'no photo'}</div>
        <div class="cap">${esc(s)}</div></div>`;
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

    const list = compsWithBucket(SC.bucket);
    const comp = list.length ? list[Math.min(SC.compIdx, list.length - 1)] : null;

    host.innerHTML = `<div class="screener">
      ${railHtml()}
      <div class="sc-split sc-band2">
        <div class="sc-side left" id="sc-subj">${subjectPaneHtml()}</div>
        <div class="sc-side" id="sc-comp">${compPaneHtml()}</div>
      </div>
      <div class="sc-split sc-band3">
        <div class="sc-side left"><div class="sc-attrs">${attrsHtml(STATE.subject, true)}</div></div>
        <div class="sc-side"><div class="sc-attrs">${comp ? attrsHtml(comp, false) : ''}</div></div>
      </div>
      <div class="sc-split sc-band4">
        <div class="sc-side left"><div class="sc-photos" id="sc-sphotos">${
          photoStripHtml(SC.photos['subject'], 'Photos')}</div></div>
        <div class="sc-side"><div class="sc-photos" id="sc-cphotos">${
          comp ? photoStripHtml(SC.photos['comp:' + comp.compId], 'Photos') : ''}</div></div>
      </div>
      <div class="sc-legend">
        <i><span class="sc-g y">Y</span> has</i>
        <i><span class="sc-g n">N</span> hasn't</i>
        <i><span class="sc-g b">·</span> not captured</i>
        <i><span class="sc-mrent seed sample">seed</span> from proforma</i>
        <i><span class="sc-mrent none sample"></span> needs a value</i>
      </div>
    </div>`;

    wire();
    loadPhotos(comp);
  }

  function loadPhotos(comp) {
    if (SC.photos['subject'] == null) {
      resolvePhotos('subject').then(set => {
        if (set == null) return;
        const el = $('#sc-sphotos');
        if (el && CURRENT_PHASE === 3) el.innerHTML = photoStripHtml(set, 'Photos');
      });
    }
    if (comp) {
      const k = 'comp:' + comp.compId;
      if (SC.photos[k] == null) {
        const idx = sortedComps().indexOf(comp);
        resolvePhotos('comp', comp, idx).then(set => {
          if (set == null) return;
          const el = $('#sc-cphotos');
          if (el && CURRENT_PHASE === 3) el.innerHTML = photoStripHtml(set, 'Photos');
        });
      }
    }
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
        const list = compsWithBucket(SC.bucket);
        const i = list.findIndex(x => x.compId === d.getAttribute('data-sccomp'));
        if (i >= 0) { SC.compIdx = i; renderScreener(); }
      };
    });
    const prev = $('#sc-prev'), next = $('#sc-next'), apply = $('#sc-apply');
    if (prev) prev.onclick = () => {
      const n = compsWithBucket(SC.bucket).length;
      if (n) { SC.compIdx = (SC.compIdx - 1 + n) % n; renderScreener(); }
    };
    if (next) next.onclick = () => {
      const n = compsWithBucket(SC.bucket).length;
      if (n) { SC.compIdx = (SC.compIdx + 1) % n; renderScreener(); }
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
    state: SC,
  };
})();
