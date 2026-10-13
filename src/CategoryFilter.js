import React, { useMemo } from 'react';

import {
  CATEGORIES,
  getSampleCategory,
  UNSORTED_CATEGORY_ID,
} from './utils/categories.js';

import classes from './CategoryFilter.module.scss';

/** @typedef {import('./store').SampleContainer} SampleContainer */

export const ALL_FILTER = 'all';
export const FAVORITES_FILTER = 'favorites';

const CategoryFilter = React.memo(
  /**
   * @param {{
   *   samples: Map<string, SampleContainer>;
   *   value: string;
   *   onChange: (value: string) => void;
   * }} props
   */
  function CategoryFilter({ samples, value, onChange }) {
    const counts = useMemo(() => {
      /** @type {Map<string, number>} */
      const counts = new Map();
      let favorites = 0;
      for (const sample of samples.values()) {
        const category = getSampleCategory(sample);
        counts.set(category, (counts.get(category) || 0) + 1);
        if (sample.metadata.favorite) favorites++;
      }
      counts.set(ALL_FILTER, samples.size);
      counts.set(FAVORITES_FILTER, favorites);
      return counts;
    }, [samples]);

    const options = [
      { id: ALL_FILTER, label: 'All' },
      { id: FAVORITES_FILTER, label: '★' },
      ...CATEGORIES,
    ].filter(
      ({ id }) =>
        id === ALL_FILTER ||
        id === value ||
        // keep the category buttons stable, but only show "unsorted" and
        // "favorites" when there is something in them
        (id === UNSORTED_CATEGORY_ID || id === FAVORITES_FILTER
          ? Boolean(counts.get(id))
          : true)
    );

    return (
      <div
        className={classes.categoryFilter}
        role="group"
        aria-label="Filter by category"
      >
        {options.map(({ id, label }) => {
          const count = counts.get(id) || 0;
          return (
            <button
              key={id}
              type="button"
              className={[
                classes.chip,
                value === id ? classes.active : '',
                count ? '' : classes.empty,
                id === UNSORTED_CATEGORY_ID && count ? classes.attention : '',
              ].join(' ')}
              aria-pressed={value === id}
              title={id === FAVORITES_FILTER ? 'Favorites' : undefined}
              onClick={() => onChange(value === id ? ALL_FILTER : id)}
            >
              {label}
              <span className={classes.count}>{count}</span>
            </button>
          );
        })}
      </div>
    );
  }
);

export default CategoryFilter;
