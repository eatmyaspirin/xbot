import { autoRetry } from '@grammyjs/auto-retry';
import { Bot } from 'grammy';

import { logger } from './logger.js';
import { registerCallbackHandler } from './handlers/callbacks.js';
import { registerCommands } from './handlers/commands.js';
import { registerLinkHandler } from './handlers/links.js';

export function createBot(token: string): Bot {
  const bot = new Bot(token);

  bot.api.config.use(
    autoRetry({
      maxRetryAttempts: 3,
      maxDelaySeconds: 20,
    }),
  );

  registerCommands(bot);
  registerLinkHandler(bot);
  registerCallbackHandler(bot);

  bot.catch((error) => {
    logger.error('Unhandled bot error', {
      updateId: error.ctx.update.update_id,
      error: error.error,
    });

    if (error.ctx.callbackQuery) {
      void error.ctx
        .answerCallbackQuery({ text: 'Something went wrong. Please try again.', show_alert: true })
        .catch(() => {});
    }
  });

  return bot;
}
