import React from 'react';
import { Container, Button, Alert } from 'react-bootstrap';

import WaveformReadonly from './WaveformReadonly.js';
import { formatDate } from './utils/datetime.js';

import classes from './SampleDetail.module.scss';

/**
 * @param {{
 *   sample: import('./store').SampleContainer;
 *   sampleCache: import('./sampleCacheStore.js').SampleCache | null;
 *   onSampleDuplicate: (id: string) => void;
 * }} props
 */
function SampleDetailReadonly({ sample, sampleCache, onSampleDuplicate }) {
  return (
    <Container fluid="sm">
      <h2 className={classes.sampleName}>{sample.metadata.name}</h2>
      <p>
        <strong>Sampled:</strong>{' '}
        {formatDate(new Date(sample.metadata.dateSampled))}
      </p>
      <Alert variant="secondary">
        <Alert.Heading>This is a factory sample.</Alert.Heading>
        <p>
          If you want to trim the audio, adjust quality, change the pitch or use
          plugins before transferring to the volca sample,{' '}
          <span className={classes.buttonLink}>
            <Button variant="link" onClick={() => onSampleDuplicate(sample.id)}>
              make a duplicate
            </Button>
            .
          </span>
        </p>
      </Alert>
      <h4>Preview</h4>
      <WaveformReadonly sample={sample} sampleCache={sampleCache} />
    </Container>
  );
}

export default SampleDetailReadonly;
