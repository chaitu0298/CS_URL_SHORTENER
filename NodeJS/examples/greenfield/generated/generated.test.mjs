import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {LinkStore} from '../src/shortener.mjs';
test('greenfield: creation produces short URL',()=>{const dir=fs.mkdtempSync(path.join(os.tmpdir(),'agent-'));try{const s=new LinkStore(path.join(dir,'links.json'));assert.match(s.create({url:'https://example.org'}).shortUrl,/http/);}finally{fs.rmSync(dir,{recursive:true,force:true});}});
