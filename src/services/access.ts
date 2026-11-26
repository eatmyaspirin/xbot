import { config } from '../config.js';
import { logger } from '../logger.js';
import { StateStore, type AllowedChat } from '../storage/stateStore.js';

let store: StateStore | undefined;

export async function initAccess(): Promise<void> {
  store = new StateStore(config.dataDir);
  await store.init();
  logger.info('Access control loaded', {
    ownerId: config.ownerId,
    allowedChats: store.listChats().length,
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
