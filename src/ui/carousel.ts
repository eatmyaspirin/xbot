import { InlineKeyboard, InputFile } from 'grammy';
import type { InputMediaAnimation, InputMediaPhoto, InputMediaVideo } from 'grammy/types';

import type { DownloadedMedia } from '../services/media.js';
import type { Post } from '../types.js';
import { escapeHtml, escapeHtmlAttribute } from '../utils/html.js';

export type ViewMode = 'carousel' | 'grid' | 'album';
export type CallbackMode = ViewMode | 'download';

export const CALLBACK_PREFIX = 'xb';
export const LEGACY_PREFIX = 'car';
export const NOOP_CALLBACK = `${CALLBACK_PREFIX}:noop`;
export const LEGACY_NOOP_CALLBACK = `${LEGACY_PREFIX}:noop`;

const CAPTION_LIMIT = 1024;
const MAX_GRID_BUTTONS = 20;
const GRID_BUTTONS_PER_ROW = 5;

const MODE_CHARS: Record<CallbackMode, string> = {
  carousel: 'c',
  grid: 'g',
  album: 'a',
  download: 'd',
};

export interface CallbackAction {
  mode: CallbackMode;
  postId: string;
  index: number;
  showText: boolean;
}

export interface KeyboardOptions {
  inline?: boolean;
  showText?: boolean;
}

export interface CaptionOptions {
  view?: ViewMode;
  showText?: boolean;
}

export interface InputMediaOptions {
  file?: DownloadedMedia;
  showText?: boolean;
}

function modeFromChar(value: string | undefined): CallbackMode | null {
  if (value === 'c') return 'carousel';
  if (value === 'g') return 'grid';
  if (value === 'a') return 'album';
  if (value === 'd') return 'download';
  return null;
}

export function buildCallbackData(
  mode: CallbackMode,
  postId: string,
  index: number,
  showText = true,
): string {
  return `${CALLBACK_PREFIX}:${MODE_CHARS[mode]}:${postId}:${index}:${showText ? '1' : '0'}`;
}

export function parseCallbackData(data: string): CallbackAction | null {
  const parts = data.split(':');

  if (parts[0] === CALLBACK_PREFIX) {
    if (parts.length !== 5) return null;
    const mode = modeFromChar(parts[1]);
    const postId = parts[2];
    const indexPart = parts[3];
    const textPart = parts[4];
    if (!mode || !postId || !/^\d{1,25}$/.test(postId)) return null;
    if (indexPart === undefined || !/^\d{1,4}$/.test(indexPart)) return null;
    if (textPart !== '0' && textPart !== '1') return null;
    return { mode, postId, index: Number(indexPart), showText: textPart === '1' };
  }

  // Buttons from the first release used "car:<postId>:<index>".
  if (parts[0] === LEGACY_PREFIX) {
    if (parts.length !== 3) return null;
    const postId = parts[1];
    const indexPart = parts[2];
    if (!postId || !/^\d{1,25}$/.test(postId)) return null;
    if (indexPart === undefined || !/^\d{1,4}$/.test(indexPart)) return null;
    return { mode: 'carousel', postId, index: Number(indexPart), showText: true };
  }

  return null;
}

function buildFooter(url: string, index: number, total: number, view: ViewMode): string {
  const link = `<a href="${escapeHtmlAttribute(url)}">Open on X</a>`;
  if (view === 'carousel') return total > 1 ? `${link} · ${index + 1}/${total}` : link;
  return `${link} · ${view === 'grid' ? '🖼 Grid' : '📚 Album'} (${total})`;
}

/** Escape first, then truncate on a raw-text boundary so entities are never split. */
function truncateEscaped(text: string, limit: number): string {
  if (!text || limit <= 0) return '';
  if (escapeHtml(text).length <= limit) return escapeHtml(text);

  let low = 0;
  let high = text.length;
  while (low < high) {
    const mid = Math.ceil((low + high) / 2);
    if (escapeHtml(text.slice(0, mid)).length <= limit - 1) low = mid;
    else high = mid - 1;
  }

  const cut = text.slice(0, low).trimEnd();
  return cut ? `${escapeHtml(cut)}…` : '';
}

export function buildCaption(
  post: Post,
  index: number,
  options: CaptionOptions = {},
): string {
  const { view = 'carousel', showText = true } = options;
  if (!showText) return '';

  const author = escapeHtml(post.authorName.slice(0, 80));
  const handle = post.authorHandle
    ? ` (@${escapeHtml(post.authorHandle.slice(0, 20))})`
    : '';
  const header = `<b>${author}</b>${handle}`;
  const footer = buildFooter(post.url, index, post.media.length, view);
  const quoteLine = post.quoted
    ? `<i>Quoting ${
        post.quoted.authorHandle
          ? `@${escapeHtml(post.quoted.authorHandle.slice(0, 20))}`
          : escapeHtml(post.quoted.authorName.slice(0, 80))
      }</i>`
    : '';

  const fixed = `${header}\n\n${footer}`;
  const budget = Math.max(
    0,
    CAPTION_LIMIT - fixed.length - 2 - (quoteLine ? quoteLine.length + 2 : 0),
  );
  const bodyText = truncateEscaped(post.text.trim(), budget);
  const body = [bodyText, quoteLine].filter(Boolean).join('\n\n');

  return body ? `${header}\n\n${body}\n\n${footer}` : fixed;
}

function addLinkButtons(keyboard: InlineKeyboard, post: Post): void {
  keyboard.url('Open on X', post.url);
  if (post.quoted?.url) keyboard.url('Quoted post', post.quoted.url);
}

export function buildCarouselKeyboard(
  post: Post,
  index: number,
  options: KeyboardOptions = {},
): InlineKeyboard {
  const { inline = false, showText = true } = options;
  const keyboard = new InlineKeyboard();
  const total = post.media.length;

  if (total > 1) {
    const previous = (index - 1 + total) % total;
    const next = (index + 1) % total;
    keyboard
      .text('◀️', buildCallbackData('carousel', post.id, previous, showText))
      .text(`${index + 1} / ${total}`, NOOP_CALLBACK)
      .text('▶️', buildCallbackData('carousel', post.id, next, showText))
      .row();
  }

  if (total > 1) {
    if (post.mosaicUrl) {
      keyboard.text('🖼 Grid', buildCallbackData('grid', post.id, 0, showText));
    }
    if (!inline) {
      keyboard.text('📚 Album', buildCallbackData('album', post.id, 0, showText));
      keyboard.text(
        '⬇️ Download',
        buildCallbackData('download', post.id, 0, showText),
      );
    }
    if (post.mosaicUrl || !inline) keyboard.row();
  } else if (!inline) {
    keyboard
      .text('⬇️ Download', buildCallbackData('download', post.id, 0, showText))
      .row();
  }

  keyboard
    .text(
      showText ? '📝 Hide text' : '📝 Show text',
      buildCallbackData('carousel', post.id, index, !showText),
    )
    .row();

  addLinkButtons(keyboard, post);
  return keyboard;
}

export function buildGridKeyboard(
  post: Post,
  options: KeyboardOptions = {},
): InlineKeyboard {
  const { inline = false, showText = true } = options;
  const keyboard = new InlineKeyboard();
  const total = post.media.length;
  const shown = Math.min(total, MAX_GRID_BUTTONS);

  for (let index = 0; index < shown; index += 1) {
    keyboard.text(
      String(index + 1),
      buildCallbackData('carousel', post.id, index, showText),
    );
    if ((index + 1) % GRID_BUTTONS_PER_ROW === 0) keyboard.row();
  }
  if (shown % GRID_BUTTONS_PER_ROW !== 0) keyboard.row();

  keyboard.text('🎠 Carousel', buildCallbackData('carousel', post.id, 0, showText));
  if (!inline) {
    if (total > 1) {
      keyboard.text('📚 Album', buildCallbackData('album', post.id, 0, showText));
    }
    keyboard.text(
      '⬇️ Download',
      buildCallbackData('download', post.id, 0, showText),
    );
  }
  keyboard.row();

  keyboard
    .text(
      showText ? '📝 Hide text' : '📝 Show text',
      buildCallbackData('grid', post.id, 0, !showText),
    )
    .row();

  addLinkButtons(keyboard, post);
  return keyboard;
}

/** Version of a photo URL that is safe for inline results (JPEG, <= 5 MB in practice). */
export function inlinePhotoUrl(url: string): string {
  try {
    const parsed = new URL(url);
    if (parsed.hostname === 'pbs.twimg.com') {
      parsed.searchParams.set('name', 'large');
      parsed.searchParams.set('format', 'jpg');
    }
    return parsed.toString();
  } catch {
    return url;
  }
}

function mediaSource(url: string, file?: DownloadedMedia): InputFile | string {
  return file ? new InputFile(file.bytes, file.filename) : url;
}

export function toCarouselInputMedia(
  post: Post,
  index: number,
  options: InputMediaOptions = {},
): InputMediaPhoto | InputMediaVideo | InputMediaAnimation {
  const item = post.media[index];
  if (!item) throw new RangeError(`No media at index ${index}`);

  const caption = buildCaption(post, index, {
    view: 'carousel',
    showText: options.showText ?? true,
  });

  const common = {
    media: mediaSource(item.url, options.file),
    ...(caption ? { caption, parse_mode: 'HTML' as const } : {}),
    ...(post.sensitive ? { has_spoiler: true } : {}),
  };

  switch (item.kind) {
    case 'photo':
      return { type: 'photo', ...common };
    case 'animation':
      return { type: 'animation', ...common };
    default:
      return { type: 'video', ...common };
  }
}

export function toGridInputMedia(
  post: Post,
  options: InputMediaOptions = {},
): InputMediaPhoto {
  if (!post.mosaicUrl) throw new Error('Post has no grid image');

  const caption = buildCaption(post, 0, {
    view: 'grid',
    showText: options.showText ?? true,
  });

  return {
    type: 'photo',
    media: mediaSource(post.mosaicUrl, options.file),
    ...(caption ? { caption, parse_mode: 'HTML' as const } : {}),
    ...(post.sensitive ? { has_spoiler: true } : {}),
  };
}

/** Albums only accept photo/video; Twitter GIFs are MP4s, so they go in as videos. */
export function toAlbumInputMedia(
  post: Post,
  index: number,
  file: DownloadedMedia,
  caption = '',
): InputMediaPhoto | InputMediaVideo {
  const item = post.media[index];
  if (!item) throw new RangeError(`No media at index ${index}`);

  const common = {
    media: new InputFile(file.bytes, file.filename),
    ...(caption ? { caption, parse_mode: 'HTML' as const } : {}),
    ...(post.sensitive ? { has_spoiler: true } : {}),
  };

  if (item.kind === 'photo') {
    return { type: 'photo', ...common };
  }

  return {
    type: 'video',
    ...common,
    ...(item.width > 0 ? { width: item.width } : {}),
    ...(item.height > 0 ? { height: item.height } : {}),
    ...(item.duration ? { duration: Math.round(item.duration) } : {}),
    supports_streaming: true,
  };
}
