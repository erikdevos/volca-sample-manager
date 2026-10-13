import { CATEGORIES, CATEGORIES_BY_ID, naturalCompare } from './categories.js';

/** Common misspellings in sample names */
const TYPOS = /** @type {Record<string, string>} */ ({
  hithat: 'hihat',
  hihats: 'hihat',
  snair: 'snare',
  kik: 'kick',
});

/** Words that say nothing about the sound */
const NOISE_WORDS = ['samp', 'sample', 'smp', 'wav', 'one', 'shot', 'oneshot'];

/** How an alias is written in a tidy name (the first word of the name) */
const HEAD_WORDS = /** @type {Record<string, string>} */ ({
  kick: 'Kick',
  bd: 'Kick',
  kik: 'Kick',
  bassdrum: 'Kick',
  snare: 'Snare',
  sd: 'Snare',
  sn: 'Snare',
  snr: 'Snare',
  clap: 'Clap',
  clp: 'Clap',
  cp: 'Clap',
  handclp: 'Clap',
  handclap: 'Clap',
  snap: 'Snap',
  crash: 'Crash',
  cymbal: 'Cymbal',
  cy: 'Cymbal',
  cym: 'Cymbal',
  ride: 'Ride',
  splash: 'Splash',
  china: 'China',
  rim: 'Rim',
  rimshot: 'Rim',
  rs: 'Rim',
  stick: 'Stick',
  tom: 'Tom',
  lt: 'Tom',
  mt: 'Tom',
  ht: 'Tom',
  perc: 'Perc',
  cowbell: 'Cowbell',
  cow: 'Cowbell',
  cb: 'Cowbell',
  wood: 'Wood',
  block: 'Block',
  shake: 'Shaker',
  shaker: 'Shaker',
  tamb: 'Tambourine',
  tambourine: 'Tambourine',
  conga: 'Conga',
  bongo: 'Bongo',
  clave: 'Claves',
  claves: 'Claves',
  bass: 'Bass',
  sub: 'Sub',
  808: '808',
  stab: 'Stab',
  hit: 'Hit',
  ep: 'EP',
  fx: 'FX',
  vox: 'Vocal',
  vocal: 'Vocal',
  voice: 'Voice',
});

/** For a category without a matching word in the name */
const FALLBACK_HEADS = /** @type {Record<string, string>} */ ({
  kick: 'Kick',
  snare: 'Snare',
  clap: 'Clap',
  'hihat-closed': 'Hihat Closed',
  'hihat-open': 'Hihat Open',
  cymbal: 'Cymbal',
  rim: 'Rim',
  tom: 'Tom',
  perc: 'Perc',
  bass: 'Bass',
  stab: 'Stab',
  melodic: 'Chord',
  vocal: 'Vocal',
  fx: 'FX',
});

const HIHAT_WORDS = ['hihat', 'hat', 'hh', 'hats'];
const HIHAT_STATE_WORDS = ['open', 'oh', 'opn', 'closed', 'close', 'ch', 'cls'];

/** @param {string} word */
function titleCase(word) {
  // short all-caps words are usually names or models ("OBX", "IDC")
  if (/^[A-Z]{2,4}$/.test(word)) return word;
  return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
}

/**
 * The head word a word stands for within a category ("bd" -> "Kick",
 * "snareldk" -> "Snare"), or null if it isn't one of the category's words.
 *
 * @param {string} lower lowercase word
 * @param {string[]} aliases
 */
function getHeadWord(lower, aliases) {
  const alias =
    aliases.find((a) => a === lower) ||
    aliases.find((a) => a.length >= 4 && lower.startsWith(a));
  return alias ? HEAD_WORDS[alias] || titleCase(alias) : null;
}

/**
 * Splits a sample name into words, keeping their case: without extension and
 * number prefix, with CamelCase split up, typos fixed, and pack codes like
 * "BD1050" or "Clp01" removed. A glued code after a known word keeps the
 * word ("snareldk28" -> "snare", "kick03" -> "kick").
 *
 * @param {string} name
 * @returns {string[]}
 */
export function getNameTokens(name) {
  const allAliases = CATEGORIES.flatMap((c) => c.aliases).concat(HIHAT_WORDS);
  return name
    .replace(/\.[a-z0-9]{2,4}$/i, '')
    .replace(/^[\d\s._-]+[a-z]?(?=[\s._-])/i, '')
    .replace(/^\d+(?=[a-z])/i, '')
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2')
    .split(/[\s._-]+/)
    .filter(Boolean)
    .flatMap((token) => {
      const code = token.match(/^([a-z]+)(\d+)$/i);
      if (code) {
        // a code, or a word with a number glued to it
        const letters = code[1].toLowerCase();
        const alias = allAliases.find(
          (a) => a.length >= 4 && letters.startsWith(a)
        );
        return alias ? [alias] : [];
      }
      if (/\d/.test(token) && /[a-z]/i.test(token)) {
        // mixed codes like "A1b2"
        return [];
      }
      const lower = token.toLowerCase();
      return [TYPOS[lower] || (/^[A-Z]+$/.test(token) ? token : lower)];
    });
}

/**
 * A tidy name, starting with what the sound is: "011-snare-Thunder Snare"
 * becomes "Snare Thunder". Without a number; see `tidyNames` for that.
 *
 * @param {string} name
 * @param {string} categoryId
 * @param {string} [hintName] e.g. the name of a factory sample that sounds
 *   the same, used when the name itself doesn't say what the sound is
 */
export function tidyName(name, categoryId, hintName) {
  const category = CATEGORIES_BY_ID.get(categoryId);
  const aliases = category ? category.aliases : [];
  const otherAliases = CATEGORIES.filter((c) => c.id !== categoryId).flatMap(
    (c) => c.aliases
  );
  const tokens = getNameTokens(name);
  const isHihat = categoryId === 'hihat-closed' || categoryId === 'hihat-open';

  /** @param {string[]} tokens */
  const findHead = (tokens) => {
    if (isHihat) return null;
    for (const token of tokens) {
      const head = getHeadWord(token.toLowerCase(), aliases);
      if (head) return head;
    }
    return null;
  };

  let head = isHihat ? FALLBACK_HEADS[categoryId] : findHead(tokens);
  if (!head && hintName) head = findHead(getNameTokens(hintName));
  if (!head) head = FALLBACK_HEADS[categoryId] || null;

  /** @type {string[]} */
  const rest = [];
  for (const token of tokens) {
    const lower = token.toLowerCase();
    const isHeadWord = isHihat
      ? HIHAT_WORDS.includes(lower) || HIHAT_STATE_WORDS.includes(lower)
      : head !== null && getHeadWord(lower, aliases) === head;
    if (
      isHeadWord ||
      NOISE_WORDS.includes(lower) ||
      otherAliases.includes(lower) ||
      rest.some((r) => r.toLowerCase() === lower)
    ) {
      continue;
    }
    rest.push(titleCase(token));
  }
  // a variant number at the end is given again by tidyNames, which keeps
  // tidying idempotent ("Tom Mid 01" stays "Tom Mid 01"); "808" stays
  if (rest.length && /^\d{1,2}$/.test(rest[rest.length - 1])) {
    if (head || rest.length > 1) rest.pop();
  }
  if (!head) {
    return rest.join(' ') || name;
  }
  return [head, ...rest].join(' ');
}

/**
 * @typedef {{
 *   id: string;
 *   name: string;
 *   categoryId: string;
 *   hintName?: string;
 * }} TidyNameInput
 */

/**
 * Tidy names for a group of samples. Samples that end up with the same name
 * are numbered in their original order ("Kick 01", "Kick 02", ...), also
 * counting names that other samples already have.
 *
 * @param {TidyNameInput[]} items
 * @param {string[]} [otherNames] names of samples that are not renamed
 * @returns {Map<string, string>} new name by id
 */
export function tidyNames(items, otherNames = []) {
  /** @type {Map<string, TidyNameInput[]>} */
  const groups = new Map();
  /** @type {Map<string, string>} */
  const baseNames = new Map();
  for (const item of items) {
    const base = tidyName(item.name, item.categoryId, item.hintName);
    baseNames.set(item.id, base);
    const key = base.toLowerCase();
    groups.set(key, [...(groups.get(key) || []), item]);
  }
  /** @type {Map<string, string>} */
  const result = new Map();
  for (const [key, group] of groups) {
    const base = /** @type {string} */ (baseNames.get(group[0].id));
    // numbers that are taken by samples outside this group
    const taken = otherNames
      .map((n) => n.toLowerCase())
      .filter((n) => n === key || n.startsWith(`${key} `))
      .map((n) => (n === key ? 0 : Number(n.slice(key.length + 1))))
      .filter((n) => Number.isInteger(n));
    if (group.length === 1 && !taken.length) {
      result.set(group[0].id, base);
      continue;
    }
    const sorted = group.slice().sort((a, b) => naturalCompare(a.name, b.name));
    let number = taken.length ? Math.max(...taken) : 0;
    const digits = Math.max(2, String(number + sorted.length).length);
    for (const item of sorted) {
      number++;
      result.set(item.id, `${base} ${String(number).padStart(digits, '0')}`);
    }
  }
  return result;
}
