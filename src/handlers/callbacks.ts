import { GrammyError, type Bot, type Context } from 'grammy';

import { logger } from '../logger.js';
import { editCarousel, editGrid, sendAlbum } from '../services/carousel.js';
import { getPost } from '../services/x/index.js';
import {
  LEGACY_NOOP_CALLBACK,
  NOOP_CALLBACK,
  parseCallbackData,
  type CallbackAction,
} from '../ui/carousel.js';

function isStaleMessageError(error: unknown): boolean {
  if (!(error instanceof GrammyError)) return false;
  return /message to edit not found|message can't be edited|MESSAGE_ID_INVALID|message is not modified|query is too old/i.test(
    error.description,
  );
}

async function handleAlbum(ctx: Context, action: CallbackAction): Promise<void> {
  if (ctx.inlineMessageId !== undefined) {
    await ctx
      .answerCallbackQuery({
        text: 'Albums are only available in a direct chat. Use Grid or Carousel here.',
        show_alert: true,
      })
      .catch(() => {});
    return;
  }

  // Answer immediately so the button stops spinning while media downloads.
  await ctx
    .answerCallbackQuery({ text: 'Preparing album…' })
    .catch(() => {});

  try {
    const post = await getPost(action.postId);
    if (post.media.length === 0) throw new Error('Post has no media');

    const result = await sendAlbum(ctx, post, action.showText);
    if (result.skipped > 0) {
      await ctx
        .reply(
          `Sent ${result.sent} of ${result.total} media items. ` +
            `${result.skipped} were skipped because of Telegram's 10-item album limit or the upload size budget.`,
        )
        .catch(() => {});
    }
  } catch (error) {
    logger.warn('Could not send album', {
      postId: action.postId,
      error,
    });
    await ctx
      .reply('Could not build an album for that post. Try the carousel view.')
      .catch(() => {});
  }
}

export function registerCallbackHandler(bot: Bot): void {
  bot.callbackQuery(/^(?:xb|car):/, async (ctx) => {
    const data = ctx.callbackQuery.data;

    if (data === NOOP_CALLBACK || data === LEGACY_NOOP_CALLBACK) {
      await ctx.answerCallbackQuery().catch(() => {});
      return;
    }

    const action = parseCallbackData(data);
    if (!action) {
      await ctx
        .answerCallbackQuery({ text: 'That button is no longer valid.', show_alert: true })
        .catch(() => {});
      return;
    }

    if (action.mode === 'album') {
      await handleAlbum(ctx, action);
      return;
    }

    try {
      const post = await getPost(action.postId);
      if (post.media.length === 0) throw new Error('Post has no media');

      if (action.mode === 'grid') {
        if (!post.mosaicUrl) throw new Error('Post has no grid image');
        await editGrid(ctx, post, { showText: action.showText });
      } else {
        const index = action.index % post.media.length;
        await editCarousel(ctx, post, index, { showText: action.showText });
      }
    } catch (error) {
      logger.warn('Could not update media view', {
        postId: action.postId,
        mode: action.mode,
        index: action.index,
        error,
      });

      let message: string;
      if (isStaleMessageError(error)) {
        message = 'This gallery is too old to update. Send the link again to reload it.';
      } else if (action.mode === 'grid') {
        message = 'Could not load the grid for this post. Try the carousel view.';
      } else if (ctx.inlineMessageId !== undefined) {
        message = 'Could not load that media inline. Send the link to the bot instead.';
      } else {
        message = 'Could not load that media from X. Please try again.';
      }

      await ctx
        .answerCallbackQuery({ text: message, show_alert: true })
        .catch(() => {});
      return;
    }

    await ctx.answerCallbackQuery().catch(() => {});
  });
}
