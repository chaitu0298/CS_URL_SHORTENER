import React,{useState,useEffect,useCallback,useMemo,useRef} from 'react';
import {
  Activity,ArrowDownRight,ArrowRight,ArrowUpRight,BarChart3,CalendarDays,Check,CheckCircle2,
  ChevronLeft,ChevronRight,Clock3,Copy,ExternalLink,Globe2,HelpCircle,Home,Info,
  Link2,LoaderCircle,LockKeyhole,LogOut,Menu,MousePointerClick,Plus,RefreshCw,
  Search,Settings2,ShieldCheck,Sparkles,Trash2,TrendingUp,UsersRound,X,Zap,Workflow
} from 'lucide-react';
import {config,validateConfig} from './lib/config.js';
import {startLogin,completeLogin,currentSession,getValidToken,logout,safeClaims,clearSession} from './lib/auth.js';
import {makeApi} from './lib/api.js';
import {linkStatus,compactNumber,friendlyDomain,toDisplayDate,toDisplayDateTime} from './lib/format.js';
import CreateLinkForm from './components/CreateLinkForm.jsx';
import TrafficChart from './components/TrafficChart.jsx';
import WorkflowDashboard from './components/WorkflowDashboard.jsx';
import {sdlcEnabled, createSdlcClient} from './lib/sdlc.js';

const TABS=[{id:'overview',label:'Overview',icon:Home},{id:'links',label:'My links',icon:Link2},{id:'analytics',label:'Analytics',icon:BarChart3},{id:'settings',label:'Settings',icon:Settings2},...(sdlcEnabled()?[{id:'sdlc',label:'Agentic SDLC',icon:Workflow}]:[])];

function Brand({light=false}) {return <div className={`brand ${light?'brand-light':''}`}><span className="brand-icon"><Link2 size={24} strokeWidth={3}/></span><span>link<span className="brand-accent">forge</span><span className="brand-period">.</span></span></div>;}
function IconButton({label,children,className='',...props}) {return <button className={`icon-button ${className}`} type="button" aria-label={label} title={label} {...props}>{children}</button>;}
function SpinnerPage() {return <main className="splash"><Brand/><LoaderCircle className="spin" size={28}/><p>Connecting your workspace…</p></main>;}
function StatCard({icon:Icon,value,title,description,tone}) {return <div className="stat-card"><div className={`stat-icon tone-${tone}`}><Icon size={20}/></div><span className="stat-label">{title}</span><div className="stat-value">{value}</div><p>{description}</p></div>;}

function SetupView({problem}) {return <main className="auth-landing"><div className="auth-wrapper"><Brand light/><div className="auth-content"><div className="auth-kicker"><Settings2 size={17}/> ONE-TIME SETUP</div><h1>Connect your<br/><em>AWS backend.</em></h1><p className="auth-description">Your frontend is ready. Add the public AWS API and Cognito values to <code>Frontend/.env.local</code>, then restart the Vite development server.</p><div className="setup-box"><strong>Configuration needed</strong><p>{problem}</p><pre>{`VITE_API_BASE_URL=https://…awsapprunner.com\nVITE_COGNITO_DOMAIN=https://…amazoncognito.com\nVITE_COGNITO_CLIENT_ID=…\nVITE_COGNITO_REDIRECT_URI=http://localhost:5173/`}</pre><small>Never include AWS access keys, DB credentials, or API secrets in Vite variables.</small></div></div><div className="auth-bottom">LinkForge · AWS URL Shortener Frontend</div></div><div className="auth-visual"><div className="decor-circle one"/><div className="decor-circle two"/><div className="preview-card"><div className="preview-mini-label"><span className="online-dot"/> Your link workspace</div><div className="preview-row"><Link2 size={20}/><div><strong>Share smarter.</strong><p>Build branded links that work.</p></div></div><div className="preview-row"><BarChart3 size={20}/><div><strong>See the full picture.</strong><p>Measure your clicks.</p></div></div><div className="preview-row"><ShieldCheck size={20}/><div><strong>Stay in control.</strong><p>Set exact expiration dates.</p></div></div></div></div></main>;}

function SignedOut({onLogin,onSignup,error}) {return <main className="auth-landing"><div className="auth-wrapper"><Brand light/><div className="auth-content"><div className="auth-kicker"><span className="kicker-line"/> SMARTER LINK MANAGEMENT</div><h1>Every link,<br/><em>more powerful.</em></h1><p className="auth-description">Create memorable short links, know who's clicking, and stay in control with smart expiration.</p><div className="auth-actions"><button className="auth-primary" onClick={onLogin}>Sign in to your workspace <ArrowRight size={19}/></button><button className="auth-secondary" onClick={onSignup}>Create an account <ArrowUpRight size={18}/></button></div>{error&&<div className="auth-error" role="alert">{error}</div>}<div className="auth-trust"><ShieldCheck size={17}/><span>Secure access powered by Amazon Cognito</span></div></div><div className="auth-bottom">Built for teams that value every click.</div></div><div className="auth-visual"><div className="decor-circle one"/><div className="decor-circle two"/><div className="auth-visual-content"><div className="floating-label floating-one"><CheckCircle2 size={15}/> Secure & reliable</div><div className="hero-preview"><div className="mini-browser"><i/><i/><i/><span>your.links</span></div><div className="fake-eyebrow">LINK PREVIEW</div><div className="fake-url">https://your-website.com/products/latest/special-offer</div><div className="fake-arrow"><ArrowDownRight size={19}/></div><div className="fake-short"><Link2 size={20}/> go.example.com/launch26 <span><Copy size={16}/></span></div><div className="fake-metrics"><span><MousePointerClick size={17}/> Track clicks</span><span><Clock3 size={17}/> Auto expire</span></div></div><div className="floating-label floating-two"><TrendingUp size={15}/> Your links. Your insights.</div></div></div></main>;}

function Sidebar({active,onChange,userName,onSignOut,mobileOpen,onClose,sdlcAllowed=false}) {
  return <><div className={`mobile-scrim ${mobileOpen?'show':''}`} onClick={onClose}/><aside className={`sidebar ${mobileOpen?'sidebar-open':''}`}>
    <div className="sidebar-top"><Brand/><IconButton label="Close navigation" className="mobile-close" onClick={onClose}><X size={19}/></IconButton></div>
    <div className="workspace-switcher"><div className="workspace-logo">W</div><div><strong>My Workspace</strong><small>Personal dashboard</small></div><ChevronRight size={15}/></div>
    <p className="nav-label">WORKSPACE</p><nav aria-label="Main navigation">{TABS.filter(tab=>tab.id!=='sdlc'||sdlcAllowed).map(({id,label,icon:Icon})=><button type="button" key={id} onClick={()=>{onChange(id);onClose();}} className={`nav-item ${active===id?'nav-active':''}`} aria-current={active===id?'page':undefined}><Icon size={19}/>{label}{active===id&&<span className="nav-indicator"/>}</button>)}</nav>
    <div className="sidebar-spacer"/><div className="sidebar-note"><div className="sidebar-note-icon"><Zap size={20}/></div><strong>Built to scale</strong><p>Secure links, meaningful insights, and full control over expiration.</p></div>
    <div className="sidebar-user"><div className="user-avatar">{(userName||'U').slice(0,1).toUpperCase()}</div><div><strong title={userName}>{userName||'Workspace user'}</strong><small>Signed in securely</small></div><IconButton label="Sign out" onClick={onSignOut}><LogOut size={17}/></IconButton></div>
  </aside></>;
}
function LinkRow({link,onCopy,onAnalytics,onRevoke,copied}) {
  const status=linkStatus(link);
  return <tr><td><div className="destination-cell"><div className="destination-icon"><Globe2 size={20}/></div><div className="destination-details"><strong title={link.destination}>{friendlyDomain(link.destination)}</strong><span title={link.destination}>{link.destination}</span></div></div></td>
    <td><div className="shortlink-cell"><a href={link.shortUrl} target="_blank" rel="noopener noreferrer" title="Open shortened link">{link.code} <ExternalLink size={13}/></a><button className="small-icon-button" type="button" onClick={()=>onCopy(link.shortUrl)} aria-label={`Copy ${link.code}`} title="Copy short URL">{copied===link.shortUrl?<Check size={16}/>:<Copy size={16}/>}</button></div></td>
    <td><span className={`status-pill status-${status.toLowerCase()}`}><i/>{status}</span></td>
    <td className="date-cell">{toDisplayDate(link.expiresAt)}</td>
    <td><span className="click-count"><MousePointerClick size={15}/>{compactNumber(link.clicks)}</span></td>
    <td><div className="row-actions"><IconButton label={`View analytics for ${link.code}`} onClick={()=>onAnalytics(link.code)}><BarChart3 size={17}/></IconButton><IconButton label={`Revoke ${link.code}`} disabled={status==='Revoked'} onClick={()=>onRevoke(link)}><Trash2 size={17}/></IconButton></div></td>
  </tr>;
}
function LinksTable({items,search,setSearch,filter,setFilter,copied,onCopy,onAnalytics,onRevoke,loading,page,total,onPageChange,refresh}) {
  const filtered=items.filter(l=>{
    const term=search.trim().toLowerCase();return (!term||[l.code,l.destination].some(v=>String(v).toLowerCase().includes(term)))&&(filter==='All'||linkStatus(l)===filter);
  });
  return <section className="table-card" aria-labelledby="links-heading"><div className="table-header"><div><h2 id="links-heading">Your links</h2><p>Manage, share, and track every link in one place.</p></div><IconButton label="Refresh links" onClick={refresh}><RefreshCw size={18} className={loading?'spin':''}/></IconButton></div>
  <div className="table-tools"><div className="table-search"><Search size={17}/><input aria-label="Search links on current page" placeholder="Search links on this page…" value={search} onChange={e=>setSearch(e.target.value)}/></div><div className="filters" aria-label="Filter by status">{['All','Active','Expired','Revoked'].map(item=><button type="button" key={item} className={filter===item?'filter-selected':''} onClick={()=>setFilter(item)}>{item}</button>)}</div></div>
  <div className="table-scroll"><table><thead><tr><th>DESTINATION</th><th>SHORT LINK</th><th>STATUS</th><th>EXPIRES</th><th>CLICKS</th><th><span className="sr-only">Actions</span></th></tr></thead><tbody>{filtered.map(l=><LinkRow key={l.code} link={l} onCopy={onCopy} onAnalytics={onAnalytics} onRevoke={onRevoke} copied={copied}/>)}</tbody></table>{!loading&&!filtered.length&&<div className="empty-table"><div><Link2 size={24}/></div><strong>{total===0?'No links yet':'No links match this filter'}</strong><p>{total===0?'Create your first short link above to get started.':'Try another search or filter. Search and filters apply to the current page.'}</p></div>}{loading&&<div className="loading-table"><LoaderCircle className="spin" size={20}/> Loading links…</div>}</div>
  <div className="table-footer"><span>Showing {items.length? page*20+1:0}–{Math.min((page+1)*20,total)} of {total} links <em>· Search applies to this page</em></span><div><IconButton label="Previous page" disabled={page===0||loading} onClick={()=>onPageChange(page-1)}><ChevronLeft size={18}/></IconButton><span>Page {page+1}</span><IconButton label="Next page" disabled={(page+1)*20>=total||loading} onClick={()=>onPageChange(page+1)}><ChevronRight size={18}/></IconButton></div></div></section>;
}
function AnalyticsPanel({links,selected,setSelected,analytics,loading,error}) {
  return <div className="analytics-panel"><div className="analytics-top"><div><span className="eyebrow">TRAFFIC INSIGHTS</span><h2>Link performance</h2><p>Understand how people interact with your short links.</p></div><div className="analytics-select"><label htmlFor="analytics-link">Viewing link</label><select id="analytics-link" value={selected||''} onChange={e=>setSelected(e.target.value)} disabled={!links.length}>{links.length?links.map(l=><option value={l.code} key={l.code}>{l.code}</option>):<option value="">No links</option>}</select></div></div>
  {loading?<div className="analytics-loading"><LoaderCircle className="spin"/> Fetching analytics…</div>:error?<div className="inline-error" role="alert">{error}</div>:analytics?<><div className="analytics-stats"><div><span>Total clicks</span><strong>{compactNumber(analytics.clicks)}</strong></div><div><span>Unique visitors</span><strong>{compactNumber(analytics.uniqueVisitors)}</strong></div><div><span>Created on</span><strong className="small-stat">{toDisplayDate(analytics.createdAt)}</strong></div></div><TrafficChart dailyClicks={analytics.dailyClicks}/><div className="analytics-meta"><div><span>Destination</span><a href={analytics.destination} target="_blank" rel="noopener noreferrer">{friendlyDomain(analytics.destination)} <ExternalLink size={14}/></a></div><div><span>Expires</span><strong>{toDisplayDateTime(analytics.expiresAt)}</strong></div></div></>:<div className="analytics-empty"><BarChart3 size={28}/><h3>No analytics available yet</h3><p>Create a short link and select it to view clicks.</p></div>}</div>;
}
function Settings({onSignOut,onCheckHealth,health,config:cfg,user}) {return <div className="settings-grid"><section className="settings-card"><div className="settings-card-title"><div className="settings-icon"><Globe2 size={21}/></div><div><h2>API connection</h2><p>Your connected backend environment</p></div></div><dl><div><dt>Backend URL</dt><dd className="break-word">{cfg.apiBaseUrl}</dd></div><div><dt>Authentication</dt><dd>Amazon Cognito OAuth 2.0 + PKCE</dd></div><div><dt>AWS service</dt><dd>ECS Fargate / PostgreSQL</dd></div></dl><button type="button" className="secondary-button" onClick={onCheckHealth}><Activity size={17}/> Check backend readiness</button>{health&&<p className={`health-outcome ${health.ok?'healthy':'unhealthy'}`} role="status">{health.ok?<CheckCircle2 size={16}/>:<Info size={16}/>} {health.text}</p>}</section><section className="settings-card"><div className="settings-card-title"><div className="settings-icon purple"><ShieldCheck size={21}/></div><div><h2>Account & security</h2><p>Your session is protected by Cognito</p></div></div><dl><div><dt>Signed in as</dt><dd>{user}</dd></div><div><dt>Session storage</dt><dd>Browser tab only</dd></div><div><dt>Link management</dt><dd>Owner-authorized API requests</dd></div></dl><button type="button" className="secondary-button" onClick={onSignOut}><LogOut size={17}/> Sign out securely</button></section><section className="settings-card settings-wide"><div className="settings-card-title"><div className="settings-icon green"><LockKeyhole size={21}/></div><div><h2>Designed with security in mind</h2><p>No AWS access keys or API secrets are included in this app.</p></div></div><div className="settings-info-grid"><div><CheckCircle2 size={18}/> Cognito access tokens for protected APIs</div><div><CheckCircle2 size={18}/> Exact UTC expiration timestamps</div><div><CheckCircle2 size={18}/> Revoked and expired link handling</div><div><CheckCircle2 size={18}/> PostgreSQL-backed persistent links</div></div></section></div>}

function Dashboard({session,onSignOut,onExpired}) {
  const claims=safeClaims(session?.idToken||session?.accessToken||'');
  const user=claims.email||claims.name||claims['cognito:username']||'Workspace user';
  const shortName=(claims.given_name||claims.name||String(user).split('@')[0]||'there').split(' ')[0];
  const [active,setActive]=useState('overview'),[menuOpen,setMenuOpen]=useState(false);
  const [sdlcAllowed,setSdlcAllowed]=useState(false);
  useEffect(()=>{
    if(!sdlcEnabled())return;
    let live=true;
    createSdlcClient(()=>getValidToken(config))('/sdlc/metrics')
      .then(()=>{if(live)setSdlcAllowed(true);})
      .catch(()=>{if(live)setSdlcAllowed(false);});
    return ()=>{live=false;};
  },[session?.accessToken]);
  const [items,setItems]=useState([]),[total,setTotal]=useState(0),[page,setPage]=useState(0),[loading,setLoading]=useState(true),[error,setError]=useState('');
  const [busy,setBusy]=useState(false),[search,setSearch]=useState(''),[filter,setFilter]=useState('All');
  const [selected,setSelected]=useState(''),[analytics,setAnalytics]=useState(null),[analyticsError,setAnalyticsError]=useState(''),[analyticsLoading,setAnalyticsLoading]=useState(false);
  const [copied,setCopied]=useState(''),[toast,setToast]=useState(''),[health,setHealth]=useState(null);
  const requestKeyRef=useRef(null);
  const api=useMemo(()=>makeApi(config,()=>getValidToken(config),onExpired),[onExpired]);
  const loadLinks=useCallback(async (p=page) => {
    setLoading(true);setError('');
    try {const result=await api.list(p,20);setItems(result.items||[]);setTotal(result.total||0);} catch(e){setError(e.message);setItems([]);} finally {setLoading(false);}
  },[api,page]);
  useEffect(()=>{loadLinks(page);},[loadLinks,page]);
  useEffect(()=>{if(!items.length){setSelected('');setAnalytics(null);}else if(!items.find(l=>l.code===selected)){setSelected(items[0].code);}},[items,selected]);
  useEffect(()=>{if(!selected){setAnalytics(null);return;}const ctrl=new AbortController();setAnalyticsLoading(true);setAnalyticsError('');api.analytics(selected,ctrl.signal).then(setAnalytics).catch(e=>{if(e.name!=='AbortError'){setAnalyticsError(e.message);setAnalytics(null);}}).finally(()=>{if(!ctrl.signal.aborted)setAnalyticsLoading(false);});return()=>ctrl.abort();},[api,selected]);
  useEffect(()=>{if(!toast)return;const timeout=setTimeout(()=>setToast(''),3500);return()=>clearTimeout(timeout);},[toast]);
  async function create(body) {
    setBusy(true);
    try {
      const fingerprint=JSON.stringify(body);
      if (requestKeyRef.current?.fingerprint!==fingerprint)requestKeyRef.current={fingerprint,key:crypto.randomUUID().replace(/-/g,'')};
      const result=await api.create(body,requestKeyRef.current.key);
      requestKeyRef.current=null;
      setToast(`Short link /${result.code} created successfully`);
      setPage(0);await loadLinks(0);
      return result;
    } finally {setBusy(false);}
  }
  async function copy(value) {
    try {await navigator.clipboard.writeText(value);setCopied(value);setToast('Link copied to clipboard');setTimeout(()=>setCopied(''),2300);} catch {setToast('Clipboard unavailable. Try copying the URL manually.');}
  }
  async function revoke(link) {
    if(!window.confirm(`Revoke /${link.code}? The short link will stop redirecting. This cannot be undone.`))return;
    try {await api.revoke(link.code);setToast(`/${link.code} revoked`);await loadLinks(page);}catch(e){setToast(e.message);}
  }
  function showAnalytics(code) {setSelected(code);setActive('analytics');window.scrollTo({top:0,behavior:'smooth'});}
  async function checkHealth() {setHealth({ok:false,text:'Checking…'});try {await api.readiness();setHealth({ok:true,text:'Backend database is ready'});}catch(e){setHealth({ok:false,text:e.message});}}
  const activeCount=items.filter(l=>linkStatus(l)==='Active').length;
  const clicksOnPage=items.reduce((s,l)=>s+(Number(l.clicks)||0),0);
  const heading={overview:'Dashboard',links:'My links',analytics:'Analytics',settings:'Settings',sdlc:'Agentic SDLC'}[active];
  return <div className="app-shell"><a className="skip-link" href="#main">Skip to content</a><Sidebar active={active} onChange={setActive} userName={String(user)} onSignOut={onSignOut} mobileOpen={menuOpen} onClose={()=>setMenuOpen(false)} sdlcAllowed={sdlcAllowed}/>
  <div className="main-shell"><header className="topbar"><div className="topbar-title"><IconButton label="Open navigation" onClick={()=>setMenuOpen(true)}><Menu size={22}/></IconButton><span className="breadcrumb">Workspace</span><ChevronRight size={15}/><strong>{heading}</strong></div><div className="topbar-right"><span className="secure-label"><ShieldCheck size={16}/> Secured by Cognito</span><div className="top-avatar" title={String(user)}>{String(user).slice(0,1).toUpperCase()}</div></div></header>
  <main className="main-content" id="main">
    <div className="page-title-row"><div><p className="page-eyebrow"><span className="pulse-dot"/> YOUR LINK WORKSPACE</p><h1>{active==='overview'?<>Good to see you, {shortName}<span className="wave">✳</span></>:heading}</h1><p className="page-subtitle">{{overview:'Here’s what’s happening with your links today.',links:'Everything you’ve shared, all in one place.',analytics:'See the story behind every click.',settings:'Manage your workspace and connection.',sdlc:'Plan, execute and review governed engineering changes.'}[active]}</p></div>{active!=='settings'&&active!=='sdlc'&&<button className="header-create" type="button" onClick={()=>{setActive('overview');setTimeout(()=>document.getElementById('destination')?.focus(),50);}}><Plus size={17}/> Create link</button>}</div>
    {error&&<div className="global-error" role="alert"><Info size={17}/>{error}<button onClick={()=>loadLinks(page)} type="button">Retry</button></div>}
    {active==='overview'&&<><div className="stats-grid"><StatCard icon={Link2} title="Total links" value={compactNumber(total)} description="Links created in this workspace" tone="purple"/><StatCard icon={ShieldCheck} title="Active links" value={compactNumber(activeCount)} description="On the current page" tone="green"/><StatCard icon={MousePointerClick} title="Total clicks" value={compactNumber(clicksOnPage)} description="Across links on this page" tone="blue"/><StatCard icon={Clock3} title="Auto expiration" value="On" description="Expiry enforced by backend" tone="orange"/></div><div className="overview-grid"><CreateLinkForm onCreate={create} busy={busy}/><aside className="insights-panel"><div className="insights-label"><span className="insights-icon"><Sparkles size={19}/></span> LINKFORGE TIP</div><h2>A shorter link.<br/><span>A bigger impact.</span></h2><p>Give your campaign a memorable alias, share it anywhere, and track each visit in real time.</p><div className="tip-list"><div><Check size={17}/> Choose a custom back-half</div><div><Check size={17}/> Set exactly when it expires</div><div><Check size={17}/> View click analytics</div></div><div className="insights-art"><div className="insights-art-circle"><Link2 size={42}/></div><span className="art-orbit one"/><span className="art-orbit two"/></div></aside></div><LinksTable items={items.slice(0,5)} search={search} setSearch={setSearch} filter={filter} setFilter={setFilter} copied={copied} onCopy={copy} onAnalytics={showAnalytics} onRevoke={revoke} loading={loading} page={page} total={total} onPageChange={setPage} refresh={()=>loadLinks(page)}/><div className="view-all-wrap"><button className="text-button" type="button" onClick={()=>setActive('links')}>Manage all links <ArrowRight size={17}/></button></div></>}
    {active==='links'&&<LinksTable items={items} search={search} setSearch={setSearch} filter={filter} setFilter={setFilter} copied={copied} onCopy={copy} onAnalytics={showAnalytics} onRevoke={revoke} loading={loading} page={page} total={total} onPageChange={setPage} refresh={()=>loadLinks(page)}/>}
    {active==='analytics'&&<AnalyticsPanel links={items} selected={selected} setSelected={setSelected} analytics={analytics} loading={analyticsLoading} error={analyticsError}/>}
    {active==='settings'&&<Settings onSignOut={onSignOut} onCheckHealth={checkHealth} health={health} config={config} user={String(user)}/>}
    {active==='sdlc'&&sdlcAllowed&&<WorkflowDashboard currentUser={claims.sub}/>} 
    <footer className="site-footer"><span>© {new Date().getFullYear()} LinkForge · Secure URL management</span><span>Powered by AWS · Built with React</span></footer>
  </main></div>{toast&&<div className="toast" role="status"><CheckCircle2 size={18}/>{toast}<button type="button" aria-label="Dismiss notification" onClick={()=>setToast('')}><X size={16}/></button></div>}</div>;
}

export default function App() {
  const problem=validateConfig(config);
  const [session,setSession]=useState(null),[phase,setPhase]=useState('loading'),[authError,setAuthError]=useState('');
  const signedOut=useCallback(()=>{clearSession();setSession(null);setPhase('signedOut');setAuthError('Your session has expired. Sign in again.');},[]);
  const authInitRef=useRef(null);
  useEffect(()=>{
    if(problem){setPhase('setup');return;}
    let active=true;
    // OAuth authorization codes are single-use. StrictMode may mount effects twice.
    if(!authInitRef.current){
      authInitRef.current=(async()=>{
        const result=await completeLogin(config);
        if(!result)return null;
        const token=await getValidToken(config);
        return token?currentSession():null;
      })();
    }
    authInitRef.current.then(result=>{
      if(!active)return;
      if(result){setSession(result);setAuthError('');setPhase('signedIn');}
      else setPhase('signedOut');
    }).catch(e=>{if(active){setAuthError(e.message);setPhase('signedOut');}});
    return()=>{active=false;};
  },[problem]);
  if (phase==='loading') return <SpinnerPage/>;
  if (phase==='setup') return <SetupView problem={problem}/>;
  if (phase==='signedOut') return <SignedOut onLogin={()=>startLogin(config).catch(e=>setAuthError(e.message))} onSignup={()=>startLogin(config,true).catch(e=>setAuthError(e.message))} error={authError}/>;
  return <Dashboard session={session} onExpired={signedOut} onSignOut={()=>logout(config)}/>;
}
