import type { Bot } from 'grammy';

import { logger } from '../logger.js';
import { recordError } from '../services/stats.js';
import { getPost } from '../services/x/index.js';
import { extractStatusLinks } from '../utils/xurl.js';
import { buildInlineResult } from '../ui/inline.js';

const INLINE_CACHE_SECONDS = 30;

export function registerInlineHandler(bot: Bot): void {
  bot.on('inline_query', async (ctx) => {
    const [link] = extractStatusLinks(ctx.inlineQuery.query);

    if (!link) {
      await ctx
        .answerInlineQuery([], {
          cache_time: 0,
          button: { text: 'Send me an X post link', start_parameter: 'inline' },
        })
        .catch(() => {});
      return;
    }

    try {
      const post = await getPost(link.id);
      if (post.media.length === 0) {
        await ctx
          .answerInlineQuery([], {
            cache_time: 0,
            button: { text: 'That post has no media', start_parameter: 'inline' },
          })
          .catch(() => {});
        return;
      }

      const result = buildInlineResult(post);
      if (!result) {
        await ctx
          .answerInlineQuery([], {
            cache_time: 0,
            button: { text: 'That media is not available inline', start_parameter: 'inline' },
          })
          .catch(() => {});
        return;
      }

      await ctx.answerInlineQuery([result], {
        cache_time: INLINE_CACHE_SECONDS,
        is_personal: false,
      });
    } catch (error) {
      recordError();
      logger.warn('Inline query failed', { postId: link.id, error });
      await ctx
        .answerInlineQuery([], {
          cache_time: 0,
          button: { text: 'Could not load that post', start_parameter: 'inline' },
        })
        .catch(() => {});
    }
  });
}
