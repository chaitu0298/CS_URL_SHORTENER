/**
 * Governed SDLC execution engine. Does not deploy, run arbitrary user commands,
 * or modify the live repository. All engineering changes go to isolated run workspaces.
 * Recipes are intentionally bounded for a reproducible interview demonstration.
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
const execFileAsync=promisify(execFile);
import {performance} from 'node:perf_hooks';
import {advisoryReview} from './requirements-ai.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const BACKEND = path.resolve(HERE,'..');
const sha = x => crypto.createHash('sha256').update(x).digest('hex');
const time = () => new Date().toISOString();
const write = (p,s) => {fs.mkdirSync(path.dirname(p),{recursive:true});fs.writeFileSync(p,s);};
const json = x => JSON.stringify(x,null,2)+'\n';
const load = p => JSON.parse(fs.readFileSync(p,'utf8'));
const SCENARIOS={
  greenfield:{label:'Bulk revoke API (greenfield)',defaultRequirement:'Add an authenticated bulk revoke API so an owner can revoke multiple short links in one request.',files:['src/server.mjs','src/postgres-store.mjs'],risk:'medium'},
  brownfield:{label:'Impersonation alias prevention (brownfield)',defaultRequirement:'Reject misleading support-desk and security-team aliases while keeping existing URLs working.',files:['src/postgres-store.mjs'],risk:'high'},
  ambiguous:{label:'Default link expiry (ambiguous)',defaultRequirement:'Make shortened URLs expire quickly by default.',files:['src/postgres-store.mjs'],risk:'medium'}
};
const NODE_STAGES={
  intake:[],impact:['intake'],architecture:['intake'],security_design:['intake'],test_plan:['intake'],
  design_approval:['impact','architecture','security_design','test_plan'],
  implementation:['design_approval'],test_generation:['design_approval'],
  qa:['implementation','test_generation'],security_validation:['implementation'],
  docs:['qa','security_validation'],release_assessment:['docs'],
  release_approval:['release_assessment'],summary:['release_approval']
};
const GATES=['design_approval','release_approval'];
const FINAL=['COMPLETE','SAFE_STOP','CANCELLED'];
const hashAudit = x => sha(JSON.stringify(x));
const safeId = id => {if(!/^[0-9a-f-]{36}$/.test(id)) throw Error('Invalid run id');return id;};
const recordNode = (id,deps) => ({id,dependsOn:deps,status:'PENDING',attempts:0,elapsedMs:0,digest:null,artifact:null,error:null});
const initialNodes = kind => {
  const graph={...NODE_STAGES};
  if(kind==='brownfield'){
    graph.abuse_policy=['intake'];graph.design_approval=[...graph.design_approval,'abuse_policy'];
  }
  return Object.fromEntries(Object.entries(graph).map(([id,deps])=>[id,recordNode(id,deps)]));
};
function replaceExact(source,oldText,newText) {
  if(!source.includes(oldText))throw Error(`Expected code anchor not found: ${oldText.slice(0,55)}`);
  return source.replace(oldText,newText);
}
function patchWorkspace(kind,src,ttlHours) {
  if(kind==='brownfield') {
    src['src/postgres-store.mjs']=replaceExact(src['src/postgres-store.mjs'],
      "'health','ready','api','favicon','robots','metrics','admin'",
      "'health','ready','api','favicon','robots','metrics','admin','support-desk','security-team'");
  }
  if(kind==='ambiguous') {
    src['src/postgres-store.mjs']=replaceExact(src['src/postgres-store.mjs'],
      'const DEFAULT_TTL_MS = 30 * 86400_000;',`const DEFAULT_TTL_MS = ${ttlHours} * 3600_000;`);
  }
  if(kind==='greenfield') {
    src['src/postgres-store.mjs']=replaceExact(src['src/postgres-store.mjs'],
      '  async revoke(code,owner) {',
      `  async bulkRevoke(codes, owner) {\n    if (!Array.isArray(codes) || codes.length < 1 || codes.length > 50 ||\n        new Set(codes).size !== codes.length ||\n        codes.some(code => typeof code !== 'string' || !/^[A-Za-z0-9_-]{4,32}$/.test(code)))\n      throw new ApiError(400, 'Provide 1-50 distinct valid codes');\n    if (typeof owner !== 'string' || !owner) throw new ApiError(401, 'Owner required');\n    const result = await this.pool.query(\n      'UPDATE short_links SET revoked_at=COALESCE(revoked_at,NOW()) WHERE code = ANY($1::text[]) AND owner_sub=$2 RETURNING code',\n      [codes, owner]);\n    return {revoked:result.rows.map(row => row.code), count:result.rowCount};\n  }\n  async revoke(code,owner) {`);
    src['src/server.mjs']=replaceExact(src['src/server.mjs'],
      "      if(req.method==='POST'&&u.pathname==='/api/v1/links') {",
      `      if(req.method==='POST'&&u.pathname==='/api/v1/links/bulk-revoke') {\n        let body='', bytes=0;\n        for await(const part of req) {bytes+=part.length;if(bytes>8192)throw new ApiError(413,'Payload too large');body+=part.toString();}\n        let payload;try{payload=JSON.parse(body);}catch{throw new ApiError(400,'Malformed JSON');}\n        return respond(res,200,await store.bulkRevoke(payload.codes,owner),origin);\n      }\n      if(req.method==='POST'&&u.pathname==='/api/v1/links') {`);
  }
  return src;
}
function generatedTests(kind,ttlHours) {
  const header=`import test from 'node:test';\nimport assert from 'node:assert/strict';\nimport {validateCreate,PgLinkStore} from '../src/postgres-store.mjs';\n`;
  if(kind==='brownfield')return header+`
test('reserved impersonation aliases rejected but good alias accepted',()=>{\n  assert.throws(()=>validateCreate({url:'https://example.com',alias:'support-desk'}),e=>e.status===400);\n  assert.throws(()=>validateCreate({url:'https://example.com',alias:'security-team'}),e=>e.status===400);\n  assert.equal(validateCreate({url:'https://example.com',alias:'release-notes'}).alias,'release-notes');\n});\n`;
  if(kind==='ambiguous')return header+`
test('clarified default expiry is exact UTC duration',()=>{\n  const t=Date.parse('2026-10-01T10:00:00.000Z');\n  const value=validateCreate({url:'https://example.com'},t);\n  assert.equal(Date.parse(value.expiresAt)-t,${ttlHours}*3600000);\n  assert.equal(Date.parse(validateCreate({url:'https://example.com',ttlHours:2},t).expiresAt)-t,7200000);\n});\n`;
  return header+`
import {createServer} from '../src/server.mjs';\n
test('bulk revoke enforces owner-scoped SQL, rejects duplicates',async()=>{\n  const calls=[];const pool={query:async(sql,args)=>{calls.push({sql,args});return {rowCount:1,rows:[{code:'safe-link'}]};}};\n  const store=new PgLinkStore(pool);\n  const result=await store.bulkRevoke(['safe-link'],'owner-A');\n  assert.deepEqual(result,{revoked:['safe-link'],count:1});\n  assert.match(calls[0].sql,/owner_sub=\\$2/);\n  assert.deepEqual(calls[0].args,[['safe-link'],'owner-A']);\n  await assert.rejects(()=>store.bulkRevoke(['same','same'],'owner-A'),e=>e.status===400);\n});\n
test('bulk revoke HTTP route requires authentication and returns results',async()=>{\n  const calls=[];const server=createServer({apiKey:'test-key',bulkRevoke:async(codes,owner)=>{calls.push({codes,owner});return {revoked:codes,count:codes.length};}}, {authMode:'apikey',corsOrigins:'http://localhost:5173'});\n  await new Promise(r=>server.listen(0,'127.0.0.1',r));\n  try {\n    const url='http://127.0.0.1:'+server.address().port+'/api/v1/links/bulk-revoke';\n    let res=await fetch(url,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({codes:['safe-link']})});\n    assert.equal(res.status,401);\n    res=await fetch(url,{method:'POST',headers:{'content-type':'application/json','x-api-key':'test-key'},body:JSON.stringify({codes:['safe-link']})});\n    assert.equal(res.status,200);\n    assert.deepEqual(calls,[{codes:['safe-link'],owner:'local-dev'}]);\n  } finally {await new Promise(r=>server.close(r));}\n});\n`;
}

export class SdlcEngine {
  constructor({root=path.join(BACKEND,'.sdlc-runs'),sourceRoot=BACKEND}={}) {
    this.root=path.resolve(root);this.sourceRoot=path.resolve(sourceRoot);fs.mkdirSync(this.root,{recursive:true});
  }
  dir(id){return path.join(this.root,safeId(id));}
  statePath(id){return path.join(this.dir(id),'run.json');}
  get(id){return load(this.statePath(id));}
  persist(run){run.updatedAt=time();write(this.statePath(run.id),json(run));}
  event(run,name,details={}){
    const fp=path.join(this.dir(run.id),'audit.jsonl');let prev='0'.repeat(64);
    if(fs.existsSync(fp)){const rows=fs.readFileSync(fp,'utf8').trim().split('\n');if(rows[0])prev=JSON.parse(rows.at(-1)).hash;}
    const payload={at:time(),revision:run.revision,action:name,details,previous:prev};
    fs.appendFileSync(fp,JSON.stringify({...payload,hash:hashAudit(payload)})+'\n');
  }
  verify(id){const fp=path.join(this.dir(id),'audit.jsonl');if(!fs.existsSync(fp))return false;
    let prev='0'.repeat(64);
    try{for(const line of fs.readFileSync(fp,'utf8').trim().split('\n')){
      const {hash,...body}=JSON.parse(line);if(body.previous!==prev||hash!==hashAudit(body))return false;prev=hash;
    }}catch{return false;}return true;}
  list(){return fs.readdirSync(this.root).filter(x=>/^[0-9a-f-]{36}$/.test(x)&&fs.existsSync(this.statePath(x))).map(x=>this.get(x)).sort((a,b)=>b.createdAt.localeCompare(a.createdAt));}
  create(scenario,{requirement,ttlHours=null,injectQaFailureOnce=false,injectQaFailureAlways=false}={}) {
    if(!SCENARIOS[scenario])throw Error('Supported scenarios: greenfield, brownfield, ambiguous');
    if(requirement!=null && (typeof requirement!=='string'||requirement.length>3000||!requirement.trim()))throw Error('Invalid requirement');
    if(requirement && !(scenario==='greenfield'?/bulk.*revok|revok.*bulk/i:scenario==='brownfield'?/alias|impersonat|reserved/i:/expir|ttl/i).test(requirement))throw Error('This bounded scenario cannot safely implement the supplied requirement; choose a matching example or extend the change recipe before running');
    const id=crypto.randomUUID(), spec=SCENARIOS[scenario];
    const run={id,scenario,requirement:requirement||spec.defaultRequirement,ttlHours,revision:1,createdAt:time(),updatedAt:time(),status:'ACTIVE',reason:null,risk:spec.risk,nodes:initialNodes(scenario),approvals:{},decisions:[],fault:{once:!!injectQaFailureOnce,always:!!injectQaFailureAlways,used:false},counters:{retryAttempts:0,rollbackCount:0,failures:0,recoveries:[],startedAt:time()},releaseDeployed:false};
    this.persist(run);this.event(run,'RUN_CREATED',{scenario,requirement:run.requirement});return run;
  }
  artifact(run,id,data,ext='json'){
    const dest=path.join(this.dir(run.id),'artifacts',`${id}.${ext}`),contents=ext==='json'?json(data):data;
    write(dest,contents);return {artifact:path.relative(this.dir(run.id),dest),digest:sha(contents)};
  }
  verifyDeps(run,node) {for(const dep of node.dependsOn){const d=run.nodes[dep];if(d.status!=='COMPLETE')throw Error(`Dependency not complete: ${dep}`);
    if(d.artifact){const f=path.join(this.dir(run.id),d.artifact);if(!fs.existsSync(f)||sha(fs.readFileSync(f))!==d.digest)throw Error(`Evidence integrity mismatch: ${dep}`);}}
  }
  async act(run,node){
    const spec=SCENARIOS[run.scenario],id=node.id,work=path.join(this.dir(run.id),'workspace');
    if(id==='intake'){
      if(run.scenario==='ambiguous'&&(!Number.isInteger(run.ttlHours)||run.ttlHours<1||run.ttlHours>8760))return {wait:'WAITING_INPUT',reason:'Specify exact default expiration in hours (1–8760).'};
      const ai=await advisoryReview({requirement:run.requirement,scenario:run.scenario,changedFiles:spec.files});
      return this.artifact(run,id,{aiAdvisory:ai,requirement:run.requirement,scenario:run.scenario,revision:run.revision,acceptanceCriteria:run.scenario==='greenfield'?['POST bulk revoke requires Cognito/auth and validates 1–50 unique codes','Only links owned by the caller can be revoked','Other users’ links remain unchanged']:run.scenario==='brownfield'?['Reject support-desk and security-team aliases','Other valid aliases continue to work']:['Default expiration is exactly '+run.ttlHours+' hours in UTC','Caller-provided expiration remains authoritative'],assumptions:['No autonomous deployment','Changes restricted to documented repository files'],unresolved:[]});
    }
    if(id==='impact'){
      const files=spec.files.map(name=>({file:name,sha256:sha(fs.readFileSync(path.join(this.sourceRoot,name))),exists:true}));
      return this.artifact(run,id,{kind:'codebase impact',files,flow:'HTTP /api/v1/links → server.mjs → postgres-store.mjs → PostgreSQL',deployment:'No deployment performed'});
    }
    if(id==='architecture')return this.artifact(run,id,`# Architecture / change design\n\nScenario: ${run.scenario}\nRisk: ${spec.risk}\nTouched modules: ${spec.files.join(', ')}\n\nChanges are prepared in an isolated workspace, validated with executable tests, then submitted to two human approval gates. Production infrastructure and credentials are never accessed by this runner.\n`,'md');
    if(id==='security_design')return this.artifact(run,id,{risks:['Unsafe redirects and URL abuse','Unauthorized code modification','Auth bypass','Tampered audit history'],controls:['Restricted file allowlist','Owner-scoped SQL','Approval bound to revision and evidence digests','No arbitrary shell commands from requirements','No deploy credentials in runner'],riskLevel:spec.risk});
    if(id==='abuse_policy')return this.artifact(run,id,{flagged:true,reason:'Alias impersonation protection changes public abuse controls',requiredHumanReview:'design approval'});
    if(id==='test_plan')return this.artifact(run,id,{targets:spec.files,command:'node --test test/generated.test.mjs',checks:['scenario acceptance','negative/security paths','regression of existing API boundaries'],postgresql:'additional live integration verification required prior to production release'});
    if(GATES.includes(id)){
      const p=run.approvals[id];const digest=sha(node.dependsOn.map(x=>run.nodes[x].digest).join(':'));
      if(!p||p.revision!==run.revision||p.depDigest!==digest)return {wait:'WAITING_APPROVAL',reason:`Human approval required: ${id}`};
      return this.artifact(run,id,p);
    }
    if(id==='implementation'){
      const sources={};for(const f of [...new Set([...spec.files,'src/shortener.mjs'])])sources[f]=fs.readFileSync(path.join(this.sourceRoot,f),'utf8');
      patchWorkspace(run.scenario,sources,run.ttlHours);
      for(const [file,contents] of Object.entries(sources))write(path.join(work,file),contents);
      if(!sources['src/server.mjs'])write(path.join(work,'src/server.mjs'),fs.readFileSync(path.join(this.sourceRoot,'src/server.mjs'),'utf8'));
      write(path.join(work,'package.json'),json({type:'module',private:true}));
      return this.artifact(run,id,{changedFiles:spec.files,sourceDigests:Object.fromEntries(spec.files.map(f=>[f,sha(fs.readFileSync(path.join(work,f)))])),repoUnchanged:true,productionDeployment:false});
    }
    if(id==='test_generation'){
      write(path.join(work,'test/generated.test.mjs'),generatedTests(run.scenario,run.ttlHours));
      return this.artifact(run,id,{generated:'workspace/test/generated.test.mjs',scenario:run.scenario,assertions:run.scenario==='greenfield'?2:1});
    }
    if(id==='qa'){
      if(run.fault.always)throw Error('Injected permanent QA failure');
      if(run.fault.once&&!run.fault.used){run.fault.used=true;throw Error('Injected recoverable QA failure');}
      const childEnv={...process.env};delete childEnv.NODE_TEST_CONTEXT;
      const {stdout:output}=await execFileAsync(process.execPath,['--test','test/generated.test.mjs'],{cwd:work,timeout:30000,encoding:'utf8',env:childEnv,maxBuffer:1024*1024});
      if(!/# fail 0\b/.test(output))throw Error('Test runner output does not certify zero failures');
      write(path.join(this.dir(run.id),'artifacts','qa.log'),output);
      const passed=Number(output.match(/# pass (\d+)/)?.[1]||0);
      return this.artifact(run,id,{passed,failed:0,log:'artifacts/qa.log',command:'node --test test/generated.test.mjs'});
    }
    if(id==='security_validation'){
      const contents=spec.files.map(f=>fs.readFileSync(path.join(work,f),'utf8')).join('\n');
      if(/\beval\s*\(|\bnew Function\s*\(/.test(contents))throw Error('Unsafe dynamic code execution found');
      if(run.scenario==='greenfield'&&!contents.includes('owner_sub=$2'))throw Error('Missing owner scoping');
      return this.artifact(run,id,{passed:true,checks:['No dynamic eval','Restricted patch paths','No deployment','Owner-scoped access checked for bulk route'],limitation:'Static guardrails do not replace SAST or DAST'});
    }
    if(id==='docs')return this.artifact(run,id,`# Proposed change\n\n${spec.label}\n\nRequirement: ${run.requirement}\n\nChanged files: ${spec.files.join(', ')}\n\nTest: \`node --test test/generated.test.mjs\` from the run workspace.\n\nThis is a reviewable proposal, NOT deployed code. Verify PostgreSQL integration and production readiness before merging.\n`,'md');
    if(id==='release_assessment'){
      return this.artifact(run,id,{decision:'REVIEW_REQUIRED',unitTests:'passed',staticSecurity:'passed',productionDeployment:false,limitations:['No live PostgreSQL integration in generated workspace','No CI build or ECS deployment performed','Review source diff before applying'],requiredActions:['Review patch','Run backend full tests','Run DB integration and security checks','Approve separately before deploying']});
    }
    if(id==='summary')return this.artifact(run,id,{outcome:'Approved engineering proposal, NOT deployed',scenario:run.scenario,revision:run.revision,artifacts:['workspace/src','workspace/test/generated.test.mjs','artifacts/qa.log'],metrics:this.metrics(run),risks:['Production deployment requires separate human change approval'],approvalIds:Object.keys(run.approvals)});
    throw Error('Unsupported agent node '+id);
  }
  async advance(id){
    const run=this.get(id);
    if(!this.verify(id)){run.status='SAFE_STOP';run.reason='Audit hash chain invalid';this.persist(run);return run;}
    if(FINAL.includes(run.status))return run;
    run.status='ACTIVE';run.reason=null;
    for(let stage=0;stage<25;stage++){
      const ready=Object.values(run.nodes).filter(n=>n.status==='PENDING'&&n.dependsOn.every(x=>run.nodes[x]?.status==='COMPLETE'));
      if(!ready.length)break;
      // Ready DAG nodes execute concurrently in each wave, then synchronize.
      const outcomes=await Promise.all(ready.map(async node=>{
        const start=performance.now();try{
          this.verifyDeps(run,node);let result;let failedAt=null;for(let attempt=0;attempt<(node.id==='qa'?2:1);attempt++){
            node.attempts++;try{result=await this.act(run,node);break;}
            catch(err){if(node.id==='qa'&&attempt===0){run.counters.retryAttempts++;failedAt=performance.now();this.event(run,'RETRY',{node:node.id,error:err.message});continue;}throw err;}
          }
          return {node,result,duration:Math.round(performance.now()-start),recoveryDuration:failedAt==null?null:Math.round(performance.now()-failedAt)};
        }catch(error){return {node,error,duration:Math.round(performance.now()-start)};}
      }));
      for(const {node,result,error,duration,recoveryDuration} of outcomes){node.elapsedMs+=duration;
        if(error){node.status='FAILED';node.error=error.message;run.counters.failures++;run.status='SAFE_STOP';run.reason=`${node.id}: ${error.message}`;this.event(run,'FAILED',{node:node.id,error:error.message});continue;}
        if(result?.wait){run.status=result.wait;run.reason=result.reason;this.event(run,'GATE_BLOCKED',{node:node.id,reason:result.reason});continue;}
        node.status='COMPLETE';node.artifact=result.artifact;node.digest=result.digest;this.event(run,'NODE_COMPLETE',{node:node.id,attempts:node.attempts,artifact:result.artifact,digest:result.digest,elapsedMs:duration});
        if(node.id==='qa'&&node.attempts>1){run.counters.recoveries.push({node:'qa',durationMs:recoveryDuration});this.event(run,'RECOVERY',{node:'qa',ms:recoveryDuration});}
      }
      if(run.status==='SAFE_STOP'){
        const work=path.join(this.dir(id),'workspace');if(fs.existsSync(work)){fs.rmSync(work,{recursive:true,force:true});run.counters.rollbackCount++;this.event(run,'WORKSPACE_ROLLBACK',{path:'workspace'});}
      }
      this.persist(run);
      if(run.status!=='ACTIVE')return run;
    }
    if(run.nodes.summary.status==='COMPLETE'){run.status='COMPLETE';this.event(run,'RUN_COMPLETE',this.metrics(run));}
    this.persist(run);return run;
  }
  approve(id,gate,actor,reason){
    const run=this.get(id);if(!this.verify(id))throw Error('Audit integrity error');
    if(!GATES.includes(gate)||run.status!=='WAITING_APPROVAL'||!run.nodes[gate]||run.nodes[gate].status!=='PENDING'||!run.nodes[gate].dependsOn.every(x=>run.nodes[x].status==='COMPLETE'))throw Error('Gate not ready for human approval');
    if(typeof actor!=='string'||!actor||!reason?.trim()||reason.length>1000)throw Error('Reviewer identity and reason required');
    const depDigest=sha(run.nodes[gate].dependsOn.map(x=>run.nodes[x].digest).join(':'));
    run.approvals[gate]={gate,actor,reason,revision:run.revision,depDigest,approvedAt:time()};
    run.decisions.push({kind:'APPROVAL',gate,actor,revision:run.revision});this.event(run,'APPROVED',{gate,actor,revision:run.revision,depDigest});this.persist(run);return run;
  }
  answer(id,hours,actor){const run=this.get(id);if(run.scenario!=='ambiguous'||run.status!=='WAITING_INPUT'||!Number.isInteger(hours)||hours<1||hours>8760)throw Error('Clarification requires exact hours (1–8760)');return this.revise(id,{requirement:run.requirement,ttlHours:hours},actor);}
  revise(id,change,actor){const run=this.get(id);if(!this.verify(id))throw Error('Audit chain invalid');if(!actor||FINAL.includes(run.status))throw Error('Cannot revise terminal run');
    const requirement=change.requirement??run.requirement,ttlHours=change.ttlHours===undefined?run.ttlHours:change.ttlHours;
    if(typeof requirement!=='string'||!requirement.trim()||requirement.length>3000)throw Error('Invalid requirement');
    if(run.scenario==='ambiguous'&&ttlHours!=null&&(!Number.isInteger(ttlHours)||ttlHours<1||ttlHours>8760))throw Error('Invalid hours');
    write(path.join(this.dir(id),'history',`revision-${run.revision}.json`),json(run));
    for(const name of ['workspace','artifacts'])fs.rmSync(path.join(this.dir(id),name),{recursive:true,force:true});
    run.revision++;run.requirement=requirement;run.ttlHours=ttlHours;run.nodes=initialNodes(run.scenario);run.approvals={};run.status='ACTIVE';run.reason=null;
    run.decisions.push({kind:'REVISED',actor,revision:run.revision});this.event(run,'REVISED',{actor,revision:run.revision,invalidated:'all requirement descendants and previous signoffs'});this.persist(run);return run;
  }
  cancel(id,actor){const run=this.get(id);if(!actor)throw Error('Reviewer required');if(FINAL.includes(run.status))throw Error('Run already terminal');run.status='CANCELLED';run.reason=`Stopped by ${actor}`;this.event(run,'CANCELLED',{actor});this.persist(run);return run;}
  metrics(run){const nodes=Object.values(run.nodes),terminal=FINAL.includes(run.status);return {progressPercent:Math.round(nodes.filter(x=>x.status==='COMPLETE').length/nodes.length*100),runSucceeded:run.status==='COMPLETE',runTerminal:terminal,retryAttempts:run.counters.retryAttempts,rollbackCount:run.counters.rollbackCount,meanTimeToRecoveryMs:run.counters.recoveries.length?Math.round(run.counters.recoveries.reduce((n,r)=>n+r.durationMs,0)/run.counters.recoveries.length):null,endToEndLatencyMs:Date.parse(run.updatedAt)-Date.parse(run.createdAt),approvalCount:Object.keys(run.approvals).length};}
  aggregate(){const all=this.list(),terminal=all.filter(x=>FINAL.includes(x.status)),success=terminal.filter(x=>x.status==='COMPLETE');return {runs:all.length,terminalRuns:terminal.length,successRate:terminal.length?success.length/terminal.length:null,totalRetries:all.reduce((a,r)=>a+r.counters.retryAttempts,0),runsRolledBack:all.filter(r=>r.counters.rollbackCount).length,averageEndToEndMs:terminal.length?Math.round(terminal.reduce((a,r)=>a+Date.parse(r.updatedAt)-Date.parse(r.createdAt),0)/terminal.length):null};}
  evidence(id){const run=this.get(id),base=this.dir(id);return {run,metrics:this.metrics(run),verified:this.verify(id),artifacts:Object.values(run.nodes).filter(n=>n.artifact).map(n=>({node:n.id,file:n.artifact,sha256:n.digest})),audit:fs.readFileSync(path.join(base,'audit.jsonl'),'utf8').trim().split('\n').map(JSON.parse)};}
  preview(id,file){const run=this.get(id);if(!SCENARIOS[run.scenario].files.includes(file))throw Error('Only approved source files may be viewed');
    const dest=path.join(this.dir(id),'workspace',file);if(!fs.existsSync(dest))throw Error('No generated code available');
    return {file,before:fs.readFileSync(path.join(this.sourceRoot,file),'utf8'),after:fs.readFileSync(dest,'utf8')};}
}
export {SCENARIOS};
