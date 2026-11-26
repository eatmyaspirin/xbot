import { mkdir, mkdtemp, readdir, rm, stat, utimes } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../src/config.js', () => ({
  config: { maxDownloadBytes: 10_000 },
}));

vi.mock('../src/services/media.js', () => ({
  downloadMedia: vi.fn(),
}));

import type { DownloadedMedia } from '../src/services/media.js';
import { downloadMedia } from '../src/services/media.js';
import {
  buildDownloadPackage,
  cleanupDownloadDir,
  cleanupStaleDownloads,
} from '../src/services/download.js';
import type { MediaItem, Post } from '../src/types.js';
import { buildDownloadCaption } from '../src/ui/download.js';

const mockedDownload = vi.mocked(downloadMedia);

let root: string;

function photo(index: number): MediaItem {
  return {
    kind: 'photo',
    url: `https://pbs.twimg.com/media/${index}.jpg?name=orig`,
    width: 100,
    height: 100,
  };
}

const post: Post = {
  id: '1234567890',
  url: 'https://x.com/user/status/1234567890',
  authorName: 'User',
  authorHandle: 'user',
  text: 'Hello',
  createdAt: null,
  sensitive: false,
  media: [photo(1), photo(2)],
};

function media(bytes: string, filename = 'xbot-photo.jpg'): DownloadedMedia {
  return {
    bytes: Buffer.from(bytes),
    contentType: 'image/jpeg',
    filename,
  };
}

beforeEach(async () => {
  root = await mkdtemp(path.join(os.tmpdir(), 'xbot-dl-test-'));
  mockedDownload.mockReset();
});

afterEach(async () => {
  mockedDownload.mockReset();
  await rm(root, { recursive: true, force: true });
});

describe('buildDownloadPackage', () => {
  it('zips multiple media files and cleans up the temp directory', async () => {
    mockedDownload
      .mockResolvedValueOnce(media('AAA'))
      .mockResolvedValueOnce(media('BBB'));

    const download = await buildDownloadPackage(post, { rootDir: root });

    expect(download.isZip).toBe(true);
    expect(download.fileName).toBe('xbot-1234567890.zip');
    expect(download.fileCount).toBe(2);
    expect(download.totalCount).toBe(2);
    expect((await stat(download.filePath)).size).toBeGreaterThan(0);
    expect(await readdir(download.dir)).toContain('xbot-1234567890.zip');

    await cleanupDownloadDir(download.dir);
    expect(await readdir(root)).toEqual([]);
  });

  it('sends a single media item without zipping it', async () => {
    mockedDownload.mockResolvedValueOnce(media('AAA'));

    const download = await buildDownloadPackage(
      { ...post, media: [photo(1)] },
      { rootDir: root },
    );

    expect(download.isZip).toBe(false);
    expect(download.fileName).toBe('xbot-1234567890-01-photo.jpg');
    expect(download.fileCount).toBe(1);
    expect(download.totalCount).toBe(1);

    await cleanupDownloadDir(download.dir);
    expect(await readdir(root)).toEqual([]);
  });

  it('stops at the download size budget', async () => {
    mockedDownload
      .mockResolvedValueOnce(media('A'.repeat(6_000)))
      .mockResolvedValueOnce(media('B'.repeat(6_000)));

    const download = await buildDownloadPackage(post, { rootDir: root });

    expect(download.isZip).toBe(false);
    expect(download.fileCount).toBe(1);
    expect(download.totalCount).toBe(2);

    await cleanupDownloadDir(download.dir);
  });

  it('removes its temp directory when nothing can be downloaded', async () => {
    mockedDownload.mockRejectedValue(new Error('offline'));

    await expect(buildDownloadPackage(post, { rootDir: root })).rejects.toThrow(
      'No media could be prepared',
    );

    expect(await readdir(root)).toEqual([]);
  });
});

describe('cleanupStaleDownloads', () => {
  it('removes old request directories and keeps current ones', async () => {
    const oldDir = path.join(root, 'req-old');
    const newDir = path.join(root, 'req-new');
    await mkdir(oldDir);
    await mkdir(newDir);

    const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000);
    await utimes(oldDir, twoHoursAgo, twoHoursAgo);

    const removed = await cleanupStaleDownloads(60 * 60 * 1000, root);
    const remaining = await readdir(root);

    expect(removed).toBe(1);
    expect(remaining).toEqual(['req-new']);
  });
});

describe('buildDownloadCaption', () => {
  it('labels ZIPs and partial downloads', () => {
    expect(
      buildDownloadCaption(post, { isZip: true, fileCount: 2, totalCount: 2 }),
    ).toContain('ZIP · 2 media items');

    expect(
      buildDownloadCaption(post, { isZip: true, fileCount: 1, totalCount: 2 }),
    ).toContain('ZIP · 1 of 2 media items');

    expect(
      buildDownloadCaption(post, { isZip: false, fileCount: 1, totalCount: 1 }),
    ).toContain('Download');
  });
});
