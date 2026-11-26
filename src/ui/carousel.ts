import { InlineKeyboard, InputFile } from 'grammy';
import type { InputMediaAnimation, InputMediaPhoto, InputMediaVideo } from 'grammy/types';

import type { Post } from '../types.js';
import type { DownloadedMedia } from '../services/media.js';
import { escapeHtml, escapeHtmlAttribute } from '../utils/html.js';

export const CALLBACK_PREFIX = 'car';
export const NOOP_CALLBACK = `${CALLBACK_PREFIX}:noop`;

const CAPTION_LIMIT = 1024;

export function buildCallbackData(postId: string, index: number): string {
  return `${CALLBACK_PREFIX}:${postId}:${index}`;
}

export function parseCallbackData(data: string): { postId: string; index: number } | null {
  const [prefix, postId, indexPart, ...rest] = data.split(':');
  if (prefix !== CALLBACK_PREFIX || rest.length > 0) return null;
  if (!postId || !/^\d{1,25}$/.test(postId)) return null;
  if (indexPart === undefined || !/^\d{1,4}$/.test(indexPart)) return null;
  return { postId, index: Number(indexPart) };
}

function buildFooter(url: string, index: number, total: number): string {
  const link = `<a href="${escapeHtmlAttribute(url)}">Open on X</a>`;
  return total > 1 ? `${link} · ${index + 1}/${total}` : link;
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

export function buildCaption(post: Post, index: number, total = post.media.length): string {
  const author = escapeHtml(post.authorName.slice(0, 80));
  const handle = post.authorHandle
    ? ` (@${escapeHtml(post.authorHandle.slice(0, 20))})`
    : '';
  const header = `<b>${author}</b>${handle}`;
  const footer = buildFooter(post.url, index, total);
  const fixed = `${header}\n\n${footer}`;
  const budget = Math.max(0, CAPTION_LIMIT - fixed.length - 2);
  const body = truncateEscaped(post.text.trim(), budget);

  return body ? `${header}\n\n${body}\n\n${footer}` : fixed;
}

export function buildKeyboard(post: Post, index: number): InlineKeyboard {
  const keyboard = new InlineKeyboard();
  const total = post.media.length;

  if (total > 1) {
    const previous = (index - 1 + total) % total;
    const next = (index + 1) % total;
    keyboard
      .text('◀️', buildCallbackData(post.id, previous))
      .text(`${index + 1} / ${total}`, NOOP_CALLBACK)
      .text('▶️', buildCallbackData(post.id, next))
      .row();
  }

  keyboard.url('Open on X', post.url);
  return keyboard;
}

export function toInputMedia(
  post: Post,
  index: number,
  file: DownloadedMedia,
): InputMediaPhoto | InputMediaVideo | InputMediaAnimation {
  const item = post.media[index];
  if (!item) throw new RangeError(`No media at index ${index}`);

  const common = {
    media: new InputFile(file.bytes, file.filename),
    caption: buildCaption(post, index),
    parse_mode: 'HTML' as const,
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
