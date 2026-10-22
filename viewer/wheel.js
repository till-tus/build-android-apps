/** Keep one swipe in flight and merge wheel bursts into the next gesture. */
export function wheelInput(send, { delay = 32 } = {}) {
  let pending, timer, busy = false;
  async function flush() {
    timer = undefined;
    if (busy || !pending) return;
    const action = pending; pending = undefined; busy = true;
    try {
      const endX = Math.round(Math.max(0, Math.min(action.width - 1, action.x - action.dx)));
      const endY = Math.round(Math.max(0, Math.min(action.height - 1, action.y - action.dy)));
      if (endX !== action.x || endY !== action.y) await send({ type: 'swipe', x: action.x, y: action.y, endX, endY, duration: 80 });
    } finally { busy = false; if (pending) timer = setTimeout(flush, 0); }
  }
  return {
    push({ x, y, dx, dy, width, height }) {
      const clamp = (value, size) => Math.max(-size * .4, Math.min(size * .4, value));
      pending = { x, y, width, height, dx: clamp((pending?.dx || 0) + dx, width), dy: clamp((pending?.dy || 0) + dy, height) };
      if (!timer && !busy) timer = setTimeout(flush, delay);
    },
    cancel() { pending = undefined; clearTimeout(timer); timer = undefined; }
  };
}
