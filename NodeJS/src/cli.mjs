import {WorkflowEngine} from './workflow.mjs';
const [command,...args] = process.argv.slice(2);
const engine = new WorkflowEngine(process.env.RUNS_DIR);
async function main() {
  let run;
  switch(command) {
    case 'run': run=engine.create(args[0],{injectQaFailOnce:args.includes('--inject-qa-fail-once'),injectQaFailAlways:args.includes('--inject-qa-fail-always')});break;
    case 'status':run=engine.get(args[0]);break;
    case 'advance':run=await engine.advance(args[0]);break;
    case 'answer':run=engine.answer(args[0],Number(args[1]),args[2]);break;
    case 'approve':run=engine.approve(args[0],args[1],args[2],args.slice(3).join(' '));break;
    case 'revise':run=engine.revise(args[0],args[1],args[2]==='-'?null:Number(args[2]),args[3]);break;
    case 'verify':console.log(engine.verify(args[0])?'AUDIT VERIFIED':'AUDIT FAILED');return;
    case 'cancel':run=engine.cancel(args[0],args[1]);break;
    default:throw Error('Usage: npm run workflow -- run greenfield|brownfield|ambiguous [--inject-qa-fail-once] | advance ID | status ID | approve ID design_approval|release_approval ACTOR REASON | answer ID TTL_HOURS ACTOR | revise ID REQUIREMENT TTL_HOURS|- ACTOR | verify ID');
  }
  if (!['status','cancel'].includes(command)) run=await engine.advance(run.id);
  console.log(JSON.stringify({id:run.id,type:run.type,status:run.status,reason:run.reason,revision:run.revision,metrics:engine.metrics(run),dir:engine.dir(run.id)},null,2));
}
main().catch(e=>{console.error(e.message);process.exitCode=1;});
