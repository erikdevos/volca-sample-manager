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
  getCategoryOrder,
  getSampleCategory,
  sampleCategoryCompare,
} from './utils/categories.js';

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
 * Inserts a sample at the end of its category block, so a set stays grouped
 * by category (like the factory layout) without manual sorting.
 *
 * @param {string[]} sampleIds
 * @param {SampleContainer} sample
 * @param {Map<string, SampleContainer>} allSamples
 */
function insertByCategory(sampleIds, sample, allSamples) {
  const order = getCategoryOrder(getSampleCategory(sample));
  let insertAt = sampleIds.length;
  for (let i = 0; i < sampleIds.length; i++) {
    const other = allSamples.get(sampleIds[i]);
    if (other && getCategoryOrder(getSampleCategory(other)) > order) {
      insertAt = i;
      break;
    }
  }
  return [
    ...sampleIds.slice(0, insertAt),
    sample.id,
    ...sampleIds.slice(insertAt),
  ];
}

/**
 * @typedef {{
 *   sets: VolcaSet[];
 *   activeSet: VolcaSet | null;
 *   activeSetSamples: SampleContainer[];
 *   activeSetSampleIds: Set<string>;
 *   selectSet: (id: string) => void;
 *   newSet: (name: string) => void;
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

  // Drop samples that were deleted from the library
  useEffect(() => {
    if (!samplesLoaded) return;
    setSets((sets) =>
      sets.map((s) => {
        const sampleIds = s.sampleIds.filter((id) => allSamples.has(id));
        if (sampleIds.length === s.sampleIds.length) return s;
        const updated = { ...s, sampleIds };
        saveVolcaSet(updated);
        return updated;
      })
    );
  }, [allSamples, samplesLoaded]);

  const activeSetSamples = useMemo(
    () =>
      /** @type {SampleContainer[]} */ (
        (activeSet ? activeSet.sampleIds : [])
          .map((id) => allSamples.get(id))
          .filter(Boolean)
      ),
    [activeSet, allSamples]
  );

  const activeSetSampleIds = useMemo(
    () => new Set(activeSet ? activeSet.sampleIds : []),
    [activeSet]
  );

  const addToSet = useCallback(
    /** @param {string[]} ids */
    (ids) =>
      updateActiveSet(({ sampleIds }) => {
        let newIds = sampleIds;
        for (const id of ids) {
          const sample = allSamplesRef.current.get(id);
          if (sample && !newIds.includes(id)) {
            newIds = insertByCategory(newIds, sample, allSamplesRef.current);
          }
        }
        return { sampleIds: newIds };
      }),
    [updateActiveSet]
  );

  const removeFromSet = useCallback(
    /** @param {string[]} ids */
    (ids) =>
      updateActiveSet(({ sampleIds }) => ({
        sampleIds: sampleIds.filter((id) => !ids.includes(id)),
      })),
    [updateActiveSet]
  );

  const toggleInSet = useCallback(
    /** @param {string} id */
    (id) =>
      updateActiveSet(({ sampleIds }) => {
        if (sampleIds.includes(id)) {
          return { sampleIds: sampleIds.filter((i) => i !== id) };
        }
        const sample = allSamplesRef.current.get(id);
        return {
          sampleIds: sample
            ? insertByCategory(sampleIds, sample, allSamplesRef.current)
            : sampleIds,
        };
      }),
    [updateActiveSet]
  );

  const moveInSet = useCallback(
    /**
     * @param {number} fromIndex
     * @param {number} toIndex
     */
    (fromIndex, toIndex) =>
      updateActiveSet(({ sampleIds }) => {
        const newIds = sampleIds.slice();
        const [moved] = newIds.splice(fromIndex, 1);
        newIds.splice(toIndex, 0, moved);
        return { sampleIds: newIds };
      }),
    [updateActiveSet]
  );

  const insertInSet = useCallback(
    /**
     * @param {string} id
     * @param {number} index
     */
    (id, index) =>
      updateActiveSet(({ sampleIds }) => {
        const newIds = sampleIds.filter((i) => i !== id);
        newIds.splice(Math.min(index, newIds.length), 0, id);
        return { sampleIds: newIds };
      }),
    [updateActiveSet]
  );

  const sortSetByCategory = useCallback(
    () =>
      updateActiveSet(({ sampleIds }) => ({
        sampleIds: /** @type {SampleContainer[]} */ (
          sampleIds.map((id) => allSamplesRef.current.get(id)).filter(Boolean)
        )
          .sort(sampleCategoryCompare)
          .map((s) => s.id),
      })),
    [updateActiveSet]
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
    /** @param {string} name */
    (name) => {
      const volcaSet = createVolcaSet(name);
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
