import { describe, expect, it } from 'vitest';

import type { MediaItem, Post } from '../src/types.js';
import { buildInlineResult } from '../src/ui/inline.js';

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

const gif: MediaItem = {
  kind: 'animation',
  url: 'https://video.twimg.com/tweet_video/G.gif.mp4',
  thumbnailUrl: 'https://pbs.twimg.com/tweet_video_thumb/G.jpg',
  width: 480,
  height: 270,
};

const MOSAIC = 'https://mosaic.fxtwitter.com/jpeg/1/A/B';

function makePost(overrides: Partial<Post> = {}): Post {
  return {
    id: '1234567890',
    url: 'https://x.com/user/status/1234567890',
    authorName: 'User',
    authorHandle: 'user',
    text: 'Hello world',
    createdAt: null,
    sensitive: false,
    media: [photo, photo],
    mosaicUrl: MOSAIC,
    ...overrides,
  };
}

describe('buildInlineResult', () => {
  it('returns a grid photo result for a photo gallery', () => {
    const result = buildInlineResult(makePost());
    expect(result?.type).toBe('photo');
    if (result?.type !== 'photo' || !('photo_url' in result)) return;

    expect(result.photo_url).toBe(MOSAIC);
    expect(result.thumbnail_url).toBe(MOSAIC);
    expect(result.caption).toContain('🖼 Grid');
    expect(result.reply_markup?.inline_keyboard.length).toBeGreaterThan(0);
  });

  it('returns a video result with a thumbnail', () => {
    const result = buildInlineResult(
      makePost({ media: [video], mosaicUrl: undefined }),
    );
    expect(result?.type).toBe('video');
    if (result?.type !== 'video' || !('video_url' in result)) return;

    expect(result.video_url).toBe(video.url);
    expect(result.thumbnail_url).toBe(video.thumbnailUrl);
    expect(result.mime_type).toBe('video/mp4');
  });

  it('returns an MPEG-4 GIF result for an animated GIF', () => {
    const result = buildInlineResult(
      makePost({ media: [gif], mosaicUrl: undefined }),
    );
    expect(result?.type).toBe('mpeg4_gif');
    if (result?.type !== 'mpeg4_gif' || !('mpeg4_url' in result)) return;

    expect(result.mpeg4_url).toBe(gif.url);
    expect(result.thumbnail_url).toBe(gif.thumbnailUrl);
  });

  it('returns a single-photo result with a safe CDN variant', () => {
    const result = buildInlineResult(
      makePost({ media: [photo], mosaicUrl: undefined }),
    );
    expect(result?.type).toBe('photo');
    if (result?.type !== 'photo' || !('photo_url' in result)) return;

    expect(result.photo_url).toContain('name=large');
    expect(result.photo_url).toContain('format=jpg');
  });

  it('returns null when the post has no media', () => {
    const result = buildInlineResult(makePost({ media: [], mosaicUrl: undefined }));
    expect(result).toBeNull();
  });
});
