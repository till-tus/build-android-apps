import test from 'node:test';
import assert from 'node:assert/strict';
import { WebSocket } from 'ws';
import { createViewer, Viewers } from '../server/src/viewer.mjs';
import { FakeAndroid } from './fixtures.mjs';

test('viewer authenticates HTTP/WS, blocks cross-origin requests and forwards only validated input',async()=>{
 const android=new FakeAndroid();const viewer=await createViewer({android,serial:'emulator-5554'});const u=new URL(viewer.url),token=u.hash.slice(1),headers={Authorization:`Bearer ${token}`};
 try {
  assert.equal((await fetch(viewer.origin+'/api/state')).status,401);
  assert.equal((await fetch(viewer.origin+'/api/state',{headers:{...headers,Origin:'https://evil.example'}})).status,403);
  const page=await fetch(viewer.origin);assert.equal(page.status,200);assert.match(page.headers.get('content-security-policy'),/frame-ancestors 'none'/);
  const state=await(await fetch(viewer.origin+'/api/state',{headers})).json();assert.equal(state.width,360);
  const post=action=>fetch(viewer.origin+'/api/input',{method:'POST',headers:{...headers,'Content-Type':'application/json'},body:JSON.stringify(action)});
  assert.equal((await post({type:'tap',x:100,y:160})).status,200);assert.equal(android.actions.length,1);
  assert.equal((await post({type:'shell',command:'whoami'})).status,400);assert.equal(android.actions.length,1);
  assert.equal((await fetch(viewer.origin+'/server/src/cli.mjs')).status,404);
  await new Promise((resolve,reject)=>{const ws=new WebSocket(viewer.origin.replace('http','ws')+'/stream',`android.${token}`,{origin:viewer.origin});ws.on('message',data=>{if(data.toString().includes('hello')){ws.close();resolve();}});ws.on('error',reject);});
  await new Promise((resolve,reject)=>{const ws=new WebSocket(viewer.origin.replace('http','ws')+'/stream',`android.${token}`,{origin:'https://evil.example'});ws.on('unexpected-response',(_,res)=>{assert.equal(res.statusCode,403);ws.terminate();resolve();});ws.on('open',()=>reject(new Error('Cross-origin WS accepted')));ws.on('error',()=>{});});
 }finally{await viewer.close();}
});
test('viewer manager scopes lifecycle by device and does not stop emulators',async()=>{
 const viewers=new Viewers(new FakeAndroid());try{const a=await viewers.start({serial:'emulator-5554'}),b=await viewers.start({serial:'emulator-5554'});assert.equal(a.url,b.url);assert.equal(b.reused,true);await assert.rejects(viewers.stop('other'),/owned/);await viewers.stop('emulator-5554');assert.equal(viewers.entries.size,0);}finally{await viewers.close();}
});
