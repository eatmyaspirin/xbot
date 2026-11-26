import type { Bot, Context } from 'grammy';

import { config } from '../config.js';
import { logger } from '../logger.js';
import { sendCarousel } from '../services/carousel.js';
import { MediaDownloadError, MediaTooLargeError } from '../services/media.js';
import { getPost } from '../services/x/index.js';
import { PostError } from '../services/x/normalize.js';
import { extractStatusLinks, looksLikeXLink, type StatusLink } from '../utils/xurl.js';
import { replyToMessage } from '../utils/telegram.js';

const MB = 1024 * 1024;

function describeError(error: unknown): string {
  if (error instanceof MediaTooLargeError) {
    return `That media is larger than Telegram's ${Math.round(error.limitBytes / MB)} MB upload limit, so I can't send it.`;
  }
  if (error instanceof MediaDownloadError) {
    return 'I found the post, but could not download its media from X. Try again in a moment.';
  }
  if (error instanceof PostError) {
    switch (error.code) {
      case 'not_found':
        return 'I could not find that post. It may have been deleted or the account may be private.';
      case 'protected':
        return 'That post is private or age-restricted, so I cannot load it.';
      case 'upstream':
        return 'X isn’t responding right now. Please try again in a minute.';
      default:
        return 'X returned something I could not read. Please try another post.';
    }
  }
  return 'Something went wrong while loading that post.';
}

async function handleLink(ctx: Context, link: StatusLink): Promise<void> {
  try {
    const post = await getPost(link.id);

    if (post.media.length === 0) {
      await ctx.reply(
        'That post does not contain any photos or videos to show.',
        replyToMessage(ctx),
      );
      return;
    }

    await sendCarousel(ctx, post, 0);
  } catch (error) {
    logger.warn('Could not build carousel', {
      postId: link.id,
      error,
    });
    await ctx.reply(describeError(error), replyToMessage(ctx)).catch(() => {
      // The chat may be gone, or the bot may have lost permission.
    });
  }
}

export function registerLinkHandler(bot: Bot): void {
  bot.on('message:text', async (ctx) => {
    const text = ctx.msg.text;
    const links = extractStatusLinks(text);

    if (links.length === 0) {
      if (ctx.chat.type === 'private' && looksLikeXLink(text)) {
        await ctx
          .reply(
            'I could not find a post link in that message. Send a link to a specific post, like https://x.com/user/status/123.',
            {
              ...replyToMessage(ctx),
              link_preview_options: { is_disabled: true },
            },
          )
          .catch(() => {});
      }
      return;
    }

    const selected = links.slice(0, config.maxLinksPerMessage);
    if (links.length > selected.length) {
      await ctx
        .reply(
          `I can only load ${config.maxLinksPerMessage} links per message; using the first ${selected.length}.`,
          replyToMessage(ctx),
        )
        .catch(() => {});
    }

    for (const link of selected) {
      await handleLink(ctx, link);
    }
  });
}
