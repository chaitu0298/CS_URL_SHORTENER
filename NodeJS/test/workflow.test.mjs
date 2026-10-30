import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {WorkflowEngine} from '../src/workflow.mjs';

function engineFixture() {
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'agent-dag-'));
  return {engine:new WorkflowEngine(root), cleanup:()=>fs.rmSync(root,{recursive:true,force:true})};
}

test('greenfield: DAG pauses twice and completes only after explicit human approvals', async()=>{
  const {engine,cleanup}=engineFixture();
  try {
    let run=await engine.advance(engine.create('greenfield').id);
    assert.equal(run.status,'WAITING_APPROVAL');
    assert.equal(run.nodes.architecture.status,'COMPLETE');
    assert.equal(run.nodes.test_plan.status,'COMPLETE');
    assert.throws(()=>engine.approve(run.id,'release_approval','Reviewer','early'),/not eligible/);
    engine.approve(run.id,'design_approval','Architect','Reviewed design, APIs and threats');
    run=await engine.advance(run.id);
    assert.equal(run.status,'WAITING_APPROVAL');
    assert.equal(run.nodes.qa.status,'COMPLETE');
    assert.equal(run.nodes.security.status,'COMPLETE');
    engine.approve(run.id,'release_approval','QA reviewer','Test suite passed');
    run=await engine.advance(run.id);
    assert.equal(run.status,'COMPLETE');
    assert.equal(engine.metrics(run).successRate,1);
    assert.equal(engine.verify(run.id),true);
    assert.match(fs.readFileSync(path.join(engine.dir(run.id),'artifacts','qa.log'),'utf8'),/pass 6/);
  } finally {cleanup();}
});

test('brownfield: generated service patch rejects impersonation alias', async()=>{
  const {engine,cleanup}=engineFixture();
  try {
    let run=await engine.advance(engine.create('brownfield').id);
    engine.approve(run.id,'design_approval','Architect','reviewed');
    run=await engine.advance(run.id);
    assert.equal(run.status,'WAITING_APPROVAL');
    assert.match(fs.readFileSync(path.join(engine.dir(run.id),'workspace/src/shortener.mjs'),'utf8'),/support-desk/);
    engine.approve(run.id,'release_approval','QA','passed');
    run=await engine.advance(run.id);
    assert.equal(run.status,'COMPLETE');
  } finally {cleanup();}
});

test('ambiguous: TTL ambiguity blocks changes then product answer creates revision 2', async()=>{
  const {engine,cleanup}=engineFixture();
  try {
    let run=await engine.advance(engine.create('ambiguous').id);
    assert.equal(run.status,'WAITING_INPUT');
    assert.equal(run.nodes.implement.status,'PENDING');
    engine.answer(run.id,48,'Product Owner');
    run=await engine.advance(run.id);
    assert.equal(run.revision,2);
    assert.equal(run.status,'WAITING_APPROVAL');
    engine.approve(run.id,'design_approval','Architect','TTL reviewed');
    run=await engine.advance(run.id);
    assert.equal(run.status,'WAITING_APPROVAL');
    assert.match(fs.readFileSync(path.join(engine.dir(run.id),'workspace/src/shortener.mjs'),'utf8'),/DEFAULT_TTL_HOURS = 48/);
    engine.approve(run.id,'release_approval','QA','validated');
    run=await engine.advance(run.id);
    assert.equal(run.status,'COMPLETE');
  } finally {cleanup();}
});

test('requirement revision dynamically adds abuse review and invalidates old approval',async()=>{
  const {engine,cleanup}=engineFixture();
  try {
    let run=await engine.advance(engine.create('greenfield').id);
    engine.approve(run.id,'design_approval','Architect','old approval');
    run=engine.revise(run.id,'Build public-facing shortener with phishing controls',null,'Product Owner');
    assert.equal(run.revision,2);
    assert.deepEqual(run.approval,{});
    assert.ok(run.nodes.abuse_review);
    run=await engine.advance(run.id);
    assert.equal(run.status,'WAITING_APPROVAL');
    assert.equal(run.nodes.abuse_review.status,'COMPLETE');
    assert.equal(run.nodes.design_approval.status,'PENDING');
  } finally {cleanup();}
});

test('bounded QA retry recovers a transient fault',async()=>{
  const {engine,cleanup}=engineFixture();
  try {
    let run=await engine.advance(engine.create('greenfield',{injectQaFailOnce:true}).id);
    engine.approve(run.id,'design_approval','Architect','approved');
    run=await engine.advance(run.id);
    assert.equal(run.nodes.qa.status,'COMPLETE');
    assert.equal(run.metrics.retries,1);
    assert.equal(run.metrics.recoveries,1);
  } finally {cleanup();}
});

test('permanent QA failure safe-stops and removes generated workspace',async()=>{
  const {engine,cleanup}=engineFixture();
  try {
    let run=await engine.advance(engine.create('brownfield',{injectQaFailAlways:true}).id);
    engine.approve(run.id,'design_approval','Architect','approved');
    run=await engine.advance(run.id);
    assert.equal(run.status,'SAFE_STOP');
    assert.equal(run.metrics.retries,1);
    assert.equal(run.metrics.rollbacks,1);
    assert.equal(fs.existsSync(path.join(engine.dir(run.id),'workspace')),false);
  } finally {cleanup();}
});

test('audit chain rejects tampering and fail closes',async()=>{
  const {engine,cleanup}=engineFixture();
  try {
    let run=await engine.advance(engine.create('greenfield').id);
    const file=engine.auditPath(run.id);
    fs.appendFileSync(file,'{"fake":"change"}\n');
    assert.equal(engine.verify(run.id),false);
    run=await engine.advance(run.id);
    assert.equal(run.status,'SAFE_STOP');
  } finally {cleanup();}
});
