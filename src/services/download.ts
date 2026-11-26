import { createWriteStream } from 'node:fs';
import {
  mkdir,
  mkdtemp,
  readdir,
  rm,
  stat,
  writeFile,
} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { ZipArchive } from 'archiver';

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
}

export function defaultDownloadRoot(): string {
  return path.join(os.tmpdir(), DOWNLOAD_ROOT_NAME);
}

function extensionOf(filename: string): string {
  const ext = path.extname(filename).toLowerCase();
  return /^\.[a-z0-9]{1,6}$/.test(ext) ? ext : '.bin';
}

function safeId(value: string): string {
  return value.replace(/[^0-9A-Za-z_-]/g, '').slice(0, 40) || 'media';
}

async function createZip(entries: ZipEntry[], zipPath: string): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const output = createWriteStream(zipPath, { mode: 0o600 });
    const archive = new ZipArchive({ zlib: { level: 1 } });

    output.on('close', () => resolve());
    output.on('error', reject);
    archive.on('warning', (error: NodeJS.ErrnoException) => {
      if (error.code !== 'ENOENT') reject(error);
    });
    archive.on('error', reject);

    archive.pipe(output);
    for (const entry of entries) {
      archive.file(entry.path, { name: entry.name });
    }
    void archive.finalize();
  });
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

      const name = `${String(index + 1).padStart(2, '0')}-${item.kind}${extensionOf(media.filename)}`;
      const filePath = path.join(dir, name);
      await writeFile(filePath, media.bytes, { mode: 0o600 });
      entries.push({ path: filePath, name, size: media.bytes.byteLength });
      bytes += media.bytes.byteLength;
    }

    const single = entries.length === 1 ? entries[0] : undefined;
    if (single) {
      return {
        dir,
        filePath: single.path,
        fileName: `xbot-${safeId(post.id)}-${single.name}`,
        fileCount: 1,
        totalCount: post.media.length,
        bytes: single.size,
        isZip: false,
      };
    }

    if (entries.length === 0) {
      throw new Error('No media could be prepared for download');
    }

    const zipPath = path.join(dir, `xbot-${safeId(post.id)}.zip`);
    await createZip(entries, zipPath);

    const info = await stat(zipPath);
    if (info.size > config.maxDownloadBytes) {
      throw new Error('ZIP exceeds the download size limit');
    }

    return {
      dir,
      filePath: zipPath,
      fileName: `xbot-${safeId(post.id)}.zip`,
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
