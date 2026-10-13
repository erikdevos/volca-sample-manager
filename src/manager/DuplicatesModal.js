import React, { useContext, useState } from 'react';
import { Button, Form, Modal, ProgressBar } from 'react-bootstrap';
import PlayIcon from '@material-design-icons/svg/filled/play_arrow.svg';
import StopIcon from '@material-design-icons/svg/filled/stop.svg';

import { useListItemPlayback } from '../useListItemPlayback.js';
import { VolcaSetContext } from '../useVolcaSets.js';
import { findDuplicates } from '../utils/duplicates.js';
import {
  CATEGORIES,
  getCategoryColor,
  getCategoryLabel,
  getDisplayName,
  getSampleCategory,
} from '../utils/categories.js';

import classes from './DuplicatesModal.module.scss';

/** @typedef {import('../store').SampleContainer} SampleContainer */
/** @typedef {import('../sampleCacheStore.js').SampleCache} SampleCache */
/** @typedef {import('../utils/duplicates.js').DuplicateGroup} DuplicateGroup */

const DuplicateRow = React.memo(
  /**
   * @param {{
   *   sample: SampleContainer;
   *   sampleCache: SampleCache | null;
   *   isFactory: boolean;
   *   canKeepOnly: boolean;
   *   onKeepOnly: (id: string) => void;
   *   onDelete: (id: string) => void;
   *   onCategoryChange: (id: string, category: string) => void;
   * }} props
   */
  function DuplicateRow({
    sample,
    sampleCache,
    isFactory,
    canKeepOnly,
    onKeepOnly,
    onDelete,
    onCategoryChange,
  }) {
    const { isPlaybackActive, playbackProgress, togglePlayback } =
      useListItemPlayback(sampleCache);
    const { activeSetSampleIds } = useContext(VolcaSetContext);
    const [confirmDelete, setConfirmDelete] = useState(false);
    const category = getSampleCategory(sample);
    return (
      <li
        className={[classes.row, isPlaybackActive ? classes.playing : ''].join(
          ' '
        )}
        style={{
          // @ts-ignore
          '--category-color': getCategoryColor(category),
          '--playback-progress': `${playbackProgress * 100}%`,
        }}
      >
        <button
          type="button"
          className={classes.play}
          aria-label={isPlaybackActive ? 'Stop' : 'Play'}
          onClick={(e) => togglePlayback(e.nativeEvent)}
        >
          {isPlaybackActive ? <StopIcon /> : <PlayIcon />}
        </button>
        <span className={classes.names}>
          <strong>{getDisplayName(sample.metadata.name)}</strong>
          <small>{sample.metadata.name}</small>
        </span>
        <span className={classes.badges}>
          {isFactory && <span className={classes.factoryBadge}>Factory</span>}
          {activeSetSampleIds.has(sample.id) && (
            <span className={classes.setBadge}>In set</span>
          )}
        </span>
        {isFactory ? (
          <span className={classes.categoryText}>
            {getCategoryLabel(category)}
          </span>
        ) : (
          <Form.Select
            size="sm"
            className={classes.categorySelect}
            value={category}
            aria-label={`Category of ${sample.metadata.name}`}
            onChange={(e) => onCategoryChange(sample.id, e.target.value)}
          >
            {CATEGORIES.map(({ id, label }) => (
              <option key={id} value={id}>
                {label}
              </option>
            ))}
          </Form.Select>
        )}
        <span className={classes.duration}>
          {sampleCache ? `${sampleCache.cachedInfo.duration.toFixed(2)}s` : ''}
        </span>
        <span className={classes.actions}>
          {canKeepOnly && (
            <Button
              size="sm"
              variant="outline-success"
              onClick={() => onKeepOnly(sample.id)}
              title="Delete the other samples of this group from your collection"
            >
              Keep only this
            </Button>
          )}
          {!isFactory &&
            (confirmDelete ? (
              <Button
                size="sm"
                variant="danger"
                onClick={() => onDelete(sample.id)}
                onBlur={() => setConfirmDelete(false)}
                autoFocus
              >
                Confirm delete
              </Button>
            ) : (
              <Button
                size="sm"
                variant="outline-secondary"
                onClick={() => setConfirmDelete(true)}
              >
                Delete
              </Button>
            ))}
        </span>
        <span className={classes.progress} />
      </li>
    );
  }
);

/**
 * @param {{
 *   title: string;
 *   description: string;
 *   groups: DuplicateGroup[];
 *   allSamples: Map<string, SampleContainer>;
 *   factorySamples: Map<string, SampleContainer>;
 *   sampleCaches: Map<string, SampleCache>;
 *   onDelete: (ids: string[]) => void;
 *   onCategoryChange: (id: string, category: string) => void;
 * }} props
 */
function GroupSection({
  title,
  description,
  groups,
  allSamples,
  factorySamples,
  sampleCaches,
  onDelete,
  onCategoryChange,
}) {
  if (!groups.length) return null;
  return (
    <section className={classes.section}>
      <h3>
        {title} <span>{groups.length}</span>
      </h3>
      <p className={classes.sectionDescription}>{description}</p>
      {groups.map((group) => {
        const samples = /** @type {SampleContainer[]} */ (
          group.sampleIds.map((id) => allSamples.get(id)).filter(Boolean)
        );
        if (samples.length < 2) return null;
        const collectionIds = samples
          .filter((s) => !factorySamples.has(s.id))
          .map((s) => s.id);
        const categories = new Set(samples.map(getSampleCategory));
        return (
          <div key={group.sampleIds.join()} className={classes.group}>
            <div className={classes.groupHeader}>
              <span className={classes.similarity}>
                {Math.round(group.similarity * 100)}% alike
              </span>
              {categories.size > 1 && (
                <span className={classes.categoryWarning}>
                  Different categories: check which one is right
                </span>
              )}
            </div>
            <ul className={classes.rows}>
              {samples.map((sample) => (
                <DuplicateRow
                  key={sample.id}
                  sample={sample}
                  sampleCache={sampleCaches.get(sample.id) || null}
                  isFactory={factorySamples.has(sample.id)}
                  canKeepOnly={
                    collectionIds.length > 1 &&
                    collectionIds.includes(sample.id)
                  }
                  onKeepOnly={(id) =>
                    onDelete(collectionIds.filter((other) => other !== id))
                  }
                  onDelete={(id) => onDelete([id])}
                  onCategoryChange={onCategoryChange}
                />
              ))}
            </ul>
          </div>
        );
      })}
    </section>
  );
}

const DuplicatesModal = React.memo(
  /**
   * @param {{
   *   show: boolean;
   *   onHide: () => void;
   *   userSamples: Map<string, SampleContainer>;
   *   factorySamples: Map<string, SampleContainer>;
   *   sampleCaches: Map<string, SampleCache>;
   *   onSampleDelete: (ids: string[]) => void;
   *   onSampleUpdate: (
   *     id: string,
   *     update: import('../store').SampleMetadataUpdateArg
   *   ) => void;
   * }} props
   */
  function DuplicatesModal({
    show,
    onHide,
    userSamples,
    factorySamples,
    sampleCaches,
    onSampleDelete,
    onSampleUpdate,
  }) {
    const [includeFactory, setIncludeFactory] = useState(true);
    const [progress, setProgress] = useState(
      /** @type {number | null} */ (null)
    );
    const [groups, setGroups] = useState(
      /** @type {DuplicateGroup[] | null} */ (null)
    );

    const scan = async () => {
      setProgress(0);
      const samples = [
        ...userSamples.values(),
        ...(includeFactory ? factorySamples.values() : []),
      ];
      const found = await findDuplicates(samples, setProgress);
      // groups with only factory samples are not interesting here
      setGroups(
        found.filter((g) => g.sampleIds.some((id) => userSamples.has(id)))
      );
      setProgress(null);
    };

    const allSamples = new Map([...userSamples, ...factorySamples]);
    // samples can be deleted from here, so only keep what's still a group
    const liveGroups = (groups || []).filter(
      (g) =>
        g.sampleIds.filter((id) => allSamples.has(id)).length > 1 &&
        g.sampleIds.some((id) => userSamples.has(id))
    );
    const sameGroups = liveGroups.filter((g) => g.isDuplicate);
    const similarGroups = liveGroups.filter((g) => !g.isDuplicate);
    const isScanning = progress !== null;

    return (
      <Modal
        show={show}
        onHide={onHide}
        size="xl"
        scrollable
        aria-labelledby="duplicates-title"
      >
        <Modal.Header closeButton>
          <Modal.Title id="duplicates-title">Find duplicates</Modal.Title>
        </Modal.Header>
        <Modal.Body className={classes.body}>
          <div className={classes.intro}>
            <p>
              Compares how your samples <em>sound</em>, so you also find the
              same sample saved in another format, at another volume or with
              extra silence.
            </p>
            <div className={classes.controls}>
              <Form.Check
                type="switch"
                id="duplicates-include-factory"
                label="Also compare with the factory samples"
                checked={includeFactory}
                disabled={isScanning}
                onChange={(e) => setIncludeFactory(e.target.checked)}
              />
              <Button onClick={scan} disabled={isScanning || !userSamples.size}>
                {groups ? 'Scan again' : 'Scan collection'}
              </Button>
            </div>
            {isScanning && (
              <ProgressBar
                className={classes.scanProgress}
                now={100 * /** @type {number} */ (progress)}
                label={`${Math.round(100 * /** @type {number} */ (progress))}%`}
              />
            )}
          </div>

          {groups && !isScanning && (
            <>
              <div className={classes.summary}>
                {liveGroups.length ? (
                  <>
                    <strong>{sameGroups.length}</strong> group
                    {sameGroups.length === 1 ? '' : 's'} with the same sound,{' '}
                    <strong>{similarGroups.length}</strong> group
                    {similarGroups.length === 1 ? '' : 's'} that sound alike.
                  </>
                ) : (
                  <>No duplicates found in your collection.</>
                )}
              </div>
              <GroupSection
                title="Same sound"
                description="These are (almost certainly) the same sample. Keep one to free up space in your collection and sets."
                groups={sameGroups}
                allSamples={allSamples}
                factorySamples={factorySamples}
                sampleCaches={sampleCaches}
                onDelete={onSampleDelete}
                onCategoryChange={(id, category) =>
                  onSampleUpdate(id, { category })
                }
              />
              <GroupSection
                title="Sounds alike"
                description="Very similar: a processed or shortened version, or the same sound from another kit. Compare them by ear."
                groups={similarGroups}
                allSamples={allSamples}
                factorySamples={factorySamples}
                sampleCaches={sampleCaches}
                onDelete={onSampleDelete}
                onCategoryChange={(id, category) =>
                  onSampleUpdate(id, { category })
                }
              />
            </>
          )}
        </Modal.Body>
      </Modal>
    );
  }
);

export default DuplicatesModal;
