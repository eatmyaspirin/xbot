import { describe, expect, it } from 'vitest';

import {
  normalizeFxStatus,
  normalizeVxStatus,
  originalPhotoUrl,
  type FxStatus,
  type VxResponse,
} from '../src/services/x/normalize.js';

const fxGallery: FxStatus = {
  id: '111',
  text: 'Launch <photos>',
  created_at: 'Tue Nov 25 12:00:00 +0000 2026',
  possibly_sensitive: true,
  author: { name: 'SpaceX', screen_name: 'SpaceX' },
  media: {
    all: [
      {
        type: 'photo',
        url: 'https://pbs.twimg.com/media/A.jpg?name=small',
        width: 3000,
        height: 2000,
      },
      {
        type: 'photo',
        url: 'https://pbs.twimg.com/media/B.jpg',
        width: 1200,
        height: 800,
      },
      {
        type: 'video',
        url: 'https://video.twimg.com/v/360.mp4?tag=16',
        width: 640,
        height: 360,
        duration: 12,
        thumbnail_url: 'https://pbs.twimg.com/media/thumb.jpg',
        formats: [
          { container: 'm3u8', url: 'https://video.twimg.com/v/master.m3u8' },
          {
            container: 'mp4',
            bitrate: 1000,
            url: 'https://video.twimg.com/v/360.mp4?tag=16',
          },
          {
            container: 'mp4',
            bitrate: 3000,
            url: 'https://video.twimg.com/v/720.mp4?tag=16',
          },
        ],
      },
    ],
  },
};

describe('normalizeFxStatus', () => {
  it('normalizes photos and picks the highest quality mp4', () => {
    const post = normalizeFxStatus(fxGallery, '111');

    expect(post.media.map((item) => item.kind)).toEqual(['photo', 'photo', 'video']);
    expect(post.media[0]?.url).toBe('https://pbs.twimg.com/media/A.jpg?name=orig');
    expect(post.media[0]?.variants).toContain('https://pbs.twimg.com/media/A.jpg?name=large');
    expect(post.media[2]?.url).toBe('https://video.twimg.com/v/720.mp4?tag=16');
    expect(post.media[2]?.variants).not.toContain('https://video.twimg.com/v/master.m3u8');
    expect(post.url).toBe('https://x.com/SpaceX/status/111');
    expect(post.authorName).toBe('SpaceX');
    expect(post.sensitive).toBe(true);
  });

  it('handles mosaic photos via their jpeg format', () => {
    const post = normalizeFxStatus(
      {
        id: '333',
        author: { name: 'A', screen_name: 'a' },
        media: {
          all: [
            {
              type: 'mosaic_photo',
              width: 1200,
              height: 800,
              formats: {
                jpeg: 'https://pbs.twimg.com/media/M.jpg',
                webp: 'https://pbs.twimg.com/media/M.webp',
              },
            },
          ],
        },
      },
      '333',
    );

    expect(post.media).toHaveLength(1);
    expect(post.media[0]?.url).toBe('https://pbs.twimg.com/media/M.jpg?name=orig');
  });

  it('returns an empty media list for text-only posts', () => {
    const post = normalizeFxStatus({ id: '444', text: 'hello' }, '444');
    expect(post.media).toEqual([]);
  });

  it('rejects invalid ids', () => {
    expect(() => normalizeFxStatus({ id: 'abc' }, 'abc')).toThrow('invalid post id');
  });
});

describe('normalizeVxStatus', () => {
  const raw: VxResponse = {
    tweetID: '222',
    text: 'hi',
    date_epoch: 1_700_000_000,
    user_name: 'SpaceX',
    user_screen_name: 'SpaceX',
    possibly_sensitive: false,
    media_extended: [
      {
        type: 'image',
        url: 'https://pbs.twimg.com/media/C.jpg',
        size: { width: 100, height: 200 },
        altText: 'alt text',
      },
      {
        type: 'video',
        url: 'https://video.twimg.com/v/720.mp4',
        thumbnail_url: 'https://pbs.twimg.com/media/thumb.jpg',
        size: { width: 1280, height: 720 },
        duration: 5,
      },
      {
        type: 'gif',
        url: 'https://video.twimg.com/v/gif.mp4',
        size: {},
      },
    ],
  };

  it('normalizes images, videos, gifs and dates', () => {
    const post = normalizeVxStatus(raw, '222');

    expect(post.media.map((item) => item.kind)).toEqual(['photo', 'video', 'animation']);
    expect(post.media[0]?.url).toBe('https://pbs.twimg.com/media/C.jpg?name=orig');
    expect(post.media[0]?.alt).toBe('alt text');
    expect(post.media[2]?.width).toBe(0);
    expect(post.createdAt).toBe(new Date(1_700_000_000_000).toISOString());
    expect(post.url).toBe('https://x.com/SpaceX/status/222');
  });

  it('falls back to mediaURLs when media_extended is missing', () => {
    const post = normalizeVxStatus(
      { tweetID: '223', mediaURLs: ['https://pbs.twimg.com/media/D.jpg'] },
      '223',
    );
    expect(post.media).toHaveLength(1);
    expect(post.media[0]?.kind).toBe('photo');
  });
});

describe('originalPhotoUrl', () => {
  it('leaves non-twitter CDN urls alone', () => {
    expect(originalPhotoUrl('https://example.com/a.jpg')).toBe('https://example.com/a.jpg');
  });
});
