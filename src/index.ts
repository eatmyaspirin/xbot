import { createBot } from './bot.js';
import { config } from './config.js';
import { logger, setLogLevel } from './logger.js';
import { initAccess } from './services/access.js';
import { cleanupStaleDownloads } from './services/download.js';

async function main(): Promise<void> {
  setLogLevel(config.logLevel);
  await initAccess();

  const removed = await cleanupStaleDownloads().catch((error: unknown) => {
    logger.warn('Could not sweep stale download directories', { error });
    return 0;
  });
  if (removed > 0) {
    logger.info(`Removed ${removed} stale download director${removed === 1 ? 'y' : 'ies'}`);
  }

  const bot = createBot(config.botToken);
  const me = await bot.api.getMe();
  logger.info(`Logged in as @${me.username} (${me.id})`);

  if (!me.supports_inline_queries) {
    logger.warn(
      'Inline mode is disabled. Enable it in BotFather with /setinline to use @bot <link> in any chat.',
    );
  }

  await bot.api
    .setMyCommands([
      { command: 'start', description: 'How to use xbot' },
      { command: 'help', description: 'Examples and limits' },
    ])
    .catch((error: unknown) => {
      logger.warn('Could not register bot commands', { error });
    });

  let stopping = false;
  const stop = (signal: string): void => {
    if (stopping) return;
    stopping = true;
    logger.info(`Received ${signal}; stopping the bot`);
    void bot.stop();
  };

  process.once('SIGINT', () => stop('SIGINT'));
  process.once('SIGTERM', () => stop('SIGTERM'));

  await bot.start({
    allowed_updates: ['message', 'callback_query', 'inline_query'],
    drop_pending_updates: config.dropPendingUpdates,
    onStart: (info) => {
      logger.info(`Listening for updates as @${info.username}`);
    },
  });

  logger.info('Bot stopped');
}

main().catch((error: unknown) => {
  logger.error('Fatal startup error', { error });
  process.exitCode = 1;
});
