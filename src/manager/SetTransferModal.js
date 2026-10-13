import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Button, Form, Modal, ProgressBar } from 'react-bootstrap';

import { getSyroSetBuffer, useSyroTransfer } from '../utils/syro.js';
import { formatLongTime } from '../utils/datetime.js';
import { getDisplayName } from '../utils/categories.js';
import { SampleContainer } from '../store.js';

import classes from './SetTransferModal.module.scss';

/** @typedef {import('../sampleCacheStore.js').SampleCache} SampleCache */
/** @typedef {import('../utils/deviceDiff.js').DeviceDiff} DeviceDiff */
/** @typedef {import('../useDeviceState.js').DeviceStateApi} DeviceStateApi */

// Measured with the Syro encoder: every item has a fixed overhead and an
// uncompressed sample takes about 20 s of transfer per second of audio.
// Compressed samples are faster, so this is an upper bound.
const SECONDS_PER_ERASE = 1.85;
const SECONDS_PER_SAMPLE = 2.5;
const TRANSFER_SECONDS_PER_AUDIO_SECOND = 20;

/** @param {number} seconds */
function formatEstimate(seconds) {
  return seconds < 60
    ? `${Math.ceil(seconds)} s`
    : `${Math.ceil(seconds / 60)} min`;
}

/** @param {number} slot */
function formatSlot(slot) {
  return slot.toString().padStart(2, '0');
}

/**
 * @typedef {{
 *   send: SampleContainer[];
 *   erase: number[];
 * }} TransferPlan
 */

/**
 * @typedef {{ slot: number; label: string }} TransferItem
 */

/**
 * @param {{
 *   show: boolean;
 *   onHide: () => void;
 *   samples: (SampleContainer | null)[]; // index = slot number
 *   sampleCaches: Map<string, SampleCache>;
 *   deviceState: DeviceStateApi;
 * }} props
 */
function SetTransferModal({
  show,
  onHide,
  samples,
  sampleCaches,
  deviceState,
}) {
  const { diff, recordTransfer, markUnknown } = deviceState;
  const [step, setStep] = useState(
    /** @type {'choose' | 'connect' | 'done'} */ ('choose')
  );
  const [mode, setMode] = useState(
    /** @type {'changes' | 'all'} */ ('changes')
  );
  const [eraseUnknown, setEraseUnknown] = useState(true);
  const [plan, setPlan] = useState(/** @type {TransferPlan | null} */ (null));

  // start over every time the modal opens
  useEffect(() => {
    if (show) {
      setStep('choose');
      setPlan(null);
      setEraseUnknown(true);
      setMode('changes');
    }
  }, [show]);

  const canChooseChanges = diff.unchanged > 0;

  /** @param {'changes' | 'all'} mode */
  const getPlan = (mode) => {
    const sendSlots =
      mode === 'changes'
        ? diff.toSend
        : samples.flatMap((sample, slot) => (sample ? [slot] : []));
    /** @type {TransferPlan} */
    const plan = {
      send: sendSlots.flatMap((slotNumber) => {
        const sample = samples[slotNumber];
        return sample
          ? [
              new SampleContainer({
                ...sample.metadata,
                id: sample.id,
                slotNumber,
              }),
            ]
          : [];
      }),
      erase: [...diff.toErase, ...(eraseUnknown ? diff.unknownEmpty : [])].sort(
        (a, b) => a - b
      ),
    };
    return plan;
  };

  /** @param {TransferPlan} plan */
  const estimateSeconds = (plan) =>
    plan.erase.length * SECONDS_PER_ERASE +
    plan.send.reduce((total, sample) => {
      const cache = sampleCaches.get(sample.id);
      const duration = cache ? cache.cachedInfo.duration : 1;
      return (
        total +
        SECONDS_PER_SAMPLE +
        duration * TRANSFER_SECONDS_PER_AUDIO_SECOND
      );
    }, 0);

  const changesPlan = getPlan('changes');
  const allPlan = getPlan('all');
  const effectiveMode = canChooseChanges ? mode : 'all';
  const chosenPlan = effectiveMode === 'changes' ? changesPlan : allPlan;
  const isNothingToDo = !chosenPlan.send.length && !chosenPlan.erase.length;

  const brokenSamples = chosenPlan.send.filter((sample) => {
    const cache = sampleCaches.get(sample.id);
    return cache && cache.cachedInfo.failedPluginIndex > -1;
  });

  // prepare the transfer audio for the chosen plan
  const [{ syroBuffer, dataStartPoints }, setSyroBuffer] = useState({
    syroBuffer: /** @type {Uint8Array | Error | null} */ (null),
    dataStartPoints: /** @type {number[]} */ ([]),
  });
  const [preparing, setPreparing] = useState(0);
  useEffect(() => {
    setSyroBuffer({ syroBuffer: null, dataStartPoints: [] });
    setPreparing(0);
    if (!plan) return;
    let cancelled = false;
    const work = getSyroSetBuffer(plan.send, plan.erase, (p) => {
      if (!cancelled) setPreparing(p);
    });
    work.syroBufferPromise.then(
      (result) => {
        if (!cancelled) setSyroBuffer(result);
      },
      (err) => {
        console.error(err);
        if (!cancelled) {
          setSyroBuffer({
            syroBuffer: new Error(String(err)),
            dataStartPoints: [],
          });
        }
      }
    );
    return () => {
      cancelled = true;
      work.cancelWork();
    };
  }, [plan]);

  // in stream order: erases first, then samples
  const items = useMemo(
    () =>
      /** @type {TransferItem[]} */ (
        plan
          ? [
              ...plan.erase.map((slot) => ({
                slot,
                label: `Erasing slot ${formatSlot(slot)}`,
              })),
              ...plan.send.map((sample) => ({
                slot: sample.metadata.slotNumber,
                label: `${getDisplayName(
                  sample.metadata.name
                )} to slot ${formatSlot(sample.metadata.slotNumber)}`,
              })),
            ]
          : []
      ),
    [plan]
  );

  const {
    syroAudioBuffer,
    syroTransferState,
    transferInProgress,
    transferProgress,
    currentlyTransferringItem,
    startTransfer,
    stopTransfer,
  } = useSyroTransfer({ syroBuffer, dataStartPoints, selectedItems: items });

  // when the audio has played completely, the volca has everything
  const recorded = useRef(/** @type {TransferPlan | null} */ (null));
  useEffect(() => {
    if (
      plan &&
      syroTransferState === 'transferring' &&
      transferProgress >= 1 &&
      recorded.current !== plan
    ) {
      recorded.current = plan;
      recordTransfer({
        sent: plan.send.map((s) => ({
          slotNumber: s.metadata.slotNumber,
          id: s.id,
          metadata: s.metadata,
        })),
        erased: plan.erase,
      });
      setStep('done');
    }
  }, [plan, syroTransferState, transferProgress, recordTransfer]);

  const planSlots = plan
    ? [...plan.erase, ...plan.send.map((s) => s.metadata.slotNumber)]
    : [];

  const stopEarly = () => {
    stopTransfer();
    // we can't tell how far the volca got
    markUnknown(planSlots);
    setStep('choose');
    setPlan(null);
  };

  const close = () => {
    if (transferInProgress) {
      stopEarly();
    } else if (syroTransferState !== 'idle') {
      stopTransfer();
    }
    onHide();
  };

  const isReady = syroAudioBuffer instanceof AudioBuffer;
  const hasError = syroAudioBuffer instanceof Error;

  /**
   * @param {TransferPlan} plan
   * @param {boolean} [short]
   */
  const describePlan = (plan, short) => {
    const parts = [];
    if (plan.send.length) {
      parts.push(
        `${plan.send.length} sample${plan.send.length === 1 ? '' : 's'}${
          short ? '' : ' to send'
        }`
      );
    }
    if (plan.erase.length) {
      parts.push(
        `${plan.erase.length} slot${
          plan.erase.length === 1 ? '' : 's'
        } to erase`
      );
    }
    return parts.join(' + ') || 'nothing to send';
  };

  return (
    <Modal
      show={show}
      onHide={close}
      backdrop={transferInProgress ? 'static' : true}
      keyboard={!transferInProgress}
    >
      <Modal.Header closeButton={!transferInProgress}>
        <Modal.Title>Transfer to volca</Modal.Title>
      </Modal.Header>
      <Modal.Body>
        {step === 'choose' && (
          <>
            {!diff.isKnown && (
              <p className={classes.note}>
                {diff.unchanged
                  ? "For some slots the app doesn't know what's on your volca, so it sends them again."
                  : "The app doesn't know yet what's on your volca, so it sends the whole set. After that, it only sends what changed."}
              </p>
            )}
            {canChooseChanges ? (
              <div className={classes.options}>
                <Form.Check
                  type="radio"
                  id="transfer-mode-changes"
                  name="transfer-mode"
                  checked={mode === 'changes'}
                  onChange={() => setMode('changes')}
                  label={
                    <>
                      <strong>Only changes</strong>
                      <span className={classes.optionDetail}>
                        {describePlan(changesPlan)}
                        {changesPlan.send.length || changesPlan.erase.length
                          ? ` · up to ~${formatEstimate(
                              estimateSeconds(changesPlan)
                            )}`
                          : ''}
                        <br />
                        {diff.unchanged} slot
                        {diff.unchanged === 1 ? ' is' : 's are'} already on your
                        volca
                      </span>
                    </>
                  }
                />
                <Form.Check
                  type="radio"
                  id="transfer-mode-all"
                  name="transfer-mode"
                  checked={mode === 'all'}
                  onChange={() => setMode('all')}
                  label={
                    <>
                      <strong>Everything</strong>
                      <span className={classes.optionDetail}>
                        {describePlan(allPlan)} · up to ~
                        {formatEstimate(estimateSeconds(allPlan))}
                        <br />
                        Use this if your volca was changed outside this app.
                      </span>
                    </>
                  }
                />
              </div>
            ) : (
              <p>
                <strong>{describePlan(allPlan)}</strong>
                {!isNothingToDo &&
                  ` · up to ~${formatEstimate(estimateSeconds(allPlan))}`}
              </p>
            )}
            {diff.unknownEmpty.length > 0 && (
              <Form.Check
                id="transfer-erase-unknown"
                className={classes.eraseUnknown}
                checked={eraseUnknown}
                onChange={(e) => setEraseUnknown(e.target.checked)}
                label={
                  <>
                    Also erase the {diff.unknownEmpty.length} empty slot
                    {diff.unknownEmpty.length === 1 ? '' : 's'} of this set
                    <span className={classes.optionDetail}>
                      So nothing old stays behind on your volca (~
                      {formatEstimate(
                        diff.unknownEmpty.length * SECONDS_PER_ERASE
                      )}
                      ).
                    </span>
                  </>
                }
              />
            )}
            {isNothingToDo && (
              <p className={classes.inSync}>
                Your volca is in sync with this set. Nothing to send.
              </p>
            )}
            {brokenSamples.length > 0 && (
              <p className="text-danger">
                Fix the plugins of{' '}
                {brokenSamples
                  .map((s) => getDisplayName(s.metadata.name))
                  .join(', ')}{' '}
                first.
              </p>
            )}
          </>
        )}

        {step === 'connect' && !transferInProgress && (
          <>
            <figure className={classes.figure}>
              <img src="connection.png" alt="" />
            </figure>
            <p>
              Connect your <strong>headphone output</strong> to the volca
              sample's <strong>SYNC IN</strong> and set your output volume high
              (but not distorted). Turn off any audio effects or equalizer.
            </p>
            <p className={classes.muted}>
              {plan && describePlan(plan)}
              {isReady &&
                `. The transfer takes ${formatLongTime(
                  syroAudioBuffer.duration
                )}.`}
            </p>
            {!isReady && !hasError && (
              <ProgressBar
                now={preparing * 100}
                label="Preparing transfer audio"
              />
            )}
            {hasError && (
              <p className="text-danger">
                Could not prepare the transfer audio. Please reload the page and
                try again.
              </p>
            )}
          </>
        )}

        {transferInProgress && (
          <>
            <p>Transferring to your volca sample. Don't disconnect anything.</p>
            <ProgressBar
              striped
              animated
              variant="primary"
              now={100 * transferProgress}
            />
            <div className={classes.current}>
              <span>
                {currentlyTransferringItem && currentlyTransferringItem.label}
              </span>
              <span className={classes.timeLeft}>
                {isReady &&
                  formatLongTime(
                    syroAudioBuffer.duration * (1 - transferProgress)
                  )}{' '}
                remaining
              </span>
            </div>
          </>
        )}

        {step === 'done' && !transferInProgress && (
          <>
            <p>
              <strong>Done.</strong> Your volca should show <strong>End</strong>
              : press the blinking <strong>FUNC</strong> button to finish.
            </p>
            <p className={classes.muted}>
              Saw <strong>Err dcod</strong>? Check the cable and volume, and try
              again. <strong>Err FuLL</strong>? The samples need more memory
              than the volca has left.
            </p>
            <Button
              variant="link"
              className={classes.unknownLink}
              onClick={() => {
                markUnknown(planSlots);
                close();
              }}
            >
              Volca showed an error? Mark these slots as unknown
            </Button>
          </>
        )}
      </Modal.Body>
      <Modal.Footer>
        {step === 'choose' && (
          <>
            <Button variant="light" onClick={close}>
              Cancel
            </Button>
            <Button
              variant="primary"
              disabled={isNothingToDo || brokenSamples.length > 0}
              onClick={() => {
                setPlan(chosenPlan);
                setStep('connect');
              }}
            >
              Continue
            </Button>
          </>
        )}
        {step === 'connect' && !transferInProgress && (
          <>
            <Button
              variant="light"
              onClick={() => {
                setPlan(null);
                setStep('choose');
              }}
            >
              Back
            </Button>
            <Button
              variant="primary"
              disabled={!isReady}
              onClick={startTransfer}
            >
              Transfer now
            </Button>
          </>
        )}
        {transferInProgress && (
          <Button variant="outline-secondary" onClick={stopEarly}>
            Stop
          </Button>
        )}
        {step === 'done' && !transferInProgress && (
          <Button variant="primary" onClick={close}>
            Close
          </Button>
        )}
      </Modal.Footer>
    </Modal>
  );
}

export default SetTransferModal;
