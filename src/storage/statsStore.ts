import { chmodSync, mkdirSync, statSync } from 'node:fs';
import path from 'node:path';

import { DatabaseSync } from 'node:sqlite';

export interface UserInput {
  id: number;
  username?: string | null;
  firstName?: string | null;
  lastName?: string | null;
}

export interface ChatInput {
  id: number;
  type: string;
  title?: string | null;
  username?: string | null;
}

export interface StatsDay {
  day: string;
  messages: number;
  links: number;
  downloads: number;
  albums: number;
  inlineQueries: number;
  errors: number;
}

export interface StatsSnapshot {
  since: number;
  dbBytes: number;
  users: number;
  chats: number;
  privateChats: number;
  groups: number;
  channels: number;
  messages: number;
  links: number;
  downloads: number;
  albums: number;
  inlineQueries: number;
  errors: number;
  today: StatsDay;
  last7Days: StatsDay[];
  topChats: Array<{
    id: number;
    title: string;
    type: string;
    links: number;
  }>;
}

type Row = Record<string, unknown>;

const SCHEMA = `
  CREATE TABLE IF NOT EXISTS meta (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS users (
    user_id INTEGER PRIMARY KEY,
    username TEXT,
    display_name TEXT,
    first_seen INTEGER NOT NULL,
    last_seen INTEGER NOT NULL,
    messages INTEGER NOT NULL DEFAULT 0,
    links INTEGER NOT NULL DEFAULT 0,
    downloads INTEGER NOT NULL DEFAULT 0,
    albums INTEGER NOT NULL DEFAULT 0,
    inline_queries INTEGER NOT NULL DEFAULT 0
  );

  CREATE TABLE IF NOT EXISTS chats (
    chat_id INTEGER PRIMARY KEY,
    type TEXT NOT NULL,
    title TEXT,
    username TEXT,
    first_seen INTEGER NOT NULL,
    last_seen INTEGER NOT NULL,
    messages INTEGER NOT NULL DEFAULT 0,
    links INTEGER NOT NULL DEFAULT 0,
    downloads INTEGER NOT NULL DEFAULT 0,
    albums INTEGER NOT NULL DEFAULT 0
  );

  CREATE TABLE IF NOT EXISTS daily (
    day TEXT NOT NULL,
    metric TEXT NOT NULL,
    count INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (day, metric)
  );

  CREATE INDEX IF NOT EXISTS idx_chats_links ON chats(links DESC);
  CREATE INDEX IF NOT EXISTS idx_chats_type ON chats(type);
`;

function dayKey(timestamp: number): string {
  return new Date(timestamp).toISOString().slice(0, 10);
}

function numberValue(row: Row | undefined, key: string): number {
  const value = row?.[key];
  if (typeof value === 'number') return value;
  if (typeof value === 'bigint') return Number(value);
  if (typeof value === 'string') return Number(value) || 0;
  return 0;
}

function stringValue(row: Row | undefined, key: string): string | undefined {
  const value = row?.[key];
  return typeof value === 'string' ? value : undefined;
}

function emptyDay(day: string): StatsDay {
  return {
    day,
    messages: 0,
    links: 0,
    downloads: 0,
    albums: 0,
    inlineQueries: 0,
    errors: 0,
  };
}

/**
 * Small SQLite-backed usage store. Uses Node's built-in node:sqlite so there
 * is no native dependency to compile.
 */
export class StatsStore {
  private readonly db: DatabaseSync;
  private readonly file: string;

  constructor(file: string) {
    this.file = file;
    mkdirSync(path.dirname(file), { recursive: true, mode: 0o750 });

    this.db = new DatabaseSync(file);
    this.db.exec('PRAGMA journal_mode = WAL;');
    this.db.exec('PRAGMA synchronous = NORMAL;');
    this.db.exec(SCHEMA);
    this.db
      .prepare(
        `INSERT INTO meta(key, value) VALUES('created_at', ?)
         ON CONFLICT(key) DO NOTHING`,
      )
      .run(String(Date.now()));

    try {
      chmodSync(file, 0o600);
    } catch {
      // Windows and some filesystems do not support chmod.
    }
  }

  close(): void {
    this.db.close();
  }

  touchUser(user: UserInput): void {
    const now = Date.now();
    const displayName =
      [user.firstName, user.lastName].filter(Boolean).join(' ') || null;

    this.db
      .prepare(
        `INSERT INTO users(user_id, username, display_name, first_seen, last_seen)
         VALUES (?, ?, ?, ?, ?)
         ON CONFLICT(user_id) DO UPDATE SET
           username = COALESCE(excluded.username, users.username),
           display_name = COALESCE(excluded.display_name, users.display_name),
           last_seen = excluded.last_seen`,
      )
      .run(user.id, user.username ?? null, displayName, now, now);
  }

  touchChat(chat: ChatInput): void {
    const now = Date.now();

    this.db
      .prepare(
        `INSERT INTO chats(chat_id, type, title, username, first_seen, last_seen)
         VALUES (?, ?, ?, ?, ?, ?)
         ON CONFLICT(chat_id) DO UPDATE SET
           type = excluded.type,
           title = COALESCE(excluded.title, chats.title),
           username = COALESCE(excluded.username, chats.username),
           last_seen = excluded.last_seen`,
      )
      .run(
        chat.id,
        chat.type,
        chat.title ?? null,
        chat.username ?? null,
        now,
        now,
      );
  }

  recordMessage(userId: number | undefined, chatId: number | undefined): void {
    const now = Date.now();

    if (userId !== undefined) {
      this.db
        .prepare(
          'UPDATE users SET messages = messages + 1, last_seen = ? WHERE user_id = ?',
        )
        .run(now, userId);
    }
    if (chatId !== undefined) {
      this.db
        .prepare(
          'UPDATE chats SET messages = messages + 1, last_seen = ? WHERE chat_id = ?',
        )
        .run(now, chatId);
    }

    this.incrementDaily('messages', now);
  }

  recordLink(userId: number | undefined, chatId: number | undefined): void {
    const now = Date.now();

    if (userId !== undefined) {
      this.db
        .prepare(
          'UPDATE users SET links = links + 1, last_seen = ? WHERE user_id = ?',
        )
        .run(now, userId);
    }
    if (chatId !== undefined) {
      this.db
        .prepare(
          'UPDATE chats SET links = links + 1, last_seen = ? WHERE chat_id = ?',
        )
        .run(now, chatId);
    }

    this.incrementDaily('links', now);
  }

  recordDownload(userId: number | undefined, chatId: number | undefined): void {
    const now = Date.now();

    if (userId !== undefined) {
      this.db
        .prepare(
          'UPDATE users SET downloads = downloads + 1, last_seen = ? WHERE user_id = ?',
        )
        .run(now, userId);
    }
    if (chatId !== undefined) {
      this.db
        .prepare(
          'UPDATE chats SET downloads = downloads + 1, last_seen = ? WHERE chat_id = ?',
        )
        .run(now, chatId);
    }

    this.incrementDaily('downloads', now);
  }

  recordAlbum(userId: number | undefined, chatId: number | undefined): void {
    const now = Date.now();

    if (userId !== undefined) {
      this.db
        .prepare(
          'UPDATE users SET albums = albums + 1, last_seen = ? WHERE user_id = ?',
        )
        .run(now, userId);
    }
    if (chatId !== undefined) {
      this.db
        .prepare(
          'UPDATE chats SET albums = albums + 1, last_seen = ? WHERE chat_id = ?',
        )
        .run(now, chatId);
    }

    this.incrementDaily('albums', now);
  }

  recordInlineQuery(userId: number): void {
    const now = Date.now();

    this.db
      .prepare(
        'UPDATE users SET inline_queries = inline_queries + 1, last_seen = ? WHERE user_id = ?',
      )
      .run(now, userId);

    this.incrementDaily('inline_queries', now);
  }

  recordError(): void {
    this.incrementDaily('errors', Date.now());
  }

  snapshot(): StatsSnapshot {
    const now = Date.now();
    const todayKey = dayKey(now);

    const users = numberValue(
      this.db.prepare('SELECT COUNT(*) AS n FROM users').get() as Row | undefined,
      'n',
    );

    const chatCounts = this.db
      .prepare(
        `SELECT
           COUNT(*) AS total,
           COALESCE(SUM(CASE WHEN type = 'private' THEN 1 ELSE 0 END), 0) AS private,
           COALESCE(SUM(CASE WHEN type IN ('group', 'supergroup') THEN 1 ELSE 0 END), 0) AS groups,
           COALESCE(SUM(CASE WHEN type = 'channel' THEN 1 ELSE 0 END), 0) AS channels
         FROM chats`,
      )
      .get() as Row | undefined;

    const totals = this.db
      .prepare(
        `SELECT
           COALESCE(SUM(messages), 0) AS messages,
           COALESCE(SUM(links), 0) AS links,
           COALESCE(SUM(downloads), 0) AS downloads,
           COALESCE(SUM(albums), 0) AS albums,
           COALESCE(SUM(inline_queries), 0) AS inline_queries
         FROM users`,
      )
      .get() as Row | undefined;

    const errors = numberValue(
      this.db
        .prepare(
          "SELECT COALESCE(SUM(count), 0) AS n FROM daily WHERE metric = 'errors'",
        )
        .get() as Row | undefined,
      'n',
    );

    const sinceRow = this.db
      .prepare("SELECT value FROM meta WHERE key = 'created_at'")
      .get() as Row | undefined;
    const since = Number(stringValue(sinceRow, 'value') ?? now) || now;

    const last7Days: StatsDay[] = [];
    for (let offset = 6; offset >= 0; offset -= 1) {
      last7Days.push(this.dayStats(dayKey(now - offset * 86_400_000)));
    }
    const today = last7Days[6] ?? emptyDay(todayKey);

    const topChats = (
      this.db
        .prepare(
          `SELECT
             chat_id,
             type,
             COALESCE(NULLIF(title, ''), NULLIF(username, ''), CAST(chat_id AS TEXT)) AS label,
             links
           FROM chats
           WHERE type IN ('group', 'supergroup') AND links > 0
           ORDER BY links DESC, last_seen DESC
           LIMIT 5`,
        )
        .all() as Row[]
    ).map((row) => ({
      id: numberValue(row, 'chat_id'),
      title: stringValue(row, 'label') ?? 'Unknown',
      type: stringValue(row, 'type') ?? 'group',
      links: numberValue(row, 'links'),
    }));

    let dbBytes = 0;
    try {
      dbBytes = statSync(this.file).size;
    } catch {
      // The database may be in a transient state.
    }

    return {
      since,
      dbBytes,
      users,
      chats: numberValue(chatCounts, 'total'),
      privateChats: numberValue(chatCounts, 'private'),
      groups: numberValue(chatCounts, 'groups'),
      channels: numberValue(chatCounts, 'channels'),
      messages: numberValue(totals, 'messages'),
      links: numberValue(totals, 'links'),
      downloads: numberValue(totals, 'downloads'),
      albums: numberValue(totals, 'albums'),
      inlineQueries: numberValue(totals, 'inline_queries'),
      errors,
      today,
      last7Days,
      topChats,
    };
  }

  private incrementDaily(metric: string, now: number): void {
    this.db
      .prepare(
        `INSERT INTO daily(day, metric, count) VALUES (?, ?, 1)
         ON CONFLICT(day, metric) DO UPDATE SET count = count + 1`,
      )
      .run(dayKey(now), metric);
  }

  private dayStats(day: string): StatsDay {
    const stats = emptyDay(day);
    const rows = this.db
      .prepare('SELECT metric, count FROM daily WHERE day = ?')
      .all(day) as Row[];

    for (const row of rows) {
      const metric = stringValue(row, 'metric');
      const count = numberValue(row, 'count');
      switch (metric) {
        case 'messages':
          stats.messages = count;
          break;
        case 'links':
          stats.links = count;
          break;
        case 'downloads':
          stats.downloads = count;
          break;
        case 'albums':
          stats.albums = count;
          break;
        case 'inline_queries':
          stats.inlineQueries = count;
          break;
        case 'errors':
          stats.errors = count;
          break;
      }
    }

    return stats;
  }
}
