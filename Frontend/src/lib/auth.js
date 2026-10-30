/* OAuth 2.0 Authorization Code + PKCE, public Cognito client (no client secret).
 * Session storage only; no access/refresh tokens in URLs or long-term localStorage.
 */
const KEYS = {session:'lf.session.v1', transaction:'lf.oauth.transaction.v1'};
const encoder = new TextEncoder();
export function base64url(bytes) {
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
}
export function secureRandom(size = 32) {
  const bytes = new Uint8Array(size);
  crypto.getRandomValues(bytes);
  return base64url(bytes);
}
export async function pkceChallenge(verifier) {
  const digest = await crypto.subtle.digest('SHA-256',encoder.encode(verifier));
  return base64url(new Uint8Array(digest));
}
export function safeClaims(jwt) {
  try {
    const b64 = jwt.split('.')[1].replace(/-/g,'+').replace(/_/g,'/');
    return JSON.parse(atob(b64));
  } catch {return {};}
}
function transactionStorage() {return sessionStorage;}
function storedSession() {
  try {return JSON.parse(transactionStorage().getItem(KEYS.session)||'null');} catch {return null;}
}
function saveSession(session) {transactionStorage().setItem(KEYS.session, JSON.stringify(session));return session;}
export function clearSession() {transactionStorage().removeItem(KEYS.session);transactionStorage().removeItem(KEYS.transaction);}
export function currentSession() {return storedSession();}
export async function startLogin(config, signup = false) {
  const verifier=secureRandom(48),state=secureRandom(24);
  const challenge=await pkceChallenge(verifier);
  transactionStorage().setItem(KEYS.transaction, JSON.stringify({verifier,state,at:Date.now()}));
  const url=new URL(config.cognitoDomain+'/oauth2/authorize');
  url.searchParams.set('response_type','code');
  url.searchParams.set('client_id',config.clientId);
  url.searchParams.set('redirect_uri',config.redirectUri);
  url.searchParams.set('scope','openid email profile');
  url.searchParams.set('code_challenge',challenge);
  url.searchParams.set('code_challenge_method','S256');
  url.searchParams.set('state',state);
  if (signup) url.searchParams.set('screen_hint','signup');
  window.location.assign(url.toString());
}
async function tokenRequest(config, fields, fetcher=fetch) {
  let response;
  try {
    response=await fetcher(config.cognitoDomain+'/oauth2/token',{
      method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},
      body:new URLSearchParams({...fields,client_id:config.clientId}),
    });
  } catch {throw new Error('Unable to reach Cognito token endpoint. Check internet access and Cognito configuration.');}
  const data=await response.json().catch(()=>({}));
  if (!response.ok) throw new Error(`Sign-in failed: ${data.error_description || data.error || 'Token exchange failed'}`);
  if (!data.access_token || !data.expires_in) throw new Error('Cognito returned an invalid token response.');
  return data;
}
function saveTokenResponse(data, old = {}) {
  return saveSession({
    accessToken:data.access_token,
    idToken:data.id_token || old.idToken || null,
    refreshToken:data.refresh_token || old.refreshToken || null,
    expiresAt:Date.now()+data.expires_in*1000,
  });
}
export async function completeLogin(config, href=window.location.href, fetcher=fetch) {
  const page=new URL(href);
  const code=page.searchParams.get('code');
  const error=page.searchParams.get('error');
  if (!code && !error) return storedSession();
  // Remove authorization parameters immediately, including on failed exchange.
  if (typeof history!=='undefined' && page.origin===window.location.origin) {
    history.replaceState({},'',page.pathname+page.hash);
  }
  const raw=transactionStorage().getItem(KEYS.transaction);
  transactionStorage().removeItem(KEYS.transaction);
  if (error) throw new Error(`Cognito: ${page.searchParams.get('error_description') || error}`);
  let tx;
  try {tx=JSON.parse(raw);} catch {throw new Error('Login session missing. Please sign in again.');}
  if (!tx?.verifier || !tx?.state || page.searchParams.get('state')!==tx.state || Date.now()-tx.at>10*60_000) {
    throw new Error('Login state is invalid or expired. Please sign in again.');
  }
  const data=await tokenRequest(config,{
    grant_type:'authorization_code',code,redirect_uri:config.redirectUri,code_verifier:tx.verifier,
  },fetcher);
  return saveTokenResponse(data);
}
let pendingRefresh=null;
export async function getValidToken(config, fetcher=fetch) {
  const session=storedSession();
  if (!session) return null;
  if (session.expiresAt > Date.now()+90_000) return session.accessToken;
  if (!session.refreshToken) {clearSession();return null;}
  if (!pendingRefresh) {
    pendingRefresh=(async () => {
      try {
        const refreshed=await tokenRequest(config,{grant_type:'refresh_token',refresh_token:session.refreshToken},fetcher);
        return saveTokenResponse(refreshed,session).accessToken;
      } catch {clearSession();return null;}
    })().finally(()=>{pendingRefresh=null;});
  }
  return pendingRefresh;
}
export function logout(config) {
  clearSession();
  const url=new URL(config.cognitoDomain+'/logout');
  url.searchParams.set('client_id',config.clientId);
  url.searchParams.set('logout_uri',config.redirectUri);
  window.location.assign(url.toString());
}
