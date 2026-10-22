import http from 'node:http';
import { randomBytes, timingSafeEqual } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { WebSocketServer, WebSocket } from 'ws';
import { z } from 'zod';
import { VideoStream } from './stream.mjs';
import { sourceHints } from './source.mjs';

const actionSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('tap'), x: z.number().int().min(0).max(32768), y: z.number().int().min(0).max(32768) }),
  z.object({ type: z.literal('swipe'), x: z.number().int().min(0).max(32768), y: z.number().int().min(0).max(32768), endX: z.number().int().min(0).max(32768), endY: z.number().int().min(0).max(32768), duration: z.number().int().min(50).max(5000).optional() }),
  z.object({ type: z.literal('key'), key: z.string().max(20) }),
  z.object({ type: z.literal('text'), text: z.string().max(2000) })
]);
const contentTypes = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml' };
export const viewerRoot = fileURLToPath(new URL('../../viewer/', import.meta.url));
export function tokenEqual(a, b) { const x = Buffer.from(a || ''), y = Buffer.from(b || ''); return x.length === y.length && timingSafeEqual(x, y); }

async function body(req) {
  let data = ''; for await (const chunk of req) { data += chunk; if (data.length > 16_384) throw new Error('Request body too large'); }
  return JSON.parse(data || '{}');
}

export async function createViewer({ android, serial, project, port = 0, assets = viewerRoot, enableVideo = true }) {
  serial = await android.device(serial);
  const token = randomBytes(32).toString('hex'); const clients = new Set(); let tree = { nodes: [], capturedAt: 0 }, treeError;
  let png, width = 1080, height = 1920, closed = false, video, codec, refreshBusy = false, inputQueue = Promise.resolve(), inputCount = 0;
  const sockets = new Set();
  const json = (res, value, code = 200) => { res.writeHead(code, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(value)); };
  const broadcast = value => { for (const ws of clients) if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(value)); };
  const refreshTree = async () => {
    if (refreshBusy || closed) return tree; refreshBusy = true;
    try { tree = await android.inspect(serial, { fresh: true }); treeError = undefined; broadcast({ type: 'hierarchy', ...tree }); }
    catch (e) { treeError = e.message; broadcast({ type: 'hierarchyError', message: treeError }); }
    finally { refreshBusy = false; } return tree;
  };
  const capture = async () => {
    png = await android.screenshot(serial); width = png.readUInt32BE(16); height = png.readUInt32BE(20); return png;
  };
  // A real frame is required before returning a viewer URL.
  await capture();
  const server = http.createServer(async (req, res) => {
    res.setHeader('Cache-Control', 'no-store'); res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader('X-Content-Type-Options', 'nosniff'); res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' blob: data:; connect-src 'self' ws://127.0.0.1:* ws://localhost:*; frame-ancestors 'none'; base-uri 'none'; form-action 'none'");
    try {
      if (!allowedHost(req.headers.host)) return json(res, { error: 'Invalid host' }, 403);
      const url = new URL(req.url, origin);
      if (url.pathname.startsWith('/api/')) {
        if (req.headers.origin && !allowedOrigin(req.headers.origin)) return json(res, { error: 'Origin denied' }, 403);
        if (!tokenEqual(req.headers.authorization, `Bearer ${token}`)) return json(res, { error: 'Unauthorized' }, 401);
        if (req.method === 'GET' && url.pathname === '/api/state') return json(res, { serial, width, height, tree, treeError, video: Boolean(codec), project });
        if (req.method === 'GET' && url.pathname === '/api/screenshot') { const frame = await capture(); res.writeHead(200, { 'Content-Type': 'image/png' }); return res.end(frame); }
        if (req.method === 'POST' && url.pathname === '/api/input') {
          if (inputCount >= 20) return json(res, { error: 'Input queue is full' }, 429);
          const action = actionSchema.parse(await body(req)); inputCount++;
          const operation = inputQueue.then(() => android.input(serial, action)); inputQueue = operation.catch(() => {});
          try { await operation; } finally { inputCount--; }
          setTimeout(() => refreshTree(), 350); return json(res, { ok: true });
        }
        if (req.method === 'POST' && url.pathname === '/api/inspect') return json(res, await refreshTree());
        if (req.method === 'POST' && url.pathname === '/api/source') {
          const { id } = z.object({ id: z.string().max(40) }).parse(await body(req));
          const node = tree.nodes.find(n => n.id === id); if (!node) return json(res, { error: 'Element no longer exists' }, 404);
          return json(res, { source: await sourceHints(project, node) });
        }
        return json(res, { error: 'Unknown endpoint' }, 404);
      }
      if (req.method !== 'GET') return json(res, { error: 'Method not allowed' }, 405);
      const name = url.pathname === '/' ? 'index.html' : url.pathname.slice(1);
      if (!['index.html', 'app.js', 'style.css', 'annotations.js', 'icon.svg'].includes(name)) return json(res, { error: 'Not found' }, 404);
      res.setHeader('Content-Type', contentTypes[path.extname(name)]); res.end(await readFile(path.join(assets, name)));
    } catch (e) { json(res, { error: e.message }, e instanceof z.ZodError ? 400 : 500); }
  });
  let origin;
  const allowedHost = host => host === `127.0.0.1:${server.address()?.port}` || host === `localhost:${server.address()?.port}`;
  const allowedOrigin = value => { try { return allowedHost(new URL(value).host) && new URL(value).protocol === 'http:'; } catch { return false; } };
  server.on('connection', socket => { sockets.add(socket); socket.on('close', () => sockets.delete(socket)); });
  const wss = new WebSocketServer({ noServer: true, maxPayload: 4096 });
  server.on('upgrade', (req, socket, head) => {
    if (req.url !== '/stream' || !allowedHost(req.headers.host) || !allowedOrigin(req.headers.origin) || !tokenEqual(req.headers['sec-websocket-protocol'], `android.${token}`)) { socket.end('HTTP/1.1 403 Forbidden\r\n\r\n'); return; }
    if (clients.size >= 4) { socket.end('HTTP/1.1 429 Too Many Requests\r\n\r\n'); return; }
    wss.handleUpgrade(req, socket, head, ws => wss.emit('connection', ws, req));
  });
  function startVideo() {
    if (video || ![...clients].some(c => c.mode === 'h264')) return;
    codec = undefined;
    video = new VideoStream(serial,
      value => { codec = value; for (const c of clients) if (c.mode === 'h264') c.send(JSON.stringify({ type: 'videoConfig', codec })); },
      (frame, key) => { for (const c of clients) if (c.mode === 'h264' && c.readyState === WebSocket.OPEN) {
        if (c.bufferedAmount > 2_000_000) { c.needsKey = true; continue; }
        if (c.needsKey && !key) continue; c.needsKey = false; c.send(Buffer.concat([Buffer.from([key ? 1 : 0]), frame]));
      } },
      error => { video?.stop(); video = null; codec = undefined; for (const c of clients) c.mode = 'png'; broadcast({ type: 'fallback', message: error.message }); });
    video.start(width, height).catch(error => { video?.stop(); video = null; broadcast({ type: 'fallback', message: error.message }); for (const c of clients) c.mode = 'png'; });
  }
  wss.on('connection', async ws => {
    clients.add(ws); ws.mode = 'png'; ws.needsKey = true;
    ws.on('error', () => {});
    ws.on('close', () => { clients.delete(ws); if (!clients.size) { video?.stop(); video = null; codec = undefined; } });
    // Reopening a viewer must not briefly show the image captured at server startup.
    try { await capture(); } catch (e) { ws.send(JSON.stringify({ type: 'error', message: e.message })); ws.close(1011); return; }
    if (ws.readyState !== WebSocket.OPEN) return;
    ws.send(JSON.stringify({ type: 'hello', serial, width, height })); ws.send(Buffer.concat([Buffer.from([2]), png]));
    ws.send(JSON.stringify({ type: 'hierarchy', ...tree }));
    ws.on('message', raw => { try {
      const message = JSON.parse(raw.toString());
      if (message.type === 'transport') { ws.mode = message.mode === 'h264' && enableVideo ? 'h264' : 'png'; if (ws.mode === 'h264') { if (codec) ws.send(JSON.stringify({ type: 'videoConfig', codec })); startVideo(); } }
      if (![...clients].some(c => c.mode === 'h264')) { video?.stop(); video = null; codec = undefined; }
    } catch { ws.close(1008, 'Invalid message'); } });
    refreshTree();
  });
  let frameTimer, treeTimer;
  const frameLoop = async () => {
    if (closed) return;
    try { if ([...clients].some(c => c.mode === 'png')) {
      const frame = await capture(); for (const c of clients) if (c.mode === 'png' && c.readyState === WebSocket.OPEN && c.bufferedAmount < 1_000_000) c.send(Buffer.concat([Buffer.from([2]), frame]));
    } } catch (e) { broadcast({ type: 'error', message: e.message }); }
    if (!closed) frameTimer = setTimeout(frameLoop, 250);
  };
  server.requestTimeout = 30_000; server.headersTimeout = 10_000;
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(port, '127.0.0.1', resolve); });
  origin = `http://127.0.0.1:${server.address().port}`;
  frameLoop(); treeTimer = setInterval(() => { if (clients.size) refreshTree(); }, 5000);
  return { serial, project, url: `${origin}/#${token}`, origin,
    async close() { closed = true; clearTimeout(frameTimer); clearInterval(treeTimer); video?.stop(); for (const ws of clients) ws.terminate(); wss.close(); await new Promise(resolve => { server.close(resolve); for (const socket of sockets) socket.destroy(); }); }
  };
}

export class Viewers {
  constructor(android) { this.android = android; this.entries = new Map(); }
  async start(options) {
    const serial = await this.android.device(options.serial);
    const existing = this.entries.get(serial); if (existing) return { serial, url: existing.url, reused: true };
    const viewer = await createViewer({ ...options, android: this.android, serial }); this.entries.set(serial, viewer);
    return { serial, url: viewer.url, reused: false };
  }
  async stop(serial) { const viewer = this.entries.get(serial); if (!viewer) throw new Error('No viewer owned by this server for that serial'); await viewer.close(); this.entries.delete(serial); return { stopped: serial }; }
  async close() { await Promise.all([...this.entries.values()].map(v => v.close())); this.entries.clear(); }
}
