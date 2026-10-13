import React, { useEffect, useMemo, useState } from 'react';
import { Button, Modal, ProgressBar } from 'react-bootstrap';

import { SampleContainer } from '../store.js';
import {
  getCategoryColor,
  getCategoryLabel,
  getSampleCategory,
  naturalCompare,
} from '../utils/categories.js';
import {
  compareFingerprints,
  DUPLICATE_THRESHOLD,
  getFingerprint,
} from '../utils/duplicates.js';
import { tidyNames } from '../utils/names.js';

import classes from './TidyNamesModal.module.scss';

/**
 * @typedef {{
 *   sample: SampleContainer;
 *   categoryId: string;
 *   factory: SampleContainer;
 *   similarity: number;
 * }} CategorySuggestion
 */

/**
 * Finds samples that sound like a factory sample of another category, which
 * usually means they're in the wrong category.
 *
 * @param {SampleContainer[]} samples
 * @param {SampleContainer[]} factorySamples
 * @param {(progress: number) => void} onProgress
 * @param {() => boolean} isCancelled
 * @returns {Promise<CategorySuggestion[]>}
 */
async function findCategorySuggestions(
  samples,
  factorySamples,
  onProgress,
  isCancelled
) {
  const all = [...factorySamples, ...samples];
  /** @type {Map<string, import('../utils/duplicates.js').Fingerprint>} */
  const fingerprints = new Map();
  for (let i = 0; i < all.length; i++) {
    if (isCancelled()) return [];
    onProgress(i / all.length);
    try {
      fingerprints.set(all[i].id, await getFingerprint(all[i]));
    } catch (err) {
      console.warn(`Could not fingerprint ${all[i].metadata.name}`, err);
    }
  }
  /** @type {CategorySuggestion[]} */
  const suggestions = [];
  for (const sample of samples) {
    const fingerprint = fingerprints.get(sample.id);
    if (!fingerprint) continue;
    /** @type {CategorySuggestion | null} */
    let best = null;
    for (const factory of factorySamples) {
      const other = fingerprints.get(factory.id);
      if (!other) continue;
      const similarity = compareFingerprints(fingerprint, other);
      if (
        similarity >= DUPLICATE_THRESHOLD &&
        (!best || similarity > best.similarity)
      ) {
        best = {
          sample,
          categoryId: getSampleCategory(factory),
          factory,
          similarity,
        };
      }
    }
    if (best && best.categoryId !== getSampleCategory(sample)) {
      suggestions.push(best);
    }
  }
  onProgress(1);
  return suggestions;
}

/** @param {{ categoryId: string }} props */
function CategoryTag({ categoryId }) {
  return (
    <span className={classes.category}>
      <i style={{ backgroundColor: getCategoryColor(categoryId) }} />
      {getCategoryLabel(categoryId)}
    </span>
  );
}

/**
 * @param {{
 *   show: boolean;
 *   title: string;
 *   samples: SampleContainer[];
 *   userSamples: Map<string, SampleContainer>;
 *   factorySamples: Map<string, SampleContainer>;
 *   onHide: () => void;
 *   onSampleUpdate: (
 *     id: string,
 *     update: import('../store').SampleMetadataUpdateArg
 *   ) => void;
 * }} props
 */
function TidyNamesModal({
  show,
  title,
  samples,
  userSamples,
  factorySamples,
  onHide,
  onSampleUpdate,
}) {
  // factory samples can't be renamed
  const editableSamples = useMemo(
    () => samples.filter((s) => s instanceof SampleContainer.Mutable),
    [samples]
  );

  const [progress, setProgress] = useState(/** @type {number | null} */ (null));
  const [suggestions, setSuggestions] = useState(
    /** @type {CategorySuggestion[]} */ ([])
  );
  const [acceptedCategories, setAcceptedCategories] = useState(
    /** @type {Set<string>} */ (new Set())
  );
  const [skippedNames, setSkippedNames] = useState(
    /** @type {Set<string>} */ (new Set())
  );

  // look for wrong categories when opened
  useEffect(() => {
    if (!show) return;
    let cancelled = false;
    setSuggestions([]);
    setAcceptedCategories(new Set());
    setSkippedNames(new Set());
    setProgress(0);
    findCategorySuggestions(
      editableSamples,
      [...factorySamples.values()],
      (p) => {
        if (!cancelled) setProgress(p);
      },
      () => cancelled
    ).then((found) => {
      if (cancelled) return;
      setSuggestions(found);
      setAcceptedCategories(new Set(found.map((s) => s.sample.id)));
      setProgress(null);
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [show]);

  const suggestionsById = useMemo(
    () => new Map(suggestions.map((s) => [s.sample.id, s])),
    [suggestions]
  );

  const renames = useMemo(() => {
    const ids = new Set(editableSamples.map((s) => s.id));
    const otherNames = [...userSamples.values()]
      .filter((s) => !ids.has(s.id))
      .map((s) => s.metadata.name);
    const newNames = tidyNames(
      editableSamples.map((sample) => {
        const suggestion = acceptedCategories.has(sample.id)
          ? suggestionsById.get(sample.id)
          : undefined;
        return {
          id: sample.id,
          name: sample.metadata.name,
          categoryId: suggestion
            ? suggestion.categoryId
            : getSampleCategory(sample),
          hintName: suggestion ? suggestion.factory.metadata.name : undefined,
        };
      }),
      otherNames
    );
    return editableSamples
      .map((sample) => ({
        sample,
        newName: /** @type {string} */ (newNames.get(sample.id)),
      }))
      .filter(({ sample, newName }) => newName !== sample.metadata.name)
      .sort((a, b) => naturalCompare(a.newName, b.newName));
  }, [editableSamples, userSamples, acceptedCategories, suggestionsById]);

  const checkedRenames = renames.filter((r) => !skippedNames.has(r.sample.id));
  const changeCount = new Set([
    ...checkedRenames.map((r) => r.sample.id),
    ...acceptedCategories,
  ]).size;

  const apply = () => {
    /** @type {Map<string, import('../store').SampleMetadataUpdate>} */
    const updates = new Map();
    for (const id of acceptedCategories) {
      const suggestion = suggestionsById.get(id);
      if (suggestion) updates.set(id, { category: suggestion.categoryId });
    }
    for (const { sample, newName } of checkedRenames) {
      updates.set(sample.id, { ...updates.get(sample.id), name: newName });
    }
    for (const [id, update] of updates) {
      onSampleUpdate(id, update);
    }
    onHide();
  };

  /**
   * @param {Set<string>} set
   * @param {string} id
   */
  const toggled = (set, id) => {
    const next = new Set(set);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    return next;
  };

  return (
    <Modal show={show} onHide={onHide} size="lg" scrollable>
      <Modal.Header closeButton>
        <Modal.Title>{title}</Modal.Title>
      </Modal.Header>
      <Modal.Body className={classes.body}>
        <p className={classes.intro}>
          Names start with what the sound is ("Snare Thunder"). Number prefixes
          and sample pack codes are removed, typos fixed, and equal names get a
          number. The original file name stays visible as a tooltip.
        </p>
        {samples.length > editableSamples.length && (
          <p className={classes.note}>
            Factory samples are skipped (they can't be renamed).
          </p>
        )}
        {progress !== null && (
          <ProgressBar
            now={progress * 100}
            label="Checking categories"
            className={classes.progress}
          />
        )}

        {suggestions.length > 0 && (
          <section className={classes.section}>
            <h3>Category suggestions</h3>
            <p className={classes.sectionIntro}>
              These sound the same as a factory sample in another category.
            </p>
            <table className={classes.table}>
              <tbody>
                {suggestions.map((s) => (
                  <tr key={s.sample.id}>
                    <td className={classes.check}>
                      <input
                        type="checkbox"
                        aria-label={`Change category of ${s.sample.metadata.name}`}
                        checked={acceptedCategories.has(s.sample.id)}
                        onChange={() =>
                          setAcceptedCategories((ids) =>
                            toggled(ids, s.sample.id)
                          )
                        }
                      />
                    </td>
                    <td>{s.sample.metadata.name}</td>
                    <td>
                      <CategoryTag categoryId={getSampleCategory(s.sample)} />
                      <span className={classes.arrow}>→</span>
                      <CategoryTag categoryId={s.categoryId} />
                    </td>
                    <td className={classes.muted}>
                      like factory “{s.factory.metadata.name}” (
                      {Math.round(s.similarity * 100)}%)
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        )}

        {progress === null && (
          <section className={classes.section}>
            <h3>New names</h3>
            {!renames.length ? (
              <p className={classes.sectionIntro}>
                All names are already tidy.
              </p>
            ) : (
              <table className={classes.table}>
                <thead>
                  <tr>
                    <th className={classes.check}>
                      <input
                        type="checkbox"
                        aria-label="Select all"
                        checked={!skippedNames.size}
                        onChange={(e) =>
                          setSkippedNames(
                            e.target.checked
                              ? new Set()
                              : new Set(renames.map((r) => r.sample.id))
                          )
                        }
                      />
                    </th>
                    <th>Now</th>
                    <th>New</th>
                  </tr>
                </thead>
                <tbody>
                  {renames.map(({ sample, newName }) => (
                    <tr key={sample.id}>
                      <td className={classes.check}>
                        <input
                          type="checkbox"
                          aria-label={`Rename ${sample.metadata.name}`}
                          checked={!skippedNames.has(sample.id)}
                          onChange={() =>
                            setSkippedNames((ids) => toggled(ids, sample.id))
                          }
                        />
                      </td>
                      <td className={classes.oldName}>
                        {sample.metadata.name}
                      </td>
                      <td className={classes.newName}>{newName}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </section>
        )}
      </Modal.Body>
      <Modal.Footer>
        <Button variant="light" onClick={onHide}>
          Cancel
        </Button>
        <Button
          variant="primary"
          disabled={progress !== null || !changeCount}
          onClick={apply}
        >
          Update {changeCount || ''} sample{changeCount === 1 ? '' : 's'}
        </Button>
      </Modal.Footer>
    </Modal>
  );
}

export default TidyNamesModal;
