import React, { useMemo, useRef, useState } from 'react';
import { Button } from 'react-bootstrap';
import PlayIcon from '@material-design-icons/svg/filled/play_arrow.svg';
import StopIcon from '@material-design-icons/svg/filled/stop.svg';

import { useListItemPlayback } from '../useListItemPlayback.js';
import { useSetDuplicates } from './useSetDuplicates.js';
import { VOLCA_SLOT_COUNT } from '../setStore.js';
import {
  CATEGORIES,
  getCategoryColor,
  getCategoryLabel,
  getDisplayName,
  getSampleCategory,
} from '../utils/categories.js';

import classes from './SlotGrid.module.scss';

/** @typedef {import('../store').SampleContainer} SampleContainer */
/** @typedef {import('../sampleCacheStore.js').SampleCache} SampleCache */
/** @typedef {import('../useVolcaSets.js').VolcaSetsApi} VolcaSetsApi */
/** @typedef {import('../utils/deviceDiff.js').SlotSyncStatus} SlotSyncStatus */

/** Drag & drop type for samples dragged from the collection */
export const SAMPLE_DRAG_TYPE = 'application/x-volca-sample-id';
/** Drag & drop type for slots dragged within the grid */
const SLOT_DRAG_TYPE = 'application/x-volca-slot-index';

/** Samples longer than this take a noticeable bite out of the memory */
const LONG_SAMPLE_SECONDS = 1.5;

/**
 * @typedef {{
 *   level: 'same' | 'similar';
 *   partners: { slot: number; level: 'same' | 'similar'; name: string }[];
 * }} CellDuplicateInfo
 */

/** @param {number} slot */
function formatSlot(slot) {
  return slot.toString().padStart(2, '0');
}

/** @type {Partial<Record<SlotSyncStatus, { className: string; title: string }>>} */
const SYNC_MARKS = {
  unchanged: { className: 'onVolca', title: 'On your volca' },
  changed: {
    className: 'toSend',
    title: 'Will be sent: your volca has something else in this slot',
  },
  new: { className: 'toSend', title: 'Will be sent: new on your volca' },
  unknown: {
    className: 'syncUnknown',
    title: "Will be sent: the app doesn't know what's in this slot",
  },
};

const SlotCell = React.memo(
  /**
   * @param {{
   *   index: number;
   *   sample: SampleContainer;
   *   sampleCache: SampleCache | null;
   *   isFocused: boolean;
   *   isDropTarget: boolean;
   *   isOverflow: boolean;
   *   isHighlighted: boolean;
   *   duplicate: CellDuplicateInfo | null;
   *   syncStatus: SlotSyncStatus | null;
   *   onHighlight: (slots: number[] | null) => void;
   *   onFocusSlot: (index: number) => void;
   *   onRemove: (id: string) => void;
   *   onEdit: (id: string) => void;
   * }} props
   */
  function SlotCell({
    index,
    sample,
    sampleCache,
    isFocused,
    isDropTarget,
    isOverflow,
    isHighlighted,
    duplicate,
    syncStatus,
    onHighlight,
    onFocusSlot,
    onRemove,
    onEdit,
  }) {
    const { isPlaybackActive, playbackProgress, togglePlayback } =
      useListItemPlayback(sampleCache);
    const category = getSampleCategory(sample);
    const duration = sampleCache ? sampleCache.cachedInfo.duration : null;
    const syncMark = syncStatus ? SYNC_MARKS[syncStatus] : undefined;

    return (
      <div
        role="gridcell"
        tabIndex={isFocused ? 0 : -1}
        data-slot={index}
        className={[
          classes.cell,
          classes.filled,
          isPlaybackActive ? classes.playing : '',
          isDropTarget ? classes.dropTarget : '',
          isOverflow ? classes.overflow : '',
          isHighlighted ? classes.highlighted : '',
        ].join(' ')}
        style={{
          // @ts-ignore
          '--category-color': getCategoryColor(category),
          '--playback-progress': `${playbackProgress * 100}%`,
        }}
        draggable
        onDragStart={(e) => {
          e.dataTransfer.setData(SLOT_DRAG_TYPE, String(index));
          e.dataTransfer.setData(SAMPLE_DRAG_TYPE, sample.id);
          e.dataTransfer.effectAllowed = 'move';
        }}
        onClick={(e) => {
          onFocusSlot(index);
          if (/** @type {HTMLElement} */ (e.target).closest('button')) return;
          togglePlayback(e.nativeEvent);
        }}
        onDoubleClick={(e) => {
          if (/** @type {HTMLElement} */ (e.target).closest('button')) return;
          onEdit(sample.id);
        }}
        title={`${sample.metadata.name}\n${getCategoryLabel(category)}${
          syncMark ? `\n${syncMark.title}` : ''
        }\nClick to play · double-click to edit · drag to move`}
      >
        <div className={classes.cellTop}>
          <span className={classes.slotNumber}>
            {syncMark && (
              <i
                className={`${classes.syncMark} ${classes[syncMark.className]}`}
                aria-label={syncMark.title}
              />
            )}
            {formatSlot(index)}
          </span>
          {duplicate && (
            <span
              className={`${classes.duplicateBadge} ${
                classes[duplicate.level]
              }`}
              title={duplicate.partners
                .map(
                  (p) =>
                    `${
                      p.level === 'same' ? 'Same sound as' : 'Sounds like'
                    } slot ${formatSlot(p.slot)} (${p.name})`
                )
                .join('\n')}
              onMouseEnter={() =>
                onHighlight([index, ...duplicate.partners.map((p) => p.slot)])
              }
              onMouseLeave={() => onHighlight(null)}
            >
              {duplicate.level === 'same' ? '=' : '≈'}
              {duplicate.partners.map((p) => formatSlot(p.slot)).join(',')}
            </span>
          )}
          <span className={classes.cellIcon} aria-hidden="true">
            {isPlaybackActive ? <StopIcon /> : <PlayIcon />}
          </span>
        </div>
        <div className={classes.name}>
          {getDisplayName(sample.metadata.name)}
        </div>
        <div className={classes.cellBottom}>
          <span className={classes.category}>{getCategoryLabel(category)}</span>
          {duration !== null && (
            <span
              className={[
                classes.duration,
                duration > LONG_SAMPLE_SECONDS ? classes.long : '',
              ].join(' ')}
            >
              {duration.toFixed(2)}s
            </span>
          )}
        </div>
        <div className={classes.cellActions}>
          <button
            type="button"
            tabIndex={-1}
            aria-label={`Edit ${sample.metadata.name}`}
            title="Edit sample"
            onClick={() => onEdit(sample.id)}
          >
            ✎
          </button>
          <button
            type="button"
            tabIndex={-1}
            aria-label={`Remove ${sample.metadata.name} from set`}
            title="Remove from set"
            onClick={() => onRemove(sample.id)}
          >
            ×
          </button>
        </div>
        <div className={classes.progress} />
      </div>
    );
  }
);

const SlotGrid = React.memo(
  /**
   * @param {{
   *   volcaSets: VolcaSetsApi;
   *   sampleCaches: Map<string, SampleCache>;
   *   device: import('../utils/deviceDiff.js').DeviceState;
   *   deviceDiff: import('../utils/deviceDiff.js').DeviceDiff;
   *   onEdit: (id: string) => void;
   *   onTrimSilence: () => void;
   * }} props
   */
  function SlotGrid({
    volcaSets,
    sampleCaches,
    device,
    deviceDiff,
    onEdit,
    onTrimSilence,
  }) {
    const {
      activeSetSamples,
      activeSetSlots,
      removeFromSet,
      moveInSet,
      insertInSet,
      sortSetByCategory,
      emptySet,
    } = volcaSets;

    const [focusedIndex, setFocusedIndex] = useState(0);
    const [dropIndex, setDropIndex] = useState(
      /** @type {number | null} */ (null)
    );
    /** @type {React.RefObject<HTMLDivElement>} */
    const gridRef = useRef(null);

    const slotCount = Math.max(VOLCA_SLOT_COUNT, activeSetSlots.length);
    const overflowCount = activeSetSlots
      .slice(VOLCA_SLOT_COUNT)
      .filter(Boolean).length;
    const gapCount = activeSetSlots.filter((s) => !s).length;

    const setDuplicates = useSetDuplicates(activeSetSamples);
    const [highlightedSlots, setHighlightedSlots] = useState(
      /** @type {number[] | null} */ (null)
    );
    /** @type {Map<string, CellDuplicateInfo>} */
    const cellDuplicates = useMemo(() => {
      /** @type {Map<string, number>} */
      const slotById = new Map();
      activeSetSlots.forEach((s, i) => {
        if (s) slotById.set(s.id, i);
      });
      const cells = new Map();
      for (const [id, info] of setDuplicates) {
        const partners = info.partners
          .filter((p) => slotById.has(p.id))
          .map((p) => ({
            slot: /** @type {number} */ (slotById.get(p.id)),
            level: p.level,
            name: /** @type {SampleContainer} */ (
              activeSetSlots[/** @type {number} */ (slotById.get(p.id))]
            ).metadata.name,
          }))
          .sort((a, b) => a.slot - b.slot);
        if (slotById.has(id) && partners.length) {
          cells.set(id, {
            level: partners.some((p) => p.level === 'same')
              ? 'same'
              : 'similar',
            partners,
          });
        }
      }
      return cells;
    }, [setDuplicates, activeSetSlots]);
    // pairs of slots for the summary above the grid, each pair only once
    const duplicatePairs = useMemo(() => {
      /** @type {{ a: number; b: number; level: 'same' | 'similar' }[]} */
      const pairs = [];
      activeSetSlots.forEach((sample, slot) => {
        const info = sample && cellDuplicates.get(sample.id);
        if (!info) return;
        for (const partner of info.partners) {
          if (partner.slot > slot) {
            pairs.push({ a: slot, b: partner.slot, level: partner.level });
          }
        }
      });
      return pairs;
    }, [cellDuplicates, activeSetSlots]);
    const samePairs = duplicatePairs.filter((p) => p.level === 'same');
    const similarPairs = duplicatePairs.filter((p) => p.level === 'similar');

    const breakdown = useMemo(() => {
      /** @type {Map<string, number>} */
      const counts = new Map();
      for (const sample of activeSetSamples) {
        const category = getSampleCategory(sample);
        counts.set(category, (counts.get(category) || 0) + 1);
      }
      return CATEGORIES.filter(({ id }) => counts.has(id)).map(
        ({ id, label }) => ({ id, label, count: counts.get(id) || 0 })
      );
    }, [activeSetSamples]);

    /** @param {number} index */
    const getCell = (index) => {
      const cell = gridRef.current?.querySelector(`[data-slot="${index}"]`);
      return cell instanceof HTMLElement ? cell : null;
    };

    /** @type {React.KeyboardEventHandler} */
    const handleKeyDown = (e) => {
      const count = slotCount;
      // the number of columns depends on the screen width
      const columns = gridRef.current
        ? getComputedStyle(gridRef.current).gridTemplateColumns.split(' ')
            .length
        : 10;
      /** @type {Record<string, number>} */
      const moves = {
        ArrowLeft: -1,
        ArrowRight: 1,
        ArrowUp: -columns,
        ArrowDown: columns,
      };
      if (e.key in moves) {
        e.preventDefault();
        const next = focusedIndex + moves[e.key];
        const cell = getCell(next);
        if (cell && next < count) {
          // a click focuses and plays the slot
          cell.focus();
          cell.click();
        }
      } else if (e.key === ' ' || e.key === 'Enter') {
        e.preventDefault();
        const cell = getCell(focusedIndex);
        if (cell) cell.click();
      } else if (e.key === 'Delete' || e.key === 'Backspace') {
        e.preventDefault();
        const sample = activeSetSlots[focusedIndex];
        if (sample) removeFromSet([sample.id]);
      }
    };

    /**
     * @param {React.DragEvent} e
     * @param {number} index
     */
    const handleDrop = (e, index) => {
      e.preventDefault();
      setDropIndex(null);
      const fromSlot = e.dataTransfer.getData(SLOT_DRAG_TYPE);
      if (fromSlot !== '') {
        const from = Number(fromSlot);
        if (from !== index) moveInSet(from, index);
        return;
      }
      const sampleId = e.dataTransfer.getData(SAMPLE_DRAG_TYPE);
      if (sampleId) insertInSet(sampleId, index);
    };

    return (
      <section className={classes.setArea} aria-label="Volca set">
        <div className={classes.toolbar}>
          <div>
            <h2 className={classes.title}>
              Your volca set
              <span className={classes.count}>
                {activeSetSamples.length} sample
                {activeSetSamples.length === 1 ? '' : 's'}
              </span>
            </h2>
            <div className={classes.legend}>
              {breakdown.length ? (
                breakdown.map(({ id, label, count }) => (
                  <span key={id}>
                    <i style={{ backgroundColor: getCategoryColor(id) }} />
                    {label} <strong>{count}</strong>
                  </span>
                ))
              ) : (
                <span className={classes.hint}>
                  Add samples from your collection with <strong>+</strong> or
                  drag them onto a slot.
                </span>
              )}
            </div>
          </div>
          <div className={classes.toolbarActions}>
            <Button
              size="sm"
              variant="outline-secondary"
              disabled={activeSetSamples.length < 2}
              onClick={sortSetByCategory}
              title="Sort the set by category and close the gaps. This gives samples new slot numbers, so they need to be sent again."
            >
              Sort by category{gapCount > 0 ? ' & close gaps' : ''}
            </Button>
            <Button
              size="sm"
              variant="outline-secondary"
              disabled={!activeSetSamples.length}
              onClick={onTrimSilence}
              title="Cut silence from the start and end of the samples in this set"
            >
              Trim silence
            </Button>
            <Button
              size="sm"
              variant="outline-secondary"
              disabled={!activeSetSamples.length}
              onClick={emptySet}
            >
              Remove all
            </Button>
          </div>
        </div>

        {duplicatePairs.length > 0 && (
          <div className={classes.duplicateSummary}>
            {samePairs.length > 0 && (
              <div>
                <span className={`${classes.duplicateBadge} ${classes.same}`}>
                  =
                </span>{' '}
                <strong>Same sound twice:</strong>{' '}
                {samePairs.map((p, i) => (
                  <React.Fragment key={`${p.a}-${p.b}`}>
                    {i > 0 && ', '}
                    <button
                      type="button"
                      className={classes.pairLink}
                      onMouseEnter={() => setHighlightedSlots([p.a, p.b])}
                      onMouseLeave={() => setHighlightedSlots(null)}
                      onFocus={() => setHighlightedSlots([p.a, p.b])}
                      onBlur={() => setHighlightedSlots(null)}
                    >
                      {formatSlot(p.a)} &amp; {formatSlot(p.b)}
                    </button>
                  </React.Fragment>
                ))}
                . Remove one to free a slot.
              </div>
            )}
            {similarPairs.length > 0 && (
              <div>
                <span
                  className={`${classes.duplicateBadge} ${classes.similar}`}
                >
                  ≈
                </span>{' '}
                <strong>Sounds alike:</strong>{' '}
                {similarPairs.map((p, i) => (
                  <React.Fragment key={`${p.a}-${p.b}`}>
                    {i > 0 && ', '}
                    <button
                      type="button"
                      className={classes.pairLink}
                      onMouseEnter={() => setHighlightedSlots([p.a, p.b])}
                      onMouseLeave={() => setHighlightedSlots(null)}
                      onFocus={() => setHighlightedSlots([p.a, p.b])}
                      onBlur={() => setHighlightedSlots(null)}
                    >
                      {formatSlot(p.a)} &amp; {formatSlot(p.b)}
                    </button>
                  </React.Fragment>
                ))}
                . Worth a listen.
              </div>
            )}
          </div>
        )}

        {overflowCount > 0 && (
          <div className={classes.overflowWarning}>
            This set has {overflowCount} sample{overflowCount === 1 ? '' : 's'}{' '}
            more than the volca sample can hold. Remove{' '}
            {overflowCount === 1 ? 'it' : 'them'} before transferring.
          </div>
        )}

        {activeSetSamples.length > 0 || deviceDiff.toErase.length > 0 ? (
          <div className={classes.syncLegend}>
            <span>
              <i className={`${classes.syncMark} ${classes.onVolca}`} />
              On volca
            </span>
            <span>
              <i className={`${classes.syncMark} ${classes.toSend}`} />
              Will be sent
            </span>
            {!deviceDiff.isKnown && (
              <span>
                <i className={`${classes.syncMark} ${classes.syncUnknown}`} />
                Unknown, will be sent
              </span>
            )}
            {deviceDiff.toErase.length > 0 && (
              <span>
                <i className={classes.eraseSwatch} />
                Will be erased
              </span>
            )}
          </div>
        ) : null}

        <div
          ref={gridRef}
          role="grid"
          aria-label="Slots 00 to 99"
          className={classes.grid}
          onKeyDown={handleKeyDown}
          onDragLeave={(e) => {
            if (
              !e.currentTarget.contains(/** @type {Node} */ (e.relatedTarget))
            ) {
              setDropIndex(null);
            }
          }}
        >
          {Array.from({ length: slotCount }, (_, index) => {
            const sample = activeSetSlots[index];
            const dropProps = {
              /** @param {React.DragEvent} e */
              onDragOver: (e) => {
                e.preventDefault();
                if (dropIndex !== index) setDropIndex(index);
              },
              /** @param {React.DragEvent} e */
              onDrop: (e) => handleDrop(e, index),
            };
            if (!sample) {
              const onVolca = device.slots[index];
              const willErase =
                deviceDiff.statuses[index] === 'erase' &&
                onVolca &&
                onVolca !== 'unknown';
              return (
                <div
                  key={`empty-${index}`}
                  role="gridcell"
                  tabIndex={index === focusedIndex ? 0 : -1}
                  data-slot={index}
                  onClick={() => setFocusedIndex(index)}
                  className={[
                    classes.cell,
                    classes.empty,
                    willErase ? classes.willErase : '',
                    dropIndex === index ? classes.dropTarget : '',
                  ].join(' ')}
                  title={
                    willErase
                      ? `${onVolca.name} is still on your volca and will be erased with the next transfer`
                      : undefined
                  }
                  {...dropProps}
                >
                  <span className={classes.slotNumber}>
                    {formatSlot(index)}
                  </span>
                  {willErase && (
                    <>
                      <span className={classes.name}>
                        {getDisplayName(onVolca.name)}
                      </span>
                      <span className={classes.eraseNote}>will be erased</span>
                    </>
                  )}
                </div>
              );
            }
            return (
              <div
                key={sample.id}
                className={classes.cellWrapper}
                {...dropProps}
              >
                <SlotCell
                  index={index}
                  sample={sample}
                  sampleCache={sampleCaches.get(sample.id) || null}
                  isFocused={index === focusedIndex}
                  isDropTarget={dropIndex === index}
                  isOverflow={index >= VOLCA_SLOT_COUNT}
                  isHighlighted={Boolean(
                    highlightedSlots && highlightedSlots.includes(index)
                  )}
                  duplicate={cellDuplicates.get(sample.id) || null}
                  syncStatus={
                    index < VOLCA_SLOT_COUNT
                      ? deviceDiff.statuses[index] || null
                      : null
                  }
                  onHighlight={setHighlightedSlots}
                  onFocusSlot={setFocusedIndex}
                  onRemove={(id) => removeFromSet([id])}
                  onEdit={onEdit}
                />
              </div>
            );
          })}
        </div>
        <p className={classes.footnote}>
          Click a slot to listen · arrow keys to browse · double-click to edit ·
          drag onto another slot to swap · Delete to remove from the set (other
          samples keep their slot)
        </p>
      </section>
    );
  }
);

export default SlotGrid;
