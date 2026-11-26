import type { MediaItem, Post, QuotedPost } from '../../types.js';
import { canonicalStatusUrl } from '../../utils/xurl.js';

export type PostErrorCode = 'not_found' | 'protected' | 'upstream' | 'invalid';

export class PostError extends Error {
  readonly code: PostErrorCode;

  constructor(message: string, code: PostErrorCode, options?: ErrorOptions) {
    super(message, options);
    this.name = 'PostError';
    this.code = code;
  }
}

interface FxFormat {
  url?: string;
  container?: string;
  bitrate?: number;
}

interface FxFormatsObject {
  jpeg?: string;
  webp?: string;
}

interface FxMedia {
  type?: string;
  url?: string;
  format?: string;
  width?: number;
  height?: number;
  altText?: string;
  duration?: number;
  thumbnail_url?: string | null;
  transcode_url?: string | null;
  formats?: FxFormat[] | FxFormatsObject;
}

export interface FxStatus {
  id?: string;
  url?: string;
  text?: string;
  created_at?: string;
  possibly_sensitive?: boolean;
  author?: {
    name?: string;
    screen_name?: string;
  };
  media?: {
    all?: FxMedia[];
    photos?: FxMedia[];
    videos?: FxMedia[];
    mosaic?: {
      formats?: {
        jpeg?: string;
        webp?: string;
      };
    };
  };
  quote?: FxStatus | null;
}

export interface FxResponse {
  code?: number;
  message?: string;
  status?: FxStatus;
  tweet?: FxStatus;
}

interface VxMedia {
  type?: string;
  url?: string;
  thumbnail_url?: string;
  altText?: string | null;
  duration?: number;
  size?: {
    width?: number;
    height?: number;
  };
}

export interface VxResponse {
  tweetID?: string;
  tweetURL?: string;
  text?: string;
  date?: string;
  date_epoch?: number;
  user_name?: string;
  user_screen_name?: string;
  possibly_sensitive?: boolean;
  media_extended?: VxMedia[];
  mediaURLs?: string[];
  combinedMediaUrl?: string | null;
}

function isMp4(url: string): boolean {
  return /\.mp4(?:[?#]|$)/i.test(url);
}

/** Ask Twitter's CDN for the original file instead of a resized thumbnail. */
export function originalPhotoUrl(url: string): string {
  try {
    const parsed = new URL(url);
    if (parsed.hostname !== 'pbs.twimg.com') return url;
    parsed.searchParams.set('name', 'orig');
    return parsed.toString();
  } catch {
    return url;
  }
}

/** Primary original URL plus a smaller CDN variant for photos over Telegram's limit. */
export function photoVariants(url: string): string[] {
  const original = originalPhotoUrl(url);
  const variants = [original];
  try {
    const parsed = new URL(original);
    if (parsed.hostname === 'pbs.twimg.com') {
      const large = new URL(original);
      large.searchParams.set('name', 'large');
      const largeUrl = large.toString();
      if (largeUrl !== original) variants.push(largeUrl);
    }
  } catch {
    // Keep the single candidate.
  }
  return variants;
}

function videoVariants(media: FxMedia): string[] {
  const urls: string[] = [];

  if (Array.isArray(media.formats)) {
    const mp4Formats = media.formats
      .filter((format) => format.container === 'mp4' && typeof format.url === 'string')
      .sort((a, b) => (b.bitrate ?? 0) - (a.bitrate ?? 0));
    for (const format of mp4Formats) {
      if (format.url) urls.push(format.url);
    }
  }

  if (media.url && (isMp4(media.url) || media.format?.includes('mp4'))) {
    urls.push(media.url);
  }
  if (media.transcode_url && isMp4(media.transcode_url)) {
    urls.push(media.transcode_url);
  }

  return [...new Set(urls)];
}

function normalizeFxMedia(media: FxMedia): MediaItem | null {
  const type = media.type;
  if (!type) return null;

  const width = media.width ?? 0;
  const height = media.height ?? 0;

  if (type === 'photo' || type === 'mosaic_photo') {
    const formats =
      !Array.isArray(media.formats) && media.formats ? media.formats : undefined;
    const primary = media.url ?? formats?.jpeg ?? formats?.webp;
    if (!primary) return null;

    const variants = photoVariants(primary);
    const url = variants[0];
    if (!url) return null;

    return {
      kind: 'photo',
      url,
      variants,
      width,
      height,
      alt: media.altText || undefined,
    };
  }

  if (type === 'video' || type === 'gif') {
    const variants = videoVariants(media);
    const url = variants[0];
    if (!url) return null;

    return {
      kind: type === 'gif' ? 'animation' : 'video',
      url,
      variants,
      thumbnailUrl: media.thumbnail_url ?? undefined,
      width,
      height,
      duration: media.duration,
    };
  }

  return null;
}

function toQuotedPost(status: FxStatus): QuotedPost | undefined {
  const id = status.id?.trim();
  const authorHandle = status.author?.screen_name?.trim() || null;
  const url =
    id && /^\d{1,25}$/.test(id)
      ? canonicalStatusUrl(id, authorHandle)
      : status.url?.trim();

  if (!url) return undefined;

  return {
    authorName: status.author?.name?.trim() || authorHandle || 'Unknown',
    authorHandle,
    url,
    text: (status.text ?? '').trim(),
  };
}

export function normalizeFxStatus(status: FxStatus | undefined, fallbackId: string): Post {
  const id = (status?.id ?? fallbackId).trim();
  if (!/^\d{1,25}$/.test(id)) {
    throw new PostError('X returned an invalid post id', 'invalid');
  }

  const authorHandle = status?.author?.screen_name?.trim() || null;
  const ownMedia = (status?.media?.all ?? [])
    .map(normalizeFxMedia)
    .filter((item): item is MediaItem => item !== null);

  // Quote posts often have no media of their own. Follow the quoted post so a
  // link to a quote still opens a gallery instead of "no media".
  const quotedStatus = status?.quote ?? null;
  const quotedMedia = (quotedStatus?.media?.all ?? [])
    .map(normalizeFxMedia)
    .filter((item): item is MediaItem => item !== null);
  const usingQuotedMedia = ownMedia.length === 0 && quotedMedia.length > 0;
  const media = usingQuotedMedia ? quotedMedia : ownMedia;
  const quoted =
    usingQuotedMedia && quotedStatus ? toQuotedPost(quotedStatus) : undefined;

  const ownMosaic =
    status?.media?.mosaic?.formats?.jpeg ??
    status?.media?.mosaic?.formats?.webp ??
    undefined;
  const quotedMosaic =
    quotedStatus?.media?.mosaic?.formats?.jpeg ??
    quotedStatus?.media?.mosaic?.formats?.webp ??
    undefined;
  const mosaicUrl = usingQuotedMedia ? quotedMosaic : ownMosaic;

  return {
    id,
    url: canonicalStatusUrl(id, authorHandle),
    authorName: status?.author?.name?.trim() || authorHandle || 'Unknown',
    authorHandle,
    text: (status?.text ?? '').trim(),
    createdAt: status?.created_at ?? null,
    sensitive: Boolean(status?.possibly_sensitive),
    media,
    mosaicUrl,
    quoted,
  };
}

function normalizeVxMedia(media: VxMedia): MediaItem | null {
  const type = media.type;
  if (!type || !media.url) return null;

  const width = media.size?.width ?? 0;
  const height = media.size?.height ?? 0;

  if (type === 'image' || type === 'photo') {
    const variants = photoVariants(media.url);
    const url = variants[0];
    if (!url) return null;
    return {
      kind: 'photo',
      url,
      variants,
      thumbnailUrl: media.thumbnail_url ?? undefined,
      width,
      height,
      alt: media.altText || undefined,
    };
  }

  if (type === 'video' || type === 'gif') {
    return {
      kind: type === 'gif' ? 'animation' : 'video',
      url: media.url,
      variants: [media.url],
      thumbnailUrl: media.thumbnail_url ?? undefined,
      width,
      height,
      duration: media.duration,
    };
  }

  return null;
}

export function normalizeVxStatus(raw: VxResponse, fallbackId: string): Post {
  const id = (raw.tweetID ?? fallbackId).trim();
  if (!/^\d{1,25}$/.test(id)) {
    throw new PostError('X returned an invalid post id', 'invalid');
  }

  const authorHandle = raw.user_screen_name?.trim() || null;
  const media = (raw.media_extended ?? [])
    .map(normalizeVxMedia)
    .filter((item): item is MediaItem => item !== null);

  if (media.length === 0 && raw.mediaURLs?.length) {
    for (const photoUrl of raw.mediaURLs) {
      const variants = photoVariants(photoUrl);
      const url = variants[0];
      if (!url) continue;
      media.push({ kind: 'photo', url, variants, width: 0, height: 0 });
    }
  }

  return {
    id,
    url: canonicalStatusUrl(id, authorHandle),
    authorName: raw.user_name?.trim() || authorHandle || 'Unknown',
    authorHandle,
    text: (raw.text ?? '').trim(),
    createdAt:
      typeof raw.date_epoch === 'number' && Number.isFinite(raw.date_epoch)
        ? new Date(raw.date_epoch * 1000).toISOString()
        : null,
    sensitive: Boolean(raw.possibly_sensitive),
    media,
    mosaicUrl:
      typeof raw.combinedMediaUrl === 'string' && raw.combinedMediaUrl
        ? raw.combinedMediaUrl
        : undefined,
  };
}
