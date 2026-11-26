import {
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rm,
  stat,
  writeFile,
} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { zip } from 'fflate';

import { config } from '../config.js';
import { logger } from '../logger.js';
import type { Post } from '../types.js';
import { downloadMedia } from './media.js';

export const DOWNLOAD_ROOT_NAME = 'xbot-downloads';

const REQUEST_PREFIX = 'req-';

export interface DownloadPackage {
  dir: string;
  filePath: string;
  fileName: string;
  fileCount: number;
  totalCount: number;
  bytes: number;
  isZip: boolean;
}

interface ZipEntry {
  path: string;
  name: string;
  size: number;
  extension: string;
}

const MAX_BASE_LENGTH = 50;
const MAX_HANDLE_LENGTH = 15;
const MAX_TEXT_LENGTH = 38;
const RESERVED_NAME = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])$/i;

export function defaultDownloadRoot(): string {
  return path.join(os.tmpdir(), DOWNLOAD_ROOT_NAME);
}

function extensionOf(filename: string): string {
  const ext = path.extname(filename).toLowerCase();
  return /^\.[a-z0-9]{1,6}$/.test(ext) ? ext : '.bin';
}

function slugify(value: string): string {
  return value
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/https?:\/\/\S+/gi, ' ')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, '-')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function truncateSlug(value: string, maxLength: number): string {
  const characters = Array.from(value);
  if (characters.length <= maxLength) return value;

  const cut = characters.slice(0, maxLength).join('');
  const lastDash = cut.lastIndexOf('-');
  const trimmed =
    lastDash >= Math.floor(maxLength * 0.6) ? cut.slice(0, lastDash) : cut;

  return trimmed.replace(/-+$/g, '');
}

/**
 * Builds a readable filename from the author handle and post text, for
 * example "spacex-teams-encapsulated-the-cygnus". URLs and emoji are removed.
 */
export function downloadBaseName(post: Post): string {
  const handle = truncateSlug(slugify(post.authorHandle ?? ''), MAX_HANDLE_LENGTH);
  const text = truncateSlug(slugify(post.text), MAX_TEXT_LENGTH);

  let base = [handle, text].filter(Boolean).join('-');

  if (!base) {
    base = `x-post-${post.id}`;
  } else if (!text || base.length < 3) {
    base = `${base}-post-${post.id}`;
  }

  base = truncateSlug(base, MAX_BASE_LENGTH).replace(/-+$/g, '');
  if (!base) base = `x-post-${post.id}`;
  if (RESERVED_NAME.test(base)) base = `post-${base}`;

  return base;
}

async function createZip(entries: ZipEntry[], zipPath: string): Promise<void> {
  const files: Record<string, Uint8Array> = {};
  for (const entry of entries) {
    files[entry.name] = await readFile(entry.path);
  }

  const archive = await new Promise<Uint8Array>((resolve, reject) => {
    zip(files, { level: 1 }, (error, data) => {
      if (error) reject(error);
      else resolve(data);
    });
  });

  await writeFile(zipPath, archive, { mode: 0o600 });
}

export async function cleanupDownloadDir(dir: string): Promise<void> {
  await rm(dir, { recursive: true, force: true });
}

/**
 * Downloads a post's media into a request-specific temp directory. Multiple
 * files are zipped; a single file is returned directly. The caller owns the
 * directory and must call cleanupDownloadDir in a finally block.
 */
export async function buildDownloadPackage(
  post: Post,
  options: { rootDir?: string } = {},
): Promise<DownloadPackage> {
  const root = options.rootDir ?? defaultDownloadRoot();
  await mkdir(root, { recursive: true, mode: 0o700 });
  const dir = await mkdtemp(path.join(root, REQUEST_PREFIX));
  const baseName = downloadBaseName(post);

  try {
    const entries: ZipEntry[] = [];
    let bytes = 0;

    for (let index = 0; index < post.media.length; index += 1) {
      const item = post.media[index];
      if (!item) continue;

      let media;
      try {
        media = await downloadMedia(item);
      } catch (error) {
        logger.warn('Skipping media for download', {
          postId: post.id,
          index,
          error,
        });
        continue;
      }

      if (bytes + media.bytes.byteLength > config.maxDownloadBytes) {
        logger.warn('Download size limit reached', {
          postId: post.id,
          index,
          bytesSoFar: bytes,
          nextBytes: media.bytes.byteLength,
        });
        continue;
      }

      const extension = extensionOf(media.filename);
      const name = `${baseName}-${String(index + 1).padStart(2, '0')}-${item.kind}${extension}`;
      const filePath = path.join(dir, name);
      await writeFile(filePath, media.bytes, { mode: 0o600 });
      entries.push({
        path: filePath,
        name,
        size: media.bytes.byteLength,
        extension,
      });
      bytes += media.bytes.byteLength;
    }

    const single = entries.length === 1 ? entries[0] : undefined;
    if (single) {
      return {
        dir,
        filePath: single.path,
        fileName:
          post.media.length === 1
            ? `${baseName}${single.extension}`
            : single.name,
        fileCount: 1,
        totalCount: post.media.length,
        bytes: single.size,
        isZip: false,
      };
    }

    if (entries.length === 0) {
      throw new Error('No media could be prepared for download');
    }

    const zipPath = path.join(dir, `${baseName}.zip`);
    await createZip(entries, zipPath);

    const info = await stat(zipPath);
    if (info.size > config.maxDownloadBytes) {
      throw new Error('ZIP exceeds the download size limit');
    }

    return {
      dir,
      filePath: zipPath,
      fileName: `${baseName}.zip`,
      fileCount: entries.length,
      totalCount: post.media.length,
      bytes: info.size,
      isZip: true,
    };
  } catch (error) {
    await cleanupDownloadDir(dir).catch(() => {});
    throw error;
  }
}

/** Removes request directories left behind by a crash or forced restart. */
export async function cleanupStaleDownloads(
  maxAgeMs = 6 * 60 * 60 * 1000,
  rootDir = defaultDownloadRoot(),
): Promise<number> {
  let entries: string[];
  try {
    entries = await readdir(rootDir);
  } catch {
    return 0;
  }

  const cutoff = Date.now() - maxAgeMs;
  let removed = 0;

  for (const name of entries) {
    if (!name.startsWith(REQUEST_PREFIX)) continue;
    const dir = path.join(rootDir, name);
    try {
      const info = await stat(dir);
      if (info.isDirectory() && info.mtimeMs < cutoff) {
        await rm(dir, { recursive: true, force: true });
        removed += 1;
      }
    } catch {
      // The directory may have been cleaned up concurrently.
    }
  }

  return removed;
}
