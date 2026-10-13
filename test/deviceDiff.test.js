require = require('esm')(module);
const test = require('tape');

const {
  applyTransfer,
  getContentKey,
  getDeviceDiff,
  getUnknownDeviceState,
} = require('../src/utils/deviceDiff.js');

const SLOTS = 10;

/**
 * @param {string} id
 * @param {object} [overrides]
 */
function sample(id, overrides = {}) {
  return {
    id,
    metadata: {
      name: `Sample ${id}`,
      sourceFileId: `file-${id}`,
      trim: { frames: [0, 0] },
      normalize: 'all',
      pitchAdjustment: 1,
      qualityBitDepth: 16,
      useCompression: true,
      plugins: [],
      ...overrides,
    },
  };
}

/** @param {ReturnType<typeof sample>[]} samples */
function sentAll(samples) {
  return samples.map((s, slotNumber) => ({
    slotNumber,
    id: s.id,
    metadata: s.metadata,
  }));
}

test('unknown volca: everything in the set is sent, nothing erased', (t) => {
  const set = [sample('a'), sample('b')];
  const diff = getDeviceDiff(getUnknownDeviceState(SLOTS), set, SLOTS);
  t.deepEqual(diff.toSend, [0, 1]);
  t.deepEqual(diff.toErase, []);
  t.deepEqual(diff.unknownEmpty, [2, 3, 4, 5, 6, 7, 8, 9]);
  t.equal(diff.statuses[0], 'unknown');
  t.equal(diff.isKnown, false);
  t.equal(diff.inSync, false);
  t.end();
});

test('after transferring the set (and erasing the rest) it is in sync', (t) => {
  const set = [sample('a'), sample('b')];
  const device = applyTransfer(getUnknownDeviceState(SLOTS), {
    sent: sentAll(set),
    erased: [2, 3, 4, 5, 6, 7, 8, 9],
  });
  const diff = getDeviceDiff(device, set, SLOTS);
  t.equal(diff.inSync, true);
  t.equal(diff.unchanged, 2);
  t.deepEqual(diff.statuses.slice(0, 3), ['unchanged', 'unchanged', 'empty']);
  t.end();
});

test('changes: replaced, new, moved and removed samples', (t) => {
  const a = sample('a');
  const b = sample('b');
  const c = sample('c');
  const device = applyTransfer(
    { slots: Array(SLOTS).fill(null), updatedAt: null },
    { sent: sentAll([a, b, c]), erased: [] }
  );
  // slot 0 same, slot 1 replaced by d, slot 2 emptied, slot 3 new
  const d = sample('d');
  const diff = getDeviceDiff(device, [a, d, null, c], SLOTS);
  t.deepEqual(diff.statuses.slice(0, 5), [
    'unchanged',
    'changed',
    'erase',
    'new',
    'empty',
  ]);
  t.deepEqual(diff.toSend, [1, 3]);
  t.deepEqual(diff.toErase, [2]);
  t.equal(diff.isKnown, true);
  t.equal(diff.inSync, false);
  t.end();
});

test('audio changes count, name changes do not', (t) => {
  const a = sample('a');
  const device = applyTransfer(
    { slots: Array(SLOTS).fill(null), updatedAt: null },
    { sent: sentAll([a]), erased: [] }
  );
  const renamed = sample('a', { name: 'Kick 01' });
  t.equal(getDeviceDiff(device, [renamed], SLOTS).statuses[0], 'unchanged');
  const trimmed = sample('a', { trim: { frames: [10, 0] } });
  t.equal(getDeviceDiff(device, [trimmed], SLOTS).statuses[0], 'changed');
  const pitched = sample('a', { pitchAdjustment: 2 });
  t.equal(getDeviceDiff(device, [pitched], SLOTS).statuses[0], 'changed');
  const lofi = sample('a', { qualityBitDepth: 8 });
  t.equal(getDeviceDiff(device, [lofi], SLOTS).statuses[0], 'changed');
  t.end();
});

test('the same audio in another sample counts as the same', (t) => {
  const a = sample('a');
  const copy = { ...sample('a'), id: 'copy-of-a' };
  t.equal(getContentKey(a.metadata), getContentKey(copy.metadata));
  const device = applyTransfer(
    { slots: Array(SLOTS).fill(null), updatedAt: null },
    { sent: sentAll([a]), erased: [] }
  );
  t.equal(getDeviceDiff(device, [copy], SLOTS).statuses[0], 'unchanged');
  t.end();
});

test('partly unknown: known slots are compared, unknown ones sent', (t) => {
  const a = sample('a');
  const b = sample('b');
  const device = applyTransfer(getUnknownDeviceState(SLOTS), {
    sent: sentAll([a]),
    erased: [],
  });
  const diff = getDeviceDiff(device, [a, b], SLOTS);
  t.deepEqual(diff.statuses.slice(0, 3), [
    'unchanged',
    'unknown',
    'unknownEmpty',
  ]);
  t.deepEqual(diff.toSend, [1]);
  t.equal(diff.isKnown, false);
  t.end();
});
