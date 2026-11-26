import { config } from '../../config.js';
import type { Post } from '../../types.js';
import { TtlCache } from '../cache.js';
import { fetchPost } from './client.js';

const postCache = new TtlCache<Post>({
  ttlMs: config.cacheTtlMs,
  maxEntries: 200,
});

const inflight = new Map<string, Promise<Post>>();

/** Returns a post, reusing cached JSON and de-duplicating concurrent fetches. */
export async function getPost(id: string): Promise<Post> {
  const cached = postCache.get(id);
  if (cached) return cached;

  const pending = inflight.get(id);
  if (pending) return pending;

  const task = fetchPost(id)
    .then((post) => {
      postCache.set(id, post);
      return post;
    })
    .finally(() => {
      inflight.delete(id);
    });

  inflight.set(id, task);
  return task;
}

export function clearPostCache(): void {
  postCache.clear();
}
