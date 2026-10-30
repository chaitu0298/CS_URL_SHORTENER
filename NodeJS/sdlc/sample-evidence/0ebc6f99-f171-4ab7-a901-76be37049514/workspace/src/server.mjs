import http from 'node:http';
import crypto from 'node:crypto';
import {pathToFileURL} from 'node:url';
import {LinkStore, ApiError} from './shortener.mjs';

export function createServer(store, options = {}) {
  const rateLimit = options.rateLimit ?? Number(process.env.RATE_LIMIT ?? 60);
  const authMode = options.authMode ?? process.env.AUTH_MODE ?? 'apikey';
  const allowedOrigins = (options.corsOrigins ?? process.env.CORS_ORIGINS ?? '').split(',').map(s=>s.trim()).filter(Boolean);
  const usage = new Map();
  let verifierPromise;
  const headersFor = origin => ({'content-type':'application/json; charset=utf-8','cache-control':'no-store','x-content-type-options':'nosniff', 'vary':'Origin',...(origin&&allowedOrigins.includes(origin)?{'access-control-allow-origin':origin}: {})});
  const respond = (res,status,body,origin) => {res.writeHead(status,headersFor(origin));res.end(JSON.stringify(body));};
  const verify = async req => {
    if(authMode==='jwt') {
      const poolId=process.env.COGNITO_USER_POOL_ID, clientId=process.env.COGNITO_CLIENT_ID;
      if(!poolId || !clientId) throw new ApiError(503,'Authentication not configured');
      if(!verifierPromise)verifierPromise=import('aws-jwt-verify').then(({CognitoJwtVerifier})=>CognitoJwtVerifier.create({userPoolId:poolId,tokenUse:'access',clientId}));
      const auth=req.headers.authorization??'';
      if(!auth.startsWith('Bearer '))throw new ApiError(401,'Bearer access token required');
      try {return (await (await verifierPromise).verify(auth.slice(7))).sub;}catch{throw new ApiError(401,'Invalid access token');}
    } else if(authMode==='apikey') {
      const a=Buffer.from(req.headers['x-api-key']??'', 'utf8');
      const b=Buffer.from(store.apiKey??process.env.API_KEY??'local-demo-key', 'utf8');
      if(a.length!==b.length || !crypto.timingSafeEqual(a,b))throw new ApiError(401,'API key required');
      return 'local-dev';
    } else throw new ApiError(503,'Invalid AUTH_MODE');
  };
  return http.createServer(async (req,res)=>{
    const origin=req.headers.origin;
    try {
      const u=new URL(req.url,'http://localhost');
      if(req.method==='OPTIONS'&&u.pathname.startsWith('/api/v1/')) {
        if(!origin || !allowedOrigins.includes(origin)) return respond(res,403,{error:'Origin not allowed'},origin);
        res.writeHead(204,{...headersFor(origin),'access-control-allow-methods':'GET, POST, DELETE, OPTIONS','access-control-allow-headers':'Content-Type, Authorization, X-API-Key, Idempotency-Key','access-control-max-age':'600'});return res.end();
      }
      if(req.method==='GET'&&u.pathname==='/health')return respond(res,200,{status:'ok'},origin);
      if(req.method==='GET'&&u.pathname==='/ready') {await store.ready?.();return respond(res,200,{status:'ready'},origin);}
      const admin=u.pathname.startsWith('/api/v1/');
      let owner;
      if(admin) {
        owner=await verify(req);
        // Per-instance guard only. Use AWS WAF/API Gateway quotas for distributed enforcement.
        const key=`${owner}:${Math.floor(Date.now()/60000)}`;
        const current=(usage.get(key)??0)+1;usage.set(key,current);
        if(usage.size>10000)usage.clear();
        if(current>rateLimit)throw new ApiError(429,'Rate limit exceeded');
      }
      if(req.method==='POST'&&u.pathname==='/api/v1/links/bulk-revoke') {
        let body='', bytes=0;
        for await(const part of req) {bytes+=part.length;if(bytes>8192)throw new ApiError(413,'Payload too large');body+=part.toString();}
        let payload;try{payload=JSON.parse(body);}catch{throw new ApiError(400,'Malformed JSON');}
        return respond(res,200,await store.bulkRevoke(payload.codes,owner),origin);
      }
      if(req.method==='POST'&&u.pathname==='/api/v1/links') {
        let body='',bytes=0;
        for await(const piece of req) {bytes+=piece.length;if(bytes>8192)throw new ApiError(413,'Payload too large');body+=piece.toString();}
        let payload;try{payload=JSON.parse(body);}catch{throw new ApiError(400,'Malformed JSON');}
        const result=await store.create(payload,req.headers['idempotency-key'],owner);
        return respond(res,result.replay?200:201,result,origin);
      }
      if(req.method==='GET'&&u.pathname==='/api/v1/links') {
        const page=Number(u.searchParams.get('page')??0),size=Number(u.searchParams.get('size')??20);
        if(!Number.isInteger(page)||page<0||page>100000||!Number.isInteger(size)||size<1||size>100)throw new ApiError(400,'Invalid page or size');
        return respond(res,200,await store.list(owner,page,size),origin);
      }
      const owned=u.pathname.match(/^\/api\/v1\/links\/([A-Za-z0-9_-]{4,32})$/);
      if(req.method==='DELETE'&&owned){await store.revoke(owned[1],owner);res.writeHead(204,{'cache-control':'no-store'});return res.end();}
      const stats=u.pathname.match(/^\/api\/v1\/links\/([A-Za-z0-9_-]+)\/analytics$/);
      if(req.method==='GET'&&stats)return respond(res,200,await store.analytics(stats[1],owner),origin);
      const code=u.pathname.match(/^\/([A-Za-z0-9_-]{4,32})$/);
      if(req.method==='GET'&&code) {
        const forwarded = req.headers['x-forwarded-for'];
        const visitor = process.env.TRUST_PROXY === 'true' && typeof forwarded === 'string' ? forwarded.split(',').at(-1).trim() : req.socket.remoteAddress;
        const location=await store.resolve(code[1], visitor);
        res.writeHead(302,{'location':location,'cache-control':'no-store','referrer-policy':'no-referrer','x-content-type-options':'nosniff'});return res.end();
      }
      return respond(res,404,{error:'Not found'},origin);
    } catch(error) {return respond(res,error instanceof ApiError?error.status:500,{error:error instanceof ApiError?error.message:'Internal error'},origin);}
  });
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href) {
  const store=new LinkStore(process.env.DATA_FILE??'./data/links.json');
  createServer(store).listen(Number(process.env.PORT??3000),()=>console.log('Legacy local-only server running'));
}
