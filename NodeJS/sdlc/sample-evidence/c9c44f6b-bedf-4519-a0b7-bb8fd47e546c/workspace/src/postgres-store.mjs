import crypto from 'node:crypto';
import {ApiError} from './shortener.mjs';

const CODE_RE = /^[A-Za-z0-9_-]{4,32}$/;
const RESERVED = new Set(['health','ready','api','favicon','robots','metrics','admin']);
const ALPHABET = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
const MAX_TTL_MS = 365 * 86400_000;
const DEFAULT_TTL_MS = 48 * 3600_000;

export function validateCreate(input, now = Date.now()) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new ApiError(400, 'JSON object required');
  if (typeof input.url !== 'string' || input.url.length > 2048) throw new ApiError(400, 'Invalid destination URL');
  let destination;
  try {
    const u = new URL(input.url);
    if (!['http:', 'https:'].includes(u.protocol) || !u.hostname || u.username || u.password) throw Error();
    destination = u.toString();
  } catch { throw new ApiError(400, 'Only absolute http(s) URLs without credentials are allowed'); }
  const alias = input.alias ?? null;
  if (alias !== null && (typeof alias !== 'string' || !CODE_RE.test(alias) || RESERVED.has(alias.toLowerCase()))) throw new ApiError(400, 'Invalid or reserved alias');
  if (input.expiresAt != null && input.ttlHours != null) throw new ApiError(400, 'Supply expiresAt or ttlHours, not both');
  let expiresMs;
  if (input.expiresAt != null) {
    if (typeof input.expiresAt !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/.test(input.expiresAt)) throw new ApiError(400, 'expiresAt must be an ISO-8601 timestamp with timezone');
    expiresMs = Date.parse(input.expiresAt);
  } else if (input.ttlHours != null) {
    if (!Number.isInteger(input.ttlHours) || input.ttlHours < 1 || input.ttlHours > 8760) throw new ApiError(400, 'ttlHours must be between 1 and 8760');
    expiresMs = now + input.ttlHours * 3600_000;
  } else { expiresMs = now + DEFAULT_TTL_MS; }
  if (!Number.isFinite(expiresMs) || expiresMs <= now + 60_000 || expiresMs > now + MAX_TTL_MS) throw new ApiError(400, 'Expiration must be over 1 minute and within 365 days');
  return {destination, alias, expiresAt: new Date(expiresMs).toISOString()};
}

const randomCode = () => Array.from(crypto.randomBytes(8), byte => ALPHABET[byte % ALPHABET.length]).join('');
const fingerprintOf = (destination, alias, expiresAt) => crypto.createHash('sha256').update(JSON.stringify({destination, alias, expiresAt})).digest('hex');

export class PgLinkStore {
  constructor(pool, {baseUrl = process.env.BASE_URL ?? 'http://localhost:3000', visitorSecret = process.env.VISITOR_HASH_SECRET ?? 'local-dev-change-me', clock = () => Date.now()} = {}) {
    this.pool = pool; this.baseUrl = baseUrl.replace(/\/$/, ''); this.visitorSecret = visitorSecret; this.clock = clock;
  }
  format(row, replay) { return {code:row.code, shortUrl:`${this.baseUrl}/${row.code}`, destination:row.destination, createdAt:new Date(row.created_at).toISOString(), expiresAt:new Date(row.expires_at).toISOString(), replay}; }
  async create(input, requestKey, owner = 'local-dev') {
    if (typeof owner !== 'string' || owner.length < 1 || owner.length > 128) throw new ApiError(401,'Invalid owner');
    const {destination, alias, expiresAt} = validateCreate(input, this.clock());
    if (requestKey != null && !/^[A-Za-z0-9_-]{8,128}$/.test(requestKey)) throw new ApiError(400,'Invalid Idempotency-Key');
    // Exact same request must have a fixed expiry for robust idempotency retries.
    // For TTL-based requests fingerprint the TTL instead of computed expiresAt.
    const requestExpiry = input.expiresAt != null ? expiresAt : (input.ttlHours ?? 720);
    const fingerprint = fingerprintOf(destination, alias, requestExpiry);
    const db = await this.pool.connect();
    try {
      await db.query('BEGIN');
      if (requestKey) {
        // Same-key callers serialize across ECS replicas, not just inside one Node process.
        await db.query('SELECT pg_advisory_xact_lock(hashtext($1))', [owner+':'+requestKey]);
        const old = await db.query('SELECT fingerprint,code FROM idempotency_requests WHERE owner_sub=$1 AND request_key=$2', [owner,requestKey]);
        if (old.rowCount) {
          if (old.rows[0].fingerprint !== fingerprint) throw new ApiError(409, 'Idempotency key reused with a different request');
          const previous = await db.query('SELECT * FROM short_links WHERE code=$1', [old.rows[0].code]);
          await db.query('COMMIT');
          return this.format(previous.rows[0], true);
        }
      }
      let result;
      for (let attempt=0; attempt<12; attempt++) {
        const code = alias ?? randomCode();
        result = await db.query('INSERT INTO short_links(code,owner_sub,destination,expires_at) VALUES($1,$2,$3,$4) ON CONFLICT(code) DO NOTHING RETURNING *',[code,owner,destination,expiresAt]);
        if (result.rowCount) break;
        if (alias) throw new ApiError(409, 'Alias already exists');
      }
      if (!result?.rowCount) throw new ApiError(503,'Unable to allocate code');
      if (requestKey) await db.query('INSERT INTO idempotency_requests(owner_sub,request_key,fingerprint,code) VALUES($1,$2,$3,$4)',[owner,requestKey,fingerprint,result.rows[0].code]);
      await db.query('COMMIT');
      return this.format(result.rows[0],false);
    } catch (e) {
      try { await db.query('ROLLBACK'); } catch {}
      throw e;
    } finally { db.release(); }
  }
  async resolve(code, visitor='') {
    const db = await this.pool.connect();
    try {
      await db.query('BEGIN');
      const result = await db.query('UPDATE short_links SET click_count=click_count+1 WHERE code=$1 AND revoked_at IS NULL AND expires_at > NOW() RETURNING destination', [code]);
      if (!result.rowCount) {
        const exists = await db.query('SELECT 1 FROM short_links WHERE code=$1',[code]);
        throw new ApiError(exists.rowCount ? 410 : 404, exists.rowCount ? 'Link expired or revoked' : 'Link not found');
      }
      const now = new Date(this.clock());
      const visitorHash = visitor ? crypto.createHmac('sha256',this.visitorSecret).update(visitor).digest('hex').slice(0,20) : null;
      await db.query('INSERT INTO click_events(code,happened_at,day_utc,visitor_hash) VALUES($1,$2,$3,$4)',[code,now.toISOString(),now.toISOString().slice(0,10),visitorHash]);
      await db.query('COMMIT');
      return result.rows[0].destination;
    } catch(e) {try {await db.query('ROLLBACK');} catch {} throw e;} finally {db.release();}
  }
  async analytics(code, owner = 'local-dev') {
    const link = await this.pool.query('SELECT * FROM short_links WHERE code=$1 AND owner_sub=$2',[code,owner]);
    if (!link.rowCount) throw new ApiError(404,'Link not found');
    const metrics = await this.pool.query('SELECT COUNT(DISTINCT visitor_hash)::bigint AS unique_visitors FROM click_events WHERE code=$1',[code]);
    const daily = await this.pool.query('SELECT day_utc,COUNT(*)::bigint AS n FROM click_events WHERE code=$1 GROUP BY day_utc ORDER BY day_utc',[code]);
    const l = link.rows[0];
    return {code:l.code, destination:l.destination, createdAt:new Date(l.created_at).toISOString(), expiresAt:new Date(l.expires_at).toISOString(), clicks:Number(l.click_count), revokedAt:l.revoked_at ? new Date(l.revoked_at).toISOString() : null, uniqueVisitors:Number(metrics.rows[0].unique_visitors), dailyClicks:Object.fromEntries(daily.rows.map(r=>[r.day_utc,Number(r.n)]))};
  }
  async list(owner, page=0, size=20) {
    const rows=await this.pool.query('SELECT code,destination,created_at,expires_at,revoked_at,click_count FROM short_links WHERE owner_sub=$1 ORDER BY created_at DESC,code DESC LIMIT $2 OFFSET $3',[owner,size,page*size]);
    const total=await this.pool.query('SELECT COUNT(*)::bigint AS n FROM short_links WHERE owner_sub=$1',[owner]);
    return {items:rows.rows.map(r=>({...this.format(r,false),clicks:Number(r.click_count),revokedAt:r.revoked_at?new Date(r.revoked_at).toISOString():null})),page,size,total:Number(total.rows[0].n)};
  }
  async revoke(code,owner) {
    const row=await this.pool.query('UPDATE short_links SET revoked_at=COALESCE(revoked_at,NOW()) WHERE code=$1 AND owner_sub=$2 RETURNING code',[code,owner]);
    if(!row.rowCount)throw new ApiError(404,'Link not found');
  }
  async ready() {await this.pool.query('SELECT 1'); return true;}
}
