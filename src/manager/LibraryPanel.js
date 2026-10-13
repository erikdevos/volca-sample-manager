import React, { useContext, useEffect, useMemo, useRef, useState } from 'react';
import { Button, Form, Modal } from 'react-bootstrap';
import PlayIcon from '@material-design-icons/svg/filled/play_arrow.svg';
import StopIcon from '@material-design-icons/svg/filled/stop.svg';

import LibraryImport from '../LibraryImport.js';
import CategoryFilter, {
  ALL_FILTER,
  FAVORITES_FILTER,
} from '../CategoryFilter.js';
import { useListItemPlayback } from '../useListItemPlayback.js';
import { VolcaSetContext } from '../useVolcaSets.js';
import { SAMPLE_DRAG_TYPE } from './SlotGrid.js';
import {
  CATEGORIES,
  getCategoryColor,
  getCategoryLabel,
  getDisplayName,
  getSampleCategory,
  sampleCategoryCompare,
} from '../utils/categories.js';

import classes from './LibraryPanel.module.scss';

/** @typedef {import('../store').SampleContainer} SampleContainer */
/** @typedef {import('../sampleCacheStore.js').SampleCache} SampleCache */

/**
 * @param {string} key
 * @param {string} fallback
 */
function readLocalStorage(key, fallback) {
  try {
    return localStorage.getItem(key) || fallback;
  } catch (err) {
    return fallback;
  }
}

/**
 * @param {string} key
 * @param {string} value
 */
function writeLocalStorage(key, value) {
  try {
    localStorage.setItem(key, value);
  } catch (err) {
    // only a convenience
  }
}

const LibraryRow = React.memo(
  /**
   * @param {{
   *   sample: SampleContainer;
   *   sampleCache: SampleCache | null;
   *   index: number;
   *   isFocused: boolean;
   *   isChecked: boolean;
   *   showCheckbox: boolean;
   *   onFocusRow: (index: number) => void;
   *   onCheck: (id: string, index: number, shiftKey: boolean) => void;
   *   onEdit: (id: string) => void;
   * }} props
   */
  function LibraryRow({
    sample,
    sampleCache,
    index,
    isFocused,
    isChecked,
    showCheckbox,
    onFocusRow,
    onCheck,
    onEdit,
  }) {
    const { isPlaybackActive, playbackProgress, togglePlayback } =
      useListItemPlayback(sampleCache);
    const { activeSetSampleIds, isSetFull, toggleInSet } =
      useContext(VolcaSetContext);
    const isInSet = activeSetSampleIds.has(sample.id);
    const category = getSampleCategory(sample);

    return (
      <li
        role="option"
        aria-selected={isFocused}
        tabIndex={isFocused ? 0 : -1}
        data-row={index}
        className={[
          classes.row,
          isPlaybackActive ? classes.playing : '',
          isChecked ? classes.checked : '',
        ].join(' ')}
        style={{
          // @ts-ignore
          '--category-color': getCategoryColor(category),
          '--playback-progress': `${playbackProgress * 100}%`,
        }}
        draggable
        onDragStart={(e) => {
          e.dataTransfer.setData(SAMPLE_DRAG_TYPE, sample.id);
          e.dataTransfer.effectAllowed = 'copy';
        }}
        onClick={(e) => {
          onFocusRow(index);
          const target = /** @type {HTMLElement} */ (e.target);
          if (target.closest('button, input')) return;
          togglePlayback(e.nativeEvent);
        }}
        onDoubleClick={(e) => {
          if (/** @type {HTMLElement} */ (e.target).closest('button, input'))
            return;
          onEdit(sample.id);
        }}
      >
        {showCheckbox && (
          <input
            type="checkbox"
            className={classes.checkbox}
            tabIndex={-1}
            checked={isChecked}
            aria-label={`Select ${sample.metadata.name}`}
            onChange={() => {}}
            onClick={(e) => onCheck(sample.id, index, e.shiftKey)}
          />
        )}
        <span className={classes.playIcon} aria-hidden="true">
          {isPlaybackActive ? <StopIcon /> : <PlayIcon />}
        </span>
        <span className={classes.rowMain}>
          <span className={classes.rowName} title={sample.metadata.name}>
            {getDisplayName(sample.metadata.name)}
            {sample.metadata.favorite && (
              <span className={classes.favorite} aria-label="Favorite">
                ★
              </span>
            )}
          </span>
          <span className={classes.rowMeta}>
            <span className={classes.categoryDot} />
            {getCategoryLabel(category)}
            {sampleCache && (
              <span className={classes.rowDuration}>
                {sampleCache.cachedInfo.duration.toFixed(2)}s
              </span>
            )}
          </span>
        </span>
        <button
          type="button"
          tabIndex={-1}
          className={classes.editButton}
          aria-label={`Edit ${sample.metadata.name}`}
          title="Edit sample"
          onClick={() => onEdit(sample.id)}
        >
          ✎
        </button>
        <button
          type="button"
          tabIndex={-1}
          className={[classes.setToggle, isInSet ? classes.inSet : ''].join(
            ' '
          )}
          disabled={!isInSet && isSetFull}
          aria-pressed={isInSet}
          aria-label={isInSet ? 'Remove from set' : 'Add to set'}
          title={
            isInSet
              ? 'In your set · click to remove'
              : isSetFull
              ? 'Your set is full (100 slots)'
              : 'Add to set'
          }
          onClick={() => toggleInSet(sample.id)}
        >
          {isInSet ? '✓' : '+'}
        </button>
        <span className={classes.rowProgress} />
      </li>
    );
  }
);

const LibraryPanel = React.memo(
  /**
   * @param {{
   *   loading: boolean;
   *   userSamples: Map<string, SampleContainer>;
   *   factorySamples: Map<string, SampleContainer>;
   *   sampleCaches: Map<string, SampleCache>;
   *   onEdit: (id: string) => void;
   *   onBulkImport: (
   *     samples: SampleContainer[],
   *     sampleCaches: SampleCache[]
   *   ) => void;
   *   onSampleUpdate: (
   *     id: string | string[],
   *     update: import('../store').SampleMetadataUpdateArg
   *   ) => void;
   *   onSampleDelete: (id: string | string[]) => void;
   *   onAddToSet: (ids: string[]) => void;
   *   onFindDuplicates: () => void;
   *   onTrimSilence: (ids: string[]) => void;
   * }} props
   */
  function LibraryPanel({
    loading,
    userSamples,
    factorySamples,
    sampleCaches,
    onEdit,
    onBulkImport,
    onSampleUpdate,
    onSampleDelete,
    onAddToSet,
    onFindDuplicates,
    onTrimSilence,
  }) {
    const [source, setSource] = useState(
      /** @type {'collection' | 'factory'} */ (
        readLocalStorage('library_source', 'collection') === 'factory'
          ? 'factory'
          : 'collection'
      )
    );
    useEffect(() => writeLocalStorage('library_source', source), [source]);
    const [categoryFilter, setCategoryFilter] = useState(() =>
      readLocalStorage('library_category_filter', ALL_FILTER)
    );
    useEffect(
      () => writeLocalStorage('library_category_filter', categoryFilter),
      [categoryFilter]
    );
    const [autoAudition, setAutoAudition] = useState(
      () => readLocalStorage('library_auto_audition', 'true') === 'true'
    );
    useEffect(
      () => writeLocalStorage('library_auto_audition', String(autoAudition)),
      [autoAudition]
    );
    const [search, setSearch] = useState('');

    const sourceSamples = source === 'factory' ? factorySamples : userSamples;

    const searchWords = useMemo(
      () => search.trim().toLowerCase().split(/\s+/).filter(Boolean),
      [search]
    );

    const visibleSamples = useMemo(() => {
      return [...sourceSamples.values()]
        .filter((sample) => {
          if (categoryFilter === FAVORITES_FILTER) {
            if (!sample.metadata.favorite) return false;
          } else if (
            categoryFilter !== ALL_FILTER &&
            getSampleCategory(sample) !== categoryFilter
          ) {
            return false;
          }
          if (!searchWords.length) return true;
          const haystack = `${sample.metadata.name} ${getCategoryLabel(
            getSampleCategory(sample)
          )}`.toLowerCase();
          return searchWords.every((w) => haystack.includes(w));
        })
        .sort(sampleCategoryCompare);
    }, [sourceSamples, categoryFilter, searchWords]);

    const [checkedIds, setCheckedIds] = useState(
      /** @type {Set<string>} */ (new Set())
    );
    const lastCheckedIndex = useRef(/** @type {number | null} */ (null));
    // forget selections that are no longer visible
    useEffect(() => {
      setCheckedIds((ids) => {
        const visibleIds = new Set(visibleSamples.map((s) => s.id));
        const kept = [...ids].filter((id) => visibleIds.has(id));
        return kept.length === ids.size ? ids : new Set(kept);
      });
    }, [visibleSamples]);

    const handleCheck = (
      /** @type {string} */ id,
      /** @type {number} */ index,
      /** @type {boolean} */ shiftKey
    ) => {
      setCheckedIds((ids) => {
        const next = new Set(ids);
        const shouldCheck = !ids.has(id);
        if (shiftKey && lastCheckedIndex.current !== null) {
          const [from, to] = [lastCheckedIndex.current, index].sort(
            (a, b) => a - b
          );
          for (const s of visibleSamples.slice(from, to + 1)) {
            if (shouldCheck) next.add(s.id);
            else next.delete(s.id);
          }
        } else if (shouldCheck) {
          next.add(id);
        } else {
          next.delete(id);
        }
        return next;
      });
      lastCheckedIndex.current = index;
    };

    const [focusedIndex, setFocusedIndex] = useState(0);
    /** @type {React.RefObject<HTMLUListElement>} */
    const listRef = useRef(null);

    /** @type {React.KeyboardEventHandler} */
    const handleKeyDown = (e) => {
      if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp' && e.key !== ' ') {
        return;
      }
      if (/** @type {HTMLElement} */ (e.target).closest('input')) return;
      e.preventDefault();
      /** @param {number} index */
      const getRow = (index) => {
        const row = listRef.current?.querySelector(`[data-row="${index}"]`);
        return row instanceof HTMLElement ? row : null;
      };
      if (e.key === ' ') {
        // a click on a row plays it
        getRow(focusedIndex)?.click();
        return;
      }
      const next = focusedIndex + (e.key === 'ArrowDown' ? 1 : -1);
      const row = getRow(next);
      if (!row) return;
      setFocusedIndex(next);
      row.focus();
      row.scrollIntoView({ block: 'nearest' });
      if (autoAudition) row.click();
    };

    const [confirmDelete, setConfirmDelete] = useState(false);
    const checkedList = visibleSamples.filter((s) => checkedIds.has(s.id));
    const isCollection = source === 'collection';

    return (
      <aside className={classes.library} aria-label="Sample collection">
        <div className={classes.header}>
          <h2 className={classes.title}>
            {isCollection ? 'Collection' : 'Factory samples'}
            <span className={classes.count}>{sourceSamples.size}</span>
          </h2>
          <div className={classes.sourceToggle} role="tablist">
            <button
              type="button"
              role="tab"
              aria-selected={isCollection}
              className={isCollection ? classes.active : ''}
              onClick={() => setSource('collection')}
            >
              My collection
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={!isCollection}
              className={!isCollection ? classes.active : ''}
              onClick={() => setSource('factory')}
            >
              Factory
            </button>
          </div>
        </div>

        {isCollection && (
          <>
            <LibraryImport
              userSamples={userSamples}
              onBulkImport={onBulkImport}
            />
            <Button
              size="sm"
              variant="outline-secondary"
              className={classes.duplicatesButton}
              disabled={userSamples.size < 2}
              onClick={onFindDuplicates}
            >
              Find duplicates
            </Button>
          </>
        )}

        <CategoryFilter
          samples={sourceSamples}
          value={categoryFilter}
          onChange={setCategoryFilter}
        />

        <div className={classes.searchRow}>
          <Form.Control
            size="sm"
            type="search"
            placeholder="Search name or category..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <Form.Check
            type="switch"
            id="auto-audition"
            className={classes.autoAudition}
            label="Auto-play"
            title="Play samples while browsing with the arrow keys"
            checked={autoAudition}
            onChange={(e) => setAutoAudition(e.target.checked)}
          />
        </div>

        {checkedList.length > 0 && (
          <div className={classes.bulkBar}>
            <strong>{checkedList.length} selected</strong>
            <Button
              size="sm"
              variant="primary"
              onClick={() => onAddToSet(checkedList.map((s) => s.id))}
            >
              Add to set
            </Button>
            {isCollection && (
              <>
                <Form.Select
                  size="sm"
                  value=""
                  aria-label="Move selection to category"
                  onChange={(e) => {
                    if (!e.target.value) return;
                    onSampleUpdate(
                      checkedList.map((s) => s.id),
                      { category: e.target.value }
                    );
                  }}
                >
                  <option value="">Move to category...</option>
                  {CATEGORIES.map(({ id, label }) => (
                    <option key={id} value={id}>
                      {label}
                    </option>
                  ))}
                </Form.Select>
                <Button
                  size="sm"
                  variant="outline-secondary"
                  onClick={() => onTrimSilence(checkedList.map((s) => s.id))}
                >
                  Trim silence
                </Button>
                <Button
                  size="sm"
                  variant="outline-danger"
                  onClick={() => setConfirmDelete(true)}
                >
                  Delete
                </Button>
              </>
            )}
            <Button
              size="sm"
              variant="link"
              onClick={() => setCheckedIds(new Set())}
            >
              Clear
            </Button>
          </div>
        )}

        <ul
          ref={listRef}
          role="listbox"
          aria-label="Samples"
          className={classes.list}
          onKeyDown={handleKeyDown}
        >
          {loading ? (
            <li className={classes.emptyList}>Loading your collection...</li>
          ) : visibleSamples.length ? (
            visibleSamples.map((sample, index) => (
              <LibraryRow
                key={sample.id}
                sample={sample}
                sampleCache={sampleCaches.get(sample.id) || null}
                index={index}
                isFocused={index === focusedIndex}
                isChecked={checkedIds.has(sample.id)}
                showCheckbox
                onFocusRow={setFocusedIndex}
                onCheck={handleCheck}
                onEdit={onEdit}
              />
            ))
          ) : (
            <li className={classes.emptyList}>
              {sourceSamples.size
                ? 'No samples match this filter.'
                : 'Your collection is empty. Import a folder to get started.'}
            </li>
          )}
        </ul>

        <Modal show={confirmDelete} onHide={() => setConfirmDelete(false)}>
          <Modal.Header closeButton>
            <Modal.Title>Delete from collection</Modal.Title>
          </Modal.Header>
          <Modal.Body>
            <p>
              Delete {checkedList.length} sample
              {checkedList.length === 1 ? '' : 's'} from your collection? They
              are also removed from your sets. This can't be undone (the
              original files on your computer are not touched).
            </p>
          </Modal.Body>
          <Modal.Footer>
            <Button variant="light" onClick={() => setConfirmDelete(false)}>
              Cancel
            </Button>
            <Button
              variant="danger"
              onClick={() => {
                onSampleDelete(checkedList.map((s) => s.id));
                setCheckedIds(new Set());
                setConfirmDelete(false);
              }}
            >
              Delete
            </Button>
          </Modal.Footer>
        </Modal>
      </aside>
    );
  }
);

export default LibraryPanel;
