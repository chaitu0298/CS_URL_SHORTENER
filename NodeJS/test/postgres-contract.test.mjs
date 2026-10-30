import test from 'node:test';
import assert from 'node:assert/strict';
import {validateCreate} from '../src/postgres-store.mjs';
const now=Date.parse('2026-10-28T12:00:00Z');
test('default is exactly 30 days with UTC timestamp',()=>{assert.equal(validateCreate({url:'https://example.com'},now).expiresAt,'2026-11-27T12:00:00.000Z');});
test('explicit ISO expiration supports timezone offsets',()=>{assert.equal(validateCreate({url:'https://example.com',expiresAt:'2026-11-01T07:00:00-05:00'},now).expiresAt,'2026-11-01T12:00:00.000Z');});
test('rejects mixed, past, far-future expiry',()=>{for(const request of [{ttlHours:1,expiresAt:'2026-11-01T12:00:00Z'},{expiresAt:'2026-10-28T10:00:00Z'},{ttlHours:8761}])assert.throws(()=>validateCreate({url:'https://example.com',...request},now));});
test('reserved route aliases are rejected',()=>{assert.throws(()=>validateCreate({url:'https://example.com',alias:'health'},now));});
