import type { Bot, Context } from 'grammy';

import { isOwner } from '../services/access.js';

const ADMIN_TEXT = `<b>Admin commands</b>

<code>/admin</code> - show this list
<code>/allow [chat_id]</code> - allow this group/channel or a chat ID
<code>/deny [chat_id]</code> - remove a group/channel
<code>/allowuser [user_id]</code> - allow a user, or reply with /allowuser
<code>/denyuser [user_id]</code> - remove a user
<code>/allowed</code> - list approved chats
<code>/allowedusers</code> - list approved users
<code>/chatid</code> - show this chat's ID and replied user IDs
<code>/stat</code> - usage statistics

Private chats need an approved user. Groups need an approved user and an approved chat. Inline needs an approved user.`;

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
