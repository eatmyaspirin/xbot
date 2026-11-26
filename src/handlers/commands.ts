import type { Bot } from 'grammy';

import { escapeHtml } from '../utils/html.js';

const HELP_TEXT = `<b>xbot</b> — X galleries as a carousel.

Send me a link to a post with photos or video:
<code>https://x.com/user/status/1234567890123456789</code>

Use ◀️ and ▶️ to flip through the media without leaving the chat.

<b>Supported links</b>
• x.com and twitter.com post links
• /photo/1 and /video/1 links
• fx/vx/fixup variants

<b>Good to know</b>
• Only public posts can be loaded.
• Telegram size limits apply (10 MB photos, 50 MB videos).
• In groups, the bot needs privacy mode disabled to see pasted links.`;

export function registerCommands(bot: Bot): void {
  bot.command('start', async (ctx) => {
    const name = ctx.from?.first_name?.trim();
    const greeting = name ? `Hi ${escapeHtml(name)}!` : 'Hi!';
    await ctx.reply(`${greeting}\n\n${HELP_TEXT}`, {
      parse_mode: 'HTML',
      link_preview_options: { is_disabled: true },
    });
  });

  bot.command('help', async (ctx) => {
    await ctx.reply(HELP_TEXT, {
      parse_mode: 'HTML',
      link_preview_options: { is_disabled: true },
    });
  });
}
