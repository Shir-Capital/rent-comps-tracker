/* ==========================================================================
   User guide + help prompt (2026-11-25).
   ONE source for three outputs:
     - the in-app guide (the ? button in the header, and ☰ → Help);
     - "📋 Copy help prompt for Claude" — the same text under an instruction
       block, to paste into Claude and ask questions about the app;
     - the Word guide in APPLETS\Rent Comps Tracker\GUIDE\, built from this file
       by help\export_guide.js + build_guide_docx.py (in the deploy's Backups
       folder).
   When a change moves a button or renames a label, fix the text here in the
   same commit, bump HELP_GUIDE_VERSION, and rebuild the Word guide.
   Markup inside strings: **bold**, `On-screen label`.
   ========================================================================== */
const HELP_GUIDE_VERSION = 'v1 · 2026-11-25';

const HELP_PROMPT_INTRO = `You are a help assistant for the SHIR Capital "Rent Comps Tracker" web app (https://rent-comps-tracker.pages.dev), used by the acquisitions team to record rent comparables for a deal and export them into the proforma's COMPS tab. The user will ask how to do something in the app. Answer ONLY from the guide below: short, practical steps that name the exact buttons and tabs. If the guide does not cover the question, say so plainly, point to where it most likely lives (the ☰ menu, the version strip, or one of the four tabs), and suggest asking the deal lead. Never invent buttons, menus or settings. Do not answer questions unrelated to the app.`;

const HELP_SECTIONS = [
  { id: 'start', title: 'Getting started', blocks: [
    { p: 'The Rent Comps Tracker records the rent comparables for one deal — the **subject** — and exports them into the proforma **COMPS** tab. Everything is saved to the deal folder on Google Drive, in **3. Comps / Rent Comps Tracker**, so the whole team sees the same data on any phone or computer.' },
    { h: 'First time on a device' },
    { ol: [
      'Open ☰ (top right) → `Connect Google Drive` and sign in with your SHIR Google account. Later visits reconnect on their own.',
      'On the home screen, tap `⤓ Update All Subjects` to bring every subject down from Drive, or just tap one of the ☁ cards to load that one.',
    ] },
    { h: 'A new deal, start to finish' },
    { ol: [
      '`+ New Subject` — name it exactly like the deal folder, e.g. **AUS TX - Crestwood**.',
      'When asked to link the Drive deal folder, choose **1** (search the pipelines by name) and confirm the right folder.',
      'Tab **1. Subject** → `⤓ Import from Proforma` to pull the subject, its unit mix, the comps and the rent roll out of the latest workbook. Or type the unit mix in by hand.',
      'Tab **2. Comps** — add or fix up to 10 comps and set each one’s **Comp Type**. Only **Direct** comps drive the suggested market rents.',
      'Tab **3. Market Rents** — set a market rent for each floor plan.',
      'Tab **4. Export** — check Pre-flight, then send the workbook + JSON to Drive or build a paste-ready Excel.',
    ] },
    { tip: 'Saving is automatic, about 2 seconds after you stop typing. There is no Save button to remember.' },
  ] },

  { id: 'home', title: 'The home screen', blocks: [
    { ul: [
      '**Your subjects** are listed first. Each card shows the deal folder, when it was last edited, and badges: comps used (e.g. `6/10 comps`), how many are Direct (green at 4 or more), market rents set, and the number of versions when there is more than one.',
      '**On Drive (other devices)** lists subjects a teammate made that are not on this device yet (☁ cards). Tap one to load it.',
      '`🔄 Refresh` re-reads the shared list only (names, counts, who is editing). `⤓ Update All Subjects` downloads every subject’s data.',
      '`Sort:` Date Modified, Date Created or Name, with a direction toggle. Your choice is remembered on this device.',
      '`ⓘ What do the icons mean?` explains the badges.',
      'Tick cards to archive several at once (`🗄 Archive N`). `🗄 Archived` shows archived subjects; `← Live` goes back. Archiving never deletes anything.',
    ] },
  ] },

  { id: 'subject', title: '1. Subject', blocks: [
    { p: 'The subject is the deal property. Its details, unit mix, leases and photos are **shared by every version** (see “Versions”).' },
    { h: 'Import from Proforma' },
    { ol: [
      'Tap `⤓ Import from Proforma`. The deal folder must be linked first (☰ → `🔍 Find Drive Folder`).',
      'Pick the workbook. The list shows the files in the deal’s **2. UW-Analysis** folder, newest first, with their type (IC / Final, Asset Mgmt, Head of Acq, Acq Team, Init UW), version and date. The file you imported last time is marked. Older files are under `Show N older files`.',
      'Tap `Read COMPS tab`. Nothing changes yet — you get a preview.',
      'Tick what to bring in: `Subject basics`, `Subject attributes & fees`, `Subject unit mix`, `Comps`, `Market rent overrides`, `Subject leases (RR, for the internal comp)`.',
      'Tap `Apply checked`. If it would replace a unit mix or comps you already have, it asks again: `Yes, replace` or `Keep what I have`.',
    ] },
    { tip: 'Comps and market rents go into the version that is open. To keep the old comps, make a new version first (tab 2, `+ New version`) and import into that.' },
    { h: 'The cards on this tab' },
    { ul: [
      '**Subject Property** — the address and basics, and the **Template** switch (MF or ExStay). ExStay deals use the ExStay template.',
      '**Subject Unit Mix** — one row per floor plan: Beds, Baths, SF, # Units, vacant units and current rent. `+ Floor Plan` adds a row; ⧉ copies one; ✕ deletes it. Enter Beds and Baths, or the plan cannot land in a COMPS section.',
      '**Subject Physical Attributes**, **Subject Fees** and **Subject Amenities** — Y / N toggles and values. In Fees, the top group goes to the COMPS tab; “Tracker-only” fees are kept here but have no COMPS row.',
      '**Subject Photos** — four slots; drop a picture or tap to pick one. They are saved in the deal’s **11. Pictures** folder.',
      '**Drive** — which deal folder and pipeline this subject is linked to, and when it last saved.',
    ] },
  ] },

  { id: 'comps', title: '2. Comps', blocks: [
    { p: 'Up to **10 comps** per version. On the COMPS tab they are ordered Direct → Aspirational → Inferior, then by distance — the app sorts them that way for you.' },
    { h: 'Adding comps' },
    { ul: [
      '`+ Add Comp` adds a blank comp and opens it.',
      '`☁ Pull from HelloData` finds comparables for the subject and adds them after you confirm. Then set **Comp Type** on each.',
      'Or bring them in from the proforma (tab 1, Import from Proforma, tick **Comps**).',
    ] },
    { h: 'Editing a comp' },
    { p: 'Tap a comp card to open it. `← All comps` (or ← in the header) goes back.' },
    { ul: [
      '**Comp Type**: ● Direct, ▲ Aspirational or ▼ Inferior. Only Direct comps feed the suggested market rents.',
      '**Unit Mix & Asking Rents** — one row per floor plan with its asking rent. A blank rent is skipped, not counted as $0.',
      '**Physical Attributes**, **Fees** and **Amenities** work like the subject’s.',
      '**More — contact, reno level, optional fees** holds the leasing phone, contact and one-time fees.',
      '**Photos** — Kitchen, Bathroom, Exterior and Amenities, plus a gallery per floor plan. Name the comp first; photos go to **3. Comps / <comp name>**. `⬇ Photo Index → Drive` writes an index of them.',
      '`☁ Fill from HelloData` fills this one comp from HelloData. `Delete comp` cannot be undone.',
    ] },
    { h: 'The map' },
    { p: 'The **Comp Map** shows the subject and comps from the deal’s KML file in **3. Comps**. On a phone it sits under the list. `↻` re-reads it; `Open in Drive ↗` opens the file. 📍 on a comp card centres the map on it.' },
    { h: 'Sources' },
    { p: 'A small tick in a field’s corner means its source is recorded. Hover it (tap it on a phone) to see where the value came from and when — looked up online, from the proforma, or typed in the tracker.' },
  ] },

  { id: 'rents', title: '3. Market Rents', blocks: [
    { p: 'This tab sets the market rent for each subject floor plan, comparing it with the comps one unit type at a time.' },
    { ol: [
      'Pick a **Unit type** chip at the top (Eff, 1x1, 2x1, 2x2…). Types the subject does not have are greyed out.',
      'The left side lists the subject’s plans of that type; tap a row to make it the **anchor** the comps are measured against.',
      'The right side shows one comp at a time. Step through them with ◀ ▶; each dot is a comp (grey = it has no units of this type).',
      'Type a rent in **Market $** for a plan, or tap `Apply to all N →` to use the suggested figure (“Comps suggest $X”) for every plan of the type.',
    ] },
    { ul: [
      'If you type nothing, the proforma’s own column-G rent is used as a starting value (marked “seed from proforma”).',
      'The Market $ you type is saved with the subject’s unit mix, so it is the same in every version.',
      '⚑ marks a comp value that looks wrong (e.g. year built 1950, every comp the same distance, vacancy over 30%).',
      '**Internal** is the subject’s own recent leases, used as one more comp. It needs the rent roll: Import from Proforma on tab 1 with **Subject leases** ticked. Filters set how recent a lease must be; untick a lease to leave it out. ExStay deals never show the internal comp.',
      'Lower down, **Photos** and **Attributes** put the subject and the current comp side by side.',
    ] },
  ] },

  { id: 'export', title: '4. Export', blocks: [
    { p: 'The tracker never edits the proforma itself. It produces files that fill the COMPS tab, named for the version that is open.' },
    { ul: [
      '**Pre-flight** lists anything that would block or weaken the export (✖ blocks, ! is a warning) — for example fewer than 4 Direct comps.',
      '**COMPS Tab Layout** shows which COMPS column each comp goes to, which sections get a market rent, and which version (with its created and modified dates) you are exporting.',
      '`⬆ Workbook + JSON → Drive` saves both into **3. Comps / Rent Comps Tracker**. This is the usual choice.',
      '`⬇ Download workbook (.xlsx)` is a review copy showing every value and the COMPS cell it goes to. `⬇ Download populator JSON` and `📋 Copy JSON to clipboard` are the input for the Python populator.',
    ] },
    { h: 'Paste it in yourself (no Python)' },
    { ol: [
      'Tap `⧉ Paste-Ready Excel — attach the deal workbook` and pick the deal’s proforma (or use the generic version for a fresh template).',
      'Open the downloaded **_PASTE.xlsx**. Its **CLEAR FIRST** sheet lists the ranges to clear in the proforma first.',
      'Copy from **COMPS_PASTE** and **DASH_PASTE** and paste into the proforma with **Paste Special → Values → ☑ Skip blanks**.',
    ] },
  ] },

  { id: 'versions', title: 'Versions', blocks: [
    { p: 'A deal can hold several sets of comps — for example one per underwriting round. The **version strip** under the tabs (on tabs 2–4) shows them as pills, e.g. `v1 (egordon)`, `v2 (greyes)`: the number plus the username of whoever made it.' },
    { ul: [
      '**Each version has its own** comps and market-rent roll-ups. **Shared by all versions:** the subject, its unit mix (including the Market $ per plan), its leases, photos and the folder link.',
      '`+ New version` asks for a name (the next number is filled in) and whether to start from the current version’s comps or blank.',
      'Tap another pill to switch to it. A ● on a pill means a teammate is working in that version. On a computer, hover a pill to see when it was created and last modified.',
      'Tap the open pill for its created / modified dates and **Rename**, **Copy**, **Archive** or **Delete**. Delete moves the version file to the Drive bin (restorable for 30 days). A subject always keeps at least one version.',
      '`⚙ Manage` lists every version, archived ones included.',
    ] },
  ] },

  { id: 'sync', title: 'Saving, sharing and the yellow bar', blocks: [
    { p: 'Your edits save to Drive on their own. When something needs your decision, a yellow bar appears under the header. Tap the bar for **“how do I fix this?”** — it explains the choices. The common ones:' },
    { ul: [
      '**“Drive has a newer copy … and this device has unsynced edits”** — someone saved while you had unsaved changes. `↓ Take the Drive version` keeps theirs (your copy is backed up first); `↑ Keep this device’s version` keeps yours. If unsure, take the Drive version.',
      '**“<name> is also editing this property”** — a teammate has it open. Work on different things or agree who edits; `↻ Check again` once they are done.',
      '**“Duplicate subject … already uses this deal folder”** — two subjects point at one deal folder and would overwrite each other, so this one is not saved. Tap `↗ Open the existing subject` and work there.',
    ] },
    { h: 'In the ☰ menu' },
    { ul: [
      '`↻ Re-sync from Drive` replaces this device’s copy with Drive’s (it asks first if you have unsaved edits).',
      '`🗄 Back up JSON now (3. Comps)` writes a dated backup now. The app also backs up on its own, at most every 6 hours, into **3. Comps / Rent Comps Tracker / Backups**.',
      '`Rename`, `🗄 Archive Subject` (for everyone, nothing deleted) and `Delete from this device` (removes it here only; Drive keeps it).',
      '**HelloData**: the key is normally shared org-wide, so there is nothing to set. If HelloData buttons fail, ask the deal lead.',
    ] },
  ] },

  { id: 'phone', title: 'On a phone', blocks: [
    { ul: [
      'The app is built for phones: add it to your home screen from the browser’s Share / ⋮ menu to open it like an app.',
      'The unit-mix tables fold into one bar per floor plan; tap a bar to edit it.',
      'Photo slots say “drop or tap”: tap to take a photo or choose one from the camera roll.',
      'Tap a field’s corner tick to see its source.',
    ] },
  ] },

  { id: 'trouble', title: 'Troubleshooting', blocks: [
    { ul: [
      '**“Drive session expired”** — ☰ → `Reconnect Google Drive`.',
      '**Import from Proforma says “Link a Drive deal folder first”** — ☰ → `🔍 Find Drive Folder (by name/city)`, or `Link Drive Folder by URL…` and paste the deal folder’s address.',
      '**The workbook I want is not in the list** — it must be an .xlsx or .xlsm in the deal’s **2. UW-Analysis** folder (or a subfolder). Check `Show N older files`.',
      '**`+ Add Comp` is greyed out** — the version already has 10 comps. Delete one, or start a new version.',
      '**A teammate’s changes are not showing** — on the home screen tap `🔄 Refresh`, then open the subject. Inside a subject: ☰ → `↻ Re-sync from Drive`.',
      '**Market Rents has no suggestion** — it needs Direct comps with asking rents for that unit type. Set Comp Type on tab 2.',
      '**I need an old version of the data back** — every backup is a dated file in **3. Comps / Rent Comps Tracker / Backups**; ask the deal lead to restore it.',
    ] },
  ] },
];

// ------------------------------------------------------------- rendering
// Inline markup in the content above: **bold**, `code-ish label`. Escaped first, so the text can hold < & >.
function helpInline(s) {
  return esc(s).replace(/\*\*(.+?)\*\*/g, '<b>$1</b>').replace(/`(.+?)`/g, '<span class="help-lbl">$1</span>');
}
function helpPlain(s) { return String(s).replace(/\*\*(.+?)\*\*/g, '$1').replace(/`(.+?)`/g, '"$1"'); }

function helpBlockHtml(b) {
  if (b.h) return `<h4>${helpInline(b.h)}</h4>`;
  if (b.p) return `<p>${helpInline(b.p)}</p>`;
  if (b.ul) return `<ul>${b.ul.map(x => `<li>${helpInline(x)}</li>`).join('')}</ul>`;
  if (b.ol) return `<ol>${b.ol.map(x => `<li>${helpInline(x)}</li>`).join('')}</ol>`;
  if (b.tip) return `<div class="help-tip">${helpInline(b.tip)}</div>`;
  return '';
}

/** The help prompt: the whole guide as plain text under an instruction block, for pasting into Claude. */
function helpPromptText() {
  const out = [HELP_PROMPT_INTRO, '', 'THE GUIDE', ''];
  HELP_SECTIONS.forEach(sec => {
    out.push('== ' + sec.title.toUpperCase() + ' ==');
    sec.blocks.forEach(b => {
      if (b.h) out.push('', '-- ' + helpPlain(b.h) + ' --');
      else if (b.p) out.push(helpPlain(b.p));
      else if (b.tip) out.push('Tip: ' + helpPlain(b.tip));
      else if (b.ul) b.ul.forEach(x => out.push('- ' + helpPlain(x)));
      else if (b.ol) b.ol.forEach((x, i) => out.push((i + 1) + '. ' + helpPlain(x)));
    });
    out.push('');
  });
  return out.join('\n');
}

function helpSectionForView() {
  const home = !$('#home-content').classList.contains('hidden');
  if (home) return 'start';
  if (typeof CURRENT_PHASE === 'undefined') return 'start';
  return ({ 1: 'subject', 2: 'comps', 3: 'rents', 4: 'export' })[CURRENT_PHASE] || 'start';
}

function renderHelpBody(query) {
  const q = (query || '').trim().toLowerCase();
  const openId = q ? null : helpSectionForView();
  let shown = 0;
  const html = HELP_SECTIONS.map(sec => {
    const text = (sec.title + ' ' + JSON.stringify(sec.blocks)).toLowerCase();
    if (q && !q.split(/\s+/).every(w => text.includes(w))) return '';
    shown++;
    return `<details class="help-sec" data-help="${esc(sec.id)}"${q || sec.id === openId ? ' open' : ''}>
      <summary>${esc(sec.title)}</summary>
      <div class="help-sec-body">${sec.blocks.map(helpBlockHtml).join('')}</div>
    </details>`;
  }).join('');
  $('#help-body').innerHTML = shown ? html
    : `<p class="muted">Nothing in the guide mentions “${esc(query)}”. Try a shorter word, or ask the deal lead.</p>`;
}

function openHelp() {
  if (typeof closeDrawer === 'function') closeDrawer();
  const p = $('#help-panel');
  p.classList.remove('hidden');
  $('#help-search').value = '';
  renderHelpBody('');
  const open = p.querySelector('details[open]');
  if (open) open.scrollIntoView({ block: 'start' });
  else $('#help-body').scrollTop = 0;
}
function closeHelp() { $('#help-panel').classList.add('hidden'); }

async function copyHelpPrompt() {
  const text = helpPromptText();
  try { await navigator.clipboard.writeText(text); toast('Help prompt copied — paste it into Claude, then ask your question.'); }
  catch (e) {
    // No clipboard permission (some phones): show it so it can be copied by hand.
    $('#help-body').innerHTML = `<p class="muted">Copy everything in the box, paste it into Claude, then ask your question.</p>
      <textarea class="help-prompt-box" readonly>${esc(text)}</textarea>`;
    const t = $('#help-body textarea'); t.focus(); t.select();
  }
}

function mountHelp() {
  // Header button, left of ☰.
  const actions = $('.header-actions');
  if (actions && !$('#btn-help')) {
    const b = document.createElement('button');
    b.id = 'btn-help'; b.className = 'btn-icon'; b.title = 'Help — how to use this app'; b.textContent = '?';
    b.setAttribute('aria-label', 'Help');
    actions.insertBefore(b, actions.firstChild);
    b.onclick = openHelp;
  }
  // Drawer: a Help section above Display.
  const drawer = $('#menu-drawer');
  if (drawer && !$('#btn-help-guide')) {
    const h = [...drawer.querySelectorAll('h3')].find(x => x.textContent.trim() === 'Display');
    const wrap = document.createElement('div');
    wrap.innerHTML = `<h3>Help</h3>
      <button id="btn-help-guide">📖 User guide</button>
      <button id="btn-help-prompt">📋 Copy help prompt for Claude</button>
      <div class="muted small">Paste it into Claude (claude.ai) and ask how to do something.</div>
      <hr/>`;
    if (h) drawer.insertBefore(wrap, h); else drawer.appendChild(wrap);
    $('#btn-help-guide').onclick = openHelp;
    $('#btn-help-prompt').onclick = () => { if (typeof closeDrawer === 'function') closeDrawer(); copyHelpPrompt(); };
  }
  // The panel itself.
  if (!$('#help-panel')) {
    const p = document.createElement('div');
    p.id = 'help-panel'; p.className = 'help-panel hidden';
    p.setAttribute('role', 'dialog'); p.setAttribute('aria-label', 'User guide');
    p.innerHTML = `<div class="help-head">
        <span class="help-title">User guide</span>
        <button class="btn small" id="btn-help-copy" title="Copy the whole guide as a prompt to paste into Claude">📋 Prompt</button>
        <button class="btn-icon help-x" id="btn-help-close" aria-label="Close help">✕</button>
      </div>
      <input type="search" id="help-search" class="help-search" placeholder="Search the guide…" autocomplete="off" />
      <div id="help-body" class="help-body"></div>`;
    document.body.appendChild(p);
    $('#btn-help-close').onclick = closeHelp;
    $('#btn-help-copy').onclick = copyHelpPrompt;
    $('#help-search').oninput = (ev) => renderHelpBody(ev.target.value);
    document.addEventListener('keydown', ev => { if (ev.key === 'Escape' && !p.classList.contains('hidden')) closeHelp(); });
  }
}

if (typeof document !== 'undefined' && document.readyState !== 'loading') mountHelp();
else if (typeof document !== 'undefined') document.addEventListener('DOMContentLoaded', mountHelp);
