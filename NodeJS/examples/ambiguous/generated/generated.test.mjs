import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {LinkStore} from '../src/shortener.mjs';
test('ambiguous: default expires in resolved hours',()=>{const dir=fs.mkdtempSync(path.join(os.tmpdir(),'agent-')); try {const s=new LinkStore(path.join(dir,'links.json'),{clock:()=>Date.parse('2026-01-01T00:00:00Z')});const link=s.create({url:'https://example.org'});assert.equal(Date.parse(link.expiresAt)-Date.parse(link.createdAt),48*3600000);const explicit=s.create({url:'https://example.org',ttlHours:2});assert.equal(Date.parse(explicit.expiresAt)-Date.parse(explicit.createdAt),7200000);}finally{fs.rmSync(dir,{recursive:true,force:true});}});
