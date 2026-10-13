import React, { useEffect, useState } from 'react';
import { Button, Form, Modal, ProgressBar } from 'react-bootstrap';

import { getSyroAllDataBuffer, useSyroTransfer } from '../utils/syro.js';
import { formatLongTime } from '../utils/datetime.js';

import classes from './AllDataTransferModal.module.scss';

/**
 * @typedef {'restoreFactory' | 'eraseAll'} AllDataAction
 */

/** @type {Record<AllDataAction, {
 *   title: string;
 *   file: string;
 *   intro: string;
 *   confirm: string;
 *   button: string;
 * }>} */
const ACTIONS = {
  restoreFactory: {
    title: 'Restore factory samples',
    file: 'korg-alldata/all_sample_preset.alldata',
    intro:
      'Puts the 100 original KORG samples back on your volca sample, in their original slots. This uses the official factory data from KORG.',
    confirm:
      'I understand that all samples currently on my volca sample will be replaced.',
    button: 'Restore factory samples',
  },
  eraseAll: {
    title: 'Erase all samples',
    file: 'korg-alldata/all_sample_empty.alldata',
    intro:
      'Empties the complete sample memory of your volca sample in one go, so a new set has all the room it needs. Much faster than erasing slots one by one.',
    confirm: 'I understand that all samples on my volca sample will be erased.',
    button: 'Erase all samples',
  },
};

// stable reference for useSyroTransfer
const TRANSFER_ITEMS = [0];

/**
 * @param {{
 *   action: AllDataAction | null;
 *   onHide: () => void;
 * }} props
 */
function AllDataTransferModal({ action, onHide }) {
  const config = action ? ACTIONS[action] : null;
  const [step, setStep] = useState(
    /** @type {'confirm' | 'connect' | 'done'} */ ('confirm')
  );
  const [understood, setUnderstood] = useState(false);
  const [{ syroBuffer, dataStartPoints }, setSyroBuffer] = useState({
    syroBuffer: /** @type {Uint8Array | Error | null} */ (null),
    dataStartPoints: /** @type {number[]} */ ([]),
  });
  const [preparing, setPreparing] = useState(0);

  // reset when opened for an action
  useEffect(() => {
    setStep('confirm');
    setUnderstood(false);
    setSyroBuffer({ syroBuffer: null, dataStartPoints: [] });
  }, [action]);

  // prepare the transfer audio as soon as the modal opens
  useEffect(() => {
    if (!config) return;
    let cancelled = false;
    let cancelWork = () => {};
    (async () => {
      try {
        const res = await fetch(config.file);
        if (!res.ok) throw new Error(`Could not load ${config.file}`);
        const allData = new Uint8Array(await res.arrayBuffer());
        if (cancelled) return;
        const work = getSyroAllDataBuffer(allData, (p) => {
          if (!cancelled) setPreparing(p);
        });
        cancelWork = work.cancelWork;
        const result = await work.syroBufferPromise;
        if (!cancelled) setSyroBuffer(result);
      } catch (err) {
        console.error(err);
        if (!cancelled) {
          setSyroBuffer({
            syroBuffer: new Error(String(err)),
            dataStartPoints: [],
          });
        }
      }
    })();
    return () => {
      cancelled = true;
      cancelWork();
    };
  }, [config]);

  const {
    syroAudioBuffer,
    syroTransferState,
    transferInProgress,
    transferProgress,
    startTransfer,
    stopTransfer,
  } = useSyroTransfer({
    syroBuffer,
    dataStartPoints,
    selectedItems: TRANSFER_ITEMS,
  });

  // when the audio has played completely, the transfer is done
  useEffect(() => {
    if (syroTransferState === 'transferring' && transferProgress >= 1) {
      setStep('done');
    }
  }, [syroTransferState, transferProgress]);

  const isReady = syroAudioBuffer instanceof AudioBuffer;
  const hasError = syroAudioBuffer instanceof Error;

  const close = () => {
    if (transferInProgress) stopTransfer();
    onHide();
  };

  return (
    <Modal
      show={Boolean(config)}
      onHide={close}
      backdrop={transferInProgress ? 'static' : true}
      keyboard={!transferInProgress}
    >
      <Modal.Header closeButton={!transferInProgress}>
        <Modal.Title>{config && config.title}</Modal.Title>
      </Modal.Header>
      <Modal.Body>
        {config && step === 'confirm' && (
          <>
            <p>{config.intro}</p>
            <div className={classes.warning}>
              If the transfer is interrupted, the volca sample erases its
              complete sample memory. Keep the cable connected and don't play
              other sounds until it's done. Your samples in this app are not
              affected.
            </div>
            <Form.Check
              id="all-data-understood"
              className={classes.understood}
              label={config.confirm}
              checked={understood}
              onChange={(e) => setUnderstood(e.target.checked)}
            />
          </>
        )}
        {config && step === 'connect' && !transferInProgress && (
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
              The volca shows <strong>ALL</strong> while receiving.
              {isReady &&
                ` The transfer takes about ${formatLongTime(
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
            <div className={classes.timeLeft}>
              {isReady &&
                formatLongTime(
                  syroAudioBuffer.duration * (1 - transferProgress)
                )}{' '}
              remaining
            </div>
          </>
        )}
        {step === 'done' && !transferInProgress && (
          <>
            <p>
              <strong>Done.</strong> Check the display of your volca sample: it
              should not show an error.
            </p>
            <p className={classes.muted}>
              Got an error (for example <strong>Err</strong>)? Check the cable
              and volume, and try again.
            </p>
          </>
        )}
      </Modal.Body>
      <Modal.Footer>
        {step === 'confirm' && (
          <>
            <Button variant="light" onClick={close}>
              Cancel
            </Button>
            <Button
              variant="primary"
              disabled={!understood}
              onClick={() => setStep('connect')}
            >
              Continue
            </Button>
          </>
        )}
        {step === 'connect' && !transferInProgress && (
          <>
            <Button variant="light" onClick={close}>
              Cancel
            </Button>
            <Button
              variant="primary"
              disabled={!isReady}
              onClick={startTransfer}
            >
              {config && config.button}
            </Button>
          </>
        )}
        {transferInProgress && (
          <Button variant="outline-secondary" onClick={stopTransfer}>
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

export default AllDataTransferModal;
