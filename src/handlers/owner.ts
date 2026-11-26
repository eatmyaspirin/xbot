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
import { escapeHtml } from '../utils/html.js';
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
  const name = user.displayName ? ` - ${escapeHtml(user.displayName)}` : '';
  const handle = user.username ? ` (@${escapeHtml(user.username)})` : '';
  return `<code>${user.id}</code>${name}${handle}`;
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
          'Send a numeric chat ID, for example <code>/allow -1001234567890</code>.',
          { parse_mode: 'HTML' },
        );
        return;
      }

      if (parsed > 0) {
        await ctx.reply(
          'Use <code>/allowuser</code> for private users. <code>/allow</code> is for group and channel chat IDs.',
          { parse_mode: 'HTML' },
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
        'Your private chat with me is always allowed. Use <code>/allowuser</code> to approve a user, or run <code>/allow</code> inside a group.',
        { parse_mode: 'HTML' },
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
      `Allowed chat <code>${entry.id}</code>${
        entry.title ? ` - ${escapeHtml(entry.title)}` : ''
      }.`,
      { parse_mode: 'HTML' },
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
          'Send a numeric chat ID, for example <code>/deny -1001234567890</code>.',
          { parse_mode: 'HTML' },
        );
        return;
      }

      if (parsed > 0) {
        await ctx.reply(
          'Use <code>/denyuser</code> to remove a private user.',
          { parse_mode: 'HTML' },
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
        ? `Removed chat <code>${targetId}</code>.`
        : `Chat <code>${targetId}</code> is not in the allowed list.`,
      { parse_mode: 'HTML' },
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
          'Send a numeric user ID, for example <code>/allowuser 123456789</code>.',
          { parse_mode: 'HTML' },
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
          'Reply to a user with <code>/allowuser</code>, or send <code>/allowuser &lt;user_id&gt;</code>.',
          { parse_mode: 'HTML' },
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

    await ctx.reply(`Allowed user ${formatUser(entry)}.`, {
      parse_mode: 'HTML',
    });
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
          'Send a numeric user ID, for example <code>/denyuser 123456789</code>.',
          { parse_mode: 'HTML' },
        );
        return;
      }
    } else {
      const replied = userFromReply(ctx);
      if (replied) targetId = replied.id;
    }

    if (targetId === null) {
      await ctx.reply(
        'Reply to a user with <code>/denyuser</code>, or send <code>/denyuser &lt;user_id&gt;</code>.',
        { parse_mode: 'HTML' },
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
        ? `Removed user <code>${targetId}</code>.`
        : `User <code>${targetId}</code> is not in the allowed list.`,
      { parse_mode: 'HTML' },
    );
  });

  bot.command('allowed', async (ctx) => {
    if (!isOwner(ctx.from?.id)) {
      await ownerOnly(ctx);
      return;
    }

    const chats = listAllowedChats();
    const lines = [
      `Owner user ID: <code>${config.ownerId}</code>`,
      `Allowed chats: ${chats.length}`,
      '',
    ];

    if (chats.length === 0) {
      lines.push('No extra chats are allowed yet.');
    } else {
      const shown = chats.slice(0, 50);
      for (const chat of shown) {
        lines.push(
          `• <code>${chat.id}</code>${
            chat.title ? ` - ${escapeHtml(chat.title)}` : ''
          }${chat.type ? ` (${chat.type})` : ''}`,
        );
      }
      if (chats.length > shown.length) {
        lines.push(`… and ${chats.length - shown.length} more.`);
      }
    }

    lines.push(
      '',
      'Your private chat is always allowed.',
      'Add a chat with <code>/allow &lt;chat_id&gt;</code> or run <code>/allow</code> inside a group.',
      'Manage users with <code>/allowedusers</code>.',
    );

    await ctx.reply(lines.join('\n'), { parse_mode: 'HTML' });
  });

  bot.command('allowedusers', async (ctx) => {
    if (!isOwner(ctx.from?.id)) {
      await ownerOnly(ctx);
      return;
    }

    const users = listAllowedUsers();
    const lines = [
      `Owner user ID: <code>${config.ownerId}</code>`,
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
      'Add with <code>/allowuser &lt;user_id&gt;</code> or reply <code>/allowuser</code> to a user message.',
      'Remove with <code>/denyuser &lt;user_id&gt;</code> or reply <code>/denyuser</code>.',
    );

    await ctx.reply(lines.join('\n'), { parse_mode: 'HTML' });
  });

  bot.command('chatid', async (ctx) => {
    if (!isOwner(ctx.from?.id)) {
      await ownerOnly(ctx);
      return;
    }

    const chat = ctx.chat;
    if (!chat) return;

    const lines = [
      `Chat ID: <code>${chat.id}</code>`,
      `Chat type: ${chat.type}`,
    ];
    const title = chatTitle(chat);
    if (title) lines.push(`Title: ${escapeHtml(title)}`);
    lines.push(
      `Your user ID: ${
        ctx.from?.id !== undefined
          ? `<code>${ctx.from.id}</code>`
          : 'unknown'
      }`,
    );

    const replied = ctx.message?.reply_to_message?.from;
    if (replied) {
      const name = [replied.first_name, replied.last_name]
        .filter(Boolean)
        .join(' ');
      lines.push('', `Replied user ID: <code>${replied.id}</code>`);
      if (name) lines.push(`Replied user: ${escapeHtml(name)}`);
      if (replied.username) {
        lines.push(`Username: @${escapeHtml(replied.username)}`);
      }
    }

    await ctx.reply(lines.join('\n'), { parse_mode: 'HTML' });
  });
}
