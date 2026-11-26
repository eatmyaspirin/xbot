import type { Bot } from 'grammy';

import { escapeHtml } from '../utils/html.js';

function helpText(username: string): string {
  const sections = [
    `Send me a link to a post with photos or video:
<code>https://x.com/user/status/1234567890123456789</code>`,
    `<b>Views</b>
• 🖼 Grid - every photo at once
• 🎠 Carousel - one at a time
• 📚 Album - native Telegram album
• ⬇️ Download - original file, or ZIP for galleries
• 📝 Hide text - image-only view`,
    `<b>Inline</b>
Type <code>@${username} &lt;link&gt;</code> in any chat.`,
    `<b>Private bot</b>
Link detection is limited to chats approved by the owner.`,
    `<b>Good to know</b>
• Only public posts can be loaded.
• Telegram size limits apply (10 MB photos, 50 MB videos).
• In groups, the bot needs privacy mode disabled to see pasted links.`,
  ];

  return sections.join('\n\n');
}

export function registerCommands(bot: Bot): void {
  bot.command('start', async (ctx) => {
    const name = ctx.from?.first_name?.trim();
    const greeting = name ? `Hi ${escapeHtml(name)}!` : 'Hi!';
    await ctx.reply(`${greeting}\n\n${helpText(ctx.me.username ?? 'xbot')}`, {
      parse_mode: 'HTML',
      link_preview_options: { is_disabled: true },
    });
  });

  bot.command('help', async (ctx) => {
    await ctx.reply(helpText(ctx.me.username ?? 'xbot'), {
      parse_mode: 'HTML',
      link_preview_options: { is_disabled: true },
    });
  });
}
