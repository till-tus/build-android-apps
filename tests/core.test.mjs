import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile, mkdir } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { parseHierarchy, hitTest, parseBounds, annotationMetadata } from '../server/src/hierarchy.mjs';
import { sdkCandidates, sdkToolDirectories } from '../server/src/paths.mjs';
import { run, remoteQuote } from '../server/src/process.mjs';
import { Android, packageName, serialName, buildProject } from '../server/src/android.mjs';
import { createProject } from '../server/src/project.mjs';
import { sourceHints } from '../server/src/source.mjs';
import { Jobs } from '../server/src/jobs.mjs';
import { xml } from './fixtures.mjs';

test('hierarchy parses nesting, identity, bounds, escaped text and redacts passwords', () => {
  const tree = parseHierarchy(xml.replace('Count: 0','Count: &lt;0&gt;'));
  assert.equal(tree.nodes.length,3); assert.equal(tree.nodes[1].text,'Count: <0>'); assert.equal(tree.nodes[1].parentId,tree.nodes[0].id);
  assert.equal(tree.nodes[2].text,'[redacted]'); assert.equal(hitTest(tree.nodes,100,160).id,tree.nodes[1].id);
  assert.equal(hitTest(tree.nodes,900,900),null); assert.equal(parseBounds('[0,0][0,4]'),null);
  const changed = parseHierarchy(xml.replace('Count: 0','Count: 1')); assert.equal(changed.nodes[1].id,tree.nodes[1].id);
  assert.throws(()=>parseHierarchy('<!DOCTYPE bad><hierarchy></hierarchy>'));
  assert.throws(()=>parseHierarchy('not xml'));
  const meta=annotationMetadata({...tree.nodes[1],text:'🙂'.repeat(500)},'emulator-5554',Date.now());
  assert.ok(Buffer.byteLength(JSON.stringify(meta))<=2048); assert.ok(Object.values(meta).every(v=>typeof v==='string'&&v.length<=256));
});
test('macOS and Windows SDK defaults preserve paths with spaces', () => {
  assert.ok(sdkCandidates({platform:'win32',env:{LOCALAPPDATA:'C:\\Users\\A User\\AppData\\Local'},home:'C:\\Users\\A User'}).includes('C:\\Users\\A User\\AppData\\Local\\Android\\Sdk'));
  assert.ok(sdkCandidates({platform:'darwin',env:{},home:'/Users/A User'}).includes('/Users/A User/Library/Android/sdk'));
});
test('SDK discovery prefers the actual newest tools over a stale latest folder', async () => {
  const tmp=await mkdtemp(path.join(os.tmpdir(),'android-sdk-version-'));
  try {
    for(const [name,revision] of [['latest','10.0'],['latest-2','22.0'],['9.0','9.0']]) {const dir=path.join(tmp,'cmdline-tools',name);await mkdir(dir,{recursive:true});await writeFile(path.join(dir,'source.properties'),`Pkg.Revision=${revision}\n`);}
    const dirs=await sdkToolDirectories(tmp);assert.equal(path.basename(dirs[0]),'latest-2');
  }finally{await rm(tmp,{recursive:true,force:true});}
});
test('host arguments stay literal, stdin works, and commands time out', async () => {
  const hostile="$(touch /tmp/should-never-run); ' & % ^ \"";
  const r=await run(process.execPath,['-e','process.stdout.write(process.argv[1])',hostile]); assert.equal(r.stdout,hostile);
  assert.equal((await run(process.execPath,['-e','process.stdin.pipe(process.stdout)'],{input:'hello'})).stdout,'hello');
  await assert.rejects(run(process.execPath,['-e','setTimeout(()=>{},10000)'],{timeout:25}),/timed out/);
  if(process.platform!=='win32') assert.equal((await run('/bin/sh',['-c',`printf %s ${remoteQuote(hostile)}`])).stdout,hostile);
});
test('ambiguous devices are rejected; coordinates and text are validated before shell', async () => {
  const android=new Android(); android.devices=async()=>[{serial:'one',state:'device'},{serial:'two',state:'device'}];
  await assert.rejects(android.device(),/Multiple/); assert.equal(await android.device('two'),'two');
  let invoked=false; android.shell=async()=>{invoked=true;return {};};
  await assert.rejects(android.input('one',{type:'tap',x:NaN,y:10}),/Coordinate/);
  await assert.rejects(android.input('one',{type:'text',text:'你好'}),/ASCII/); assert.equal(invoked,false);
  await assert.rejects(android.input('one',{type:'key',key:'SHELL;'}),/Unsupported/);
  assert.throws(()=>serialName('x;echo bad')); assert.throws(()=>packageName('com.app;echo'));
  await assert.rejects(buildProject('/tmp', ['--init-script']),/task names/);
});
test('project creation writes a portable, non-destructive Compose project and source evidence', async () => {
  const tmp=await mkdtemp(path.join(os.tmpdir(),'android-project-test-'));
  try {
    const project=await createProject({directory:path.join(tmp,'A Project With Spaces'),name:'A Project',app:'dev.test.app'});
    assert.match(await readFile(path.join(project.directory,'app/build.gradle.kts'),'utf8'),/com.android.application/);
    assert.ok((await readFile(path.join(project.directory,'gradle/wrapper/gradle-wrapper.jar'))).length>30000);
    const hints=await sourceHints(project.directory,{resourceId:'counter',text:'Count: 0'}); assert.ok(hints.some(h=>h.snippet.includes('testTag')));
    await assert.rejects(createProject({directory:project.directory}),/empty/);
    await assert.rejects(createProject({directory:path.join(tmp,'bad'),name:'${evil}'}),/Project name/);
  } finally { await rm(tmp,{recursive:true,force:true}); }
});
test('jobs distinguish success, failure and cancellation', async () => {
  const jobs=new Jobs(); const done=jobs.start('ok',async({onOutput})=>{onOutput('hello');return {ok:true};}); await jobs.jobs.get(done.id).promise;
  assert.equal(jobs.get(done.id).state,'complete'); assert.equal(jobs.get(done.id).log,'hello');
  const failed=jobs.start('bad',async()=>{throw new Error('broken');}); await jobs.jobs.get(failed.id).promise; assert.equal(jobs.get(failed.id).state,'failed');
  const canceled=jobs.start('cancel',({signal})=>new Promise((resolve,reject)=>{if(signal.aborted)return reject(new Error('aborted'));signal.addEventListener('abort',()=>reject(new Error('aborted')));}));
  jobs.cancel(canceled.id);await jobs.jobs.get(canceled.id).promise;assert.equal(jobs.get(canceled.id).state,'canceled');await jobs.close();
});
