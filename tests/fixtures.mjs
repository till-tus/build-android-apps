import { deflateSync } from 'node:zlib';
import { parseHierarchy } from '../server/src/hierarchy.mjs';

export const xml = `<?xml version="1.0" encoding="UTF-8"?><hierarchy rotation="0"><node index="0" text="" resource-id="" class="android.widget.FrameLayout" package="dev.test" bounds="[0,0][360,720]" enabled="true"><node index="0" text="Count: 0" resource-id="counter" class="android.widget.Button" package="dev.test" bounds="[30,130][230,190]" clickable="true" enabled="true"/><node index="1" text="secret" password="true" class="android.widget.EditText" package="dev.test" bounds="[30,220][330,280]" focused="true" enabled="true"/></node></hierarchy>`;
export function png(width = 360, height = 720) {
  const signature = Buffer.from([137,80,78,71,13,10,26,10]);
  const crc = data => { let c = 0xffffffff; for (const byte of data) { c ^= byte; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ c >>> 1 : c >>> 1; } return (c ^ 0xffffffff) >>> 0; };
  const chunk = (type, data) => { const t = Buffer.from(type), size = Buffer.alloc(4), checksum = Buffer.alloc(4); size.writeUInt32BE(data.length); checksum.writeUInt32BE(crc(Buffer.concat([t, data]))); return Buffer.concat([size,t,data,checksum]); };
  const hdr = Buffer.alloc(13); hdr.writeUInt32BE(width); hdr.writeUInt32BE(height,4); hdr[8]=8; hdr[9]=2;
  const pixels = Buffer.alloc((width * 3 + 1) * height);
  for (let y=0;y<height;y++) for(let x=0;x<width;x++) { const i=y*(width*3+1)+1+x*3, green=x>30&&x<230&&y>130&&y<190; pixels[i]=green?64:242; pixels[i+1]=green?112:244; pixels[i+2]=green?75:240; }
  return Buffer.concat([signature,chunk('IHDR',hdr),chunk('IDAT',deflateSync(pixels)),chunk('IEND',Buffer.alloc(0))]);
}
export class FakeAndroid {
  constructor() { this.actions=[]; this.tree=parseHierarchy(xml); }
  async device(serial) { if (serial && serial !== 'emulator-5554') throw new Error('Unknown device'); return 'emulator-5554'; }
  async screenshot() { return png(); }
  async inspect() { return { ...this.tree, capturedAt: Date.now(), serial: 'emulator-5554' }; }
  async input(serial, action) { this.actions.push(action); if(action.type==='tap') this.tree.nodes[1].text=`Count: ${this.actions.filter(a=>a.type==='tap').length}`; return {ok:true}; }
}
