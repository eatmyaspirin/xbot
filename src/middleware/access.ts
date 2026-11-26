import type { Bot } from 'grammy';

import { logger } from '../logger.js';
import {
  isChatAllowed,
  isOwner,
  moveAllowedChat,
} from '../services/access.js';

export function registerAccessMiddleware(bot: Bot): void {
  bot.use(async (ctx, next) => {
    // Telegram does not expose the target chat ID for inline queries, so the
    // chat allowlist cannot be applied to inline results. Inline stays open;
    // the allowlist applies to direct messages and commands.
    if (ctx.inlineQuery) {
      await next();
      return;
    }

    // Inline gallery buttons also have no chat ID.
    if (ctx.inlineMessageId) {
      await next();
      return;
    }

    const chat = ctx.chat;
    if (!chat) {
      await next();
      return;
    }

    const userId = ctx.from?.id;
    if (isOwner(userId) || isChatAllowed(chat.id)) {
      // Keep an allowlisted group working after Telegram upgrades it to a
      // supergroup and changes its chat ID.
      const migratedTo = ctx.message?.migrate_to_chat_id;
      if (migratedTo && isChatAllowed(chat.id)) {
        await moveAllowedChat(chat.id, migratedTo).catch((error: unknown) => {
          logger.warn('Could not migrate allowed chat ID', { error });
        });
      }

      await next();
      return;
    }

    if (ctx.callbackQuery) {
      await ctx
        .answerCallbackQuery({
          text: 'This chat is not authorized to use this bot.',
          show_alert: true,
        })
        .catch(() => {});
      return;
    }

    if (chat.type === 'private') {
      await ctx
        .reply(
          'This bot is private. The owner has to allow this chat before it can be used.',
        )
        .catch(() => {});
    }

    logger.debug('Blocked update from unauthorized chat', {
      chatId: chat.id,
      type: chat.type,
    });
  });
}
