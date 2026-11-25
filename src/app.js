/* polaris by Gugui — app. Vanilla, one file, local-first. */
(function () {
  'use strict';
  var C = PolarisCore;
  var KEY = 'polaris.v1', TOKEN_KEY = 'polaris.gh.token', VERSION = '1.0.0';
  var S, $app, route = { name: 'home', arg: '' }, ui = { topicTab: 'start', inboxFilter: 'proposed', vaultFilter: 'all', logFilter: 'all', capture: null };

  // ---------- storage adapter ----------
  var Store = {
    ok: true,
    load: function () {
      try { var raw = localStorage.getItem(KEY); return raw ? C.migrate(JSON.parse(raw)) : null; }
      catch (e) { this.ok = false; return null; }
    },
    save: function (s) {
      s.meta.updated = C.now();
      try { localStorage.setItem(KEY, JSON.stringify(s)); this.ok = true; }
      catch (e) { this.ok = false; toast('Could not save on this device. Export a backup now.'); }
    },
    size: function () { try { return (localStorage.getItem(KEY) || '').length * 2; } catch (e) { return 0; } },
    token: function (v) {
      try { if (v === undefined) return localStorage.getItem(TOKEN_KEY) || ''; if (v) localStorage.setItem(TOKEN_KEY, v); else localStorage.removeItem(TOKEN_KEY); } catch (e) { return ''; }
    },
    persist: function () { try { if (navigator.storage && navigator.storage.persist) navigator.storage.persist(); } catch (e) {} }
  };
  var autoT = 0;
  function canAuto() { return S && ((S.settings.dataMode === 'github' && S.settings.gh && S.settings.gh.owner && S.settings.gh.repo && Store.token && Store.token()) || (S.settings.dataMode === 'pair' && pairStore())); }
  function save() { S.meta.dirty = true; Store.save(S); if (canAuto() && !syncing) { clearTimeout(autoT); autoT = setTimeout(function () { sync(true); }, 2500); } }

  // ---------- helpers ----------
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function safeUrl(u) { u = String(u || '').trim(); return /^https?:\/\//i.test(u) ? u : ''; }
  function linkOrText(u, label) { var s = safeUrl(u); return s ? '<a href="' + esc(s) + '" target="_blank" rel="noopener noreferrer">' + esc(label || s.replace(/^https?:\/\//, '').slice(0, 48)) + '</a>' : esc(u); }
  function topicById(id) { return S.topics.filter(function (t) { return t.id === id; })[0]; }
  function topicByName(n) { n = String(n || '').toLowerCase().trim(); return S.topics.filter(function (t) { return t.name.toLowerCase() === n || t.slug === C.slug(n); })[0]; }
  function live(list) { return (list || []).filter(function (x) { return !x.archived; }); }
  function counts() {
    return { topics: live(S.topics).length, inbox: S.inbox.filter(function (i) { return i.status === 'proposed'; }).length,
      waiting: S.waiting.filter(function (w) { return !w.done && !w.archived; }).length, vault: live(S.vault).length,
      log: live(S.log).length, decisions: S.topics.reduce(function (a, t) { return a + live(t.decisions).length; }, 0),
      conflicts: S.topics.reduce(function (a, t) { return a + t.conflicts.filter(function (c) { return !c.archived && (c.status || 'open') === 'open'; }).length; }, 0) };
  }
  function daysSince(iso) { if (!iso) return Infinity; return (Date.now() - new Date(iso).getTime()) / 864e5; }
  function fmtDay(iso) { if (!iso) return 'never'; var d = new Date(iso); return C.normDate(d.toISOString().slice(0, 10)); }
  function copy(text) {
    function fallback() { var t = document.createElement('textarea'); t.value = text; document.body.appendChild(t); t.select(); try { document.execCommand('copy'); toast('Copied'); } catch (e) { toast('Select and copy by hand'); } t.remove(); }
    if (navigator.clipboard && window.isSecureContext) navigator.clipboard.writeText(text).then(function () { toast('Copied'); }, fallback); else fallback();
  }
  function download(name, parts, type) {
    var blob = new Blob(parts, { type: type || 'application/octet-stream' }), a = document.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = name; document.body.appendChild(a); a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 1500);
  }
  function toast(msg, ms) {
    var box = document.getElementById('toast'), d = document.createElement('div'); d.textContent = msg; box.appendChild(d);
    setTimeout(function () { d.remove(); }, ms || 2600);
  }
  function confirmBox(title, body, yes, cb, danger) {
    modal('<h2>' + esc(title) + '</h2><p class="dim">' + esc(body) + '</p><div class="row" style="justify-content:flex-end;margin-top:14px"><button class="btn ghost" data-act="close">Cancel</button><button class="btn ' + (danger ? 'danger' : 'primary') + '" data-act="confirm-yes">' + esc(yes) + '</button></div>');
    pending = cb;
  }
  var pending = null;
  function modal(html) { closeModal(); var s = document.createElement('div'); s.className = 'scrim'; s.id = 'scrim'; s.innerHTML = '<div class="modal" role="dialog" aria-modal="true">' + html + '</div>'; document.body.appendChild(s); var f = s.querySelector('input,textarea,select,button'); if (f) f.focus(); }
  function closeModal() { var s = document.getElementById('scrim'); if (s) s.remove(); }

  var ICON = {
    home: '<path d="M3 11.5 12 4l9 7.5V20a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z"/>',
    topics: '<circle cx="12" cy="12" r="3.5"/><ellipse cx="12" cy="12" rx="10" ry="4" transform="rotate(-20 12 12)"/>',
    inbox: '<path d="M3 13h5l1.5 3h5L16 13h5M5 5h14l2 8v6H3v-6z"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    waiting: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
    vault: '<rect x="3" y="5" width="18" height="15" rx="2"/><circle cx="12" cy="12.5" r="3"/><path d="M12 9.5V8"/>',
    log: '<path d="M6 4h12v16H6zM9 8h6M9 12h6M9 16h4"/>',
    review: '<path d="M4 12l5 5L20 6"/>',
    guide: '<circle cx="12" cy="12" r="9"/><path d="M9.5 9a2.5 2.5 0 1 1 3.5 2.3c-.7.3-1 .9-1 1.7M12 17h.01"/>',
    settings: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>',
    more: '<circle cx="5" cy="12" r="1.5"/><circle cx="12" cy="12" r="1.5"/><circle cx="19" cy="12" r="1.5"/>'
  };
  function ic(n) { return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + ICON[n] + '</svg>'; }
  var TRIDENT = '<svg class="tri" viewBox="0 0 20 24" aria-hidden="true"><path d="M10 23V6M3 3v5a7 7 0 0 0 14 0V3M10 2v4M3 3l-1.2 2M3 3l1.2 2M17 3l-1.2 2M17 3l1.2 2M10 2 8.8 4M10 2l1.2 2M7 19h6" fill="none" stroke="#c9a46c" stroke-width="2.3" stroke-linecap="round"/></svg>';
  function lockup() { if (window.POLARIS_ART.lockup) return '<a class="lockup img" href="#home"><img src="' + window.POLARIS_ART.lockup + '" alt="polaris by Gugui" width="640" height="203"></a>'; return '<a class="lockup" href="#home" aria-label="polaris by Gugui"><span class="word" aria-hidden="true"><span class="g">polar</span><span class="i"><span class="g">ı</span>' + TRIDENT + '</span><span class="g">s</span></span><span class="by" aria-hidden="true">by <b>Gugui</b></span></a>'; }

  // ---------- shell ----------
  var NAV = [['home', 'Home'], ['topics', 'Topics'], ['capture', 'Capture'], ['waiting', 'Waiting'], ['more', 'More']];
  var SIDE = [['home', 'Home'], ['topics', 'Topics'], ['capture', 'Capture', 'plus'], ['inbox', 'Inbox'], ['waiting', 'Waiting'], ['vault', 'Vault'], ['log', 'Log'], ['review', 'Weekly review'], ['guide', 'Guide'], ['settings', 'Settings']];
  function shell() {
    var c = counts(), on = function (n) { return route.name === n || (n === 'topics' && route.name === 'topic') || (n === 'more' && ['inbox', 'vault', 'log', 'review', 'guide', 'settings'].indexOf(route.name) >= 0); };
    var badge = { inbox: c.inbox, waiting: c.waiting };
    document.getElementById('nav').innerHTML = NAV.map(function (n) {
      if (n[0] === 'capture') return '<a class="cap" href="#capture" aria-label="Capture"><span class="ic">' + ic('plus') + '</span>Capture</a>';
      var b = n[0] === 'more' ? c.inbox : badge[n[0]];
      return '<a href="#' + n[0] + '" class="' + (on(n[0]) ? 'on' : '') + '">' + ic(n[0]) + n[1] + (b ? '<span class="badge">' + b + '</span>' : '') + '</a>';
    }).join('');
    document.getElementById('side').innerHTML = lockup() + SIDE.map(function (n) {
      var b = badge[n[0]];
      return '<a class="item ' + (on(n[0]) && n[0] !== 'more' ? 'on' : '') + '" href="#' + n[0] + '">' + ic(n[2] || n[0]) + n[1] + (b ? '<span class="badge">' + b + '</span>' : '') + '</a>';
    }).join('') + '<div class="foot">' + (S.settings.dataMode === 'github' ? 'Syncs to GitHub' : 'Saved on this device') + '<br>v' + VERSION + '</div>';
  }
  function top(title) { return '<div class="top">' + lockup() + (title ? '' : '') + '<a class="icon-btn" href="#settings" aria-label="Settings">' + ic('settings').replace('<svg', '<svg width="22" height="22"') + '</a></div>'; }

  // ---------- views ----------
  var V = {};
  V.home = function () {
    var c = counts(), since0 = S.settings.setupAt || '', stale = daysSince(S.reviews.length ? S.reviews[S.reviews.length - 1].at : since0) > (S.settings.reviewEvery || 7);
    var backupOld = daysSince(S.meta.lastBackup || since0) > 14 && S.settings.dataMode !== 'github';
    var st = [['topics', 'Topics', c.topics, 180], ['inbox', 'Inbox', c.inbox, 312], ['waiting', 'Waiting', c.waiting, 0], ['vault', 'Vault', c.vault, 52], ['log', 'Log', c.log, 128], ['guide', 'Guide', '', 228]];
    var pArt = S.settings.planetArt || window.POLARIS_ART.planet, rArt = S.settings.residentArt || window.POLARIS_ART.resident;
    var art = pArt ? ' art" style="--art:url(' + esc(pArt) + ')' : '';
    var RX = 44, RY = 15, ROT = -16 * Math.PI / 180;
    function onRing(deg) { var a = deg * Math.PI / 180, x = RX * Math.cos(a), y = RY * Math.sin(a); return [50 + x * Math.cos(ROT) - y * Math.sin(ROT), 50 + x * Math.sin(ROT) + y * Math.cos(ROT)]; }
    var ringPath = function (r1, r2, front) { // half ellipse: front = lower half (in front of planet)
      var pts = [], i; for (i = 0; i <= 48; i++) { var a = (front ? 0 : 180) + i * 180 / 48, rad = a * Math.PI / 180, x = r1 * Math.cos(rad), y = r2 * Math.sin(rad); pts.push((50 + x * Math.cos(ROT) - y * Math.sin(ROT)).toFixed(2) + ',' + (50 + x * Math.sin(ROT) + y * Math.cos(ROT)).toFixed(2)); }
      return 'M' + pts.join(' L');
    };
    var ring = function (front) { return '<svg class="ring" viewBox="0 0 100 100" aria-hidden="true"><defs><linearGradient id="bzr' + (front ? 'f' : 'b') + '" x1="0" x2="1"><stop offset="0" stop-color="#6e5232"/><stop offset=".5" stop-color="#e2c08c"/><stop offset="1" stop-color="#6e5232"/></linearGradient></defs>' +
      '<path class="dashes' + (front ? ' f' : '') + '" d="' + ringPath(RX, RY, front) + '" fill="none" stroke="rgba(185,168,255,' + (front ? '.75' : '.45') + ')" stroke-width="' + (front ? '.42' : '.32') + '" stroke-linecap="round" stroke-dasharray="1.1 1.3"/>' +
      (pArt ? '' : '<path d="' + ringPath(35, 11.5, front) + '" fill="none" stroke="url(#bzr' + (front ? 'f' : 'b') + ')" stroke-width=".9" stroke-linecap="round" opacity="' + (front ? '.95' : '.55') + '"/>') + '</svg>'; };
    var A = window.POLARIS_ART, blink = !S.settings.residentArt && A.residentHalf && A.residentClosed;
    function resEl(cls) { if (!rArt) return ''; return '<div class="resident ' + cls + (blink ? ' blinks' : '') + '" role="img" aria-label="polaris resident"><i style="--res:url(' + esc(rArt) + ')"></i>' + (blink ? '<i class="h" style="--res:url(' + esc(A.residentHalf) + ')"></i><i class="c" style="--res:url(' + esc(A.residentClosed) + ')"></i>' : '') + '</div>'; }
    var res = resEl('mob');
    var h = top() + '<div class="wrap"><div class="intro">' + res + '<h1>' + (S.profile.name ? 'Hi ' + esc(S.profile.name) + '.' : 'Your polaris') + '</h1><p class="dim small">One record per topic. Newest dated statement wins. Nothing gets lost between chats.</p></div>' +
      '<section class="hero" aria-label="Your polaris"><div class="orb"><div class="back">' + ring(false) + '</div><div class="planet' + art + '"></div>' + (window.POLARIS_ART.heroSign && SIGNS[window.POLARIS_ART.sign] ? '<span class="hero-sign" aria-hidden="true" style="--pglow:' + esc(window.POLARIS_ART.accent || '#8a74ff') + '">' + SIGNS[window.POLARIS_ART.sign] + '</span>' : '') + '<div class="front">' + ring(true) + '</div>' +
      st.map(function (s) { var p = onRing(s[3]); return '<a class="station" href="#' + s[0] + '" style="left:' + p[0].toFixed(3) + '%;top:' + p[1].toFixed(3) + '%" aria-label="' + s[1] + '"><i></i><span class="lbl">' + s[1] + (s[2] !== '' ? '<small>' + s[2] + '</small>' : '') + '</span></a>'; }).join('') +
      '</div>' + resEl('desk') + '</section>';
    if (!S.topics.length) h += '<div class="card"><h2>Start here</h2><p class="dim">Set up your homes and get the text that teaches your AI chats how to hand things back.</p><a class="btn primary" href="#setup">Set up polaris</a> <button class="btn" data-act="load-example">Load an example</button></div>';
    if (S.settings.setupDone && (S.settings.seenUpdate || 0) < 2 && (!S.settings.setupAt || S.settings.setupAt < '2026-11-25T18:30')) h += '<div class="card whatsnew"><h3 style="margin:0 0 4px">polaris got an update</h3><p class="small dim" style="margin:0 0 8px">Everything you saved is still here, untouched. Nothing to redo. New: <b>Save from Claude</b> (one tap, right below), <b>Switch devices</b> and optional <b>GitHub sync</b> in Settings to keep your phone and computer in step, and the harvest steps for each Project.</p><button class="btn sm" data-act="seen-update">Got it</button></div>';
    if (S.settings.setupDone) h += '<div class="card quick"><div><h3 style="margin:0">Save from Claude</h3><p class="small dim" style="margin:2px 0 0">Copy Claude\'s reply on any device, then tap here. polaris saves the box at the end of it.</p></div><button class="btn primary big" data-act="quick-save">Save from Claude</button></div>';
    var steps = []; live(S.topics).forEach(function (t) { live(t.progress || []).forEach(function (x) { if (x.status !== 'done') steps.push([t, x]); }); });
    if (steps.length) {
      var tp = steps[0][0], all = live(tp.progress), dn = all.filter(function (x) { return x.status === 'done'; }).length;
      h += '<div class="card nextup"><div class="row between"><h3 style="margin:0">Next up</h3><a class="small" href="#topic/' + esc(tp.id) + '">' + esc(tp.name) + ' · ' + dn + ' of ' + all.length + ' done</a></div><div class="bar" role="progressbar" aria-valuemin="0" aria-valuemax="' + all.length + '" aria-valuenow="' + dn + '"><i style="width:' + Math.round(100 * dn / Math.max(1, all.length)) + '%"></i></div><ol class="steps-list">' +
        steps.filter(function (s) { return s[0] === tp; }).slice(0, 3).map(function (s) { return '<li>' + esc(s[1].text) + '</li>'; }).join('') + '</ol></div>';
    }
    if (S.settings.setupDone && !S.settings.harvestHidden) h += harvestCard(true);
    var nudges = [];
    if (c.inbox) nudges.push('<a href="#inbox">' + c.inbox + ' item' + (c.inbox > 1 ? 's' : '') + ' in your inbox</a> to sort');
    if (stale && S.topics.length) nudges.push('<a href="#review">Weekly review</a> is due');
    if (backupOld && S.topics.length) nudges.push('No backup in a while. <a href="#settings">Export one</a>');
    if (!Store.ok) nudges.push('This browser is not saving. <a href="#settings">Export now</a>');
    if (nudges.length) h += '<div class="card"><h3>Waiting on you</h3><ul class="list">' + nudges.map(function (n) { return '<li class="item"><span class="dot"></span><div class="body">' + n + '</div></li>'; }).join('') + '</ul></div>';
    h += '<div class="grid stats" style="margin-top:12px">' + [['topics', c.topics, 'topics'], ['inbox', c.inbox, 'to sort'], ['waiting', c.waiting, 'waiting on you'], ['topics', c.decisions, 'decisions'], ['topics', c.conflicts, 'open conflicts'], ['vault', c.vault, 'in the Vault']].map(function (x) { return '<a class="card stat" href="#' + x[0] + '"><b>' + x[1] + '</b><span>' + x[2] + '</span></a>'; }).join('') + '</div>';
    if (!S.settings.setupDone) h += '<div class="card" style="margin-top:12px"><div class="row between"><div><h3>The loop</h3><p class="dim small" style="margin:0">End any AI chat with the handoff prompt, paste the reply into Capture, sort it in the Inbox.</p></div><div class="row"><button class="btn" data-act="copy-handoff">Copy handoff prompt</button><a class="btn primary" href="#capture">Capture</a></div></div></div>';
    return h + '</div>';
  };

  V.topics = function () {
    var h = top() + '<div class="wrap"><div class="row between"><h1>Topics</h1><button class="btn primary" data-act="add-topic">New topic</button></div><p class="dim">Each topic is one record: where it stands, what was decided, what is open.</p>';
    var ts = live(S.topics);
    if (!ts.length) return h + '<div class="card empty">No topics yet. <a href="#setup">Run setup</a> or add one.</div></div>';
    h += '<div class="card"><ul class="list">' + ts.map(function (t) {
      var open = t.questions.filter(function (q) { return !q.archived && q.status !== 'answered'; }).length;
      return '<li class="item"><span class="dot ' + (t.status === 'harvested' ? 'harvested' : t.status === 'partly' ? 'partly' : '') + '"></span><div class="body"><a href="#topic/' + esc(t.id) + '"><b>' + esc(t.name) + '</b></a> ' + (t.locked ? '<span class="tag lock">locked</span>' : '') +
        '<div class="meta">' + esc(t.status) + ' · ' + live(t.start).length + ' start lines · ' + live(t.decisions).length + ' decisions · ' + open + ' open questions · updated ' + fmtDay(t.updated) + '</div></div></li>';
    }).join('') + '</ul></div><p class="faint small">Dots: empty = not started, half = partly (a record exists, sources not all read), full = harvested.</p></div>';
    return h;
  };

  var TABS = [['start', 'Start here'], ['decisions', 'Decisions'], ['ideas', 'Ideas'], ['questions', 'Questions'], ['conflicts', 'Conflicts'], ['sources', 'Sources']];
  V.topic = function () {
    var t = topicById(route.arg);
    if (!t) return top() + '<div class="wrap"><div class="card empty">That topic is gone. <a href="#topics">Back to topics</a></div></div>';
    if (!t.progress) t.progress = [];
    var TB = (live(t.progress).length ? [['progress', 'Progress']] : []).concat(TABS);
    if (ui.topicTab === 'start' && live(t.progress).length && !ui.tabPicked) ui.topicTab = 'progress';
    var tab = ui.topicTab, list = live(t[tab] || []).slice();
    if (tab === 'progress') list.sort(function (a, b) { return (a.status === 'done' ? 1 : 0) - (b.status === 'done' ? 1 : 0); });
    if (tab === 'start' || tab === 'decisions') list.sort(function (a, b) { return (a.superseded ? 1 : 0) - (b.superseded ? 1 : 0) || C.dateKey(b.said).localeCompare(C.dateKey(a.said)); });
    var h = top() + '<div class="wrap"><a href="#topics" class="small">← Topics</a><div class="row between" style="margin-top:6px"><h1>' + esc(t.name) + '</h1><div class="row">' +
      '<select data-act="topic-status" aria-label="Status">' + ['not started', 'partly', 'harvested'].map(function (s) { return '<option' + (t.status === s ? ' selected' : '') + '>' + s + '</option>'; }).join('') + '</select>' +
      '<button class="btn sm" data-act="topic-md">Copy record</button><button class="btn sm ghost" data-act="topic-rename">Rename</button></div></div>' +
      '<div class="seg" role="tablist" style="margin:8px 0 12px">' + TB.map(function (x) { return '<button role="tab" data-act="tab" data-v="' + x[0] + '" class="' + (tab === x[0] ? 'on' : '') + '">' + x[1] + ' <span class="faint">' + live(t[x[0]]).length + '</span></button>'; }).join('') + '</div>';
    h += '<div class="card"><div class="row between"><h3 style="margin:0">' + TB.filter(function (x) { return x[0] === tab; })[0][1] + (tab === 'progress' ? ' <span class="faint small">' + live(t.progress).filter(function (x) { return x.status === 'done'; }).length + ' of ' + live(t.progress).length + ' done</span>' : '') + '</h3><button class="btn sm primary" data-act="add-line" data-v="' + tab + '">Add</button></div>';
    if (!list.length) h += '<div class="empty">Nothing here yet. Add a line or apply one from the Inbox.</div>';
    else h += '<ul class="list">' + list.map(function (x) { return lineHtml(t, tab, x); }).join('') + '</ul>';
    var assets = live(S.vault).filter(function (v) { return v.topic === t.id; });
    h += '</div>' + (assets.length ? '<div class="card"><h3>In the Vault</h3><ul class="list">' + assets.map(function (v) { return '<li class="item"><div class="body">' + linkOrText(v.base, v.title) + '<div class="meta">' + esc(v.file) + ' · ' + esc(v.status) + '</div></div></li>'; }).join('') + '</ul></div>' : '');
    return h + '</div>';
  };
  function lineHtml(t, tab, x) {
    var tags = '';
    if (x.superseded) tags += '<span class="tag warn">superseded</span> ';
    if (x.locked) tags += '<span class="tag lock">locked</span> ';
    if (x.who === 'assistant') tags += '<span class="tag">assistant call</span> ';
    if (tab === 'progress') tags += '<span class="tag ' + (x.status === 'done' ? 'ok' : 'warn') + '">' + (x.status === 'done' ? 'done' : 'next') + '</span> ';
    if (tab === 'questions') tags += '<span class="tag ' + (x.status === 'answered' ? 'ok' : '') + '">' + esc(x.status || 'open') + '</span> ';
    if (tab === 'conflicts') tags += '<span class="tag ' + ((x.status || 'open') === 'open' ? 'bad' : 'ok') + '">' + esc(x.status || 'open') + '</span> ';
    var body = '<div class="' + (x.superseded ? 'sup' : '') + '">' + esc(x.text || x.title) + '</div>';
    if (x.words) body += '<div class="words">“' + esc(x.words) + '”</div>';
    if (tab === 'conflicts' && x.other) body += '<div class="small dim">vs. ' + esc(x.other) + '</div>';
    if (x.answer) body += '<div class="small">Answer: ' + esc(x.answer) + '</div>';
    var meta = (tab === 'progress' && x.status === 'done' ? 'done ' + esc(x.doneOn || x.said || '?') : 'said ' + esc(x.said || '?')) + (x.chat ? ' · ' + esc(x.chat) : '') + (x.base || x.url ? ' · ' + linkOrText(x.base || x.url) : '');
    var acts = '';
    if (!x.locked) {
      if ((tab === 'start' || tab === 'decisions') && !x.superseded) acts += '<button class="btn sm ghost" data-act="supersede" data-v="' + esc(x.id) + '">Superseded</button>';
      if (tab === 'progress') acts += '<button class="btn sm ' + (x.status === 'done' ? 'ghost' : 'primary') + '" data-act="step-toggle" data-v="' + esc(x.id) + '">' + (x.status === 'done' ? 'Not done yet' : 'Mark done') + '</button>';
      if (tab === 'questions' && x.status !== 'answered') acts += '<button class="btn sm ghost" data-act="answer" data-v="' + esc(x.id) + '">Answer</button>';
      if (tab === 'conflicts' && (x.status || 'open') === 'open') acts += '<button class="btn sm ghost" data-act="settle" data-v="' + esc(x.id) + '">Settle</button>';
      acts += '<button class="btn sm ghost" data-act="edit-line" data-v="' + esc(x.id) + '">Edit</button>';
    }
    acts += '<button class="btn sm ghost" data-act="lock-line" data-v="' + esc(x.id) + '">' + (x.locked ? 'Unlock' : 'Lock') + '</button>';
    if (!x.locked) acts += '<button class="btn sm ghost" data-act="archive-line" data-v="' + esc(x.id) + '">Archive</button>';
    return '<li class="item"><div class="body">' + tags + body + '<div class="meta">' + meta + '</div><div class="actions" style="margin-top:6px">' + acts + '</div></div></li>';
  }

  V.capture = function () {
    var cap = ui.capture, h = top() + '<div class="wrap"><h1>Capture</h1><p class="dim">Paste a chat\'s handoff reply. Nothing is saved until you add it to the Inbox.</p>';
    h += '<div class="card quick"><div><b>Fastest way</b><p class="small dim" style="margin:2px 0 0">Copy Claude\'s whole reply, then tap.</p></div><button class="btn primary" data-act="quick-save">Save from Claude</button></div>';
    h += '<div class="card"><div class="row between"><b>1. In your AI chat</b><button class="btn sm" data-act="copy-handoff">Copy handoff prompt</button></div><p class="dim small" style="margin:6px 0 0">Paste the prompt at the end of a chat. The reply holds a block that starts with POLARIS.</p></div>';
    h += '<div class="card"><b>2. Paste the reply here</b><textarea id="cap-text" placeholder="Paste the whole reply, chatter and all. polaris finds the block." aria-label="Paste the chat reply">' + esc(cap ? cap.text : '') + '</textarea>' +
      '<div class="row" style="margin-top:8px"><input type="text" id="cap-chat" placeholder="Chat name or link (optional)" value="' + esc(cap ? cap.chat : '') + '" style="flex:1;min-width:180px"><button class="btn primary" data-act="parse">Read it</button></div></div>';
    if (cap && cap.result) {
      var r = cap.result;
      h += '<div class="card"><div class="row between"><b>3. Check what it found: ' + r.items.length + ' item' + (r.items.length === 1 ? '' : 's') + '</b>' + (r.items.length ? '<button class="btn primary" data-act="cap-add">Add to Inbox</button>' : '') + '</div>';
      if (r.errors.length) h += '<ul class="small" style="color:var(--warn)">' + r.errors.map(function (e) { return '<li>' + esc(e) + '</li>'; }).join('') + '</ul>';
      var unknown = {};
      r.items.forEach(function (i) { if (i.topic && !topicByName(i.topic)) unknown[i.topic] = 1; });
      if (Object.keys(unknown).length) h += '<p class="small dim">New topic names: ' + Object.keys(unknown).map(esc).join(', ') + '. They are created when you apply an item, or you can pick another topic in the Inbox.</p>';
      h += '<ul class="list">' + r.items.map(function (i) { return '<li class="item"><div class="body"><span class="tag">' + esc(i.kind) + '</span> <b>' + esc(i.topic || 'no topic') + '</b><div>' + esc(i.proposal) + '</div>' + (i.words ? '<div class="words">“' + esc(i.words) + '”</div>' : '') + '<div class="meta">said ' + esc(i.said) + (i.base ? ' · ' + linkOrText(i.base) : '') + '</div></div></li>'; }).join('') + '</ul></div>';
    }
    h += '<div class="card"><b>Or add one item by hand</b> <button class="btn sm" data-act="inbox-manual" style="margin-left:8px">New item</button></div>';
    return h + '</div>';
  };

  var KIND_TO = { fact: 'start', decision: 'decisions', idea: 'ideas', question: 'questions', conflict: 'conflicts', source: 'sources', done: 'progress', next: 'progress' };
  V.inbox = function () {
    var f = ui.inboxFilter, items = S.inbox.filter(function (i) { return i.status === f; }).sort(function (a, b) { return (b.created || '').localeCompare(a.created || ''); });
    var n = function (s) { return S.inbox.filter(function (i) { return i.status === s; }).length; };
    var h = top() + '<div class="wrap"><div class="row between"><h1>Inbox</h1><a class="btn primary" href="#capture">Capture</a></div><p class="dim">Proposals from your chats. Apply one to file it in its topic. Rejected items are kept, never deleted.</p>' +
      '<div class="seg" style="margin-bottom:12px">' + ['proposed', 'held', 'applied', 'rejected'].map(function (s) { return '<button data-act="inbox-filter" data-v="' + s + '" class="' + (f === s ? 'on' : '') + '">' + s + ' <span class="faint">' + n(s) + '</span></button>'; }).join('') + '</div>';
    if (!items.length) return h + '<div class="card empty">Nothing ' + esc(f) + '.</div></div>';
    if ((f === 'proposed' || f === 'held') && items.length > 1) h += '<div class="row" style="justify-content:flex-end;margin:-4px 0 10px"><button class="btn sm" data-act="apply-all">Apply all ' + items.length + '</button></div>';
    var opts = live(S.topics).map(function (t) { return '<option value="' + esc(t.id) + '">' + esc(t.name) + '</option>'; }).join('');
    h += '<div class="card"><ul class="list">' + items.map(function (i) {
      var t = topicByName(i.topic);
      var sel = '<select data-act="inbox-topic" data-v="' + esc(i.id) + '" aria-label="Topic" style="width:auto;padding:4px 8px"><option value="">' + (i.topic && !t ? 'New: ' + esc(i.topic) : 'Pick a topic') + '</option>' + opts.replace('value="' + (t ? esc(t.id) : '#') + '"', 'value="' + (t ? esc(t.id) : '#') + '" selected') + '</select>';
      return '<li class="item"><div class="body"><div class="row"><span class="tag">' + esc(i.kind) + '</span>' + (f === 'proposed' || f === 'held' ? sel : '<b>' + esc(i.topic) + '</b>') + '</div><div style="margin-top:6px">' + esc(i.proposal) + '</div>' +
        (i.words ? '<div class="words">“' + esc(i.words) + '”</div>' : '') + '<div class="meta">said ' + esc(i.said) + (i.chat ? ' · ' + linkOrText(i.chat) : '') + (i.base ? ' · ' + linkOrText(i.base) : '') + '</div>' +
        (f === 'proposed' || f === 'held' ? '<div class="actions" style="margin-top:6px"><button class="btn sm primary" data-act="apply" data-v="' + esc(i.id) + '">Apply</button>' + (f === 'proposed' ? '<button class="btn sm ghost" data-act="hold" data-v="' + esc(i.id) + '">Hold</button>' : '') + '<button class="btn sm ghost" data-act="reject" data-v="' + esc(i.id) + '">Reject</button></div>' : '') + '</div></li>';
    }).join('') + '</ul></div>';
    return h + '</div>';
  };

  V.waiting = function () {
    var open = S.waiting.filter(function (w) { return !w.done && !w.archived; }), done = S.waiting.filter(function (w) { return w.done && !w.archived; });
    var row = function (w) { var t = topicById(w.topic); return '<li class="item"><input type="checkbox" class="check" data-act="toggle-wait" data-v="' + esc(w.id) + '"' + (w.done ? ' checked' : '') + ' aria-label="Done" style="width:20px;height:20px;accent-color:var(--v2);margin-top:2px"><div class="body"><div class="' + (w.done ? 'sup' : '') + '">' + esc(w.text) + '</div><div class="meta">' + (t ? '<a href="#topic/' + esc(t.id) + '">' + esc(t.name) + '</a> · ' : '') + 'said ' + esc(w.said || '') + (w.base ? ' · ' + linkOrText(w.base) : '') + '</div></div><button class="icon-btn" data-act="archive-wait" data-v="' + esc(w.id) + '" aria-label="Archive">×</button></li>'; };
    var h = top() + '<div class="wrap"><div class="row between"><h1>Waiting on you</h1><button class="btn primary" data-act="add-wait">Add</button></div><p class="dim">Calls and tasks only you can do. Every card should point somewhere.</p>';
    h += '<div class="card">' + (open.length ? '<ul class="list">' + open.map(row).join('') + '</ul>' : '<div class="empty">All clear.</div>') + '</div>';
    if (done.length) h += '<details class="ch" style="margin-top:12px"><summary>Done (' + done.length + ')</summary><ul class="list">' + done.map(row).join('') + '</ul></details>';
    return h + '</div>';
  };

  V.vault = function () {
    var f = ui.vaultFilter, items = live(S.vault).filter(function (v) { return f === 'all' || v.status === f; });
    var h = top() + '<div class="wrap"><div class="row between"><h1>Vault</h1><button class="btn primary" data-act="add-asset">Add</button></div><p class="dim">Your files, renders and docs: what they are, where they live, when they came up. polaris keeps the pointer, not the file.</p>' +
      '<div class="seg" style="margin-bottom:12px">' + ['all', 'unreviewed', 'approved'].map(function (s) { return '<button data-act="vault-filter" data-v="' + s + '" class="' + (f === s ? 'on' : '') + '">' + s + '</button>'; }).join('') + '</div>';
    if (!items.length) return h + '<div class="card empty">Nothing here yet.</div></div>';
    h += '<div class="card"><ul class="list">' + items.map(function (v) { var t = topicById(v.topic); return '<li class="item"><div class="body"><b>' + linkOrText(v.base, v.title) + '</b> <span class="tag ' + (v.status === 'approved' ? 'ok' : 'warn') + '">' + esc(v.status) + '</span><div class="meta">' + esc(v.file || '') + (t ? ' · ' + esc(t.name) : '') + ' · said ' + esc(v.said || '') + '</div><div class="actions" style="margin-top:6px"><button class="btn sm ghost" data-act="asset-status" data-v="' + esc(v.id) + '">' + (v.status === 'approved' ? 'Mark unreviewed' : 'Approve') + '</button><button class="btn sm ghost" data-act="archive-asset" data-v="' + esc(v.id) + '">Archive</button></div></div></li>'; }).join('') + '</ul></div>';
    return h + '</div>';
  };

  V.log = function () {
    var f = ui.logFilter, items = live(S.log).filter(function (l) { return f === 'all' || l.type === f; }).sort(function (a, b) { return (b.created || '').localeCompare(a.created || ''); });
    var h = top() + '<div class="wrap"><div class="row between"><h1>Log</h1><button class="btn primary" data-act="add-log">Add</button></div><p class="dim">Two kinds of rows. Ledger: a complaint, correction or good idea, with the fix and its status, so nothing gets lost when a chat runs long. Call: a decision an AI made without asking you, what it chose, and what changed.</p>' +
      '<div class="seg" style="margin-bottom:12px">' + [['all', 'All'], ['ledger', 'Ledger'], ['call', 'Calls']].map(function (s) { return '<button data-act="log-filter" data-v="' + s[0] + '" class="' + (f === s[0] ? 'on' : '') + '">' + s[1] + '</button>'; }).join('') + '</div>';
    if (!items.length) return h + '<div class="card empty">Nothing logged yet.</div></div>';
    h += '<div class="card"><ul class="list">' + items.map(function (l) { return '<li class="item"><div class="body"><span class="tag">' + esc(l.type) + '</span> <span class="tag ' + (l.status === 'done' ? 'ok' : 'warn') + '">' + esc(l.status || 'open') + '</span><div style="margin-top:4px">' + esc(l.text) + '</div>' + (l.fix ? '<div class="small dim">Fix: ' + esc(l.fix) + '</div>' : '') + '<div class="meta">said ' + esc(l.said || '') + '</div><div class="actions" style="margin-top:6px"><button class="btn sm ghost" data-act="log-done" data-v="' + esc(l.id) + '">' + (l.status === 'done' ? 'Reopen' : 'Mark done') + '</button></div></div></li>'; }).join('') + '</ul></div>';
    return h + '</div>';
  };

  V.review = function () {
    var c = counts(), last = S.reviews.length ? S.reviews[S.reviews.length - 1] : null;
    var steps = [
      ['Sort the Inbox', c.inbox + ' proposed', '#inbox'],
      ['Clear what you can from Waiting', c.waiting + ' open', '#waiting'],
      ['Settle open conflicts (newest dated statement wins, or mark superseded)', c.conflicts + ' open', '#topics'],
      ['Move topics between not started, partly and harvested', live(S.topics).length + ' topics', '#topics'],
      ['Approve or flag new Vault entries', live(S.vault).filter(function (v) { return v.status !== 'approved'; }).length + ' unreviewed', '#vault'],
      ['Close done rows in the Log', live(S.log).filter(function (l) { return l.status !== 'done'; }).length + ' open', '#log'],
      ['Back up or sync', S.settings.dataMode === 'github' ? 'last sync ' + fmtDay(S.meta.lastSync) : 'last backup ' + fmtDay(S.meta.lastBackup), '#settings']
    ];
    var h = top() + '<div class="wrap"><h1>Weekly review</h1><p class="dim">Fifteen minutes, once a week. Last review: ' + (last ? fmtDay(last.at) : 'never') + '.</p><div class="card"><ul class="list">' +
      steps.map(function (s, i) { return '<li class="item"><label class="check" style="margin:0"><input type="checkbox" id="rv' + i + '"><span><b>' + esc(s[0]) + '</b><br><span class="small dim">' + esc(s[1]) + ' · <a href="' + s[2] + '">open</a></span></span></label></li>'; }).join('') +
      '</ul><label for="rv-note">Notes (optional)</label><textarea id="rv-note" placeholder="Anything worth remembering from this week"></textarea><div class="row" style="margin-top:10px"><button class="btn primary" data-act="review-done">Mark reviewed</button></div></div>';
    if (S.reviews.length) h += '<details class="ch" style="margin-top:12px"><summary>Past reviews (' + S.reviews.length + ')</summary><ul class="list">' + S.reviews.slice().reverse().map(function (r) { return '<li class="item"><div class="body"><b>' + fmtDay(r.at) + '</b>' + (r.note ? '<div class="small">' + esc(r.note) + '</div>' : '') + '</div></li>'; }).join('') + '</ul></details>';
    return h + '</div>';
  };

  V.more = function () {
    var c = counts();
    return top() + '<div class="wrap"><h1>More</h1><div class="grid">' + [['inbox', 'Inbox', c.inbox + ' to sort'], ['vault', 'Vault', c.vault + ' entries'], ['log', 'Log', c.log + ' rows'], ['review', 'Weekly review', ''], ['guide', 'Guide', 'How it works'], ['settings', 'Settings', 'Data, sync, backup']].map(function (x) { return '<a class="card stat" href="#' + x[0] + '"><div style="width:24px;height:24px;color:var(--v1)">' + ic(x[0]) + '</div><b style="font-size:18px;margin-top:6px">' + x[1] + '</b><span>' + x[2] + '</span></a>'; }).join('') + '</div></div>';
  };

  // ---------- front door + handoff text ----------
  function handoffPrompt() {
    var names = live(S.topics).map(function (t) { return t.name; });
    return 'polaris handoff. Look back over this whole chat and give me one POLARIS block with every decision, fact, idea, open question, thing waiting on me, file, source or correction worth keeping.\n\n' +
      'Use exactly this format in one code block. One item per group, groups split by a line with ---.\n\n' +
      '```\nPOLARIS v1\ntopic: ' + (names.length ? names[0] : '<topic name>') + '\n---\nkind: decision\nsaid: MM/DD/YYYY\nwords: my exact words, if I said it\nproposal: one plain sentence of what to record\nbase: a link or file name it came from\n---\nEND POLARIS\n```\n\n' +
      'kind is one of: fact, decision, idea, question, waiting, asset, source, correction, conflict, done (a step finished), next (a step still to do).\n' +
      (names.length ? 'My topics: ' + names.join(', ') + '. Put a topic: line in a group when it belongs to a different topic than the first line.\n' : '') +
      'Rules: only things actually said or decided in this chat. said is the date it was said here. Quote me word for word in words, never reword me. If you made a call without asking me, start the proposal with "assistant call:". Leave a field blank rather than guess. No commentary outside the block.';
  }
  function topicLine() { var n = live(S.topics).map(function (t) { return t.name; }); return n.length ? 'My topics: ' + n.join(', ') + '.' : 'I have not set my topics yet: suggest four to six from what you find, then use them.'; }
  var BLOCK = '```\nPOLARIS v1\ntopic: <topic name>\n---\nkind: fact | decision | idea | question | waiting | asset | source | correction | conflict | done | next\nsaid: MM/DD/YYYY\nwords: my exact words, if I said it\nproposal: one plain sentence of what to record\nbase: a link, file name or chat name it came from\n---\nEND POLARIS\n```';
  function harvestPrompt() {
    return 'polaris harvest. I want to catch my polaris up on everything I already told you in past chats.\n\n' + topicLine() + '\n\n' +
      'Work one topic per reply. For each topic: search my past chats with several different keywords (names, places, projects, words I would use), open the chats that matter, and read them, not just their titles. Then give me one POLARIS block for that topic in this exact format, groups split by a line with ---:\n\n' + BLOCK + '\n\n' +
      'If we are inside a Project, cover only the chats in this Project (I will run this once in each Project, and once outside Projects for the rest). Rules: only what was actually said or decided in those chats. said is the date of the chat it came from. Quote me word for word in words, never reword me. When two chats disagree, the newest one wins: record the newest as a fact and add a conflict item naming both. Things you suggested that I never agreed to are ideas, not decisions; start those with "assistant call:" if you made the call. Leave a field blank rather than guess. After the block, list the chats you could not open and the topic you will do next, then wait for me to say next.';
  }
  function catchupPrompt() {
    return 'polaris catch-up. Search my chats from the last 7 days (and any chat today), read the ones where something was decided, changed, learned or left waiting on me, and give me one POLARIS block covering all of it, newest first.\n\n' + topicLine() + '\n\n' + BLOCK + '\n\nSame rules as always: only what was said or decided, said is that chat\'s date, quote me exactly, newest wins, mark your own calls "assistant call:", leave blanks rather than guess.';
  }
  function frontDoor(kind) {
    var name = S.profile.name || 'me', rules = S.settings.rules.filter(function (r) { return r.on; });
    var homes = live(S.topics).map(function (t) { return '- ' + t.name + ' (' + t.status + ')'; }).join('\n') || '- (add your topics in polaris)';
    var body = '# polaris: start here\n\n' + (kind === 'chatgpt' ? '' : 'Read this before working with ' + name + '.\n\n') +
      name + ' keeps AI work in sync with polaris (polaris by Gugui): one record per topic, a Vault of files, an Inbox of proposals and a list of what is waiting on them. Chats propose; ' + name + ' decides.\n\n' +
      '## Topics\n' + homes + '\n\n## Rules\n' + rules.map(function (r, i) { return (i + 1) + '. ' + r.text; }).join('\n') + '\n\n' +
      '## Saving every chat\nIn every chat with ' + name + ': whenever something is decided, learned, changed or left waiting, end that reply with a POLARIS block so ' + name + ' can paste it into polaris. Do it without being asked, every time; never wait for a reminder. For anything being built, record each finished step as kind done and each step still to do as kind next. When ' + name + ' says "polaris handoff", give one block for the whole chat. "polaris harvest" means go through past chats topic by topic; "polaris catch-up" means the last 7 days.\n\n```\nPOLARIS v1\ntopic: <one of the topics above>\n---\nkind: fact | decision | idea | question | waiting | asset | source | correction | conflict | done | next\nsaid: MM/DD/YYYY\nwords: their exact words, if they said it\nproposal: one plain sentence\nbase: link or file name\n---\nEND POLARIS\n```\n\nQuote them word for word. Mark your own calls "assistant call:". Never guess a date or a fact: leave it blank.\n';
    if (kind === 'chatgpt') return body.slice(0, 1500);
    return body;
  }

  var SIGNS = {
    mercury: '<svg viewBox="0 0 24 34" aria-hidden="true"><path d="M6.5 2.5a5.5 5.5 0 0 0 11 0"/><circle cx="12" cy="13.5" r="6"/><path d="M12 19.5V32M7.5 26h9"/></svg>',
    jupiter: '<svg viewBox="0 0 26 34" aria-hidden="true"><path d="M3.5 9.5a5 5 0 0 1 9.5 1.8c0 5.2-5.6 9.6-9.5 13.2H23M18.5 3.5V32"/></svg>',
    neptune: '<svg viewBox="0 0 20 24" aria-hidden="true"><path d="M10 23V6M3 3v5a7 7 0 0 0 14 0V3M10 2v4M7 19h6"/></svg>'
  };
  var PROJECTS_CHIP = '<span class="projects-chip" role="img" aria-label="Projects, in the Claude sidebar"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 4.5h10M5.5 7.5h13"/><rect x="4" y="10.5" width="16" height="9.5" rx="2.5"/><path d="M4 13.5h16"/></svg>Projects</span>';
  function harvestCard(dismiss) {
    return '<div class="card harvest"><h3>Catch up your old chats <span class="faint small">optional</span></h3>' +
      '<p class="small dim">From now on every chat saves itself. The harvest goes back through the chats you already had, so polaris has those too. You do it once, at your own pace.</p>' +
      '<ol class="small steps-list"><li>Tap <b>Copy harvest prompt</b>.</li>' +
      '<li>In Claude, open <b>Projects</b> in the sidebar. It looks like this:<div class="chip-row">' + PROJECTS_CHIP + '</div></li>' +
      '<li>Open one Project, start a <b>new chat inside it</b>, paste and send. Claude can only see the chats in the Project you\'re in, so <b>do this once in each of your Projects</b>.</li>' +
      '<li>Chats that aren\'t in any Project: start one new chat outside Projects and paste it there too.</li>' +
      '<li>Claude goes topic by topic. Copy each reply, come back, tap <b>Save from Claude</b>. Type <b>next</b> in Claude for the next topic. Stop whenever you like; type next later to pick up.</li></ol>' +
      '<div class="row"><button class="btn" data-act="copy-harvest">Copy harvest prompt</button>' + (dismiss ? '<button class="btn ghost sm" data-act="harvest-hide">Hide this</button>' : '') + '</div></div>';
  }
  function syncCard() {
    var on = S.settings.dataMode === 'pair' && pairStore(), P = S.settings.pair || {};
    var h = '<div class="card sync" id="sync"><h2>Sync my devices</h2>';
    if (on) {
      h += '<p class="small"><span class="tag ok">On</span> Your phone and computer stay in step on their own. ' + (P.at ? 'Last synced ' + fmtDay(P.at) + '.' : '') + '</p>' +
        '<div class="row"><button class="btn primary" data-act="pair-now">Sync now</button><button class="btn" data-act="pair-show">' + (ui.pairShow ? 'Hide my code' : 'Show my code') + '</button><button class="btn ghost sm" data-act="pair-off">Turn off on this device</button></div>';
      if (ui.pairShow) h += '<div class="codebox"><p class="small dim">Your code. Send it to your other device, then on that device: Sync my devices, I have a code, paste, Join. <b>Save it in Notes or Passwords too</b>: it is also your recovery code for a new phone. Keep it private, like a password.</p><textarea readonly id="pair-code" aria-label="Your sync code">' + esc(pairStore()) + '</textarea><div class="row"><button class="btn primary" data-act="pair-share">Share code</button><button class="btn" data-act="pair-copy">Copy code</button></div></div>';
    } else if (ui.pairJoin) {
      h += '<p class="small dim">Paste the code from your other device. Everything here stays and is merged in, nothing is replaced.</p><textarea id="pair-in" placeholder="polaris1-..." aria-label="Paste your sync code"></textarea><div class="row"><button class="btn primary" data-act="pair-join">Join</button><button class="btn ghost" data-act="pair-cancel">Cancel</button></div>';
    } else {
      h += '<p class="small dim">Keep your phone and computer in lockstep. No accounts. Everything is encrypted on your device before it leaves, so nobody else can read it.</p>' +
        '<ol class="small steps-list"><li><b>On one device</b> (start with the one that has the most in it): tap <b>Start</b>, then <b>Share code</b> to send the code to your other device.</li><li><b>On the other device</b>: open polaris from its icon, tap <b>I have a code</b>, paste, <b>Join</b>.</li></ol>' +
        '<div class="row"><button class="btn primary" data-act="pair-start">Start</button><button class="btn" data-act="pair-join-open">I have a code</button></div>' +
        (S.settings.dataMode === 'github' ? '<p class="small faint">You use GitHub sync now. Starting this one switches this device over; your GitHub copy stays as it is.</p>' : '');
    }
    return h + '</div>';
  }
  function jumpGeneral() { return (window.POLARIS_PRESET || {}).jumpstart === '*'; }
  function jumpTopic() { var j = (window.POLARIS_PRESET || {}).jumpstart || ''; return j === '*' ? '' : j; }
  function generalPrompt() {
    return 'polaris jumpstart. You are setting up polaris for me, start to finish. Guide me the whole way: do every step you can yourself, and when a step is mine, tell me exactly what to click or tap, one step at a time, then wait for me. Use everything you have in this session (Cowork): search of my past chats, my Projects, memory, connected folders, scheduled tasks and any connectors. Ask me only for what only I can do. Tell me as you finish each part.\n\n' +
      '## 1. Find what I have been working on\n' +
      'Search my chats from the last 30 days (and this Project, if we are in one) with several keywords, read the ones that matter, and pick the 4 to 6 topics that matter most in my life and work right now. Tell me the list.\n\n' +
      '## 2. Save every chat from now on, by default\n' +
      'In every chat with me from now on, whenever something is decided, learned, changed, finished or left waiting on me, end that reply with a POLARIS block (format below) without being asked, every time. Save this rule to your memory. If we are in a Project, save it to the Project\'s memory too. In Cowork, also save the "polaris: start here" text at the bottom of this message to your standing instructions (ask me first). If none of that works, tell me in one line where to paste it.\n\n' +
      '## 3. Give me my POLARIS block\n' +
      'End this reply with one POLARIS block covering those topics: the main facts (kind: fact), decisions (kind: decision), what only I can do (kind: waiting), open questions (kind: question), and for anything I am building, steps done (kind: done) and steps left (kind: next). Put a topic: line in every group. Exact format, groups split by a line with ---:\n\n' +
      '```\nPOLARIS v1\ntopic: <topic name>\n---\ntopic: <topic name>\nkind: fact\nsaid: MM/DD/YYYY\nwords: my exact words, if I said it\nproposal: one plain sentence\nbase: a link, file or chat name\n---\nEND POLARIS\n```\n\n' +
      '## 4. Tell me how to save it\n' +
      'Right after the block, tell me in plain steps: copy this whole reply, open polaris on my phone, paste it in the box on the jumpstart screen and tap Save it (later on, tap Save from Claude on the Home screen instead). Wait until I say done.\n\n' +
      '## 5. Offer the harvest\n' +
      'Then explain in two lines what the harvest is (going back through all my older chats so polaris has them too, one topic at a time) and ask if I want it now. If yes: if you can search my chats across all my Projects, do it yourself, one topic per reply, and remind me each time to copy the reply and tap Save from Claude in polaris. If you can only see some of them, list my Projects for me and walk me through it: open Projects in the Claude sidebar, open one Project, start a new chat inside it, paste the harvest prompt (in polaris: Home, Copy harvest prompt) and send, then the next Project, and once more in a new chat outside Projects. Keep track of which Projects are done.\n\n' +
      '## 6. Keep it going\n' +
      'If you can create scheduled tasks, offer one (ask me first): once a week, catch up anything from my chats that week and give me one POLARIS block, and notify me so I can tap Save from Claude.\n\n' +
      'Rules: only what was actually said, done or decided. Dates as MM/DD/YYYY. Quote me word for word in words, never reword me. If you made a call without asking me, start the proposal with "assistant call:". Leave a field blank rather than guess. Never put passwords, keys or tokens in the record.\n\n' +
      '---\n' + frontDoor('claude');
  }
  function welcome() {
    var A = window.POLARIS_ART || {}, pArt = S.settings.planetArt || A.planet, rArt = S.settings.residentArt || A.resident, J = jumpTopic(), nm = S.profile.name;
    var blink = !S.settings.residentArt && A.residentHalf && A.residentClosed;
    var res = rArt ? '<div class="resident w-res' + (blink ? ' blinks' : '') + '" role="img" aria-label="' + esc(nm ? nm + ', your polaris resident' : 'Your polaris resident') + '"><i style="--res:url(' + esc(rArt) + ')"></i>' + (blink ? '<i class="h" style="--res:url(' + esc(A.residentHalf) + ')"></i><i class="c" style="--res:url(' + esc(A.residentClosed) + ')"></i>' : '') + '</div>' : '';
    var sign = SIGNS[A.sign] || '';
    return '<section class="welcome" aria-labelledby="w-h" style="--pglow:' + esc(A.accent || '#8a74ff') + '">' +
      '<div class="w-art">' + '<div class="w-planet' + (pArt ? '' : ' none') + '"' + (pArt ? ' style="--art:url(' + esc(pArt) + ')"' : '') + '>' + '' + '</div>' + (sign ? '<span class="w-sign">' + sign + '</span>' : '') + res + '</div>' +
      '<div class="w-copy">' + (A.lockup ? '<img class="w-lock" src="' + A.lockup + '" alt="polaris by Gugui" width="640" height="203">' : '') +
      '<h1 id="w-h">' + (nm ? 'Hi ' + esc(nm) + '.' : 'Welcome to polaris.') + '</h1>' +
      '<p class="w-lead">' + (J ? 'Everything you build with Claude, kept in one place. Starting with your ' + esc(J.toLowerCase()) + ': every step done, every step left, kept up to date as you go.' : 'Everything your AI chats decide, kept in one place. Nothing gets lost between chats, and no chat starts from zero.') + '</p>' +
      (nm ? '' : '<label for="su-name">What should your chats call you?</label><input type="text" id="su-name" placeholder="First name" autocomplete="given-name">') +
      '<p class="w-meta">About 5 minutes · Your data stays on your device</p>' +
      '<div class="w-cta"><button class="btn primary big" data-act="setup-next">Let\'s begin</button><a class="w-skip" href="#home" data-act="setup-later">Look around first</a></div></div></section>';
  }
  function jumpstartPrompt() {
    var J = jumpTopic() || 'Website build';
    return 'polaris jumpstart. Do these in order and tell me as you finish each one. Use everything you have in this session: my connected folders, search of my past chats, memory, scheduled tasks and any connectors. Do the work yourself instead of telling me how. Ask me only for what only I can do (signing in, approving a folder or a task).\n\n' +
      '## 1. First and most important: save my ' + J.toLowerCase() + '\n' +
      'I am in the middle of building my website. I need the whole build written down so nothing is ever lost.\n' +
      '- If we are inside a Claude Project: this Project is my website build. Search every chat in this Project (several keywords, newest first) and read them, plus every file and note in the Project knowledge. That is the whole build.\n' +
      '- If you can see my files (Cowork with a folder connected, or Claude Code): find my website project. If it is not connected yet, ask me to add the folder. If there is more than one, ask me which. Read it properly: README, package.json or config, the git history (git log), recent changes, and any notes, TODOs or plans in it.\n' +
      '- Also, if you can search my past chats: search them about the website with several keywords (website, site, build, page, design, domain, deploy, launch, and anything specific you find) and read them, not just their titles.\n' +
      'Then write the full build record:\n' +
      '  a. What the site is, who it is for, and the tools it uses (framework, hosting, domain, services).\n' +
      '  b. Every step already done, in order, each with its date if you can find it.\n' +
      '  c. Where it stands right now: what works, what is half done, anything broken.\n' +
      '  d. Every step left, in order, as clear tasks.\n' +
      '  e. Open questions, and anything only I can do (logins, payments, content, decisions).\n' +
      '  f. Links and files that matter.\n' +
      '- If you can write files: save this as BUILD-PROGRESS.md in the website project, and add this standing rule to the project\'s CLAUDE.md (create it if missing): "After every step you finish on this site, update BUILD-PROGRESS.md: move the step to Done with today\'s date, update Right now and Next steps. Then end your reply with a POLARIS block with the steps done and the steps next." Ask me before writing if you need to.\n' +
      '- If you cannot write files: give me the record as a document I can keep.\n' +
      '- If we are in a Project: save the full record to this Project\'s memory too, word for word where it matters, so every new chat in this Project starts knowing exactly where the build stands. From now on, after every step we finish in this Project, update that memory (move the step to done with the date, update what is next) without me asking.\n\n' +
      '## 1b. Keep it current without me (Cowork)\n' +
      'If you can create scheduled tasks, set one up (ask me first): every evening, review that day\'s chats and the website folder, update BUILD-PROGRESS.md, save that day\'s POLARIS block as a file in a polaris folder inside the project (polaris/YYYY-MM-DD.md), and if you can, copy it to my clipboard and notify me, so all I do is open polaris on my phone and tap Save from Claude. Skip days with no changes.\n\n' +
      '## 2. Keep it saved from now on\n' +
      'In every chat with me from now on, whenever a build step is finished, something is decided, or something is left waiting on me, end that reply with a POLARIS block (format below) without being asked. If you can save to memory, remember this rule. In Cowork or Claude Code, also save the "polaris: start here" text at the bottom of this message where your standing instructions live (for example ~/.claude/CLAUDE.md or my Cowork instructions) so every session follows it (ask me first). If neither works, tell me in one line where to paste it.\n\n' +
      '## 3. Give me my POLARIS block\n' +
      'End this reply with one POLARIS block for topic "' + J + '": one group per step done (kind: done), one per step left (kind: next), the main facts (kind: fact), open questions (kind: question), what only I can do (kind: waiting), and key files or links (kind: asset or source). Exact format, groups split by a line with ---:\n\n' +
      '```\nPOLARIS v1\ntopic: ' + J + '\n---\nkind: done\nsaid: MM/DD/YYYY\nwords: my exact words, if I said it\nproposal: one plain sentence\nbase: a link, file or chat name\n---\nEND POLARIS\n```\n\n' +
      '## 4. Then my other chats: the harvest (optional, only when I say next)\n' +
      'After the block, explain in two lines what the harvest is (going back through my older chats so polaris has them too) and ask if I want it. If I say next, go one topic at a time with the same block format, and tell me which topic comes after.\n\n' +
      'Rules: only what was actually said, done or decided. Dates as MM/DD/YYYY. Quote me word for word in words, never reword me. If you made a call without asking me, start the proposal with "assistant call:". Leave a field blank rather than guess. Never put passwords, keys or tokens in the record.\n\n' +
      '---\n' + frontDoor('claude');
  }
  V.setup = function () {
    var J = jumpTopic(), step = ui.setupStep || 0;
    if (step === 0) return welcome();
    var G = jumpGeneral();
    if (!J && !G) return LEGACY_SETUP(step);
    if (J) ensureTopic(J);
    var where = ui.jsWhere || 'project';
    var h = top() + '<div class="wrap" style="max-width:660px"><div class="steps">' + [0, 1, 2].map(function (i) { return '<i class="' + (i <= step ? 'on' : '') + '"></i>'; }).join('') + '</div>';
    if (step === 1) {
      if (G) {
        h += '<div class="card js"><h1>Your jumpstart</h1><p class="dim">One prompt sets it all up. Claude finds what you\'ve been working on, saves it here, and from then on saves every chat on its own.</p>' +
          '<ol class="js-steps"><li><b>Copy your prompt</b><button class="btn primary" data-act="copy-jump">Copy jumpstart prompt</button></li>' +
          '<li><b>Paste it into Cowork</b><p class="small dim">On your computer, open the Claude app and go to <b>Cowork</b>. Paste and send. Cowork guides you through the rest, step by step: it tells you exactly what to click and when. Say yes when it asks to save or to set something up.</p><p class="small faint">No Cowork? Paste it into a new Claude chat instead.</p></li>' +
          '<li><b>Copy Claude\'s whole reply and paste it here</b><textarea id="js-text" placeholder="Paste the whole reply. polaris finds the POLARIS block." aria-label="Claude\'s reply">' + esc(ui.jsText || '') + '</textarea><p class="small faint">Claude on your computer? Copy there, then paste here. With the same Apple ID, your iPhone pastes what your Mac copied.</p></li></ol>' +
          '<p class="homeline"><b>Use polaris on your phone.</b> Your computer is where Claude works. Copy a reply there, then tap Save from Claude here.</p><div class="row between" style="margin-top:6px"><a class="small" href="#home" data-act="setup-later">Skip for now</a><button class="btn primary" data-act="js-save">Save it</button></div></div>';
        return h + '</div>';
      }
      h += '<div class="card js"><h1>Your jumpstart</h1><p class="dim">One prompt does it all. It saves your whole ' + esc(J.toLowerCase()) + ' first, every step done and every step left, then sets Claude up to keep it current.</p>' +
        '<ol class="js-steps">' +
        '<li><b>Copy your prompt</b><button class="btn primary" data-act="copy-jump">Copy jumpstart prompt</button></li>' +
        '<li><b>Paste it into Claude on your MacBook</b><p class="small" style="margin:0">Where have you been building your site?</p><div class="seg" role="tablist" aria-label="Where you build">' + [['project', 'In a Claude Project'], ['cowork', 'In a folder on my Mac']].map(function (o) { return '<button role="tab" data-act="js-where" data-v="' + o[0] + '" class="' + (where === o[0] ? 'on' : '') + '">' + o[1] + '</button>'; }).join('') + '</div>' +
        (where === 'project' ? '<p class="small dim">Open the Claude app and go to the <b>Project</b> where you\'ve been building your site. Start a <b>new chat inside that Project</b>, paste, and send. That\'s all. Claude reads every chat and file in that Project, writes down your whole build, and saves it to the Project\'s memory so it\'s never lost. Say yes if it asks to save.</p>' : where === 'cowork' ? '<p class="small dim">Open the Claude app on your MacBook and go to <b>Cowork</b>. Add your website\'s folder (the + button, then Add folder). Paste and send. It reads your build, saves BUILD-PROGRESS.md in your project, and offers to set up an evening task that keeps it current without you. Say yes when it asks.</p>' : where === 'code' ? '<p class="small dim">Open the Claude app, go to <b>Code</b>, and open your website\'s folder. Paste, send, and say yes when it asks to save files. It writes BUILD-PROGRESS.md into your project and keeps it updated after every step.</p>' : '<p class="small dim">Open the Claude app and start a new chat. If your website chats live in a Project, start it inside that Project so Claude can search them. Paste and send.</p>') + '</li>' +
        '<li><b>Copy Claude\'s whole reply and paste it here</b><textarea id="js-text" placeholder="Paste the whole reply. polaris finds the POLARIS block." aria-label="Claude\'s reply">' + esc(ui.jsText || '') + '</textarea><p class="small faint">On your iPhone? Copy the reply on your Mac, then paste here. With the same Apple ID, your iPhone pastes what your Mac copied.</p></li></ol>' +
        '<p class="homeline"><b>Use polaris on your phone.</b> Your computer is where Claude works. Copy a reply there, then tap Save from Claude here.</p><div class="row between" style="margin-top:6px"><a class="small" href="#home" data-act="setup-later">Skip for now</a><button class="btn primary" data-act="js-save">Save my build</button></div></div>';
    } else {
      if (G) {
        var tps = live(S.topics), n = S.inbox.filter(function (i) { return i.chat === 'jumpstart' && i.status === 'applied'; }).length;
        h += '<div class="card js"><h1>Your polaris is set up.</h1><p class="dim">' + n + ' thing' + (n === 1 ? '' : 's') + ' saved across ' + tps.length + ' topic' + (tps.length === 1 ? '' : 's') + '.</p>' +
          (tps.length ? '<ul class="steps-list">' + tps.map(function (t) { return '<li><a href="#topic/' + esc(t.id) + '" data-act="setup-finish">' + esc(t.name) + '</a></li>'; }).join('') + '</ul>' : '') +
          '<h3>From now on, it saves itself</h3><p class="small dim">You never have to ask. Whenever something is decided or finished, Claude ends its reply with a POLARIS box on its own. Copy that reply, open polaris, tap <b>Save from Claude</b>. That\'s it.</p>' +
          '<p class="small faint">Quick check: start a new Claude chat and decide something small. If the reply ends with a POLARIS box, you\'re set. If not, tap <button class="linkish" data-act="copy-front" data-v="claude">Copy start-here</button> and paste it in Claude, Settings, Profile, the personal preferences box.</p>' +
          '</div>' + harvestCard(false) + '<div class="card"><div class="row"><a class="btn primary" href="#home" data-act="setup-finish">Go home</a></div></div>';
        return h + '</div>';
      }
      var t = topicByName(J), all = t ? live(t.progress || []) : [], dn = all.filter(function (x) { return x.status === 'done'; }), nx = all.filter(function (x) { return x.status !== 'done'; });
      h += '<div class="card js"><h1>Your ' + esc(J.toLowerCase()) + ' is saved.</h1><p class="dim">' + dn.length + ' step' + (dn.length === 1 ? '' : 's') + ' done, ' + nx.length + ' left.</p>' +
        (nx.length ? '<h3>Next up</h3><ol class="steps-list">' + nx.slice(0, 3).map(function (x) { return '<li>' + esc(x.text) + '</li>'; }).join('') + '</ol>' : '') +
        '<h3>From now on, it saves itself</h3><p class="small dim">You never have to ask. Whenever a step is finished or something is decided, Claude ends its reply with a POLARIS box on its own. Copy that reply, open polaris, tap <b>Save from Claude</b>. That\'s it.</p>' +
        '<p class="small faint">Quick check: start a new Claude chat and decide something small. If the reply ends with a POLARIS box, you\'re set. If not, tap <button class="linkish" data-act="copy-front" data-v="claude">Copy start-here</button> and paste it in Claude, Settings, Profile, the personal preferences box.</p>' +
        '</div>' + harvestCard(false) + '<div class="card" style="text-align:left">' +
        '<div class="row">' + (t ? '<a class="btn primary" href="#topic/' + esc(t.id) + '" data-act="setup-finish">See the whole build</a>' : '') + '<a class="btn" href="#home" data-act="setup-finish">Go home</a></div></div>';
    }
    return h + '</div>';
  };
  function LEGACY_SETUP(step) {
    var total = 5;
    var h = top() + '<div class="wrap" style="max-width:640px"><div class="steps">' + Array.from({ length: total }, function (_, i) { return '<i class="' + (i <= step ? 'on' : '') + '"></i>'; }).join('') + '</div><div class="card">';
    if (step === 1) {
      var tpl = ['Work', 'Personal life', 'Side projects', 'Creative work', 'Health and fitness', 'Money and admin', 'Learning', 'Home', 'Travel'];
      var have = S.topics.map(function (t) { return t.name; });
      h += '<h2>Your topics</h2><p class="dim">A topic is a home for one area of your life or work. Start with three to six. You can add more any time.</p><div class="tpl">' + tpl.map(function (n) { return '<label><input type="checkbox" name="tpl" value="' + esc(n) + '"' + (have.indexOf(n) >= 0 ? ' checked disabled' : '') + '>' + esc(n) + '</label>'; }).join('') + '</div><label for="su-custom">Your own (one per line)</label><textarea id="su-custom" placeholder="My band&#10;Kitchen remodel" style="min-height:80px"></textarea>';
    }
    if (step === 2) h += '<h2>Where your data lives</h2><p class="dim">You can change this later in Settings.</p>' +
      '<label class="check"><input type="radio" name="dm" value="device"' + (S.settings.dataMode !== 'github' ? ' checked' : '') + '><span><b>On this device</b><br><span class="small dim">No account, nothing leaves your phone or computer. Export a backup file now and then.</span></span></label>' +
      '<label class="check"><input type="radio" name="dm" value="github"' + (S.settings.dataMode === 'github' ? ' checked' : '') + '><span><b>Sync to my own GitHub repo</b><br><span class="small dim">Your record is saved as polaris.json in a private repo you own, so your phone and computer stay in step. Needs a GitHub account and a token. The Guide walks you through it.</span></span></label>';
    if (step === 3) h += '<h2>Your rules</h2><p class="dim">Your chats read these every time. Keep the ones you want.</p>' + S.settings.rules.map(function (r) { return '<label class="check"><input type="checkbox" data-rule="' + esc(r.id) + '"' + (r.on ? ' checked' : '') + '><span>' + esc(r.text) + '</span></label>'; }).join('');
    if (step === 4) h += '<h2>Teach your chats</h2><p class="dim">Paste this once where each AI reads standing instructions. That is the whole setup.</p>' +
      '<details class="ch" open><summary>Claude: Project instructions</summary><p class="small dim">In a Claude Project, open Project knowledge or instructions and paste it. For Claude Code, save it as CLAUDE.md in your project.</p><button class="btn sm" data-act="copy-front" data-v="claude">Copy for Claude</button></details>' +
      '<details class="ch"><summary>ChatGPT: custom instructions or a Project</summary><p class="small dim">Settings, Personalization, Custom instructions; or a ChatGPT Project\'s instructions. This copy is trimmed to fit.</p><button class="btn sm" data-act="copy-front" data-v="chatgpt">Copy for ChatGPT</button></details>' +
      '<details class="ch"><summary>Past chats: the harvest</summary><p class="small dim">Once, after setup: paste this in a chat that can search your history (a Claude Project, or ChatGPT with chat history on). It goes topic by topic. Paste each reply into Capture.</p><button class="btn sm" data-act="copy-harvest">Copy harvest prompt</button></details>' +
      '<details class="ch"><summary>Any other chat</summary><p class="small dim">No standing instructions? Paste the handoff prompt at the end of the chat instead.</p><button class="btn sm" data-act="copy-handoff">Copy handoff prompt</button></details>';
    h += '</div><div class="row between" style="margin-top:12px">' + (step ? '<button class="btn ghost" data-act="setup-back">Back</button>' : '<a class="btn ghost" href="#home">Later</a>') + '<button class="btn primary" data-act="setup-next">' + (step === total - 1 ? 'Done' : 'Next') + '</button></div></div>';
    return h;
  }

  V.guide = function () {
    var ch = [
      ['What polaris is', '<p>When you work with AI chats, the real decisions scatter: one chat knows the plan, another has the latest version, a third quietly contradicts both. polaris is the one place they all report back to.</p><ul><li><b>Topics</b>: one record per area, with a Start here block, decisions, ideas, open questions, conflicts and sources.</li><li><b>Inbox</b>: chats propose; you apply, hold or reject.</li><li><b>Waiting</b>: what only you can do.</li><li><b>Vault</b>: pointers to your files and where they live.</li><li><b>Log</b>: corrections you made and calls a chat made without asking.</li></ul>'],
      ['Your first day, step by step', '<p>Follow these in order the first time. After that, it is only the save loop.</p><ol>' +
        '<li><b>Install it.</b> iPhone: open the link in Safari, tap Share, then Add to Home Screen, then Add. Android: in Chrome, tap the menu, then Add to Home screen or Install app. From then on, open polaris from its icon, not the browser.</li>' +
        '<li><b>Run setup.</b> Tap <a href="#setup">Set up polaris</a>. Check your name, pick three to six topics, choose On this device, keep the rules, tap Done.</li>' +
        '<li><b>Teach Claude.</b> In <a href="#settings">Settings</a>, tap Copy start-here for Claude. In Claude, open Settings, then Profile, paste it into the personal preferences box and save. Using Claude Projects? Paste it into each Project\'s instructions too.</li>' +
        '<li><b>Test it.</b> Start a new Claude chat and decide something small. The reply should end with a box that starts with POLARIS v1.</li>' +
        '<li><b>Save that reply.</b> Copy the whole reply. Open <a href="#capture">Capture</a>, paste, tap Read it, then Add to Inbox.</li>' +
        '<li><b>Sort it.</b> Open <a href="#inbox">Inbox</a>. Apply what is right, Hold what you are unsure of, Reject what is wrong. Applied items land on their topic page.</li>' +
        '<li><b>Catch up on old chats.</b> Read the Harvest chapter below and do it once, in one sitting or a few.</li>' +
        '<li><b>Back up.</b> In Settings, tap Export backup (.json) and keep the file somewhere safe. Do it once a month.</li></ol>' +
        '<p><b>The save loop, every time:</b> copy the reply, Capture, Read it, Add to Inbox, Apply. No box at the end of a chat? Type <b>polaris handoff</b> in that chat.</p>' +
        '<p><b>Starting a new chat about a topic:</b> open the topic, tap Copy record, and paste it into the new chat first, so it starts knowing everything.</p>' +
        '<p class="dim">Read it found nothing? Make sure you copied the line that says POLARIS v1. The app looks old after an update? Close it fully and open it again.</p>'],
      ['Set it up (5 minutes)', '<ol><li>Open <a href="#setup">Setup</a>. Pick three to six topics.</li><li>Choose where your data lives: this device, or your own GitHub repo.</li><li>Keep the rules you want.</li><li>Copy the start-here text into your Claude Project instructions and your ChatGPT custom instructions (or a ChatGPT Project).</li></ol><p>That is it. Your chats now know your topics, your rules and how to hand things back.</p>'],
      ['The daily loop', '<ol><li>Work in any chat as usual.</li><li>At the end, say <b>polaris handoff</b>, or paste the <a href="#capture">handoff prompt</a>.</li><li>Copy the whole reply and paste it into <a href="#capture">Capture</a>. polaris finds the POLARIS block and shows what it read.</li><li>Add it to the Inbox. Then apply each item: a fact goes to Start here, a decision to Decisions, a waiting item to Waiting, a file to the Vault.</li></ol><p class="dim">Tip: when a new fact replaces an old one, mark the old line superseded. It stays in the record, crossed out, so you can always see what changed and when.</p>'],
      ['Harvest: catching up on past chats', '<p><b>Harvest</b> means going back through the chats you already had and pulling out what matters, so polaris starts full instead of empty. You do it once, after setup. After that, every new chat saves itself as you go.</p><ol><li>Copy the <b>harvest prompt</b> from <a href="#capture">Capture</a> or Settings.</li><li>In Claude, open <b>Projects</b> in the sidebar:<div class="chip-row">' + PROJECTS_CHIP + '</div>Open one Project, start a new chat inside it, paste and send. Claude can only see the chats in the Project you are in, so do this once in each of your Projects, plus once in a new chat outside Projects for the rest. (ChatGPT with chat history on works too.)</li><li>It works one topic at a time and replies with a POLARIS block. Paste each reply into Capture, add it to the Inbox, then say <b>next</b> in the chat.</li><li>Sort the Inbox: apply what is right, reject what is not, hold what you are unsure of. Conflicts land in the topic so you decide which version stands.</li></ol><p class="dim">Big history? Do your most important topic first, then the rest over a few sittings. Once a week, the <b>weekly catch-up</b> prompt does the same for the last 7 days, in case a chat ended without a handoff.</p>'],
      ['How polaris was made', '<p>polaris started as one person\'s fix for a real problem: dozens of AI chats and projects, each holding part of the story, and new chats repeating old plans or quietly overriding decisions. This is how he went about it. You can do the same, at any size.</p><ol><li><b>One pilot first.</b> He picked one topic and did the whole process on it before touching the rest.</li><li><b>Inventory.</b> He listed every chat and project he had, then grouped them into a handful of homes. Fewer, bigger homes beat many small ones.</li><li><b>Harvest in parallel.</b> Several AI helpers read the old chats at once, one topic each. Every fact kept the date it was said and the chat it came from.</li><li><b>He rules, the AI proposes.</b> Where chats disagreed, nothing was picked silently. Conflicts went on a list and he decided each one. By default the newest dated statement wins, and older lines stay in the record, marked superseded.</li><li><b>A Vault for files.</b> Images, documents and versions got a list saying what each is and where it lives.</li><li><b>A fresh check.</b> Before a topic counted as done, a fresh AI that had not seen the work read the record cold and answered questions from it.</li><li><b>One front door.</b> One start-here page every new chat reads first, so no chat starts from zero.</li><li><b>Keep it alive.</b> A running log of every correction he made, so nothing got lost when a chat ran long, and a weekly review.</li></ol><p class="dim">This app packs that whole method into one place, without the setup.</p>'],
      ['The weekly review', '<p>Once a week, open <a href="#review">Weekly review</a> and go down the list: sort the Inbox, clear Waiting, settle conflicts, move topic statuses, approve Vault entries, close Log rows, back up. polaris reminds you on Home when it is due.</p>'],
      ['The rules, and why', '<ul><li><b>Newest dated statement wins.</b> Chats repeat old plans. Dates settle it.</li><li><b>Nothing deleted without your yes.</b> polaris archives instead of deleting. Rejected Inbox items are kept.</li><li><b>Locked means locked.</b> Lock a line and it cannot be edited or archived until you unlock it.</li><li><b>Dates and sources on everything.</b> Every line says when it was said and where.</li><li><b>Pointers are links.</b> Put the link in base, and polaris makes it clickable.</li></ul>'],
      ['Keep your phone and computer in sync (GitHub)', '<p>Optional. Once it is on, every change you make on one device shows up on the other by itself: polaris syncs when you open it and a few seconds after every change. About 10 minutes, once. If you have Claude Cowork, paste this whole chapter into it and say <b>do this for me</b>: it can do every step except signing in and tapping Generate.</p><ol>' +
        '<li><b>Make a free GitHub account</b> at <a href="https://github.com/signup" target="_blank" rel="noopener">github.com/signup</a> (skip if you have one). Note your username.</li>' +
        '<li><b>Make a private home for your polaris.</b> Open <a href="https://github.com/new" target="_blank" rel="noopener">github.com/new</a>. Repository name: <code>my-polaris</code>. Choose <b>Private</b>. Tick <b>Add a README file</b>. Tap <b>Create repository</b>.</li>' +
        '<li><b>Make a key just for it.</b> Open <a href="https://github.com/settings/personal-access-tokens/new" target="_blank" rel="noopener">github.com/settings/personal-access-tokens/new</a>. Token name: <code>polaris</code>. Expiration: <b>1 year</b>. Repository access: <b>Only select repositories</b>, then pick <code>my-polaris</code>. Under Permissions, Repository permissions, set <b>Contents</b> to <b>Read and write</b>. Leave everything else alone. Tap <b>Generate token</b> and copy it (it starts with <code>github_pat_</code>). GitHub shows it only once.</li>' +
        '<li><b>Connect this device.</b> In polaris, open <a href="#settings">Settings</a>, Your data, tap <b>GitHub sync</b>. Owner: your GitHub username. Repo: <code>my-polaris</code>. Leave Branch <code>main</code> and File <code>polaris.json</code>. Paste the token. Tap <b>Save and sync now</b>. You should see <b>Synced</b>.</li>' +
        '<li><b>Connect your other device.</b> Open your polaris link there, Settings, GitHub sync, same owner and repo, paste the same token, <b>Save and sync now</b>. Everything from the first device comes over and merges.</li></ol>' +
        '<p><b>From then on</b> you do nothing: open polaris on either device and it is up to date. If both devices changed the same line, the newer one wins and the other lands in your Inbox as held, so nothing is lost.</p>' +
        '<p class="dim">The key is stored only on your devices and is only ever sent to api.github.com. To stop, Settings has Forget token. When the key expires next year, make a new one (step 3) and paste it in.</p>'],
      ['Install it on your phone', '<p><b>iPhone or iPad</b>: open polaris in Safari, tap Share, then <b>Add to Home Screen</b>. It opens full screen and works offline. Installed apps keep their data more reliably than a browser tab, so install before you rely on it.</p><p><b>Android</b>: in Chrome, tap the menu, then <b>Install app</b>. Or install the polaris APK if you were given one.</p><p><b>Computer</b>: in Chrome or Edge, use the install icon in the address bar.</p>'],
      ['Backups and privacy', '<p>polaris has no server and no account. On this device, your record lives in browser storage. Export a backup from <a href="#settings">Settings</a> every week or two (the weekly review reminds you). The Markdown export gives you a folder of readable files, one per topic, that you can drop into any repo or notes app.</p><p class="dim">Do not paste passwords, card numbers or other people\'s private details into polaris or your chats.</p>']
    ];
    return top() + '<div class="wrap" style="max-width:720px"><h1>Guide</h1><p class="dim">Everything you need, in ten short parts.</p>' + ch.map(function (c, i) { return '<details class="ch"' + (i === 0 ? ' open' : '') + '><summary>' + (i + 1) + '. ' + c[0] + '</summary>' + c[1] + '</details>'; }).join('') + '<p class="faint small" style="margin-top:18px">polaris by Gugui · <a href="https://argorodrigo.com" target="_blank" rel="noopener">argorodrigo.com</a></p></div>';
  };

  V.settings = function () {
    var gh = S.settings.gh, tok = Store.token(), kb = Math.round(Store.size() / 1024), pct = Math.min(100, Math.round(kb / 50));
    var h = top() + '<div class="wrap" style="max-width:720px"><h1>Settings</h1>';
    h += '<div class="card"><h2>Your data</h2><div class="seg" style="margin:6px 0 10px"><button data-act="mode" data-v="device" class="' + (S.settings.dataMode !== 'github' ? 'on' : '') + '">On this device</button><button data-act="mode" data-v="github" class="' + (S.settings.dataMode === 'github' ? 'on' : '') + '">GitHub sync</button></div>' +
      '<div class="small dim">Using about ' + kb + ' KB of roughly 5 MB browser storage.</div><div class="meter" style="margin:6px 0 10px"><i style="width:' + pct + '%"></i></div>' +
      '<div class="small dim">Last backup: ' + fmtDay(S.meta.lastBackup) + (S.settings.dataMode === 'github' ? ' · Last sync: ' + fmtDay(S.meta.lastSync) : '') + '</div></div>';
    if (S.settings.dataMode === 'github') h += '<div class="card"><h2>GitHub sync</h2><p class="small dim">Use a private repo and a fine-grained token limited to that repo with Contents: Read and write. <a href="#guide">How</a></p>' +
      '<div class="row"><div style="flex:1;min-width:140px"><label for="gh-owner">Owner</label><input type="text" id="gh-owner" value="' + esc(gh.owner) + '" placeholder="your-github-name" autocapitalize="off"></div><div style="flex:1;min-width:140px"><label for="gh-repo">Repo</label><input type="text" id="gh-repo" value="' + esc(gh.repo) + '" placeholder="my-polaris" autocapitalize="off"></div></div>' +
      '<div class="row"><div style="flex:1;min-width:140px"><label for="gh-branch">Branch</label><input type="text" id="gh-branch" value="' + esc(gh.branch) + '"></div><div style="flex:1;min-width:140px"><label for="gh-path">File</label><input type="text" id="gh-path" value="' + esc(gh.path) + '"></div></div>' +
      '<label for="gh-token">Token ' + (tok ? '(saved on this device)' : '') + '</label><input type="password" id="gh-token" placeholder="' + (tok ? '••••••••  leave blank to keep' : 'github_pat_…') + '" autocomplete="off">' +
      '<div class="row" style="margin-top:12px"><button class="btn primary" data-act="gh-save-sync">Save and sync now</button>' + (tok ? '<button class="btn danger" data-act="gh-forget">Forget token</button>' : '') + '</div></div>';
    h += syncCard();
    h += '<div class="card"><h2>Switch devices</h2><p class="small dim">Your phone is your polaris; your computer is where Claude works. To bring everything over to another device: tap <b>Copy my polaris</b> here, then on the other device tap <b>Paste from my other device</b>. On an iPhone and Mac with the same Apple ID, what you copy on one pastes on the other. Nothing is overwritten: both sides are merged. Want it to happen by itself? Turn on <a href="#guide">GitHub sync</a> (Guide, Keep your phone and computer in sync).</p><div class="row"><button class="btn primary" data-act="move-copy">Copy my polaris</button><button class="btn" data-act="move-paste">Paste from my other device</button></div></div>';
    h += '<div class="card"><h2>Backup and export</h2><div class="row"><button class="btn primary" data-act="export-json">Export backup (.json)</button><button class="btn" data-act="export-md">Export Markdown (.zip)</button><label class="btn" style="margin:0;color:var(--ink)">Import backup<input type="file" id="imp" accept=".json,application/json" hidden></label></div><p class="small dim">Import merges into what you have. Nothing here is overwritten without asking.</p></div>';
    h += '<div class="card"><h2>Teach your chats</h2><div class="row"><button class="btn" data-act="copy-front" data-v="claude">Copy start-here for Claude</button><button class="btn" data-act="copy-front" data-v="chatgpt">Copy for ChatGPT</button><button class="btn" data-act="copy-handoff">Copy handoff prompt</button><button class="btn" data-act="copy-harvest">Copy harvest prompt</button><button class="btn" data-act="copy-catchup">Copy weekly catch-up</button></div><details class="ch" style="margin-top:10px"><summary>Preview</summary><pre class="code">' + esc(frontDoor('claude')) + '</pre></details></div>';
    h += '<div class="card"><h2>You</h2><label for="st-name">Name your chats use</label><div class="row"><input type="text" id="st-name" value="' + esc(S.profile.name) + '" style="flex:1"><button class="btn" data-act="save-name">Save</button></div><label>Rules</label>' + S.settings.rules.map(function (r) { return '<label class="check"><input type="checkbox" data-act="rule" data-v="' + esc(r.id) + '"' + (r.on ? ' checked' : '') + '><span>' + esc(r.text) + '</span></label>'; }).join('') + '<div class="row"><a class="btn" href="#setup">Run setup again</a></div></div>';
    h += '<div class="card"><h2>Art</h2><p class="small dim">Swap the planet or add a resident with your own image (PNG or WebP, under 1 MB). Stored on this device.</p><div class="row"><label class="btn" style="margin:0;color:var(--ink)">Planet image<input type="file" id="art-planet" accept="image/*" hidden></label><label class="btn" style="margin:0;color:var(--ink)">Resident image<input type="file" id="art-res" accept="image/*" hidden></label>' + (S.settings.planetArt || S.settings.residentArt ? '<button class="btn ghost" data-act="art-clear">Use the default art</button>' : '') + '</div></div>';
    h += '<div class="card"><h2>Example and reset</h2><div class="row"><button class="btn" data-act="load-example">Load example topics</button><button class="btn danger" data-act="reset">Erase everything on this device</button></div></div>';
    h += '<div class="card"><h2>About</h2><p>' + lockup() + '</p><p class="small dim">Version ' + VERSION + '. Made by Gugui · <a href="https://argorodrigo.com" target="_blank" rel="noopener">argorodrigo.com</a>. No server, no tracking. Your record stays where you put it.</p></div>';
    return h + '</div>';
  };

  // ---------- forms ----------
  var FORM_FIELDS = {
    start: [['text', 'What is true now', 'area'], ['said', 'Said (MM/DD/YYYY)'], ['chat', 'Where (chat name)'], ['base', 'Link or file']],
    decisions: [['text', 'Decision', 'area'], ['words', 'Exact words (if any)', 'area'], ['who', 'Who decided', 'who'], ['said', 'Said (MM/DD/YYYY)'], ['base', 'Link or file']],
    ideas: [['text', 'Idea', 'area'], ['said', 'Said (MM/DD/YYYY)'], ['base', 'Link or file']],
    questions: [['text', 'Question', 'area'], ['said', 'Said (MM/DD/YYYY)'], ['base', 'Link or file']],
    conflicts: [['text', 'One version', 'area'], ['other', 'The other version', 'area'], ['said', 'Said (MM/DD/YYYY)'], ['base', 'Link or file']],
    sources: [['text', 'What it is'], ['base', 'Link'], ['said', 'Said (MM/DD/YYYY)']],
    waiting: [['text', 'What is waiting on you', 'area'], ['topic', 'Topic', 'topic'], ['base', 'Link'], ['said', 'Said (MM/DD/YYYY)']],
    vault: [['title', 'Title'], ['file', 'File name'], ['base', 'Where it lives (link)'], ['topic', 'Topic', 'topic'], ['said', 'Said (MM/DD/YYYY)']],
    log: [['text', 'What happened', 'area'], ['type', 'Kind', 'logtype'], ['fix', 'The fix', 'area'], ['said', 'Said (MM/DD/YYYY)']],
    inbox: [['proposal', 'Proposal', 'area'], ['kind', 'Kind', 'kind'], ['topic', 'Topic name'], ['words', 'Exact words', 'area'], ['chat', 'Chat'], ['base', 'Link or file'], ['said', 'Said (MM/DD/YYYY)']]
  };
  function form(title, kind, item, onSave) {
    item = item || {};
    var f = FORM_FIELDS[kind].map(function (fd) {
      var v = item[fd[0]] != null ? item[fd[0]] : (fd[0] === 'said' ? C.today() : ''), id = 'f-' + fd[0], t = fd[2];
      var input;
      if (t === 'area') input = '<textarea id="' + id + '" style="min-height:70px">' + esc(v) + '</textarea>';
      else if (t === 'topic') input = '<select id="' + id + '"><option value="">None</option>' + live(S.topics).map(function (x) { return '<option value="' + esc(x.id) + '"' + (x.id === v ? ' selected' : '') + '>' + esc(x.name) + '</option>'; }).join('') + '</select>';
      else if (t === 'who') input = '<select id="' + id + '"><option value="me">Me</option><option value="assistant"' + (v === 'assistant' ? ' selected' : '') + '>An AI, without asking (assistant call)</option></select>';
      else if (t === 'logtype') input = '<select id="' + id + '"><option value="ledger">Ledger: correction or idea</option><option value="call"' + (v === 'call' ? ' selected' : '') + '>Call: an AI decided without asking</option></select>';
      else if (t === 'kind') input = '<select id="' + id + '">' + C.KINDS.map(function (k) { return '<option' + (k === v ? ' selected' : '') + '>' + k + '</option>'; }).join('') + '</select>';
      else input = '<input type="text" id="' + id + '" value="' + esc(v) + '">';
      return '<label for="' + id + '">' + esc(fd[1]) + '</label>' + input;
    }).join('');
    modal('<h2>' + esc(title) + '</h2>' + f + '<div class="row" style="justify-content:flex-end;margin-top:14px"><button class="btn ghost" data-act="close">Cancel</button><button class="btn primary" data-act="form-save">Save</button></div>');
    pending = function () {
      var out = {};
      FORM_FIELDS[kind].forEach(function (fd) { var el = document.getElementById('f-' + fd[0]); out[fd[0]] = el ? el.value.trim() : ''; });
      if (out.said) out.said = C.normDate(out.said) || C.today();
      var main = out.text || out.title || out.proposal;
      if (!main) { toast('Add some text first'); return false; }
      onSave(out); return true;
    };
  }

  // ---------- actions ----------
  function findLine(t, id) { var hit = null; ['start', 'decisions', 'ideas', 'questions', 'conflicts', 'sources'].forEach(function (c) { t[c].forEach(function (x) { if (x.id === id) hit = { list: c, x: x }; }); }); return hit; }
  function touch(o) { o.updated = C.now(); return o; }
  function newItem(o) { o.id = C.uid(); o.created = C.now(); o.updated = C.now(); return o; }
  function ensureTopic(name) { var t = topicByName(name); if (t) return t; t = C.emptyTopic(name); S.topics.push(t); return t; }

  function applyInbox(i, topicId) {
    var t = topicId && topicId !== '#' ? topicById(topicId) : (i.topic ? ensureTopic(i.topic) : null);
    var assistant = /^assistant call:/i.test(i.proposal), text = i.proposal.replace(/^assistant call:\s*/i, '');
    var base = { text: text, words: i.words, said: i.said, chat: i.chat, base: i.base };
    if (i.kind === 'waiting') S.waiting.push(newItem({ text: text, topic: t ? t.id : '', said: i.said, base: i.base }));
    else if (i.kind === 'asset') S.vault.push(newItem({ title: text, file: /\.[a-z0-9]{2,5}$/i.test(i.base) ? i.base : '', base: i.base, topic: t ? t.id : '', said: i.said, status: 'unreviewed' }));
    else if (i.kind === 'correction' && !t) S.log.push(newItem({ type: assistant ? 'call' : 'ledger', text: text, fix: '', said: i.said, status: 'open' }));
    else if (i.kind === 'correction') { // a correction updates the record and is logged
      S.log.push(newItem({ type: 'ledger', text: (i.words || text), fix: text, said: i.said, status: 'done' }));
      var co = newItem(base); t.start.push(co); touch(t); if (t.status === 'not started') t.status = 'partly';
      var old = t.start.filter(function (x) { return x !== co && !x.superseded && !x.archived && !x.locked; });
      i.status = 'applied'; touch(i); save();
      if (old.length && !ui.bulk) { askSupersede(t, co, old); return 'asked'; }
      return true;
    }
    else {
      if (!t) { toast('Pick a topic first'); return false; }
      var list = KIND_TO[i.kind] || 'start', o = newItem(base);
      if (list === 'progress') { applyStep(t, i, o); i.status = 'applied'; touch(i); return true; }
      if (list === 'decisions') o.who = assistant ? 'assistant' : 'me';
      if (list === 'conflicts') { o.status = 'open'; }
      t[list].push(o); touch(t);
      if (t.status === 'not started') t.status = 'partly';
      if (assistant && list === 'decisions') S.log.push(newItem({ type: 'call', text: text, fix: '', said: i.said, status: 'open' }));
      if (list === 'start') {
        var older = t.start.filter(function (x) { return x !== o && !x.superseded && !x.archived && !x.locked; });
        if (older.length && !ui.bulk) { i.status = 'applied'; touch(i); save(); askSupersede(t, o, older); return 'asked'; }
      }
    }
    i.status = 'applied'; touch(i); return true;
  }
  // a done step ticks off the matching next step instead of adding a second line
  function stepKey(x) { return String(x || '').toLowerCase().replace(/^(done|next|finished|completed)\s*[:\-]\s*/, '').replace(/[^a-z0-9 ]/g, '').replace(/\s+/g, ' ').trim(); }
  function applyStep(t, i, o) {
    var k = stepKey(o.text), open = (t.progress || []).filter(function (x) { return !x.archived && x.status !== 'done' && stepKey(x.text) === k; })[0];
    if (i.kind === 'done' && open) { open.status = 'done'; open.doneOn = i.said || C.today(); touch(open); }
    else if (!(t.progress || []).some(function (x) { return !x.archived && stepKey(x.text) === k && x.status === (i.kind === 'done' ? 'done' : 'next'); })) {
      o.status = i.kind === 'done' ? 'done' : 'next'; if (o.status === 'done') o.doneOn = i.said || C.today(); t.progress.push(o);
    }
    touch(t); if (t.status === 'not started') t.status = 'partly';
  }
  function applyAll(list) {
    ui.bulk = true; var n = 0;
    list.forEach(function (i) { if (i.status !== 'proposed' && i.status !== 'held') return; if (applyInbox(i, '') === true) n++; });
    ui.bulk = false; save(); return n;
  }
  function askSupersede(t, o, older) {
    modal('<h2>Does this replace anything?</h2><p class="dim">New line: ' + esc(o.text) + '</p><p class="small dim">Tick any older Start here line it replaces. They stay in the record, crossed out. Newest dated statement wins.</p>' + older.map(function (x) { return '<label class="check"><input type="checkbox" value="' + esc(x.id) + '" class="sup-pick"><span>' + esc(x.text) + ' <span class="faint">· ' + esc(x.said) + '</span></span></label>'; }).join('') + '<div class="row" style="justify-content:flex-end;margin-top:12px"><button class="btn ghost" data-act="close">Nothing</button><button class="btn primary" data-act="form-save">Mark superseded</button></div>');
    pending = function () { [].forEach.call(document.querySelectorAll('.sup-pick:checked'), function (c) { var h = findLine(t, c.value); if (h) { h.x.superseded = true; h.x.supersededBy = o.id; touch(h.x); } }); touch(t); return true; };
  }

  function exampleData() {
    var d = C.today();
    var g = C.emptyTopic('Garden'); g.status = 'partly';
    g.start.push(newItem({ text: 'Two raised beds on the south side, cedar, 4 by 8 feet.', said: d, chat: 'Garden planning chat' }));
    g.start.push(newItem({ text: 'One raised bed by the fence.', said: '10/02/2026', chat: 'First garden chat', superseded: true }));
    g.decisions.push(newItem({ text: 'Tomatoes and basil go in bed one.', words: 'tomatoes and basil, bed one, done', who: 'me', said: d }));
    g.decisions.push(newItem({ text: 'Drip line over soaker hose.', who: 'assistant', said: d }));
    g.questions.push(newItem({ text: 'Do the beds need a liner against gophers?', said: d, status: 'open' }));
    g.ideas.push(newItem({ text: 'A small herb spiral by the back door.', said: d }));
    var tr = C.emptyTopic('Trip to Lisbon');
    tr.start.push(newItem({ text: 'Five nights in April, staying in Alfama.', said: d }));
    tr.conflicts.push(newItem({ text: 'Day trip to Sintra on day 2.', other: 'Day trip to Sintra on day 4.', said: d, status: 'open' }));
    var w = C.emptyTopic('Work');
    w.start.push(newItem({ text: 'Weekly team sync moved to Tuesdays.', said: d }));
    S.topics.push(g, tr, w);
    S.waiting.push(newItem({ text: 'Order cedar boards for the beds.', topic: g.id, said: d, base: 'https://example.com/lumber' }));
    S.vault.push(newItem({ title: 'Garden layout sketch', file: 'garden-layout.png', base: 'https://example.com/garden-layout', topic: g.id, said: d, status: 'unreviewed' }));
    S.log.push(newItem({ type: 'ledger', text: 'The chat kept planning three beds after I said two.', fix: 'Start here now says two beds; the old line is marked superseded.', said: d, status: 'done' }));
    S.inbox.push(newItem({ topic: 'Garden', kind: 'idea', said: d, chat: 'Garden planning chat', words: '', proposal: 'Plant marigolds along the edges to keep pests off.', base: '', status: 'proposed' }));
    S.inbox.push(newItem({ topic: 'Trip to Lisbon', kind: 'decision', said: d, chat: 'Trip chat', words: 'lets do the tram at sunrise', proposal: 'Ride the 28 tram at sunrise on day 1.', base: '', status: 'proposed' }));
  }

  // ---------- GitHub sync ----------
  // ---------- device sync (encrypted pairing) ----------
  // One 32-byte secret, shown as a code. HKDF derives the vault id, the AES-GCM key and the access token.
  // The server only stores ciphertext and the token's hash.
  var PAIR_KEY = 'polaris.pair', enc = new TextEncoder(), dec = new TextDecoder();
  function b64u(buf) { var s = '', a = new Uint8Array(buf); for (var i = 0; i < a.length; i++) s += String.fromCharCode(a[i]); return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''); }
  function unb64u(s) { s = s.replace(/-/g, '+').replace(/_/g, '/'); while (s.length % 4) s += '='; var b = atob(s), a = new Uint8Array(b.length); for (var i = 0; i < b.length; i++) a[i] = b.charCodeAt(i); return a; }
  function hex(buf) { return Array.prototype.map.call(new Uint8Array(buf), function (x) { return ('0' + x.toString(16)).slice(-2); }).join(''); }
  function pairStore(v) { try { if (v === undefined) return localStorage.getItem(PAIR_KEY) || ''; if (v) localStorage.setItem(PAIR_KEY, v); else localStorage.removeItem(PAIR_KEY); } catch (e) { return ''; } }
  function cryptoOk() { return !!(window.crypto && crypto.subtle && window.isSecureContext); }
  function makeCode(secret) {
    return crypto.subtle.digest('SHA-256', secret).then(function (h) { return 'polaris1-' + b64u(secret) + '-' + hex(h).slice(0, 4); });
  }
  function readCode(code) {
    var m = String(code || '').replace(/\s+/g, '').match(/polaris1-([A-Za-z0-9_-]{43})-([a-f0-9]{4})/);
    if (!m) return Promise.reject(new Error('That does not look like a polaris code. Copy the whole code, starting with polaris1-'));
    var secret = unb64u(m[1]);
    return crypto.subtle.digest('SHA-256', secret).then(function (h) { if (hex(h).slice(0, 4) !== m[2]) throw new Error('That code is cut off or mistyped. Copy it again, all of it.'); return secret; });
  }
  function derive(secret) {
    return crypto.subtle.importKey('raw', secret, 'HKDF', false, ['deriveBits', 'deriveKey']).then(function (base) {
      var p = function (info) { return { name: 'HKDF', hash: 'SHA-256', salt: enc.encode('polaris-sync-v1'), info: enc.encode(info) }; };
      return Promise.all([
        crypto.subtle.deriveBits(p('id'), base, 128),
        crypto.subtle.deriveBits(p('token'), base, 256),
        crypto.subtle.deriveKey(p('key'), base, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt'])
      ]).then(function (r) { return { id: hex(r[0]), token: b64u(r[1]), key: r[2] }; });
    });
  }
  function seal(v, rev, obj) {
    var iv = crypto.getRandomValues(new Uint8Array(12));
    return crypto.subtle.encrypt({ name: 'AES-GCM', iv: iv, additionalData: enc.encode('pv1:' + v.id + ':' + rev) }, v.key, enc.encode(JSON.stringify(obj)))
      .then(function (ct) { return { iv: b64u(iv), ct: b64u(ct) }; });
  }
  function unseal(v, rev, box) {
    return crypto.subtle.decrypt({ name: 'AES-GCM', iv: unb64u(box.iv), additionalData: enc.encode('pv1:' + v.id + ':' + rev) }, v.key, unb64u(box.ct))
      .then(function (pt) { return JSON.parse(dec.decode(pt)); }, function () { throw new Error('Could not unlock the synced copy. Check the code.'); });
  }
  function api(v, method, qs, body) {
    return fetch('/api/vault?id=' + v.id + (qs || ''), { method: method, cache: 'no-store', headers: Object.assign({ Authorization: 'Bearer ' + v.token }, body ? { 'Content-Type': 'application/json' } : {}), body: body ? JSON.stringify(body) : undefined })
      .then(function (r) { return r.json().catch(function () { return {}; }).then(function (j) { j.status = r.status; return j; }); });
  }
  var vaultP = null;
  function vault() { var c = pairStore(); if (!c) return Promise.resolve(null); if (!vaultP) vaultP = readCode(c).then(derive); return vaultP; }
  function snapshot() { try { localStorage.setItem('polaris.snapshot', JSON.stringify({ at: C.now(), state: S })); } catch (e) {} }
  // pull, merge, push; on a stale write, go round again
  function pairSync(quiet, tries) {
    tries = tries || 0;
    if (syncing && !tries) return Promise.resolve();
    syncing = true;
    var done = function () { syncing = false; };
    return vault().then(function (v) {
      if (!v) { done(); return; }
      var P = S.settings.pair || (S.settings.pair = {});
      return api(v, 'GET', '&since=' + (P.rev || '')).then(function (g) {
        if (g.status === 404) {
          if (P.synced) return seal(v, 1, S).then(function (box) { return api(v, 'POST', '', box); }).then(function (r) { if (r.status === 201) { P.rev = 1; P.at = C.now(); S.meta.dirty = false; Store.save(S); } });
          throw new Error('No synced copy yet. Open polaris on your other device first, so it can finish turning sync on.');
        }
        if (g.status === 401) throw new Error('That code does not match. Copy it again from your other device.');
        if (g.status !== 200) throw new Error('Sync is not reachable right now. Your changes are saved here and will sync later.');
        var step = g.unchanged ? Promise.resolve(false) : unseal(v, g.rev, g).then(function (theirs) {
          if (C.validate(theirs).length) throw new Error('The synced copy is not a polaris file.');
          var m = C.merge(S, theirs, P.synced ? (P.at || '') : ''); S = m.state; S.settings.pair = P; return m.clashes;
        });
        return step.then(function (clashes) {
          var pulled = !g.unchanged, remoteRev = g.rev;
          var mustPush = S.meta.dirty || pulled;
          var finish = function (rev) { P.rev = rev; P.at = C.now(); P.synced = true; S.meta.dirty = false; S.meta.lastSync = P.at; Store.save(S); render(); if (clashes) toast('Synced. ' + clashes + ' clash' + (clashes > 1 ? 'es' : '') + ' held in your Inbox.', 4000); else if (!quiet) toast('Synced'); };
          if (!mustPush) { P.rev = remoteRev; P.at = C.now(); return; }
          return seal(v, remoteRev + 1, S).then(function (box) { box.expectedRev = remoteRev; return api(v, 'PUT', '', box); }).then(function (r) {
            if (r.status === 200) return finish(r.rev);
            if (r.status === 409 && tries < 3) { syncing = false; return pairSync(quiet, tries + 1); }
            throw new Error('Could not sync just now. Your changes are saved here and will sync later.');
          });
        });
      });
    }).catch(function (e) { if (!quiet) toast(e.message, 5000); throw e; }).then(done, function (e) { done(); if (!quiet) return; });
  }
  function pairStart() {
    if (!cryptoOk()) return toast('This browser cannot do encrypted sync. Open polaris from its icon or in Safari or Chrome.', 5000);
    var secret = crypto.getRandomValues(new Uint8Array(32));
    return makeCode(secret).then(function (code) {
      return derive(secret).then(function (v) {
        return seal(v, 1, S).then(function (box) { return api(v, 'POST', '', box); }).then(function (r) {
          if (r.status !== 201) throw new Error(r.status === 503 ? 'Sync is not reachable right now. Try again in a minute.' : 'Could not turn on sync. Try again.');
          pairStore(code); vaultP = Promise.resolve(v);
          S.settings.dataMode = 'pair'; S.settings.pair = { rev: 1, at: C.now(), synced: true }; S.meta.dirty = false; Store.save(S);
          ui.pairShow = true; render(); toast('Sync is on. Now share your code to your other device.', 4000);
        });
      });
    }).catch(function (e) { toast(e.message, 5000); });
  }
  function pairJoin(code) {
    if (!cryptoOk()) return toast('This browser cannot do encrypted sync. Open polaris from its icon or in Safari or Chrome.', 5000);
    return readCode(code).then(function (secret) {
      return derive(secret).then(function (v) {
        return api(v, 'GET', '').then(function (g) {
          if (g.status === 404) throw new Error('No synced copy for this code yet. On your other device, tap Start first.');
          if (g.status === 401) throw new Error('That code does not match. Copy it again from your other device.');
          if (g.status !== 200) throw new Error('Sync is not reachable right now. Try again in a minute.');
          return unseal(v, g.rev, g).then(function () {
            snapshot();
            pairStore(String(code).replace(/\s+/g, '').match(/polaris1-[A-Za-z0-9_-]{43}-[a-f0-9]{4}/)[0]); vaultP = Promise.resolve(v);
            S.settings.dataMode = 'pair'; S.settings.pair = { rev: 0, at: '', synced: false }; S.meta.dirty = true;
            return pairSync(false);
          });
        });
      });
    }).then(function () { ui.pairJoin = false; render(); }).catch(function (e) { toast(e.message, 6000); });
  }
  function pairOff() { pairStore(null); vaultP = null; S.settings.dataMode = 'device'; S.settings.pair = null; Store.save(S); render(); toast('Sync is off on this device. Everything stays here.'); }
  function gh(path, opts) {
    var tok = Store.token(); if (!tok) return Promise.reject(new Error('No token saved on this device.'));
    opts = opts || {}; opts.headers = Object.assign({ Authorization: 'Bearer ' + tok, Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28' }, opts.headers || {});
    return fetch('https://api.github.com' + path, opts).then(function (r) {
      if (r.status === 404 && opts.method !== 'PUT') return null;
      if (!r.ok) return r.json().catch(function () { return {}; }).then(function (j) { var e = new Error((j && j.message) || ('GitHub said ' + r.status)); e.status = r.status; throw e; });
      return r.json();
    });
  }
  var syncing = false;
  function sync(quiet) {
    if (S.settings.dataMode === 'pair') { pairSync(quiet).catch(function () {}); return; }
    if (syncing) return; var g = S.settings.gh;
    if (!g.owner || !g.repo) { if (!quiet) toast('Add owner and repo first'); return; }
    if (quiet && !navigator.onLine) return;
    syncing = true; if (!quiet) toast('Syncing…');
    var path = '/repos/' + encodeURIComponent(g.owner) + '/' + encodeURIComponent(g.repo) + '/contents/' + g.path.split('/').map(encodeURIComponent).join('/');
    var ref = '?ref=' + encodeURIComponent(g.branch || 'main'), merged = 0;
    function push(sha) {
      var body = { message: 'polaris sync ' + C.today() + ' ' + new Date().toTimeString().slice(0, 5), content: C.b64(JSON.stringify(S, null, 1)), branch: g.branch || 'main' };
      if (sha) body.sha = sha;
      return gh(path, { method: 'PUT', body: JSON.stringify(body), headers: { 'Content-Type': 'application/json' } });
    }
    gh(path + ref).then(function (remote) {
      var sha = remote ? remote.sha : null;
      if (remote && sha !== S.meta.lastSyncSha) {
        var theirs; try { theirs = JSON.parse(C.unb64(remote.content)); } catch (e) { throw new Error('The file in your repo is not a polaris file.'); }
        var errs = C.validate(theirs); if (errs.length) throw new Error(errs[0]);
        var m = C.merge(S, theirs, S.meta.lastSync); S = m.state; merged = m.clashes;
      }
      return push(sha);
    }).then(function (res) {
      S.meta.lastSync = C.now(); S.meta.lastSyncSha = res && res.content ? res.content.sha : ''; S.meta.lastBackup = C.now(); Store.save(S); render();
      if (!quiet || merged) toast(merged ? 'Synced. ' + merged + ' clash' + (merged > 1 ? 'es' : '') + ' held in your Inbox.' : 'Synced', 3500);
    }).catch(function (e) {
      if (quiet && e.status === 409) return;
      toast(e.status === 409 ? 'Changed on another device mid-sync. Try again.' : e.status === 401 ? 'GitHub did not accept the token.' : e.status === 403 ? 'The token cannot write to this repo.' : 'Sync failed: ' + e.message, 4500);
    }).then(function () { syncing = false; });
  }

  // ---------- events ----------
  var ACT = {
    close: function () { closeModal(); pending = null; },
    'confirm-yes': function () { var p = pending; closeModal(); pending = null; if (p) p(); },
    'form-save': function () { if (pending && pending() !== false) { closeModal(); pending = null; save(); render(); } },
    'load-example': function () {
      if (S.topics.length) confirmBox('Add example topics?', 'This adds three made-up topics (Garden, Trip to Lisbon, Work) next to yours. You can archive them later.', 'Add them', function () { exampleData(); save(); go('home'); });
      else { exampleData(); S.settings.setupDone = true; if (!S.settings.setupAt) S.settings.setupAt = C.now(); save(); go('home'); toast('Example loaded. Look around.'); }
    },
    'copy-handoff': function () { copy(handoffPrompt()); },
    'copy-harvest': function () { copy(harvestPrompt()); },
    'quick-save': function () {
      function done(txt) {
        var r = C.parseHandoff(txt || '', { chat: 'Claude' });
        if (!r.items.length) { ui.capture = { text: txt || '', chat: '', result: null }; toast('No POLARIS box on your clipboard. Copy Claude\'s whole reply, then tap again.', 5000); go('capture'); return; }
        r.items.forEach(function (i) { S.inbox.push(i); }); var n = applyAll(r.items), left = r.items.length - n;
        toast('Saved ' + n + ' item' + (n === 1 ? '' : 's') + (left ? '. ' + left + ' need a topic in the Inbox.' : ''), 4000); render();
      }
      if (navigator.clipboard && navigator.clipboard.readText && window.isSecureContext) navigator.clipboard.readText().then(done, function () { go('capture'); toast('Paste the reply here'); });
      else { go('capture'); toast('Paste the reply here'); }
    },
    'move-copy': function () { copy('POLARIS STATE v1\n' + JSON.stringify(S)); },
    'move-paste': function () {
      function take(txt) {
        txt = String(txt || '').replace(/^\s*POLARIS STATE v1\s*/, '');
        var j; try { j = JSON.parse(txt); } catch (e) { toast('Nothing to bring over. On the other device, tap Copy my polaris first.', 5000); return; }
        var errs = C.validate(j); if (errs.length) { toast(errs[0], 5000); return; }
        var m = C.merge(S, j, ''); S = m.state; save(); render(); toast('Brought over and merged' + (m.clashes ? '. ' + m.clashes + ' clashes held in Inbox.' : ''), 4000);
      }
      if (navigator.clipboard && navigator.clipboard.readText && window.isSecureContext) navigator.clipboard.readText().then(take, function () { toast('Allow paste, then tap again'); });
      else toast('Paste is blocked in this browser. Use Export backup and Import backup instead.', 5000);
    },
    'seen-update': function () { S.settings.seenUpdate = 2; save(); render(); },
    'pair-start': function () { if (S.settings.dataMode === 'github' && Store.token()) { sync(true); } pairStart(); },
    'pair-join-open': function () { ui.pairJoin = true; render(); var t = document.getElementById('pair-in'); if (t) t.focus(); },
    'pair-cancel': function () { ui.pairJoin = false; render(); },
    'pair-join': function () { pairJoin(document.getElementById('pair-in').value); },
    'pair-now': function () { pairSync(false).catch(function () {}); },
    'pair-show': function () { ui.pairShow = !ui.pairShow; render(); },
    'pair-copy': function () { copy(pairStore()); },
    'pair-share': function () { var c = pairStore(); if (navigator.share) navigator.share({ title: 'polaris sync code', text: c }).catch(function () {}); else copy(c); },
    'pair-off': function () { confirmBox('Turn off sync on this device?', 'Everything stays on this device. Your other devices keep syncing with each other.', 'Turn off', pairOff); },
    'harvest-hide': function () { S.settings.harvestHidden = true; save(); render(); },
    'copy-catchup': function () { copy(catchupPrompt()); },
    'copy-front': function (v) { copy(frontDoor(v)); },
    'add-topic': function () { modal('<h2>New topic</h2><label for="nt">Name</label><input type="text" id="nt" placeholder="Kitchen remodel"><div class="row" style="justify-content:flex-end;margin-top:12px"><button class="btn ghost" data-act="close">Cancel</button><button class="btn primary" data-act="form-save">Add</button></div>'); pending = function () { var n = document.getElementById('nt').value.trim(); if (!n) return false; if (topicByName(n)) { toast('You already have that topic'); return false; } S.topics.push(C.emptyTopic(n)); return true; }; },
    'topic-rename': function () { var t = topicById(route.arg); if (t.locked) return toast('This topic is locked'); modal('<h2>Rename topic</h2><input type="text" id="nt" value="' + esc(t.name) + '"><div class="row" style="justify-content:flex-end;margin-top:12px"><button class="btn ghost" data-act="close">Cancel</button><button class="btn primary" data-act="form-save">Save</button></div>'); pending = function () { var n = document.getElementById('nt').value.trim(); if (!n) return false; t.name = n; touch(t); return true; }; },
    'topic-md': function () { copy(C.topicMarkdown(topicById(route.arg))); },
    tab: function (v) { ui.topicTab = v; ui.tabPicked = true; render(); },
    'step-toggle': function (v) { var t = topicById(route.arg), h = findLine(t, v); if (!h) return; h.x.status = h.x.status === 'done' ? 'next' : 'done'; if (h.x.status === 'done') h.x.doneOn = C.today(); touch(h.x); touch(t); save(); render(); },
    'apply-all': function () { var n = applyAll(S.inbox.filter(function (i) { return i.status === ui.inboxFilter; })); render(); toast(n + ' applied'); },
    'add-line': function (v) { var t = topicById(route.arg); form('Add to ' + t.name, v, v === 'questions' ? { status: 'open' } : null, function (o) { var x = newItem(o); if (v === 'questions') x.status = 'open'; if (v === 'conflicts') x.status = 'open'; if (v === 'decisions' && x.who === 'assistant') S.log.push(newItem({ type: 'call', text: x.text, fix: '', said: x.said, status: 'open' })); t[v].push(x); touch(t); if (t.status === 'not started') t.status = 'partly'; }); },
    'edit-line': function (v) { var t = topicById(route.arg), h = findLine(t, v); if (!h || h.x.locked) return; form('Edit', h.list, h.x, function (o) { Object.assign(h.x, o); touch(h.x); touch(t); }); },
    supersede: function (v) { var t = topicById(route.arg), h = findLine(t, v); h.x.superseded = true; touch(h.x); touch(t); save(); render(); toast('Marked superseded. It stays in the record.'); },
    'lock-line': function (v) { var t = topicById(route.arg), h = findLine(t, v); h.x.locked = !h.x.locked; touch(h.x); save(); render(); },
    'archive-line': function (v) { var t = topicById(route.arg), h = findLine(t, v); confirmBox('Archive this line?', 'It leaves the record view but stays in your data and exports. Nothing is deleted.', 'Archive', function () { h.x.archived = true; touch(h.x); touch(t); save(); render(); }); },
    answer: function (v) { var t = topicById(route.arg), h = findLine(t, v); modal('<h2>Answer</h2><p class="dim">' + esc(h.x.text) + '</p><textarea id="ans"></textarea><div class="row" style="justify-content:flex-end;margin-top:12px"><button class="btn ghost" data-act="close">Cancel</button><button class="btn primary" data-act="form-save">Save</button></div>'); pending = function () { var a = document.getElementById('ans').value.trim(); if (!a) return false; h.x.answer = a; h.x.status = 'answered'; h.x.answered = C.today(); touch(h.x); return true; }; },
    settle: function (v) { var t = topicById(route.arg), h = findLine(t, v); modal('<h2>Settle conflict</h2><p class="small dim">Pick which version stands. The record keeps both.</p><label class="check"><input type="radio" name="sv" value="first" checked><span>' + esc(h.x.text) + '</span></label><label class="check"><input type="radio" name="sv" value="other"><span>' + esc(h.x.other || '(the other version)') + '</span></label><label class="check"><input type="radio" name="sv" value="superseded"><span>Superseded: both are out of date</span></label><div class="row" style="justify-content:flex-end;margin-top:12px"><button class="btn ghost" data-act="close">Cancel</button><button class="btn primary" data-act="form-save">Settle</button></div>'); pending = function () { var c = document.querySelector('input[name=sv]:checked').value; h.x.status = 'settled'; h.x.resolution = c; h.x.answer = c === 'first' ? 'Stands: ' + h.x.text : c === 'other' ? 'Stands: ' + h.x.other : 'Both superseded'; touch(h.x); return true; }; },
    'topic-status': null,
    parse: function () { var t = document.getElementById('cap-text').value, ch = document.getElementById('cap-chat').value.trim(); ui.capture = { text: t, chat: ch, result: C.parseHandoff(t, { chat: ch }) }; render(); },
    'cap-add': function () { var r = ui.capture.result; r.items.forEach(function (i) { S.inbox.push(i); }); save(); ui.capture = null; ui.inboxFilter = 'proposed'; toast(r.items.length + ' added to your Inbox'); go('inbox'); },
    'inbox-manual': function () { form('New Inbox item', 'inbox', { kind: 'fact' }, function (o) { S.inbox.push(newItem(Object.assign(o, { status: 'proposed' }))); }); },
    'inbox-filter': function (v) { ui.inboxFilter = v; render(); },
    apply: function (v) { var i = S.inbox.filter(function (x) { return x.id === v; })[0], sel = document.querySelector('select[data-v="' + v + '"]'); var r = applyInbox(i, sel ? sel.value : ''); if (r === true) { save(); render(); toast('Applied'); } else if (r === 'asked') { shell(); } },
    hold: function (v) { var i = S.inbox.filter(function (x) { return x.id === v; })[0]; i.status = 'held'; touch(i); save(); render(); },
    reject: function (v) { var i = S.inbox.filter(function (x) { return x.id === v; })[0]; i.status = 'rejected'; touch(i); save(); render(); toast('Rejected. Kept under Rejected.'); },
    'add-wait': function () { form('Waiting on you', 'waiting', null, function (o) { S.waiting.push(newItem(o)); }); },
    'archive-wait': function (v) { var w = S.waiting.filter(function (x) { return x.id === v; })[0]; confirmBox('Archive this card?', 'It is kept in your data and exports.', 'Archive', function () { w.archived = true; touch(w); save(); render(); }); },
    'add-asset': function () { form('Add to the Vault', 'vault', null, function (o) { o.status = 'unreviewed'; S.vault.push(newItem(o)); }); },
    'asset-status': function (v) { var a = S.vault.filter(function (x) { return x.id === v; })[0]; a.status = a.status === 'approved' ? 'unreviewed' : 'approved'; touch(a); save(); render(); },
    'archive-asset': function (v) { var a = S.vault.filter(function (x) { return x.id === v; })[0]; confirmBox('Archive this entry?', 'It is kept in your data and exports.', 'Archive', function () { a.archived = true; touch(a); save(); render(); }); },
    'vault-filter': function (v) { ui.vaultFilter = v; render(); },
    'add-log': function () { form('Add to the Log', 'log', null, function (o) { o.status = 'open'; S.log.push(newItem(o)); }); },
    'log-done': function (v) { var l = S.log.filter(function (x) { return x.id === v; })[0]; l.status = l.status === 'done' ? 'open' : 'done'; touch(l); save(); render(); },
    'log-filter': function (v) { ui.logFilter = v; render(); },
    'review-done': function () { S.reviews.push({ id: C.uid(), at: C.now(), note: document.getElementById('rv-note').value.trim(), updated: C.now() }); save(); toast('Review logged'); go('home'); },
    'copy-jump': function () { copy(jumpGeneral() ? generalPrompt() : jumpstartPrompt()); },
    'js-where': function (v) { var el = document.getElementById('js-text'); if (el) ui.jsText = el.value; ui.jsWhere = v; render(); },
    'js-save': function () {
      var txt = document.getElementById('js-text').value, r = C.parseHandoff(txt, { chat: 'jumpstart', topic: jumpTopic() });
      if (!r.items.length) { ui.jsText = txt; toast('No POLARIS block found. Copy the whole reply, including the line POLARIS v1.', 5000); return; }
      r.items.forEach(function (i) { if (!i.topic) i.topic = jumpTopic() || 'General'; S.inbox.push(i); });
      applyAll(r.items); S.settings.setupDone = true; if (!S.settings.setupAt) S.settings.setupAt = C.now(); ui.jsText = ''; save(); ui.setupStep = 2; render(); window.scrollTo(0, 0);
    },
    'setup-later': function () { ui.setupStep = 0; go('home'); },
    'setup-finish': function (v, el) { S.settings.setupDone = true; if (!S.settings.setupAt) S.settings.setupAt = C.now(); ui.setupStep = 0; save(); go(el.getAttribute('href').slice(1)); },
    'setup-back': function () { ui.setupStep = Math.max(0, (ui.setupStep || 0) - 1); render(); },
    'setup-next': function () {
      var s = ui.setupStep || 0;
      if (s === 0) { var ne = document.getElementById('su-name'); if (ne) S.profile.name = ne.value.trim().slice(0, 40); if (jumpTopic() || jumpGeneral()) { if (jumpTopic()) ensureTopic(jumpTopic()); save(); ui.setupStep = 1; render(); window.scrollTo(0, 0); return; } }
      if (s === 1) { [].forEach.call(document.querySelectorAll('input[name=tpl]:checked:not(:disabled)'), function (c) { ensureTopic(c.value); }); document.getElementById('su-custom').value.split('\n').map(function (x) { return x.trim(); }).filter(Boolean).forEach(ensureTopic); if (!S.topics.length) { toast('Pick at least one topic'); return; } }
      if (s === 2) { S.settings.dataMode = (document.querySelector('input[name=dm]:checked') || {}).value || 'device'; }
      if (s === 3) { [].forEach.call(document.querySelectorAll('[data-rule]'), function (c) { S.settings.rules.forEach(function (r) { if (r.id === c.getAttribute('data-rule')) r.on = c.checked; }); }); }
      save();
      if (s >= 4) { S.settings.setupDone = true; if (!S.settings.setupAt) S.settings.setupAt = C.now(); save(); ui.setupStep = 0; go(S.settings.dataMode === 'github' && !Store.token() ? 'settings' : 'home'); toast(S.settings.dataMode === 'github' ? 'Add your repo and token to finish' : 'You are set'); return; }
      ui.setupStep = s + 1; render(); window.scrollTo(0, 0);
    },
    mode: function (v) { S.settings.dataMode = v; save(); render(); },
    'gh-save-sync': function () {
      var g = S.settings.gh; g.owner = document.getElementById('gh-owner').value.trim(); g.repo = document.getElementById('gh-repo').value.trim(); g.branch = document.getElementById('gh-branch').value.trim() || 'main'; g.path = document.getElementById('gh-path').value.trim() || 'polaris.json';
      var t = document.getElementById('gh-token').value.trim(); if (t) Store.token(t); save(); sync();
    },
    'gh-forget': function () { confirmBox('Forget the token?', 'It is removed from this device. Your repo and your record are untouched.', 'Forget it', function () { Store.token(null); render(); toast('Token removed from this device'); }); },
    'export-json': function () { S.meta.lastBackup = C.now(); save(); download('polaris-backup-' + new Date().toISOString().slice(0, 10) + '.json', [JSON.stringify(S, null, 2)], 'application/json'); },
    'export-md': function () { S.meta.lastBackup = C.now(); save(); download('polaris-' + new Date().toISOString().slice(0, 10) + '.zip', C.zip(C.bundle(S)), 'application/zip'); },
    'save-name': function () { S.profile.name = document.getElementById('st-name').value.trim().slice(0, 40); save(); render(); toast('Saved'); },
    rule: function (v, el) { S.settings.rules.forEach(function (r) { if (r.id === v) r.on = el.checked; }); save(); },
    'art-clear': function () { S.settings.planetArt = ''; S.settings.residentArt = ''; save(); render(); },
    reset: function () { confirmBox('Erase everything on this device?', 'This removes your whole polaris from this browser, including the GitHub token. Export a backup first if you might want it. Your GitHub repo is not touched.', 'Erase', function () { confirmBox('Last check', 'There is no undo.', 'Yes, erase it', function () { try { localStorage.removeItem(KEY); } catch (e) {} Store.token(null); S = C.emptyState(); save(); go('home'); }, true); }, true); }
  };
  function onClick(e) {
    var el = e.target.closest('[data-act]'); if (!el) { if (e.target.id === 'scrim') ACT.close(); return; }
    var a = el.getAttribute('data-act'); if (!ACT[a] || el.tagName === 'SELECT' || (el.tagName === 'INPUT' && el.type === 'checkbox')) return;
    e.preventDefault(); ACT[a](el.getAttribute('data-v'), el);
  }
  function onChange(e) {
    var el = e.target, a = el.getAttribute('data-act');
    if (a === 'topic-status') { var t = topicById(route.arg); t.status = el.value; touch(t); save(); toast('Status: ' + el.value); }
    if (a === 'toggle-wait') { var w = S.waiting.filter(function (x) { return x.id === el.getAttribute('data-v'); })[0]; w.done = el.checked; w.doneOn = el.checked ? C.today() : ''; touch(w); save(); render(); }
    if (a === 'rule') ACT.rule(el.getAttribute('data-v'), el);
    if (el.id === 'imp' && el.files[0]) readFile(el.files[0], 'text', function (txt) {
      var j; try { j = JSON.parse(txt); } catch (x) { return toast('That file is not JSON'); }
      var errs = C.validate(j); if (errs.length) return toast(errs[0]);
      var m = C.merge(S, j, ''); S = m.state; save(); render(); toast('Imported and merged' + (m.clashes ? '. ' + m.clashes + ' clashes held in Inbox.' : ''));
    });
    if ((el.id === 'art-planet' || el.id === 'art-res') && el.files[0]) {
      if (el.files[0].size > 1048576) return toast('Pick an image under 1 MB');
      readFile(el.files[0], 'url', function (u) { if (!/^data:image\//.test(u)) return toast('That is not an image'); S.settings[el.id === 'art-planet' ? 'planetArt' : 'residentArt'] = u; save(); render(); toast('Art saved on this device'); });
    }
  }
  function readFile(f, as, cb) { var r = new FileReader(); r.onload = function () { cb(r.result); }; if (as === 'url') r.readAsDataURL(f); else r.readAsText(f); }

  // ---------- router ----------
  function go(n) { if (location.hash === '#' + n) render(); else location.hash = n; }
  function parseRoute() { var h = (location.hash || '#home').slice(1).split('/'); route = { name: V[h[0]] ? h[0] : 'home', arg: decodeURIComponent(h[1] || '') }; }
  function render() {
    parseRoute(); if (route.name !== 'topic') ui.topicTab = ui.topicTab || 'start';
    $app.innerHTML = V[route.name]();
    document.body.classList.toggle('bare', route.name === 'setup' && !(ui.setupStep || 0));
    document.body.classList.toggle('focus', route.name === 'setup' && (ui.setupStep || 0) > 0);
    shell();
    document.title = (route.name === 'home' ? '' : route.name[0].toUpperCase() + route.name.slice(1) + ' · ') + 'polaris by Gugui';
  }
  var lastRoute = '';
  window.addEventListener('hashchange', function () { var r = location.hash; if (r.indexOf('#topic/') === 0 && lastRoute !== r) ui.topicTab = 'start'; ui.tabPicked = false; lastRoute = r; closeModal(); render(); window.scrollTo(0, 0); });
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape') ACT.close(); });

  // ---------- starfield ----------
  function stars() {
    var c = document.getElementById('stars'); if (!c || !c.getContext) return;
    var x = c.getContext('2d'), still = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches, pts = [], dpr = Math.min(2, window.devicePixelRatio || 1);
    function size() { c.width = innerWidth * dpr; c.height = innerHeight * dpr; pts = []; var n = Math.round(innerWidth * innerHeight / 5200); for (var i = 0; i < n; i++) pts.push([Math.random() * c.width, Math.random() * c.height, Math.random() * 1.2 + .2, Math.random() * 6.28, Math.random() * .8 + .2]); draw(0); }
    function draw(t) { x.clearRect(0, 0, c.width, c.height); pts.forEach(function (p) { var a = still ? p[4] : p[4] * (.55 + .45 * Math.sin(t / 1400 + p[3])); x.fillStyle = 'rgba(225,215,255,' + a.toFixed(3) + ')'; x.beginPath(); x.arc(p[0], p[1], p[2] * dpr, 0, 6.283); x.fill(); }); }
    size(); window.addEventListener('resize', size);
    if (!still) { var last = 0; (function loop(t) { if (t - last > 120 && !document.hidden) { draw(t); last = t; } requestAnimationFrame(loop); })(0); }
  }

  // ---------- service worker (only when served from a real site) ----------
  function sw() {
    if (!('serviceWorker' in navigator) || !/^https:|^http:\/\/localhost/.test(location.href) || window.Capacitor || window.self !== window.top) return;
    navigator.serviceWorker.register('sw.js').then(function (reg) {
      reg.addEventListener('updatefound', function () { var n = reg.installing; n && n.addEventListener('statechange', function () { if (n.state === 'installed' && navigator.serviceWorker.controller) { var d = document.createElement('div'); d.innerHTML = 'A new version is ready. <a href="#" id="upd">Reload</a>'; document.getElementById('toast').appendChild(d); document.getElementById('upd').onclick = function (e) { e.preventDefault(); n.postMessage('skip'); location.reload(); }; } }); });
    }).catch(function () {});
  }

  // ---------- boot ----------
  document.addEventListener('DOMContentLoaded', function () {
    $app = document.getElementById('app');
    S = Store.load();
    if (!S) { S = C.emptyState(); var P = window.POLARIS_PRESET || {}, m = (location.hash || '').match(/^#name-([A-Za-z\u00C0-\u024F' -]{1,30})$/); if (P.name) S.profile.name = P.name; else if (m) { S.profile.name = decodeURIComponent(m[1]); location.hash = 'setup'; } if (S.profile.name) Store.save(S); }
    if (!Store.ok) toast('This browser blocks storage. Your work will not be kept. Export often.', 6000);
    Store.persist();
    document.body.addEventListener('click', onClick);
    document.body.addEventListener('change', onChange);
    if (!S.settings.setupDone && !S.topics.length && (!location.hash || location.hash === '#home')) location.hash = 'setup';
    render(); stars(); sw();
    if (canAuto()) setTimeout(function () { sync(true); }, 800);
    document.addEventListener('visibilitychange', function () { if (!document.hidden && canAuto()) sync(true); });
    setInterval(function () { if (!document.hidden && canAuto()) sync(true); }, 30000);
    window.addEventListener('online', function () { if (canAuto()) sync(true); });
  });
  window.__polaris = { state: function () { return S; }, version: VERSION };
})();
