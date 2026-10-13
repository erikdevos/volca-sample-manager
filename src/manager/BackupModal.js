import React, { useEffect, useRef, useState } from 'react';
import { Button, Form, Modal, ProgressBar } from 'react-bootstrap';

import {
  exportBackup,
  getLastBackupDate,
  readBackup,
  restoreBackup,
} from '../utils/backup.js';
import { formatDate } from '../utils/datetime.js';

import classes from './BackupModal.module.scss';

/** @typedef {import('../store').SampleContainer} SampleContainer */
/** @typedef {import('../utils/backup.js').BackupManifest} BackupManifest */
/** @typedef {import('../utils/backup.js').RestoreResult} RestoreResult */

/**
 * @param {{
 *   show: boolean;
 *   onHide: () => void;
 *   userSamples: Map<string, SampleContainer>;
 *   factorySamples: Map<string, SampleContainer>;
 *   setCount: number;
 *   activeSetId: string | null;
 * }} props
 */
function BackupModal({
  show,
  onHide,
  userSamples,
  factorySamples,
  setCount,
  activeSetId,
}) {
  const [exportProgress, setExportProgress] = useState(
    /** @type {number | null} */ (null)
  );
  const [lastBackup, setLastBackup] = useState(getLastBackupDate);
  const [backup, setBackup] = useState(
    /** @type {Awaited<ReturnType<typeof readBackup>> | null} */ (null)
  );
  const [error, setError] = useState(/** @type {string | null} */ (null));
  const [mode, setMode] = useState(
    /** @type {'merge' | 'replace'} */ ('merge')
  );
  const [confirmReplace, setConfirmReplace] = useState(false);
  const [restoreProgress, setRestoreProgress] = useState(
    /** @type {number | null} */ (null)
  );
  const [result, setResult] = useState(
    /** @type {RestoreResult | null} */ (null)
  );
  /** @type {React.RefObject<HTMLInputElement>} */
  const fileInputRef = useRef(null);

  useEffect(() => {
    if (show) {
      setBackup(null);
      setError(null);
      setMode('merge');
      setConfirmReplace(false);
      setResult(null);
      setRestoreProgress(null);
      setLastBackup(getLastBackupDate());
    }
  }, [show]);

  const isBusy = exportProgress !== null || restoreProgress !== null;

  const handleExport = async () => {
    setError(null);
    setExportProgress(0);
    try {
      const { blob, fileName } = await exportBackup({
        userSamples: [...userSamples.values()],
        activeSetId,
        onProgress: setExportProgress,
      });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = fileName;
      link.click();
      setTimeout(() => URL.revokeObjectURL(url), 10000);
      setLastBackup(getLastBackupDate());
    } catch (err) {
      console.error(err);
      setError('Could not create the backup. Please try again.');
    }
    setExportProgress(null);
  };

  /** @param {File} file */
  const handleFile = async (file) => {
    setError(null);
    setBackup(null);
    try {
      setBackup(await readBackup(file));
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  const handleRestore = async () => {
    if (!backup) return;
    setError(null);
    setRestoreProgress(0);
    try {
      setResult(
        await restoreBackup({
          ...backup,
          mode,
          userSamples: [...userSamples.values()],
          factorySampleIds: new Set(factorySamples.keys()),
          onProgress: setRestoreProgress,
        })
      );
    } catch (err) {
      console.error(err);
      setError(
        'Something went wrong while restoring. Reload the page to see what was restored.'
      );
    }
    setRestoreProgress(null);
  };

  const backupSampleCount = backup
    ? Object.keys(backup.manifest.samples).length
    : 0;

  return (
    <Modal
      show={show}
      onHide={result ? () => window.location.reload() : onHide}
      backdrop={isBusy ? 'static' : true}
      keyboard={!isBusy}
    >
      <Modal.Header closeButton={!isBusy}>
        <Modal.Title>Backup &amp; restore</Modal.Title>
      </Modal.Header>
      <Modal.Body>
        {result ? (
          <div className={classes.result}>
            <p>
              <strong>Restored.</strong>
            </p>
            <ul>
              <li>
                {result.added} sample{result.added === 1 ? '' : 's'} added
                {result.skipped > 0 &&
                  `, ${result.skipped} already in your collection`}
              </li>
              <li>
                {result.setsAdded} set{result.setsAdded === 1 ? '' : 's'} added
                {result.setsSkipped > 0 &&
                  `, ${result.setsSkipped} already there`}
              </li>
              {result.deviceRestored && (
                <li>What's on your volca was restored too</li>
              )}
              {result.failed.length > 0 && (
                <li className="text-danger">
                  Could not restore: {result.failed.join(', ')}
                </li>
              )}
            </ul>
            <p className={classes.muted}>The app reloads to show everything.</p>
          </div>
        ) : (
          <>
            <section className={classes.section}>
              <h3>Backup</h3>
              <p>
                Saves your collection ({userSamples.size} samples, with the
                original audio), your {setCount} set
                {setCount === 1 ? '' : 's'} and what's on your volca in one zip
                file.
              </p>
              <div className={classes.row}>
                <Button
                  variant="primary"
                  disabled={isBusy || !userSamples.size}
                  onClick={handleExport}
                >
                  Download backup
                </Button>
                <span className={classes.muted}>
                  {lastBackup
                    ? `Last backup: ${formatDate(lastBackup)}`
                    : 'No backup made in this browser yet'}
                </span>
              </div>
              {exportProgress !== null && (
                <ProgressBar
                  className={classes.progress}
                  now={exportProgress * 100}
                  label="Creating backup"
                />
              )}
            </section>

            <section className={classes.section}>
              <h3>Restore</h3>
              <input
                ref={fileInputRef}
                type="file"
                accept=".zip,application/zip"
                hidden
                onChange={(e) => {
                  const file = e.target.files && e.target.files[0];
                  if (file) handleFile(file);
                  e.target.value = '';
                }}
              />
              {!backup ? (
                <Button
                  variant="outline-secondary"
                  disabled={isBusy}
                  onClick={() => fileInputRef.current?.click()}
                >
                  Choose backup file...
                </Button>
              ) : (
                <>
                  <p>
                    Backup from{' '}
                    <strong>
                      {formatDate(new Date(backup.manifest.createdAt))}
                    </strong>
                    : {backupSampleCount} sample
                    {backupSampleCount === 1 ? '' : 's'},{' '}
                    {backup.manifest.sets.length} set
                    {backup.manifest.sets.length === 1 ? '' : 's'}.
                  </p>
                  <Form.Check
                    type="radio"
                    id="restore-merge"
                    name="restore-mode"
                    checked={mode === 'merge'}
                    onChange={() => setMode('merge')}
                    label={
                      <>
                        <strong>Add to what's here</strong>
                        <span className={classes.optionDetail}>
                          Keeps everything in this browser. Samples you already
                          have are skipped.
                        </span>
                      </>
                    }
                  />
                  <Form.Check
                    type="radio"
                    id="restore-replace"
                    name="restore-mode"
                    checked={mode === 'replace'}
                    onChange={() => setMode('replace')}
                    label={
                      <>
                        <strong>Replace everything</strong>
                        <span className={classes.optionDetail}>
                          Erases your collection, sets and volca state in this
                          browser first.
                        </span>
                      </>
                    }
                  />
                  {mode === 'replace' && (
                    <Form.Check
                      id="restore-replace-confirm"
                      className={classes.confirm}
                      checked={confirmReplace}
                      onChange={(e) => setConfirmReplace(e.target.checked)}
                      label="I understand that everything in this browser is replaced by the backup."
                    />
                  )}
                  {restoreProgress !== null && (
                    <ProgressBar
                      className={classes.progress}
                      now={restoreProgress * 100}
                      label="Restoring"
                    />
                  )}
                </>
              )}
            </section>
          </>
        )}
        {error && <p className="text-danger">{error}</p>}
      </Modal.Body>
      <Modal.Footer>
        {result ? (
          <Button variant="primary" onClick={() => window.location.reload()}>
            Reload app
          </Button>
        ) : (
          <>
            <Button variant="light" disabled={isBusy} onClick={onHide}>
              Close
            </Button>
            {backup && (
              <Button
                variant="primary"
                disabled={isBusy || (mode === 'replace' && !confirmReplace)}
                onClick={handleRestore}
              >
                Restore backup
              </Button>
            )}
          </>
        )}
      </Modal.Footer>
    </Modal>
  );
}

export default BackupModal;
