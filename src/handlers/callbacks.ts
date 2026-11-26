import { GrammyError, type Bot } from 'grammy';

import { logger } from '../logger.js';
import { editCarousel } from '../services/carousel.js';
import { getPost } from '../services/x/index.js';
import {
  NOOP_CALLBACK,
  parseCallbackData,
} from '../ui/carousel.js';

function isStaleMessageError(error: unknown): boolean {
  if (!(error instanceof GrammyError)) return false;
  return /message to edit not found|message can't be edited|MESSAGE_ID_INVALID|message is not modified|query is too old/i.test(
    error.description,
  );
}

export function registerCallbackHandler(bot: Bot): void {
  bot.callbackQuery(/^car:/, async (ctx) => {
    const data = ctx.callbackQuery.data;

    if (data === NOOP_CALLBACK) {
      await ctx.answerCallbackQuery().catch(() => {});
      return;
    }

    const parsed = parseCallbackData(data);
    if (!parsed) {
      await ctx
        .answerCallbackQuery({ text: 'That button is no longer valid.', show_alert: true })
        .catch(() => {});
      return;
    }

    try {
      const post = await getPost(parsed.postId);
      if (post.media.length === 0) {
        throw new Error('Post has no media');
      }
      const index = parsed.index % post.media.length;
      await editCarousel(ctx, post, index);
    } catch (error) {
      logger.warn('Could not update carousel', {
        postId: parsed.postId,
        index: parsed.index,
        error,
      });
      const message = isStaleMessageError(error)
        ? 'This carousel is too old to update. Send the link again to reload it.'
        : 'Could not load that media from X. Please try again.';
      await ctx
        .answerCallbackQuery({ text: message, show_alert: true })
        .catch(() => {});
      return;
    }

    await ctx.answerCallbackQuery().catch(() => {});
  });
}
