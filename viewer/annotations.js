export function pick(nodes, x, y) {
  const leaf = nodes.filter(n => n.bounds && x >= n.bounds.left && x < n.bounds.right && y >= n.bounds.top && y < n.bounds.bottom)
    .sort((a, b) => a.bounds.width * a.bounds.height - b.bounds.width * b.bounds.height || b.depth - a.depth)[0] || null;
  if (leaf && !leaf.resourceId && !leaf.clickable) {
    const byId = new Map(nodes.map(n => [n.id, n])); let parent = byId.get(leaf.parentId);
    while (parent) {
      // Compose commonly exposes the visible text as a child of the tagged button.
      if (parent.clickable && parent.resourceId) return { ...parent, label: leaf.text || leaf.contentDescription || parent.text };
      parent = byId.get(parent.parentId);
    }
  }
  return leaf;
}
export function metadata(node, serial, capturedAt) {
  const values = { device: serial, elementId: node.id, resourceId: node.resourceId, className: node.className, packageName: node.packageName,
    text: node.text || node.label, contentDescription: node.contentDescription, bounds: JSON.stringify(node.bounds), capturedAt: new Date(capturedAt).toISOString(), source: node.source?.[0]?.location || '' };
  const result = {}, encoder = new TextEncoder();
  for (const [key, value] of Object.entries(values)) {
    if (!value) continue;
    const text = String(value).slice(0, 140), next = { ...result, [key]: text };
    if (encoder.encode(JSON.stringify(next)).length <= 2048) result[key] = text;
  }
  return result;
}
export function connectAnnotations({ canvas, getState, onSelection, onMode, button }) {
  const api = document.oai?.annotation;
  let active = Boolean(api?.isActive?.());
  const surface = api?.registerSurface?.({
    element: canvas,
    hitTest({ clientX, clientY }) {
      const state = getState(); const rect = canvas.getBoundingClientRect();
      if (!state.width || !state.height || !rect.width || !rect.height || clientX < rect.left || clientY < rect.top || clientX >= rect.right || clientY >= rect.bottom) return null;
      const x = (clientX - rect.left) / rect.width * state.width, y = (clientY - rect.top) / rect.height * state.height;
      // Use the cached tree synchronously to stay within the host's 250ms deadline.
      const node = !state.treeError && Date.now() - state.tree.capturedAt < 15_000 ? pick(state.tree.nodes, x, y) : null;
      if (!node) return { id: `screen-${Math.round(x)}-${Math.round(y)}`, name: 'Android screen region', role: 'android-screen', metadata: { device: state.serial, x: String(Math.round(x)), y: String(Math.round(y)), hierarchy: 'No current accessibility node' }, rect: { x: clientX - 12, y: clientY - 12, width: 24, height: 24 } };
      const b = node.bounds, sx = rect.width / state.width, sy = rect.height / state.height;
      return { id: node.id, name: node.text || node.label || node.contentDescription || node.resourceId || node.className, role: 'android-element', metadata: metadata(node, state.serial, state.tree.capturedAt),
        rect: { x: rect.left + b.left * sx, y: rect.top + b.top * sy, width: b.width * sx, height: b.height * sy } };
    },
    renderSelection({ hoveredId, selectedId }) { onSelection(selectedId || hoveredId); }
  });
  const modeChange = event => { active = Boolean(event.detail.active); onMode(active); button.setAttribute('aria-pressed', String(active)); };
  document.addEventListener('oaiannotationmodechange', modeChange);
  if (typeof api?.toggle === 'function' && typeof api?.isActive === 'function') {
    button.hidden = false; button.setAttribute('aria-pressed', String(active)); button.onclick = () => api.toggle(!api.isActive());
  }
  onMode(active);
  return { get active() { return active; }, invalidate() { surface?.invalidate(); }, dispose() { surface?.dispose(); document.removeEventListener('oaiannotationmodechange', modeChange); } };
}
