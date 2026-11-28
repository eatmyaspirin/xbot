import { logger } from '../logger.js';
import type { MediaItem } from '../types.js';
import { TtlCache } from './cache.js';

/** Telegram refuses to fetch inline video URLs above roughly 20 MB. */
export const MAX_INLINE_VIDEO_BYTES = 19 * 1024 * 1024;

const USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36';

const sizeCache = new TtlCache<number>({
  ttlMs: 30 * 60_000,
  maxEntries: 500,
});

const inflight = new Map<string, Promise<number | undefined>>();

export interface InlineVideoChoice {
  url: string;
  width: number;
  height: number;
}

function parseDimensions(url: string): { width: number; height: number } | null {
  const match = /\/(\d{2,5})x(\d{2,5})\//.exec(url);
  if (!match?.[1] || !match[2]) return null;

  const width = Number(match[1]);
  const height = Number(match[2]);
  return width > 0 && height > 0 ? { width, height } : null;
}

/**
 * Picks the first candidate in quality order whose known size fits the limit.
 * Candidates are expected to be ordered highest quality first.
 */
export function selectVariantBySize(
  candidates: readonly string[],
  sizes: ReadonlyMap<string, number>,
  limitBytes = MAX_INLINE_VIDEO_BYTES,
): string | undefined {
  for (const url of candidates) {
    const size = sizes.get(url);
    if (size !== undefined && size <= limitBytes) return url;
  }
  return undefined;
}

async function probeVariantBytes(url: string): Promise<number | undefined> {
  const cached = sizeCache.get(url);
  if (cached !== undefined) return cached;

  const pending = inflight.get(url);
  if (pending) return pending;

  const task = (async (): Promise<number | undefined> => {
    try {
      const response = await fetch(url, {
        method: 'HEAD',
        headers: {
          referer: 'https://x.com/',
          'user-agent': USER_AGENT,
        },
        redirect: 'follow',
        signal: AbortSignal.timeout(5_000),
      });

      if (!response.ok) return undefined;

      const length = Number(response.headers.get('content-length') ?? '0');
      if (!Number.isFinite(length) || length <= 0) return undefined;

      sizeCache.set(url, length);
      return length;
    } catch (error) {
      logger.debug('Inline video size probe failed', {
        url: url.slice(0, 120),
        error,
      });
      return undefined;
    } finally {
      inflight.delete(url);
    }
  })();

  inflight.set(url, task);
  return task;
}

/**
 * Probes all available MP4 variants and returns the highest-quality one that
 * Telegram can fetch. Falls back to the smallest variant when sizes are
 * unavailable.
 */
export async function pickInlineVideo(
  item: MediaItem,
): Promise<InlineVideoChoice> {
  const candidates = [...new Set([item.url, ...(item.variants ?? [])])];
  const sizes = new Map<string, number>();

  const probes = await Promise.all(
    candidates.map(async (url) => {
      return [url, await probeVariantBytes(url)] as const;
    }),
  );

  for (const [url, size] of probes) {
    if (size !== undefined) sizes.set(url, size);
  }

  const selected =
    selectVariantBySize(candidates, sizes) ??
    candidates[candidates.length - 1] ??
    item.url;
  const dimensions = parseDimensions(selected) ?? {
    width: item.width,
    height: item.height,
  };

  logger.debug('Selected inline video variant', {
    url: selected.slice(0, 120),
    bytes: sizes.get(selected),
    variants: candidates.length,
  });

  return {
    url: selected,
    width: dimensions.width,
    height: dimensions.height,
  };
}
