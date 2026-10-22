import { spawn } from 'node:child_process';
import { executable } from './paths.mjs';
import { AnnexB } from './h264.mjs';

export class VideoStream {
  constructor(serial, onConfig, onFrame, onError) { Object.assign(this, { serial, onConfig, onFrame, onError }); this.stopped = false; }
  async start(width, height) {
    if (this.stopped) return;
    const scale = Math.min(1, 1600 / Math.max(width, height));
    const size = [width, height].map(v => Math.floor(v * scale / 2) * 2).join('x');
    const parser = new AnnexB({ onFrame: this.onFrame, onConfig: this.onConfig });
    const child = spawn(await executable('adb'), ['-s', this.serial, 'exec-out', 'screenrecord', '--output-format=h264', '--bit-rate', '6000000', '--size', size, '--time-limit', '170', '-'], { windowsHide: true, shell: false, stdio: ['ignore', 'pipe', 'pipe'] });
    this.child = child; let errorText = '', frames = 0;
    const original = parser.onFrame; parser.onFrame = (...args) => { frames++; original(...args); };
    const startup = setTimeout(() => { if (!frames) { this.onError(new Error('H.264 stream unavailable; using screenshot transport')); this.stop(); } }, 10_000);
    child.stdout.on('data', data => { try { parser.push(data); } catch (e) { this.onError(e); this.stop(); } });
    child.stderr.on('data', data => { errorText = (errorText + data).slice(-2000); });
    child.once('error', error => { clearTimeout(startup); this.onError(error); });
    child.once('close', () => {
      clearTimeout(startup); parser.flush();
      if (!this.stopped && frames) this.restart = setTimeout(() => this.start(width, height).catch(this.onError), 150);
      else if (!this.stopped) this.onError(new Error(errorText || 'H.264 encoder exited'));
    });
  }
  stop() { this.stopped = true; clearTimeout(this.restart); this.child?.kill(); }
}
