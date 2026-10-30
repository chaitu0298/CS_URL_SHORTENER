import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {LinkStore} from '../src/shortener.mjs';
test('brownfield: reserved impersonation alias rejected',()=>{ const dir=fs.mkdtempSync(path.join(os.tmpdir(),'agent-')); try {const s=new LinkStore(path.join(dir,'links.json'));assert.throws(()=>s.create({url:'https://example.org',alias:'support-desk'}),e=>e.status===400);assert.equal(s.create({url:'https://example.org',alias:'healthy-link'}).code,'healthy-link');}finally{fs.rmSync(dir,{recursive:true,force:true});}});
