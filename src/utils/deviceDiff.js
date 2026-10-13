/**
 * What the app believes is in one slot of the volca sample:
 * - `null`: empty
 * - `'unknown'`: we don't know (never synced, or a transfer may have failed)
 * - an object: the sample we sent, with a key for its audio
 *
 * @typedef {null | 'unknown' | {
 *   sampleId: string;
 *   contentKey: string;
 *   name: string;
 * }} DeviceSlot
 */

/**
 * @typedef {{
 *   slots: DeviceSlot[];
 *   updatedAt: string | null;
 * }} DeviceState
 */

/**
 * - `unchanged`: this sample is already in this slot
 * - `changed`: another sample (or other audio settings) is in this slot
 * - `new`: the slot is empty on the volca
 * - `unknown`: we don't know what's in the slot, so we send it
 * - `erase`: the slot is empty in the set, but not on the volca
 * - `empty`: empty in the set and on the volca
 * - `unknownEmpty`: empty in the set, unknown on the volca
 *
 * @typedef {'unchanged'
 *   | 'changed'
 *   | 'new'
 *   | 'unknown'
 *   | 'erase'
 *   | 'empty'
 *   | 'unknownEmpty'} SlotSyncStatus
 */

/**
 * @typedef {{
 *   statuses: SlotSyncStatus[];
 *   toSend: number[];
 *   toErase: number[];
 *   unknownEmpty: number[];
 *   unchanged: number;
 *   isKnown: boolean;
 *   inSync: boolean;
 * }} DeviceDiff
 */

/**
 * Everything that changes the audio that ends up on the volca. Two samples
 * with the same key sound the same on the volca, even if they're different
 * samples in the app.
 *
 * @param {import('../store').SampleMetadata} metadata
 */
export function getContentKey(metadata) {
  return JSON.stringify([
    metadata.sourceFileId,
    metadata.trim.frames[0],
    metadata.trim.frames[1],
    metadata.normalize,
    metadata.pitchAdjustment,
    metadata.qualityBitDepth,
    metadata.useCompression,
    metadata.plugins || [],
  ]);
}

/**
 * @param {number} slotCount
 * @returns {DeviceState}
 */
export function getUnknownDeviceState(slotCount) {
  return {
    slots: Array(slotCount).fill('unknown'),
    updatedAt: null,
  };
}

/**
 * Compares the set (position = slot number) with what's on the volca.
 *
 * @param {DeviceState} device
 * @param {({ metadata: import('../store').SampleMetadata } | null | undefined)[]} setSamples
 * @param {number} slotCount
 * @returns {DeviceDiff}
 */
export function getDeviceDiff(device, setSamples, slotCount) {
  /** @type {SlotSyncStatus[]} */
  const statuses = [];
  /** @type {number[]} */
  const toSend = [];
  /** @type {number[]} */
  const toErase = [];
  /** @type {number[]} */
  const unknownEmpty = [];
  let unchanged = 0;
  let isKnown = true;
  for (let slot = 0; slot < slotCount; slot++) {
    const want = setSamples[slot] || null;
    const have =
      device.slots[slot] === undefined ? 'unknown' : device.slots[slot];
    /** @type {SlotSyncStatus} */
    let status;
    if (have === 'unknown') {
      isKnown = false;
      status = want ? 'unknown' : 'unknownEmpty';
    } else if (want) {
      status = !have
        ? 'new'
        : have.contentKey === getContentKey(want.metadata)
        ? 'unchanged'
        : 'changed';
    } else {
      status = have ? 'erase' : 'empty';
    }
    statuses.push(status);
    if (status === 'unchanged') unchanged++;
    else if (status === 'erase') toErase.push(slot);
    else if (status === 'unknownEmpty') unknownEmpty.push(slot);
    else if (status !== 'empty') toSend.push(slot);
  }
  return {
    statuses,
    toSend,
    toErase,
    unknownEmpty,
    unchanged,
    isKnown,
    inSync: isKnown && !toSend.length && !toErase.length,
  };
}

/**
 * The new device state after a transfer that completed.
 *
 * @param {DeviceState} device
 * @param {{
 *   sent: { slotNumber: number; id: string; metadata: import('../store').SampleMetadata }[];
 *   erased: number[];
 * }} transfer
 * @returns {DeviceState}
 */
export function applyTransfer(device, { sent, erased }) {
  const slots = device.slots.slice();
  for (const slot of erased) {
    slots[slot] = null;
  }
  for (const { slotNumber, id, metadata } of sent) {
    slots[slotNumber] = {
      sampleId: id,
      contentKey: getContentKey(metadata),
      name: metadata.name,
    };
  }
  return { slots, updatedAt: new Date().toISOString() };
}
