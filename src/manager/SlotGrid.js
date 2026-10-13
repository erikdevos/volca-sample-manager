import React, { useMemo, useRef, useState } from 'react';
import { Button } from 'react-bootstrap';
import PlayIcon from '@material-design-icons/svg/filled/play_arrow.svg';
import StopIcon from '@material-design-icons/svg/filled/stop.svg';

import { useListItemPlayback } from '../useListItemPlayback.js';
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

/** Drag & drop type for samples dragged from the collection */
export const SAMPLE_DRAG_TYPE = 'application/x-volca-sample-id';
/** Drag & drop type for slots dragged within the grid */
const SLOT_DRAG_TYPE = 'application/x-volca-slot-index';

/** Samples longer than this take a noticeable bite out of the memory */
const LONG_SAMPLE_SECONDS = 1.5;

/** @param {number} slot */
function formatSlot(slot) {
  return slot.toString().padStart(2, '0');
}

const SlotCell = React.memo(
  /**
   * @param {{
   *   index: number;
   *   sample: SampleContainer;
   *   sampleCache: SampleCache | null;
   *   isFocused: boolean;
   *   isDropTarget: boolean;
   *   isOverflow: boolean;
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
    onFocusSlot,
    onRemove,
    onEdit,
  }) {
    const { isPlaybackActive, playbackProgress, togglePlayback } =
      useListItemPlayback(sampleCache);
    const category = getSampleCategory(sample);
    const duration = sampleCache ? sampleCache.cachedInfo.duration : null;

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
        title={`${sample.metadata.name}\n${getCategoryLabel(
          category
        )}\nClick to play · double-click to edit · drag to move`}
      >
        <div className={classes.cellTop}>
          <span className={classes.slotNumber}>{formatSlot(index)}</span>
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
   *   onEdit: (id: string) => void;
   *   onTrimSilence: () => void;
   * }} props
   */
  function SlotGrid({ volcaSets, sampleCaches, onEdit, onTrimSilence }) {
    const {
      activeSetSamples,
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

    const slotCount = Math.max(VOLCA_SLOT_COUNT, activeSetSamples.length);
    const overflowCount = activeSetSamples.length - VOLCA_SLOT_COUNT;

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
      const count = activeSetSamples.length;
      if (!count) return;
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
        const sample = activeSetSamples[focusedIndex];
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
        const to = Math.min(index, activeSetSamples.length - 1);
        if (from !== to) moveInSet(from, to);
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
            >
              Sort by category
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

        {overflowCount > 0 && (
          <div className={classes.overflowWarning}>
            This set has {overflowCount} sample{overflowCount === 1 ? '' : 's'}{' '}
            more than the volca sample can hold. Remove{' '}
            {overflowCount === 1 ? 'it' : 'them'} before transferring.
          </div>
        )}

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
            const sample = activeSetSamples[index];
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
              return (
                <div
                  key={`empty-${index}`}
                  role="gridcell"
                  className={[
                    classes.cell,
                    classes.empty,
                    dropIndex === index ? classes.dropTarget : '',
                  ].join(' ')}
                  {...dropProps}
                >
                  <span className={classes.slotNumber}>
                    {formatSlot(index)}
                  </span>
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
          drag to rearrange · Delete to remove from the set
        </p>
      </section>
    );
  }
);

export default SlotGrid;
