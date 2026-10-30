/** Dedicated, Cognito-gated SDLC control plane. Never embed secrets in Vite assets. */
export function sdlcEnabled() {
  const configured=import.meta.env.VITE_SDLC_API_BASE_URL || '';
  if(!configured)return false;
  try {const u=new URL(configured);return u.protocol==='https:' || (u.protocol==='http:' && ['localhost','127.0.0.1'].includes(u.hostname));}catch{return false;}
}
export function createSdlcClient(getToken, url=import.meta.env.VITE_SDLC_API_BASE_URL) {
  if(!url)throw Error('SDLC runner is not configured');
  const root=url.replace(/\/$/,'');
  return async (route,{method='GET',body}={})=>{
    const token=await getToken();if(!token)throw Error('Sign in with Cognito to use the SDLC runner');
    const res=await fetch(root+route,{method,headers:{Authorization:`Bearer ${token}`,...(body?{'Content-Type':'application/json'}:{})},...(body?{body:JSON.stringify(body)}:{})});
    let data;try{data=await res.json();}catch{throw Error('Invalid runner response');}
    if(!res.ok)throw Error(data.error||`Runner HTTP ${res.status}`);
    return data;
  };
}
export function humanStatus(status){return ({WAITING_APPROVAL:'Approval required',WAITING_INPUT:'Clarification required',SAFE_STOP:'Safe stopped',COMPLETE:'Completed',ACTIVE:'In progress',CANCELLED:'Cancelled'})[status]||status;}
