import { InputFile, type Bot, type Context } from 'grammy';

import { getLogBufferLimit, getRecentLogs } from '../logger.js';
import { isOwner } from '../services/access.js';

const DEFAULT_LINES = 200;
const MAX_BYTES = 1024 * 1024;

function fileStamp(): string {
  return new Date().toISOString().replace(/[:.]/g, '-');
}

async function sendLogs(ctx: Context): Promise<void> {
  if (!isOwner(ctx.from?.id)) {
    await ctx
      .reply('Only the bot owner can read logs.')
      .catch(() => {});
    return;
  }

  if (ctx.chat?.type !== 'private') {
    await ctx
      .reply('Use <code>/logs</code> in a private chat with me.', {
        parse_mode: 'HTML',
      })
      .catch(() => {});
    return;
  }

  const arg = typeof ctx.match === 'string' ? ctx.match.trim() : '';
  let count = DEFAULT_LINES;

  if (arg) {
    if (arg.toLowerCase() === 'all') {
      count = getLogBufferLimit();
    } else if (!/^\d+$/.test(arg)) {
      await ctx
        .reply(
          `Send <code>/logs</code>, <code>/logs &lt;lines&gt;</code>, or <code>/logs all</code> (1-${getLogBufferLimit()}).`,
          { parse_mode: 'HTML' },
        )
        .catch(() => {});
      return;
    } else {
      count = Math.min(getLogBufferLimit(), Math.max(1, Number(arg)));
    }
  }

  const lines = getRecentLogs(count);
  if (lines.length === 0) {
    await ctx.reply('No logs have been captured yet.').catch(() => {});
    return;
  }

  let text = lines.join('\n');
  if (Buffer.byteLength(text, 'utf8') > MAX_BYTES) {
    text = text.slice(-MAX_BYTES);
  }

  const file = new InputFile(
    Buffer.from(text, 'utf8'),
    `xbot-logs-${fileStamp()}.txt`,
  );

  try {
    await ctx.replyWithDocument(file, {
      caption: `Recent logs: ${lines.length} lines. In-memory since the last bot start.`,
    });
  } catch {
    await ctx
      .reply('Could not send the log file. Try /logs again with fewer lines.')
      .catch(() => {});
  }
}

export function registerLogsCommand(bot: Bot): void {
  bot.command('logs', sendLogs);
}
