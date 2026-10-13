import localforage from 'localforage';
import { v4 as uuidv4 } from 'uuid';

/** The volca sample has 100 sample slots (00-99). */
export const VOLCA_SLOT_COUNT = 100;

/**
 * KORG specifies about 65 seconds of total sample time. Samples are always
 * stored at 16 bit / 31.25 kHz, regardless of the quality bit depth setting.
 */
export const VOLCA_MEMORY_SECONDS = 65;

/**
 * A set is what you want on the volca: the position in `sampleIds` is the
 * slot number, `null` is an empty slot (see utils/setSlots.js).
 *
 * @typedef {{
 *   id: string;
 *   name: string;
 *   sampleIds: (string | null)[];
 *   dateModified: string;
 * }} VolcaSet
 */

const setStore = localforage.createInstance({
  name: 'volca_sets',
  driver: localforage.INDEXEDDB,
});

/** @param {string} name */
export function createVolcaSet(name) {
  /** @type {VolcaSet} */
  const volcaSet = {
    id: uuidv4(),
    name,
    sampleIds: [],
    dateModified: new Date().toISOString(),
  };
  return volcaSet;
}

/** @returns {Promise<VolcaSet[]>} */
export async function loadVolcaSets() {
  /** @type {VolcaSet[]} */
  const sets = [];
  await setStore.iterate((value) => {
    sets.push(/** @type {VolcaSet} */ (value));
  });
  return sets.sort((a, b) => a.name.localeCompare(b.name));
}

/** @param {VolcaSet} volcaSet */
export async function saveVolcaSet(volcaSet) {
  await setStore.setItem(volcaSet.id, volcaSet);
}

/** @param {string} id */
export async function deleteVolcaSet(id) {
  await setStore.removeItem(id);
}
