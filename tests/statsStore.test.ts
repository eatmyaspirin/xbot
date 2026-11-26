import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { StatsStore } from '../src/storage/statsStore.js';
import { formatStats } from '../src/ui/stats.js';

let root: string | undefined;
let store: StatsStore | undefined;

async function open(): Promise<StatsStore> {
  root = await mkdtemp(path.join(os.tmpdir(), 'xbot-stats-'));
  store = new StatsStore(path.join(root, 'stats.db'));
  return store;
}

afterEach(async () => {
  store?.close();
  store = undefined;
  if (root) {
    await rm(root, { recursive: true, force: true });
    root = undefined;
  }
});

describe('StatsStore', () => {
  it('records and aggregates usage', async () => {
    const stats = await open();

    stats.touchUser({
      id: 791810678,
      username: 'owner',
      firstName: 'Owner',
    });
    stats.touchChat({
      id: -1001,
      type: 'supergroup',
      title: 'Group One',
      username: 'group_one',
    });

    stats.recordMessage(791810678, -1001);
    stats.recordLink(791810678, -1001);
    stats.recordDownload(791810678, -1001);
    stats.recordAlbum(791810678, -1001);
    stats.recordInlineQuery(791810678);
    stats.recordError();

    const snapshot = stats.snapshot();

    expect(snapshot.users).toBe(1);
    expect(snapshot.chats).toBe(1);
    expect(snapshot.privateChats).toBe(0);
    expect(snapshot.groups).toBe(1);
    expect(snapshot.channels).toBe(0);
    expect(snapshot.messages).toBe(1);
    expect(snapshot.links).toBe(1);
    expect(snapshot.downloads).toBe(1);
    expect(snapshot.albums).toBe(1);
    expect(snapshot.inlineQueries).toBe(1);
    expect(snapshot.errors).toBe(1);
    expect(snapshot.today.links).toBe(1);
    expect(snapshot.today.downloads).toBe(1);
    expect(snapshot.today.inlineQueries).toBe(1);
    expect(snapshot.last7Days).toHaveLength(7);
    expect(snapshot.last7Days[6]?.day).toBe(new Date().toISOString().slice(0, 10));
    expect(snapshot.topChats[0]).toMatchObject({
      id: -1001,
      title: 'Group One',
      links: 1,
    });
    expect(snapshot.since).toBeGreaterThan(0);
    expect(snapshot.dbBytes).toBeGreaterThan(0);
  });

  it('counts unique users and chats and persists them', async () => {
    const first = await open();

    first.touchUser({ id: 1, firstName: 'One' });
    first.touchUser({ id: 2, firstName: 'Two' });
    first.touchChat({ id: 1, type: 'private', title: 'One' });
    first.touchChat({ id: -1001, type: 'group', title: 'Group' });
    first.recordMessage(1, 1);
    first.recordLink(2, -1001);

    first.close();
    store = undefined;

    store = new StatsStore(path.join(root as string, 'stats.db'));
    const snapshot = store.snapshot();

    expect(snapshot.users).toBe(2);
    expect(snapshot.chats).toBe(2);
    expect(snapshot.privateChats).toBe(1);
    expect(snapshot.groups).toBe(1);
    expect(snapshot.messages).toBe(1);
    expect(snapshot.links).toBe(1);
  });

  it('formats a readable stats message', async () => {
    const stats = await open();
    stats.touchUser({ id: 1, firstName: 'One' });
    stats.touchChat({ id: -1001, type: 'supergroup', title: 'Group One' });
    stats.recordLink(1, -1001);

    const text = formatStats(stats.snapshot());

    expect(text).toContain('Users: 1');
    expect(text).toContain('Chats: 1 (private 0, groups 1, channels 0)');
    expect(text).toContain('Links: 1 (today 1)');
    expect(text).toContain('Last 7 days (UTC)');
    expect(text).toContain('Top groups');
    expect(text).toContain('Group One - 1 links');
    expect(text).toContain('Since');
  });
});
