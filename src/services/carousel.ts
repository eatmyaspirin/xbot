import { InputFile, type Context } from 'grammy';

import { config } from '../config.js';
import { logger } from '../logger.js';
import type { DownloadedMedia } from './media.js';
import type { Post } from '../types.js';
import { replyToMessage } from '../utils/telegram.js';
import { downloadMedia, downloadPhotoUrl } from './media.js';
import {
  buildCaption,
  buildCarouselKeyboard,
  buildGridKeyboard,
  toAlbumInputMedia,
  toCarouselInputMedia,
  toGridInputMedia,
} from '../ui/carousel.js';

const ALBUM_LIMIT = 10;

export interface AlbumResult {
  sent: number;
  total: number;
  skipped: number;
}

/** Sends a new carousel message starting at `index`. */
export async function sendCarousel(
  ctx: Context,
  post: Post,
  index = 0,
  options: { showText?: boolean } = {},
): Promise<void> {
  const item = post.media[index];
  if (!item) throw new RangeError(`No media at index ${index}`);

  const showText = options.showText ?? true;
  const file = await downloadMedia(item);
  const input = new InputFile(file.bytes, file.filename);
  const caption = buildCaption(post, index, { view: 'carousel', showText });
  const extra = {
    ...(caption ? { caption, parse_mode: 'HTML' as const } : {}),
    reply_markup: buildCarouselKeyboard(post, index, { showText }),
    ...(post.sensitive ? { has_spoiler: true } : {}),
    ...replyToMessage(ctx),
  };

  switch (item.kind) {
    case 'photo':
      await ctx.replyWithPhoto(input, extra);
      break;
    case 'animation':
      await ctx.replyWithAnimation(input, extra);
      break;
    default:
      await ctx.replyWithVideo(input, extra);
  }
}

/** Sends the provider-rendered contact sheet for a photo gallery. */
export async function sendGrid(
  ctx: Context,
  post: Post,
  options: { showText?: boolean } = {},
): Promise<void> {
  if (!post.mosaicUrl) throw new Error('Post has no grid image');

  const showText = options.showText ?? true;
  const file = await downloadPhotoUrl(post.mosaicUrl);
  const caption = buildCaption(post, 0, { view: 'grid', showText });
  const extra = {
    ...(caption ? { caption, parse_mode: 'HTML' as const } : {}),
    reply_markup: buildGridKeyboard(post, { showText }),
    ...(post.sensitive ? { has_spoiler: true } : {}),
    ...replyToMessage(ctx),
  };

  await ctx.replyWithPhoto(new InputFile(file.bytes, file.filename), extra);
}

/** Edits the existing carousel message in place (true one-message carousel). */
export async function editCarousel(
  ctx: Context,
  post: Post,
  index = 0,
  options: { showText?: boolean } = {},
): Promise<void> {
  const item = post.media[index];
  if (!item) throw new RangeError(`No media at index ${index}`);

  const showText = options.showText ?? true;
  const inline = ctx.inlineMessageId !== undefined;
  const file = inline ? undefined : await downloadMedia(item);

  await ctx.editMessageMedia(
    toCarouselInputMedia(post, index, { file, showText }),
    { reply_markup: buildCarouselKeyboard(post, index, { inline, showText }) },
  );
}

/** Edits the existing message into the contact-sheet grid view. */
export async function editGrid(
  ctx: Context,
  post: Post,
  options: { showText?: boolean } = {},
): Promise<void> {
  if (!post.mosaicUrl) throw new Error('Post has no grid image');

  const showText = options.showText ?? true;
  const inline = ctx.inlineMessageId !== undefined;
  const file = inline ? undefined : await downloadPhotoUrl(post.mosaicUrl);

  await ctx.editMessageMedia(
    toGridInputMedia(post, { file, showText }),
    { reply_markup: buildGridKeyboard(post, { inline, showText }) },
  );
}

/**
 * Sends all media as native Telegram albums. Telegram caps albums at 10 items,
 * so only the first 10 are sent. Big videos are skipped when the total would
 * exceed the media cache budget.
 */
export async function sendAlbum(
  ctx: Context,
  post: Post,
  showText = true,
): Promise<AlbumResult> {
  const chatId = ctx.chat?.id;
  if (chatId === undefined) throw new Error('Album view requires a chat');

  const items = post.media.slice(0, ALBUM_LIMIT);
  await ctx.api.sendChatAction(chatId, 'upload_photo').catch(() => {});

  const available: Array<{ index: number; file: DownloadedMedia }> = [];
  let totalBytes = 0;

  for (let index = 0; index < items.length; index += 1) {
    const item = items[index];
    if (!item) continue;
    try {
      const file = await downloadMedia(item);
      if (totalBytes + file.bytes.byteLength > config.mediaCacheBytes) {
        logger.warn('Skipping album item over the byte budget', { postId: post.id, index });
        continue;
      }
      totalBytes += file.bytes.byteLength;
      available.push({ index, file });
    } catch (error) {
      logger.warn('Skipping album item that failed to download', {
        postId: post.id,
        index,
        error,
      });
    }
  }

  if (available.length === 0) {
    throw new Error('Could not prepare any album media');
  }

  const caption = buildCaption(post, 0, { view: 'album', showText });
  const baseExtra = {
    ...(caption ? { caption, parse_mode: 'HTML' as const } : {}),
    ...(post.sensitive ? { has_spoiler: true } : {}),
    ...replyToMessage(ctx),
  };

  if (available.length === 1) {
    const entry = available[0];
    if (!entry) throw new Error('Could not prepare album media');
    const item = post.media[entry.index];
    if (!item) throw new Error('Could not prepare album media');

    const input = new InputFile(entry.file.bytes, entry.file.filename);
    if (item.kind === 'photo') await ctx.replyWithPhoto(input, baseExtra);
    else if (item.kind === 'animation') await ctx.replyWithAnimation(input, baseExtra);
    else await ctx.replyWithVideo(input, baseExtra);
  } else {
    const media = available.map((entry, position) =>
      toAlbumInputMedia(
        post,
        entry.index,
        entry.file,
        position === 0 ? caption : '',
      ),
    );
    await ctx.api.sendMediaGroup(chatId, media, replyToMessage(ctx));
  }

  return {
    sent: available.length,
    total: post.media.length,
    skipped: post.media.length - available.length,
  };
}
