import test from 'node:test';
import assert from 'node:assert/strict';
import {buildCreatePayload,linkStatus,dailySeries,friendlyDomain} from '../src/lib/format.js';
import {makeApi,ApiError} from '../src/lib/api.js';
import {pkceChallenge,secureRandom,safeClaims} from '../src/lib/auth.js';

const now=Date.parse('2026-10-29T12:00:00Z');
test('expiry presets use ttlHours and no expiresAt',()=>{
  assert.deepEqual(buildCreatePayload({url:'https://example.com',alias:'promo2026',expiry:'7d'},now),{url:'https://example.com/',alias:'promo2026',ttlHours:168});
});
test('custom expiry sends UTC and omits ttlHours',()=>{
  const payload=buildCreatePayload({url:'https://example.com',expiry:'custom',customDate:'2026-11-03T17:30:00Z'},now);
  assert.equal(payload.expiresAt,'2026-11-03T17:30:00.000Z');assert.equal('ttlHours' in payload,false);
});
test('expiry cannot exceed 365 days',()=>assert.throws(()=>buildCreatePayload({url:'https://example.com',expiry:'custom',customDate:'2028-01-01T10:00:00Z'},now),/365 days/));
test('rejects unsafe URL protocols and credentials',()=>{
  assert.throws(()=>buildCreatePayload({url:'javascript:alert(1)',expiry:'30d'},now),/http/);
  assert.throws(()=>buildCreatePayload({url:'https://user:pass@example.com',expiry:'30d'},now),/http/);
});
test('validates custom aliases',()=>assert.throws(()=>buildCreatePayload({url:'https://example.org',alias:'ab',expiry:'30d'},now),/4–32/));
test('statuses include active, expired and revoked',()=>{
  assert.equal(linkStatus({expiresAt:'2026-12-01T00:00:00Z'},now),'Active');
  assert.equal(linkStatus({expiresAt:'2026-01-01T00:00:00Z'},now),'Expired');
  assert.equal(linkStatus({revokedAt:'2026-10-01T00:00:00Z',expiresAt:'2026-12-01T00:00:00Z'},now),'Revoked');
});
test('analytics daily series fills gaps',()=>{
  const series=dailySeries({'2026-10-28':5},3,now);
  assert.deepEqual(series.map(x=>x.clicks),[0,5,0]);
});
test('API attaches access token and idempotency header',async()=>{
  let captured;
  const api=makeApi({apiBaseUrl:'https://api.example.org'},async()=> 'token123',()=>{},async(uri,options)=>{captured={uri,options};return{ok:true,status:201,json:async()=>({code:'abcd'})};});
  const result=await api.create({url:'https://example.com',ttlHours:24},'request_00001');
  assert.equal(result.code,'abcd');assert.equal(captured.options.headers.Authorization,'Bearer token123');
  assert.equal(captured.options.headers['Idempotency-Key'],'request_00001');
});
test('API handles revoked link 204',async()=>{
  const api=makeApi({apiBaseUrl:'https://api.example.org'},async()=> 'tok',()=>{},async()=>({ok:true,status:204}));
  assert.equal(await api.revoke('shortcode'),null);
});
test('API surfaces backend error',async()=>{
  const api=makeApi({apiBaseUrl:'https://api.example.org'},async()=> 'tok',()=>{},async()=>({ok:false,status:409,json:async()=>({error:'Alias already exists'})}));
  await assert.rejects(()=>api.create({url:'https://example.org'}),e=>e instanceof ApiError&&e.status===409&&e.message==='Alias already exists');
});
test('PKCE challenge matches RFC 7636 example',async()=>{
  const verifier='dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk';
  assert.equal(await pkceChallenge(verifier),'E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM');
});
test('random login token is base64url-safe',()=>assert.match(secureRandom(32),/^[A-Za-z0-9_-]+$/));
test('invalid JWT claims are treated as display-only, no crash',()=>assert.deepEqual(safeClaims('not-a-jwt'),{}));
test('friendly domain removes www',()=>assert.equal(friendlyDomain('https://www.example.com/path'),'example.com'));

test('missing token triggers sign-out callback',async()=>{
  let invoked=false;
  const api=makeApi({apiBaseUrl:'https://api.example.org'},async()=>null,()=>{invoked=true;});
  await assert.rejects(()=>api.list(),/sign in/);
  assert.equal(invoked,true);
});
