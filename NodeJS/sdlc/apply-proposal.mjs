/** Manual, non-deploying source promotion. Defaults to dry run. */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {SdlcEngine} from './engine.mjs';
const id=process.argv[2],apply=process.argv.includes('--apply');
if(!id)throw Error('Usage: node sdlc/apply-proposal.mjs <run-id> [--apply]');
const e=new SdlcEngine({root:process.env.SDLC_RUNS_DIR}),run=e.get(id);
if(run.status!=='COMPLETE'||!e.verify(id)||run.releaseDeployed!==false)throw Error('Run is not a validated, approved proposal');
const impact=JSON.parse(fs.readFileSync(path.join(e.dir(id),'artifacts/impact.json'),'utf8'));
const sha=s=>crypto.createHash('sha256').update(s).digest('hex');
const changed=[];
for(const item of impact.files){
 const original=path.join(e.sourceRoot,item.file),proposed=path.join(e.dir(id),'workspace',item.file);
 if(!fs.existsSync(proposed)||!fs.existsSync(original))throw Error('Source missing: '+item.file);
 const before=fs.readFileSync(original),after=fs.readFileSync(proposed);
 if(sha(before)!==item.sha256)throw Error('STOP: original repository changed since analysis: '+item.file);
 if(!before.equals(after))changed.push({relative:item.file,original,proposed});
}
console.log('Approved proposal',id,'\nChanged files:',changed.map(x=>x.relative).join(', '));
if(!apply){console.log('Dry run. Human must inspect previews; use SDLC_APPLY_CONFIRM=YES and --apply to copy into local backend. No deployment.');process.exit(0);}
if(process.env.SDLC_APPLY_CONFIRM!=='YES')throw Error('Explicit SDLC_APPLY_CONFIRM=YES required');
const backup=path.join(e.dir(id),'pre-apply-backup');
for(const item of changed){const destination=path.join(backup,item.relative);fs.mkdirSync(path.dirname(destination),{recursive:true});fs.copyFileSync(item.original,destination);fs.copyFileSync(item.proposed,item.original);}
console.log('Local source updated. Backups saved in',backup);
console.log('NEXT: npm test; review git diff; then git commit and deploy via existing ECS script after full validation.');
