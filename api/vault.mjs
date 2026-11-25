// polaris by Gugui: encrypted device sync. The server only ever sees ciphertext.
// One Redis hash per vault (Upstash REST). Auth = SHA-256 of a bearer token derived on the device.
// GET  /api/vault?id=ID&since=REV   -> 200 {rev, iv, ct} | 200 {rev, unchanged:true} | 401 | 404
// POST /api/vault?id=ID  {iv, ct}   -> 201 {rev:1} | 409 {error:'exists'}       (create, first device only)
// PUT  /api/vault?id=ID  {expectedRev, iv, ct} -> 200 {rev} | 409 {rev} | 401 | 404
import { createHash } from 'node:crypto';

const MAX = 1024 * 1024; // 1 MiB of JSON
const ID_RE = /^[a-f0-9]{32}$/;
const B64_RE = /^[A-Za-z0-9_-]+$/;

// KEYS[1] = vault key. ARGV[1] = op, ARGV[2] = auth hash, ARGV[3..] = op args.
// Returns {status, rev, iv, ct}. All checks and writes happen atomically.
const LUA = `
local k = KEYS[1]
local op = ARGV[1]
local auth = ARGV[2]
local now = ARGV[3]
if op == 'create' then
  if redis.call('EXISTS', k) == 1 then return {409, '0'} end
  redis.call('HSET', k, 'auth', auth, 'rev', 1, 'iv', ARGV[4], 'ct', ARGV[5], 't', now)
  return {201, '1'}
end
if redis.call('EXISTS', k) == 0 then return {404, '0'} end
if redis.call('HGET', k, 'auth') ~= auth then return {401, '0'} end
local rev = tonumber(redis.call('HGET', k, 'rev'))
if op == 'get' then
  if ARGV[4] ~= '' and tonumber(ARGV[4]) == rev then return {200, tostring(rev)} end
  local v = redis.call('HMGET', k, 'iv', 'ct')
  return {200, tostring(rev), v[1], v[2]}
end
if op == 'put' then
  if tonumber(ARGV[4]) ~= rev then return {409, tostring(rev)} end
  local v = redis.call('HMGET', k, 'iv', 'ct')
  rev = rev + 1
  redis.call('HSET', k, 'rev', rev, 'piv', v[1], 'pct', v[2], 'iv', ARGV[5], 'ct', ARGV[6], 't', now)
  return {200, tostring(rev)}
end
return {400, '0'}
`;

function json(status, body) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'private, no-store' } });
}

async function redis(cmd) {
  const url = process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL;
  const tok = process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN;
  if (!url || !tok) throw new Error('storage not configured');
  const r = await fetch(url, { method: 'POST', headers: { Authorization: 'Bearer ' + tok, 'Content-Type': 'application/json' }, body: JSON.stringify(cmd) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok || j.error) throw new Error(j.error || 'storage error ' + r.status);
  return j.result;
}

function parse(request) {
  const u = new URL(request.url);
  const id = u.searchParams.get('id') || '';
  const m = (request.headers.get('authorization') || '').match(/^Bearer ([A-Za-z0-9_-]{32,64})$/);
  if (!ID_RE.test(id)) return { err: json(400, { error: 'bad id' }) };
  if (!m) return { err: json(401, { error: 'no credentials' }) };
  return { id, key: 'pv1:' + id, auth: createHash('sha256').update(m[1]).digest('hex'), since: u.searchParams.get('since') || '' };
}

async function body(request) {
  if (!/^application\/json/.test(request.headers.get('content-type') || '')) return { err: json(415, { error: 'json only' }) };
  const text = await request.text();
  if (text.length > MAX) return { err: json(413, { error: 'too big' }) };
  let b; try { b = JSON.parse(text); } catch { return { err: json(400, { error: 'bad json' }) }; }
  if (!b || !B64_RE.test(b.iv || '') || !B64_RE.test(b.ct || '') || b.iv.length > 32) return { err: json(400, { error: 'bad payload' }) };
  return { b };
}

async function run(key, args) {
  try { return await redis(['EVAL', LUA, '1', key, ...args]); }
  catch (e) { return { failed: e.message }; }
}

function reply(res) {
  if (res && res.failed) return json(503, { error: 'storage unavailable' }); // never looks like an empty vault
  const [status, rev, iv, ct] = res;
  if (status === 200 && iv === undefined) return json(200, { rev: +rev, unchanged: true });
  if (status === 200 && iv) return json(200, { rev: +rev, iv, ct });
  if (status === 201) return json(201, { rev: +rev });
  if (status === 409) return json(409, { rev: +rev, error: rev === '0' ? 'exists' : 'stale' });
  if (status === 401) return json(401, { error: 'wrong code' });
  if (status === 404) return json(404, { error: 'not found' });
  return json(400, { error: 'bad request' });
}

export async function GET(request) {
  const p = parse(request); if (p.err) return p.err;
  if (p.since && !/^\d+$/.test(p.since)) return json(400, { error: 'bad since' });
  return reply(await run(p.key, ['get', p.auth, String(Date.now()), p.since]));
}

export async function POST(request) {
  const p = parse(request); if (p.err) return p.err;
  const b = await body(request); if (b.err) return b.err;
  return reply(await run(p.key, ['create', p.auth, String(Date.now()), b.b.iv, b.b.ct]));
}

export async function PUT(request) {
  const p = parse(request); if (p.err) return p.err;
  const b = await body(request); if (b.err) return b.err;
  if (!Number.isInteger(b.b.expectedRev) || b.b.expectedRev < 1) return json(400, { error: 'bad expectedRev' });
  return reply(await run(p.key, ['put', p.auth, String(Date.now()), String(b.b.expectedRev), b.b.iv, b.b.ct]));
}
