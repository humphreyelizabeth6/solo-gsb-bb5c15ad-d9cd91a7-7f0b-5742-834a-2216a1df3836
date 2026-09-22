import {
  moveChapter,
  resizeChapter,
  createChapterInGap,
  findFreeGap,
  filterSplitPoints,
  splitGapsAt,
  MIN_CHAPTER_DURATION,
} from '../src/utils/chapterOps';
import { computeWindowRms, silencePointsFromRms } from '../src/audio/silence';
import type { AudioBufferLike, Chapter } from '../src/types';

const D = 100; // duration
const mk = (id: string, start: number, end: number): Chapter => ({ id, title: id, start, end });
let failures = 0;
function eq(actual: unknown, expected: unknown, msg: string) {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a !== e) {
    failures++;
    console.error(`FAIL ${msg}: expected ${e}, got ${a}`);
  } else {
    console.log(`ok ${msg}`);
  }
}
function approxEq(actual: number[], expected: number[], msg: string, tol = 1e-9) {
  const ok =
    actual.length === expected.length && actual.every((v, i) => Math.abs(v - expected[i]) < tol);
  if (!ok) {
    failures++;
    console.error(`FAIL ${msg}: expected ~${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  } else {
    console.log(`ok ${msg}`);
  }
}

// --- move: clamped by next chapter (no overlap) ---
{
  const cs = [mk('a', 10, 20), mk('b', 30, 40)];
  const r = moveChapter(cs, 'a', 25, D, 0)!; // would overlap b
  eq(r, { start: 20, end: 30 }, 'move clamped at next.start');
}
// --- move: clamped by prev chapter ---
{
  const cs = [mk('a', 10, 20), mk('b', 30, 40)];
  const r = moveChapter(cs, 'b', 5, D, 0)!;
  eq(r, { start: 20, end: 30 }, 'move clamped at prev.end');
}
// --- move: snaps to neighbor boundary within threshold ---
{
  const cs = [mk('a', 10, 20), mk('b', 30, 40)];
  const r = moveChapter(cs, 'b', 20.3, D, 0.5)!; // start 20.3 near a.end=20
  eq(r, { start: 20, end: 30 }, 'move snaps start to prev end');
}
// --- move: snaps end to file duration ---
{
  const cs = [mk('a', 10, 20)];
  const r = moveChapter(cs, 'a', 89.7, D, 0.5)!; // end 99.7 near 100
  eq(r, { start: 90, end: 100 }, 'move snaps end to duration');
}
// --- resize: cannot cross neighbor ---
{
  const cs = [mk('a', 10, 20), mk('b', 30, 40)];
  const r = resizeChapter(cs, 'a', 'end', 50, D, 0)!;
  eq(r, { start: 10, end: 30 }, 'resize end clamped at next.start');
}
// --- resize: min duration enforced ---
{
  const cs = [mk('a', 10, 20)];
  const r = resizeChapter(cs, 'a', 'start', 19.99, D, 0)!;
  eq(r, { start: 20 - MIN_CHAPTER_DURATION, end: 20 }, 'resize start min duration');
}
// --- resize: snaps to neighbor edge ---
{
  const cs = [mk('a', 10, 20), mk('b', 30, 40)];
  const r = resizeChapter(cs, 'b', 'start', 20.2, D, 0.5)!;
  eq(r, { start: 20, end: 40 }, 'resize start snaps to prev end');
}
// --- create in gap: shrinks to gap ---
{
  const cs = [mk('a', 10, 20), mk('b', 30, 40)];
  const r = createChapterInGap(cs, 15, 35, D, 0)!;
  eq(r, { start: 20, end: 30 }, 'create shrinks into gap');
}
// --- create fully covered -> null ---
{
  const cs = [mk('a', 10, 50)];
  eq(createChapterInGap(cs, 20, 30, D, 0), null, 'create fully covered null');
}
// --- create too small -> null ---
{
  eq(createChapterInGap([], 10, 10.1, D, 0), null, 'create tiny null');
}
// --- create snaps edges to neighbors ---
{
  const cs = [mk('a', 10, 20)];
  const r = createChapterInGap(cs, 20.2, 50, D, 0.5)!;
  eq(r, { start: 20, end: 50 }, 'create snaps start to neighbor end');
}
// --- findFreeGap skips occupied space ---
{
  const cs = [mk('a', 0, 5), mk('b', 5, 12)];
  eq(findFreeGap(cs, 2, 5, D), { start: 12, end: 17 }, 'free gap after chapters');
}
// --- findFreeGap fits before next chapter ---
{
  const cs = [mk('a', 10, 20)];
  eq(findFreeGap(cs, 0, 5, D), { start: 0, end: 5 }, 'free gap at start');
}
// --- no room at all ---
{
  const cs = [mk('a', 0, 100)];
  eq(findFreeGap(cs, 0, 5, D), null, 'no room null');
}

// --- filterSplitPoints: drops points inside chapters ---
{
  eq(filterSplitPoints([15], [mk('a', 10, 20)], D), [], 'split point inside chapter dropped');
}
// --- filterSplitPoints: keeps points in free gaps ---
{
  eq(filterSplitPoints([5, 25], [mk('a', 10, 20)], D), [5, 25], 'split points in gaps kept');
}
// --- filterSplitPoints: drops points that would create < 0.2s chapters ---
{
  // 0.1 too close to file start; 9.85 too close to a.start; 20.1 too close to a.end
  eq(
    filterSplitPoints([0.1, 9.85, 20.1], [mk('a', 10, 20)], D),
    [],
    'split points too close to edges dropped',
  );
}
// --- filterSplitPoints: exactly MIN_CHAPTER_DURATION from edge is kept ---
{
  eq(
    filterSplitPoints([9.8, 20.2], [mk('a', 10, 20)], D),
    [9.8, 20.2],
    'split points at exactly min distance kept',
  );
}
// --- filterSplitPoints: two points closer than 0.2s -> later one dropped ---
{
  eq(filterSplitPoints([5, 5.1, 5.35], [], D), [5, 5.35], 'crowded split points thinned');
}
// --- filterSplitPoints: unsorted input is sorted ---
{
  eq(filterSplitPoints([30, 10], [], D), [10, 30], 'split points sorted');
}

// --- splitGapsAt: empty timeline splits into chained ranges ---
{
  eq(
    splitGapsAt([], [10, 20], 30),
    [
      { start: 0, end: 10 },
      { start: 10, end: 20 },
      { start: 20, end: 30 },
    ],
    'split empty timeline',
  );
}
// --- splitGapsAt: only the gap containing points is split ---
{
  eq(
    splitGapsAt([mk('a', 5, 8)], [10], 30),
    [
      { start: 8, end: 10 },
      { start: 10, end: 30 },
    ],
    'split gap after chapter keeps chapter',
  );
}
// --- splitGapsAt: fully covered timeline -> nothing ---
{
  eq(splitGapsAt([mk('a', 0, 30)], [10], 30), [], 'no split when fully covered');
}
// --- splitGapsAt: point too close to edge -> nothing ---
{
  eq(splitGapsAt([], [0.05], 30), [], 'split too close to edge dropped');
}
// --- splitGapsAt: result never overlaps existing chapters ---
{
  const ranges = splitGapsAt([mk('a', 10, 20), mk('b', 30, 40)], [5, 25, 50], D);
  eq(
    ranges,
    [
      { start: 0, end: 5 },
      { start: 5, end: 10 },
      { start: 20, end: 25 },
      { start: 25, end: 30 },
      { start: 40, end: 50 },
      { start: 50, end: 100 },
    ],
    'split every gap, no overlap',
  );
}

// --- silence detection: synthetic buffer, 10 samples/s -> 1 sample per 100ms window ---
function mkBuffer(channels: Float32Array[], sampleRate: number): AudioBufferLike {
  return {
    duration: channels[0].length / sampleRate,
    length: channels[0].length,
    sampleRate,
    numberOfChannels: channels.length,
    getChannelData: (c) => channels[c],
  };
}
{
  // 5s loud, 2s silent, 3s loud
  const data = new Float32Array(100);
  data.fill(0.5, 0, 50);
  data.fill(0.5, 70, 100);
  const rms = computeWindowRms(mkBuffer([data], 10), 0.1);
  eq(rms.length, 100, 'window rms count');
  approxEq([rms[0], rms[55]], [0.5, 0], 'window rms values');
  // silent run = windows 50..69 -> [5s, 7s] -> midpoint 6s
  approxEq(silencePointsFromRms(rms, 0.1, -40, 1.0, 10), [6], 'silence midpoint detected');
  // same run is shorter than a 3s minimum -> no candidate
  eq(silencePointsFromRms(rms, 0.1, -40, 3.0, 10), [], 'short silence ignored');
}
// --- silence detection: any loud channel keeps the window non-silent ---
{
  const silent = new Float32Array(100);
  const loud = new Float32Array(100).fill(0.5);
  const rms = computeWindowRms(mkBuffer([silent, loud], 10), 0.1);
  eq(silencePointsFromRms(rms, 0.1, -40, 0.5, 10), [], 'loud channel prevents silence');
}
// --- silence detection: trailing segment clamped to real duration ---
{
  // 105 samples at 100 samples/s -> 10 full windows + 1 partial; all silent
  const rms = computeWindowRms(mkBuffer([new Float32Array(105)], 100), 0.1);
  eq(rms.length, 11, 'partial last window counted');
  // segment is [0, 1.05] (not [0, 1.1]) -> midpoint 0.525
  approxEq(silencePointsFromRms(rms, 0.1, -40, 0.5, 1.05), [0.525], 'trailing silence clamped');
}

console.log(failures === 0 ? 'ALL PASS' : `${failures} FAILURES`);
process.exit(failures === 0 ? 0 : 1);
