import { describe, expect, it } from 'vitest';

import {
  MAX_INLINE_VIDEO_BYTES,
  selectVariantBySize,
} from '../src/services/inlineVideo.js';

const MB = 1024 * 1024;
const high = 'https://video.twimg.com/avc1/1920x1080/high.mp4';
const medium = 'https://video.twimg.com/avc1/1280x720/medium.mp4';
const low = 'https://video.twimg.com/avc1/480x270/low.mp4';

describe('selectVariantBySize', () => {
  it('picks the highest-quality variant that fits', () => {
    const sizes = new Map([
      [high, 54 * MB],
      [medium, 15 * MB],
      [low, 2 * MB],
    ]);

    expect(selectVariantBySize([high, medium, low], sizes)).toBe(medium);
  });

  it('picks the primary when it already fits', () => {
    const sizes = new Map([
      [high, 10 * MB],
      [medium, 5 * MB],
      [low, 1 * MB],
    ]);

    expect(selectVariantBySize([high, medium, low], sizes)).toBe(high);
  });

  it('skips variants with unknown sizes', () => {
    const sizes = new Map([
      [medium, 15 * MB],
      [low, 2 * MB],
    ]);

    expect(selectVariantBySize([high, medium, low], sizes)).toBe(medium);
  });

  it('returns undefined when no known size fits', () => {
    const sizes = new Map([
      [high, 54 * MB],
      [medium, 25 * MB],
      [low, 21 * MB],
    ]);

    expect(selectVariantBySize([high, medium, low], sizes)).toBeUndefined();
  });

  it('uses the 19 MB inline cap by default', () => {
    expect(MAX_INLINE_VIDEO_BYTES).toBe(19 * MB);
  });
});
