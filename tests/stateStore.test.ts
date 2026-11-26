import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { StateStore } from '../src/storage/stateStore.js';

const dirs: string[] = [];

async function makeDir(): Promise<string> {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'xbot-state-'));
  dirs.push(dir);
  return dir;
}

afterEach(async () => {
  await Promise.all(
    dirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })),
  );
});

describe('StateStore', () => {
  it('starts empty and persists allowed chats', async () => {
    const dir = await makeDir();
    const store = new StateStore(dir);
    await store.init();

    expect(store.listChats()).toEqual([]);
    expect(store.listUsers()).toEqual([]);
    expect(await readFile(path.join(dir, 'state.json'), 'utf8')).toContain('"chats"');

    const entry = await store.addChat({
      id: -100123,
      title: 'Group',
      type: 'supergroup',
    });
    expect(entry.id).toBe(-100123);
    expect(store.isChatAllowed(-100123)).toBe(true);
    expect(store.isChatAllowed(791810678)).toBe(false);

    const reloaded = new StateStore(dir);
    await reloaded.init();
    expect(reloaded.listChats()).toHaveLength(1);
    expect(reloaded.listChats()[0]).toMatchObject({
      id: -100123,
      title: 'Group',
      type: 'supergroup',
    });
  });

  it('persists allowed users', async () => {
    const dir = await makeDir();
    const store = new StateStore(dir);
    await store.init();

    const entry = await store.addUser({
      id: 123456789,
      username: 'friend',
      displayName: 'Friend',
    });
    expect(entry.id).toBe(123456789);
    expect(store.isUserAllowed(123456789)).toBe(true);
    expect(store.isUserAllowed(987654321)).toBe(false);

    const reloaded = new StateStore(dir);
    await reloaded.init();
    expect(reloaded.listUsers()).toHaveLength(1);
    expect(reloaded.listUsers()[0]).toMatchObject({
      id: 123456789,
      username: 'friend',
      displayName: 'Friend',
    });
  });

  it('updates duplicate users and removes them', async () => {
    const dir = await makeDir();
    const store = new StateStore(dir);
    await store.init();

    await store.addUser({ id: 123, username: 'old' });
    await store.addUser({ id: 123, username: 'new', displayName: 'New Name' });

    expect(store.listUsers()).toHaveLength(1);
    expect(store.listUsers()[0]?.username).toBe('new');
    expect(store.listUsers()[0]?.displayName).toBe('New Name');
    expect(await store.removeUser(999)).toBe(false);
    expect(await store.removeUser(123)).toBe(true);
    expect(store.listUsers()).toEqual([]);
  });

  it('updates a duplicate instead of appending it', async () => {
    const dir = await makeDir();
    const store = new StateStore(dir);
    await store.init();

    await store.addChat({ id: -1001, title: 'Old' });
    await store.addChat({ id: -1001, title: 'New', type: 'group' });

    expect(store.listChats()).toHaveLength(1);
    expect(store.listChats()[0]?.title).toBe('New');
    expect(store.listChats()[0]?.type).toBe('group');
  });

  it('removes and moves chats', async () => {
    const dir = await makeDir();
    const store = new StateStore(dir);
    await store.init();

    await store.addChat({ id: -1001, title: 'Before migration' });
    expect(await store.removeChat(-2000)).toBe(false);
    expect(await store.moveChat(-1001, -1002)).toBe(true);
    expect(store.isChatAllowed(-1001)).toBe(false);
    expect(store.isChatAllowed(-1002)).toBe(true);
    expect(await store.removeChat(-1002)).toBe(true);
    expect(store.listChats()).toEqual([]);
  });

  it('drops invalid and duplicate entries from disk', async () => {
    const dir = await makeDir();
    await writeFile(
      path.join(dir, 'state.json'),
      JSON.stringify({
        chats: [
          { id: 'nope' },
          { id: 0 },
          { id: -1001, title: '  ok  ', addedAt: 'then' },
          { id: -1002, title: 'dupe' },
          { id: -1002, title: 'later' },
        ],
        users: [
          { id: 'nope' },
          { id: 0 },
          { id: -5 },
          {
            id: 123,
            username: '  friend  ',
            displayName: '  Friend  ',
            addedAt: 'then',
          },
          { id: 123, username: 'dupe' },
        ],
      }),
    );

    const store = new StateStore(dir);
    await store.init();
    const chats = store.listChats();
    const users = store.listUsers();

    expect(chats.map((chat) => chat.id)).toEqual([-1001, -1002]);
    expect(chats[0]?.title).toBe('ok');
    expect(chats[1]?.title).toBe('dupe');
    expect(users.map((user) => user.id)).toEqual([123]);
    expect(users[0]?.username).toBe('friend');
    expect(users[0]?.displayName).toBe('Friend');
  });

  it('recovers from an unreadable state file', async () => {
    const dir = await makeDir();
    await writeFile(path.join(dir, 'state.json'), '{not-json');

    const store = new StateStore(dir);
    await store.init();

    expect(store.listChats()).toEqual([]);
    expect(store.listUsers()).toEqual([]);
    const files = await import('node:fs/promises').then((fs) => fs.readdir(dir));
    expect(files.some((file) => file.startsWith('state.json.corrupt-'))).toBe(true);
  });
});
