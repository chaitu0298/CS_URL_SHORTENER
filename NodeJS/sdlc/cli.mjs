import {SdlcEngine,SCENARIOS} from './engine.mjs';
const runner=new SdlcEngine({root:process.env.SDLC_RUNS_DIR});
const [command,...args]=process.argv.slice(2);
async function main(){
  const id=args[0];let value;
  if(command==='scenarios')value=SCENARIOS;
  else if(command==='create')value=runner.create(id,{requirement:args.includes('--requirement')?args[args.indexOf('--requirement')+1]:undefined,injectQaFailureOnce:args.includes('--fail-once')});
  else if(command==='advance')value=await runner.advance(id);
  else if(command==='approve')value=runner.approve(id,args[1],process.env.SDLC_REVIEWER||'local-cli-reviewer',args.slice(2).join(' ')||'Approved after review');
  else if(command==='answer')value=runner.answer(id,Number(args[1]),process.env.SDLC_REVIEWER||'local-cli-reviewer');
  else if(command==='revise')value=runner.revise(id,{requirement:args.slice(1).join(' ')},process.env.SDLC_REVIEWER||'local-cli-reviewer');
  else if(command==='status')value=runner.get(id);
  else if(command==='evidence')value=runner.evidence(id);
  else if(command==='runs')value=runner.list();
  else if(command==='metrics')value=runner.aggregate();
  else if(command==='verify')value={valid:runner.verify(id)};
  else throw Error('Usage: npm run sdlc -- scenarios | create <scenario> | advance <id> | approve <id> <design_approval|release_approval> <reason> | answer <id> <hours> | status <id> | evidence <id> | runs | metrics');
  console.log(JSON.stringify(value,null,2));
}
main().catch(e=>{console.error(e.message);process.exitCode=1;});
