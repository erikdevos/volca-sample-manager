import React, { useCallback, useEffect, useMemo, useState } from 'react';

import { loadDeviceState, saveDeviceState } from './deviceStore.js';
import {
  applyTransfer,
  getDeviceDiff,
  getUnknownDeviceState,
} from './utils/deviceDiff.js';
import { VOLCA_SLOT_COUNT } from './setStore.js';

/** @typedef {import('./store').SampleContainer} SampleContainer */
/** @typedef {import('./utils/deviceDiff.js').DeviceState} DeviceState */
/** @typedef {import('./utils/deviceDiff.js').DeviceDiff} DeviceDiff */

/**
 * @typedef {{
 *   device: DeviceState;
 *   diff: DeviceDiff;
 *   recordTransfer(transfer: {
 *     sent: { slotNumber: number; id: string; metadata: import('./store').SampleMetadata }[];
 *     erased: number[];
 *   }): void;
 *   recordErase(slots: number[]): void;
 *   recordEraseAll(): void;
 *   recordFactory(factorySamples: SampleContainer[]): void;
 *   markUnknown(slots?: number[]): void;
 * }} DeviceStateApi
 */

/**
 * Remembers what's on the volca sample, so we can send only what changed.
 *
 * @param {SampleContainer[]} setSamples in slot order
 * @returns {DeviceStateApi}
 */
export function useDeviceState(setSamples) {
  const [device, setDevice] = useState(() =>
    getUnknownDeviceState(VOLCA_SLOT_COUNT)
  );

  useEffect(() => {
    loadDeviceState().then(setDevice);
  }, []);

  const update = useCallback(
    /** @param {(device: DeviceState) => DeviceState} updater */
    (updater) => {
      setDevice((device) => {
        const newDevice = updater(device);
        saveDeviceState(newDevice).catch(console.error);
        return newDevice;
      });
    },
    []
  );

  const recordTransfer = useCallback(
    /** @type {DeviceStateApi['recordTransfer']} */
    (transfer) => update((device) => applyTransfer(device, transfer)),
    [update]
  );

  const recordErase = useCallback(
    /** @param {number[]} slots */
    (slots) =>
      update((device) =>
        applyTransfer(device, {
          sent: [],
          erased: slots.filter((s) => s < VOLCA_SLOT_COUNT),
        })
      ),
    [update]
  );

  const recordEraseAll = useCallback(
    () =>
      update(() => ({
        slots: Array(VOLCA_SLOT_COUNT).fill(null),
        updatedAt: new Date().toISOString(),
      })),
    [update]
  );

  const recordFactory = useCallback(
    /** @param {SampleContainer[]} factorySamples */
    (factorySamples) =>
      update(() =>
        applyTransfer(
          {
            slots: Array(VOLCA_SLOT_COUNT).fill(null),
            updatedAt: null,
          },
          {
            sent: factorySamples
              .filter((s) => s.metadata.slotNumber < VOLCA_SLOT_COUNT)
              .map((s) => ({
                slotNumber: s.metadata.slotNumber,
                id: s.id,
                metadata: s.metadata,
              })),
            erased: [],
          }
        )
      ),
    [update]
  );

  const markUnknown = useCallback(
    /** @param {number[]} [slots] all slots if not given */
    (slots) =>
      update((device) => {
        if (!slots) return getUnknownDeviceState(VOLCA_SLOT_COUNT);
        const newSlots = device.slots.slice();
        for (const slot of slots) newSlots[slot] = 'unknown';
        return { slots: newSlots, updatedAt: new Date().toISOString() };
      }),
    [update]
  );

  const diff = useMemo(
    () => getDeviceDiff(device, setSamples, VOLCA_SLOT_COUNT),
    [device, setSamples]
  );

  return {
    device,
    diff,
    recordTransfer,
    recordErase,
    recordEraseAll,
    recordFactory,
    markUnknown,
  };
}

export const DeviceStateContext = React.createContext(
  /** @type {DeviceStateApi | null} */ (null)
);
