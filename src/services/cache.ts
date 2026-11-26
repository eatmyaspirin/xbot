interface CacheEntry<V> {
  value: V;
  expiresAt: number;
}

export interface TtlCacheOptions<V> {
  ttlMs: number;
  maxEntries?: number;
  maxBytes?: number;
  sizeOf?: (value: V) => number;
}

/**
 * Small in-process LRU cache with a TTL and an optional byte budget.
 * Good enough for a single-process bot; swap for Redis if you scale out.
 */
export class TtlCache<V> {
  private readonly entries = new Map<string, CacheEntry<V>>();
  private readonly ttlMs: number;
  private readonly maxEntries: number;
  private readonly maxBytes: number;
  private readonly sizeOf: ((value: V) => number) | undefined;
  private bytes = 0;

  constructor(options: TtlCacheOptions<V>) {
    this.ttlMs = options.ttlMs;
    this.maxEntries = options.maxEntries ?? 500;
    this.maxBytes = options.maxBytes ?? Number.POSITIVE_INFINITY;
    this.sizeOf = options.sizeOf;
  }

  get size(): number {
    return this.entries.size;
  }

  get byteSize(): number {
    return this.bytes;
  }

  get(key: string): V | undefined {
    const entry = this.entries.get(key);
    if (!entry) return undefined;
    if (entry.expiresAt <= Date.now()) {
      this.delete(key);
      return undefined;
    }
    // Refresh recency.
    this.entries.delete(key);
    this.entries.set(key, entry);
    return entry.value;
  }

  set(key: string, value: V): void {
    this.delete(key);
    this.entries.set(key, { value, expiresAt: Date.now() + this.ttlMs });
    if (this.sizeOf) this.bytes += this.sizeOf(value);
    this.evict();
  }

  delete(key: string): void {
    const entry = this.entries.get(key);
    if (!entry) return;
    this.entries.delete(key);
    if (this.sizeOf) this.bytes -= this.sizeOf(entry.value);
  }

  clear(): void {
    this.entries.clear();
    this.bytes = 0;
  }

  private evict(): void {
    while (
      (this.entries.size > this.maxEntries || this.bytes > this.maxBytes) &&
      this.entries.size > 1
    ) {
      const oldest = this.entries.keys().next().value;
      if (oldest === undefined) break;
      this.delete(oldest);
    }
  }
}
