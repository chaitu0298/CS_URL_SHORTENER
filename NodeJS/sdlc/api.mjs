/** Local-only SDLC API; separate from the public URL shortener. */
import http from 'node:http';
import {pathToFileURL} from 'node:url';
import {SdlcEngine} from './engine.mjs';

const json=(res,status,body,origin)=>{res.writeHead(status,{'content-type':'application/json; charset=utf-8','cache-control':'no-store','x-content-type-options':'nosniff',...(origin?{'access-control-allow-origin':origin,'vary':'Origin'}:{})});res.end(JSON.stringify(body));};

export function createSdlcApi(engine,{allowedOrigins=['http://localhost:5173','http://127.0.0.1:5173'],authenticate}={}) {
  let verifierPromise;
  const auth=authenticate|| (async req=>{
    const pool=process.env.COGNITO_USER_POOL_ID,client=process.env.COGNITO_CLIENT_ID,admins=(process.env.SDLC_ADMIN_SUBS||'').split(',').map(s=>s.trim()).filter(Boolean);
    if(!pool||!client||!admins.length)throw Object.assign(Error('SDLC identity configuration missing'),{status:503});
    if(!verifierPromise)verifierPromise=import('aws-jwt-verify').then(({CognitoJwtVerifier})=>CognitoJwtVerifier.create({userPoolId:pool,clientId:client,tokenUse:'access'}));
    const bearer=req.headers.authorization||'';
    if(!bearer.startsWith('Bearer '))throw Object.assign(Error('Cognito access token required'),{status:401});
    let claims;try{claims=await (await verifierPromise).verify(bearer.slice(7));}catch{throw Object.assign(Error('Invalid Cognito token'),{status:401});}
    if(!admins.includes(claims.sub))throw Object.assign(Error('SDLC admin approval not granted'),{status:403});
    return claims.sub;
  });
  const busy=new Set();
  const apply=async (id,fn)=>{if(busy.has(id))throw Object.assign(Error('Workflow already advancing'),{status:409});busy.add(id);try{return await fn();}finally{busy.delete(id);}};
  return http.createServer(async(req,res)=>{
    const origin=req.headers.origin;
    if(origin&&!allowedOrigins.includes(origin))return json(res,403,{error:'Origin not allowed'});
    if(req.method==='OPTIONS'){
      res.writeHead(204,{'access-control-allow-origin':origin||'null','access-control-allow-methods':'GET,POST,OPTIONS','access-control-allow-headers':'Content-Type,Authorization','access-control-max-age':'600'});return res.end();
    }
    try {
      const url=new URL(req.url,'http://localhost'),route=url.pathname;
      if(route==='/sdlc/health'&&req.method==='GET')return json(res,200,{status:'ok',scope:'restricted-control-plane'},origin);
      const actor=await auth(req);
      const readBody=async()=>{let bytes=0,s='';for await(const part of req){bytes+=part.length;if(bytes>8192)throw Object.assign(Error('Payload too large'),{status:413});s+=part.toString();}try{return JSON.parse(s||'{}');}catch{throw Object.assign(Error('Invalid JSON'),{status:400});}};
      if(route==='/sdlc/metrics'&&req.method==='GET')return json(res,200,engine.aggregate(),origin);
      if(route==='/sdlc/runs'&&req.method==='GET')return json(res,200,{items:engine.list().map(r=>({...r,metrics:engine.metrics(r)}))},origin);
      if(route==='/sdlc/runs'&&req.method==='POST'){
        const body=await readBody();return json(res,201,engine.create(body.scenario,{requirement:body.requirement,ttlHours:body.ttlHours??null,injectQaFailureOnce:body.injectQaFailureOnce===true,injectQaFailureAlways:body.injectQaFailureAlways===true}),origin);
      }
      const m=route.match(/^\/sdlc\/runs\/([0-9a-f-]{36})(?:\/(advance|approve|answer|revise|cancel|evidence|preview))?$/);
      if(!m) return json(res,404,{error:'Not found'},origin);
      const id=m[1],action=m[2]||'get';
      if(req.method==='GET'&&action==='get')return json(res,200,{...engine.get(id),metrics:engine.metrics(engine.get(id))},origin);
      if(req.method==='GET'&&action==='evidence')return json(res,200,engine.evidence(id),origin);
      if(req.method==='GET'&&action==='preview')return json(res,200,engine.preview(id,url.searchParams.get('file')||''),origin);
      if(req.method!=='POST')return json(res,405,{error:'Method not allowed'},origin);
      const body=await readBody();
      const run=await apply(id,async()=>{
        if(action==='advance')return engine.advance(id);
        if(action==='approve')return engine.approve(id,body.gate,actor,body.reason);
        if(action==='answer')return engine.answer(id,body.ttlHours,actor);
        if(action==='revise')return engine.revise(id,{requirement:body.requirement,ttlHours:body.ttlHours},actor);
        if(action==='cancel')return engine.cancel(id,actor);
        throw Object.assign(Error('Unknown action'),{status:404});
      });
      return json(res,200,{...run,metrics:engine.metrics(run)},origin);
    }catch(e){const status=e.status||(e.code==='ENOENT'?404:400);return json(res,status,{error:e.message},origin);}
  });
}

if(process.argv[1] && import.meta.url===pathToFileURL(process.argv[1]).href){
  const bindHost=process.env.SDLC_HOST||'127.0.0.1';
  const hosted=bindHost==='0.0.0.0'&&process.env.SDLC_PRIVATE_VPC==='true';
  if(!hosted && !['127.0.0.1','::1'].includes(bindHost)) throw Error('SDLC refuses unapproved network binding');
  if(hosted && (!process.env.SDLC_ADMIN_SUBS?.trim() || !process.env.COGNITO_USER_POOL_ID || !process.env.COGNITO_CLIENT_ID || !process.env.SDLC_RUNS_DIR)) throw Error('Hosted SDLC requires admin allowlist, Cognito configuration and durable runs directory');
  const port=Number(process.env.SDLC_PORT||3100);
  const origins=(process.env.SDLC_CORS_ORIGINS||'http://localhost:5173,http://127.0.0.1:5173').split(',');
  createSdlcApi(new SdlcEngine({root:process.env.SDLC_RUNS_DIR}),{allowedOrigins:origins}).listen(port,bindHost,()=>console.log(`Governed SDLC runner bound on ${bindHost}:${port} (Cognito admin required)`));
}
