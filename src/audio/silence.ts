import type { AudioBufferLike } from '../types';

/** Analysis window for silence detection (seconds). */
export const SILENCE_WINDOW_SEC = 0.1;

export const DEFAULT_SILENCE_THRESHOLD_DB = -45;
export const DEFAULT_MIN_SILENCE_SEC = 0.8;

/**
 * Per-window RMS of the decoded buffer, with energy summed across all
 * channels: a window only counts as silent when every channel is quiet.
 * As in peaks.ts, each window is sampled with a stride that bounds the
 * per-window work so long files stay responsive.
 */
export function computeWindowRms(
  buffer: AudioBufferLike,
  windowSec: number = SILENCE_WINDOW_SEC,
): Float32Array {
  const { sampleRate, length, numberOfChannels } = buffer;
  const winLen = Math.max(1, Math.round(sampleRate * windowSec));
  const count = Math.max(1, Math.ceil(length / winLen));
  const out = new Float32Array(count);
  if (numberOfChannels === 0 || length === 0) return out;

  const channels: Float32Array[] = [];
  for (let c = 0; c < numberOfChannels; c++) channels.push(buffer.getChannelData(c));

  for (let i = 0; i < count; i++) {
    const start = i * winLen;
    const end = Math.min(length, start + winLen);
    const step = Math.max(1, Math.floor((end - start) / 512));
    let sumSq = 0;
    let n = 0;
    for (const data of channels) {
      for (let s = start; s < end; s += step) {
        const v = data[s];
        sumSq += v * v;
        n++;
      }
    }
    out[i] = n > 0 ? Math.sqrt(sumSq / n) : 0;
  }
  return out;
}

/**
 * Merge consecutive below-threshold windows into silence segments and keep
 * those lasting at least `minSilenceSec`; returns the segment midpoints as
 * candidate split points (seconds). `totalDuration` clamps the end of a
 * trailing segment to the real buffer end (the last window may be partial).
 */
export function silencePointsFromRms(
  windows: Float32Array,
  windowSec: number,
  thresholdDb: number,
  minSilenceSec: number,
  totalDuration?: number,
): number[] {
  const threshold = Math.pow(10, thresholdDb / 20);
  const limit = totalDuration ?? Infinity;
  const points: number[] = [];
  let runStart = -1;

  const flush = (endIdx: number) => {
    if (runStart < 0) return;
    const start = runStart * windowSec;
    const end = Math.min(endIdx * windowSec, limit);
    if (end - start >= minSilenceSec - 1e-9) {
      points.push((start + end) / 2);
    }
    runStart = -1;
  };

  for (let i = 0; i < windows.length; i++) {
    if (windows[i] <= threshold) {
      if (runStart < 0) runStart = i;
    } else {
      flush(i);
    }
  }
  flush(windows.length);
  return points;
}
