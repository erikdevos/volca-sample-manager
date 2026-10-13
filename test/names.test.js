require = require('esm')(module);
const fs = require('fs');
const path = require('path');
const test = require('tape');

const { tidyName, tidyNames, getNameTokens } = require('../src/utils/names.js');
const { getCategoryFromFileName } = require('../src/utils/categories.js');

test('removes number prefix, pack codes and fixes typos', (t) => {
  t.deepEqual(getNameTokens('001-kick-BD1050.WAV'), ['kick']);
  t.equal(tidyName('030-clap-HANDCLP1', 'clap'), 'Clap');
  t.deepEqual(getNameTokens('021-snareldk28'), ['snare']);
  t.deepEqual(getNameTokens('005-kick03'), ['kick']);
  t.deepEqual(getNameTokens('037-hithat-open-OH25'), ['hihat', 'open']);
  t.deepEqual(getNameTokens('010-kick-Dist_Bd1'), ['kick', 'dist']);
  t.deepEqual(getNameTokens('011-snare-707 Slammed'), [
    'snare',
    '707',
    'slammed',
  ]);
  t.end();
});

test('starts with what the sound is', (t) => {
  /** @type {[string, string, string][]} */
  const cases = [
    ['011-snare-Thunder Snare', 'snare', 'Snare Thunder'],
    ['011-snare-707 Slammed', 'snare', 'Snare 707 Slammed'],
    ['011-snare-Blasted OBX snare', 'snare', 'Snare Blasted OBX'],
    ['011-snare-Pre SN', 'snare', 'Snare Pre'],
    ['011-snare-PreShifter', 'snare', 'Snare Pre Shifter'],
    ['011-snare Clapper', 'snare', 'Snare Clapper'],
    ['037-hihat-open', 'hihat-open', 'Hihat Open'],
    ['037-hihat-closed-OH00', 'hihat-closed', 'Hihat Closed'],
    ['039-hithat-closed', 'hihat-closed', 'Hihat Closed'],
    ['040-crash-open', 'cymbal', 'Crash Open'],
    ['054-shake', 'perc', 'Shaker'],
    ['072-piano-samp', 'melodic', 'Piano'],
    ['088-glass-chord', 'melodic', 'Glass Chord'],
    ['91-bass-samp', 'bass', 'Bass'],
    ['030-snap', 'clap', 'Snap'],
  ];
  for (const [name, category, expected] of cases) {
    t.equal(tidyName(name, category), expected, name);
  }
  t.end();
});

test('a corrected category uses the hint for the instrument', (t) => {
  t.equal(tidyName('057-kick', 'perc', 'DoncaSConga'), 'Conga');
  t.equal(tidyName('058-tom', 'perc', 'DoncaLBongo'), 'Bongo');
  t.equal(tidyName('057-kick', 'perc'), 'Perc');
  t.end();
});

test('numbers equal names in their original order', (t) => {
  const result = tidyNames([
    { id: 'c', name: '010-kick', categoryId: 'kick' },
    { id: 'a', name: '000-kick', categoryId: 'kick' },
    { id: 'b', name: '005-kick03', categoryId: 'kick' },
    { id: 'd', name: '010-kick-Dist_Bd1', categoryId: 'kick' },
  ]);
  t.equal(result.get('a'), 'Kick 01');
  t.equal(result.get('b'), 'Kick 02');
  t.equal(result.get('c'), 'Kick 03');
  t.equal(result.get('d'), 'Kick Dist');
  t.end();
});

test('tidying tidy names changes nothing', (t) => {
  const first = tidyNames([
    { id: 'a', name: '046-tom-mid', categoryId: 'tom' },
    { id: 'b', name: '049-tom-mid', categoryId: 'tom' },
    { id: 'c', name: '011-snare-clicker 2', categoryId: 'snare' },
    { id: 'd', name: '011-snare-Clicker', categoryId: 'snare' },
    { id: 'e', name: '011-snare-707 Slammed', categoryId: 'snare' },
  ]);
  const second = tidyNames(
    ['a', 'b', 'c', 'd', 'e'].map((id) => ({
      id,
      name: /** @type {string} */ (first.get(id)),
      categoryId: id === 'a' || id === 'b' ? 'tom' : 'snare',
    }))
  );
  t.deepEqual([...second], [...first]);
  t.equal(first.get('c'), 'Snare Clicker 02');
  t.equal(first.get('e'), 'Snare 707 Slammed');
  t.end();
});

test('continues after numbers that other samples already have', (t) => {
  const result = tidyNames(
    [{ id: 'a', name: '000-kick', categoryId: 'kick' }],
    ['Kick 01', 'Kick 02', 'Snare 05']
  );
  t.equal(result.get('a'), 'Kick 03');
  t.end();
});

test('all sample names: unique, no codes, no number prefix', (t) => {
  const dir = path.join(__dirname, '..', 'samples');
  const files = fs.existsSync(dir)
    ? fs.readdirSync(dir).filter((f) => /\.wav$/i.test(f))
    : [];
  if (!files.length) {
    t.skip('no samples folder');
    t.end();
    return;
  }
  const result = tidyNames(
    files.map((f) => ({
      id: f,
      name: f.replace(/\.wav$/i, ''),
      categoryId: getCategoryFromFileName(f),
    }))
  );
  const names = [...result.values()];
  t.equal(
    new Set(names.map((n) => n.toLowerCase())).size,
    names.length,
    'unique'
  );
  t.ok(
    names.every((n) => n.trim().length > 0),
    'not empty'
  );
  t.ok(
    names.every((n) => !/[a-z]\d|\d[a-z]/i.test(n)),
    'no pack codes left'
  );
  t.ok(
    names.every((n) => !/^\d/.test(n)),
    'no number prefix'
  );
  t.ok(
    names.every((n) => !/hithat/i.test(n)),
    'typos fixed'
  );
  t.end();
});
