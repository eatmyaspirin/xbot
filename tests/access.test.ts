import { describe, expect, it } from 'vitest';

import { parseChatId, parseUserId } from '../src/utils/telegram.js';

describe('parseChatId', () => {
  it.each([
    ['791810678', 791810678],
    ['-1001234567890', -1001234567890],
    ['  -1009876543210  ', -1009876543210],
  ])('parses %s', (input, expected) => {
    expect(parseChatId(input)).toBe(expected);
  });

  it.each([
    '',
    '0',
    '-0',
    '@channelname',
    '123 456',
    '1.5',
    'abc',
    '99999999999999999999',
  ])('rejects %s', (input) => {
    expect(parseChatId(input)).toBeNull();
  });
});

describe('parseUserId', () => {
  it.each([
    ['791810678', 791810678],
    [' 123456789 ', 123456789],
  ])('parses %s', (input, expected) => {
    expect(parseUserId(input)).toBe(expected);
  });

  it.each(['', '0', '-1001234567890', '@username', '1.5', 'abc'])(
    'rejects %s',
    (input) => {
      expect(parseUserId(input)).toBeNull();
    },
  );
});
