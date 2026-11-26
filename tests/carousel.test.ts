import { InputFile } from 'grammy';
import type { InlineKeyboardButton } from 'grammy/types';
import { describe, expect, it } from 'vitest';

import type { MediaItem, Post } from '../src/types.js';
import {
  buildCallbackData,
  buildCaption,
  buildCarouselKeyboard,
  buildGridKeyboard,
  inlinePhotoUrl,
  parseCallbackData,
  toAlbumInputMedia,
  toCarouselInputMedia,
  toGridInputMedia,
} from '../src/ui/carousel.js';

const photo: MediaItem = {
  kind: 'photo',
  url: 'https://pbs.twimg.com/media/A.jpg?name=orig',
  width: 1200,
  height: 800,
};

const video: MediaItem = {
  kind: 'video',
  url: 'https://video.twimg.com/v/720.mp4',
  thumbnailUrl: 'https://pbs.twimg.com/media/thumb.jpg',
  width: 1280,
  height: 720,
  duration: 5,
};

const file = {
  bytes: Buffer.from('fake-image'),
  contentType: 'image/jpeg',
  filename: 'xbot-photo.jpg',
};

const MOSAIC = 'https://mosaic.fxtwitter.com/jpeg/1234567890/A/B';

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
    mosaicUrl: MOSAIC,
    ...overrides,
  };
}

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

function textAt(
  rows: InlineKeyboardButton[][],
  row: number,
  column: number,
): string | undefined {
  return rows[row]?.[column]?.text;
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

  it('labels grid and album views', () => {
    expect(buildCaption(makePost(), 0, { view: 'grid' })).toContain('🖼 Grid (3)');
    expect(buildCaption(makePost(), 0, { view: 'album' })).toContain('📚 Album (3)');
  });

  it('returns an empty caption when text is hidden', () => {
    expect(buildCaption(makePost(), 0, { showText: false })).toBe('');
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

describe('callback data', () => {
  it('round-trips mode, position and text state', () => {
    const data = buildCallbackData('carousel', '1234567890', 7, false);
    expect(data).toBe('xb:c:1234567890:7:0');
    expect(data.length).toBeLessThan(64);
    expect(parseCallbackData(data)).toEqual({
      mode: 'carousel',
      postId: '1234567890',
      index: 7,
      showText: false,
    });
  });

  it('parses grid and album actions', () => {
    expect(parseCallbackData(buildCallbackData('grid', '123', 0, true))?.mode).toBe('grid');
    expect(parseCallbackData(buildCallbackData('album', '123', 0, true))?.mode).toBe('album');
  });

  it('still understands first-release carousel buttons', () => {
    expect(parseCallbackData('car:1234567890:2')).toEqual({
      mode: 'carousel',
      postId: '1234567890',
      index: 2,
      showText: true,
    });
  });

  it('rejects malformed callback data', () => {
    expect(parseCallbackData('xb:noop')).toBeNull();
    expect(parseCallbackData('xb:c:123:1:2:3')).toBeNull();
    expect(parseCallbackData('xb:z:123:1:1')).toBeNull();
    expect(parseCallbackData('xb:c:abc:1:1')).toBeNull();
    expect(parseCallbackData('car:noop')).toBeNull();
    expect(parseCallbackData('other:123:1')).toBeNull();
  });
});

describe('carousel keyboard', () => {
  it('shows navigation, view switches, text toggle and link', () => {
    const rows = buildCarouselKeyboard(makePost(), 0).inline_keyboard;

    expect(callbackDataAt(rows, 0, 0)).toBe(buildCallbackData('carousel', '1234567890', 2));
    expect(callbackDataAt(rows, 0, 1)).toBe('xb:noop');
    expect(callbackDataAt(rows, 0, 2)).toBe(buildCallbackData('carousel', '1234567890', 1));
    expect(textAt(rows, 1, 0)).toBe('🖼 Grid');
    expect(textAt(rows, 1, 1)).toBe('📚 Album');
    expect(textAt(rows, 2, 0)).toBe('📝 Hide text');
    expect(urlAt(rows, 3, 0)).toBe('https://x.com/user/status/1234567890');
  });

  it('hides the album button in inline mode', () => {
    const rows = buildCarouselKeyboard(makePost(), 0, { inline: true }).inline_keyboard;
    expect(textAt(rows, 1, 0)).toBe('🖼 Grid');
    expect(textAt(rows, 1, 1)).not.toBe('📚 Album');
  });

  it('switches the text toggle label when text is hidden', () => {
    const rows = buildCarouselKeyboard(makePost(), 1, { showText: false }).inline_keyboard;
    expect(textAt(rows, 2, 0)).toBe('📝 Show text');
    expect(callbackDataAt(rows, 2, 0)).toBe(
      buildCallbackData('carousel', '1234567890', 1, true),
    );
  });

  it('keeps a single media item minimal', () => {
    const rows = buildCarouselKeyboard(makePost({ media: [photo] }), 0).inline_keyboard;
    expect(rows).toHaveLength(2);
    expect(textAt(rows, 0, 0)).toBe('📝 Hide text');
    expect(urlAt(rows, 1, 0)).toBe('https://x.com/user/status/1234567890');
  });
});

describe('grid keyboard', () => {
  it('numbers each item and offers the other views', () => {
    const rows = buildGridKeyboard(makePost(), { showText: true }).inline_keyboard;

    expect(textAt(rows, 0, 0)).toBe('1');
    expect(callbackDataAt(rows, 0, 0)).toBe(
      buildCallbackData('carousel', '1234567890', 0),
    );
    expect(textAt(rows, 0, 2)).toBe('3');
    expect(textAt(rows, 1, 0)).toBe('🎠 Carousel');
    expect(textAt(rows, 1, 1)).toBe('📚 Album');
    expect(textAt(rows, 2, 0)).toBe('📝 Hide text');
    expect(urlAt(rows, 3, 0)).toBe('https://x.com/user/status/1234567890');
  });

  it('hides album and wraps number buttons in inline mode', () => {
    const media = Array.from({ length: 6 }, () => photo);
    const rows = buildGridKeyboard(makePost({ media }), { inline: true }).inline_keyboard;

    expect(rows[0]).toHaveLength(5);
    expect(rows[1]).toHaveLength(1);
    expect(textAt(rows, 1, 1)).toBeUndefined();
    expect(textAt(rows, 2, 0)).toBe('🎠 Carousel');
    expect(rows[2]).toHaveLength(1);
  });
});

describe('input media', () => {
  it('uses a URL for inline edits and a file for uploads', () => {
    const inlineMedia = toCarouselInputMedia(makePost(), 1);
    expect(inlineMedia.type).toBe('photo');
    expect(typeof inlineMedia.media).toBe('string');
    expect(inlineMedia.caption).toContain('2/3');

    const uploadMedia = toCarouselInputMedia(makePost(), 1, { file });
    expect(uploadMedia.media).toBeInstanceOf(InputFile);
  });

  it('builds a grid input image from the mosaic', () => {
    const media = toGridInputMedia(makePost());
    expect(media.type).toBe('photo');
    expect(media.media).toBe(MOSAIC);
    expect(media.caption).toContain('🖼 Grid');
  });

  it('refuses to build a grid without a mosaic', () => {
    expect(() => toGridInputMedia(makePost({ mosaicUrl: undefined }))).toThrow(
      'no grid image',
    );
  });

  it('builds album videos and leaves extra captions empty', () => {
    const post = makePost({ media: [video] });
    const media = toAlbumInputMedia(post, 0, {
      ...file,
      contentType: 'video/mp4',
      filename: 'xbot-video.mp4',
    });
    expect(media.type).toBe('video');
    if (media.type === 'video') {
      expect(media.supports_streaming).toBe(true);
      expect(media.caption).toBeUndefined();
    }
  });
});

describe('inlinePhotoUrl', () => {
  it('asks the Twitter CDN for a JPEG large variant', () => {
    const url = inlinePhotoUrl('https://pbs.twimg.com/media/A.png?name=orig');
    expect(url).toContain('name=large');
    expect(url).toContain('format=jpg');
  });

  it('leaves other hosts alone', () => {
    expect(inlinePhotoUrl('https://mosaic.fxtwitter.com/jpeg/1/A/B')).toBe(
      'https://mosaic.fxtwitter.com/jpeg/1/A/B',
    );
  });
});
