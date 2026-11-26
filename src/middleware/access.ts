import type { Bot } from 'grammy';
import type { Chat, User } from 'grammy/types';

import { logger } from '../logger.js';
import {
  isChatAllowed,
  isOwner,
  moveAllowedChat,
} from '../services/access.js';
import {
  recordInlineQuery,
  recordMessage,
  touchChat,
  touchUser,
} from '../services/stats.js';
import type { ChatInput, UserInput } from '../storage/statsStore.js';
import { chatTitle } from '../utils/telegram.js';

function toUser(user: User): UserInput {
  return {
    id: user.id,
    username: user.username,
    firstName: user.first_name,
    lastName: user.last_name,
  };
}

function toChat(chat: Chat): ChatInput {
  return {
    id: chat.id,
    type: chat.type,
    title: chatTitle(chat),
    username:
      'username' in chat && typeof chat.username === 'string'
        ? chat.username
        : undefined,
  };
}

export function registerAccessMiddleware(bot: Bot): void {
  bot.use(async (ctx, next) => {
    // Telegram does not expose the target chat ID for inline queries, so the
    // chat allowlist cannot be applied to inline results. Inline stays open;
    // the allowlist applies to direct messages and commands.
    if (ctx.inlineQuery) {
      if (ctx.from) {
        touchUser(toUser(ctx.from));
        recordInlineQuery(ctx.from.id);
      }
      await next();
      return;
    }

    // Inline gallery buttons also have no chat ID.
    if (ctx.inlineMessageId) {
      if (ctx.from) touchUser(toUser(ctx.from));
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

      if (ctx.from) touchUser(toUser(ctx.from));
      touchChat(toChat(chat));
      if (ctx.message) recordMessage(userId, chat.id);

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
