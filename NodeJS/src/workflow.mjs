import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {execFileSync} from 'node:child_process';

const PROJECT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const sha = value => crypto.createHash('sha256').update(value).digest('hex');
const now = () => new Date().toISOString();
const put = (file, content) => {fs.mkdirSync(path.dirname(file),{recursive:true});fs.writeFileSync(file,content);};
const json = value => JSON.stringify(value,null,2);
const read = file => JSON.parse(fs.readFileSync(file,'utf8'));
function save(file, obj) {
  const tmp = `${file}.${process.pid}.tmp`; put(tmp,json(obj));fs.renameSync(tmp,file);
}
function workflowNodes(ambiguous=false, risky=false) {
  const nodes = {
    intake: [], impact: ['intake'], architecture:['intake'], threat_model:['intake'], test_plan:['intake'],
    design_approval:['impact','architecture','threat_model','test_plan',...(risky ? ['abuse_review']:[])],
    implement:['design_approval'], generate_tests:['design_approval'],
    qa:['implement','generate_tests'], security:['implement'], docs:['qa'],
    release_assessment:['docs','security'], release_approval:['release_assessment'], summary:['release_approval']
  };
  if (risky) nodes.abuse_review=['intake'];
  return Object.fromEntries(Object.entries(nodes).map(([id,deps]) => [id,{id,deps,status:'PENDING',attempts:0,ms:0,artifact:null,digest:null}]));
}
const gates = new Set(['design_approval','release_approval']);
const retryable = new Set(['qa']);

export class WorkflowEngine {
  constructor(root=path.join(PROJECT,'runs')) {this.root=path.resolve(root); fs.mkdirSync(this.root,{recursive:true});}
  dir(id) {if (!/^[a-f0-9-]{36}$/.test(id)) throw Error('Invalid run identifier');return path.join(this.root,id);}
  file(id) {return path.join(this.dir(id),'run.json');}
  auditPath(id) {return path.join(this.dir(id),'audit.jsonl');}
  get(id) {return read(this.file(id));}
  audit(run,event,details={}) {
    const file=this.auditPath(run.id);
    let previous='0'.repeat(64);
    if (fs.existsSync(file)) {
      const lines=fs.readFileSync(file,'utf8').trim().split('\n');
      if (lines[0]) previous=JSON.parse(lines.at(-1)).hash;
    }
    const content={at:now(),revision:run.revision,event,details,prev:previous};
    const record={...content,hash:sha(json(content))};
    fs.appendFileSync(file,json(record).replace(/\n/g,'')+'\n');
  }
  verify(id) {
    const file=this.auditPath(id);if (!fs.existsSync(file)) return false;
    let prev='0'.repeat(64);
    for (const line of fs.readFileSync(file,'utf8').split('\n').filter(Boolean)) {
      const {hash,...content}=JSON.parse(line);
      if (content.prev!==prev || sha(json(content))!==hash) return false;
      prev=hash;
    }
    return true;
  }
  create(type, {requirement,ttlHours=null,injectQaFailOnce=false,injectQaFailAlways=false}={}) {
    if (!['greenfield','brownfield','ambiguous'].includes(type)) throw Error('Unknown scenario');
    const id=crypto.randomUUID();
    const desc=requirement ?? {greenfield:'Create URL shortener and analytics APIs',brownfield:'Reject support-desk custom alias without breaking existing links',ambiguous:'Make short links expire quickly by default'}[type];
    const risky=/public.facing|phishing|regulated|abuse controls/i.test(desc);
    const run={id,type,requirement:desc,ttlHours,revision:1,status:'ACTIVE',reason:null,createdAt:now(),updatedAt:now(),approval:{},decisions:[],nodes:workflowNodes(type==='ambiguous',risky),metrics:{retries:0,rollbacks:0,failures:0,recoveries:0,mttrMs:0},fault:{qaOnce:injectQaFailOnce,qaAlways:injectQaFailAlways,used:false}};
    fs.mkdirSync(this.dir(id),{recursive:true});save(this.file(id),run);this.audit(run,'RUN_CREATED',{type,requirement:desc});return run;
  }
  persist(run) {run.updatedAt=now();save(this.file(run.id),run);}
  artifact(run,node,value,extension='json') {
    const file=path.join(this.dir(run.id),'artifacts',`${node}.${extension}`);
    const content=extension==='json' ? json(value) : value;
    put(file,content);
    return {artifact:path.relative(this.dir(run.id),file),digest:sha(content)};
  }
  validateDependencies(run,node) {
    for (const dep of node.deps) {
      const item=run.nodes[dep];
      if (item.status!=='COMPLETE') throw Error(`Dependency ${dep} not complete`);
      if (item.artifact) {
        const location=path.join(this.dir(run.id),item.artifact);
        if (!fs.existsSync(location)||sha(fs.readFileSync(location))!==item.digest) throw Error(`Artifact integrity mismatch for ${dep}`);
      }
    }
  }
  async executeNode(run,node) {
    const dir=this.dir(run.id),work=path.join(dir,'workspace');
    switch(node.id) {
      case 'intake': {
        if (run.type==='ambiguous' && (!Number.isInteger(run.ttlHours)||run.ttlHours<1||run.ttlHours>8760)) {
          return {waiting:'WAITING_INPUT',reason:'Specify a default expiration in hours (1-8760)'};
        }
        return this.artifact(run,node.id,{intent:run.requirement,type:run.type,ttlHours:run.ttlHours,revision:run.revision,assumptions:['local-only prototype','no autonomous deployment']});
      }
      case 'impact':return this.artifact(run,node.id,{modules:['src/shortener.mjs','src/server.mjs','test/service.test.mjs'],change:run.type==='greenfield'?'create new workspace':run.type==='brownfield'?'modify reserved alias policy':'modify default TTL policy',revision:run.revision});
      case 'architecture':return this.artifact(run,node.id,`# Design\nNode.js HTTP API + persisted JSON store. Two human gates with stateful DAG orchestration.\nRevision: ${run.revision}\n`,'md');
      case 'threat_model':return this.artifact(run,node.id,{risks:['URL abuse/phishing','key management','bounded API requests','audit log tampering'],controls:['restricted patch targets','two review checkpoints','HTTP auth','hash-chain audit'],deployment:'prohibited'});
      case 'test_plan':return this.artifact(run,node.id,{checks:['HTTP integration','expiration','idempotency','analytics','security','scenario-specific regression'],command:'node --test test/*.test.mjs'});
      case 'abuse_review':return this.artifact(run,node.id,{decision:'manual abuse and policy review required before design approval',risk:'public-facing or regulated change'});
      case 'design_approval':case 'release_approval': {
        const signature=run.approval[node.id];
        if (!signature || signature.revision!==run.revision) return {waiting:'WAITING_APPROVAL',reason:`Human reviewer must approve ${node.id}`};
        return this.artifact(run,node.id,signature);
      }
      case 'implement': {
        fs.mkdirSync(path.join(work,'src'),{recursive:true});
        fs.copyFileSync(path.join(PROJECT,'src','server.mjs'),path.join(work,'src','server.mjs'));
        const source=fs.readFileSync(path.join(PROJECT,'src','shortener.mjs'),'utf8');
        let modified=source;
        if (run.type==='brownfield') {
          modified=source.replace('new Set([]); // EXTENSION_ALIAS_POLICY',"new Set(['support-desk', 'security-team']); // EXTENSION_ALIAS_POLICY");
        } else if (run.type==='ambiguous') {
          modified=source.replace('DEFAULT_TTL_HOURS = null; // EXTENSION_DEFAULT_TTL',`DEFAULT_TTL_HOURS = ${run.ttlHours}; // EXTENSION_DEFAULT_TTL`);
        }
        if (modified===source && run.type!=='greenfield') throw Error('Patch anchor missing; fail closed');
        put(path.join(work,'src','shortener.mjs'),modified);
        return this.artifact(run,node.id,{changedFiles:['workspace/src/shortener.mjs','workspace/src/server.mjs'],sourceSHA256:sha(modified),snapshot:'original repo unchanged'});
      }
      case 'generate_tests': {
        fs.mkdirSync(path.join(work,'test'),{recursive:true});
        fs.copyFileSync(path.join(PROJECT,'test','service.test.mjs'),path.join(work,'test','service.test.mjs'));
        let assertions="import test from 'node:test';\nimport assert from 'node:assert/strict';\nimport fs from 'node:fs';\nimport os from 'node:os';\nimport path from 'node:path';\nimport {LinkStore} from '../src/shortener.mjs';\n";
        if (run.type==='brownfield') assertions+="test('brownfield: reserved impersonation alias rejected',()=>{ const dir=fs.mkdtempSync(path.join(os.tmpdir(),'agent-')); try {const s=new LinkStore(path.join(dir,'links.json'));assert.throws(()=>s.create({url:'https://example.org',alias:'support-desk'}),e=>e.status===400);assert.equal(s.create({url:'https://example.org',alias:'healthy-link'}).code,'healthy-link');}finally{fs.rmSync(dir,{recursive:true,force:true});}});\n";
        else if (run.type==='ambiguous') assertions+=`test('ambiguous: default expires in resolved hours',()=>{const dir=fs.mkdtempSync(path.join(os.tmpdir(),'agent-')); try {const s=new LinkStore(path.join(dir,'links.json'),{clock:()=>Date.parse('2026-01-01T00:00:00Z')});const link=s.create({url:'https://example.org'});assert.equal(Date.parse(link.expiresAt)-Date.parse(link.createdAt),${run.ttlHours}*3600000);const explicit=s.create({url:'https://example.org',ttlHours:2});assert.equal(Date.parse(explicit.expiresAt)-Date.parse(explicit.createdAt),7200000);}finally{fs.rmSync(dir,{recursive:true,force:true});}});\n`;
        else assertions+="test('greenfield: creation produces short URL',()=>{const dir=fs.mkdtempSync(path.join(os.tmpdir(),'agent-'));try{const s=new LinkStore(path.join(dir,'links.json'));assert.match(s.create({url:'https://example.org'}).shortUrl,/http/);}finally{fs.rmSync(dir,{recursive:true,force:true});}});\n";
        put(path.join(work,'test','generated.test.mjs'),assertions);
        return this.artifact(run,node.id,{files:['workspace/test/service.test.mjs','workspace/test/generated.test.mjs'],checks:run.type});
      }
      case 'qa': {
        if (run.fault.qaAlways) throw Error('Injected permanent QA failure (demo)');
        if (run.fault.qaOnce && !run.fault.used) {run.fault.used=true;throw Error('Injected transient QA failure (demo)');}
        const childEnv={...process.env};delete childEnv.NODE_TEST_CONTEXT;
        const output=execFileSync(process.execPath,['--test','test/service.test.mjs','test/generated.test.mjs'],{cwd:work,timeout:30000,encoding:'utf8',env:childEnv});
        if (!/# pass 6\b/.test(output) || !/# fail 0\b/.test(output)) throw Error('QA output did not certify all six tests');
        put(path.join(dir,'artifacts','qa.log'),output);
        return this.artifact(run,node.id,{passed:true,command:'node --test',output:'artifacts/qa.log',checks:6});
      }
      case 'security': {
        const source=fs.readFileSync(path.join(work,'src','shortener.mjs'),'utf8');
        if (source.includes('eval(')||source.includes('child_process')) throw Error('Security policy violation');
        return this.artifact(run,node.id,{passed:true,checks:['No dynamic execution','No deploy','Bounded write paths','Two approvals']});
      }
      case 'docs':return this.artifact(run,node.id,`# Generated implementation\nScenario: ${run.type}\nRevision: ${run.revision}\nRun from workspace: node --test test/*.test.mjs\nHuman release approval is mandatory.\n`,'md');
      case 'release_assessment':return this.artifact(run,node.id,{status:'READY_FOR_HUMAN_REVIEW',deployed:false,qa:'passed',security:'passed',remainingRisk:'prototype persistence and local-only identity'});
      case 'summary':return this.artifact(run,node.id,{scenario:run.type,revision:run.revision,outcome:'validated, approved, not deployed',metrics:run.metrics,assumptions:['Local demonstration','No real autonomous deployment']});
      default:throw Error(`Unrecognized node ${node.id}`);
    }
  }
  async advance(id) {
    const run=this.get(id);
    if (!this.verify(id)) {run.status='SAFE_STOP';run.reason='Audit chain integrity failure';this.persist(run);return run;}
    if (['COMPLETE','CANCELLED','SAFE_STOP'].includes(run.status)) return run;
    run.status='ACTIVE';run.reason=null;
    for (let wave=0;wave<18;wave++) {
      const ready=Object.values(run.nodes).filter(n=>n.status==='PENDING' && n.deps.every(d=>run.nodes[d].status==='COMPLETE'));
      if (!ready.length) break;
      // Nodes in the same wave run concurrently; no downstream node starts until all finish.
      const outcomes=await Promise.all(ready.map(async node=>{
        try {
          this.validateDependencies(run,node);
          const start=performance.now();
          let result;
          for (let attempt=0;attempt<(retryable.has(node.id)?2:1);attempt++) {
            node.attempts++;
            try {result=await this.executeNode(run,node);break;}
            catch(error) {
              if (attempt===0 && retryable.has(node.id)) {run.metrics.retries++;this.audit(run,'NODE_RETRY',{node:node.id,error:error.message});continue;}
              throw error;
            }
          }
          node.ms+=Math.round(performance.now()-start);
          return {node,result};
        } catch(error) {return {node,error};}
      }));
      for (const {node,result,error} of outcomes) {
        if (error) {
          node.status='FAILED';run.metrics.failures++;run.status='SAFE_STOP';run.reason=`${node.id}: ${error.message}`;
          const work=path.join(this.dir(id),'workspace');
          if (fs.existsSync(work)) {fs.rmSync(work,{recursive:true,force:true});run.metrics.rollbacks++;}
          this.audit(run,'SAFE_STOP',{node:node.id,error:error.message});continue;
        }
        if (result?.waiting) {
          run.status=result.waiting;run.reason=result.reason;
          this.audit(run,'GATE_BLOCKED',{node:node.id,reason:result.reason});continue;
        }
        node.status='COMPLETE';node.artifact=result.artifact;node.digest=result.digest;
        if (retryable.has(node.id) && node.attempts>1) {run.metrics.recoveries++;run.metrics.mttrMs+=node.ms;}
        this.audit(run,'NODE_COMPLETE',{node:node.id,digest:result.digest,attempts:node.attempts,elapsedMs:node.ms});
      }
      this.persist(run);
      if (run.status!=='ACTIVE') return run;
    }
    if (run.nodes.summary.status==='COMPLETE') {run.status='COMPLETE';this.audit(run,'RUN_COMPLETE',{metrics:this.metrics(run)});}
    this.persist(run);return run;
  }
  approve(id,gate,actor,reason) {
    const run=this.get(id);
    if (!gates.has(gate) || run.status!=='WAITING_APPROVAL' || !run.nodes[gate] || run.nodes[gate].status!=='PENDING' || !run.nodes[gate].deps.every(d=>run.nodes[d].status==='COMPLETE')) throw Error('Gate not eligible for approval');
    if (!actor?.trim()||!reason?.trim()) throw Error('Reviewer and reason required');
    run.approval[gate]={actor,reason,revision:run.revision,at:now(),dependencyDigests:run.nodes[gate].deps.map(d=>run.nodes[d].digest)};
    run.decisions.push({gate,actor,reason,revision:run.revision});this.audit(run,'HUMAN_APPROVED',{gate,actor,reason});this.persist(run);return run;
  }
  answer(id,hours,actor) {
    const run=this.get(id);
    if (run.type!=='ambiguous'||run.status!=='WAITING_INPUT'||!Number.isInteger(hours)||hours<1||hours>8760||!actor?.trim()) throw Error('Owner must provide TTL (1-8760) during clarification gate');
    return this.revise(id,run.requirement,hours,actor);
  }
  revise(id,requirement,ttlHours,actor) {
    const run=this.get(id);
    if (!actor?.trim()||!requirement?.trim()||['CANCELLED'].includes(run.status)) throw Error('Invalid revision');
    const dir=this.dir(id);
    put(path.join(dir,'history',`revision-${run.revision}.json`),json(run));
    for (const name of ['workspace','artifacts']) fs.rmSync(path.join(dir,name),{recursive:true,force:true});
    run.revision++;run.requirement=requirement;run.ttlHours=ttlHours;run.approval={};run.status='ACTIVE';run.reason=null;
    run.nodes=workflowNodes(run.type==='ambiguous',/public.facing|phishing|regulated|abuse controls/i.test(requirement));
    this.audit(run,'REVISED',{actor,requirement,ttlHours,revision:run.revision,previousSignoffsInvalidated:true});this.persist(run);return run;
  }
  cancel(id,actor) {const run=this.get(id);run.status='CANCELLED';run.reason=`Cancelled by ${actor}`;this.audit(run,'CANCELLED',{actor});this.persist(run);return run;}
  metrics(run) {
    const values=Object.values(run.nodes);
    return {completed:values.filter(n=>n.status==='COMPLETE').length,total:values.length,successRate:values.filter(n=>n.status==='COMPLETE').length/values.length,retries:run.metrics.retries,rollbacks:run.metrics.rollbacks,mttrMs:run.metrics.mttrMs,endToEndLatencyMs:Date.parse(run.updatedAt)-Date.parse(run.createdAt)};
  }
}
