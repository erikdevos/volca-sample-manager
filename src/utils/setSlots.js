import {
  getCategoryOrder,
  getSampleCategory,
  sampleCategoryCompare,
} from './categories.js';

/**
 * A set's slots: the index is the slot number on the volca, `null` is an empty
 * slot. Samples keep their slot when other samples are added or removed, so
 * the volca only needs the slots that really changed (and patterns keep
 * playing the same sounds).
 *
 * @typedef {(string | null)[]} SetSlots
 */

/** @typedef {import('../store').SampleContainer} SampleContainer */
/** @typedef {(id: string) => SampleContainer | undefined} GetSample */

/**
 * @param {SetSlots} slots
 * @returns {SetSlots}
 */
export function trimSlots(slots) {
  let end = slots.length;
  while (end > 0 && !slots[end - 1]) end--;
  return slots.slice(0, end).map((id) => id || null);
}

/**
 * @param {SetSlots} slots
 * @param {number} from
 * @param {number} slotCount
 */
function findEmptySlot(slots, from, slotCount) {
  for (let i = Math.max(0, from); i < slotCount; i++) {
    if (!slots[i]) return i;
  }
  return -1;
}

/**
 * Picks a slot for a new sample: a gap among the samples of the same
 * category, else the first empty slot after its category (keeping the set
 * grouped like the factory layout), else any empty slot, else after the
 * last slot (which doesn't fit on the volca).
 *
 * @param {SetSlots} slots
 * @param {SampleContainer} sample
 * @param {GetSample} getSample
 * @param {number} slotCount
 * @returns {SetSlots}
 */
export function placeSample(slots, sample, getSample, slotCount) {
  if (slots.includes(sample.id)) return slots;
  const order = getCategoryOrder(getSampleCategory(sample));
  let firstSame = -1;
  let lastSame = -1;
  let lastBefore = -1;
  slots.forEach((id, i) => {
    const other = id ? getSample(id) : undefined;
    if (!other) return;
    const otherOrder = getCategoryOrder(getSampleCategory(other));
    if (otherOrder === order) {
      if (firstSame < 0) firstSame = i;
      lastSame = i;
    }
    if (otherOrder <= order) lastBefore = i;
  });
  let slot = -1;
  if (firstSame >= 0) {
    const gap = findEmptySlot(slots, firstSame, slotCount);
    if (gap >= 0 && gap < lastSame) slot = gap;
  }
  if (slot < 0) slot = findEmptySlot(slots, lastBefore + 1, slotCount);
  if (slot < 0) slot = findEmptySlot(slots, 0, slotCount);
  const newSlots = slots.slice();
  if (slot < 0) {
    newSlots.push(sample.id);
  } else {
    while (newSlots.length < slot) newSlots.push(null);
    newSlots[slot] = sample.id;
  }
  return trimSlots(newSlots);
}

/**
 * Empties the slots of these samples; the other samples stay where they are.
 *
 * @param {SetSlots} slots
 * @param {string[]} ids
 */
export function removeSamples(slots, ids) {
  return trimSlots(slots.map((id) => (id && ids.includes(id) ? null : id)));
}

/**
 * Moves a slot onto another one. If that one is in use, the two swap places.
 *
 * @param {SetSlots} slots
 * @param {number} from
 * @param {number} to
 */
export function moveSlot(slots, from, to) {
  if (from === to || !slots[from]) return slots;
  const newSlots = slots.slice();
  while (newSlots.length <= to) newSlots.push(null);
  [newSlots[from], newSlots[to]] = [newSlots[to] || null, newSlots[from]];
  return trimSlots(newSlots);
}

/**
 * Puts a sample in a slot. If the slot is in use, the samples from there up to
 * the next empty slot move one slot further, so as few slots as possible
 * change.
 *
 * @param {SetSlots} slots
 * @param {string} id
 * @param {number} index
 */
export function insertAtSlot(slots, id, index) {
  const newSlots = slots.map((other) => (other === id ? null : other));
  while (newSlots.length <= index) newSlots.push(null);
  if (newSlots[index]) {
    let gap = newSlots.indexOf(null, index);
    if (gap < 0) gap = newSlots.length;
    newSlots.splice(gap, 1);
    newSlots.splice(index, 0, id);
  } else {
    newSlots[index] = id;
  }
  return trimSlots(newSlots);
}

/**
 * Sorts the set by category and closes all gaps. This renumbers the slots,
 * so it's something to do on purpose.
 *
 * @param {SetSlots} slots
 * @param {GetSample} getSample
 */
export function sortSlotsByCategory(slots, getSample) {
  return /** @type {SampleContainer[]} */ (
    slots.map((id) => (id ? getSample(id) : undefined)).filter(Boolean)
  )
    .sort(sampleCategoryCompare)
    .map((s) => s.id);
}
