import test from 'node:test';
import assert from 'node:assert/strict';
import {validateCreate,PgLinkStore} from '../src/postgres-store.mjs';

test('reserved impersonation aliases rejected but good alias accepted',()=>{
  assert.throws(()=>validateCreate({url:'https://example.com',alias:'support-desk'}),e=>e.status===400);
  assert.throws(()=>validateCreate({url:'https://example.com',alias:'security-team'}),e=>e.status===400);
  assert.equal(validateCreate({url:'https://example.com',alias:'release-notes'}).alias,'release-notes');
});
