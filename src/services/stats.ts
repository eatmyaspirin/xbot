import path from 'node:path';

import { config } from '../config.js';
import { logger } from '../logger.js';
import {
  StatsStore,
  type ChatInput,
  type StatsSnapshot,
  type UserInput,
} from '../storage/statsStore.js';

let store: StatsStore | undefined;

export function initStats(): void {
  const file = path.join(config.dataDir, 'stats.db');
  store = new StatsStore(file);
  const snapshot = store.snapshot();
  logger.info('Stats database ready', {
    file,
    users: snapshot.users,
    chats: snapshot.chats,
  });
}

export function closeStats(): void {
  store?.close();
  store = undefined;
}

function get(): StatsStore {
  if (!store) throw new Error('Stats store is not initialised');
  return store;
}

function safe(label: string, action: () => void): void {
  if (!store) return;
  try {
    action();
  } catch (error) {
    logger.warn(`Stats ${label} failed`, { error });
  }
}

export function touchUser(user: UserInput): void {
  safe('touchUser', () => get().touchUser(user));
}

export function touchChat(chat: ChatInput): void {
  safe('touchChat', () => get().touchChat(chat));
}

export function recordMessage(
  userId: number | undefined,
  chatId: number | undefined,
): void {
  safe('recordMessage', () => get().recordMessage(userId, chatId));
}

export function recordLink(
  userId: number | undefined,
  chatId: number | undefined,
): void {
  safe('recordLink', () => get().recordLink(userId, chatId));
}

export function recordDownload(
  userId: number | undefined,
  chatId: number | undefined,
): void {
  safe('recordDownload', () => get().recordDownload(userId, chatId));
}

export function recordAlbum(
  userId: number | undefined,
  chatId: number | undefined,
): void {
  safe('recordAlbum', () => get().recordAlbum(userId, chatId));
}

export function recordInlineQuery(userId: number): void {
  safe('recordInlineQuery', () => get().recordInlineQuery(userId));
}

export function recordError(): void {
  safe('recordError', () => get().recordError());
}

export function getStatsSnapshot(): StatsSnapshot {
  return get().snapshot();
}
