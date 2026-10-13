import { processPluginsForSample } from './audioData.js';

/** Anything this far below the sample's peak counts as silence */
export const SILENCE_THRESHOLD_DB = -50;
/** Margin kept before the first sound, so the attack stays intact */
const LEAD_MARGIN_SECONDS = 0.001;
/** Margin kept after the last sound, for the very end of the decay */
const TAIL_MARGIN_SECONDS = 0.01;
/** Savings smaller than this aren't worth a change */
export const MIN_SAVING_SECONDS = 0.005;

/**
 * @typedef {{
 *   frames: [number, number];
 *   currentSeconds: number;
 *   trimmedSeconds: number;
 *   savedSeconds: number;
 * }} SilenceTrim
 */

/**
 * Works out how much silence can be trimmed from the start and end of a
 * sample. Trimming is non-destructive (the source audio is kept), and an
 * existing trim that already cuts more is left as it is.
 *
 * Durations take the pitch adjustment into account, since that changes how
 * much memory the sample needs on the volca.
 *
 * @param {import('../store').SampleContainer} sample
 * @returns {Promise<SilenceTrim>}
 */
export async function getSilenceTrim(sample) {
  const audioBuffer = await processPluginsForSample(sample);
  const data = audioBuffer.getChannelData(0);
  const { sampleRate, length } = audioBuffer;
  const {
    trim: { frames: currentFrames },
    pitchAdjustment,
  } = sample.metadata;
  const pitch = pitchAdjustment > 0 ? pitchAdjustment : 1;

  let peak = 0;
  for (let i = 0; i < length; i++) {
    peak = Math.max(peak, Math.abs(data[i]));
  }
  const threshold = peak * Math.pow(10, SILENCE_THRESHOLD_DB / 20);

  let first = 0;
  while (first < length && Math.abs(data[first]) <= threshold) first++;
  let last = length - 1;
  while (last > first && Math.abs(data[last]) <= threshold) last--;

  /** @type {[number, number]} */
  const frames = peak
    ? [
        Math.max(
          currentFrames[0],
          Math.max(0, first - Math.round(LEAD_MARGIN_SECONDS * sampleRate))
        ),
        Math.max(
          currentFrames[1],
          Math.max(
            0,
            length - 1 - last - Math.round(TAIL_MARGIN_SECONDS * sampleRate)
          )
        ),
      ]
    : [currentFrames[0], currentFrames[1]];

  /** @param {[number, number]} trim */
  const getSeconds = (trim) =>
    Math.max(0, length - trim[0] - trim[1]) / sampleRate / pitch;
  const currentSeconds = getSeconds(currentFrames);
  const trimmedSeconds = getSeconds(frames);
  return {
    frames,
    currentSeconds,
    trimmedSeconds,
    savedSeconds: currentSeconds - trimmedSeconds,
  };
}
