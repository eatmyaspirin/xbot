import type { Bot, Context } from 'grammy';

import { config } from '../config.js';
import { logger } from '../logger.js';
import {
  addAllowedChat,
  isOwner,
  listAllowedChats,
  removeAllowedChat,
} from '../services/access.js';
import { chatTitle, parseChatId } from '../utils/telegram.js';

async function ownerOnly(ctx: Context): Promise<void> {
  await ctx
    .reply('Only the bot owner can manage allowed chats.')
    .catch(() => {});
}

export function registerOwnerCommands(bot: Bot): void {
  bot.command('allow', async (ctx) => {
    if (!isOwner(ctx.from?.id)) {
      await ownerOnly(ctx);
      return;
    }

    const chat = ctx.chat;
    if (!chat) return;

    const arg = ctx.match.trim();
    let targetId = chat.id;
    let title = chatTitle(chat);
    let type: string | undefined = chat.type;

    if (arg) {
      const parsed = parseChatId(arg);
      if (parsed === null) {
        await ctx.reply(
          'Send a numeric chat ID, for example /allow -1001234567890.',
        );
        return;
      }
      targetId = parsed;

      if (targetId === chat.id) {
        title = chatTitle(chat);
        type = chat.type;
      } else {
        title = undefined;
        type = undefined;
        try {
          const remote = await ctx.api.getChat(targetId);
          title = chatTitle(remote);
          type = remote.type;
        } catch (error) {
          logger.warn('Could not look up chat for /allow', { targetId, error });
        }
      }
    } else if (chat.type === 'private') {
      await ctx.reply(
        'Your private chat with me is always allowed. Use /allow <chat_id>, or run /allow inside a group.',
      );
      return;
    }

    if (chat.type === 'private' && targetId === chat.id) {
      await ctx.reply('Your private chat with me is always allowed.');
      return;
    }

    const entry = await addAllowedChat({
      id: targetId,
      ...(title ? { title } : {}),
      ...(type ? { type } : {}),
    });

    await ctx.reply(
      `Allowed chat ${entry.id}${entry.title ? ` — ${entry.title}` : ''}.`,
    );
  });

  bot.command('deny', async (ctx) => {
    if (!isOwner(ctx.from?.id)) {
      await ownerOnly(ctx);
      return;
    }

    const chat = ctx.chat;
    if (!chat) return;

    const arg = ctx.match.trim();
    let targetId = chat.id;

    if (arg) {
      const parsed = parseChatId(arg);
      if (parsed === null) {
        await ctx.reply(
          'Send a numeric chat ID, for example /deny -1001234567890.',
        );
        return;
      }
      targetId = parsed;
    }

    if (chat.type === 'private' && targetId === chat.id) {
      await ctx.reply(
        'Your private chat with me is always allowed and cannot be removed.',
      );
      return;
    }

    const removed = await removeAllowedChat(targetId);
    await ctx.reply(
      removed
        ? `Removed chat ${targetId}.`
        : `Chat ${targetId} is not in the allowed list.`,
    );
  });

  bot.command('allowed', async (ctx) => {
    if (!isOwner(ctx.from?.id)) {
      await ownerOnly(ctx);
      return;
    }

    const chats = listAllowedChats();
    const lines = [
      `Owner user ID: ${config.ownerId}`,
      `Allowed chats: ${chats.length}`,
      '',
    ];

    if (chats.length === 0) {
      lines.push('No extra chats are allowed yet.');
    } else {
      const shown = chats.slice(0, 50);
      for (const chat of shown) {
        lines.push(
          `• ${chat.id}${chat.title ? ` — ${chat.title}` : ''}${
            chat.type ? ` (${chat.type})` : ''
          }`,
        );
      }
      if (chats.length > shown.length) {
        lines.push(`… and ${chats.length - shown.length} more.`);
      }
    }

    lines.push(
      '',
      'Your private chat is always allowed.',
      'Add a chat with /allow <chat_id> or run /allow inside a group.',
    );

    await ctx.reply(lines.join('\n'));
  });

  bot.command('chatid', async (ctx) => {
    if (!isOwner(ctx.from?.id)) {
      await ownerOnly(ctx);
      return;
    }

    const chat = ctx.chat;
    if (!chat) return;

    const lines = [`Chat ID: ${chat.id}`, `Chat type: ${chat.type}`];
    const title = chatTitle(chat);
    if (title) lines.push(`Title: ${title}`);
    lines.push(`Your user ID: ${ctx.from?.id ?? 'unknown'}`);

    await ctx.reply(lines.join('\n'));
  });
}
