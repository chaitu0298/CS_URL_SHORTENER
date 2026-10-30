import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

export const DEFAULT_TTL_HOURS = null; // EXTENSION_DEFAULT_TTL
export const BLOCKED_ALIASES = new Set([]); // EXTENSION_ALIAS_POLICY
const CODE_CHARS = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
const ALIAS_RE = /^[A-Za-z0-9_-]{4,32}$/;
const MAX_TTL_HOURS = 24 * 365;

export class ApiError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}

function atomicWrite(file, data) {
  fs.mkdirSync(path.dirname(file), {recursive: true});
  const tmp = `${file}.${process.pid}.${crypto.randomBytes(4).toString('hex')}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2), {mode: 0o600});
  fs.renameSync(tmp, file);
}

export class LinkStore {
  constructor(file = './data/links.json', options = {}) {
    this.file = file;
    this.apiKey = options.apiKey ?? process.env.API_KEY ?? 'local-demo-key';
    this.baseUrl = options.baseUrl ?? process.env.BASE_URL ?? 'http://localhost:3000';
    this.secret = options.visitorSecret ?? process.env.VISITOR_HASH_SECRET ?? 'local-dev-change-me';
    this.clock = options.clock ?? (() => Date.now());
    this.state = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : {links: {}, requests: {}};
  }
  persist() { atomicWrite(this.file, this.state); }
  validateUrl(value) {
    if (typeof value !== 'string' || value.length > 2048) throw new ApiError(400, 'Invalid destination URL');
    let url;
    try { url = new URL(value); } catch { throw new ApiError(400, 'Invalid destination URL'); }
    if (!['http:', 'https:'].includes(url.protocol) || !url.hostname || url.username || url.password) {
      throw new ApiError(400, 'Only absolute http(s) URLs without credentials are allowed');
    }
    return url.toString();
  }
  validateAlias(alias) {
    if (typeof alias !== 'string' || !ALIAS_RE.test(alias)) throw new ApiError(400, 'Alias must be 4-32 URL-safe characters');
    if (BLOCKED_ALIASES.has(alias.toLowerCase())) throw new ApiError(400, 'Alias is reserved');
    return alias;
  }
  create(input, requestKey) {
    if (!input || typeof input !== 'object' || Array.isArray(input)) throw new ApiError(400, 'JSON object required');
    const destination = this.validateUrl(input.url);
    const alias = input.alias == null ? undefined : this.validateAlias(input.alias);
    const ttl = input.ttlHours === undefined || input.ttlHours === null ? DEFAULT_TTL_HOURS : input.ttlHours;
    if (ttl !== null && (!Number.isInteger(ttl) || ttl < 1 || ttl > MAX_TTL_HOURS)) {
      throw new ApiError(400, 'ttlHours must be an integer between 1 and 8760');
    }
    const fingerprint = crypto.createHash('sha256').update(JSON.stringify({destination,alias,ttl})).digest('hex');
    if (requestKey != null && (typeof requestKey !== 'string' || !/^[\w-]{8,128}$/.test(requestKey))) {
      throw new ApiError(400, 'Invalid Idempotency-Key');
    }
    if (requestKey && this.state.requests[requestKey]) {
      const previous = this.state.requests[requestKey];
      if (previous.fingerprint !== fingerprint) throw new ApiError(409, 'Idempotency key reused with different payload');
      return {...this.state.links[previous.code], shortUrl: `${this.baseUrl}/${previous.code}`, replay: true};
    }
    let code = alias;
    if (code && this.state.links[code]) throw new ApiError(409, 'Alias already exists');
    if (!code) {
      for (let attempt = 0; attempt < 12; attempt++) {
        const candidate = Array.from(crypto.randomBytes(8), b => CODE_CHARS[b % CODE_CHARS.length]).join('');
        if (!this.state.links[candidate]) { code = candidate; break; }
      }
      if (!code) throw new ApiError(503, 'Could not allocate short code');
    }
    const now = this.clock();
    const link = {code, destination, createdAt: new Date(now).toISOString(), expiresAt: ttl === null ? null : new Date(now + ttl * 3600000).toISOString(), clicks: 0, dailyClicks: {}, visitors: {}};
    this.state.links[code] = link;
    if (requestKey) this.state.requests[requestKey] = {code, fingerprint};
    this.persist();
    return {...link, shortUrl: `${this.baseUrl}/${code}`, replay: false};
  }
  resolve(code, visitor = '') {
    const link = this.state.links[code];
    if (!link) throw new ApiError(404, 'Link not found');
    if (link.expiresAt && this.clock() >= Date.parse(link.expiresAt)) throw new ApiError(410, 'Link expired');
    link.clicks++;
    const date = new Date(this.clock()).toISOString().slice(0, 10);
    link.dailyClicks[date] = (link.dailyClicks[date] ?? 0) + 1;
    if (visitor) {
      const identifier = crypto.createHmac('sha256', this.secret).update(visitor).digest('hex').slice(0, 20);
      link.visitors[identifier] = true;
    }
    this.persist();
    return link.destination;
  }
  analytics(code) {
    const link = this.state.links[code];
    if (!link) throw new ApiError(404, 'Link not found');
    const {visitors, ...publicLink} = link;
    return {...publicLink, uniqueVisitors: Object.keys(visitors).length};
  }
}
