import React, { useCallback, useMemo, useRef, useState } from 'react';
import { Button, Modal, ProgressBar } from 'react-bootstrap';

import {
  importFilesToLibrary,
  requestPersistentStorage,
} from './utils/libraryImport.js';

import classes from './LibraryImport.module.scss';

/** @typedef {import('./store').SampleContainer} SampleContainer */
/** @typedef {import('./sampleCacheStore.js').SampleCache} SampleCache */
/** @typedef {import('./utils/libraryImport.js').LibraryImportResult} LibraryImportResult */

/**
 * Reads all files from a drag & drop, including files in dropped folders.
 *
 * @param {DataTransfer} dataTransfer
 * @returns {Promise<File[]>}
 */
async function getDroppedFiles(dataTransfer) {
  const entries = [...dataTransfer.items]
    .map((item) => item.webkitGetAsEntry && item.webkitGetAsEntry())
    .filter(Boolean);
  if (!entries.length) {
    return [...dataTransfer.files];
  }
  /** @type {File[]} */
  const files = [];
  /** @param {any} entry */
  async function walk(entry) {
    if (entry.isFile) {
      files.push(
        await new Promise((resolve, reject) => entry.file(resolve, reject))
      );
    } else if (entry.isDirectory) {
      const reader = entry.createReader();
      // readEntries returns results in batches until it returns nothing
      for (;;) {
        /** @type {any[]} */
        const batch = await new Promise((resolve, reject) =>
          reader.readEntries(resolve, reject)
        );
        if (!batch.length) break;
        for (const child of batch) {
          await walk(child);
        }
      }
    }
  }
  for (const entry of entries) {
    await walk(entry);
  }
  return files;
}

const LibraryImport = React.memo(
  /**
   * @param {{
   *   userSamples: Map<string, SampleContainer>;
   *   onBulkImport: (
   *     samples: SampleContainer[],
   *     sampleCaches: SampleCache[]
   *   ) => void;
   * }} props
   */
  function LibraryImport({ userSamples, onBulkImport }) {
    /** @type {React.RefObject<HTMLInputElement>} */
    const folderInputRef = useRef(null);
    const [progress, setProgress] = useState(
      /** @type {number | null} */ (null)
    );
    const [result, setResult] = useState(
      /** @type {LibraryImportResult | null} */ (null)
    );
    const [isDragOver, setIsDragOver] = useState(false);

    const knownSourceHashes = useMemo(
      () =>
        new Set(
          /** @type {string[]} */ (
            [...userSamples.values()]
              .map((s) => s.metadata.sourceHash)
              .filter(Boolean)
          )
        ),
      [userSamples]
    );
    const knownSourceHashesRef = useRef(knownSourceHashes);
    knownSourceHashesRef.current = knownSourceHashes;

    const importFiles = useCallback(
      /** @param {File[]} files */
      async (files) => {
        setProgress(0);
        requestPersistentStorage();
        const result = await importFilesToLibrary(
          files,
          knownSourceHashesRef.current,
          setProgress
        );
        if (result.samples.length) {
          onBulkImport(result.samples, result.sampleCaches);
        }
        setProgress(null);
        setResult(result);
      },
      [onBulkImport]
    );

    const isImporting = progress !== null;

    return (
      <>
        <div
          className={[
            classes.dropZone,
            isDragOver ? classes.dragOver : '',
          ].join(' ')}
          onDragOver={(e) => {
            e.preventDefault();
            setIsDragOver(true);
          }}
          onDragLeave={() => setIsDragOver(false)}
          onDrop={async (e) => {
            e.preventDefault();
            setIsDragOver(false);
            if (isImporting) return;
            importFiles(await getDroppedFiles(e.dataTransfer));
          }}
        >
          <Button
            type="button"
            variant="outline-primary"
            className={classes.importButton}
            disabled={isImporting}
            onClick={() => folderInputRef.current?.click()}
          >
            {isImporting ? 'Importing...' : 'Import folder'}
          </Button>
          {isImporting ? (
            <ProgressBar
              className={classes.progress}
              striped
              animated
              now={100 * /** @type {number} */ (progress)}
            />
          ) : (
            <small className={classes.hint}>
              or drop a folder or files here
            </small>
          )}
          <input
            ref={folderInputRef}
            type="file"
            hidden
            multiple
            // @ts-ignore non-standard attribute supported by all browsers
            webkitdirectory=""
            onChange={(e) => {
              const files = [...(e.target.files || [])];
              e.target.value = '';
              if (files.length) importFiles(files);
            }}
          />
        </div>
        <Modal
          show={Boolean(result)}
          onHide={() => setResult(null)}
          aria-labelledby="library-import-result"
        >
          <Modal.Header closeButton>
            <Modal.Title id="library-import-result">
              Import finished
            </Modal.Title>
          </Modal.Header>
          {result && (
            <Modal.Body>
              <p>
                <strong>{result.samples.length}</strong> new sample
                {result.samples.length === 1 ? '' : 's'} added to your library.
              </p>
              {result.skippedKnown.length > 0 && (
                <p>
                  {result.skippedKnown.length} already in your library (kept as
                  they were).
                </p>
              )}
              {result.skippedSilent.length > 0 && (
                <p>Skipped (silent): {result.skippedSilent.join(', ')}</p>
              )}
              {result.failed.length > 0 && (
                <p className="text-danger">
                  Could not be read: {result.failed.join(', ')}
                </p>
              )}
            </Modal.Body>
          )}
          <Modal.Footer>
            <Button variant="primary" onClick={() => setResult(null)}>
              OK
            </Button>
          </Modal.Footer>
        </Modal>
      </>
    );
  }
);

export default LibraryImport;
