import { describe, expect, it } from 'vitest';

import {
  extractStatusLinks,
  looksLikeXLink,
  parseStatusUrl,
} from '../src/utils/xurl.js';

const ID = '2125649126398591003';

describe('parseStatusUrl', () => {
  const cases: Array<[string, string, string | null]> = [
    [`https://x.com/SpaceX/status/${ID}`, ID, 'SpaceX'],
    [`https://twitter.com/SpaceX/status/${ID}?s=20&t=abc`, ID, 'SpaceX'],
    [`x.com/spacex/status/${ID}/photo/1`, ID, 'spacex'],
    [`https://mobile.twitter.com/SpaceX/status/${ID}`, ID, 'SpaceX'],
    [`https://fxtwitter.com/SpaceX/status/${ID}`, ID, 'SpaceX'],
    [`https://vxtwitter.com/SpaceX/status/${ID}`, ID, 'SpaceX'],
    [`https://fixupx.com/SpaceX/status/${ID}`, ID, 'SpaceX'],
    [`(https://x.com/SpaceX/status/${ID}).`, ID, 'SpaceX'],
    [`https://x.com/i/web/status/${ID}`, ID, null],
    [`https://x.com/not-a-handle/status/${ID}`, ID, null],
  ];

  it.each(cases)('parses %s', (input, id, handle) => {
    const link = parseStatusUrl(input);
    expect(link).not.toBeNull();
    expect(link?.id).toBe(id);
    expect(link?.handle).toBe(handle);
    expect(link?.canonical).toBe(
      handle ? `https://x.com/${handle}/status/${id}` : `https://x.com/i/web/status/${id}`,
    );
  });

  it('rejects links that are not posts', () => {
    expect(parseStatusUrl('https://x.com/SpaceX')).toBeNull();
    expect(parseStatusUrl('https://example.com/SpaceX/status/123')).toBeNull();
    expect(parseStatusUrl('https://x.com/SpaceX/status/not-a-number')).toBeNull();
    expect(parseStatusUrl('https://x.com/SpaceX/statuses/123')).toBeNull();
    expect(parseStatusUrl('')).toBeNull();
  });
});

describe('extractStatusLinks', () => {
  it('deduplicates by post id and keeps order', () => {
    const links = extractStatusLinks(
      `look https://x.com/a/status/111 and https://twitter.com/b/status/111 plus https://x.com/b/status/222`,
    );
    expect(links.map((link) => link.id)).toEqual(['111', '222']);
  });

  it('ignores unrelated text', () => {
    expect(extractStatusLinks('hello, no links here')).toEqual([]);
  });
});

describe('looksLikeXLink', () => {
  it('detects x links without requiring a valid status id', () => {
    expect(looksLikeXLink('check x.com/foo')).toBe(true);
    expect(looksLikeXLink('https://twitter.com/foo')).toBe(true);
    expect(looksLikeXLink('nothing to see')).toBe(false);
  });
});
