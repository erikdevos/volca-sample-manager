require = require('esm')(module);
const test = require('tape');

const {
  insertAtSlot,
  moveSlot,
  placeSample,
  removeSamples,
  sortSlotsByCategory,
  trimSlots,
} = require('../src/utils/setSlots.js');

const SLOTS = 10;

// id = name; the category comes from the name
const samples = new Map(
  ['kick1', 'kick2', 'kick3', 'snare1', 'snare2', 'clap1', 'tom1'].map((id) => [
    id,
    { id, metadata: { name: id, category: null } },
  ])
);
/** @param {string} id */
const getSample = (id) => samples.get(id);
/** @param {string} id */
const place = (slots, id) =>
  placeSample(slots, samples.get(id), getSample, SLOTS);

test('removing a sample leaves its slot empty', (t) => {
  const slots = ['kick1', 'kick2', 'snare1', 'clap1'];
  t.deepEqual(removeSamples(slots, ['kick2']), [
    'kick1',
    null,
    'snare1',
    'clap1',
  ]);
  t.deepEqual(removeSamples(slots, ['clap1']), ['kick1', 'kick2', 'snare1']);
  t.deepEqual(trimSlots(['kick1', null, null]), ['kick1']);
  t.end();
});

test('a new sample fills a gap in its own category first', (t) => {
  const slots = ['kick1', null, 'kick2', 'snare1'];
  t.deepEqual(place(slots, 'kick3'), ['kick1', 'kick3', 'kick2', 'snare1']);
  t.end();
});

test('otherwise the first empty slot after its category', (t) => {
  const slots = ['kick1', 'kick2', null, 'snare1', null, 'clap1'];
  t.deepEqual(place(slots, 'kick3'), [
    'kick1',
    'kick2',
    'kick3',
    'snare1',
    null,
    'clap1',
  ]);
  t.deepEqual(place(slots, 'snare2'), [
    'kick1',
    'kick2',
    null,
    'snare1',
    'snare2',
    'clap1',
  ]);
  t.end();
});

test('existing samples never move when adding', (t) => {
  const slots = ['kick1', 'snare1', 'clap1'];
  const result = place(slots, 'kick2');
  t.deepEqual(result.slice(0, 3), slots);
  t.equal(result[3], 'kick2');
  t.end();
});

test('a full set falls back to any empty slot, then overflows', (t) => {
  const slots = [null, 'snare1', 'snare2', 'clap1', 'tom1'];
  // tom comes after everything, the only gap is before it
  const full = ['kick1', 'kick2', 'kick3', 'snare1', 'snare2', 'clap1'];
  t.deepEqual(
    place(['kick1', null, ...full.slice(2), 'x', 'y', 'z', 'w'], 'tom1')[1],
    'tom1'
  );
  t.equal(place(slots, 'kick1')[0], 'kick1');
  const tenFull = Array.from({ length: SLOTS }, (_, i) => `x${i}`);
  t.deepEqual(place(tenFull, 'kick1'), [...tenFull, 'kick1']);
  t.end();
});

test('adding a sample that is already there changes nothing', (t) => {
  const slots = ['kick1', 'snare1'];
  t.equal(place(slots, 'kick1'), slots);
  t.end();
});

test('dragging onto a used slot swaps, onto an empty slot moves', (t) => {
  const slots = ['kick1', 'kick2', null, 'snare1'];
  t.deepEqual(moveSlot(slots, 0, 3), ['snare1', 'kick2', null, 'kick1']);
  t.deepEqual(moveSlot(slots, 0, 2), [null, 'kick2', 'kick1', 'snare1']);
  t.deepEqual(moveSlot(slots, 3, 5), [
    'kick1',
    'kick2',
    null,
    null,
    null,
    'snare1',
  ]);
  t.deepEqual(moveSlot(slots, 3, 2), ['kick1', 'kick2', 'snare1']);
  t.end();
});

test('dropping onto a used slot only shifts up to the next gap', (t) => {
  const slots = ['kick1', 'kick2', null, 'snare1', 'clap1'];
  t.deepEqual(insertAtSlot(slots, 'kick3', 0), [
    'kick3',
    'kick1',
    'kick2',
    'snare1',
    'clap1',
  ]);
  t.deepEqual(insertAtSlot(slots, 'kick3', 2), [
    'kick1',
    'kick2',
    'kick3',
    'snare1',
    'clap1',
  ]);
  t.deepEqual(insertAtSlot(slots, 'kick3', 6), [
    'kick1',
    'kick2',
    null,
    'snare1',
    'clap1',
    null,
    'kick3',
  ]);
  // moving a sample that is already in the set leaves its old slot empty
  t.deepEqual(insertAtSlot(slots, 'kick1', 2), [
    null,
    'kick2',
    'kick1',
    'snare1',
    'clap1',
  ]);
  t.end();
});

test('sorting by category closes the gaps', (t) => {
  t.deepEqual(
    sortSlotsByCategory(['snare1', null, 'kick2', null, 'kick1'], getSample),
    ['kick1', 'kick2', 'snare1']
  );
  t.end();
});
