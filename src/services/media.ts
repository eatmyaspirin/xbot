import { config } from '../config.js';
import type { MediaItem } from '../types.js';
import { TtlCache } from './cache.js';

const MB = 1024 * 1024;

export class MediaTooLargeError extends Error {
  readonly limitBytes: number;

  constructor(limitBytes: number) {
    super(`Media is larger than Telegram's ${Math.round(limitBytes / MB)} MB upload limit.`);
    this.name = 'MediaTooLargeError';
    this.limitBytes = limitBytes;
  }
}

export class MediaDownloadError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = 'MediaDownloadError';
  }
}

export interface DownloadedMedia {
  bytes: Buffer;
  contentType: string;
  filename: string;
}

const mediaCache = new TtlCache<DownloadedMedia>({
  ttlMs: config.cacheTtlMs,
  maxEntries: 100,
  maxBytes: config.mediaCacheBytes,
  sizeOf: (media) => media.bytes.byteLength,
});

const inflight = new Map<string, Promise<DownloadedMedia>>();

function extensionFor(kind: MediaItem['kind'], contentType: string): string {
  if (kind !== 'photo') return 'mp4';
  if (contentType.includes('png')) return 'png';
  if (contentType.includes('webp')) return 'webp';
  return 'jpg';
}

async function downloadOnce(
  url: string,
  item: MediaItem,
  limitBytes: number,
): Promise<DownloadedMedia> {
  let response: Response;

  try {
    response = await fetch(url, {
      headers: {
        accept: 'image/*,video/*;q=0.9,*/*;q=0.8',
        referer: 'https://x.com/',
        'user-agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36',
      },
      redirect: 'follow',
      signal: AbortSignal.timeout(config.requestTimeoutMs),
    });
  } catch (error) {
    throw new MediaDownloadError('Could not reach X media servers', { cause: error });
  }

  if (!response.ok) {
    void response.body?.cancel().catch(() => {});
    throw new MediaDownloadError(`X media responded with HTTP ${response.status}`);
  }

  const declaredLength = Number(response.headers.get('content-length') ?? '0');
  if (Number.isFinite(declaredLength) && declaredLength > limitBytes) {
    void response.body?.cancel().catch(() => {});
    throw new MediaTooLargeError(limitBytes);
  }

  let bytes: Buffer;
  try {
    bytes = Buffer.from(await response.arrayBuffer());
  } catch (error) {
    throw new MediaDownloadError('Failed to read media from X', { cause: error });
  }

  if (bytes.byteLength === 0) {
    throw new MediaDownloadError('X returned an empty file');
  }
  if (bytes.byteLength > limitBytes) {
    throw new MediaTooLargeError(limitBytes);
  }

  const contentType =
    response.headers.get('content-type')?.split(';')[0]?.trim() ||
    (item.kind === 'photo' ? 'image/jpeg' : 'video/mp4');

  return {
    bytes,
    contentType,
    filename: `xbot-${item.kind}.${extensionFor(item.kind, contentType)}`,
  };
}

/**
 * Downloads media with a size cap, falling back to smaller variants when the
 * original exceeds Telegram's limit. Results are cached in memory by URL.
 */
export async function downloadMedia(item: MediaItem): Promise<DownloadedMedia> {
  const limitBytes = item.kind === 'photo' ? config.maxPhotoBytes : config.maxVideoBytes;
  const cacheKey = item.url;

  const cached = mediaCache.get(cacheKey);
  if (cached) return cached;

  const pending = inflight.get(cacheKey);
  if (pending) return pending;

  const candidates = [...new Set([item.url, ...(item.variants ?? [])])];

  const task = (async (): Promise<DownloadedMedia> => {
    let lastError: unknown;
    let sawTooLarge = false;

    for (const url of candidates) {
      try {
        return await downloadOnce(url, item, limitBytes);
      } catch (error) {
        lastError = error;
        if (error instanceof MediaTooLargeError) sawTooLarge = true;
      }
    }

    if (sawTooLarge) throw new MediaTooLargeError(limitBytes);
    if (lastError instanceof Error) throw lastError;
    throw new MediaDownloadError('Could not download media from X');
  })()
    .then((media) => {
      mediaCache.set(cacheKey, media);
      return media;
    })
    .finally(() => {
      inflight.delete(cacheKey);
    });

  inflight.set(cacheKey, task);
  return task;
}

/** Downloads a single image (for example a provider-rendered mosaic). */
export function downloadPhotoUrl(url: string): Promise<DownloadedMedia> {
  return downloadMedia({ kind: 'photo', url, width: 0, height: 0 });
}

export function clearMediaCache(): void {
  mediaCache.clear();
}
