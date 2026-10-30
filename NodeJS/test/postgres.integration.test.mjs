import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {PgLinkStore} from '../src/postgres-store.mjs';
import {createServer} from '../src/server.mjs';

// Run with PG_TEST_URL=postgres://shortener:password@localhost:5432/shortener_test npm test
// Uses isolated test database; NEVER use a production database here.
const uri=process.env.PG_TEST_URL;
test('real PostgreSQL: create, owner access, redirect, expiry, listing and revocation',{skip:!uri},async()=>{
  const {Pool}=await import('pg');
  const pool=new Pool({connectionString:uri});
  process.env.API_KEY='test-integration-key';
  const alias='t'+Math.random().toString(36).slice(2,10);
  const server=createServer(new PgLinkStore(pool,{baseUrl:'http://localhost:3000'}),{authMode:'apikey'}).listen(0);
  try {
    const sql=fs.readFileSync(new URL('../sql/001_init.sql',import.meta.url),'utf8');
    await pool.query(sql);
    await new Promise(resolve=>server.once('listening',resolve));
    const base=`http://127.0.0.1:${server.address().port}`;
    const headers={'Content-Type':'application/json','X-API-Key':'test-integration-key'};
    const created=await fetch(base+'/api/v1/links',{method:'POST',headers,body:JSON.stringify({url:'https://example.org/article',alias,ttlHours:2})});
    assert.equal(created.status,201,await created.text());
    const list=await fetch(base+'/api/v1/links',{headers});
    assert.equal(list.status,200);
    assert.ok((await list.json()).items.some(x=>x.code===alias));
    const other=new PgLinkStore(pool);
    await assert.rejects(()=>other.analytics(alias,'other-user'),e=>e.status===404);
    const go=await fetch(base+'/'+alias,{redirect:'manual'});
    assert.equal(go.status,302);
    const metrics=await fetch(base+'/api/v1/links/'+alias+'/analytics',{headers});
    assert.equal((await metrics.json()).clicks,1);
    const revoke=await fetch(base+'/api/v1/links/'+alias,{method:'DELETE',headers});
    assert.equal(revoke.status,204);
    assert.equal((await fetch(base+'/'+alias,{redirect:'manual'})).status,410);
    const expiredAlias='t'+Math.random().toString(36).slice(2,10);
    await pool.query('INSERT INTO short_links(code,owner_sub,destination,expires_at) VALUES($1,$2,$3,NOW() - INTERVAL \'1 second\')',[expiredAlias,'local-dev','https://example.org']);
    assert.equal((await fetch(base+'/'+expiredAlias,{redirect:'manual'})).status,410);
  } finally {await new Promise(resolve=>server.close(resolve));await pool.end();}
});
