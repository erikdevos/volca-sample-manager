import React, { useEffect, useState } from 'react';
import { Button, Modal, ProgressBar } from 'react-bootstrap';

import { SampleContainer } from '../store.js';
import {
  getSilenceTrim,
  MIN_SAVING_SECONDS,
  SILENCE_THRESHOLD_DB,
} from '../utils/silence.js';
import { getDisplayName } from '../utils/categories.js';

import classes from './TrimSilenceModal.module.scss';

/** @typedef {import('../utils/silence.js').SilenceTrim} SilenceTrim */

/**
 * Shows how much silence can be trimmed from a list of samples, and applies
 * the trims the user keeps checked.
 *
 * @param {{
 *   show: boolean;
 *   title: string;
 *   samples: import('../store').SampleContainer[];
 *   onHide: () => void;
 *   onSampleUpdate: (
 *     id: string,
 *     update: import('../store').SampleMetadataUpdateArg
 *   ) => void;
 * }} props
 */
function TrimSilenceModal({ show, title, samples, onHide, onSampleUpdate }) {
  const [progress, setProgress] = useState(/** @type {number | null} */ (null));
  const [results, setResults] = useState(
    /** @type {{ sample: SampleContainer; trim: SilenceTrim }[] | null} */ (
      null
    )
  );
  const [checkedIds, setCheckedIds] = useState(
    /** @type {Set<string>} */ (new Set())
  );

  // factory samples can't be changed
  const editableSamples = samples.filter(
    (s) => s instanceof SampleContainer.Mutable
  );
  const skippedCount = samples.length - editableSamples.length;

  // analyze when opened (with the samples as they are at that moment)
  useEffect(() => {
    if (!show) return;
    let cancelled = false;
    setResults(null);
    setProgress(0);
    (async () => {
      /** @type {{ sample: SampleContainer; trim: SilenceTrim }[]} */
      const found = [];
      for (let i = 0; i < editableSamples.length; i++) {
        if (cancelled) return;
        setProgress(i / editableSamples.length);
        try {
          const trim = await getSilenceTrim(editableSamples[i]);
          if (trim.savedSeconds >= MIN_SAVING_SECONDS) {
            found.push({ sample: editableSamples[i], trim });
          }
        } catch (err) {
          console.warn(
            `Could not analyze ${editableSamples[i].metadata.name}`,
            err
          );
        }
      }
      if (cancelled) return;
      found.sort((a, b) => b.trim.savedSeconds - a.trim.savedSeconds);
      setResults(found);
      setCheckedIds(new Set(found.map((r) => r.sample.id)));
      setProgress(null);
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [show]);

  const checkedResults = (results || []).filter((r) =>
    checkedIds.has(r.sample.id)
  );
  const totalSaved = checkedResults.reduce(
    (total, r) => total + r.trim.savedSeconds,
    0
  );

  const apply = () => {
    for (const { sample, trim } of checkedResults) {
      onSampleUpdate(sample.id, { trim: { frames: trim.frames } });
    }
    onHide();
  };

  return (
    <Modal show={show} onHide={onHide} size="lg" scrollable>
      <Modal.Header closeButton>
        <Modal.Title>{title}</Modal.Title>
      </Modal.Header>
      <Modal.Body className={classes.body}>
        <p className={classes.intro}>
          Cuts silence (below {SILENCE_THRESHOLD_DB} dB of the peak) from the
          start and end of each sample, so it takes less memory on the volca and
          plays right on the beat. Your original files are kept: you can always
          change the trim again in the sample editor.
        </p>
        {skippedCount > 0 && (
          <p className={classes.note}>
            {skippedCount} factory sample{skippedCount === 1 ? '' : 's'} skipped
            (they can't be changed).
          </p>
        )}
        {progress !== null && (
          <ProgressBar
            now={progress * 100}
            label={`Analyzing ${Math.round(progress * 100)}%`}
            className={classes.progress}
          />
        )}
        {results && !results.length && (
          <div className={classes.summary}>
            Nothing to trim: these samples have no silence worth cutting.
          </div>
        )}
        {results && results.length > 0 && (
          <>
            <div className={classes.summary}>
              <strong>{totalSaved.toFixed(2)} s</strong> of memory saved by
              trimming <strong>{checkedResults.length}</strong> sample
              {checkedResults.length === 1 ? '' : 's'}.
            </div>
            <table className={classes.table}>
              <thead>
                <tr>
                  <th>
                    <input
                      type="checkbox"
                      aria-label="Select all"
                      checked={checkedResults.length === results.length}
                      onChange={(e) =>
                        setCheckedIds(
                          e.target.checked
                            ? new Set(results.map((r) => r.sample.id))
                            : new Set()
                        )
                      }
                    />
                  </th>
                  <th>Sample</th>
                  <th className={classes.number}>Now</th>
                  <th className={classes.number}>Trimmed</th>
                  <th className={classes.number}>Saves</th>
                </tr>
              </thead>
              <tbody>
                {results.map(({ sample, trim }) => (
                  <tr key={sample.id}>
                    <td>
                      <input
                        type="checkbox"
                        aria-label={`Trim ${sample.metadata.name}`}
                        checked={checkedIds.has(sample.id)}
                        onChange={() =>
                          setCheckedIds((ids) => {
                            const next = new Set(ids);
                            if (next.has(sample.id)) next.delete(sample.id);
                            else next.add(sample.id);
                            return next;
                          })
                        }
                      />
                    </td>
                    <td title={sample.metadata.name}>
                      {getDisplayName(sample.metadata.name)}
                    </td>
                    <td className={classes.number}>
                      {trim.currentSeconds.toFixed(2)}s
                    </td>
                    <td className={classes.number}>
                      {trim.trimmedSeconds.toFixed(2)}s
                    </td>
                    <td className={`${classes.number} ${classes.saving}`}>
                      −{trim.savedSeconds.toFixed(2)}s
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </>
        )}
      </Modal.Body>
      <Modal.Footer>
        <Button variant="light" onClick={onHide}>
          Cancel
        </Button>
        <Button
          variant="primary"
          disabled={!checkedResults.length}
          onClick={apply}
        >
          Trim {checkedResults.length || ''} sample
          {checkedResults.length === 1 ? '' : 's'}
        </Button>
      </Modal.Footer>
    </Modal>
  );
}

export default TrimSilenceModal;
