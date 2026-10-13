import React from 'react';
import { Button, Form } from 'react-bootstrap';

import { CATEGORIES, getSampleCategory } from './utils/categories.js';

import classes from './SampleCategoryControl.module.scss';

const SampleCategoryControl = React.memo(
  /**
   * @param {{
   *   sample: import('./store').SampleContainer;
   *   onSampleUpdate: (
   *     id: string,
   *     update: import('./store').SampleMetadataUpdateArg
   *   ) => void;
   * }} props
   */
  function SampleCategoryControl({ sample, onSampleUpdate }) {
    const { favorite } = sample.metadata;
    return (
      <div className={classes.categoryControl}>
        <Form.Group controlId="sample-category" className={classes.category}>
          <Form.Label>Category</Form.Label>
          <Form.Select
            value={getSampleCategory(sample)}
            onChange={(e) =>
              onSampleUpdate(sample.id, { category: e.target.value })
            }
          >
            {CATEGORIES.map(({ id, label }) => (
              <option key={id} value={id}>
                {label}
              </option>
            ))}
          </Form.Select>
        </Form.Group>
        <Button
          type="button"
          variant={favorite ? 'warning' : 'outline-secondary'}
          className={classes.favorite}
          aria-pressed={favorite}
          onClick={() => onSampleUpdate(sample.id, { favorite: !favorite })}
        >
          {favorite ? '★ Favorite' : '☆ Add to favorites'}
        </Button>
      </div>
    );
  }
);

export default SampleCategoryControl;
