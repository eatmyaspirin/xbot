import type { Bot, Context } from 'grammy';

import { logger } from '../logger.js';
import { isOwner } from '../services/access.js';
import { getStatsSnapshot } from '../services/stats.js';
import { formatStats } from '../ui/stats.js';

async function sendStats(ctx: Context): Promise<void> {
  if (!isOwner(ctx.from?.id)) {
    await ctx
      .reply('Only the bot owner can view usage statistics.')
      .catch(() => {});
    return;
  }

  try {
    await ctx.reply(formatStats(getStatsSnapshot()), {
      link_preview_options: { is_disabled: true },
    });
  } catch (error) {
    logger.warn('Could not build stats', { error });
    await ctx.reply('Could not read stats right now.').catch(() => {});
  }
}

export function registerStatsCommand(bot: Bot): void {
  bot.command('stat', sendStats);
  bot.command('stats', sendStats);
}
