import { config } from '../config.js';
import { logger } from '../logger.js';
import {
  StateStore,
  type AllowedChat,
  type AllowedUser,
} from '../storage/stateStore.js';

let store: StateStore | undefined;

export async function initAccess(): Promise<void> {
  store = new StateStore(config.dataDir);
  await store.init();
  logger.info('Access control loaded', {
    ownerId: config.ownerId,
    allowedChats: store.listChats().length,
    allowedUsers: store.listUsers().length,
    dataDir: config.dataDir,
  });
}

function getStore(): StateStore {
  if (!store) throw new Error('Access control is not initialised');
  return store;
}

export function isOwner(userId: number | undefined): boolean {
  return userId === config.ownerId;
}

export function isChatAllowed(chatId: number): boolean {
  return getStore().isChatAllowed(chatId);
}

export function isUserAllowed(userId: number): boolean {
  return getStore().isUserAllowed(userId);
}

export function listAllowedUsers(): AllowedUser[] {
  return getStore().listUsers();
}

export function addAllowedUser(input: {
  id: number;
  username?: string;
  displayName?: string;
}): Promise<AllowedUser> {
  return getStore().addUser(input);
}

export function removeAllowedUser(id: number): Promise<boolean> {
  return getStore().removeUser(id);
}

export function listAllowedChats(): AllowedChat[] {
  return getStore().listChats();
}

export function addAllowedChat(input: {
  id: number;
  title?: string;
  type?: string;
}): Promise<AllowedChat> {
  return getStore().addChat(input);
}

export function removeAllowedChat(id: number): Promise<boolean> {
  return getStore().removeChat(id);
}

export function moveAllowedChat(oldId: number, newId: number): Promise<boolean> {
  return getStore().moveChat(oldId, newId);
}
