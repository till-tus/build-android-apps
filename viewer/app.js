import { pick, metadata, connectAnnotations } from './annotations.js';
import { wheelInput } from './wheel.js';
const $ = id => document.getElementById(id), canvas = $('screen'), ctx = canvas.getContext('2d', { alpha: false });
const token = location.hash.slice(1);
const state = { serial: '', width: 1080, height: 1920, tree: { nodes: [], capturedAt: 0 }, selected: null, treeError: undefined };
let inspecting = false, pointer, decoder, socket, reconnectTimer, noticeTimer, videoTimer, annotationSnapshot, frozen = false, forcePng = false, connectionGeneration = 0, needsKey = true, decoderCodec, decodingPng = false, pendingPng, videoHasFrame = false;
function notice(message) { $('notice').textContent = message; $('notice').hidden = false; clearTimeout(noticeTimer); noticeTimer = setTimeout(() => { $('notice').hidden = true; }, 6500); }
async function api(endpoint, value) {
  const res = await fetch(`/api/${endpoint}`, { method: value === undefined ? 'GET' : 'POST', headers: { Authorization: `Bearer ${token}`, ...(value === undefined ? {} : { 'Content-Type': 'application/json' }) }, body: value === undefined ? undefined : JSON.stringify(value) });
  if (!res.ok) { const error = await res.json(); throw new Error(error.error || `HTTP ${res.status}`); }
  return res.headers.get('content-type')?.includes('image/') ? res.blob() : res.json();
}
const input = value => api('input', value).catch(error => notice(error.message));
const wheel = wheelInput(input);
function layout() {
  const area = $('stage'); const usableWidth = Math.max(40, area.clientWidth - 28), usableHeight = Math.max(40, area.clientHeight - 28);
  const dimensions = annotationSnapshot || state;
  const scale = Math.min(usableWidth / dimensions.width, usableHeight / dimensions.height);
  $('screen-wrap').style.width = `${Math.floor(dimensions.width * scale)}px`; $('screen-wrap').style.height = `${Math.floor(dimensions.height * scale)}px`;
  highlight(state.selected); annotations?.invalidate();
}
function draw(frame, width, height) {
  if (frozen) return;
  if (canvas.width !== width || canvas.height !== height) { canvas.width = width; canvas.height = height; layout(); }
  ctx.drawImage(frame, 0, 0, width, height); $('empty').hidden = true;
}
function screenPoint(event) {
  const r = canvas.getBoundingClientRect(); return { x: Math.max(0, Math.min(state.width - 1, Math.round((event.clientX - r.left) / r.width * state.width))), y: Math.max(0, Math.min(state.height - 1, Math.round((event.clientY - r.top) / r.height * state.height))) };
}
function highlight(node) {
  const box = $('selection'); if (!node?.bounds) { box.hidden = true; return; }
  const r = canvas.getBoundingClientRect(), b = node.bounds, dimensions = annotationSnapshot || state;
  box.hidden = false; Object.assign(box.style, { left: `${b.left / dimensions.width * r.width}px`, top: `${b.top / dimensions.height * r.height}px`, width: `${b.width / dimensions.width * r.width}px`, height: `${b.height / dimensions.height * r.height}px` });
}
async function select(node) {
  state.selected = node; highlight(node); if (!node) { $('inspector').hidden = true; layout(); return; }
  $('inspector').hidden = false; $('element-name').textContent = node.text || node.label || node.contentDescription || node.resourceId || node.className.split('.').at(-1);
  $('properties').replaceChildren();
  const values = { 'Resource ID': node.resourceId || '—', Class: node.className, Text: node.text || node.label || '—', Description: node.contentDescription || '—', Bounds: node.bounds ? `[${node.bounds.left},${node.bounds.top}][${node.bounds.right},${node.bounds.bottom}]` : '—' };
  for (const [key, value] of Object.entries(values)) { const dt = document.createElement('dt'), dd = document.createElement('dd'); dt.textContent = key; dd.textContent = value; $('properties').append(dt, dd); }
  $('sources').hidden = true; layout();
  try { const { source } = await api('source', { id: node.id }); if (state.selected?.id !== node.id) return; node.source = source; const cached = state.tree.nodes.find(n => n.id === node.id); if (cached) cached.source = source; if (source.length) { $('sources').hidden = false; $('source-values').textContent = source.map(s => `${s.location}\n${s.snippet}`).join('\n\n'); layout(); } } catch { /* Source candidates are optional. */ }
}
const annotations = connectAnnotations({ canvas, button: $('annotate'), getState: () => annotationSnapshot || state,
  onUnavailable: () => notice('Annotation activation was declined by the host. Check this page’s annotation permissions in Site tools.'),
  onSelection: id => { const node = (annotationSnapshot || state).tree.nodes.find(n => n.id === id); highlight(node); },
  onMode: active => { wheel.cancel(); frozen = active; annotationSnapshot = active ? { ...state, tree: structuredClone(state.tree), snapshotAt: Date.now() } : null; if (!active) { highlight(state.selected); api('inspect', {}).then(t => { state.tree = t; }).catch(() => {}); } }
});
new ResizeObserver(layout).observe($('stage'));
$('inspect').onclick = () => { wheel.cancel(); inspecting = !inspecting; document.body.classList.toggle('inspecting', inspecting); $('inspect').setAttribute('aria-pressed', String(inspecting)); if (inspecting) api('inspect', {}).then(t => { state.tree = t; if (state.treeError) notice('Accessibility hierarchy is unavailable; try refreshing after animations settle.'); }).catch(e => notice(e.message)); else select(null); };
$('close-inspector').onclick = () => select(null);
$('copy').onclick = async () => { if (!state.selected) return; try { await navigator.clipboard.writeText(JSON.stringify(metadata(state.selected, state.serial, state.tree.capturedAt), null, 2)); notice('Element context copied'); } catch { notice('Clipboard access was blocked by the browser'); } };
$('more').onclick = () => { $('menu').hidden = !$('menu').hidden; $('more').setAttribute('aria-expanded', String(!$('menu').hidden)); };
document.addEventListener('click', event => { if (!$('menu').contains(event.target) && !$('more').contains(event.target)) { $('menu').hidden = true; $('more').setAttribute('aria-expanded', 'false'); } });
for (const button of document.querySelectorAll('[data-key]')) button.onclick = () => input({ type: 'key', key: button.dataset.key });
$('power').onclick = () => input({ type: 'key', key: 'POWER' });
$('refresh').onclick = () => api('inspect', {}).then(t => { state.tree = t; notice(`${t.nodes.length} elements refreshed`); }).catch(e => notice(e.message));
$('screenshot').onclick = async () => { try { const blob = await api('screenshot'); const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = `android-${state.serial}-${Date.now()}.png`; a.click(); setTimeout(() => URL.revokeObjectURL(url), 2000); } catch (e) { notice(e.message); } };
$('transport').onclick = () => { forcePng = !forcePng; chooseTransport(); $('transport').textContent = forcePng ? 'Use video transport' : 'Use PNG transport'; };
canvas.addEventListener('pointerdown', event => { if (annotations.active || event.button !== 0) return; wheel.cancel(); event.preventDefault(); canvas.focus(); const p = screenPoint(event); pointer = { ...p, time: performance.now() }; canvas.setPointerCapture(event.pointerId); });
canvas.addEventListener('pointermove', event => { if (!inspecting || annotations.active) return; const p = screenPoint(event); highlight(pick(state.tree.nodes, p.x, p.y)); });
canvas.addEventListener('pointerup', event => {
  if (!pointer || annotations.active) return; const from = pointer; pointer = undefined; const to = screenPoint(event); const elapsed = Math.min(3000, Math.max(80, Math.round(performance.now() - from.time)));
  if (inspecting) { const node = !state.treeError && pick(state.tree.nodes, to.x, to.y); if (node) select(node); else notice('No accessibility element at this point. Use screen annotation for custom-drawn content.'); return; }
  if (Math.hypot(to.x - from.x, to.y - from.y) > 15 || elapsed > 450) input({ type: 'swipe', x: from.x, y: from.y, endX: to.x, endY: to.y, duration: elapsed });
  else input({ type: 'tap', x: to.x, y: to.y });
});
canvas.addEventListener('pointercancel', () => { pointer = undefined; });
canvas.addEventListener('wheel', event => {
  if (annotations.active || inspecting) return; event.preventDefault();
  const point = screenPoint(event), unit = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? state.height : 1;
  wheel.push({ ...point, dx: event.deltaX * unit * 3, dy: event.deltaY * unit * 3, width: state.width, height: state.height });
}, { passive: false });
canvas.addEventListener('keydown', event => {
  if (annotations.active || event.ctrlKey || event.metaKey || event.altKey) return;
  const keys = { Escape: 'BACK', Enter: 'ENTER', Backspace: 'BACKSPACE', Delete: 'DELETE', Tab: 'TAB', ArrowLeft: 'LEFT', ArrowRight: 'RIGHT', ArrowUp: 'UP', ArrowDown: 'DOWN' };
  if (keys[event.key]) { event.preventDefault(); input({ type: 'key', key: keys[event.key] }); }
  else if (event.key.length === 1) { event.preventDefault(); input({ type: 'text', text: event.key }); }
});
canvas.addEventListener('paste', event => { if (annotations.active) return; event.preventDefault(); input({ type: 'text', text: event.clipboardData.getData('text/plain') }); });
document.addEventListener('keydown', event => { if (event.key.toLowerCase() === 'i' && document.activeElement !== canvas && !event.metaKey && !event.ctrlKey && !annotations.active) $('inspect').click(); });
function chooseTransport() {
  if (socket?.readyState !== WebSocket.OPEN) return;
  clearTimeout(videoTimer);
  decoder?.close(); decoder = undefined; needsKey = true; pendingPng = undefined; videoHasFrame = false;
  socket.send(JSON.stringify({ type: 'transport', mode: !forcePng && typeof VideoDecoder === 'function' ? 'h264' : 'png' }));
}
function awaitKeyframe() {
  clearTimeout(videoTimer);
  videoTimer = setTimeout(() => { if (needsKey) { forcePng = true; chooseTransport(); notice('Video could not catch up. Using PNG transport.'); } }, 2500);
}
async function message(event, generation) {
  if (generation !== connectionGeneration) return;
  if (typeof event.data === 'string') {
    const value = JSON.parse(event.data);
    if (value.type === 'hello') { Object.assign(state, { serial: value.serial, width: value.width, height: value.height }); $('device').textContent = value.serial; layout(); chooseTransport(); }
    else if (value.type === 'hierarchy') { state.tree = value; state.treeError = undefined; if (!frozen) annotations.invalidate(); }
    else if (value.type === 'hierarchyError') { state.treeError = value.message; }
    else if (value.type === 'videoConfig') {
      needsKey = true; decoderCodec = value.codec;
      awaitKeyframe();
      decoder?.close(); decoder = new VideoDecoder({ output: frame => { videoHasFrame = true; draw(frame, frame.displayWidth, frame.displayHeight); frame.close(); }, error: () => { forcePng = true; chooseTransport(); notice('Video decoding is unavailable. Using PNG transport.'); } });
      try { decoder.configure({ codec: value.codec, optimizeForLatency: true }); } catch { forcePng = true; chooseTransport(); }
    } else if (value.type === 'fallback') { forcePng = true; chooseTransport(); notice(value.message); }
    else if (value.type === 'error') notice(value.message);
    return;
  }
  const data = new Uint8Array(event.data); if (data[0] === 2) {
    pendingPng = { data, generation };
    if (decodingPng) return;
    decodingPng = true;
    try { while (pendingPng) {
      const next = pendingPng; pendingPng = undefined;
      const bitmap = await createImageBitmap(new Blob([next.data.subarray(1)], { type: 'image/png' }));
      if (next.generation === connectionGeneration && !videoHasFrame) { state.width = bitmap.width; state.height = bitmap.height; draw(bitmap, bitmap.width, bitmap.height); } bitmap.close();
    } } finally { decodingPng = false; }
  } else if (decoder?.state === 'configured') {
    if (decoder.decodeQueueSize > 4) { decoder.reset(); decoder.configure({ codec: decoderCodec, optimizeForLatency: true }); needsKey = true; awaitKeyframe(); }
    if (needsKey && data[0] !== 1) return;
    needsKey = false; clearTimeout(videoTimer);
    try { decoder.decode(new EncodedVideoChunk({ type: data[0] === 1 ? 'key' : 'delta', timestamp: Math.round(performance.now() * 1000), data: data.subarray(1) })); } catch { forcePng = true; chooseTransport(); }
  }
}
function connect() {
  const generation = ++connectionGeneration;
  socket = new WebSocket(`${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/stream`, `android.${token}`); socket.binaryType = 'arraybuffer';
  socket.onmessage = event => message(event, generation).catch(e => notice(e.message));
  socket.onclose = () => { if (generation !== connectionGeneration) return; decoder?.close(); decoder = undefined; notice('Device connection lost. Reconnecting…'); reconnectTimer = setTimeout(connect, 1800); };
  socket.onerror = () => {};
}
if (!/^[a-f0-9]{64}$/.test(token)) { $('empty').replaceChildren(Object.assign(document.createElement('p'), { textContent: 'Open the complete viewer URL returned by viewer_start, including its session key.' })); }
else {
  api('state').then(value => { Object.assign(state, value); connect(); }).catch(error => { $('empty').replaceChildren(Object.assign(document.createElement('p'), { textContent: error.message })); });
}
window.addEventListener('pagehide', () => { wheel.cancel(); connectionGeneration++; pendingPng = undefined; clearTimeout(reconnectTimer); clearTimeout(videoTimer); socket?.close(); decoder?.close(); annotations.dispose(); });
