import { SampleContainer, storeAudioSourceFile } from '../store.js';
import { SampleCache } from '../sampleCacheStore.js';
import { getAudioBufferForAudioFileData } from './audioData.js';
import { getSamplePeaksForAudioBuffer } from './waveform.js';
import { getCategoryFromFileName } from './categories.js';

const AUDIO_FILE_PATTERN = /\.(wav|aiff?|mp3|ogg|flac|m4a)$/i;

/** @param {File} file */
export function isImportableAudioFile(file) {
  return !file.name.startsWith('.') && AUDIO_FILE_PATTERN.test(file.name);
}

/**
 * SHA-256 of the file bytes, used to recognize files that are already in the
 * library when a folder is imported again.
 *
 * @param {Uint8Array} data
 */
export async function getSourceHash(data) {
  const digest = await crypto.subtle.digest('SHA-256', data);
  return [...new Uint8Array(digest)]
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

/**
 * Asks the browser to not evict our IndexedDB data when storage runs low, so
 * the library survives between sessions. Browsers may silently say no.
 */
export async function requestPersistentStorage() {
  try {
    if (navigator.storage && navigator.storage.persist) {
      if (await navigator.storage.persisted()) return true;
      return await navigator.storage.persist();
    }
  } catch (err) {
    console.warn('Could not request persistent storage', err);
  }
  return false;
}

/**
 * @typedef {{
 *   samples: SampleContainer[];
 *   sampleCaches: SampleCache[];
 *   skippedKnown: string[];
 *   skippedSilent: string[];
 *   failed: string[];
 * }} LibraryImportResult
 */

/**
 * Imports audio files into the library, guessing each sample's category from
 * its file name. Files whose content is already in the library are skipped,
 * so their existing category and other settings are kept.
 *
 * @param {File[]} files
 * @param {Set<string>} knownSourceHashes
 * @param {(progress: number) => void} onProgress
 * @returns {Promise<LibraryImportResult>}
 */
export async function importFilesToLibrary(
  files,
  knownSourceHashes,
  onProgress
) {
  /** @type {LibraryImportResult} */
  const result = {
    samples: [],
    sampleCaches: [],
    skippedKnown: [],
    skippedSilent: [],
    failed: [],
  };
  const hashes = new Set(knownSourceHashes);
  const audioFiles = files.filter(isImportableAudioFile);
  for (let i = 0; i < audioFiles.length; i++) {
    const file = audioFiles[i];
    onProgress(i / audioFiles.length);
    try {
      const data = new Uint8Array(await file.arrayBuffer());
      const sourceHash = await getSourceHash(data);
      if (hashes.has(sourceHash)) {
        result.skippedKnown.push(file.name);
        continue;
      }
      const audioBuffer = await getAudioBufferForAudioFileData(data);
      /** @type {[number, number]} */
      const trimFrames = [0, 0];
      const waveformPeaks = await getSamplePeaksForAudioBuffer(
        audioBuffer,
        trimFrames
      );
      if (
        [...waveformPeaks.positive, ...waveformPeaks.negative].every(
          (peak) => peak === 0
        )
      ) {
        result.skippedSilent.push(file.name);
        continue;
      }
      const sourceFileId = await storeAudioSourceFile(data);
      const lastDotIndex = file.name.lastIndexOf('.');
      const sample = new SampleContainer.Mutable({
        name: file.name.slice(0, lastDotIndex),
        sourceFileId,
        trim: { frames: trimFrames },
        userFileInfo: {
          type: file.type,
          ext: file.name.slice(lastDotIndex),
        },
        category: getCategoryFromFileName(file.name),
        sourceHash,
        originalName: file.name.slice(0, lastDotIndex),
      });
      await sample.persist();
      const sampleCache = new SampleCache.Mutable({
        sampleContainer: sample,
        cachedInfo: {
          waveformPeaks,
          postPluginFrameCount: audioBuffer.length,
          duration: audioBuffer.duration,
          failedPluginIndex: -1,
        },
      });
      await sampleCache.persist();
      hashes.add(sourceHash);
      result.samples.push(sample);
      result.sampleCaches.push(sampleCache);
    } catch (err) {
      console.error(`Failed to import ${file.name}`, err);
      result.failed.push(file.name);
    }
  }
  onProgress(1);
  return result;
}
