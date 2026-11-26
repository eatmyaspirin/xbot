import { describe, expect, it } from 'vitest';

import type { MediaItem, Post } from '../src/types.js';
import type { InlineKeyboardButton } from 'grammy/types';

import {
  buildCaption,
  buildKeyboard,
  buildCallbackData,
  parseCallbackData,
  toInputMedia,
} from '../src/ui/carousel.js';

function callbackDataAt(
  rows: InlineKeyboardButton[][],
  row: number,
  column: number,
): string | undefined {
  const button = rows[row]?.[column];
  return button && 'callback_data' in button ? button.callback_data : undefined;
}

function urlAt(
  rows: InlineKeyboardButton[][],
  row: number,
  column: number,
): string | undefined {
  const button = rows[row]?.[column];
  return button && 'url' in button ? button.url : undefined;
}

const photo: MediaItem = {
  kind: 'photo',
  url: 'https://pbs.twimg.com/media/A.jpg?name=orig',
  width: 1200,
  height: 800,
};

function makePost(overrides: Partial<Post> = {}): Post {
  return {
    id: '1234567890',
    url: 'https://x.com/user/status/1234567890',
    authorName: 'A <B>',
    authorHandle: 'user',
    text: 'Hello <world> & friends',
    createdAt: null,
    sensitive: false,
    media: [photo, photo, photo],
    ...overrides,
  };
}

describe('buildCaption', () => {
  it('escapes author, handle and body text', () => {
    const caption = buildCaption(makePost(), 1);
    expect(caption).toContain('<b>A &lt;B&gt;</b> (@user)');
    expect(caption).toContain('Hello &lt;world&gt; &amp; friends');
    expect(caption).not.toContain('<world>');
    expect(caption).toContain('2/3');
    expect(caption).toContain('https://x.com/user/status/1234567890');
  });

  it('omits the counter for single-item posts', () => {
    const caption = buildCaption(makePost({ media: [photo] }), 0);
    expect(caption).not.toContain('1/1');
    expect(caption).toContain('Open on X');
  });

  it('never exceeds Telegram’s caption limit', () => {
    const caption = buildCaption(makePost({ text: 'x'.repeat(10_000) }), 0);
    expect(caption.length).toBeLessThanOrEqual(1024);
    expect(caption).toContain('…');
  });

  it('stays under the limit even when the text is full of HTML entities', () => {
    const caption = buildCaption(makePost({ text: '&'.repeat(2_000) }), 0);
    expect(caption.length).toBeLessThanOrEqual(1024);
  });
});

describe('keyboard and callback data', () => {
  it('wraps navigation and includes the counter', () => {
    const rows = buildKeyboard(makePost(), 0).inline_keyboard;
    expect(callbackDataAt(rows, 0, 0)).toBe(buildCallbackData('1234567890', 2));
    expect(callbackDataAt(rows, 0, 1)).toBe('car:noop');
    expect(callbackDataAt(rows, 0, 2)).toBe(buildCallbackData('1234567890', 1));
    expect(urlAt(rows, 1, 0)).toBe('https://x.com/user/status/1234567890');
  });

  it('shows only the link for a single media item', () => {
    const rows = buildKeyboard(makePost({ media: [photo] }), 0).inline_keyboard;
    expect(rows).toHaveLength(1);
    expect(urlAt(rows, 0, 0)).toBe('https://x.com/user/status/1234567890');
  });

  it('round-trips callback data', () => {
    expect(parseCallbackData(buildCallbackData('1234567890', 7))).toEqual({
      postId: '1234567890',
      index: 7,
    });
  });

  it('rejects malformed callback data', () => {
    expect(parseCallbackData('car:noop')).toBeNull();
    expect(parseCallbackData('car:123:1:extra')).toBeNull();
    expect(parseCallbackData('car:abc:1')).toBeNull();
    expect(parseCallbackData('other:123:1')).toBeNull();
    expect(parseCallbackData('car:123:-1')).toBeNull();
  });
});

describe('toInputMedia', () => {
  const file = {
    bytes: Buffer.from('fake-image'),
    contentType: 'image/jpeg',
    filename: 'xbot-photo.jpg',
  };

  it('builds photo input media with an HTML caption', () => {
    const media = toInputMedia(makePost(), 0, file);
    expect(media.type).toBe('photo');
    expect(media.caption).toContain('1/3');
    expect(media.parse_mode).toBe('HTML');
  });

  it('marks sensitive posts as spoilers', () => {
    const media = toInputMedia(makePost({ sensitive: true }), 0, file);
    expect(media.has_spoiler).toBe(true);
  });

  it('builds video input media', () => {
    const post = makePost({
      media: [{ ...photo, kind: 'video', url: 'https://video.twimg.com/v.mp4' }],
    });
    expect(toInputMedia(post, 0, { ...file, filename: 'xbot-video.mp4' }).type).toBe('video');
  });
});
