import test from 'node:test';
import assert from 'node:assert/strict';
import {validateCreate,PgLinkStore} from '../src/postgres-store.mjs';

import {createServer} from '../src/server.mjs';

test('bulk revoke enforces owner-scoped SQL, rejects duplicates',async()=>{
  const calls=[];const pool={query:async(sql,args)=>{calls.push({sql,args});return {rowCount:1,rows:[{code:'safe-link'}]};}};
  const store=new PgLinkStore(pool);
  const result=await store.bulkRevoke(['safe-link'],'owner-A');
  assert.deepEqual(result,{revoked:['safe-link'],count:1});
  assert.match(calls[0].sql,/owner_sub=\$2/);
  assert.deepEqual(calls[0].args,[['safe-link'],'owner-A']);
  await assert.rejects(()=>store.bulkRevoke(['same','same'],'owner-A'),e=>e.status===400);
});

test('bulk revoke HTTP route requires authentication and returns results',async()=>{
  const calls=[];const server=createServer({apiKey:'test-key',bulkRevoke:async(codes,owner)=>{calls.push({codes,owner});return {revoked:codes,count:codes.length};}}, {authMode:'apikey',corsOrigins:'http://localhost:5173'});
  await new Promise(r=>server.listen(0,'127.0.0.1',r));
  try {
    const url='http://127.0.0.1:'+server.address().port+'/api/v1/links/bulk-revoke';
    let res=await fetch(url,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({codes:['safe-link']})});
    assert.equal(res.status,401);
    res=await fetch(url,{method:'POST',headers:{'content-type':'application/json','x-api-key':'test-key'},body:JSON.stringify({codes:['safe-link']})});
    assert.equal(res.status,200);
    assert.deepEqual(calls,[{codes:['safe-link'],owner:'local-dev'}]);
  } finally {await new Promise(r=>server.close(r));}
});
