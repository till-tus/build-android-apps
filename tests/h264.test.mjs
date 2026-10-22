import test from 'node:test';
import assert from 'node:assert/strict';
import { AnnexB } from '../server/src/h264.mjs';

test('Annex-B handles split start codes, SPS/PPS, IDR and multiple slices',()=>{
  const frames=[],configs=[]; const parser=new AnnexB({onFrame:(data,key)=>frames.push({data,key}),onConfig:c=>configs.push(c)});
  const nals=[[0x67,0x42,0,0x1e],[0x68,0xce,0x06],[0x65,0x80,0xaa],[0x65,0x40,0xbb],[0x41,0x80,0xcc],[0x41,0x80,0xdd]];
  const stream=Buffer.concat(nals.map((n,i)=>Buffer.from([...(i%2?[0,0,1]:[0,0,0,1]),...n])));
  for(let i=0;i<stream.length;i+=2)parser.push(stream.subarray(i,i+2));parser.flush();
  assert.deepEqual(configs,['avc1.42001e']);assert.equal(frames.length,3);assert.equal(frames[0].key,true);assert.equal(frames[1].key,false);
  assert.ok(frames[0].data.includes(Buffer.from([0x65,0x40,0xbb])));
});
