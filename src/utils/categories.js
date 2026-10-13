/**
 * @typedef {{
 *   id: string;
 *   label: string;
 *   aliases: string[];
 * }} Category
 */

export const UNSORTED_CATEGORY_ID = 'unsorted';

/**
 * Ordered roughly like the factory slot layout of the volca sample, which is
 * also the order used to display the library.
 *
 * Aliases are matched against the words in a file name. Aliases of 4+
 * characters also match as a prefix (e.g. "snareldk28" matches "snare"),
 * shorter aliases only match a whole word (so "oh" doesn't match "ohm").
 *
 * @type {Category[]}
 */
export const CATEGORIES = [
  { id: 'kick', label: 'Kick', aliases: ['kick', 'bd', 'bassdrum', 'kik'] },
  { id: 'snare', label: 'Snare', aliases: ['snare', 'sd', 'sn', 'snr'] },
  {
    id: 'clap',
    label: 'Clap / Snap',
    aliases: ['clap', 'handclp', 'handclap', 'clp', 'cp', 'snap'],
  },
  { id: 'hihat-closed', label: 'Hihat closed', aliases: [] },
  { id: 'hihat-open', label: 'Hihat open', aliases: [] },
  {
    id: 'cymbal',
    label: 'Crash / Cymbal',
    aliases: ['crash', 'cymbal', 'ride', 'cy', 'cym', 'splash', 'china'],
  },
  { id: 'rim', label: 'Rim', aliases: ['rim', 'rimshot', 'rs', 'stick'] },
  { id: 'tom', label: 'Tom', aliases: ['tom', 'lt', 'mt', 'ht'] },
  {
    id: 'perc',
    label: 'Percussion',
    aliases: [
      'perc',
      'cowbell',
      'cow',
      'wood',
      'block',
      'shake',
      'shaker',
      'tamb',
      'tambourine',
      'conga',
      'bongo',
      'clave',
      'claves',
      'cb',
    ],
  },
  { id: 'bass', label: 'Bass / Sub', aliases: ['bass', 'sub', '808'] },
  { id: 'stab', label: 'Stab / Hit', aliases: ['stab', 'hit'] },
  {
    id: 'melodic',
    label: 'Chord / Melodic',
    aliases: [
      'chord',
      'piano',
      'keys',
      'organ',
      'choir',
      'guitar',
      'glass',
      'strings',
      'pad',
      'bell',
      'kalimba',
      'synth',
      'lead',
      'ep',
    ],
  },
  { id: 'vocal', label: 'Vocal', aliases: ['vocal', 'vox', 'voice'] },
  {
    id: 'fx',
    label: 'FX / Noise',
    aliases: ['fx', 'noise', 'swoosh', 'sweep', 'riser', 'airhorn', 'impact'],
  },
  { id: UNSORTED_CATEGORY_ID, label: 'Unsorted', aliases: [] },
];

/** @type {Map<string, Category>} */
export const CATEGORIES_BY_ID = new Map(CATEGORIES.map((c) => [c.id, c]));

/** @param {string | null | undefined} categoryId */
export function getCategoryLabel(categoryId) {
  const category = CATEGORIES_BY_ID.get(categoryId || UNSORTED_CATEGORY_ID);
  return category ? category.label : categoryId || '';
}

const HIHAT_ALIASES = ['hihat', 'hithat', 'hat', 'hh', 'hats'];
const HIHAT_OPEN_WORDS = ['open', 'oh', 'opn'];
const HIHAT_CLOSED_WORDS = ['closed', 'close', 'ch', 'cls'];

/**
 * Splits a file name into lowercase words, ignoring the extension, the
 * (manual) number prefix and any digits glued to words ("kick03" -> "kick").
 *
 * @param {string} fileName
 * @returns {string[]}
 */
export function getFileNameWords(fileName) {
  return fileName
    .replace(/\.[a-z0-9]{2,4}$/i, '')
    .replace(/^[\d\s._-]+[a-z]?(?=[\s._-])/i, '')
    .toLowerCase()
    .split(/[^a-z]+/)
    .filter(Boolean);
}

/**
 * @param {string} word
 * @param {string} alias
 */
function wordMatchesAlias(word, alias) {
  return word === alias || (alias.length >= 4 && word.startsWith(alias));
}

/**
 * @param {string} word
 * @param {string[]} aliases
 */
function wordMatchesAny(word, aliases) {
  return aliases.some((alias) => wordMatchesAlias(word, alias));
}

/**
 * Guesses the category of a sample based on its file name. The first word that
 * matches a category wins, since the category is usually named before any
 * variant or leftover info from the original sample pack.
 *
 * @param {string} fileName
 * @returns {string} category id
 */
export function getCategoryFromFileName(fileName) {
  const words = getFileNameWords(fileName);
  for (const word of words) {
    if (wordMatchesAny(word, HIHAT_ALIASES)) {
      // an explicit "closed" wins from e.g. an "OH" source tag, and a hihat
      // that's not marked as open is assumed to be closed
      const isClosed = words.some((w) => HIHAT_CLOSED_WORDS.includes(w));
      const isOpen = words.some((w) => HIHAT_OPEN_WORDS.includes(w));
      return isOpen && !isClosed ? 'hihat-open' : 'hihat-closed';
    }
    if (HIHAT_OPEN_WORDS.slice(1).includes(word)) {
      return 'hihat-open';
    }
    if (word === 'ch') {
      return 'hihat-closed';
    }
    const category = CATEGORIES.find(({ aliases }) =>
      wordMatchesAny(word, aliases)
    );
    if (category) {
      return category.id;
    }
  }
  return UNSORTED_CATEGORY_ID;
}

/**
 * Compares names the way a person would ("snare 2" before "snare 10").
 * @type {(a: string, b: string) => number}
 */
export const naturalCompare = new Intl.Collator(undefined, {
  numeric: true,
  sensitivity: 'base',
}).compare;

/**
 * The manually set category, or else the one guessed from the name (e.g. for
 * factory samples and samples added before categories existed).
 *
 * @param {{ metadata: { name: string; category?: string | null } }} sample
 * @returns {string}
 */
export function getSampleCategory({ metadata }) {
  return (
    (metadata.category && CATEGORIES_BY_ID.has(metadata.category)
      ? metadata.category
      : null) || getCategoryFromFileName(metadata.name)
  );
}

/** @type {Map<string, number>} */
const CATEGORY_ORDER = new Map(CATEGORIES.map((c, i) => [c.id, i]));

/**
 * Sorts by category (in factory layout order), then by name.
 *
 * @template {{ metadata: { name: string; category?: string | null } }} T
 * @param {T} a
 * @param {T} b
 */
export function sampleCategoryCompare(a, b) {
  return (
    /** @type {number} */ (CATEGORY_ORDER.get(getSampleCategory(a))) -
      /** @type {number} */ (CATEGORY_ORDER.get(getSampleCategory(b))) ||
    naturalCompare(a.metadata.name, b.metadata.name)
  );
}

/** @param {string} categoryId */
export function getCategoryOrder(categoryId) {
  const order = CATEGORY_ORDER.get(categoryId);
  return order === undefined ? CATEGORIES.length : order;
}

/** Colors to recognize categories at a glance in the set overview. */
const CATEGORY_COLORS = {
  kick: '#d62828',
  snare: '#f77f00',
  clap: '#fcbf49',
  'hihat-closed': '#2a9d8f',
  'hihat-open': '#57cc99',
  cymbal: '#4ea8de',
  rim: '#8d99ae',
  tom: '#9d4edd',
  perc: '#c77dff',
  bass: '#3a0ca3',
  stab: '#e76f51',
  melodic: '#e9c46a',
  vocal: '#ff70a6',
  fx: '#6c757d',
  [UNSORTED_CATEGORY_ID]: '#adb5bd',
};

/** @param {string} categoryId */
export function getCategoryColor(categoryId) {
  return (
    /** @type {Record<string, string>} */ (CATEGORY_COLORS)[categoryId] ||
    CATEGORY_COLORS[UNSORTED_CATEGORY_ID]
  );
}

/**
 * The name without the manual number prefix from the original sample folder
 * ("011-snare-Thunder Snare" -> "snare-Thunder Snare"). The full name is
 * still shown as a tooltip.
 *
 * @param {string} name
 */
export function getDisplayName(name) {
  const stripped = name.replace(/^[\d\s._-]+[a-z]?(?=[\s._-])[\s._-]*/i, '');
  return stripped || name;
}
