import localforage from 'localforage';

import { getSourceAudioBuffer } from './audioData.js';

/**
 * Duplicate detection works on the audio itself, so the same sound is found
 * even when it was saved with another sample rate, bit depth, channel count,
 * volume or a bit of extra silence.
 *
 * Every sample gets a fingerprint: the first part of the sound, as mono at a
 * low sample rate, with silence trimmed and the peak normalized. Two samples
 * are compared with the (normalized) cross-correlation of their fingerprints,
 * allowing a small time shift.
 */

const FINGERPRINT_SAMPLE_RATE = 8000;
const FINGERPRINT_SECONDS = 0.5;
const FINGERPRINT_LENGTH = FINGERPRINT_SAMPLE_RATE * FINGERPRINT_SECONDS;
const SILENCE_THRESHOLD = 0.02; // relative to the peak
const MAX_SHIFT = 8; // samples at 8 kHz, so 1 ms
// bump this when the fingerprint calculation changes
const FINGERPRINT_VERSION = 1;

/** Similarity from which we consider two samples the same sound */
export const DUPLICATE_THRESHOLD = 0.97;
/** Similarity from which two samples are worth comparing by ear */
export const SIMILAR_THRESHOLD = 0.9;

/**
 * @typedef {{
 *   version: number;
 *   data: Float32Array;
 *   energy: number;
 *   duration: number;
 * }} Fingerprint
 */

const fingerprintStore = localforage.createInstance({
  name: 'sample_fingerprints',
  driver: localforage.INDEXEDDB,
});

/**
 * @param {AudioBuffer} audioBuffer
 * @returns {Promise<Fingerprint>}
 */
export async function computeFingerprint(audioBuffer) {
  const length = Math.max(
    1,
    Math.ceil(audioBuffer.duration * FINGERPRINT_SAMPLE_RATE)
  );
  // mix down and resample in one go
  const offlineContext = new OfflineAudioContext(
    1,
    length,
    FINGERPRINT_SAMPLE_RATE
  );
  const source = offlineContext.createBufferSource();
  source.buffer = audioBuffer;
  source.connect(offlineContext.destination);
  source.start();
  const rendered = (await offlineContext.startRendering()).getChannelData(0);

  let peak = 0;
  for (let i = 0; i < rendered.length; i++) {
    peak = Math.max(peak, Math.abs(rendered[i]));
  }
  const data = new Float32Array(FINGERPRINT_LENGTH);
  if (!peak) {
    return { version: FINGERPRINT_VERSION, data, energy: 0, duration: 0 };
  }
  const threshold = peak * SILENCE_THRESHOLD;
  let start = 0;
  while (start < rendered.length && Math.abs(rendered[start]) < threshold) {
    start++;
  }
  let end = rendered.length;
  while (end > start && Math.abs(rendered[end - 1]) < threshold) {
    end--;
  }
  let energy = 0;
  for (let i = 0; i < FINGERPRINT_LENGTH && start + i < end; i++) {
    const value = rendered[start + i] / peak;
    data[i] = value;
    energy += value * value;
  }
  return {
    version: FINGERPRINT_VERSION,
    data,
    energy,
    duration: (end - start) / FINGERPRINT_SAMPLE_RATE,
  };
}

/**
 * Fingerprints are cached by source file, which never changes.
 *
 * @param {import('../store').SampleContainer} sample
 * @returns {Promise<Fingerprint>}
 */
export async function getFingerprint(sample) {
  const { sourceFileId, userFileInfo } = sample.metadata;
  /** @type {Fingerprint | null} */
  const cached = await fingerprintStore.getItem(sourceFileId);
  if (cached && cached.version === FINGERPRINT_VERSION) {
    return cached;
  }
  const audioBuffer = await getSourceAudioBuffer(
    sourceFileId,
    Boolean(userFileInfo)
  );
  const fingerprint = await computeFingerprint(audioBuffer);
  await fingerprintStore.setItem(sourceFileId, fingerprint);
  return fingerprint;
}

/**
 * Normalized cross-correlation (cosine similarity) of two fingerprints, at the
 * best time shift within a millisecond. 1 means identical. Polarity flips
 * count as the same sound.
 *
 * @param {Fingerprint} a
 * @param {Fingerprint} b
 */
export function compareFingerprints(a, b) {
  if (!a.energy || !b.energy) return 0;
  let best = 0;
  for (let shift = -MAX_SHIFT; shift <= MAX_SHIFT; shift++) {
    let sum = 0;
    const from = Math.max(0, -shift);
    const to = Math.min(FINGERPRINT_LENGTH, FINGERPRINT_LENGTH - shift);
    for (let i = from; i < to; i++) {
      sum += a.data[i] * b.data[i + shift];
    }
    best = Math.max(best, Math.abs(sum));
  }
  const similarity = best / Math.sqrt(a.energy * b.energy);
  // A sample and a much shorter cut of it have the same start, but they're
  // not interchangeable: let the length difference count.
  const lengthRatio =
    Math.min(a.duration, b.duration) / Math.max(a.duration, b.duration) || 0;
  return similarity * (0.85 + 0.15 * lengthRatio);
}

/**
 * @typedef {{
 *   sampleIds: string[];
 *   similarity: number; // lowest similarity between linked members
 *   isDuplicate: boolean; // all links are above DUPLICATE_THRESHOLD
 * }} DuplicateGroup
 */

/**
 * Finds groups of samples that sound the same (or almost the same).
 *
 * @param {import('../store').SampleContainer[]} samples
 * @param {(progress: number) => void} onProgress
 * @returns {Promise<DuplicateGroup[]>}
 */
export async function findDuplicates(samples, onProgress) {
  /** @type {{ id: string; fingerprint: Fingerprint }[]} */
  const fingerprints = [];
  for (let i = 0; i < samples.length; i++) {
    onProgress((i / samples.length) * 0.8);
    try {
      fingerprints.push({
        id: samples[i].id,
        fingerprint: await getFingerprint(samples[i]),
      });
    } catch (err) {
      console.warn(`Could not fingerprint ${samples[i].metadata.name}`, err);
    }
  }

  /** @type {{ a: number; b: number; similarity: number }[]} */
  const links = [];
  for (let a = 0; a < fingerprints.length; a++) {
    if (a % 16 === 0) {
      onProgress(0.8 + (a / fingerprints.length) * 0.2);
      // keep the page responsive
      await new Promise((resolve) => setTimeout(resolve));
    }
    for (let b = a + 1; b < fingerprints.length; b++) {
      const similarity = compareFingerprints(
        fingerprints[a].fingerprint,
        fingerprints[b].fingerprint
      );
      if (similarity >= SIMILAR_THRESHOLD) {
        links.push({ a, b, similarity });
      }
    }
  }

  // union-find to turn pairs into groups
  const parent = fingerprints.map((_, i) => i);
  /** @param {number} i @returns {number} */
  const find = (i) => (parent[i] === i ? i : (parent[i] = find(parent[i])));
  for (const { a, b } of links) {
    parent[find(a)] = find(b);
  }
  /** @type {Map<number, DuplicateGroup>} */
  const groups = new Map();
  for (const { a, similarity } of links) {
    const root = find(a);
    const group = groups.get(root) || {
      sampleIds: [],
      similarity: 1,
      isDuplicate: true,
    };
    group.similarity = Math.min(group.similarity, similarity);
    group.isDuplicate = group.similarity >= DUPLICATE_THRESHOLD;
    groups.set(root, group);
  }
  fingerprints.forEach(({ id }, i) => {
    const group = groups.get(find(i));
    if (group) group.sampleIds.push(id);
  });
  onProgress(1);
  return [...groups.values()].sort((a, b) => b.similarity - a.similarity);
}
