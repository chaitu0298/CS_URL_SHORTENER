/** Produce explicitly simulated, safe example artifacts (NOT evidence of actual human sign-off). */
import fs from 'node:fs';import path from 'node:path';import {fileURLToPath} from 'node:url';
import {SdlcEngine} from './engine.mjs';
const here=path.dirname(fileURLToPath(import.meta.url));
const root=path.join(here,'sample-evidence');fs.rmSync(root,{force:true,recursive:true});
const engine=new SdlcEngine({root});const index=[];
for(const scenario of ['greenfield','brownfield','ambiguous']){
 let run=await engine.advance(engine.create(scenario,{injectQaFailureOnce:scenario==='greenfield'}).id);
 if(run.status==='WAITING_INPUT')run=engine.answer(run.id,48,'SIMULATED_PRODUCT_OWNER');run=await engine.advance(run.id);
 run=engine.approve(run.id,'design_approval','SIMULATED_DESIGN_REVIEWER','DEMO ONLY - simulated signoff, not real human approval');run=await engine.advance(run.id);
 run=engine.approve(run.id,'release_approval','SIMULATED_RELEASE_REVIEWER','DEMO ONLY - simulated signoff, not real human approval');run=await engine.advance(run.id);
 if(run.status!=='COMPLETE'||!engine.verify(run.id))throw Error(`Demo failed: ${scenario} ${run.status}`);
 index.push({scenario,id:run.id,status:run.status,revision:run.revision,metrics:engine.metrics(run),auditVerified:engine.verify(run.id),approvals:'SIMULATED - NEVER REPRESENT AS HUMAN APPROVAL'});
}
fs.writeFileSync(path.join(root,'INDEX.json'),JSON.stringify(index,null,2)+'\n');
console.log(JSON.stringify(index,null,2));
