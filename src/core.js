/* polaris by Gugui — core (no DOM). Parser, model, merge, markdown, zip. */
var PolarisCore = (function () {
  'use strict';
  var SCHEMA = 1;
  var KINDS = ['fact', 'decision', 'idea', 'question', 'waiting', 'asset', 'source', 'correction', 'conflict'];
  var KIND_ALIASES = {
    facts: 'fact', 'start here': 'fact', status: 'fact', update: 'fact', note: 'fact',
    decisions: 'decision', ruling: 'decision', rule: 'decision', decided: 'decision',
    ideas: 'idea', questions: 'question', 'open question': 'question',
    todo: 'waiting', 'to do': 'waiting', 'waiting on you': 'waiting', task: 'waiting', action: 'waiting',
    file: 'asset', files: 'asset', image: 'asset', render: 'asset', link: 'source', sources: 'source',
    complaint: 'correction', fix: 'correction', ledger: 'correction', conflicts: 'conflict'
  };
  var FIELDS = { topic: 'topic', kind: 'kind', type: 'kind', said: 'said', date: 'said', when: 'said',
    chat: 'chat', from: 'chat', where: 'chat', words: 'words', quote: 'words', 'my words': 'words',
    proposal: 'proposal', what: 'proposal', item: 'proposal', text: 'proposal', summary: 'proposal',
    base: 'base', link: 'base', url: 'base', source: 'base' };

  function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 8); }
  function now() { return new Date().toISOString(); }
  function pad(n) { return (n < 10 ? '0' : '') + n; }
  function today() { var d = new Date(); return pad(d.getMonth() + 1) + '/' + pad(d.getDate()) + '/' + d.getFullYear(); }
  function slug(s) { return String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 48) || 'topic'; }

  // Accepts MM/DD/YYYY, YYYY-MM-DD, M/D/YY; returns MM/DD/YYYY or '' if unreadable.
  function normDate(s) {
    s = String(s || '').trim();
    var m = s.match(/(\d{4})-(\d{1,2})-(\d{1,2})/);
    if (m) return pad(+m[2]) + '/' + pad(+m[3]) + '/' + m[1];
    m = s.match(/(\d{1,2})\/(\d{1,2})\/(\d{2,4})/);
    if (m) { var y = +m[3]; if (y < 100) y += 2000; return pad(+m[1]) + '/' + pad(+m[2]) + '/' + y; }
    return '';
  }
  // sortable key for MM/DD/YYYY
  function dateKey(s) { var m = String(s || '').match(/(\d{2})\/(\d{2})\/(\d{4})/); return m ? m[3] + m[1] + m[2] : '00000000'; }

  function normKind(k) {
    k = String(k || '').toLowerCase().trim().replace(/[^a-z ]/g, '');
    if (KINDS.indexOf(k) >= 0) return k;
    if (KIND_ALIASES[k]) return KIND_ALIASES[k];
    if (k.slice(-1) === 's' && KINDS.indexOf(k.slice(0, -1)) >= 0) return k.slice(0, -1);
    return '';
  }
  function cleanVal(v) {
    v = String(v == null ? '' : v).trim();
    if (/^["“'].*["”']$/.test(v) && v.length > 1) v = v.slice(1, -1).trim();
    if (/^(none|n\/a|-|null)$/i.test(v)) v = '';
    return v;
  }

  // Pull the POLARIS block(s) out of any pasted text. Tolerant of fences, bold markers, bullets, JSON.
  function extractBlocks(text) {
    text = String(text || '').replace(/\r\n?/g, '\n').replace(/\*\*/g, '');
    var out = [];
    var re = /POLARIS(?:\s+v\d+)?\s*\n([\s\S]*?)(?:\n\s*END\s+POLARIS|```|$)/gi, m;
    while ((m = re.exec(text))) { if (m[1].trim()) out.push(m[1]); }
    if (!out.length) {
      var f = /```(?:polaris|json)?\s*\n([\s\S]*?)```/gi;
      while ((m = f.exec(text))) out.push(m[1]);
    }
    if (!out.length && /(^|\n)\s*[-*]?\s*\**(kind|topic|proposal)\**\s*:/i.test(text)) out.push(text);
    return out;
  }

  function parseJSONish(body, errors) {
    var items = [];
    var t = body.trim();
    try {
      var j = JSON.parse(t);
      (Array.isArray(j) ? j : (j.items || [j])).forEach(function (o) { items.push(o); });
      return items;
    } catch (e) { /* maybe JSON lines */ }
    var ok = 0;
    t.split('\n').forEach(function (line, i) {
      line = line.trim().replace(/,$/, '');
      if (!line || line[0] !== '{') return;
      try { items.push(JSON.parse(line)); ok++; } catch (e) { errors.push('Line ' + (i + 1) + ': could not read this line as JSON.'); }
    });
    return ok ? items : null;
  }

  function parseKV(body, errors) {
    var items = [], cur = null, lastKey = null, defaults = {}, seenSep = false;
    function flush() { if (cur && Object.keys(cur).length) items.push(cur); cur = null; lastKey = null; }
    body.split('\n').forEach(function (raw, i) {
      var line = raw.replace(/^\s*(?:[-*•]|\d+[.)])\s+/, '').replace(/\*\*/g, '').replace(/^#+\s*/, '');
      if (/^\s*(---+|===+|\*\*\*+)\s*$/.test(raw) || /^\s*(item|entry)\s*\d*\s*:?\s*$/i.test(line)) { flush(); seenSep = true; return; }
      if (!line.trim() || /^\s*(END\s+)?POLARIS\b/i.test(line)) { return; }
      var m = line.match(/^\s*([A-Za-z][A-Za-z ]{0,14}?)\s*[:=]\s*(.*)$/);
      if (m) {
        var key = FIELDS[m[1].toLowerCase().trim()];
        if (key) {
          if (!cur && key === 'topic' && !seenSep) { defaults.topic = cleanVal(m[2]); lastKey = null; return; }
          if (!cur) cur = {};
          else if (cur[key] != null && key !== 'proposal') { flush(); cur = {}; }
          cur[key] = cleanVal(m[2]); lastKey = key; return;
        }
      }
      if (cur && lastKey) { cur[lastKey] = (cur[lastKey] ? cur[lastKey] + ' ' : '') + line.trim(); return; }
      if (line.trim()) errors.push('Line ' + (i + 1) + ': skipped, it is not "field: value".');
    });
    flush();
    items.forEach(function (it) { if (!it.topic && defaults.topic) it.topic = defaults.topic; });
    return items;
  }

  // Main entry: returns {items:[inbox-ready], errors:[strings]}
  function parseHandoff(text, opts) {
    opts = opts || {};
    var errors = [], raw = [];
    var blocks = extractBlocks(text);
    if (!blocks.length) return { items: [], errors: ['No POLARIS block found. Ask the chat for its handoff, then paste the whole reply.'] };
    blocks.forEach(function (b) {
      var j = parseJSONish(b, errors);
      raw = raw.concat(j && j.length ? j : parseKV(b, errors));
    });
    var items = [];
    raw.forEach(function (r, n) {
      if (!r || typeof r !== 'object') return;
      var o = {};
      Object.keys(r).forEach(function (k) { var f = FIELDS[String(k).toLowerCase()]; if (f) o[f] = cleanVal(r[k]); });
      var kind = normKind(o.kind);
      if (!o.proposal && o.words) o.proposal = o.words;
      if (!o.proposal) { errors.push('Item ' + (n + 1) + ': no proposal or words, skipped.'); return; }
      if (!kind) { errors.push('Item ' + (n + 1) + ': kind "' + (o.kind || '') + '" not known, saved as fact.'); kind = 'fact'; }
      var said = normDate(o.said);
      if (o.said && !said) errors.push('Item ' + (n + 1) + ': date "' + o.said + '" not readable, used today.');
      items.push({ id: uid(), topic: o.topic || opts.topic || '', kind: kind, said: said || today(),
        chat: o.chat || opts.chat || '', words: o.words || '', proposal: o.proposal.slice(0, 4000),
        base: o.base || '', status: 'proposed', created: now(), updated: now() });
    });
    return { items: items, errors: errors };
  }

  // ---------- model ----------
  function emptyTopic(name) {
    return { id: uid(), name: name, slug: slug(name), status: 'not started', created: now(), updated: now(),
      start: [], decisions: [], ideas: [], conflicts: [], questions: [], sources: [] };
  }
  function emptyState() {
    return { schema: SCHEMA, app: 'polaris by Gugui', profile: { name: '', created: now() },
      settings: { dataMode: 'device', rules: defaultRules(), gh: { owner: '', repo: '', branch: 'main', path: 'polaris.json' }, setupDone: false, reviewEvery: 7 },
      topics: [], inbox: [], waiting: [], vault: [], log: [], reviews: [],
      meta: { updated: now(), lastBackup: '', lastSync: '', lastSyncSha: '' } };
  }
  function defaultRules() {
    return [
      { id: 'newest', on: true, text: 'The newest dated statement wins. Older lines stay, marked superseded.' },
      { id: 'nodelete', on: true, text: 'Nothing is deleted or archived without my yes.' },
      { id: 'locked', on: true, text: 'Locked means locked. A locked line is never reworded.' },
      { id: 'dated', on: true, text: 'Every fact carries the date it was said and where it came from.' },
      { id: 'links', on: true, text: 'Pointers are always links, never bare text.' },
      { id: 'voice', on: true, text: 'Anything written as me sounds like me: plain and short.' },
      { id: 'ask', on: true, text: 'When a call is mine, ask me. When you make a call without asking, log it.' }
    ];
  }
  function migrate(s) {
    if (!s || typeof s !== 'object') return emptyState();
    var base = emptyState();
    Object.keys(base).forEach(function (k) { if (s[k] == null) s[k] = base[k]; });
    Object.keys(base.settings).forEach(function (k) { if (s.settings[k] == null) s.settings[k] = base.settings[k]; });
    Object.keys(base.meta).forEach(function (k) { if (s.meta[k] == null) s.meta[k] = base.meta[k]; });
    s.topics.forEach(function (t) { ['start', 'decisions', 'ideas', 'conflicts', 'questions', 'sources'].forEach(function (c) { if (!Array.isArray(t[c])) t[c] = []; }); });
    s.schema = SCHEMA;
    return s;
  }
  function validate(s) {
    var errs = [];
    if (!s || typeof s !== 'object') return ['Not a polaris file.'];
    ['topics', 'inbox', 'waiting', 'vault', 'log'].forEach(function (k) { if (s[k] && !Array.isArray(s[k])) errs.push(k + ' should be a list.'); });
    if (s.schema && s.schema > SCHEMA) errs.push('This file is from a newer polaris (schema ' + s.schema + '). Update the app first.');
    return errs;
  }

  // ---------- merge (sync + import). Nothing is dropped: the losing side of a clash goes to the inbox as held. ----------
  var TOP = ['inbox', 'waiting', 'vault', 'log', 'reviews'];
  var SUB = ['start', 'decisions', 'ideas', 'conflicts', 'questions', 'sources'];
  function same(a, b) { var x = Object.assign({}, a), y = Object.assign({}, b); delete x.updated; delete y.updated; return JSON.stringify(x) === JSON.stringify(y); }
  function mergeList(mine, theirs, since, clashes, label) {
    var byId = {}, out = [];
    (mine || []).forEach(function (x) { byId[x.id] = x; out.push(x); });
    (theirs || []).forEach(function (t) {
      var m = byId[t.id];
      if (!m) { out.push(t); return; }
      if (same(m, t)) return;
      var mChanged = !since || (m.updated || '') > since, tChanged = !since || (t.updated || '') > since;
      var win = (t.updated || '') > (m.updated || '') ? t : m, lose = win === t ? m : t;
      if (win === t) out[out.indexOf(m)] = t;
      if (mChanged && tChanged) clashes.push({ label: label, kept: win, other: lose });
    });
    return out;
  }
  function merge(mine, theirs, since) {
    mine = migrate(JSON.parse(JSON.stringify(mine))); theirs = migrate(JSON.parse(JSON.stringify(theirs)));
    var clashes = [];
    TOP.forEach(function (k) { mine[k] = mergeList(mine[k], theirs[k], since, clashes, k); });
    var tById = {}; mine.topics.forEach(function (t) { tById[t.id] = t; });
    theirs.topics.forEach(function (t) {
      var m = tById[t.id];
      if (!m) { mine.topics.push(t); return; }
      SUB.forEach(function (c) { m[c] = mergeList(m[c], t[c], since, clashes, m.name + ' / ' + c); });
      if ((t.updated || '') > (m.updated || '')) { m.name = t.name; m.status = t.status; m.locked = t.locked; m.archived = t.archived; m.updated = t.updated; }
    });
    clashes.forEach(function (c) {
      mine.inbox.push({ id: uid(), topic: '', kind: 'conflict', said: today(), chat: 'sync', words: '',
        proposal: 'Two versions of one ' + c.label + ' item clashed. Kept the newer one. The other version: ' + summarize(c.other),
        base: '', status: 'held', created: now(), updated: now() });
    });
    mine.meta.updated = now();
    return { state: mine, clashes: clashes.length };
  }
  function summarize(o) { return (o.text || o.proposal || o.title || o.name || JSON.stringify(o)).slice(0, 300); }

  // ---------- markdown ----------
  function md(s) { return String(s || '').replace(/\|/g, '\\|').replace(/\n/g, ' '); }
  function link(base) { return /^https?:\/\//.test(base || '') ? '[' + base.replace(/^https?:\/\//, '').slice(0, 60) + '](' + base + ')' : md(base); }
  function topicMarkdown(t) {
    var L = [];
    L.push('# ' + t.name + ': the record', '', 'status: ' + t.status + (t.locked ? ' · locked' : '') + ' · updated ' + (t.updated || '').slice(0, 10), '');
    L.push('## Start here', '');
    t.start.forEach(function (x) { L.push('- ' + (x.superseded ? '~~' + md(x.text) + '~~ (superseded)' : md(x.text)) + ' · said ' + (x.said || '?') + (x.base ? ' · ' + link(x.base) : '')); });
    L.push('', '## Decisions', '', '| decision | words | who | said | source |', '|---|---|---|---|---|');
    t.decisions.forEach(function (x) { L.push('| ' + md(x.text) + (x.superseded ? ' (superseded)' : '') + ' | ' + md(x.words) + ' | ' + (x.who || 'me') + ' | ' + (x.said || '') + ' | ' + link(x.base) + ' |'); });
    [['Ideas', 'ideas'], ['Open questions', 'questions'], ['Conflicts', 'conflicts'], ['Sources', 'sources']].forEach(function (p) {
      L.push('', '## ' + p[0], '');
      t[p[1]].forEach(function (x) { L.push('- ' + md(x.text || x.title) + (x.status ? ' [' + x.status + ']' : '') + ' · ' + (x.said || '') + (x.base || x.url ? ' · ' + link(x.base || x.url) : '')); });
    });
    return L.join('\n') + '\n';
  }
  function bundle(s) {
    var files = [];
    files.push({ name: 'polaris/README.md', text: '# ' + (s.profile.name ? s.profile.name + "'s " : '') + 'polaris\n\nMade with polaris by Gugui. One record per topic, newest dated statement wins.\n\n## Rules\n\n' + s.settings.rules.filter(function (r) { return r.on; }).map(function (r, i) { return (i + 1) + '. ' + r.text; }).join('\n') + '\n\n## Topics\n\n' + s.topics.map(function (t) { return '- [' + t.name + '](topics/' + t.slug + '/STAR.md) · ' + t.status; }).join('\n') + '\n' });
    s.topics.forEach(function (t) { files.push({ name: 'polaris/topics/' + t.slug + '/STAR.md', text: topicMarkdown(t) }); });
    files.push({ name: 'polaris/WAITING.md', text: '# Waiting on me\n\n' + s.waiting.map(function (w) { return '- [' + (w.done ? 'x' : ' ') + '] ' + md(w.text) + (w.base ? ' · ' + link(w.base) : '') + ' · ' + (w.said || ''); }).join('\n') + '\n' });
    files.push({ name: 'polaris/VAULT.md', text: '# Vault\n\n| title | file | where | said | status |\n|---|---|---|---|---|\n' + s.vault.map(function (v) { return '| ' + md(v.title) + ' | ' + md(v.file) + ' | ' + link(v.base) + ' | ' + (v.said || '') + ' | ' + (v.status || 'unreviewed') + ' |'; }).join('\n') + '\n' });
    files.push({ name: 'polaris/LOG.md', text: '# Log\n\n| type | what | fix | status | said |\n|---|---|---|---|---|\n' + s.log.map(function (l) { return '| ' + l.type + ' | ' + md(l.text) + ' | ' + md(l.fix) + ' | ' + (l.status || '') + ' | ' + (l.said || '') + ' |'; }).join('\n') + '\n' });
    files.push({ name: 'polaris/polaris.json', text: JSON.stringify(s, null, 2) });
    return files;
  }

  // ---------- zip (store, no compression) ----------
  var CRC_T = (function () { var t = [], c, n, k; for (n = 0; n < 256; n++) { c = n; for (k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
  function crc32(u8) { var c = 0xFFFFFFFF; for (var i = 0; i < u8.length; i++) c = CRC_T[(c ^ u8[i]) & 255] ^ (c >>> 8); return (c ^ 0xFFFFFFFF) >>> 0; }
  function utf8(s) { return new TextEncoder().encode(s); }
  function zip(files) {
    var parts = [], central = [], offset = 0;
    function le(n, b) { var a = []; for (var i = 0; i < b; i++) a.push((n >>> (8 * i)) & 255); return a; }
    files.forEach(function (f) {
      var name = utf8(f.name), data = utf8(f.text), crc = crc32(data);
      var head = [].concat([0x50, 0x4b, 3, 4], le(20, 2), le(0x0800, 2), le(0, 2), le(0, 2), le(0x21, 2), le(crc, 4), le(data.length, 4), le(data.length, 4), le(name.length, 2), le(0, 2));
      parts.push(new Uint8Array(head), name, data);
      central.push(new Uint8Array([].concat([0x50, 0x4b, 1, 2], le(20, 2), le(20, 2), le(0x0800, 2), le(0, 2), le(0, 2), le(0x21, 2), le(crc, 4), le(data.length, 4), le(data.length, 4), le(name.length, 2), le(0, 2), le(0, 2), le(0, 2), le(0, 2), le(0, 4), le(offset, 4))), name);
      offset += head.length + name.length + data.length;
    });
    var cSize = central.reduce(function (a, p) { return a + p.length; }, 0);
    var end = new Uint8Array([].concat([0x50, 0x4b, 5, 6], le(0, 2), le(0, 2), le(files.length, 2), le(files.length, 2), le(cSize, 4), le(offset, 4), le(0, 2)));
    return parts.concat(central, [end]);
  }

  // base64 for unicode (GitHub contents API)
  function b64(s) { var u = utf8(s), bin = ''; for (var i = 0; i < u.length; i += 0x8000) bin += String.fromCharCode.apply(null, u.subarray(i, i + 0x8000)); return btoa(bin); }
  function unb64(s) { var bin = atob(String(s).replace(/\s/g, '')), u = new Uint8Array(bin.length); for (var i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i); return new TextDecoder().decode(u); }

  return { SCHEMA: SCHEMA, KINDS: KINDS, uid: uid, now: now, today: today, slug: slug, normDate: normDate, dateKey: dateKey,
    parseHandoff: parseHandoff, emptyState: emptyState, emptyTopic: emptyTopic, defaultRules: defaultRules, migrate: migrate, validate: validate,
    merge: merge, topicMarkdown: topicMarkdown, bundle: bundle, zip: zip, crc32: crc32, b64: b64, unb64: unb64 };
})();
if (typeof module !== 'undefined') module.exports = PolarisCore;
