import React,{useCallback,useEffect,useMemo,useState} from 'react';
import {Activity,AlertTriangle,ArrowRight,CheckCircle2,Clock,GitBranch,GitCommit,LockKeyhole,Play,RefreshCw,ShieldCheck,TerminalSquare,Workflow,XCircle} from 'lucide-react';
import {createSdlcClient,humanStatus} from '../lib/sdlc.js';
import {getValidToken} from '../lib/auth.js';
import {config} from '../lib/config.js';

const DEFAULTS={
  greenfield:'Add an authenticated bulk revoke API allowing owners to revoke 1–50 links in one request.',
  brownfield:'Reject misleading support-desk and security-team aliases without breaking existing URL creation.',
  ambiguous:'Links should expire quickly by default.'
};
const scenarioLabels={greenfield:'Greenfield · Bulk revoke API',brownfield:'Brownfield · Alias protection',ambiguous:'Ambiguous · Link expiry'};
const order=['intake','impact','architecture','security_design','abuse_policy','test_plan','design_approval','implementation','test_generation','qa','security_validation','docs','release_assessment','release_approval','summary'];
const scoreValue=n=>n==null?'—':n;

export default function WorkflowDashboard({currentUser}){
  const call=useMemo(()=>createSdlcClient(()=>getValidToken(config)),[]);
  const [runs,setRuns]=useState([]),[selected,setSelected]=useState(null),[aggregate,setAggregate]=useState(null);
  const [scenario,setScenario]=useState('greenfield'),[requirement,setRequirement]=useState(DEFAULTS.greenfield);
  const [ttlHours,setTtlHours]=useState('48'),[reason,setReason]=useState('Reviewed design, security risks and test evidence.'),[faultOnce,setFaultOnce]=useState(false);
  const [busy,setBusy]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState('');
  const [evidence,setEvidence]=useState(null),[preview,setPreview]=useState(null);
  const refresh=useCallback(async(id)=>{
    const [list,metrics]=await Promise.all([call('/sdlc/runs'),call('/sdlc/metrics')]);
    setRuns(list.items);setAggregate(metrics);
    const requested=id||selected?.id||list.items[0]?.id;
    if(requested){const state=list.items.find(x=>x.id===requested);if(state)setSelected(state);}
  },[call,selected?.id]);
  useEffect(()=>{refresh().catch(e=>setError(e.message));},[]);
  useEffect(()=>{setEvidence(null);setPreview(null);},[selected?.id,selected?.revision]);
  async function doAction(action){setBusy(true);setError('');setNotice('');try{const state=await action();await refresh(state?.id);setNotice('Action recorded in the workflow audit trail.');}catch(e){setError(e.message);}finally{setBusy(false);}}
  const create=()=>doAction(async()=>{const state=await call('/sdlc/runs',{method:'POST',body:{scenario,requirement,injectQaFailureOnce:faultOnce}});const advanced=await call(`/sdlc/runs/${state.id}/advance`,{method:'POST',body:{}});return advanced;});
  const action=(name,body={})=>doAction(()=>call(`/sdlc/runs/${selected.id}/${name}`,{method:'POST',body}));
  const completed=selected&&Object.values(selected.nodes||{}).filter(n=>n.status==='COMPLETE').length;
  const total=selected&&Object.keys(selected.nodes||{}).length;
  const gate=selected&&Object.values(selected.nodes||{}).find(n=>['design_approval','release_approval'].includes(n.id)&&n.status==='PENDING'&&n.dependsOn.every(d=>selected.nodes[d]?.status==='COMPLETE'));
  const isClarify=selected?.status==='WAITING_INPUT';
  const sources=selected?.scenario==='greenfield'?['src/postgres-store.mjs','src/server.mjs']:['src/postgres-store.mjs'];
  return <section className="sdlc-page" aria-label="Agentic SDLC workspace">
    <div className="sdlc-header"><div><p className="sdlc-eyebrow"><Workflow size={15}/> AGENTIC ENGINEERING WORKSPACE</p><h2>Governed SDLC orchestration</h2><p>Requirements → dependency graph → code changes → validation → human approvals. No autonomous AWS deployments.</p></div><button type="button" className="sdlc-outline" onClick={()=>refresh().catch(e=>setError(e.message))}><RefreshCw size={16}/> Refresh</button></div>
    {error&&<div className="sdlc-error" role="alert"><AlertTriangle size={17}/>{error}</div>}{notice&&<div className="sdlc-success" role="status"><CheckCircle2 size={17}/>{notice}</div>}
    <div className="sdlc-metrics"><div><span>Runs</span><strong>{scoreValue(aggregate?.runs)}</strong></div><div><span>Successful terminal runs</span><strong>{aggregate?.successRate==null?'—':`${Math.round(aggregate.successRate*100)}%`}</strong></div><div><span>Task retries</span><strong>{scoreValue(aggregate?.totalRetries)}</strong></div><div><span>Rollbacks</span><strong>{scoreValue(aggregate?.runsRolledBack)}</strong></div></div>
    <div className="sdlc-layout"><div className="sdlc-left">
      <div className="sdlc-card"><h3><GitBranch size={18}/> New engineering requirement</h3><label>Scenario<select value={scenario} onChange={e=>{setScenario(e.target.value);setRequirement(DEFAULTS[e.target.value]);}}>{Object.keys(DEFAULTS).map(s=><option key={s} value={s}>{scenarioLabels[s]}</option>)}</select></label>
        <label>Requirement<textarea rows={4} maxLength={3000} value={requirement} onChange={e=>setRequirement(e.target.value)}/></label>
        <label className="sdlc-check"><input type="checkbox" checked={faultOnce} onChange={e=>setFaultOnce(e.target.checked)}/> Inject one recoverable QA failure (demo)</label>
        <button disabled={busy||!requirement.trim()} className="sdlc-primary" type="button" onClick={create}><Play size={16}/> Create and plan run</button>
        <p className="sdlc-footnote">The engine supports three bounded change recipes, not unrestricted autonomous coding.</p>
      </div>
      <div className="sdlc-card"><h3><Clock size={18}/> Execution history</h3><div className="sdlc-history">{!runs.length&&<p>No runs yet.</p>}{runs.map(r=><button className={`sdlc-history-item ${selected?.id===r.id?'selected':''}`} onClick={()=>setSelected(r)} key={r.id} type="button"><span><strong>{scenarioLabels[r.scenario]}</strong><small>Revision {r.revision} · {r.id.slice(0,8)}</small></span><em className={`sdlc-status status-${r.status?.toLowerCase()}`}>{humanStatus(r.status)}</em></button>)}</div></div>
    </div><div className="sdlc-right">
    {!selected?<div className="sdlc-card sdlc-blank"><TerminalSquare size={38}/><h3>Select a run</h3><p>Create a scenario to see its executable dependency graph and audit evidence.</p></div>:<>
      <div className="sdlc-card"><div className="sdlc-run-top"><div><span className="sdlc-kicker">RUN {selected.id.slice(0,8)} · REVISION {selected.revision}</span><h3>{scenarioLabels[selected.scenario]}</h3><p>{selected.requirement}</p></div><em className={`sdlc-status status-${selected.status?.toLowerCase()}`}>{humanStatus(selected.status)}</em></div>
        <div className="sdlc-progress"><div style={{width:`${total?Math.round(completed/total*100):0}%`}}/></div><p className="sdlc-footnote">{completed} of {total} graph nodes complete · Changes remain in isolated workspace</p>
        <div className="sdlc-actions">
          {selected.status==='WAITING_APPROVAL'&&gate&&<><label>Review rationale<input value={reason} maxLength={1000} onChange={e=>setReason(e.target.value)}/></label><button className="sdlc-primary" disabled={busy||!reason.trim()} type="button" onClick={()=>action('approve',{gate:gate.id,reason})}><ShieldCheck size={16}/> Approve {gate.id.replace('_',' ')}</button></>}
          {isClarify&&<><label>Clarify expiry (hours)<input type="number" min="1" max="8760" value={ttlHours} onChange={e=>setTtlHours(e.target.value)}/></label><button className="sdlc-primary" disabled={busy||!Number.isInteger(Number(ttlHours))||Number(ttlHours)<1||Number(ttlHours)>8760} onClick={()=>action('answer',{ttlHours:Number(ttlHours)})}>Submit clarified requirement</button></>}
          {['ACTIVE','WAITING_APPROVAL'].includes(selected.status)&&<button className="sdlc-outline" disabled={busy} onClick={()=>action('advance')} type="button"><ArrowRight size={16}/> Advance DAG</button>}
          {!['COMPLETE','CANCELLED','SAFE_STOP'].includes(selected.status)&&<button className="sdlc-danger-button" disabled={busy} onClick={()=>action('cancel')} type="button"><XCircle size={16}/> Safe stop</button>}
        </div>
        {selected.reason&&<p className="sdlc-reason"><AlertTriangle size={16}/>{selected.reason}</p>}
      </div>
      <div className="sdlc-card"><h3><GitCommit size={18}/> Dependency graph and agent execution</h3><div className="sdlc-node-grid">{order.filter(id=>selected.nodes[id]).map(id=>{const node=selected.nodes[id];return <div key={id} className={`sdlc-node sdlc-node-${node.status.toLowerCase()}`}><span className="sdlc-node-name">{id.replaceAll('_',' ')}</span><span>{node.status==='COMPLETE'?<CheckCircle2 size={16}/>:node.status==='FAILED'?<XCircle size={16}/>:node.status==='PENDING'?<Clock size={16}/>:<Activity size={16}/>}</span><small>Depends on: {node.dependsOn.join(', ')||'entry'}</small><small>{node.attempts?`${node.attempts} attempt(s) · ${node.elapsedMs}ms`:'Pending'}</small></div>;})}</div></div>
      <div className="sdlc-card"><h3><LockKeyhole size={18}/> Audit, metrics and reviewable code</h3><div className="sdlc-metrics-inline"><span>Retry attempts <b>{selected.metrics?.retryAttempts??0}</b></span><span>Rollbacks <b>{selected.metrics?.rollbackCount??0}</b></span><span>Latency <b>{selected.metrics?.endToEndLatencyMs??0}ms</b></span><span>MTTR <b>{selected.metrics?.meanTimeToRecoveryMs??'—'}ms</b></span></div>
        <div className="sdlc-actions"><button className="sdlc-outline" onClick={async()=>{try{setEvidence(await call(`/sdlc/runs/${selected.id}/evidence`));setError('');}catch(e){setError(e.message);}}} type="button">View audit evidence</button>{sources.map(f=><button key={f} className="sdlc-outline" type="button" onClick={async()=>{try{setPreview(await call(`/sdlc/runs/${selected.id}/preview?file=${encodeURIComponent(f)}`));setError('');}catch(e){setError(e.message);}}}>{f.split('/').at(-1)}</button>)}</div>
        {evidence&&<><p className="sdlc-footnote">Audit integrity: <b>{evidence.verified?'Verified hash chain':'FAILED'}</b> · {evidence.audit.length} events</p><pre className="sdlc-code">{JSON.stringify(evidence.audit.slice(-12),null,2)}</pre></>}
        {preview&&<><p className="sdlc-footnote">Proposed file: {preview.file}. No production code has been modified.</p><div className="sdlc-compare"><div><h4>Before</h4><pre className="sdlc-code">{preview.before}</pre></div><div><h4>After</h4><pre className="sdlc-code">{preview.after}</pre></div></div></>}
      </div>
    </>}
    </div></div>
    <div className="sdlc-banner"><ShieldCheck size={20}/><div><strong>Controlled autonomy</strong><p>Runner uses a separate Cognito-protected control plane and administrator allowlist, with two approval gates and no autonomous AWS deployment capabilities. Use a reviewed CI/CD release for production changes. Signed-in subject: <code>{currentUser||'unknown'}</code></p></div></div>
  </section>;
}
