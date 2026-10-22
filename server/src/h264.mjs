/** Incremental Annex-B parser; supports split start codes and multiple slices per frame. */
export class AnnexB {
  constructor({ onFrame, onConfig }) { this.pending = Buffer.alloc(0); this.parts = []; this.hasVcl = false; this.key = false; this.onFrame = onFrame; this.onConfig = onConfig; this.sps = null; this.pps = null; }
  push(data) {
    this.pending = Buffer.concat([this.pending, data]);
    if (this.pending.length > 8_000_000) throw new Error('Invalid or oversized H.264 NAL');
    const starts = [];
    for (let i = 0; i < this.pending.length - 2; i++) {
      if (this.pending[i] === 0 && this.pending[i + 1] === 0) {
        if (this.pending[i + 2] === 1) { starts.push([i, 3]); i += 2; }
        else if (this.pending[i + 2] === 0 && this.pending[i + 3] === 1) { starts.push([i, 4]); i += 3; }
      }
    }
    for (let i = 0; i + 1 < starts.length; i++) this.nal(this.pending.subarray(starts[i][0] + starts[i][1], starts[i + 1][0]));
    if (starts.length) this.pending = Buffer.from(this.pending.subarray(starts.at(-1)[0]));
    // The next slice header is enough to release the previous access unit. Do
    // not wait for the entire next NAL (or another device frame) to arrive.
    const offset = this.pending[2] === 1 ? 3 : 4;
    if (this.hasVcl && this.pending.length > offset + 1) {
      const type = this.pending[offset] & 31;
      if ([7, 8, 9].includes(type) || ([1, 5].includes(type) && (this.pending[offset + 1] & 128))) this.emit();
    }
  }
  nal(nal) {
    if (!nal.length) return; const type = nal[0] & 31;
    const vcl = type === 1 || type === 5;
    // first_mb_in_slice is ue(v): its leading bit is 1 exactly when value is 0.
    if ((vcl && this.hasVcl && (nal[1] & 128)) || ([7, 8, 9].includes(type) && this.hasVcl)) this.emit();
    if (type === 7) { this.sps = Buffer.from(nal); this.onConfig?.('avc1.' + nal.subarray(1, 4).toString('hex')); }
    if (type === 8) this.pps = Buffer.from(nal);
    this.parts.push(Buffer.from([0, 0, 0, 1]), Buffer.from(nal));
    if (vcl) { this.hasVcl = true; this.key ||= type === 5; }
  }
  emit() {
    if (this.hasVcl) {
      const prefix = this.key && this.sps && this.pps ? [Buffer.from([0, 0, 0, 1]), this.sps, Buffer.from([0, 0, 0, 1]), this.pps] : [];
      this.onFrame(Buffer.concat([...prefix, ...this.parts]), this.key);
    }
    this.parts = []; this.hasVcl = false; this.key = false;
  }
  flush() { const p = this.pending; if (p.length > 4) this.nal(p.subarray(p[2] === 1 ? 3 : 4)); this.pending = Buffer.alloc(0); this.emit(); }
}
