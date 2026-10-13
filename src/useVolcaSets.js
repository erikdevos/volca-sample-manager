import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';

import {
  createVolcaSet,
  deleteVolcaSet,
  loadVolcaSets,
  saveVolcaSet,
} from './setStore.js';
import {
  insertAtSlot,
  moveSlot,
  placeSample,
  removeSamples,
  sortSlotsByCategory,
} from './utils/setSlots.js';
import { VOLCA_SLOT_COUNT } from './setStore.js';

/** @typedef {import('./setStore.js').VolcaSet} VolcaSet */
/** @typedef {import('./store').SampleContainer} SampleContainer */

const activeSetStorageKey = 'active_volca_set_id';

function readActiveSetId() {
  try {
    return localStorage.getItem(activeSetStorageKey);
  } catch (err) {
    return null;
  }
}

/** @param {string} id */
function writeActiveSetId(id) {
  try {
    localStorage.setItem(activeSetStorageKey, id);
  } catch (err) {
    // only a convenience
  }
}

/**
 * @typedef {{
 *   sets: VolcaSet[];
 *   activeSet: VolcaSet | null;
 *   activeSetSamples: SampleContainer[];
 *   activeSetSlots: (SampleContainer | null)[];
 *   activeSetSampleIds: Set<string>;
 *   selectSet: (id: string) => void;
 *   newSet: (name: string, sampleIds?: string[]) => void;
 *   renameSet: (name: string) => void;
 *   removeSet: () => void;
 *   addToSet: (ids: string[]) => void;
 *   removeFromSet: (ids: string[]) => void;
 *   toggleInSet: (id: string) => void;
 *   moveInSet: (fromIndex: number, toIndex: number) => void;
 *   insertInSet: (id: string, index: number) => void;
 *   sortSetByCategory: () => void;
 *   emptySet: () => void;
 * }} VolcaSetsApi
 */

/**
 * @param {Map<string, SampleContainer>} allSamples
 * @param {boolean} samplesLoaded
 * @returns {VolcaSetsApi}
 */
export function useVolcaSets(allSamples, samplesLoaded) {
  const [sets, setSets] = useState(/** @type {VolcaSet[]} */ ([]));
  const [activeSetId, setActiveSetId] = useState(readActiveSetId);

  useEffect(() => {
    loadVolcaSets().then((loadedSets) => {
      if (!loadedSets.length) {
        const firstSet = createVolcaSet('My volca set');
        saveVolcaSet(firstSet);
        loadedSets = [firstSet];
      }
      setSets(loadedSets);
      setActiveSetId((id) =>
        id && loadedSets.some((s) => s.id === id) ? id : loadedSets[0].id
      );
    });
  }, []);

  useEffect(() => {
    if (activeSetId) writeActiveSetId(activeSetId);
  }, [activeSetId]);

  const activeSet = sets.find((s) => s.id === activeSetId) || null;

  const allSamplesRef = useRef(allSamples);
  allSamplesRef.current = allSamples;

  /** @type {(updater: (set: VolcaSet) => Partial<VolcaSet>) => void} */
  const updateActiveSet = useCallback(
    (updater) => {
      setSets((sets) =>
        sets.map((s) => {
          if (s.id !== activeSetId) return s;
          const updated = {
            ...s,
            ...updater(s),
            dateModified: new Date().toISOString(),
          };
          saveVolcaSet(updated);
          return updated;
        })
      );
    },
    [activeSetId]
  );

  // Empty the slots of samples that were deleted from the library
  useEffect(() => {
    if (!samplesLoaded) return;
    setSets((sets) =>
      sets.map((s) => {
        const deleted = /** @type {string[]} */ (
          s.sampleIds.filter((id) => id && !allSamples.has(id))
        );
        if (!deleted.length) return s;
        const updated = {
          ...s,
          sampleIds: removeSamples(s.sampleIds, deleted),
        };
        saveVolcaSet(updated);
        return updated;
      })
    );
  }, [allSamples, samplesLoaded]);

  // index = slot number
  const activeSetSlots = useMemo(
    () =>
      (activeSet ? activeSet.sampleIds : []).map(
        (id) => (id && allSamples.get(id)) || null
      ),
    [activeSet, allSamples]
  );

  // just the samples, in slot order
  const activeSetSamples = useMemo(
    () => /** @type {SampleContainer[]} */ (activeSetSlots.filter(Boolean)),
    [activeSetSlots]
  );

  const activeSetSampleIds = useMemo(
    () => new Set(activeSetSamples.map((s) => s.id)),
    [activeSetSamples]
  );

  const getSample = useCallback(
    /** @param {string} id */
    (id) => allSamplesRef.current.get(id),
    []
  );

  const addToSet = useCallback(
    /** @param {string[]} ids */
    (ids) =>
      updateActiveSet(({ sampleIds }) => {
        let newIds = sampleIds;
        for (const id of ids) {
          const sample = getSample(id);
          if (sample) {
            newIds = placeSample(newIds, sample, getSample, VOLCA_SLOT_COUNT);
          }
        }
        return { sampleIds: newIds };
      }),
    [updateActiveSet, getSample]
  );

  const removeFromSet = useCallback(
    /** @param {string[]} ids */
    (ids) =>
      updateActiveSet(({ sampleIds }) => ({
        sampleIds: removeSamples(sampleIds, ids),
      })),
    [updateActiveSet]
  );

  const toggleInSet = useCallback(
    /** @param {string} id */
    (id) =>
      updateActiveSet(({ sampleIds }) => {
        if (sampleIds.includes(id)) {
          return { sampleIds: removeSamples(sampleIds, [id]) };
        }
        const sample = getSample(id);
        return {
          sampleIds: sample
            ? placeSample(sampleIds, sample, getSample, VOLCA_SLOT_COUNT)
            : sampleIds,
        };
      }),
    [updateActiveSet, getSample]
  );

  const moveInSet = useCallback(
    /**
     * @param {number} fromIndex
     * @param {number} toIndex
     */
    (fromIndex, toIndex) =>
      updateActiveSet(({ sampleIds }) => ({
        sampleIds: moveSlot(sampleIds, fromIndex, toIndex),
      })),
    [updateActiveSet]
  );

  const insertInSet = useCallback(
    /**
     * @param {string} id
     * @param {number} index
     */
    (id, index) =>
      updateActiveSet(({ sampleIds }) => ({
        sampleIds: insertAtSlot(sampleIds, id, index),
      })),
    [updateActiveSet]
  );

  const sortSetByCategory = useCallback(
    () =>
      updateActiveSet(({ sampleIds }) => ({
        sampleIds: sortSlotsByCategory(sampleIds, getSample),
      })),
    [updateActiveSet, getSample]
  );

  const emptySet = useCallback(
    () => updateActiveSet(() => ({ sampleIds: [] })),
    [updateActiveSet]
  );

  const renameSet = useCallback(
    /** @param {string} name */
    (name) => updateActiveSet(() => ({ name })),
    [updateActiveSet]
  );

  const newSet = useCallback(
    /**
     * @param {string} name
     * @param {string[]} [sampleIds]
     */
    (name, sampleIds = []) => {
      const volcaSet = { ...createVolcaSet(name), sampleIds };
      saveVolcaSet(volcaSet);
      setSets((sets) => [...sets, volcaSet]);
      setActiveSetId(volcaSet.id);
    },
    []
  );

  const removeSet = useCallback(() => {
    if (!activeSetId) return;
    deleteVolcaSet(activeSetId);
    setSets((sets) => {
      let remaining = sets.filter((s) => s.id !== activeSetId);
      if (!remaining.length) {
        const firstSet = createVolcaSet('My volca set');
        saveVolcaSet(firstSet);
        remaining = [firstSet];
      }
      setActiveSetId(remaining[0].id);
      return remaining;
    });
  }, [activeSetId]);

  return {
    sets,
    activeSet,
    activeSetSamples,
    activeSetSlots,
    activeSetSampleIds,
    selectSet: setActiveSetId,
    newSet,
    renameSet,
    removeSet,
    addToSet,
    removeFromSet,
    toggleInSet,
    moveInSet,
    insertInSet,
    sortSetByCategory,
    emptySet,
  };
}

/**
 * Gives list items access to the active set without threading props through
 * every component in between.
 */
export const VolcaSetContext = React.createContext(
  /** @type {{
   *   activeSetSampleIds: Set<string>;
   *   isSetFull: boolean;
   *   toggleInSet: (id: string) => void;
   * }} */ ({
    activeSetSampleIds: new Set(),
    isSetFull: false,
    toggleInSet: () => {},
  })
);
