import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { getSyroBindings } from './getSyroBindings.js';
import {
  getTargetWavForSample,
  getAudioBufferForAudioFileData,
  useAudioPlaybackContext,
} from './audioData.js';

/**
 * @typedef {{
 *   syroBufferPromise: Promise<{
 *     syroBuffer: Uint8Array;
 *     dataStartPoints: number[];
 *   }>;
 *   cancelWork: () => void;
 * }} SyroBufferWork
 */

/**
 * @param {(import('../store').SampleContainer)[]} sampleContainers
 * @param {(progress: number) => void} onProgress
 * @returns {SyroBufferWork}
 */
export function getSyroSampleBuffer(sampleContainers, onProgress) {
  return buildSyroBuffer(
    sampleContainers.length,
    async (isCancelled) => {
      /** @type {Uint8Array[]} */
      const targetWavs = [];
      for (const sampleContainer of sampleContainers) {
        const { data } = await getTargetWavForSample(sampleContainer);
        if (isCancelled()) break;
        targetWavs.push(data);
      }
      return targetWavs;
    },
    ({ createSyroDataFromWavData }, syroDataHandle, targetWavs) => {
      sampleContainers.forEach((sampleContainer, i) => {
        const data = targetWavs[i];
        createSyroDataFromWavData(
          syroDataHandle,
          i,
          data,
          data.length,
          sampleContainer.metadata.slotNumber,
          sampleContainer.metadata.qualityBitDepth,
          sampleContainer.metadata.useCompression ? 1 : 0
        );
      });
    },
    onProgress
  );
}

/**
 * @typedef {{
 *   type: 'sample';
 *   wav: Uint8Array;
 *   slotNumber: number;
 *   quality: number;
 *   useCompression: boolean;
 * } | {
 *   type: 'erase';
 *   slotNumber: number;
 * }} SyroStreamEntry
 */

/**
 * One transfer that erases slots and sends samples, in the given order.
 *
 * @param {SyroStreamEntry[]} entries
 * @param {(progress: number) => void} onProgress
 * @returns {SyroBufferWork}
 */
export function getSyroStreamBuffer(entries, onProgress) {
  return buildSyroBuffer(
    entries.length,
    async () => entries.map((e) => (e.type === 'sample' ? e.wav : null)),
    ({ createSyroDataFromWavData, createEraseSyroData }, syroDataHandle) => {
      entries.forEach((entry, i) => {
        if (entry.type === 'erase') {
          createEraseSyroData(syroDataHandle, i, entry.slotNumber);
        } else {
          createSyroDataFromWavData(
            syroDataHandle,
            i,
            entry.wav,
            entry.wav.length,
            entry.slotNumber,
            entry.quality,
            entry.useCompression ? 1 : 0
          );
        }
      });
    },
    onProgress
  );
}

/**
 * The transfer for (part of) a set: first erases the given slots, which frees
 * memory on the volca, then sends the samples to their slots.
 *
 * @param {(import('../store').SampleContainer)[]} sampleContainers
 * @param {number[]} eraseSlots
 * @param {(progress: number) => void} onProgress
 * @returns {SyroBufferWork}
 */
export function getSyroSetBuffer(sampleContainers, eraseSlots, onProgress) {
  let cancelled = false;
  /** @type {SyroBufferWork | null} */
  let work = null;
  return {
    cancelWork() {
      cancelled = true;
      if (work) work.cancelWork();
    },
    syroBufferPromise: (async () => {
      /** @type {SyroStreamEntry[]} */
      const entries = eraseSlots.map((slotNumber) => ({
        type: /** @type {const} */ ('erase'),
        slotNumber,
      }));
      for (const sampleContainer of sampleContainers) {
        const { data } = await getTargetWavForSample(sampleContainer);
        if (cancelled)
          return { syroBuffer: new Uint8Array(), dataStartPoints: [] };
        entries.push({
          type: 'sample',
          wav: data,
          slotNumber: sampleContainer.metadata.slotNumber,
          quality: sampleContainer.metadata.qualityBitDepth,
          useCompression: sampleContainer.metadata.useCompression,
        });
      }
      work = getSyroStreamBuffer(entries, onProgress);
      return work.syroBufferPromise;
    })(),
  };
}

/**
 * Transfer audio for one of KORG's .alldata files, which replaces the whole
 * sample memory of the volca sample (used to restore the factory samples or
 * to erase everything at once).
 *
 * @param {Uint8Array} allData
 * @param {(progress: number) => void} onProgress
 * @returns {SyroBufferWork}
 */
export function getSyroAllDataBuffer(allData, onProgress) {
  return buildSyroBuffer(
    1,
    async () => [allData],
    ({ createSyroDataFromAllData }, syroDataHandle, [data]) => {
      createSyroDataFromAllData(syroDataHandle, 0, data, data.length, 16, 1);
    },
    onProgress
  );
}

/**
 * Runs the Syro conversion in a web worker, for any kind of data.
 *
 * @param {number} numOfData
 * @param {(isCancelled: () => boolean) => Promise<(Uint8Array | null)[]>} prepareInputs
 * @param {(
 *   bindings: import('./getSyroBindings.js').SyroBindings,
 *   syroDataHandle: number,
 *   inputs: (Uint8Array | null)[]
 * ) => void} fillSyroData
 * @param {(progress: number) => void} onProgress
 * @returns {SyroBufferWork}
 */
function buildSyroBuffer(numOfData, prepareInputs, fillSyroData, onProgress) {
  let cancelled = false;
  let onCancel = () => {};
  return {
    cancelWork() {
      cancelled = true;
      onCancel();
    },
    syroBufferPromise: (async () => {
      const bindings = await getSyroBindings();
      const {
        allocateSyroData,
        prepareSampleBufferFromSyroData,
        getSampleBufferChunkPointer,
        getSampleBufferChunkSize,
        getSampleBufferProgress,
        getSampleBufferTotalSize,
        getSampleBufferDataStartPointsPointer,
        cancelSampleBufferWork,
        registerUpdateCallback,
        unregisterUpdateCallback,
        heap8Buffer,
      } = bindings;
      const emptyResponse = {
        syroBuffer: new Uint8Array(),
        dataStartPoints: [],
      };
      if (cancelled) {
        return emptyResponse;
      }
      const inputs = await prepareInputs(() => cancelled);
      if (cancelled) {
        return emptyResponse;
      }
      /** @type {Uint8Array | undefined} */
      let syroBuffer;
      let progress = 0;
      const dataStartPoints = new Uint32Array(numOfData);
      const onUpdate = registerUpdateCallback((sampleBufferUpdatePointer) => {
        if (cancelled) {
          return;
        }
        const totalSize = getSampleBufferTotalSize(sampleBufferUpdatePointer);
        if (!syroBuffer) {
          syroBuffer = new Uint8Array(totalSize);
        }
        const chunkPointer = getSampleBufferChunkPointer(
          sampleBufferUpdatePointer
        );
        const chunkSize = getSampleBufferChunkSize(sampleBufferUpdatePointer);
        const bytesProgress = getSampleBufferProgress(
          sampleBufferUpdatePointer
        );
        // save a new copy of the data so it doesn't disappear
        syroBuffer.set(
          new Uint8Array(heap8Buffer(), chunkPointer, chunkSize),
          bytesProgress - chunkSize
        );
        progress = bytesProgress / totalSize;
        const dataStartPointsPointer = getSampleBufferDataStartPointsPointer(
          sampleBufferUpdatePointer
        );
        dataStartPoints.set(
          new Uint32Array(heap8Buffer(), dataStartPointsPointer, numOfData),
          0
        );
      });
      const syroDataHandle = allocateSyroData(numOfData);
      fillSyroData(bindings, syroDataHandle, inputs);
      const workHandle = prepareSampleBufferFromSyroData(
        syroDataHandle,
        numOfData,
        onUpdate
      );
      onProgress(progress);
      try {
        await /** @type {Promise<void>} */ (
          new Promise((resolve) => {
            /**
             * @type {number}
             */
            let frame;
            onCancel = () => {
              cancelAnimationFrame(frame);
              cancelSampleBufferWork(workHandle);
              resolve();
            };
            checkProgress();
            function checkProgress() {
              // TODO: find a way to detect if the web worker failed to load, in
              // which case we should reject the promise
              if (progress) {
                onProgress(progress);
                if (progress >= 1) {
                  resolve();
                  return;
                }
              }
              frame = requestAnimationFrame(checkProgress);
            }
          })
        );
      } finally {
        onCancel = () => {};
        unregisterUpdateCallback(onUpdate);
      }
      if (cancelled) {
        return emptyResponse;
      }
      if (!syroBuffer) {
        throw new Error('Unexpected condition: syroBuffer should be defined');
      }
      return {
        syroBuffer,
        dataStartPoints: [...dataStartPoints],
      };
    })(),
  };
}

/**
 * @param {number[]} slotNumbers
 * @returns {Promise<{ syroBuffer: Uint8Array; dataStartPoints: number[] }>}
 */
export async function getSyroDeleteBuffer(slotNumbers) {
  const {
    allocateSyroData,
    createEmptySyroData,
    getDeleteBufferFromSyroData,
    getSampleBufferChunkPointer,
    getSampleBufferChunkSize,
    getSampleBufferDataStartPointsPointer,
    freeDeleteBuffer,
    heap8Buffer,
  } = await getSyroBindings();
  const syroDataHandle = allocateSyroData(slotNumbers.length);
  slotNumbers.forEach((slotNumber, i) => {
    createEmptySyroData(syroDataHandle, i, slotNumber);
  });
  const deleteBufferUpdatePointer = getDeleteBufferFromSyroData(
    syroDataHandle,
    slotNumbers.length
  );
  const chunkPointer = getSampleBufferChunkPointer(deleteBufferUpdatePointer);
  const chunkSize = getSampleBufferChunkSize(deleteBufferUpdatePointer);
  // save a new copy of the data so it doesn't disappear
  const syroBuffer = new Uint8Array(
    new Uint8Array(heap8Buffer(), chunkPointer, chunkSize)
  );
  const dataStartPointsPointer = getSampleBufferDataStartPointsPointer(
    deleteBufferUpdatePointer
  );
  const dataStartPoints = [
    ...new Uint32Array(
      heap8Buffer(),
      dataStartPointsPointer,
      slotNumbers.length
    ),
  ];
  freeDeleteBuffer(deleteBufferUpdatePointer);
  return { syroBuffer, dataStartPoints };
}

/**
 * @typedef {import('../store').SampleContainer} SampleContainer
 */
/**
 * @template {number | SampleContainer} T
 * @param {object} params
 * @param {Uint8Array | Error | null} params.syroBuffer
 * @param {number[]} params.dataStartPoints
 * @param {T[]} params.selectedItems
 */
export function useSyroTransfer({
  syroBuffer,
  dataStartPoints: _dataStartPoints,
  selectedItems,
}) {
  const [dataStartPoints, setDataStartPoints] = useState(
    /** @type {number[]} */ ([])
  );
  const [syroAudioBuffer, setSyroAudioBuffer] = useState(
    /** @type {AudioBuffer | Error | null} */ (null)
  );
  useEffect(() => {
    setSyroAudioBuffer(null);
    setDataStartPoints(
      syroBuffer && syroBuffer instanceof Uint8Array
        ? _dataStartPoints.map((p) => p / syroBuffer.length)
        : []
    );
    if (syroBuffer) {
      let cancelled = false;
      if (syroBuffer instanceof Uint8Array) {
        (async () => {
          try {
            const audioBuffer = await getAudioBufferForAudioFileData(
              syroBuffer
            );
            if (!cancelled) {
              setSyroAudioBuffer(audioBuffer);
            }
          } catch (err) {
            console.error(err);
            setSyroAudioBuffer(new Error(String(err)));
          }
        })();
        return () => {
          cancelled = true;
        };
      } else {
        setSyroAudioBuffer(syroBuffer);
      }
    }
  }, [syroBuffer, _dataStartPoints]);
  const [transferProgress, setTransferProgress] = useState(0);
  const [syroTransferState, setSyroTransferState] = useState(
    /** @type {'idle' | 'transferring' | 'error'} */ ('idle')
  );
  useLayoutEffect(() => {
    if (syroTransferState === 'transferring') {
      return () => {
        // reset progress for next time
        setTimeout(() => setTransferProgress(0), 100);
      };
    }
  }, [syroTransferState]);
  useEffect(() => {
    setSyroTransferState('idle');
  }, [selectedItems]);
  const [callbackOnSyroBuffer, setCallbackOnSyroBuffer] = useState(
    /** @type {{ fn: () => void } | null} */ (null)
  );
  useEffect(() => {
    if (syroAudioBuffer instanceof AudioBuffer && callbackOnSyroBuffer) {
      callbackOnSyroBuffer.fn();
    }
    if (callbackOnSyroBuffer) {
      setCallbackOnSyroBuffer(null);
    }
  }, [syroAudioBuffer, callbackOnSyroBuffer]);
  // to be set when transfer is started
  const stop = useRef(() => {
    setSyroTransferState('idle');
  });
  const { playAudioBuffer } = useAudioPlaybackContext();
  /** @type {React.MouseEventHandler} */
  const handleTransfer = useCallback(
    (e) => {
      if (!(syroAudioBuffer instanceof AudioBuffer)) {
        if (!syroAudioBuffer) {
          const { target, nativeEvent } = e;
          // wait until the syro buffer is ready then simulate the event to
          // retry this handler. it's important that we simulate another
          // action because otherwise iOS won't let us play the audio later.
          setCallbackOnSyroBuffer({
            fn: () => target.dispatchEvent(nativeEvent),
          });
        }
        return;
      }
      try {
        setSyroTransferState('transferring');
        const stopPlayback = playAudioBuffer(syroAudioBuffer, {
          onTimeUpdate: (currentTime) =>
            setTransferProgress(currentTime / syroAudioBuffer.duration),
        });
        stop.current = () => {
          stopPlayback();
          setSyroTransferState('idle');
        };
      } catch (err) {
        console.error(err);
        setSyroTransferState('error');
      }
    },
    [playAudioBuffer, syroAudioBuffer]
  );
  const handleCancel = useCallback(() => stop.current(), []);
  const transferInProgress =
    syroTransferState === 'transferring' && transferProgress < 1;

  const {
    currentlyTransferringItem,
    currentItemProgress,
    timeLeftUntilNextItem,
  } = useMemo(
    /**
     * @returns {{
     *   currentlyTransferringItem: T;
     *   currentItemProgress: number;
     *   timeLeftUntilNextItem: number;
     * }}
     */
    () => {
      if (
        syroTransferState !== 'transferring' ||
        !(syroAudioBuffer instanceof AudioBuffer)
      ) {
        return {
          currentlyTransferringItem: selectedItems[0],
          currentItemProgress: 0,
          timeLeftUntilNextItem: 0,
        };
      }
      const foundIndex =
        dataStartPoints.findIndex((p) => p > transferProgress) - 1;
      const currentTransferIndex =
        foundIndex >= 0 ? foundIndex : selectedItems.length - 1;
      const currentlyTransferringItem = selectedItems[currentTransferIndex];
      const currentStartPoint = dataStartPoints[currentTransferIndex];
      const nextStartPoint = dataStartPoints[currentTransferIndex + 1] || 1;
      const currentItemProgress =
        (transferProgress - currentStartPoint) /
        (nextStartPoint - currentStartPoint);
      const timeLeftUntilNextSample =
        (nextStartPoint - transferProgress) * syroAudioBuffer.duration;
      return {
        currentlyTransferringItem,
        currentItemProgress,
        timeLeftUntilNextItem: timeLeftUntilNextSample,
      };
    },
    [
      selectedItems,
      dataStartPoints,
      syroTransferState,
      transferProgress,
      syroAudioBuffer,
    ]
  );

  return {
    startTransfer: handleTransfer,
    stopTransfer: handleCancel,
    syroTransferState,
    transferInProgress,
    transferProgress,
    currentlyTransferringItem,
    currentItemProgress,
    timeLeftUntilNextItem,
    syroAudioBuffer,
  };
}
