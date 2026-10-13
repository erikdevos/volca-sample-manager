import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { Modal, Offcanvas } from 'react-bootstrap';

import SampleDetail from './SampleDetail.js';
import SampleDetailReadonly from './SampleDetailReadonly.js';
import Footer from './Footer.js';
import PluginManager from './PluginManager.js';
import TopBar from './manager/TopBar.js';
import SlotGrid from './manager/SlotGrid.js';
import LibraryPanel from './manager/LibraryPanel.js';
import DuplicatesModal from './manager/DuplicatesModal.js';
import TrimSilenceModal from './manager/TrimSilenceModal.js';
import { useVolcaSets, VolcaSetContext } from './useVolcaSets.js';
import { VOLCA_SLOT_COUNT } from './setStore.js';
import {
  getFactorySamples,
  SampleContainer,
  sampleContainerDateCompare,
} from './store.js';
import { SampleCache } from './sampleCacheStore.js';
import { onTabUpdateEvent, sendTabUpdateEvent } from './utils/tabSync.js';
import { getPluginStatus, listPluginParams } from './pluginStore.js';

import classes from './App.module.scss';
import { getPlugin } from './utils/plugins.js';

const sessionStorageKey = 'focused_sample_id';

/** @typedef {import('./sampleCacheStore.js').CachedInfo} CachedInfo */

function App() {
  const [userSamples, setUserSamples] = useState(
    /** @type {Map<string, SampleContainer>} */ (new Map())
  );
  const [userSampleCaches, setUserSampleCaches] = useState(
    /** @type {Map<string, SampleCache>} */ (new Map())
  );
  const [factorySamples, setFactorySamples] = useState(
    /** @type {Map<string, SampleContainer>} */ (new Map())
  );
  const [factorySampleCaches, setFactorySampleCaches] = useState(
    /** @type {Map<string, SampleCache>} */ (new Map())
  );
  const allSamples = useMemo(() => {
    return new Map([...userSamples, ...factorySamples]);
  }, [userSamples, factorySamples]);
  useEffect(() => {
    getFactorySamples()
      .then((factorySamples) => {
        setFactorySamples(
          new Map(
            [...factorySamples].map(([id, { sampleContainer }]) => [
              id,
              sampleContainer,
            ])
          )
        );
        setFactorySampleCaches(
          new Map(
            [...factorySamples].map(([id, { sampleContainer, cachedInfo }]) => [
              id,
              new SampleCache({ sampleContainer, cachedInfo }),
            ])
          )
        );
      })
      .catch(console.error);
  }, []);
  // the focused sample is the one open in the edit drawer, which we don't
  // reopen after a reload (but we still use it to load its data first)
  const [focusedSampleId, setFocusedSampleId] = useState(
    /** @type {string | null} */ (null)
  );
  const focusedSampleIdRef = useRef(focusedSampleId);
  focusedSampleIdRef.current = focusedSampleId;
  useEffect(() => {
    if (focusedSampleId) {
      sessionStorage.setItem(sessionStorageKey, focusedSampleId);
    } else {
      sessionStorage.removeItem(sessionStorageKey);
    }
  }, [focusedSampleId]);
  const [loadingSamples, setLoadingSamples] = useState(true);
  useEffect(() => {
    // TODO: error handling
    // fetch focused cache first before the rest, so we have that
    // info loaded as quickly as possible.
    let initialDataLoadPromise = Promise.resolve();
    if (focusedSampleIdRef.current) {
      const focusedSampleId = focusedSampleIdRef.current;
      initialDataLoadPromise = Promise.all([
        SampleContainer.getByIdsFromStorage([focusedSampleId]),
        SampleCache.getCachedInfoByIdsFromStorage([focusedSampleId]),
      ])
        .then(([[sampleContainer], [cachedInfo]]) => {
          setUserSampleCaches((sampleCaches) =>
            new Map(sampleCaches).set(
              sampleContainer.id,
              new SampleCache.Mutable({
                sampleContainer,
                cachedInfo,
              })
            )
          );
        })
        // don't let this block.
        // we know it will fail for factory samples
        .catch((err) => {});
    }
    // now load everything else
    initialDataLoadPromise
      .then(() => SampleContainer.getAllFromStorage())
      .then(async ({ sampleContainers: storedSamples, cachedInfos }) => {
        setUserSamples((samples) => {
          const newSamples = new Map([
            ...samples,
            ...storedSamples.map(
              (sample) =>
                /** @type {[string, SampleContainer]} */ ([sample.id, sample])
            ),
          ]);
          return new Map(
            [...newSamples].sort(([, a], [, b]) =>
              sampleContainerDateCompare(a, b)
            )
          );
        });
        const storedSampleCachedInfo =
          await SampleCache.getAllCachedInfoFromStore();
        // Create sample caches for any samples that are missing one
        const samplesWithoutCache = storedSamples.filter(
          (s) => !cachedInfos.has(s.id) && !storedSampleCachedInfo.has(s.id)
        );
        for (const sample of samplesWithoutCache) {
          SampleCache.importToStorage(sample).then((sampleCache) => {
            setUserSampleCaches((sampleCaches) =>
              new Map(sampleCaches).set(sample.id, sampleCache)
            );
          });
        }
        // And add the rest of the sample caches that we have already
        setUserSampleCaches((sampleCaches) => {
          return new Map([
            ...sampleCaches,
            ...storedSamples
              .filter(
                (s) => storedSampleCachedInfo.has(s.id) || cachedInfos.has(s.id)
              )
              .map((sampleContainer) => {
                const upgradedCachedInfo = cachedInfos.get(sampleContainer.id);
                if (upgradedCachedInfo) {
                  return /** @type {[string, SampleCache]} */ ([
                    sampleContainer.id,
                    new SampleCache.Mutable.Upgraded({
                      sampleContainer,
                      cachedInfo: upgradedCachedInfo,
                    }),
                  ]);
                }
                return /** @type {[string, SampleCache]} */ ([
                  sampleContainer.id,
                  new SampleCache.Mutable({
                    sampleContainer,
                    cachedInfo: /** @type {CachedInfo} */ (
                      storedSampleCachedInfo.get(sampleContainer.id)
                    ),
                  }),
                ]);
              }),
          ]);
        });
      })
      .finally(() => {
        setLoadingSamples(false);
      });
  }, []);

  const userSampleCachesRef = useRef(userSampleCaches);
  userSampleCachesRef.current = userSampleCaches;

  /**
   * @type {(id: string | string[], update: import('./store').SampleMetadataUpdateArg) => void}
   */
  const handleSampleUpdate = useCallback((id, updater) => {
    const ids = id instanceof Array ? id : [id];
    setUserSamples((samples) => {
      const sampleList = /** @type {SampleContainer[]} */ (
        ids
          .map((id) => {
            const s = samples.get(id);
            return (s && s instanceof SampleContainer.Mutable && s) || null;
          })
          .filter(Boolean)
      );
      if (!sampleList.length) return samples;

      /** @type {Promise<void>[]} */
      const persistPromises = [];
      const updatedSampleList = sampleList.map((sample) => {
        if (!(sample instanceof SampleContainer.Mutable)) {
          return sample;
        }
        let onPersisted = () => {};
        persistPromises.push(new Promise((resolve) => (onPersisted = resolve)));
        const updated = sample.update(updater, onPersisted);
        if (updated !== sample) {
          Promise.resolve().then(async () => {
            const sampleCache = userSampleCachesRef.current.get(sample.id);
            if (!(sampleCache && sampleCache instanceof SampleCache.Mutable))
              return;
            await Promise.all(persistPromises);
            const newSampleCache = await sampleCache.update(updated);
            if (newSampleCache === sampleCache) {
              return;
            }
            if (newSampleCache.sampleContainer !== updated) {
              setUserSamples((samples) => {
                const newSamples = new Map(samples);
                newSamples.delete(sample.id);
                return new Map([
                  [sample.id, newSampleCache.sampleContainer],
                  ...newSamples,
                ]);
              });
              sendTabUpdateEvent('sample', [sample.id], 'edit');
            }
            setUserSampleCaches((caches) =>
              new Map(caches).set(sample.id, newSampleCache)
            );
            sendTabUpdateEvent('cache', [sample.id], 'edit');
          });
        }
        return updated;
      });
      if (updatedSampleList.every((s, i) => sampleList[i] === s)) {
        return samples;
      }
      Promise.all(persistPromises).then(() => {
        sendTabUpdateEvent(
          'sample',
          updatedSampleList.map((s) => s.id),
          'edit'
        );
      });
      const newSamples = new Map(samples);
      for (const { id } of updatedSampleList) {
        newSamples.delete(id);
      }
      return new Map([
        ...updatedSampleList
          .slice()
          .sort(sampleContainerDateCompare)
          .map((s) => /** @type {[string, SampleContainer]} */ ([s.id, s])),
        ...newSamples,
      ]);
    });
  }, []);
  /**
   * @type {(
   *   bulkAddSamples: SampleContainer[],
   *   bulkAddSampleCaches: SampleCache[]
   * ) => void}
   */
  const handleSampleBulkAdd = useCallback(
    (bulkAddSamples, bulkAddSampleCaches) => {
      setUserSamples((samples) => {
        const newSamples = new Map([
          ...samples,
          ...bulkAddSamples.map(
            (s) => /** @type {[string, SampleContainer]} */ ([s.id, s])
          ),
        ]);
        return new Map(
          [...newSamples].sort(([, a], [, b]) =>
            sampleContainerDateCompare(a, b)
          )
        );
      });
      sendTabUpdateEvent(
        'sample',
        bulkAddSamples.map((s) => s.id),
        'create'
      );
      setUserSampleCaches((caches) => {
        return new Map([
          ...caches,
          ...bulkAddSampleCaches.map(
            (s) =>
              /** @type {[string, SampleCache]} */ ([s.sampleContainer.id, s])
          ),
        ]);
      });
      sendTabUpdateEvent(
        'cache',
        bulkAddSampleCaches.map((s) => s.sampleContainer.id),
        'create'
      );
      setSelectedMobilePage('library');
    },
    []
  );

  /**
   * This is limited to rare use cases replacing data that doesn't
   * need to change the sample modified date and doesn't need to
   * update the sample cache. For now the only use case is for
   * renaming a plugin.
   * @type {(samples: SampleContainer[]) => void}
   */
  const handleSampleBulkReplace = useCallback((samples) => {
    setUserSamples((samples) => {
      const newSamples = new Map(samples);
      for (const [id, sample] of samples) {
        if (newSamples.has(id)) {
          newSamples.set(id, sample);
        }
      }
      return newSamples;
    });
    sendTabUpdateEvent(
      'sample',
      samples.map((s) => s.id),
      'edit'
    );
  }, []);

  const allSamplesRef = useRef(allSamples);
  allSamplesRef.current = allSamples;
  const factorySampleCachesRef = useRef(factorySampleCaches);
  factorySampleCachesRef.current = factorySampleCaches;
  const handleSampleDuplicate = useCallback(
    /**
     * @param {string} id
     */
    (id) => {
      const sample = allSamplesRef.current.get(id);
      if (sample) {
        const newSample = sample.duplicate((id) => {
          sendTabUpdateEvent('sample', [id], 'create');
        });
        setUserSamples(
          (samples) => new Map([[newSample.id, newSample], ...samples])
        );
        const oldSampleCache =
          userSampleCachesRef.current.get(id) ||
          factorySampleCachesRef.current.get(id);
        if (oldSampleCache) {
          const newSampleCache = new SampleCache.Mutable({
            sampleContainer: newSample,
            cachedInfo: oldSampleCache.cachedInfo,
          });
          newSampleCache.persist().then(() => {
            sendTabUpdateEvent('cache', [newSample.id], 'create');
          });
          setUserSampleCaches((caches) =>
            new Map(caches).set(newSample.id, newSampleCache)
          );
        }
        setFocusedSampleId(newSample.id);
      }
    },
    []
  );

  const userSamplesRef = useRef(userSamples);
  userSamplesRef.current = userSamples;
  const handleSampleDelete = useCallback(
    /**
     * @param {string | string[]} id
     * @param {boolean} [noPersist]
     */
    (id, noPersist) => {
      const ids = id instanceof Array ? id : [id];
      const userSamples = userSamplesRef.current;
      // if we are focused on the sample we are deleting, try to move the
      // focus to the next newer sample, or else the next sample after.
      if (
        focusedSampleIdRef.current &&
        ids.includes(focusedSampleIdRef.current)
      ) {
        const userSamplesList = [...userSamples.values()];
        const focusedSampleIndex = userSamplesList.findIndex(
          (s) => s.id === focusedSampleIdRef.current
        );
        const nextNewerAvailableSample = userSamplesList
          .slice(0, focusedSampleIndex)
          .reverse()
          .find((s) => !ids.includes(s.id));
        const nextFocusedSample = nextNewerAvailableSample
          ? nextNewerAvailableSample
          : // if there is no newer sample left then try to find the next after
            userSamplesList
              .slice(focusedSampleIndex + 1)
              .find((s) => !ids.includes(s.id));
        setFocusedSampleId(nextFocusedSample ? nextFocusedSample.id : null);
      }
      if (!noPersist) {
        Promise.all(
          ids.map(async (idToDelete) => {
            const sample = userSamples.get(idToDelete);
            if (sample && sample instanceof SampleContainer.Mutable) {
              await sample.remove();
            }
          })
        ).then(() => sendTabUpdateEvent('sample', ids, 'delete'));
        Promise.all(
          ids.map(async (idToDelete) => {
            const sampleCache = userSampleCachesRef.current.get(idToDelete);
            if (sampleCache && sampleCache instanceof SampleCache.Mutable) {
              await sampleCache.remove();
            }
          })
          // Maybe we don't really need to send this event because they will
          // already be deleted with the earlier event... but just for
          // consistency we'll keep it for now.
        ).then(() => sendTabUpdateEvent('cache', ids, 'delete'));
      }
      setUserSamples((samples) => {
        const newSamples = new Map(samples);
        for (const id of ids) {
          newSamples.delete(id);
        }
        return newSamples;
      });
      setUserSampleCaches((caches) => {
        const newCaches = new Map(caches);
        for (const id of ids) {
          newCaches.delete(id);
        }
        return newCaches;
      });
    },
    []
  );

  const [editCacheInvalidator, setEditCacheInvalidator] = useState(Symbol());

  const handleRegenerateSampleCache = useCallback(
    /** @param {string} sampleId */
    (sampleId) => {
      const sampleContainer = userSamplesRef.current.get(sampleId);
      if (!sampleContainer) return;
      setEditCacheInvalidator(Symbol());
      SampleCache.importToStorage(sampleContainer).then((sampleCache) => {
        setUserSampleCaches((sampleCaches) =>
          new Map(sampleCaches).set(sampleId, sampleCache)
        );
      });
    },
    []
  );

  useEffect(() => {
    return onTabUpdateEvent('sample', async (event) => {
      if (event.action === 'delete') {
        handleSampleDelete(event.ids, true);
      } else {
        const syncedSamples = await SampleContainer.getByIdsFromStorage(
          event.ids
        );
        setUserSamples((samples) => {
          const newSamples = new Map([
            ...samples,
            ...syncedSamples.map(
              (s) => /** @type {[string, SampleContainer]} */ ([s.id, s])
            ),
          ]);
          return new Map(
            [...newSamples].sort(([, a], [, b]) =>
              sampleContainerDateCompare(a, b)
            )
          );
        });
      }
    });
  }, [handleSampleDelete]);

  useEffect(() => {
    return onTabUpdateEvent('cache', async (event) => {
      if (event.action === 'delete') {
        setUserSampleCaches((caches) => {
          const newCaches = new Map(caches);
          for (const id of event.ids) {
            newCaches.delete(id);
          }
          return newCaches;
        });
      } else {
        const syncedCachedInfos =
          await SampleCache.getCachedInfoByIdsFromStorage(event.ids);
        // request animation frame to make sure userSamples ref is updated
        // with previous sample event
        requestAnimationFrame(() => {
          setUserSampleCaches((caches) => {
            const userSamples = userSamplesRef.current;
            if (!userSamples) return caches;
            return new Map([
              ...caches,
              ...syncedCachedInfos.map(
                (cachedInfo, i) =>
                  /** @type {[string, SampleCache]} */ ([
                    event.ids[i],
                    new SampleCache.Mutable({
                      cachedInfo,
                      // we assume the sample event was processed first
                      sampleContainer: /** @type {SampleContainer} */ (
                        userSamples.get(event.ids[i])
                      ),
                    }),
                  ])
              ),
            ]);
          });
        });
      }
    });
  }, []);

  // on small screens only one of the two panes is shown at a time
  const [selectedMobilePage, setSelectedMobilePage] = useState(
    /** @type {'set' | 'library'} */ ('set')
  );

  const volcaSets = useVolcaSets(
    allSamples,
    !loadingSamples && factorySamples.size > 0
  );
  const allSampleCaches = useMemo(
    () => new Map([...userSampleCaches, ...factorySampleCaches]),
    [userSampleCaches, factorySampleCaches]
  );
  const setSeconds = useMemo(
    () =>
      volcaSets.activeSetSamples.reduce((total, sample) => {
        const sampleCache = allSampleCaches.get(sample.id);
        return total + (sampleCache ? sampleCache.cachedInfo.duration : 0);
      }, 0),
    [volcaSets.activeSetSamples, allSampleCaches]
  );
  const { activeSetSampleIds, toggleInSet } = volcaSets;
  const volcaSetContextValue = useMemo(
    () => ({
      activeSetSampleIds,
      isSetFull: activeSetSampleIds.size >= VOLCA_SLOT_COUNT,
      toggleInSet,
    }),
    [activeSetSampleIds, toggleInSet]
  );
  const handleSampleSelect = useCallback(
    /**
     * @param {string | null} sampleId
     */
    (sampleId) => {
      setFocusedSampleId(sampleId);
    },
    []
  );

  const closeEditDrawer = useCallback(() => setFocusedSampleId(null), []);

  const handleSampleDeleteFromDrawer = useCallback(
    /** @param {string | string[]} id */
    (id) => {
      handleSampleDelete(id);
      setFocusedSampleId(null);
    },
    [handleSampleDelete]
  );

  const sample = focusedSampleId ? allSamples.get(focusedSampleId) : null;
  const sampleCache =
    (sample &&
      (userSampleCaches.get(sample.id) ||
        factorySampleCaches.get(sample.id))) ||
    null;

  const [isPluginManagerOpen, setIsPluginManagerOpen] = useState(false);
  const openPluginManager = useCallback(() => setIsPluginManagerOpen(true), []);
  const closePluginManager = useCallback(
    () => setIsPluginManagerOpen(false),
    []
  );

  const [pluginParamsDefs, setPluginParamsDefs] = useState(
    /** @type {Awaited<ReturnType<typeof listPluginParams>>} */ (new Map())
  );
  const updatePluginParamsDefs = useCallback(async () => {
    const pluginParamDefs = await listPluginParams();
    setPluginParamsDefs(pluginParamDefs);
  }, []);
  useEffect(() => {
    updatePluginParamsDefs();
    return onTabUpdateEvent('plugin', updatePluginParamsDefs);
  }, [updatePluginParamsDefs]);

  const pluginNameList = useMemo(
    () => [...pluginParamsDefs.keys()],
    [pluginParamsDefs]
  );

  const [pluginStatusMap, setPluginStatusMap] = useState(
    /** @type {Map<string, import('./pluginStore').PluginStatus> | null} */ (
      null
    )
  );
  useEffect(() => {
    /** @type {typeof pluginStatusMap} */
    const newStatusMap = new Map();
    let cancelled = false;
    getPluginStatus(...pluginNameList).then((statuses) => {
      if (cancelled) return;
      pluginNameList.forEach((pluginName, i) => {
        newStatusMap.set(pluginName, statuses[i]);
      });
      setPluginStatusMap(newStatusMap);
    });
    const pluginErrorUnsubscribeCallbacks = pluginNameList.map((pluginName) =>
      getPlugin(pluginName).onPluginError(() =>
        setPluginStatusMap((pluginStatusMap) =>
          new Map(pluginStatusMap).set(pluginName, 'broken')
        )
      )
    );
    return () => {
      cancelled = true;
      for (const callback of pluginErrorUnsubscribeCallbacks) {
        callback();
      }
    };
  }, [pluginNameList]);

  // in their original slot order
  const factorySampleIds = useMemo(
    () =>
      [...factorySamples.values()]
        .sort((a, b) => a.metadata.slotNumber - b.metadata.slotNumber)
        .map((s) => s.id),
    [factorySamples]
  );

  const [isAboutOpen, setIsAboutOpen] = useState(false);
  const [isDuplicatesOpen, setIsDuplicatesOpen] = useState(false);
  const [trimTarget, setTrimTarget] = useState(
    /** @type {{ title: string; sampleIds: string[] } | null} */ (null)
  );
  const trimSamples = useMemo(
    () =>
      /** @type {SampleContainer[]} */ (
        (trimTarget ? trimTarget.sampleIds : [])
          .map((id) => allSamples.get(id))
          .filter(Boolean)
      ),
    // only take the samples as they are when the modal opens
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [trimTarget]
  );

  return (
    <VolcaSetContext.Provider value={volcaSetContextValue}>
      <div className={classes.app}>
        <TopBar
          volcaSets={volcaSets}
          sampleCaches={allSampleCaches}
          seconds={setSeconds}
          factorySampleIds={factorySampleIds}
          onAboutClick={() => setIsAboutOpen(true)}
        />
        <nav className={classes.mobileTabs}>
          <button
            type="button"
            className={selectedMobilePage === 'set' ? classes.active : ''}
            onClick={() => setSelectedMobilePage('set')}
          >
            Set ({volcaSets.activeSetSamples.length})
          </button>
          <button
            type="button"
            className={selectedMobilePage === 'library' ? classes.active : ''}
            onClick={() => setSelectedMobilePage('library')}
          >
            Collection ({userSamples.size})
          </button>
        </nav>
        <div
          className={`${classes.workspace} ${
            classes[`show-${selectedMobilePage}`]
          }`}
        >
          <main className={classes.setPane}>
            <SlotGrid
              volcaSets={volcaSets}
              sampleCaches={allSampleCaches}
              onEdit={handleSampleSelect}
              onTrimSilence={() =>
                setTrimTarget({
                  title: 'Trim silence in your set',
                  sampleIds: volcaSets.activeSetSamples.map((s) => s.id),
                })
              }
            />
          </main>
          <div className={classes.libraryPane}>
            <LibraryPanel
              loading={loadingSamples}
              userSamples={userSamples}
              factorySamples={factorySamples}
              sampleCaches={allSampleCaches}
              onEdit={handleSampleSelect}
              onBulkImport={handleSampleBulkAdd}
              onSampleUpdate={handleSampleUpdate}
              onSampleDelete={handleSampleDelete}
              onAddToSet={volcaSets.addToSet}
              onFindDuplicates={() => setIsDuplicatesOpen(true)}
              onTrimSilence={(sampleIds) =>
                setTrimTarget({
                  title: 'Trim silence in selected samples',
                  sampleIds,
                })
              }
            />
          </div>
        </div>

        <Offcanvas
          show={Boolean(sample)}
          onHide={closeEditDrawer}
          placement="end"
          className={classes.editDrawer}
        >
          <Offcanvas.Header closeButton>
            <Offcanvas.Title>Edit sample</Offcanvas.Title>
          </Offcanvas.Header>
          <Offcanvas.Body>
            {!sample ? null : sample instanceof SampleContainer.Mutable ? (
              <SampleDetail
                sample={sample}
                sampleCache={sampleCache}
                pluginParamsDefs={pluginParamsDefs}
                pluginStatusMap={pluginStatusMap}
                isPluginManagerOpen={isPluginManagerOpen}
                editCacheInvalidator={editCacheInvalidator}
                onSampleUpdate={handleSampleUpdate}
                onSampleDuplicate={handleSampleDuplicate}
                onSampleDelete={handleSampleDeleteFromDrawer}
                onOpenPluginManager={openPluginManager}
                onRecheckPlugins={updatePluginParamsDefs}
                onRegenerateSampleCache={handleRegenerateSampleCache}
              />
            ) : (
              <SampleDetailReadonly
                sample={sample}
                sampleCache={sampleCache}
                onSampleDuplicate={handleSampleDuplicate}
              />
            )}
          </Offcanvas.Body>
        </Offcanvas>

        <Modal
          show={isAboutOpen}
          onHide={() => setIsAboutOpen(false)}
          size="lg"
        >
          <Modal.Header closeButton>
            <Modal.Title>About Volca Sample Manager</Modal.Title>
          </Modal.Header>
          <Modal.Body>
            <p>
              Manage your sample collection and the 100 slots of your KORG volca
              sample. Based on{' '}
              <a
                href="https://github.com/benwiley4000/volca-sampler"
                target="_blank"
                rel="noreferrer"
              >
                Volca Sampler
              </a>{' '}
              by Ben Wiley (MIT license), using KORG's Syro library.
            </p>
            <Footer />
          </Modal.Body>
        </Modal>

        <TrimSilenceModal
          show={Boolean(trimTarget)}
          title={trimTarget ? trimTarget.title : ''}
          samples={trimSamples}
          onHide={() => setTrimTarget(null)}
          onSampleUpdate={handleSampleUpdate}
        />

        <DuplicatesModal
          show={isDuplicatesOpen}
          onHide={() => setIsDuplicatesOpen(false)}
          userSamples={userSamples}
          factorySamples={factorySamples}
          sampleCaches={allSampleCaches}
          onSampleDelete={handleSampleDelete}
          onSampleUpdate={handleSampleUpdate}
        />

        <PluginManager
          isOpen={isPluginManagerOpen}
          pluginList={pluginNameList}
          pluginStatusMap={pluginStatusMap}
          userSamples={userSamples}
          onUpdatePluginList={updatePluginParamsDefs}
          onSampleUpdate={handleSampleUpdate}
          onSampleBulkReplace={handleSampleBulkReplace}
          onRegenerateSampleCache={handleRegenerateSampleCache}
          onClose={closePluginManager}
        />
      </div>
    </VolcaSetContext.Provider>
  );
}

export default App;
