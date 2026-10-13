import { useEffect, useState } from 'react';

import {
  compareFingerprints,
  DUPLICATE_THRESHOLD,
  getFingerprint,
  SIMILAR_THRESHOLD,
} from '../utils/duplicates.js';

/** @typedef {import('../store').SampleContainer} SampleContainer */
/** @typedef {import('../utils/duplicates.js').Fingerprint} Fingerprint */

/**
 * @typedef {{
 *   id: string;
 *   level: 'same' | 'similar';
 *   similarity: number;
 * }} DuplicatePartner
 */

/**
 * @typedef {{
 *   level: 'same' | 'similar';
 *   partners: DuplicatePartner[];
 * }} SlotDuplicateInfo
 */

// Kept for the whole session: fingerprints by source file, and the similarity
// of pairs of source files, so editing a set only compares what's new.
/** @type {Map<string, Promise<Fingerprint | null>>} */
const fingerprintMemo = new Map();
/** @type {Map<string, number>} */
const pairMemo = new Map();

/** @param {SampleContainer} sample */
function getFingerprintMemoized(sample) {
  const { sourceFileId } = sample.metadata;
  let promise = fingerprintMemo.get(sourceFileId);
  if (!promise) {
    promise = getFingerprint(sample).catch((err) => {
      console.warn(`Could not fingerprint ${sample.metadata.name}`, err);
      return null;
    });
    fingerprintMemo.set(sourceFileId, promise);
  }
  return promise;
}

/**
 * Finds samples in the set that sound the same as (or very much like) another
 * sample in the set, keyed by sample id.
 *
 * @param {SampleContainer[]} samples in slot order
 * @returns {Map<string, SlotDuplicateInfo>}
 */
export function useSetDuplicates(samples) {
  const [result, setResult] = useState(
    /** @type {Map<string, SlotDuplicateInfo>} */ (new Map())
  );

  const key = samples
    .map((s) => `${s.id}:${s.metadata.sourceFileId}`)
    .join(',');

  useEffect(() => {
    let cancelled = false;
    // wait until the set stops changing (e.g. while adding many samples)
    const timeout = setTimeout(async () => {
      const fingerprints = await Promise.all(
        samples.map(getFingerprintMemoized)
      );
      if (cancelled) return;
      /** @type {Map<string, SlotDuplicateInfo>} */
      const found = new Map();
      /**
       * @param {number} slot
       * @param {DuplicatePartner} partner
       */
      const addPartner = (slot, partner) => {
        const id = samples[slot].id;
        const info = found.get(id) || { level: 'similar', partners: [] };
        info.partners.push(partner);
        if (partner.level === 'same') info.level = 'same';
        found.set(id, info);
      };
      let comparisons = 0;
      for (let a = 0; a < samples.length; a++) {
        for (let b = a + 1; b < samples.length; b++) {
          const fileA = samples[a].metadata.sourceFileId;
          const fileB = samples[b].metadata.sourceFileId;
          const pairKey =
            fileA < fileB ? `${fileA}|${fileB}` : `${fileB}|${fileA}`;
          let similarity = pairMemo.get(pairKey);
          if (similarity === undefined) {
            const fa = fingerprints[a];
            const fb = fingerprints[b];
            similarity =
              fileA === fileB ? 1 : fa && fb ? compareFingerprints(fa, fb) : 0;
            pairMemo.set(pairKey, similarity);
            // keep the page responsive during a full comparison
            if (++comparisons % 500 === 0) {
              await new Promise((resolve) => setTimeout(resolve));
              if (cancelled) return;
            }
          }
          if (similarity >= SIMILAR_THRESHOLD) {
            /** @type {'same' | 'similar'} */
            const level =
              similarity >= DUPLICATE_THRESHOLD ? 'same' : 'similar';
            addPartner(a, { id: samples[b].id, level, similarity });
            addPartner(b, { id: samples[a].id, level, similarity });
          }
        }
      }
      if (!cancelled) setResult(found);
    }, 300);
    return () => {
      cancelled = true;
      clearTimeout(timeout);
    };
    // the key covers the samples and their order
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  return result;
}
