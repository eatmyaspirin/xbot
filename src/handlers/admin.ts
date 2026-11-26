import type { Bot, Context } from 'grammy';

import { isOwner } from '../services/access.js';

const ADMIN_TEXT = `<b>Admin commands</b>

<code>/admin</code> - show this list
<code>/allow [chat_id]</code> - allow this chat or a specific ID
<code>/deny [chat_id]</code> - remove a chat
<code>/allowed</code> - list approved chats
<code>/chatid</code> - show this chat's ID
<code>/stat</code> - usage statistics`;

async function sendAdmin(ctx: Context): Promise<void> {
  if (!isOwner(ctx.from?.id)) {
    await ctx
      .reply('Only the bot owner can view admin commands.')
      .catch(() => {});
    return;
  }

  await ctx.reply(ADMIN_TEXT, {
    parse_mode: 'HTML',
    link_preview_options: { is_disabled: true },
  });
}

export function registerAdminCommand(bot: Bot): void {
  bot.command('admin', sendAdmin);
}
