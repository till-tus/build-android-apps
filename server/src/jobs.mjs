import { randomUUID } from 'node:crypto';

export class Jobs {
  constructor() { this.jobs = new Map(); }
  start(label, operation) {
    // Bound memory without discarding a running job.
    for (const [id, job] of this.jobs) if (this.jobs.size >= 60 && !['running', 'canceling'].includes(job.state)) this.jobs.delete(id);
    if (this.jobs.size >= 60) throw new Error('Too many running jobs');
    const job = { id: randomUUID(), label, state: 'running', startedAt: Date.now(), log: '', controller: new AbortController() };
    this.jobs.set(job.id, job);
    job.promise = Promise.resolve().then(() => operation({ signal: job.controller.signal, onOutput: text => { job.log = (job.log + text).slice(-24_000); } })).then(
      result => { job.result = result && typeof result === 'object' ? { ...result, ...(typeof result.stdout === 'string' ? { stdout: result.stdout.slice(-64_000) } : {}), ...(typeof result.stderr === 'string' ? { stderr: result.stderr.slice(-8000) } : {}) } : result; job.state = 'complete'; },
      error => { job.error = error.message; job.state = job.controller.signal.aborted ? 'canceled' : 'failed'; }
    ).finally(() => { job.finishedAt = Date.now(); });
    return this.get(job.id);
  }
  get(id) { const job = this.jobs.get(id); if (!job) throw new Error('Unknown job ID'); const { controller, promise, ...publicJob } = job; return publicJob; }
  cancel(id) { const job = this.jobs.get(id); if (!job) throw new Error('Unknown job ID'); if (job.state === 'running') { job.state = 'canceling'; job.controller.abort(); } return this.get(id); }
  async close() { for (const job of this.jobs.values()) if (job.state === 'running') job.controller.abort(); await Promise.all([...this.jobs.values()].map(j => j.promise)); }
}
