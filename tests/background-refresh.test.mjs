import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const app=readFileSync(new URL('../app.js',import.meta.url),'utf8');
const safeguards=readFileSync(new URL('../safeguards-beta.js',import.meta.url),'utf8');

test('background refresh does not redraw unchanged or actively used screens',()=>{
  assert.match(app,/sharedStateSignature\(\)!==before\)deferredBackgroundRender=true/);
  assert.match(app,/backgroundRenderBlocked\(\)/);
  assert.match(app,/input,textarea,select/);
  assert.match(app,/gross-detail-backdrop/);
  assert.match(app,/sbc-chit-backdrop/);
  assert.match(app,/analytics-player-card\[open\]/);
  assert.match(app,/renderPreservingViewport\(\)/);
  assert.match(app,/if\(backgroundRenderBlocked\(\)\)return;\s+const before=sharedStateSignature\(\)/);
});

test('only one 15-second shared-state poll remains',()=>{
  assert.equal((app.match(/setInterval\([^;]*15000\)/g)||[]).length,1);
  assert.doesNotMatch(safeguards,/setInterval\(\(\)=>\{ if\(authToken\(\)&&navigator\.onLine\) loadShared\(\); \},15000\)/);
});

test('selected locked scorecard is labeled complete instead of live',()=>{
  assert.match(app,/scorecardComplete=!!state\.locks\?\.\[r\]\?\.\[group\]/);
  assert.match(app,/scorecardComplete\?'COMPLETE':'LIVE SCORING'/);
});

test('Cottage Cup status becomes complete only after every counting-round score exists',()=>{
  assert.match(app,/const complete=rounds\.every\(r=>PLAYERS\.every\(p=>\s*PAR\.every/);
  assert.match(app,/complete\?'COMPLETE':'LIVE'/);
});
