import localforage from 'localforage';

import { getUnknownDeviceState } from './utils/deviceDiff.js';
import { VOLCA_SLOT_COUNT } from './setStore.js';

/** @typedef {import('./utils/deviceDiff.js').DeviceState} DeviceState */

const deviceStore = localforage.createInstance({
  name: 'volca_device',
  driver: localforage.INDEXEDDB,
});

const KEY = 'state';

/** @returns {Promise<DeviceState>} */
export async function loadDeviceState() {
  try {
    /** @type {DeviceState | null} */
    const state = await deviceStore.getItem(KEY);
    if (state && Array.isArray(state.slots)) {
      const slots = state.slots.slice(0, VOLCA_SLOT_COUNT);
      while (slots.length < VOLCA_SLOT_COUNT) slots.push('unknown');
      return { slots, updatedAt: state.updatedAt || null };
    }
  } catch (err) {
    console.error(err);
  }
  return getUnknownDeviceState(VOLCA_SLOT_COUNT);
}

/** @param {DeviceState} state */
export async function saveDeviceState(state) {
  await deviceStore.setItem(KEY, state);
}
