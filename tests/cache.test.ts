import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { TtlCache } from '../src/services/cache.js';

describe('TtlCache', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('expires entries after the ttl', () => {
    const cache = new TtlCache<string>({ ttlMs: 1_000 });
    cache.set('a', 'one');
    expect(cache.get('a')).toBe('one');

    vi.advanceTimersByTime(1_001);
    expect(cache.get('a')).toBeUndefined();
    expect(cache.size).toBe(0);
  });

  it('evicts the least recently used entry when full', () => {
    const cache = new TtlCache<string>({ ttlMs: 10_000, maxEntries: 2 });
    cache.set('a', 'one');
    cache.set('b', 'two');
    expect(cache.get('a')).toBe('one');

    cache.set('c', 'three');
    expect(cache.get('b')).toBeUndefined();
    expect(cache.get('a')).toBe('one');
    expect(cache.get('c')).toBe('three');
  });

  it('respects a byte budget', () => {
    const cache = new TtlCache<string>({
      ttlMs: 10_000,
      maxBytes: 5,
      sizeOf: (value) => value.length,
    });
    cache.set('a', 'abc');
    cache.set('b', 'defg');
    expect(cache.get('a')).toBeUndefined();
    expect(cache.get('b')).toBe('defg');
    expect(cache.byteSize).toBe(4);
  });

  it('clears everything', () => {
    const cache = new TtlCache<string>({ ttlMs: 10_000 });
    cache.set('a', 'one');
    cache.set('b', 'two');
    cache.clear();
    expect(cache.size).toBe(0);
    expect(cache.byteSize).toBe(0);
  });
});
