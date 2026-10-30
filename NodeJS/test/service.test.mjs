import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {LinkStore, ApiError} from '../src/shortener.mjs';
import {createServer} from '../src/server.mjs';

function setup(now = Date.parse('2026-10-28T12:00:00Z')) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'js-shortener-'));
  const tick = {now};
  const store = new LinkStore(path.join(dir,'links.json'), {clock: () => tick.now, apiKey: 'test-key'});
  return {store, tick, cleanup: () => fs.rmSync(dir,{recursive:true,force:true})};
}
test('create, redirect counter, analytics and persistent restart', () => {
  const {store,cleanup} = setup();
  try {
    const created = store.create({url:'https://example.org/article',alias:'hello7'}, 'request-0001');
    assert.equal(created.code,'hello7');
    assert.equal(store.resolve('hello7','192.0.2.4'), 'https://example.org/article');
    assert.equal(store.analytics('hello7').clicks, 1);
    assert.equal(new LinkStore(store.file).analytics('hello7').clicks,1);
  } finally {cleanup();}
});
test('expiration returns 410 and does not increment', () => {
  const {store,tick,cleanup} = setup();
  try {store.create({url:'https://example.org',alias:'expire1',ttlHours:1}); tick.now += 3600000;assert.throws(() => store.resolve('expire1'),e => e.status === 410);assert.equal(store.analytics('expire1').clicks,0);} finally {cleanup();}
});
test('reject unsafe URL and suspicious alias shape', () => {
  const {store,cleanup} = setup();
  try {assert.throws(() => store.create({url:'javascript:alert(1)'}),e => e.status === 400); assert.throws(() => store.create({url:'https://username:pass@example.org'}),e => e.status === 400);assert.throws(() => store.create({url:'https://ok.test',alias:'a?'}),e => e.status === 400);} finally {cleanup();}
});
test('idempotent replay and conflicting payload', () => {
  const {store,cleanup} = setup();
  try {const a=store.create({url:'https://example.org'}, 'request-0002'); const b=store.create({url:'https://example.org'}, 'request-0002');assert.equal(a.code,b.code);assert.equal(b.replay,true);assert.throws(() => store.create({url:'https://example.com'},'request-0002'),e=>e.status===409);} finally {cleanup();}
});
test('http auth, redirect, analytics, and rate limit', async () => {
  const {store,cleanup} = setup();
  const server=createServer(store,{rateLimit:2}).listen(0);
  try {
    await new Promise(resolve=>server.once('listening',resolve));
    const base=`http://127.0.0.1:${server.address().port}`;
    const noAuth=await fetch(`${base}/api/v1/links`,{method:'POST',body:'{}'});
    assert.equal(noAuth.status,401);
    const created=await fetch(`${base}/api/v1/links`, {method:'POST',headers:{'x-api-key':'test-key','content-type':'application/json'},body:JSON.stringify({url:'https://example.net',alias:'valid45'})});
    assert.equal(created.status,201);
    const redirect=await fetch(`${base}/valid45`,{redirect:'manual'});
    assert.equal(redirect.status,302);assert.equal(redirect.headers.get('location'),'https://example.net/');
    const stats=await fetch(`${base}/api/v1/links/valid45/analytics`,{headers:{'x-api-key':'test-key'}});
    assert.equal((await stats.json()).clicks,1);
    const limit=await fetch(`${base}/api/v1/links/valid45/analytics`,{headers:{'x-api-key':'test-key'}});
    assert.equal(limit.status,429);
  } finally {server.close(); cleanup();}
});
