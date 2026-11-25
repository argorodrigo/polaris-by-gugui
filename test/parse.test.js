const C = require('../src/core.js');
const samples = {
claudeStyle: `Here is your handoff.

\`\`\`
POLARIS v1
topic: Garden
---
kind: decision
said: 11/20/2026
words: "go with the raised beds"
proposal: Build two raised beds on the south side.
base: https://example.com/plan
---
kind: waiting
said: 11/21/2026
words:
proposal: Buy soil before Saturday.
base:
---
END POLARIS
\`\`\`
Anything else?`,
chatgptBold: `**POLARIS v1**
**topic:** Trip to Lisbon

1. **kind:** idea
   **said:** 2026-11-19
   **proposal:** Take the 28 tram at sunrise,
   before the crowds.
2. **kind:** Questions
   **said:** 11/19/26
   **proposal:** Do we need a car on day 3?
END POLARIS`,
json: '```json\n[{"topic":"Work","kind":"decision","said":"11/02/2026","proposal":"Weekly sync moves to Tuesday","words":"tuesday works"},{"topic":"Work","kind":"bogus","proposal":"x"}]\n```',
jsonl: 'POLARIS\n{"topic":"Home","kind":"fact","said":"11/03/2026","proposal":"Lease renews in March"}\n{"topic":"Home","kind":"asset","proposal":"floorplan.pdf"}\nEND POLARIS',
nothing: 'Sure! I updated the doc.',
noisy: 'POLARIS v1\ntopic: X\n---\nkind: fact\nproposal: A <script>alert(1)</script> line\nrandom chatter here\n---\nkind: decision\nsaid: someday\nproposal: B\n',
};
let fail=0;
for (const [k,v] of Object.entries(samples)) { const r=C.parseHandoff(v); console.log('\n##',k, r.items.length,'items'); r.items.forEach(i=>console.log(' ',i.topic,'|',i.kind,'|',i.said,'|',i.words,'|',i.proposal,'|',i.base)); r.errors.forEach(e=>console.log('  ERR',e)); }
const exp={claudeStyle:2,chatgptBold:2,json:2,jsonl:2,nothing:0,noisy:2};
for (const [k,n] of Object.entries(exp)) { const got=C.parseHandoff(samples[k]).items.length; if(got!==n){console.log('FAIL',k,got,'!=',n);fail++;} }
// merge test
const a=C.emptyState(); const t=C.emptyTopic('Garden'); a.topics.push(t);
const b=JSON.parse(JSON.stringify(a));
const since=C.now();
a.waiting.push({id:'w1',text:'mine',updated:'2099-01-01'}); b.waiting.push({id:'w1',text:'theirs',updated:'2099-01-02'});
b.topics[0].ideas.push({id:'i1',text:'new idea',updated:C.now()});
const m=C.merge(a,b,since);
console.log('\nmerge clashes',m.clashes,'waiting',m.state.waiting.map(w=>w.text),'ideas',m.state.topics[0].ideas.length,'held',m.state.inbox.filter(i=>i.status==='held').length);
if(m.clashes!==1||m.state.waiting[0].text!=='theirs'||m.state.topics[0].ideas.length!==1){fail++;console.log('FAIL merge');}
// zip
const parts=C.zip(C.bundle(m.state)); const buf=Buffer.concat(parts.map(p=>Buffer.from(p))); require('fs').writeFileSync('/tmp/t.zip',buf);
console.log(fail?'FAILURES '+fail:'ALL PASS');
// real Claude reply (Haiku, 11/25/2026)
const claudeReal="```\nPOLARIS v1\ntopic: Garden\n---\nkind: decision\nsaid:\nwords: ok for the garden, lets do three raised beds not two. cedar.\nproposal: Garden gets three cedar raised beds instead of two.\nbase: this chat\n---\nkind: waiting\nsaid:\nwords: also remind me to buy compost friday\nproposal: Remind the user to buy compost on Friday.\nbase: this chat\n---\nkind: decision\nsaid:\nwords:\nproposal: assistant call: Garden raised beds are sized 4x8.\nbase: this chat\n---\ntopic: Trip to Lisbon\nkind: correction\nsaid:\nwords: and for lisbon, the sintra day trip is day 4 not day 2\nproposal: Lisbon plan: the Sintra day trip moves to day 4 from day 2.\nbase: this chat\n---\nEND POLARIS\n```";
const cr=C.parseHandoff(claudeReal); console.log('\nclaudeReal', cr.items.map(i=>i.topic+'/'+i.kind).join(', '), cr.errors.length,'errors');
if(cr.items.length!==4||cr.items[0].topic!=='Garden'||cr.items[3].topic!=='Trip to Lisbon'){console.log('FAIL claudeReal');process.exitCode=1}
// real ChatGPT reply (11/25/2026), copied with its "Plain text" label
const gptReal="ChatGPT said:\nPlain text\nPOLARIS v1\ntopic: Garden\n---\nkind: correction\nsaid: 11/25/2026\nwords: ok for the garden, lets do three raised beds not two. cedar.\nproposal: Use three raised garden beds instead of two.\nbase:\n---\nkind: decision\nsaid: 11/25/2026\nwords: ok for the garden, lets do three raised beds not two. cedar.\nproposal: Use cedar for the raised beds.\nbase:\n---\nkind: waiting\nsaid: 11/25/2026\nwords: yeah drip line, on a timer. also remind me to buy compost friday\nproposal: Buy compost Friday.\nbase:\n---\nkind: decision\nsaid: 11/25/2026\nwords:\nproposal: assistant call: Use a 4x8 size for the raised beds.\nbase:\n---\ntopic: Trip to Lisbon\nkind: correction\nsaid: 11/25/2026\nwords: and for lisbon, the sintra day trip is day 4 not day 2\nproposal: Put the Sintra day trip on day 4 instead of day 2.\nbase:\n---\nEND POLARIS\nConvert to PDF\nChatGPT can make mistakes.";
const gr=C.parseHandoff(gptReal); console.log('gptReal', gr.items.map(i=>i.topic+'/'+i.kind).join(', '), gr.errors);
if(gr.items.length!==5||gr.items[4].topic!=='Trip to Lisbon'){console.log('FAIL gptReal');process.exitCode=1}
