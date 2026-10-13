require = require('esm')(module);
const fs = require('fs');
const path = require('path');
const test = require('tape');

const {
  getCategoryFromFileName,
  getFileNameWords,
  UNSORTED_CATEGORY_ID,
} = require('../src/utils/categories.js');

test('ignores number prefix, extension and glued digits', (t) => {
  t.deepEqual(getFileNameWords('001 - kick Bd28.wav'), ['kick', 'bd']);
  t.deepEqual(getFileNameWords('012A-snare.wav'), ['snare']);
  t.deepEqual(getFileNameWords('021-snareldk28.wav'), ['snareldk']);
  t.deepEqual(getFileNameWords('005-kick03.WAV'), ['kick']);
  t.end();
});

test('categorizes typical names', (t) => {
  /** @type {[string, string][]} */
  const cases = [
    ['001-kick-BD1050.WAV', 'kick'],
    ['005-kick03.wav', 'kick'],
    ['011-snare-Thunder Snare.wav', 'snare'],
    ['021-snareldk31.wav', 'snare'],
    ['030-clap-HANDCLP1.WAV', 'clap'],
    ['030-snap.wav', 'clap'],
    ['033-hihat-closed Ch01.wav', 'hihat-closed'],
    ['037-hihat-closed-OH00.WAV', 'hihat-closed'],
    ['037-hithat-open-OH25.WAV', 'hihat-open'],
    ['039-hithat-closed.wav', 'hihat-closed'],
    ['035-hihat-open-CY0000.WAV', 'hihat-open'],
    ['041-crash-open-Clp13.wav', 'cymbal'],
    ['042-cymbal-open.wav', 'cymbal'],
    ['044-rim.wav', 'rim'],
    ['047-tom-high.wav', 'tom'],
    ['051-cowbell.wav', 'perc'],
    ['054-shake.wav', 'perc'],
    ['061-sub.wav', 'bass'],
    ['91-bass-samp.wav', 'bass'],
    ['062-stab.wav', 'stab'],
    ['088-glass-chord.wav', 'melodic'],
    ['083-choir.wav', 'melodic'],
    ['00 Kick 1.wav', 'kick'],
    ['30 Hihat 1.wav', 'hihat-closed'],
    ['WhiteNoise.wav', UNSORTED_CATEGORY_ID],
    ['something.wav', UNSORTED_CATEGORY_ID],
  ];
  for (const [fileName, category] of cases) {
    t.equal(getCategoryFromFileName(fileName), category, fileName);
  }
  t.end();
});

test('every file in samples/ gets a category', (t) => {
  const dir = path.join(__dirname, '..', 'samples');
  if (!fs.existsSync(dir)) {
    t.skip('no samples/ folder');
    t.end();
    return;
  }
  const fileNames = fs
    .readdirSync(dir)
    .filter((f) => /\.(wav|aiff?|mp3|ogg|flac)$/i.test(f));
  for (const fileName of fileNames) {
    t.notEqual(
      getCategoryFromFileName(fileName),
      UNSORTED_CATEGORY_ID,
      `${fileName} -> ${getCategoryFromFileName(fileName)}`
    );
  }
  t.end();
});

test('display names drop the number prefix', (t) => {
  const { getDisplayName } = require('../src/utils/categories.js');
  t.equal(getDisplayName('011-snare-Thunder Snare'), 'snare-Thunder Snare');
  t.equal(getDisplayName('001 - kick Bd28'), 'kick Bd28');
  t.equal(getDisplayName('012A-snare'), 'snare');
  t.equal(getDisplayName('91-bass-samp'), 'bass-samp');
  t.equal(getDisplayName('Kick 1'), 'Kick 1');
  t.equal(getDisplayName('00 Kick 1'), 'Kick 1');
  t.equal(getDisplayName('808'), '808');
  t.end();
});
