import type { Bot, Context } from 'grammy';

import { config } from '../config.js';
import { logger } from '../logger.js';
import {
  addAllowedChat,
  addAllowedUser,
  isOwner,
  listAllowedChats,
  listAllowedUsers,
  removeAllowedChat,
  removeAllowedUser,
} from '../services/access.js';
import type { AllowedUser } from '../storage/stateStore.js';
import { chatTitle, parseChatId, parseUserId } from '../utils/telegram.js';

async function ownerOnly(ctx: Context): Promise<void> {
  await ctx
    .reply('Only the bot owner can manage access.')
    .catch(() => {});
}

function formatUser(user: {
  id: number;
  username?: string;
  displayName?: string;
}): string {
  const name = user.displayName ? ` - ${user.displayName}` : '';
  const handle = user.username ? ` (@${user.username})` : '';
  return `${user.id}${name}${handle}`;
}

function userFromReply(ctx: Context): {
  id: number;
  username?: string;
  displayName?: string;
} | null {
  const user = ctx.message?.reply_to_message?.from;
  if (!user) return null;

  return {
    id: user.id,
    ...(user.username ? { username: user.username } : {}),
    ...([user.first_name, user.last_name].filter(Boolean).join(' ')
      ? {
          displayName: [user.first_name, user.last_name]
            .filter(Boolean)
            .join(' '),
        }
      : {}),
  };
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

      if (parsed > 0) {
        await ctx.reply(
          'Use /allowuser for private users. /allow is for group and channel chat IDs.',
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
        'Your private chat with me is always allowed. Use /allowuser to approve a user, or run /allow inside a group.',
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
      `Allowed chat ${entry.id}${entry.title ? ` - ${entry.title}` : ''}.`,
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

      if (parsed > 0) {
        await ctx.reply('Use /denyuser to remove a private user.');
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

  bot.command('allowuser', async (ctx) => {
    if (!isOwner(ctx.from?.id)) {
      await ownerOnly(ctx);
      return;
    }

    const arg = ctx.match.trim();
    let target: {
      id: number;
      username?: string;
      displayName?: string;
    } | null = null;

    if (arg) {
      const parsed = parseUserId(arg);
      if (parsed === null) {
        await ctx.reply(
          'Send a numeric user ID, for example /allowuser 123456789.',
        );
        return;
      }

      if (parsed === ctx.from?.id) {
        await ctx.reply('You are the owner and are always allowed.');
        return;
      }

      target = { id: parsed };

      try {
        const remote = await ctx.api.getChat(parsed);
        target = {
          id: parsed,
          ...('username' in remote &&
          typeof remote.username === 'string' &&
          remote.username
            ? { username: remote.username }
            : {}),
          ...(chatTitle(remote) ? { displayName: chatTitle(remote) } : {}),
        };
      } catch (error) {
        logger.warn('Could not look up user for /allowuser', {
          userId: parsed,
          error,
        });
      }
    } else {
      target = userFromReply(ctx);
      if (!target) {
        await ctx.reply(
          'Reply to a user with /allowuser, or send /allowuser <user_id>.',
        );
        return;
      }
      if (target.id === ctx.from?.id) {
        await ctx.reply('You are the owner and are always allowed.');
        return;
      }
    }

    const entry: AllowedUser = await addAllowedUser({
      id: target.id,
      ...(target.username ? { username: target.username } : {}),
      ...(target.displayName ? { displayName: target.displayName } : {}),
    });

    await ctx.reply(`Allowed user ${formatUser(entry)}.`);
  });

  bot.command('denyuser', async (ctx) => {
    if (!isOwner(ctx.from?.id)) {
      await ownerOnly(ctx);
      return;
    }

    const arg = ctx.match.trim();
    let targetId: number | null = null;

    if (arg) {
      targetId = parseUserId(arg);
      if (targetId === null) {
        await ctx.reply(
          'Send a numeric user ID, for example /denyuser 123456789.',
        );
        return;
      }
    } else {
      const replied = userFromReply(ctx);
      if (replied) targetId = replied.id;
    }

    if (targetId === null) {
      await ctx.reply(
        'Reply to a user with /denyuser, or send /denyuser <user_id>.',
      );
      return;
    }

    if (targetId === ctx.from?.id) {
      await ctx.reply('The owner cannot be removed.');
      return;
    }

    const removed = await removeAllowedUser(targetId);
    await ctx.reply(
      removed
        ? `Removed user ${targetId}.`
        : `User ${targetId} is not in the allowed list.`,
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
          `• ${chat.id}${chat.title ? ` - ${chat.title}` : ''}${
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
      'Manage users with /allowedusers.',
    );

    await ctx.reply(lines.join('\n'));
  });

  bot.command('allowedusers', async (ctx) => {
    if (!isOwner(ctx.from?.id)) {
      await ownerOnly(ctx);
      return;
    }

    const users = listAllowedUsers();
    const lines = [
      `Owner user ID: ${config.ownerId}`,
      `Allowed users: ${users.length}`,
      '',
    ];

    if (users.length === 0) {
      lines.push('No extra users are allowed yet.');
    } else {
      const shown = users.slice(0, 50);
      for (const user of shown) lines.push(`• ${formatUser(user)}`);
      if (users.length > shown.length) {
        lines.push(`… and ${users.length - shown.length} more.`);
      }
    }

    lines.push(
      '',
      'Add with /allowuser <user_id> or reply /allowuser to a user message.',
      'Remove with /denyuser <user_id> or reply /denyuser.',
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

    const replied = ctx.message?.reply_to_message?.from;
    if (replied) {
      const name = [replied.first_name, replied.last_name]
        .filter(Boolean)
        .join(' ');
      lines.push('', `Replied user ID: ${replied.id}`);
      if (name) lines.push(`Replied user: ${name}`);
      if (replied.username) lines.push(`Username: @${replied.username}`);
    }

    await ctx.reply(lines.join('\n'));
  });
}
