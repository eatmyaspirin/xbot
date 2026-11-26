import type { Bot } from 'grammy';
import type { Chat, User } from 'grammy/types';

import { logger } from '../logger.js';
import {
  isChatAllowed,
  isOwner,
  isUserAllowed,
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

function notApprovedMessage(userId: number | undefined): string {
  if (userId !== undefined) {
    return `Your account is not approved. Your user ID is ${userId}. Ask the owner to allow it with /allowuser ${userId}.`;
  }
  return 'Your account is not approved. Ask the owner to allow you with /allowuser.';
}

export function registerAccessMiddleware(bot: Bot): void {
  bot.use(async (ctx, next) => {
    // Inline queries have no chat ID, so they are controlled by the user
    // allowlist instead.
    if (ctx.inlineQuery) {
      const userId = ctx.from?.id;
      if (
        userId !== undefined &&
        (isOwner(userId) || isUserAllowed(userId))
      ) {
        if (ctx.from) touchUser(toUser(ctx.from));
        recordInlineQuery(userId);
        await next();
      } else {
        await ctx
          .answerInlineQuery([], {
            cache_time: 0,
            button: {
              text: 'Account not approved',
              start_parameter: 'access',
            },
          })
          .catch(() => {});
      }
      return;
    }

    // Inline gallery buttons also have no chat ID.
    if (ctx.inlineMessageId) {
      const userId = ctx.from?.id;
      if (
        userId !== undefined &&
        (isOwner(userId) || isUserAllowed(userId))
      ) {
        if (ctx.from) touchUser(toUser(ctx.from));
        await next();
      } else {
        await ctx
          .answerCallbackQuery({
            text: notApprovedMessage(userId),
            show_alert: true,
          })
          .catch(() => {});
      }
      return;
    }

    const chat = ctx.chat;
    if (!chat) {
      await next();
      return;
    }

    const userId = ctx.from?.id;

    // Keep an allowlisted group working after Telegram upgrades it to a
    // supergroup and changes its chat ID.
    const migratedTo = ctx.message?.migrate_to_chat_id;
    if (migratedTo && isChatAllowed(chat.id)) {
      await moveAllowedChat(chat.id, migratedTo).catch((error: unknown) => {
        logger.warn('Could not migrate allowed chat ID', { error });
      });
    }

    // The owner bypasses both allowlists so they can manage any chat.
    if (isOwner(userId)) {
      if (ctx.from) touchUser(toUser(ctx.from));
      touchChat(toChat(chat));
      if (ctx.message) recordMessage(userId, chat.id);
      await next();
      return;
    }

    const userAllowed = userId !== undefined && isUserAllowed(userId);
    const chatAllowed = chat.type === 'private' || isChatAllowed(chat.id);

    if (userAllowed && chatAllowed) {
      if (ctx.from) touchUser(toUser(ctx.from));
      touchChat(toChat(chat));
      if (ctx.message) recordMessage(userId, chat.id);
      await next();
      return;
    }

    if (ctx.callbackQuery) {
      const message = userAllowed
        ? 'This chat is not authorized to use this bot.'
        : notApprovedMessage(userId);
      await ctx
        .answerCallbackQuery({ text: message, show_alert: true })
        .catch(() => {});
      return;
    }

    if (chat.type === 'private') {
      const message = userAllowed
        ? 'This chat is not authorized to use this bot.'
        : notApprovedMessage(userId);
      await ctx.reply(message).catch(() => {});
    }

    logger.debug('Blocked update from unauthorized account or chat', {
      chatId: chat.id,
      userId,
      chatAllowed,
      userAllowed,
      type: chat.type,
    });
  });
}
