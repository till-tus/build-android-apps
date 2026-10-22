// A small host double for the rendering boundary that the API-only double omits.
// Like the desktop host, it inserts a stylesheet into a shadow root, hides the
// system pointer with CSSOM, and positions a replacement cursor using that sheet.
// Keep this fixture independent of the installed host's proprietary renderer.
export function installAnnotationHost() {
  let active = false, surface, root, cursor;
  window.annotationHost = { picks: [], violations: [] };
  document.addEventListener('securitypolicyviolation', event => {
    window.annotationHost.violations.push(event.effectiveDirective);
  });
  const move = event => {
    if (!active) return;
    cursor.style.left = `${event.clientX}px`;
    cursor.style.top = `${event.clientY}px`;
    const target = surface?.hitTest(event);
    window.annotationHost.hovered = target;
    surface?.renderSelection({ hoveredId: target?.id ?? null, selectedId: null });
  };
  document.addEventListener('pointermove', move, true);
  document.addEventListener('click', event => {
    if (!active) return;
    event.preventDefault(); event.stopImmediatePropagation();
    const target = surface?.hitTest(event);
    if (target) window.annotationHost.picks.push(target);
    surface?.renderSelection({ hoveredId: null, selectedId: target?.id ?? null });
  }, true);
  Object.defineProperty(document, 'oai', { value: { annotation: {
    registerSurface(options) { surface = options; return { invalidate() {}, dispose() { surface = null; } }; },
    isActive() { return active; },
    toggle(value = !active) {
      active = value;
      if (active && !root) {
        root = document.createElement('div');
        root.id = 'test-annotation-host';
        Object.assign(root.style, { position: 'fixed', inset: '0', zIndex: '2147483647', cursor: 'none' });
        const shadow = root.attachShadow({ mode: 'open' });
        const sheet = document.createElement('style');
        sheet.textContent = '.annotation-pointer { position: fixed; display: block; width: 24px; height: 24px; border: 2px solid white; border-radius: 50%; background: #0069fb; pointer-events: none; }';
        cursor = document.createElement('span'); cursor.className = 'annotation-pointer';
        cursor.setAttribute('aria-hidden', 'true'); shadow.append(sheet, cursor);
        document.documentElement.append(root);
      }
      if (root) root.hidden = !active;
      document.dispatchEvent(new CustomEvent('oaiannotationmodechange', { detail: { active } }));
      return { accepted: true };
    }
  } } });
}
