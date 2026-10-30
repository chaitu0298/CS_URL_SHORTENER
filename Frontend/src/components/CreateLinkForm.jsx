import React,{useState} from 'react';
import {ArrowRight, CalendarDays, Check, ChevronDown, Link2, LoaderCircle, Sparkles} from 'lucide-react';
import {buildCreatePayload,toDisplayDateTime} from '../lib/format.js';

const PRESETS=[{value:'1d',label:'24 hours'},{value:'7d',label:'7 days'},{value:'30d',label:'30 days'},{value:'90d',label:'90 days'},{value:'custom',label:'Custom date'}];
export default function CreateLinkForm({onCreate,busy}) {
  const [url,setUrl]=useState('');
  const [alias,setAlias]=useState('');
  const [expiry,setExpiry]=useState('30d');
  const [customDate,setCustomDate]=useState('');
  const [error,setError]=useState('');
  const [created,setCreated]=useState(null);
  const [copied,setCopied]=useState(false);
  async function submit(event) {
    event.preventDefault();setError('');setCreated(null);
    try {
      const payload=buildCreatePayload({url,alias,expiry,customDate});
      const response=await onCreate(payload);
      setCreated(response);setUrl('');setAlias('');setCopied(false);
    } catch (e) {setError(e.message || 'Unable to create link.');}
  }
  async function copy() {
    if (!created) return;
    try {await navigator.clipboard.writeText(created.shortUrl);setCopied(true);setTimeout(()=>setCopied(false),1800);} catch {setError('Copy failed. Select and copy the URL manually.');}
  }
  return <section className="create-panel" aria-labelledby="create-heading" id="create">
    <div className="section-heading"><div><span className="eyebrow">CREATE NEW</span><h2 id="create-heading">Make a short link <span className="heading-sparkle"><Sparkles size={18}/></span></h2><p>Turn a long URL into something easy to share.</p></div><div className="section-icon"><Link2 size={21}/></div></div>
    <form onSubmit={submit} noValidate>
      <label className="field-label" htmlFor="destination">Destination URL <span className="required">*</span></label>
      <div className="input-with-icon"><Link2 size={18} aria-hidden="true"/><input id="destination" type="url" placeholder="https://your-website.com/a-very-long-url" autoComplete="url" required maxLength={2048} value={url} onChange={e=>setUrl(e.target.value)} /></div>
      <div className="form-two-col">
        <div><label className="field-label" htmlFor="alias">Custom back-half <span className="optional">Optional</span></label><div className="input-with-prefix"><span>/</span><input id="alias" placeholder="summer-campaign" maxLength={32} spellCheck="false" value={alias} onChange={e=>setAlias(e.target.value)} /></div><small>4–32 letters, numbers, - or _</small></div>
        <div><label className="field-label" htmlFor="expiry">Link expires after</label><div className="select-wrapper"><CalendarDays size={17} aria-hidden="true"/><select id="expiry" value={expiry} onChange={e=>setExpiry(e.target.value)}>{PRESETS.map(item=><option key={item.value} value={item.value}>{item.label}</option>)}</select><ChevronDown size={16} className="select-chevron"/></div></div>
      </div>
      {expiry==='custom'&&<div className="custom-expiry"><label className="field-label" htmlFor="custom-expiry">Exact expiry date & time (your local timezone)</label><input type="datetime-local" id="custom-expiry" value={customDate} onChange={e=>setCustomDate(e.target.value)} required/><small>We'll send the exact expiry instant to the API in UTC.</small></div>}
      {error&&<div className="inline-error" role="alert">{error}</div>}
      <button className="primary-button create-button" type="submit" disabled={busy}>{busy?<><LoaderCircle size={18} className="spin"/> Creating…</>:<>Create short link <ArrowRight size={18}/></>}</button>
      <p className="form-footnote"><Check size={14}/> Secure, trackable, and automatically expires on schedule</p>
    </form>
    {created&&<div className="created-box" role="status"><div><span className="created-tag"><Check size={14}/> Link created</span><a target="_blank" rel="noopener noreferrer" href={created.shortUrl}>{created.shortUrl}</a><small>Expires {toDisplayDateTime(created.expiresAt)}</small></div><button type="button" className="copy-created" onClick={copy}>{copied?<Check size={17}/>:<Link2 size={17}/>} {copied?'Copied':'Copy link'}</button></div>}
  </section>;
}
