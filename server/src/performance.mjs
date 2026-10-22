import path from 'node:path';
import { stat } from 'node:fs/promises';
import { run } from './process.mjs';
import { packageName } from './android.mjs';

/** CSV emitted by trace_processor query, including quoted commas/newlines. */
export function parseCsv(text) {
  const rows = []; let row = [], field = '', quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (c === '"') { if (quoted && text[i + 1] === '"') { field += '"'; i++; } else quoted = !quoted; }
    else if (c === ',' && !quoted) { row.push(field); field = ''; }
    else if ((c === '\n' || c === '\r') && !quoted) {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(field); if (row.some(v => v.length)) rows.push(row); row = []; field = '';
    } else field += c;
  }
  if (quoted) throw new Error('Unterminated trace processor CSV');
  if (field || row.length) { row.push(field); rows.push(row); }
  const headers = rows.shift() || [];
  return rows.map(values => Object.fromEntries(headers.map((key, i) => [key, values[i] === '[NULL]' ? null : values[i]])));
}

export function frameSummary(text) {
  const durations = []; let indexes;
  for (const line of text.split(/\r?\n/)) {
    const values = line.split(',').map(s => s.trim());
    if (values.includes('IntendedVsync') && values.includes('FrameCompleted')) { indexes = Object.fromEntries(values.map((name, i) => [name, i])); continue; }
    if (!indexes || !/^\d+$/.test(values[0]) || Number(values[indexes.Flags]) !== 0) continue;
    try {
      const start = BigInt(values[indexes.IntendedVsync]), end = BigInt(values[indexes.FrameCompleted]);
      if (start > 0n && end >= start && end < 9223372036854775807n) durations.push(Number(end - start) / 1e6);
    } catch { /* Ignore partial rows and non-frame headers. */ }
  }
  durations.sort((a, b) => a - b);
  const percentile = p => durations.length ? durations[Math.max(0, Math.ceil(durations.length * p) - 1)] : null;
  return { samples: durations.length, p50Ms: percentile(.5), p90Ms: percentile(.9), p95Ms: percentile(.95), p99Ms: percentile(.99), maxMs: durations.at(-1) ?? null,
    over16_67Ms: durations.filter(n => n > 1000 / 60).length, over33_33Ms: durations.filter(n => n > 1000 / 30).length,
    note: 'gfxinfo samples exclude flagged frames; fixed thresholds are duration buckets, not refresh-rate-aware jank or end-to-end input latency.' };
}

export function traceQueries(app) {
  packageName(app);
  const processFilter = `(p.name = '${app}' OR p.name GLOB '${app}:*')`;
  return {
    cpu: `SELECT p.name AS process, t.name AS thread, t.tid, ROUND(SUM(s.dur)/1e6,3) AS cpu_ms FROM sched_slice s JOIN thread t USING(utid) JOIN process p USING(upid) WHERE s.dur > 0 AND ${processFilter} GROUP BY t.utid ORDER BY SUM(s.dur) DESC LIMIT 30`,
    slices: `SELECT t.name AS thread, s.name AS slice, COUNT(*) AS samples, ROUND(SUM(s.dur)/1e6,3) AS total_ms, ROUND(MAX(s.dur)/1e6,3) AS max_ms FROM slice s JOIN thread_track tt ON tt.id=s.track_id JOIN thread t USING(utid) JOIN process p USING(upid) WHERE s.dur > 0 AND ${processFilter} GROUP BY t.utid,s.name ORDER BY SUM(s.dur) DESC LIMIT 30`,
    frames: `SELECT jank_type, present_type, COUNT(*) AS samples, ROUND(AVG(f.dur)/1e6,3) AS avg_ms, ROUND(MAX(f.dur)/1e6,3) AS max_ms FROM actual_frame_timeline_slice f JOIN process p USING(upid) WHERE f.dur >= 0 AND ${processFilter} GROUP BY jank_type,present_type ORDER BY COUNT(*) DESC LIMIT 30`
  };
}

export async function analyzeTrace({ input, app, processor = process.env.ANDROID_PLUGIN_TRACE_PROCESSOR }, { signal } = {}) {
  const queries = traceQueries(app), file = path.resolve(input);
  if (!(await stat(file)).isFile()) throw new Error('Trace input must be a local file');
  if (!processor || !path.isAbsolute(processor)) throw new Error('Set ANDROID_PLUGIN_TRACE_PROCESSOR or processor to an absolute native trace_processor executable (https://perfetto.dev/docs/reference/trace-processor-cli). No trace is uploaded.');
  const result = { input: file, app, queries, sections: {}, warnings: [] };
  for (const [name, sql] of Object.entries(queries)) {
    try {
      const value = await run(processor, ['query', file, sql], { signal, timeout: 120_000, maxBytes: 2_000_000 });
      result.sections[name] = parseCsv(value.stdout);
      if (!result.sections[name].length) result.warnings.push(`${name}: no matching events; verify package, capture sources and Android version.`);
    } catch (error) {
      if (signal?.aborted || name !== 'frames' || !/no such (?:table|column)/i.test(error.stdout + error.stderr + error.message)) throw error;
      result.warnings.push('FrameTimeline is unavailable in this trace/processor; CPU and slice results remain usable.');
    }
  }
  result.note = 'Scheduler CPU time and inclusive trace slices are not sampled method flamegraphs. Missing data is not evidence of zero cost. FrameTimeline sample counts can include multiple app surfaces.';
  return result;
}
