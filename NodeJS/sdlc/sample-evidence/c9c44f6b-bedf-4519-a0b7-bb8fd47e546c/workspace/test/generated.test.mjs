import test from 'node:test';
import assert from 'node:assert/strict';
import {validateCreate,PgLinkStore} from '../src/postgres-store.mjs';

test('clarified default expiry is exact UTC duration',()=>{
  const t=Date.parse('2026-10-01T10:00:00.000Z');
  const value=validateCreate({url:'https://example.com'},t);
  assert.equal(Date.parse(value.expiresAt)-t,48*3600000);
  assert.equal(Date.parse(validateCreate({url:'https://example.com',ttlHours:2},t).expiresAt)-t,7200000);
});
