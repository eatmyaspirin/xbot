import { chmod, mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { createLogger } from '../logger.js';

const log = createLogger('state');

export interface AllowedChat {
  id: number;
  title?: string;
  type?: string;
  addedAt: string;
}

export interface AllowedUser {
  id: number;
  username?: string;
  displayName?: string;
  addedAt: string;
}

export interface BotSettings {
  inlineUserGate: boolean;
}

interface PersistedState {
  chats: AllowedChat[];
  users: AllowedUser[];
  settings: BotSettings;
}

function defaultState(): PersistedState {
  return {
    chats: [],
    users: [],
    settings: { inlineUserGate: true },
  };
}

function isChatId(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value !== 0;
}

function cleanText(value: unknown, maxLength: number): string | undefined {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  return trimmed ? trimmed.slice(0, maxLength) : undefined;
}

function sanitizeChat(value: unknown): AllowedChat | null {
  if (!value || typeof value !== 'object') return null;
  const record = value as Record<string, unknown>;
  if (!isChatId(record.id)) return null;

  const title = cleanText(record.title, 200);
  const type = cleanText(record.type, 40);
  const addedAt = cleanText(record.addedAt, 40) ?? new Date().toISOString();

  return {
    id: record.id,
    ...(title ? { title } : {}),
    ...(type ? { type } : {}),
    addedAt,
  };
}

function sanitizeUser(value: unknown): AllowedUser | null {
  if (!value || typeof value !== 'object') return null;
  const record = value as Record<string, unknown>;
  if (
    typeof record.id !== 'number' ||
    !Number.isSafeInteger(record.id) ||
    record.id <= 0
  ) {
    return null;
  }

  const username = cleanText(record.username, 64);
  const displayName = cleanText(record.displayName, 200);
  const addedAt = cleanText(record.addedAt, 40) ?? new Date().toISOString();

  return {
    id: record.id,
    ...(username ? { username } : {}),
    ...(displayName ? { displayName } : {}),
    addedAt,
  };
}

function sanitizeSettings(value: unknown): BotSettings {
  if (!value || typeof value !== 'object') return { inlineUserGate: true };
  const record = value as Record<string, unknown>;
  return {
    inlineUserGate:
      typeof record.inlineUserGate === 'boolean'
        ? record.inlineUserGate
        : true,
  };
}

function sanitizeState(value: unknown): PersistedState {
  if (!value || typeof value !== 'object') return defaultState();

  const record = value as Record<string, unknown>;
  const chats: AllowedChat[] = [];
  const users: AllowedUser[] = [];
  const seenChats = new Set<number>();
  const seenUsers = new Set<number>();

  if (Array.isArray(record.chats)) {
    for (const item of record.chats) {
      const chat = sanitizeChat(item);
      if (!chat || seenChats.has(chat.id)) continue;
      seenChats.add(chat.id);
      chats.push(chat);
    }
  }

  if (Array.isArray(record.users)) {
    for (const item of record.users) {
      const user = sanitizeUser(item);
      if (!user || seenUsers.has(user.id)) continue;
      seenUsers.add(user.id);
      users.push(user);
    }
  }

  return { chats, users, settings: sanitizeSettings(record.settings) };
}

/**
 * Small JSON-file store for the chat allowlist. Writes are serialized and
 * atomic (temp file + rename) so a crash cannot leave a half-written file.
 */
export class StateStore {
  private readonly file: string;
  private state: PersistedState = defaultState();
  private writeChain: Promise<void> = Promise.resolve();

  constructor(private readonly dataDir: string) {
    this.file = path.join(dataDir, 'state.json');
  }

  async init(): Promise<void> {
    await mkdir(this.dataDir, { recursive: true, mode: 0o750 });

    try {
      const raw = await readFile(this.file, 'utf8');
      this.state = sanitizeState(JSON.parse(raw) as unknown);
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      if (code === 'ENOENT') {
        this.state = defaultState();
        await this.persist();
        return;
      }

      log.error('Could not read state file; moving it aside', {
        file: this.file,
        error,
      });
      await rename(this.file, `${this.file}.corrupt-${Date.now()}`).catch(() => {});
      this.state = defaultState();
      await this.persist();
    }
  }

  listChats(): AllowedChat[] {
    return this.state.chats.map((chat) => ({ ...chat }));
  }

  isChatAllowed(id: number): boolean {
    return this.state.chats.some((chat) => chat.id === id);
  }

  listUsers(): AllowedUser[] {
    return this.state.users.map((user) => ({ ...user }));
  }

  isUserAllowed(id: number): boolean {
    return this.state.users.some((user) => user.id === id);
  }

  get inlineUserGate(): boolean {
    return this.state.settings.inlineUserGate;
  }

  async setInlineUserGate(enabled: boolean): Promise<void> {
    this.state.settings.inlineUserGate = enabled;
    await this.persist();
  }

  async addUser(input: {
    id: number;
    username?: string;
    displayName?: string;
  }): Promise<AllowedUser> {
    const existing = this.state.users.find((user) => user.id === input.id);

    if (existing) {
      if (input.username !== undefined) existing.username = input.username;
      if (input.displayName !== undefined) existing.displayName = input.displayName;
      await this.persist();
      return { ...existing };
    }

    const entry: AllowedUser = {
      id: input.id,
      ...(input.username ? { username: input.username } : {}),
      ...(input.displayName ? { displayName: input.displayName } : {}),
      addedAt: new Date().toISOString(),
    };
    this.state.users.push(entry);
    await this.persist();
    return { ...entry };
  }

  async removeUser(id: number): Promise<boolean> {
    const before = this.state.users.length;
    this.state.users = this.state.users.filter((user) => user.id !== id);
    if (this.state.users.length === before) return false;

    await this.persist();
    return true;
  }

  async addChat(input: {
    id: number;
    title?: string;
    type?: string;
  }): Promise<AllowedChat> {
    const existing = this.state.chats.find((chat) => chat.id === input.id);

    if (existing) {
      if (input.title !== undefined) existing.title = input.title;
      if (input.type !== undefined) existing.type = input.type;
      await this.persist();
      return { ...existing };
    }

    const entry: AllowedChat = {
      id: input.id,
      ...(input.title ? { title: input.title } : {}),
      ...(input.type ? { type: input.type } : {}),
      addedAt: new Date().toISOString(),
    };
    this.state.chats.push(entry);
    await this.persist();
    return { ...entry };
  }

  async removeChat(id: number): Promise<boolean> {
    const before = this.state.chats.length;
    this.state.chats = this.state.chats.filter((chat) => chat.id !== id);
    if (this.state.chats.length === before) return false;

    await this.persist();
    return true;
  }

  async moveChat(oldId: number, newId: number): Promise<boolean> {
    const chat = this.state.chats.find((item) => item.id === oldId);
    if (!chat) return false;

    const duplicate = this.state.chats.find(
      (item) => item.id === newId && item !== chat,
    );

    if (duplicate) {
      this.state.chats = this.state.chats.filter((item) => item !== chat);
    } else {
      chat.id = newId;
    }

    await this.persist();
    return true;
  }

  private persist(): Promise<void> {
    const data = JSON.stringify(this.state, null, 2);
    const write = this.writeChain.then(
      () => this.writeState(data),
      () => this.writeState(data),
    );
    this.writeChain = write.catch(() => {});
    return write;
  }

  private async writeState(data: string): Promise<void> {
    const temp = `${this.file}.${process.pid}.tmp`;
    await writeFile(temp, data, { mode: 0o600 });

    try {
      await rename(temp, this.file);
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      if (code === 'EEXIST' || code === 'EPERM') {
        await rm(this.file, { force: true });
        await rename(temp, this.file);
      } else {
        throw error;
      }
    }

    await chmod(this.file, 0o600).catch(() => {});
  }
}
