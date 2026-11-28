import { describe, expect, it } from 'vitest';

import { createLogger, getRecentLogs } from '../src/logger.js';

describe('logger buffer', () => {
  it('retains recent log lines in memory', () => {
    const marker = `log-test-${Date.now()}-${Math.random()}`;
    createLogger('test').info(marker);

    const lines = getRecentLogs(100);
    expect(lines.some((line) => line.includes(marker))).toBe(true);
    expect(lines.at(-1)).toContain(marker);
  });
});
