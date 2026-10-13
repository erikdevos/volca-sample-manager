import React from 'react';

import { VOLCA_MEMORY_SECONDS, VOLCA_SLOT_COUNT } from '../setStore.js';

import classes from './CapacityMeter.module.scss';

/**
 * @param {number} ratio
 * @returns {'ok' | 'warning' | 'over'}
 */
function getLevel(ratio) {
  return ratio > 1 ? 'over' : ratio >= 0.85 ? 'warning' : 'ok';
}

/**
 * @param {{
 *   label: string;
 *   value: string;
 *   max: string;
 *   ratio: number;
 *   remark: string;
 * }} props
 */
function Meter({ label, value, max, ratio, remark }) {
  const level = getLevel(ratio);
  return (
    <div className={`${classes.meter} ${classes[level]}`}>
      <div className={classes.meterTop}>
        <span className={classes.label}>{label}</span>
        <span className={classes.value}>
          {value}
          <span className={classes.max}> / {max}</span>
        </span>
      </div>
      <div
        className={classes.track}
        role="meter"
        aria-label={label}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(ratio * 100)}
      >
        <div
          className={classes.fill}
          style={{ width: `${Math.min(100, ratio * 100)}%` }}
        />
      </div>
      <div className={classes.remark}>{remark}</div>
    </div>
  );
}

/**
 * The two limits of the volca sample: 100 slots and ~65 s of memory.
 */
const CapacityMeter = React.memo(
  /**
   * @param {{
   *   slotsUsed: number;
   *   seconds: number;
   * }} props
   */
  function CapacityMeter({ slotsUsed, seconds }) {
    const slotsLeft = VOLCA_SLOT_COUNT - slotsUsed;
    const secondsLeft = VOLCA_MEMORY_SECONDS - seconds;
    return (
      <div className={classes.capacity}>
        <Meter
          label="Slots"
          value={String(slotsUsed)}
          max={String(VOLCA_SLOT_COUNT)}
          ratio={slotsUsed / VOLCA_SLOT_COUNT}
          remark={
            slotsLeft >= 0 ? `${slotsLeft} free` : `${-slotsLeft} too many`
          }
        />
        <Meter
          label="Memory"
          value={`${seconds.toFixed(1)} s`}
          max={`~${VOLCA_MEMORY_SECONDS} s`}
          ratio={seconds / VOLCA_MEMORY_SECONDS}
          remark={
            secondsLeft >= 0
              ? `${secondsLeft.toFixed(1)} s free`
              : `${(-secondsLeft).toFixed(1)} s over the limit`
          }
        />
      </div>
    );
  }
);

export default CapacityMeter;
