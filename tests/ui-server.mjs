import { createViewer } from '../server/src/viewer.mjs';
import { FakeAndroid } from './fixtures.mjs';
import http from 'node:http';
const android=new FakeAndroid(), viewer=await createViewer({android,serial:'emulator-5554',port:18377,enableVideo:false});
// Only the test harness exposes its session URL and recorded input through a separate loopback port.
const control=http.createServer((req,res)=>{res.setHeader('Content-Type','application/json');res.end(JSON.stringify(req.url==='/actions'?android.actions:{url:viewer.url}));});
control.listen(18378,'127.0.0.1');
for(const sig of ['SIGINT','SIGTERM'])process.on(sig,async()=>{control.close();await viewer.close();process.exit(0);});
