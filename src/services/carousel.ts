import { InputFile, type Context } from 'grammy';

import type { Post } from '../types.js';
import { replyToMessage } from '../utils/telegram.js';
import { downloadMedia } from './media.js';
import { buildCaption, buildKeyboard, toInputMedia } from '../ui/carousel.js';

/** Sends a new carousel message starting at `index`. */
export async function sendCarousel(ctx: Context, post: Post, index = 0): Promise<void> {
  const item = post.media[index];
  if (!item) throw new RangeError(`No media at index ${index}`);

  const file = await downloadMedia(item);
  const input = new InputFile(file.bytes, file.filename);
  const extra = {
    caption: buildCaption(post, index),
    parse_mode: 'HTML' as const,
    reply_markup: buildKeyboard(post, index),
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

/** Edits the existing carousel message in place (true one-message carousel). */
export async function editCarousel(ctx: Context, post: Post, index = 0): Promise<void> {
  const item = post.media[index];
  if (!item) throw new RangeError(`No media at index ${index}`);

  const file = await downloadMedia(item);
  await ctx.editMessageMedia(toInputMedia(post, index, file), {
    reply_markup: buildKeyboard(post, index),
  });
}
