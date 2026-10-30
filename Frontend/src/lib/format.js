export const MAX_EXPIRY_DAYS = 365;

export function linkStatus(link, now = Date.now()) {
  if (link.revokedAt) return 'Revoked';
  if (!link.expiresAt || Date.parse(link.expiresAt) <= now) return 'Expired';
  return 'Active';
}
export function toDisplayDate(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return '—';
  return new Intl.DateTimeFormat('en-US', {month:'short', day:'numeric', year:'numeric'}).format(d);
}
export function toDisplayDateTime(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return '—';
  return new Intl.DateTimeFormat('en-US', {dateStyle:'medium',timeStyle:'short'}).format(d);
}
export function compactNumber(n) {
  return new Intl.NumberFormat('en-US', {notation:'compact', maximumFractionDigits:1}).format(Number(n) || 0);
}
export function friendlyDomain(input) {
  try {return new URL(input).hostname.replace(/^www\./,'');} catch {return input;}
}
export function buildCreatePayload({url,alias,expiry,customDate}, now = Date.now()) {
  if (typeof url !== 'string' || url.length > 2048) throw new Error('Destination must be 2,048 characters or less.');
  let parsed;
  try {parsed = new URL(url.trim());} catch {throw new Error('Enter a valid destination URL, including https://.');}
  if (!['https:', 'http:'].includes(parsed.protocol) || !parsed.hostname || parsed.username || parsed.password) throw new Error('Only public http(s) URLs without credentials are accepted.');
  const result = {url:parsed.toString()};
  const customAlias = (alias ?? '').trim();
  if (customAlias && !/^[A-Za-z0-9_-]{4,32}$/.test(customAlias)) throw new Error('Custom alias must be 4–32 letters, numbers, underscores, or dashes.');
  if (customAlias) result.alias = customAlias;
  if (expiry === 'custom') {
    const target = new Date(customDate ?? '').getTime();
    if (!Number.isFinite(target) || target <= now + 60_000) throw new Error('Expiration must be more than one minute in the future.');
    if (target > now + MAX_EXPIRY_DAYS * 24 * 3600_000) throw new Error('Expiration must be within 365 days.');
    result.expiresAt = new Date(target).toISOString();
  } else {
    const ttl = { '1d':24, '7d':168, '30d':720, '90d':2160 }[expiry];
    if (!ttl) throw new Error('Choose an expiration period.');
    result.ttlHours = ttl;
  }
  return result;
}
export function dailySeries(dailyClicks = {}, days = 14, now = Date.now()) {
  const today = new Date(now); today.setUTCHours(0,0,0,0);
  return Array.from({length:days}, (_, i) => {
    const day = new Date(today.getTime() - (days-1-i)*86400_000);
    const key = day.toISOString().slice(0,10);
    return {date:key,label:new Intl.DateTimeFormat('en-US',{month:'short',day:'numeric',timeZone:'UTC'}).format(day),clicks:Number(dailyClicks[key]||0)};
  });
}
