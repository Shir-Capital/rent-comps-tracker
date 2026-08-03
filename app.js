/* ============================================================================
   Rent Comps Tracker — app.js
   Boot, event wiring, drawer, and hash routing. Everything else lives in
   core.js / drive.js / ui.js / export.js.
   ========================================================================= */

'use strict';

// ---------------------------------------------------------------- routing
let _pendingDeepLink = null;

function routeFromHash() {
  if (SUPPRESS_HASH_ROUTE) return;
  const route = parseHash();
  if (route.kind === 'home') {
    if (STATE) showHome(); else { showHome(); }
    return;
  }
  const local = findLocalPropertyByHash(route);
  if (local) {
    if (!STATE || STATE.id !== local.id) openProperty(local.id, { noHash: true });
    return;
  }
  // Not on this device — remember it and try again once the manifest lands.
  _pendingDeepLink = route;
  showHome();
  tryOpenPendingDeepLink();
}

async function tryOpenPendingDeepLink() {
  if (!_pendingDeepLink) return;
  if (!driveConnected()) return;
  const m = await fetchManifest(true);
  if (!m) return;
  const route = _pendingDeepLink;
  const list = m.data.properties || [];
  let entry = null;
  if (route.kind === 'id') entry = list.find(e => e.id === route.value);
  else {
    const want = route.value.toLowerCase();
    entry = list.filter(e => String(e.slug || slugify(e.name)).toLowerCase() === want)
      .sort((a, b) => String(b.lastModified || '').localeCompare(String(a.lastModified || '')))[0];
  }
  if (!entry) { toast('That property link is not on Drive'); _pendingDeepLink = null; return; }
  _pendingDeepLink = null;
  await openRemoteProperty(entry);
}

// ----------------------------------------------------------------- drawer
function openDrawer() {
  $('#menu-drawer').classList.remove('hidden');
  updateDriveStatus();
  updateSyncStatus();
  updateFolderStatus();
  updateHelloDataStatus();
  updateAsanaStatus();
}
function closeDrawer() { $('#menu-drawer').classList.add('hidden'); }

function updateHelloDataStatus() {
  const n = $('#hellodata-key-status');
  if (!n) return;
  const k = getHelloDataKey();
  if (k) { n.textContent = 'Personal key set (' + k.slice(0, 8) + '…)'; return; }
  n.textContent = 'Checking org-shared key…';
  resolveHelloDataKey().then(v => {
    n.textContent = v ? 'Using org-shared key (Drive)' : 'No key set';
  }).catch(() => { n.textContent = 'No key set'; });
}

function updateAsanaStatus() {
  const n = $('#asana-token-status');
  if (!n) return;
  const t = getAsanaToken();
  if (t) { n.textContent = 'Personal token set (' + t.slice(0, 8) + '…)'; return; }
  n.textContent = 'Checking org-shared token…';
  resolveAsanaToken().then(v => {
    n.textContent = v ? 'Using org-shared token (Drive)' : 'No token set';
  }).catch(() => { n.textContent = 'No token set'; });
}

// -------------------------------------------------------------------- wire
function wireHeader() {
  $('#btn-menu').onclick = openDrawer;
  $('.drawer-close').onclick = closeDrawer;
  $('#btn-back').onclick = () => {
    if (CURRENT_PHASE === 2 && OPEN_COMP_ID) { OPEN_COMP_ID = null; renderPhase2(); return; }
    closeProperty();
  };

  $$('#phase-tabs .tab').forEach(t => {
    t.onclick = () => gotoPhase(Number(t.getAttribute('data-phase')));
  });

  document.addEventListener('click', (ev) => {
    const drawer = $('#menu-drawer');
    if (drawer.classList.contains('hidden')) return;
    if (drawer.contains(ev.target) || ev.target.closest('#btn-menu')) return;
    closeDrawer();
  });
}

function wireHomeDelegation() {
  const host = $('#home-content');
  host.addEventListener('click', (ev) => {
    const dismiss = ev.target.closest('#btn-onboard-dismiss');
    if (dismiss) {
      localStorage.setItem(ONBOARDING_DISMISSED_KEY, '1');
      const o = $('#onboard');
      if (o) o.remove();
      return;
    }
    const refresh = ev.target.closest('#btn-home-refresh');
    if (refresh) {
      if (!driveConnected()) { driveConnect(); return; }
      toast('Refreshing…');
      refreshHomeIndex();
      return;
    }
    const add = ev.target.closest('#btn-new-prop');
    if (add) {
      const name = prompt('Subject property name?\n\n'
        + 'Use the deal-folder name so the Drive link and Asana match, e.g. "AUS TX - Crestwood".');
      if (!name || !name.trim()) return;
      const p = newProperty(name.trim());
      openProperty(p.id);
      setTimeout(() => promptFindFolderOnCreate(), 250);
      return;
    }
    const openLocal = ev.target.closest('[data-open]');
    if (openLocal) { openProperty(openLocal.getAttribute('data-open')); return; }
    const openRemote = ev.target.closest('[data-openremote]');
    if (openRemote) {
      const id = openRemote.getAttribute('data-openremote');
      const entry = ((MANIFEST_CACHE && MANIFEST_CACHE.data && MANIFEST_CACHE.data.properties) || [])
        .find(e => e.id === id);
      if (entry) openRemoteProperty(entry);
    }
  });
}

/** New-property flow: offer the three linking choices, same as Capex Builder. */
async function promptFindFolderOnCreate() {
  if (!STATE) return;
  const choice = prompt('Link this subject to its Drive deal folder?\n\n'
    + '1 = Search the pipelines by name (recommended)\n'
    + '2 = Paste a folder URL or ID\n'
    + '3 = Skip for now\n\nType 1, 2 or 3:');
  if (choice === '1') await promptFindFolder();
  else if (choice === '2') await promptLinkFolderByUrl();
}

function wireDrawer() {
  $('#btn-drive-connect').onclick = () => driveConnect();

  $('#btn-find-folder').onclick = () => { closeDrawer(); promptFindFolder(); };
  $('#btn-link-folder').onclick = () => { closeDrawer(); promptLinkFolderByUrl(); };

  $('#btn-rename').onclick = () => {
    if (!STATE) return;
    const nm = prompt('Rename this subject:', STATE.name);
    if (!nm || !nm.trim()) return;
    STATE.name = nm.trim();
    STATE.subject.name = nm.trim();
    saveState();
    $('#header-title').textContent = STATE.name;
    setHash(propertyHash(STATE));
    renderCurrentPhase();
    toast('Renamed — the old shareable URL is now stale');
  };

  $('#btn-delete').onclick = async () => {
    if (!STATE) return;
    if (!confirm('Remove "' + STATE.name + '" from THIS device?\n\n'
      + 'The Drive copy in 3. Comps / Rent Comps Tracker is left alone — delete it there '
      + 'too if you want it gone org-wide.')) return;
    const id = STATE.id;
    delete STORE.properties[id];
    saveStore();
    await removeManifestEntry(id);
    closeDrawer();
    closeProperty();
    toast('Removed from this device');
  };

  $('#btn-resync').onclick = () => { closeDrawer(); pullFromDrive(); };
  $('#btn-export-json').onclick = () => { closeDrawer(); exportPopulatorJson(); };
  $('#btn-export-xlsx').onclick = () => { closeDrawer(); exportWorkbook({ toDrive: true }); };

  $('#btn-set-hellodata-key').onclick = async () => {
    const cur = getHelloDataKey();
    const k = prompt('HelloData API key (stored on this device only):', cur);
    if (k == null) return;
    if (k.trim()) localStorage.setItem(HELLODATA_KEY_STORAGE, k.trim());
    else localStorage.removeItem(HELLODATA_KEY_STORAGE);
    updateHelloDataStatus();
    toast(k.trim() ? 'Key saved on this device' : 'Personal key cleared');
  };
  $('#btn-share-hellodata-key').onclick = async () => {
    const k = getHelloDataKey();
    if (!k) { toast('Set a personal key first'); return; }
    if (!driveConnected()) { toast('Connect Google Drive first'); return; }
    if (!confirm('Write this key to ' + CONFIG_FILENAME + ' in the applet\'s Drive folder?\n\n'
      + 'Everyone in the org who uses this app will then be able to use it.')) return;
    try {
      await saveSharedConfigKey('hellodata_api_key', k);
      updateHelloDataStatus();
      toast('Key shared org-wide');
    } catch (e) { toast('Share failed: ' + (e.message || e)); }
  };

  $('#btn-set-asana-token').onclick = () => {
    const cur = getAsanaToken();
    const t = prompt('Asana personal access token (stored on this device only):', cur);
    if (t == null) return;
    if (t.trim()) localStorage.setItem(ASANA_TOKEN_STORAGE, t.trim());
    else localStorage.removeItem(ASANA_TOKEN_STORAGE);
    updateAsanaStatus();
    toast(t.trim() ? 'Token saved on this device' : 'Personal token cleared');
  };
  $('#btn-share-asana-token').onclick = async () => {
    const t = getAsanaToken();
    if (!t) { toast('Set a personal token first'); return; }
    if (!driveConnected()) { toast('Connect Google Drive first'); return; }
    if (!confirm('Write this token to ' + CONFIG_FILENAME + ' in the applet\'s Drive folder?')) return;
    try {
      await saveSharedConfigKey('asana_pat', t);
      updateAsanaStatus();
      toast('Token shared org-wide');
    } catch (e) { toast('Share failed: ' + (e.message || e)); }
  };
  $('#btn-link-asana').onclick = () => { closeDrawer(); syncLinkToAsana(true); };
}

// -------------------------------------------------------------------- boot
async function boot() {
  if (!window.SCHEMA || !Array.isArray(window.SCHEMA.unitBuckets)) {
    document.body.innerHTML = '<p style="padding:20px;font:16px system-ui">'
      + 'schema.js failed to load. Run <code>python Accessories/build_schema.py</code> and redeploy.</p>';
    return;
  }

  loadStore();

  const phaseHost = $('#phase-content');
  wireFieldDelegation(phaseHost);
  wireUnitMixDelegation(phaseHost);
  wireTriDelegation(phaseHost);
  wireHeader();
  wireHomeDelegation();
  wireDrawer();

  window.addEventListener('hashchange', routeFromHash);

  // Paint from cache first so the app is usable offline, then resume Drive.
  routeFromHash();

  const resumed = await driveSilentResume();
  if (resumed) {
    refreshHomeIndex();
    tryOpenPendingDeepLink();
    if (STATE) { reconcileFromDrive(); startAutoSync(); maybeAutoLinkFolder(); }
  }
}

document.addEventListener('DOMContentLoaded', boot);
