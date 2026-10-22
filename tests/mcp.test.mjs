import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

test('bundled MCP initializes, advertises schemas and handles invalid calls without corrupting stdio',async()=>{
 const client=new Client({name:'android-plugin-test',version:'1.0'});const transport=new StdioClientTransport({command:process.execPath,args:[path.resolve('server/dist/cli.mjs'),'mcp'],stderr:'pipe'});
 try {await client.connect(transport);const {tools}=await client.listTools();assert.equal(tools.length,39);assert.ok(tools.find(t=>t.name==='viewer_start'));assert.ok(tools.find(t=>t.name==='inspect').annotations.readOnlyHint);
 for(const name of ['debug_attach','debug_locals','heap_analyze','trace_analyze','frame_summary'])assert.ok(tools.find(t=>t.name===name));
 const unknown=await client.callTool({name:'debug_status',arguments:{session:'00000000-0000-4000-8000-000000000001'}});assert.equal(unknown.isError,true);
 const result=await client.callTool({name:'project_create',arguments:{directory:'/tmp/not-used',name:'Bad ${name}',app:'dev.test'}});assert.equal(result.isError,true);
 const again=await client.listTools();assert.equal(again.tools.length,tools.length);
 }finally{await client.close();}
});
