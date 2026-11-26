import type { StatsSnapshot } from '../storage/statsStore.js';

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function truncate(value: string, max = 40): string {
  const flat = value.replace(/\s+/g, ' ').trim();
  return flat.length > max ? `${flat.slice(0, max - 1)}…` : flat;
}

export function formatStats(stats: StatsSnapshot): string {
  const lines = [
    '📊 xbot usage',
    '',
    `Users: ${stats.users}`,
    `Chats: ${stats.chats} (private ${stats.privateChats}, groups ${stats.groups}, channels ${stats.channels})`,
    '',
    `Messages: ${stats.messages}`,
    `Links: ${stats.links} (today ${stats.today.links})`,
    `Downloads: ${stats.downloads} (today ${stats.today.downloads})`,
    `Albums: ${stats.albums}`,
    `Inline queries: ${stats.inlineQueries} (today ${stats.today.inlineQueries})`,
    `Errors: ${stats.errors}`,
    '',
    'Last 7 days (UTC)',
  ];

  for (const day of stats.last7Days) {
    lines.push(
      `${day.day.slice(5)}  msg ${day.messages} · link ${day.links} · dl ${day.downloads}`,
    );
  }

  if (stats.topChats.length > 0) {
    lines.push('', 'Top groups');
    stats.topChats.forEach((chat, index) => {
      lines.push(`${index + 1}. ${truncate(chat.title)} - ${chat.links} links`);
    });
  }

  lines.push(
    '',
    `Since ${new Date(stats.since).toISOString().slice(0, 10)} · DB ${formatBytes(stats.dbBytes)}`,
  );

  return lines.join('\n');
}
