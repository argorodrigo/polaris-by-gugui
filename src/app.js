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
  function save() { Store.save(S); }

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
    var c = counts(), stale = daysSince(S.reviews.length ? S.reviews[S.reviews.length - 1].at : '') > (S.settings.reviewEvery || 7);
    var backupOld = daysSince(S.meta.lastBackup) > 14 && S.settings.dataMode !== 'github';
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
      '<section class="hero" aria-label="Your polaris"><div class="orb"><div class="back">' + ring(false) + '</div><div class="planet' + art + '"></div><div class="front">' + ring(true) + '</div>' +
      st.map(function (s) { var p = onRing(s[3]); return '<a class="station" href="#' + s[0] + '" style="left:' + p[0].toFixed(1) + '%;top:' + p[1].toFixed(1) + '%"><i></i>' + s[1] + (s[2] !== '' ? '<small>' + s[2] + '</small>' : '') + '</a>'; }).join('') +
      '</div>' + resEl('desk') + '</section>';
    if (!S.topics.length) h += '<div class="card"><h2>Start here</h2><p class="dim">Set up your homes and get the text that teaches your AI chats how to hand things back.</p><a class="btn primary" href="#setup">Set up polaris</a> <button class="btn" data-act="load-example">Load an example</button></div>';
    var nudges = [];
    if (c.inbox) nudges.push('<a href="#inbox">' + c.inbox + ' item' + (c.inbox > 1 ? 's' : '') + ' in your inbox</a> to sort');
    if (stale && S.topics.length) nudges.push('<a href="#review">Weekly review</a> is due');
    if (backupOld && S.topics.length) nudges.push('No backup in a while. <a href="#settings">Export one</a>');
    if (!Store.ok) nudges.push('This browser is not saving. <a href="#settings">Export now</a>');
    if (nudges.length) h += '<div class="card"><h3>Waiting on you</h3><ul class="list">' + nudges.map(function (n) { return '<li class="item"><span class="dot"></span><div class="body">' + n + '</div></li>'; }).join('') + '</ul></div>';
    h += '<div class="grid stats" style="margin-top:12px">' + [['topics', c.topics, 'topics'], ['inbox', c.inbox, 'to sort'], ['waiting', c.waiting, 'waiting on you'], ['topics', c.decisions, 'decisions'], ['topics', c.conflicts, 'open conflicts'], ['vault', c.vault, 'in the Vault']].map(function (x) { return '<a class="card stat" href="#' + x[0] + '"><b>' + x[1] + '</b><span>' + x[2] + '</span></a>'; }).join('') + '</div>';
    h += '<div class="card" style="margin-top:12px"><div class="row between"><div><h3>The loop</h3><p class="dim small" style="margin:0">End any AI chat with the handoff prompt, paste the reply into Capture, sort it in the Inbox.</p></div><div class="row"><button class="btn" data-act="copy-handoff">Copy handoff prompt</button><a class="btn primary" href="#capture">Capture</a></div></div></div>';
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
    var tab = ui.topicTab, list = live(t[tab]).slice();
    if (tab === 'start' || tab === 'decisions') list.sort(function (a, b) { return (a.superseded ? 1 : 0) - (b.superseded ? 1 : 0) || C.dateKey(b.said).localeCompare(C.dateKey(a.said)); });
    var h = top() + '<div class="wrap"><a href="#topics" class="small">← Topics</a><div class="row between" style="margin-top:6px"><h1>' + esc(t.name) + '</h1><div class="row">' +
      '<select data-act="topic-status" aria-label="Status">' + ['not started', 'partly', 'harvested'].map(function (s) { return '<option' + (t.status === s ? ' selected' : '') + '>' + s + '</option>'; }).join('') + '</select>' +
      '<button class="btn sm" data-act="topic-md">Copy record</button><button class="btn sm ghost" data-act="topic-rename">Rename</button></div></div>' +
      '<div class="seg" role="tablist" style="margin:8px 0 12px">' + TABS.map(function (x) { return '<button role="tab" data-act="tab" data-v="' + x[0] + '" class="' + (tab === x[0] ? 'on' : '') + '">' + x[1] + ' <span class="faint">' + live(t[x[0]]).length + '</span></button>'; }).join('') + '</div>';
    h += '<div class="card"><div class="row between"><h3 style="margin:0">' + TABS.filter(function (x) { return x[0] === tab; })[0][1] + '</h3><button class="btn sm primary" data-act="add-line" data-v="' + tab + '">Add</button></div>';
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
    if (tab === 'questions') tags += '<span class="tag ' + (x.status === 'answered' ? 'ok' : '') + '">' + esc(x.status || 'open') + '</span> ';
    if (tab === 'conflicts') tags += '<span class="tag ' + ((x.status || 'open') === 'open' ? 'bad' : 'ok') + '">' + esc(x.status || 'open') + '</span> ';
    var body = '<div class="' + (x.superseded ? 'sup' : '') + '">' + esc(x.text || x.title) + '</div>';
    if (x.words) body += '<div class="words">“' + esc(x.words) + '”</div>';
    if (tab === 'conflicts' && x.other) body += '<div class="small dim">vs. ' + esc(x.other) + '</div>';
    if (x.answer) body += '<div class="small">Answer: ' + esc(x.answer) + '</div>';
    var meta = 'said ' + esc(x.said || '?') + (x.chat ? ' · ' + esc(x.chat) : '') + (x.base || x.url ? ' · ' + linkOrText(x.base || x.url) : '');
    var acts = '';
    if (!x.locked) {
      if ((tab === 'start' || tab === 'decisions') && !x.superseded) acts += '<button class="btn sm ghost" data-act="supersede" data-v="' + esc(x.id) + '">Superseded</button>';
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

  var KIND_TO = { fact: 'start', decision: 'decisions', idea: 'ideas', question: 'questions', conflict: 'conflicts', source: 'sources' };
  V.inbox = function () {
    var f = ui.inboxFilter, items = S.inbox.filter(function (i) { return i.status === f; }).sort(function (a, b) { return (b.created || '').localeCompare(a.created || ''); });
    var n = function (s) { return S.inbox.filter(function (i) { return i.status === s; }).length; };
    var h = top() + '<div class="wrap"><div class="row between"><h1>Inbox</h1><a class="btn primary" href="#capture">Capture</a></div><p class="dim">Proposals from your chats. Apply one to file it in its topic. Rejected items are kept, never deleted.</p>' +
      '<div class="seg" style="margin-bottom:12px">' + ['proposed', 'held', 'applied', 'rejected'].map(function (s) { return '<button data-act="inbox-filter" data-v="' + s + '" class="' + (f === s ? 'on' : '') + '">' + s + ' <span class="faint">' + n(s) + '</span></button>'; }).join('') + '</div>';
    if (!items.length) return h + '<div class="card empty">Nothing ' + esc(f) + '.</div></div>';
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
      'kind is one of: fact, decision, idea, question, waiting, asset, source, correction, conflict.\n' +
      (names.length ? 'My topics: ' + names.join(', ') + '. Put a topic: line in a group when it belongs to a different topic than the first line.\n' : '') +
      'Rules: only things actually said or decided in this chat. said is the date it was said here. Quote me word for word in words, never reword me. If you made a call without asking me, start the proposal with "assistant call:". Leave a field blank rather than guess. No commentary outside the block.';
  }
  function topicLine() { var n = live(S.topics).map(function (t) { return t.name; }); return n.length ? 'My topics: ' + n.join(', ') + '.' : 'I have not set my topics yet: suggest four to six from what you find, then use them.'; }
  var BLOCK = '```\nPOLARIS v1\ntopic: <topic name>\n---\nkind: fact | decision | idea | question | waiting | asset | source | correction | conflict\nsaid: MM/DD/YYYY\nwords: my exact words, if I said it\nproposal: one plain sentence of what to record\nbase: a link, file name or chat name it came from\n---\nEND POLARIS\n```';
  function harvestPrompt() {
    return 'polaris harvest. I want to catch my polaris up on everything I already told you in past chats.\n\n' + topicLine() + '\n\n' +
      'Work one topic per reply. For each topic: search my past chats with several different keywords (names, places, projects, words I would use), open the chats that matter, and read them, not just their titles. Then give me one POLARIS block for that topic in this exact format, groups split by a line with ---:\n\n' + BLOCK + '\n\n' +
      'Rules: only what was actually said or decided in those chats. said is the date of the chat it came from. Quote me word for word in words, never reword me. When two chats disagree, the newest one wins: record the newest as a fact and add a conflict item naming both. Things you suggested that I never agreed to are ideas, not decisions; start those with "assistant call:" if you made the call. Leave a field blank rather than guess. After the block, list the chats you could not open and the topic you will do next, then wait for me to say next.';
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
      '## Saving every chat\nIn every chat with ' + name + ': whenever something is decided, learned, changed or left waiting, end that reply with a POLARIS block so ' + name + ' can paste it into polaris. Do it without being asked. When ' + name + ' says "polaris handoff", give one block for the whole chat. "polaris harvest" means go through past chats topic by topic; "polaris catch-up" means the last 7 days.\n\n```\nPOLARIS v1\ntopic: <one of the topics above>\n---\nkind: fact | decision | idea | question | waiting | asset | source | correction | conflict\nsaid: MM/DD/YYYY\nwords: their exact words, if they said it\nproposal: one plain sentence\nbase: link or file name\n---\nEND POLARIS\n```\n\nQuote them word for word. Mark your own calls "assistant call:". Never guess a date or a fact: leave it blank.\n';
    if (kind === 'chatgpt') return body.slice(0, 1500);
    return body;
  }

  V.setup = function () {
    var step = ui.setupStep || 0, total = 5;
    var h = top() + '<div class="wrap" style="max-width:640px"><div class="steps">' + Array.from({ length: total }, function (_, i) { return '<i class="' + (i <= step ? 'on' : '') + '"></i>'; }).join('') + '</div><div class="card">';
    if (step === 0) h += '<h1>Welcome to polaris</h1><p>polaris keeps everything your AI chats decide in one place, so a new chat never starts from zero and an old one never quietly overrides you.</p><ul class="dim"><li>One record per topic, with dates and sources</li><li>An Inbox where chats propose and you decide</li><li>A list of what is waiting on you</li></ul><label for="su-name">What should your chats call you?</label><input type="text" id="su-name" value="' + esc(S.profile.name) + '" placeholder="First name" autocomplete="given-name"><p class="faint small">Only used in the text you paste into your chats. It stays on your device.</p>';
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
  };

  V.guide = function () {
    var ch = [
      ['What polaris is', '<p>When you work with AI chats, the real decisions scatter: one chat knows the plan, another has the latest version, a third quietly contradicts both. polaris is the one place they all report back to.</p><ul><li><b>Topics</b>: one record per area, with a Start here block, decisions, ideas, open questions, conflicts and sources.</li><li><b>Inbox</b>: chats propose; you apply, hold or reject.</li><li><b>Waiting</b>: what only you can do.</li><li><b>Vault</b>: pointers to your files and where they live.</li><li><b>Log</b>: corrections you made and calls a chat made without asking.</li></ul>'],
      ['Set it up (5 minutes)', '<ol><li>Open <a href="#setup">Setup</a>. Pick three to six topics.</li><li>Choose where your data lives: this device, or your own GitHub repo.</li><li>Keep the rules you want.</li><li>Copy the start-here text into your Claude Project instructions and your ChatGPT custom instructions (or a ChatGPT Project).</li></ol><p>That is it. Your chats now know your topics, your rules and how to hand things back.</p>'],
      ['The daily loop', '<ol><li>Work in any chat as usual.</li><li>At the end, say <b>polaris handoff</b>, or paste the <a href="#capture">handoff prompt</a>.</li><li>Copy the whole reply and paste it into <a href="#capture">Capture</a>. polaris finds the POLARIS block and shows what it read.</li><li>Add it to the Inbox. Then apply each item: a fact goes to Start here, a decision to Decisions, a waiting item to Waiting, a file to the Vault.</li></ol><p class="dim">Tip: when a new fact replaces an old one, mark the old line superseded. It stays in the record, crossed out, so you can always see what changed and when.</p>'],
      ['Harvest: catching up on past chats', '<p><b>Harvest</b> means going back through the chats you already had and pulling out what matters, so polaris starts full instead of empty. You do it once, after setup. After that, every new chat saves itself as you go.</p><ol><li>Copy the <b>harvest prompt</b> from <a href="#capture">Capture</a> or Settings.</li><li>Paste it into a chat that can search your history: a Claude Project with your chats in it, or ChatGPT with chat history turned on.</li><li>It works one topic at a time and replies with a POLARIS block. Paste each reply into Capture, add it to the Inbox, then say <b>next</b> in the chat.</li><li>Sort the Inbox: apply what is right, reject what is not, hold what you are unsure of. Conflicts land in the topic so you decide which version stands.</li></ol><p class="dim">Big history? Do your most important topic first, then the rest over a few sittings. Once a week, the <b>weekly catch-up</b> prompt does the same for the last 7 days, in case a chat ended without a handoff.</p>'],
      ['How polaris was made', '<p>polaris started as one person\'s fix for a real problem: dozens of AI chats and projects, each holding part of the story, and new chats repeating old plans or quietly overriding decisions. This is how he went about it. You can do the same, at any size.</p><ol><li><b>One pilot first.</b> He picked one topic and did the whole process on it before touching the rest.</li><li><b>Inventory.</b> He listed every chat and project he had, then grouped them into a handful of homes. Fewer, bigger homes beat many small ones.</li><li><b>Harvest in parallel.</b> Several AI helpers read the old chats at once, one topic each. Every fact kept the date it was said and the chat it came from.</li><li><b>He rules, the AI proposes.</b> Where chats disagreed, nothing was picked silently. Conflicts went on a list and he decided each one. By default the newest dated statement wins, and older lines stay in the record, marked superseded.</li><li><b>A Vault for files.</b> Images, documents and versions got a list saying what each is and where it lives.</li><li><b>A fresh check.</b> Before a topic counted as done, a fresh AI that had not seen the work read the record cold and answered questions from it.</li><li><b>One front door.</b> One start-here page every new chat reads first, so no chat starts from zero.</li><li><b>Keep it alive.</b> A running log of every correction he made, so nothing got lost when a chat ran long, and a weekly review.</li></ol><p class="dim">This app packs that whole method into one place, without the setup.</p>'],
      ['The weekly review', '<p>Once a week, open <a href="#review">Weekly review</a> and go down the list: sort the Inbox, clear Waiting, settle conflicts, move topic statuses, approve Vault entries, close Log rows, back up. polaris reminds you on Home when it is due.</p>'],
      ['The rules, and why', '<ul><li><b>Newest dated statement wins.</b> Chats repeat old plans. Dates settle it.</li><li><b>Nothing deleted without your yes.</b> polaris archives instead of deleting. Rejected Inbox items are kept.</li><li><b>Locked means locked.</b> Lock a line and it cannot be edited or archived until you unlock it.</li><li><b>Dates and sources on everything.</b> Every line says when it was said and where.</li><li><b>Pointers are links.</b> Put the link in base, and polaris makes it clickable.</li></ul>'],
      ['Sync with GitHub (optional)', '<ol><li>Create a <b>private</b> repo on GitHub, for example <code>my-polaris</code>.</li><li>Go to GitHub Settings, Developer settings, Personal access tokens, <b>Fine-grained tokens</b>, Generate new token.</li><li>Repository access: <b>Only select repositories</b>, pick that one repo. Permissions: <b>Contents: Read and write</b>. Nothing else.</li><li>In polaris <a href="#settings">Settings</a>, choose GitHub, fill in owner and repo, paste the token, then Sync now.</li><li>Do the same on your other devices. Each sync pulls first, merges by item, then pushes. If both sides changed the same item, the newer one is kept and the other lands in your Inbox as held, so nothing is lost.</li></ol><p class="dim">The token is stored only on this device. Settings has a Forget token button. polaris never sends it anywhere except api.github.com.</p>'],
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
      if (old.length) { askSupersede(t, co, old); return 'asked'; }
      return true;
    }
    else {
      if (!t) { toast('Pick a topic first'); return false; }
      var list = KIND_TO[i.kind] || 'start', o = newItem(base);
      if (list === 'decisions') o.who = assistant ? 'assistant' : 'me';
      if (list === 'conflicts') { o.status = 'open'; }
      t[list].push(o); touch(t);
      if (t.status === 'not started') t.status = 'partly';
      if (assistant && list === 'decisions') S.log.push(newItem({ type: 'call', text: text, fix: '', said: i.said, status: 'open' }));
      if (list === 'start') {
        var older = t.start.filter(function (x) { return x !== o && !x.superseded && !x.archived && !x.locked; });
        if (older.length) { i.status = 'applied'; touch(i); save(); askSupersede(t, o, older); return 'asked'; }
      }
    }
    i.status = 'applied'; touch(i); return true;
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
  function sync() {
    if (syncing) return; var g = S.settings.gh;
    if (!g.owner || !g.repo) { toast('Add owner and repo first'); return; }
    syncing = true; toast('Syncing…');
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
      S.meta.lastSync = C.now(); S.meta.lastSyncSha = res && res.content ? res.content.sha : ''; S.meta.lastBackup = C.now(); save(); render();
      toast(merged ? 'Synced. ' + merged + ' clash' + (merged > 1 ? 'es' : '') + ' held in your Inbox.' : 'Synced', 3500);
    }).catch(function (e) {
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
      else { exampleData(); S.settings.setupDone = true; save(); go('home'); toast('Example loaded. Look around.'); }
    },
    'copy-handoff': function () { copy(handoffPrompt()); },
    'copy-harvest': function () { copy(harvestPrompt()); },
    'copy-catchup': function () { copy(catchupPrompt()); },
    'copy-front': function (v) { copy(frontDoor(v)); },
    'add-topic': function () { modal('<h2>New topic</h2><label for="nt">Name</label><input type="text" id="nt" placeholder="Kitchen remodel"><div class="row" style="justify-content:flex-end;margin-top:12px"><button class="btn ghost" data-act="close">Cancel</button><button class="btn primary" data-act="form-save">Add</button></div>'); pending = function () { var n = document.getElementById('nt').value.trim(); if (!n) return false; if (topicByName(n)) { toast('You already have that topic'); return false; } S.topics.push(C.emptyTopic(n)); return true; }; },
    'topic-rename': function () { var t = topicById(route.arg); if (t.locked) return toast('This topic is locked'); modal('<h2>Rename topic</h2><input type="text" id="nt" value="' + esc(t.name) + '"><div class="row" style="justify-content:flex-end;margin-top:12px"><button class="btn ghost" data-act="close">Cancel</button><button class="btn primary" data-act="form-save">Save</button></div>'); pending = function () { var n = document.getElementById('nt').value.trim(); if (!n) return false; t.name = n; touch(t); return true; }; },
    'topic-md': function () { copy(C.topicMarkdown(topicById(route.arg))); },
    tab: function (v) { ui.topicTab = v; render(); },
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
    'setup-back': function () { ui.setupStep = Math.max(0, (ui.setupStep || 0) - 1); render(); },
    'setup-next': function () {
      var s = ui.setupStep || 0;
      if (s === 0) { S.profile.name = document.getElementById('su-name').value.trim().slice(0, 40); }
      if (s === 1) { [].forEach.call(document.querySelectorAll('input[name=tpl]:checked:not(:disabled)'), function (c) { ensureTopic(c.value); }); document.getElementById('su-custom').value.split('\n').map(function (x) { return x.trim(); }).filter(Boolean).forEach(ensureTopic); if (!S.topics.length) { toast('Pick at least one topic'); return; } }
      if (s === 2) { S.settings.dataMode = (document.querySelector('input[name=dm]:checked') || {}).value || 'device'; }
      if (s === 3) { [].forEach.call(document.querySelectorAll('[data-rule]'), function (c) { S.settings.rules.forEach(function (r) { if (r.id === c.getAttribute('data-rule')) r.on = c.checked; }); }); }
      save();
      if (s >= 4) { S.settings.setupDone = true; save(); ui.setupStep = 0; go(S.settings.dataMode === 'github' && !Store.token() ? 'settings' : 'home'); toast(S.settings.dataMode === 'github' ? 'Add your repo and token to finish' : 'You are set'); return; }
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
    shell();
    document.title = (route.name === 'home' ? '' : route.name[0].toUpperCase() + route.name.slice(1) + ' · ') + 'polaris by Gugui';
  }
  var lastRoute = '';
  window.addEventListener('hashchange', function () { var r = location.hash; if (r.indexOf('#topic/') === 0 && lastRoute !== r) ui.topicTab = 'start'; lastRoute = r; closeModal(); render(); window.scrollTo(0, 0); });
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
    if (!S) { S = C.emptyState(); var P = window.POLARIS_PRESET || {}, m = (location.hash || '').match(/^#name-([A-Za-z\u00C0-\u024F' -]{1,30})$/); if (P.name) S.profile.name = P.name; else if (m) { S.profile.name = decodeURIComponent(m[1]); location.hash = 'home'; } }
    if (!Store.ok) toast('This browser blocks storage. Your work will not be kept. Export often.', 6000);
    Store.persist();
    document.body.addEventListener('click', onClick);
    document.body.addEventListener('change', onChange);
    if (!S.settings.setupDone && !S.topics.length && !location.hash) location.hash = 'home';
    render(); stars(); sw();
  });
  window.__polaris = { state: function () { return S; }, version: VERSION };
})();
