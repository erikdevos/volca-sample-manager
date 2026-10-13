import JSZip from 'jszip';
import localforage from 'localforage';
import { v4 as uuidv4 } from 'uuid';

import {
  SampleContainer,
  isAudioSourceFileInStore,
  storeAudioSourceFile,
} from '../store.js';
import { SampleCache } from '../sampleCacheStore.js';
import { addPlugin, getPluginSource } from '../pluginStore.js';
import { loadVolcaSets, saveVolcaSet } from '../setStore.js';
import { loadDeviceState, saveDeviceState } from '../deviceStore.js';
import { getSourceHash } from './libraryImport.js';

/**
 * Everything this app keeps in the browser, in one zip:
 *
 *   backup.json      sample metadata, sets, volca state
 *   samples/...      the original audio files
 *   plugins/...      plugin sources, if any
 *
 * Factory samples are not included: they're part of the app.
 */

export const BACKUP_FORMAT = 'volca-sample-manager-backup';
export const BACKUP_VERSION = 1;
const JSON_NAME = 'backup.json';
const LAST_BACKUP_KEY = 'last_backup_at';

/**
 * @typedef {{
 *   format: typeof BACKUP_FORMAT;
 *   version: number;
 *   createdAt: string;
 *   samples: Record<string, import('../store').SampleMetadata>;
 *   files: Record<string, string>; // zip path by source file id
 *   sets: import('../setStore').VolcaSet[];
 *   activeSetId: string | null;
 *   device: import('./deviceDiff.js').DeviceState;
 * }} BackupManifest
 */

/** @param {string} name */
function safeFileName(name) {
  return name.replace(/[\\/:*?"<>|]+/g, '_').trim() || 'sample';
}

export function getLastBackupDate() {
  try {
    const value = localStorage.getItem(LAST_BACKUP_KEY);
    return value ? new Date(value) : null;
  } catch (err) {
    return null;
  }
}

/**
 * @param {{
 *   userSamples: SampleContainer[];
 *   activeSetId: string | null;
 *   onProgress: (progress: number) => void;
 * }} params
 * @returns {Promise<{ blob: Blob; fileName: string }>}
 */
export async function exportBackup({ userSamples, activeSetId, onProgress }) {
  const zip = new JSZip();
  /** @type {BackupManifest} */
  const manifest = {
    format: BACKUP_FORMAT,
    version: BACKUP_VERSION,
    createdAt: new Date().toISOString(),
    samples: {},
    files: {},
    sets: await loadVolcaSets(),
    activeSetId,
    device: await loadDeviceState(),
  };
  /** @type {Set<string>} */
  const pluginNames = new Set();
  for (let i = 0; i < userSamples.length; i++) {
    onProgress((i / userSamples.length) * 0.5);
    const { id, metadata } = userSamples[i];
    manifest.samples[id] = metadata;
    const { sourceFileId, userFileInfo, name } = metadata;
    // urls point to audio that's part of the app
    if (!sourceFileId.includes('.') && !manifest.files[sourceFileId]) {
      const data = await SampleContainer.getSourceFileData(sourceFileId, true);
      const ext = userFileInfo ? userFileInfo.ext : '.wav';
      const path = `samples/${safeFileName(
        metadata.originalName || name
      )} - ${sourceFileId}${ext}`;
      zip.file(path, data);
      manifest.files[sourceFileId] = path;
    }
    for (const { pluginName } of metadata.plugins) {
      pluginNames.add(pluginName);
    }
  }
  for (const pluginName of pluginNames) {
    const source = await getPluginSource(pluginName);
    if (source) zip.file(`plugins/${pluginName}`, source);
  }
  zip.file(JSON_NAME, JSON.stringify(manifest, null, 2));
  const blob = await zip.generateAsync(
    // audio hardly compresses, so don't spend time on it
    { type: 'blob', compression: 'DEFLATE', compressionOptions: { level: 1 } },
    ({ percent }) => onProgress(0.5 + percent / 200)
  );
  onProgress(1);
  try {
    localStorage.setItem(LAST_BACKUP_KEY, manifest.createdAt);
  } catch (err) {
    // only a convenience
  }
  const date = manifest.createdAt.slice(0, 10);
  return { blob, fileName: `volca-sample-manager-backup-${date}.zip` };
}

/**
 * @param {Blob} file
 * @returns {Promise<{ zip: JSZip; manifest: BackupManifest }>}
 */
export async function readBackup(file) {
  let zip;
  try {
    zip = await JSZip.loadAsync(file);
  } catch (err) {
    throw new Error('This is not a zip file.');
  }
  const handle = zip.file(JSON_NAME);
  if (!handle) {
    throw new Error('This zip is not a Volca Sample Manager backup.');
  }
  /** @type {BackupManifest} */
  const manifest = JSON.parse(await handle.async('text'));
  if (manifest.format !== BACKUP_FORMAT) {
    throw new Error('This zip is not a Volca Sample Manager backup.');
  }
  if (manifest.version > BACKUP_VERSION) {
    throw new Error(
      'This backup was made with a newer version of the app. Please reload the page and try again.'
    );
  }
  return { zip, manifest };
}

/**
 * @typedef {{
 *   added: number;
 *   skipped: number;
 *   failed: string[];
 *   setsAdded: number;
 *   setsSkipped: number;
 *   deviceRestored: boolean;
 * }} RestoreResult
 */

/**
 * Empties everything this app stores in the browser.
 */
async function clearAllData() {
  await Promise.all(
    [
      'audio_file_data',
      'sample_metadata',
      'sample_cached_info',
      'sample_fingerprints',
      'volca_sets',
      'volca_device',
    ].map((name) =>
      localforage
        .createInstance({ name, driver: localforage.INDEXEDDB })
        .clear()
    )
  );
}

/**
 * Puts a backup into the browser.
 *
 * - `merge`: keeps everything that's there. Samples that are already in the
 *   collection (same audio) are skipped, and sets from the backup are added.
 * - `replace`: first erases everything in this app, then restores.
 *
 * The page should be reloaded afterwards.
 *
 * @param {{
 *   zip: JSZip;
 *   manifest: BackupManifest;
 *   mode: 'merge' | 'replace';
 *   userSamples: SampleContainer[];
 *   factorySampleIds: Set<string>;
 *   onProgress: (progress: number) => void;
 * }} params
 * @returns {Promise<RestoreResult>}
 */
export async function restoreBackup({
  zip,
  manifest,
  mode,
  userSamples,
  factorySampleIds,
  onProgress,
}) {
  if (mode === 'replace') {
    await clearAllData();
  }
  const existing = mode === 'replace' ? [] : userSamples;
  const existingIds = new Set(existing.map((s) => s.id));
  /** @type {Map<string, string>} */
  const idByHash = new Map();
  for (const sample of existing) {
    let hash = sample.metadata.sourceHash;
    if (!hash && !sample.metadata.sourceFileId.includes('.')) {
      // imported before we kept hashes
      try {
        hash = await getSourceHash(
          await SampleContainer.getSourceFileData(
            sample.metadata.sourceFileId,
            true
          )
        );
      } catch (err) {
        console.warn(err);
      }
    }
    if (hash) idByHash.set(hash, sample.id);
  }

  /** @type {RestoreResult} */
  const result = {
    added: 0,
    skipped: 0,
    failed: [],
    setsAdded: 0,
    setsSkipped: 0,
    deviceRestored: false,
  };
  // backup sample id -> id in this browser
  /** @type {Map<string, string>} */
  const idMap = new Map();
  /** @type {Set<string>} */
  const restoredPlugins = new Set();

  const entries = Object.entries(manifest.samples);
  for (let i = 0; i < entries.length; i++) {
    onProgress(i / entries.length);
    const [id, metadata] = entries[i];
    try {
      if (existingIds.has(id)) {
        idMap.set(id, id);
        result.skipped++;
        continue;
      }
      const { sourceFileId } = metadata;
      /** @type {Uint8Array | null} */
      let data = null;
      if (!sourceFileId.includes('.')) {
        const path = manifest.files[sourceFileId];
        const handle = path ? zip.file(path) : null;
        if (!handle) throw new Error('Audio file missing in backup');
        data = await handle.async('uint8array');
      }
      const sourceHash =
        metadata.sourceHash || (data ? await getSourceHash(data) : null);
      const sameAudio = sourceHash ? idByHash.get(sourceHash) : undefined;
      if (sameAudio) {
        // already in the collection (maybe imported again from the folder)
        idMap.set(id, sameAudio);
        result.skipped++;
        continue;
      }
      if (data && !(await isAudioSourceFileInStore(sourceFileId))) {
        await storeAudioSourceFile(data, sourceFileId);
      }
      for (const { pluginName } of metadata.plugins || []) {
        const handle = zip.file(`plugins/${pluginName}`);
        if (handle && !restoredPlugins.has(pluginName)) {
          restoredPlugins.add(pluginName);
          await addPlugin({
            pluginName,
            pluginSource: await handle.async('string'),
            onConfirmName: async (name) => name,
            onConfirmReplace: async () => 'use-existing',
          });
        }
      }
      const sampleContainer = await SampleContainer.importToStorage(id, {
        ...metadata,
        sourceHash,
      });
      await SampleCache.importToStorage(sampleContainer);
      idMap.set(id, id);
      if (sourceHash) idByHash.set(sourceHash, id);
      result.added++;
    } catch (err) {
      console.error(err);
      result.failed.push(metadata.name);
    }
  }

  // sets: refer to the samples as they are in this browser now
  /** @param {(string | null)[]} ids */
  const mapIds = (ids) =>
    ids.map((id) =>
      id === null
        ? null
        : idMap.get(id) || (factorySampleIds.has(id) ? id : null)
    );
  const currentSets = mode === 'replace' ? [] : await loadVolcaSets();
  for (const set of manifest.sets) {
    const sampleIds = mapIds(set.sampleIds);
    const same = currentSets.find(
      (s) =>
        s.name === set.name &&
        JSON.stringify(s.sampleIds) === JSON.stringify(sampleIds)
    );
    if (same) {
      result.setsSkipped++;
      continue;
    }
    const taken =
      currentSets.some((s) => s.id === set.id) ||
      currentSets.some((s) => s.name === set.name);
    await saveVolcaSet({
      ...set,
      id: taken ? uuidv4() : set.id,
      name: taken ? `${set.name} (restored)` : set.name,
      sampleIds,
    });
    result.setsAdded++;
  }

  if (mode === 'replace' && manifest.activeSetId) {
    try {
      localStorage.setItem('active_volca_set_id', manifest.activeSetId);
    } catch (err) {
      // only a convenience
    }
  }

  // the volca state: only if this browser doesn't know it yet
  const device = await loadDeviceState();
  if (
    manifest.device &&
    device.slots.every((slot) => slot === 'unknown') &&
    manifest.device.slots.some((slot) => slot !== 'unknown')
  ) {
    await saveDeviceState({
      ...manifest.device,
      slots: manifest.device.slots.map((slot) =>
        slot && slot !== 'unknown'
          ? { ...slot, sampleId: idMap.get(slot.sampleId) || slot.sampleId }
          : slot
      ),
    });
    result.deviceRestored = true;
  }

  onProgress(1);
  return result;
}
