import 'dotenv/config';

import path from 'node:path';

import type { LogLevel } from './logger.js';

const MB = 1024 * 1024;

function required(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`Missing ${name}. Copy .env.example to .env and set ${name}.`);
  }
  return value;
}

function positiveInt(name: string, fallback: number): number {
  const raw = process.env[name]?.trim();
  if (!raw) return fallback;
  const value = Number(raw);
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error(`${name} must be a positive number, got "${raw}".`);
  }
  return Math.floor(value);
}

function optionalBase(name: string, fallback: string): string | null {
  const raw = process.env[name];
  if (raw === undefined) return fallback;
  const trimmed = raw.trim();
  return trimmed ? trimmed.replace(/\/+$/, '') : null;
}

function boolean(name: string, fallback: boolean): boolean {
  const raw = process.env[name]?.trim().toLowerCase();
  if (!raw) return fallback;
  return ['1', 'true', 'yes', 'on'].includes(raw);
}

function optionalOwnerId(): number | null {
  const raw = process.env.OWNER_ID?.trim();
  if (!raw) return null;
  if (!/^\d{1,20}$/.test(raw)) {
    throw new Error('OWNER_ID must be your numeric Telegram user ID.');
  }
  const id = Number(raw);
  if (!Number.isSafeInteger(id) || id <= 0) {
    throw new Error('OWNER_ID must be a positive integer.');
  }
  return id;
}

const botToken = required('BOT_TOKEN');
if (!/^\d+:[A-Za-z0-9_-]{20,}$/.test(botToken)) {
  throw new Error('BOT_TOKEN does not look like a Telegram bot token (expected "<id>:<secret>").');
}

const logLevel = (process.env.LOG_LEVEL?.trim().toLowerCase() || 'info') as LogLevel;
if (!['debug', 'info', 'warn', 'error'].includes(logLevel)) {
  throw new Error('LOG_LEVEL must be one of: debug, info, warn, error.');
}

const ownerId = optionalOwnerId();
if (ownerId === null) {
  throw new Error('OWNER_ID is required (your numeric Telegram user ID) to control access.');
}

export const config = {
  botToken,
  ownerId,
  dataDir: path.resolve(process.env.DATA_DIR?.trim() || './data'),
  xApiBase: optionalBase('X_API_BASE', 'https://api.fxtwitter.com'),
  xFallbackApiBase: optionalBase('X_FALLBACK_API_BASE', 'https://api.vxtwitter.com'),
  maxPhotoBytes: positiveInt('MAX_PHOTO_MB', 10) * MB,
  maxVideoBytes: positiveInt('MAX_VIDEO_MB', 45) * MB,
  maxDownloadBytes: positiveInt('MAX_DOWNLOAD_MB', 45) * MB,
  mediaCacheBytes: positiveInt('MEDIA_CACHE_MB', 64) * MB,
  cacheTtlMs: positiveInt('CACHE_TTL_MINUTES', 30) * 60_000,
  requestTimeoutMs: positiveInt('REQUEST_TIMEOUT_SECONDS', 20) * 1000,
  maxLinksPerMessage: positiveInt('MAX_LINKS_PER_MESSAGE', 2),
  dropPendingUpdates: boolean('DROP_PENDING_UPDATES', false),
  logLevel,
} as const;

export type Config = typeof config;
