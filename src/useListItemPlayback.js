import { useCallback, useRef, useState } from 'react';

import { useWaveformPlayback } from './utils/waveform.js';
import { usePreviewAudio } from './sampleCacheStore.js';

/**
 * Only one list item plays at a time (across all lists), so browsing quickly
 * through samples doesn't turn into a pile of overlapping sounds.
 * @type {(() => void) | null}
 */
let stopActiveListItemPlayback = null;

/**
 * Playback of a sample's preview audio (as it will sound on the volca) for an
 * item in a list. The audio is only loaded once playback is requested.
 *
 * @param {import('./sampleCacheStore.js').SampleCache | null} sampleCache
 */
export function useListItemPlayback(sampleCache) {
  const [audioRequested, setAudioRequested] = useState(false);

  const { audioBuffer } = usePreviewAudio(sampleCache, audioRequested);

  const {
    isPlaybackActive,
    playbackProgress,
    togglePlayback: _togglePlayback,
  } = useWaveformPlayback(audioBuffer || null);

  const isPlaybackActiveRef = useRef(isPlaybackActive);
  isPlaybackActiveRef.current = isPlaybackActive;
  const _togglePlaybackRef = useRef(_togglePlayback);
  _togglePlaybackRef.current = _togglePlayback;

  const togglePlayback = useCallback(
    /** @param {MouseEvent | KeyboardEvent} e */
    (e) => {
      if (!isPlaybackActive) {
        if (stopActiveListItemPlayback) stopActiveListItemPlayback();
        stopActiveListItemPlayback = () => {
          if (isPlaybackActiveRef.current) _togglePlaybackRef.current(e);
        };
      }
      _togglePlayback(e);
      setAudioRequested(true);
    },
    [_togglePlayback, isPlaybackActive]
  );

  return { isPlaybackActive, playbackProgress, togglePlayback };
}
