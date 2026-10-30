import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {SdlcEngine} from '../sdlc/engine.mjs';
import {createSdlcApi} from '../sdlc/api.mjs';

function fixture(){const root=fs.mkdtempSync(path.join(os.tmpdir(),'governed-sdlc-'));return {engine:new SdlcEngine({root}),cleanup:()=>fs.rmSync(root,{recursive:true,force:true})};}
async function passDesign(engine,run){run=engine.approve(run.id,'design_approval','reviewer-sub','Reviewed architecture, risks and tests');return engine.advance(run.id);}

test('greenfield creates code against current postgres modules with bounded retry and two gates',async()=>{
 const {engine,cleanup}=fixture();try{
  let run=await engine.advance(engine.create('greenfield',{injectQaFailureOnce:true}).id);
  assert.equal(run.status,'WAITING_APPROVAL');
  assert.equal(run.nodes.impact.status,'COMPLETE');
  run=await passDesign(engine,run);
  assert.equal(run.status,'WAITING_APPROVAL');assert.equal(run.counters.retryAttempts,1);
  assert.match(engine.preview(run.id,'src/postgres-store.mjs').after,/async bulkRevoke/);
  assert.match(engine.preview(run.id,'src/server.mjs').after,/bulk-revoke/);
  assert.equal(JSON.parse(fs.readFileSync(path.join(engine.dir(run.id),'artifacts/qa.json'))).failed,0);
  run=engine.approve(run.id,'release_approval','reviewer-sub','Reviewed tests and source patch');run=await engine.advance(run.id);
  assert.equal(run.status,'COMPLETE');assert.equal(engine.verify(run.id),true);assert.equal(engine.metrics(run).approvalCount,2);
 }finally{cleanup();}
});

test('brownfield generated patch blocks reserved aliases, preserves normal behavior',async()=>{
 const {engine,cleanup}=fixture();try{let run=await engine.advance(engine.create('brownfield').id);assert.ok(run.nodes.abuse_policy);run=await passDesign(engine,run);assert.equal(run.status,'WAITING_APPROVAL');assert.match(engine.preview(run.id,'src/postgres-store.mjs').after,/support-desk/);run=engine.approve(run.id,'release_approval','reviewer-sub','reviewed');run=await engine.advance(run.id);assert.equal(run.status,'COMPLETE');}finally{cleanup();}
});

test('ambiguous request blocks implementation until specified hours, invalidates signoffs',async()=>{
 const {engine,cleanup}=fixture();try{let run=await engine.advance(engine.create('ambiguous').id);assert.equal(run.status,'WAITING_INPUT');assert.equal(run.nodes.implementation.status,'PENDING');run=engine.answer(run.id,48,'owner-sub');assert.equal(run.revision,2);run=await engine.advance(run.id);run=await passDesign(engine,run);assert.equal(run.status,'WAITING_APPROVAL');assert.match(engine.preview(run.id,'src/postgres-store.mjs').after,/DEFAULT_TTL_MS = 48 \* 3600_000/);run=engine.revise(run.id,{ttlHours:72},'owner-sub');assert.equal(run.revision,3);assert.deepEqual(run.approvals,{});assert.equal(run.nodes.implementation.status,'PENDING');assert.equal(engine.verify(run.id),true);}finally{cleanup();}
});

test('permanent QA fault safe stops and rolls back proposal, never deployment',async()=>{
 const {engine,cleanup}=fixture();try{let run=await engine.advance(engine.create('greenfield',{injectQaFailureAlways:true}).id);run=await passDesign(engine,run);assert.equal(run.status,'SAFE_STOP');assert.equal(run.counters.retryAttempts,1);assert.equal(run.counters.rollbackCount,1);assert.equal(fs.existsSync(path.join(engine.dir(run.id),'workspace')),false);assert.equal(run.releaseDeployed,false);}finally{cleanup();}
});

test('append-only audit checksum detects tamper and blocks advancement',async()=>{
 const {engine,cleanup}=fixture();try{let run=await engine.advance(engine.create('greenfield').id);fs.appendFileSync(path.join(engine.dir(run.id),'audit.jsonl'),'{"tamper":true}\n');assert.equal(engine.verify(run.id),false);run=await engine.advance(run.id);assert.equal(run.status,'SAFE_STOP');}finally{cleanup();}
});

test('restricted runner API verifies bearer identity, allows actual reviewer and blocks unauthorized',async()=>{
 const {engine,cleanup}=fixture();let srv;
 try{
  srv=createSdlcApi(engine,{authenticate:async req=>{if(req.headers.authorization!=='Bearer valid')throw Object.assign(Error('Denied'),{status:403});return 'cognito-admin-sub';}});
  await new Promise(r=>srv.listen(0,'127.0.0.1',r));const root=`http://127.0.0.1:${srv.address().port}`;
  let response=await fetch(root+'/sdlc/runs');assert.equal(response.status,403);
  response=await fetch(root+'/sdlc/runs',{headers:{Authorization:'Bearer valid',Origin:'https://untrusted.com'}});assert.equal(response.status,403);
  response=await fetch(root+'/sdlc/runs',{method:'POST',headers:{Authorization:'Bearer valid','content-type':'application/json'},body:JSON.stringify({scenario:'greenfield'})});assert.equal(response.status,201);const run=await response.json();
  response=await fetch(root+`/sdlc/runs/${run.id}/advance`,{method:'POST',headers:{Authorization:'Bearer valid'}});assert.equal((await response.json()).status,'WAITING_APPROVAL');
  response=await fetch(root+`/sdlc/runs/${run.id}/approve`,{method:'POST',headers:{Authorization:'Bearer valid','content-type':'application/json'},body:JSON.stringify({gate:'design_approval',reason:'Reviewed'})});assert.equal((await response.json()).approvals.design_approval.actor,'cognito-admin-sub');
 }finally{if(srv)await new Promise(r=>srv.close(r));cleanup();}
});

test('bounded recipe rejects unrelated custom requirement rather than pretending to implement it',()=>{
 const {engine,cleanup}=fixture();try{assert.throws(()=>engine.create('greenfield',{requirement:'Add a payroll processing system'}),/bounded scenario/);}finally{cleanup();}
});

test('optional LLM advisory is opt-in, schema validated and never invokes tools',async()=>{
 const {advisoryReview}=await import('../sdlc/requirements-ai.mjs');
 let calls=0;const fetcher=async (_url,opts)=>{calls++;const body=JSON.parse(opts.body);assert.equal(body.store,false);return {ok:true,json:async()=>({output:[{content:[{type:'output_text',text:JSON.stringify({ambiguities:['TTL unspecified'],acceptanceCriteria:['Define default expiry'],riskFlags:['Policy change']})}]}]})};};
 assert.equal(await advisoryReview({requirement:'expire quickly',scenario:'ambiguous',changedFiles:[]},{apiKey:'test',model:'example-model',fetcher,enabled:false}),null);
 const result=await advisoryReview({requirement:'expire quickly',scenario:'ambiguous',changedFiles:[]},{apiKey:'test',model:'example-model',fetcher,enabled:true});
 assert.equal(calls,1);assert.equal(result.advisory,true);assert.deepEqual(result.ambiguities,['TTL unspecified']);
});
