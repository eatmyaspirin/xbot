import type { InlineQueryResult } from 'grammy/types';

import type { Post } from '../types.js';
import {
  buildCaption,
  buildCarouselKeyboard,
  buildGridKeyboard,
  inlinePhotoUrl,
  type ViewMode,
} from './carousel.js';

function snippet(text: string): string {
  const flat = text.replace(/\s+/g, ' ').trim();
  return flat.length > 120 ? `${flat.slice(0, 117)}…` : flat;
}

function resultTitle(post: Post): string {
  return post.authorHandle ? `@${post.authorHandle}` : post.authorName;
}

export function buildInlineResult(post: Post): InlineQueryResult | null {
  const showText = true;
  const captionFor = (view: ViewMode) => buildCaption(post, 0, { view, showText });
  const description =
    snippet(post.text) ||
    `${post.media.length} media item${post.media.length === 1 ? '' : 's'}`;
  const title = resultTitle(post);

  // Photo galleries open as a grid so every image is visible at once.
  if (post.mosaicUrl && post.media.length > 1) {
    const caption = captionFor('grid');
    return {
      type: 'photo',
      id: `xbot:${post.id}:grid`,
      photo_url: post.mosaicUrl,
      thumbnail_url: post.mosaicUrl,
      title: `${title} · grid`,
      description,
      ...(caption ? { caption, parse_mode: 'HTML' as const } : {}),
      reply_markup: buildGridKeyboard(post, { inline: true, showText }),
    };
  }

  const item = post.media[0];
  if (!item) return null;

  const caption = captionFor('carousel');
  const base = {
    id: `xbot:${post.id}`,
    ...(caption ? { caption, parse_mode: 'HTML' as const } : {}),
    reply_markup: buildCarouselKeyboard(post, 0, { inline: true, showText }),
  };

  switch (item.kind) {
    case 'photo':
      return {
        type: 'photo',
        photo_url: inlinePhotoUrl(item.url),
        thumbnail_url: inlinePhotoUrl(item.url),
        ...(item.width > 0 ? { photo_width: item.width } : {}),
        ...(item.height > 0 ? { photo_height: item.height } : {}),
        title,
        description,
        ...base,
      };

    case 'animation':
      if (!item.thumbnailUrl) return null;
      return {
        type: 'mpeg4_gif',
        mpeg4_url: item.url,
        thumbnail_url: item.thumbnailUrl,
        ...(item.width > 0 ? { mpeg4_width: item.width } : {}),
        ...(item.height > 0 ? { mpeg4_height: item.height } : {}),
        ...(item.duration ? { mpeg4_duration: Math.round(item.duration) } : {}),
        title,
        ...base,
      };

    case 'video': {
      if (!item.thumbnailUrl) return null;

      // Telegram fetches inline media itself, and large X video URLs fail with
      // "failed to get HTTP URL content". Use the smallest MP4 variant.
      const variants = item.variants ?? [];
      const videoUrl =
        variants.length > 0 ? variants[variants.length - 1] ?? item.url : item.url;
      const dimensions = /\/(\d{2,5})x(\d{2,5})\//.exec(videoUrl);
      const width = dimensions?.[1] ? Number(dimensions[1]) : item.width;
      const height = dimensions?.[2] ? Number(dimensions[2]) : item.height;

      return {
        type: 'video',
        video_url: videoUrl,
        mime_type: 'video/mp4',
        thumbnail_url: item.thumbnailUrl,
        ...(width > 0 ? { video_width: width } : {}),
        ...(height > 0 ? { video_height: height } : {}),
        ...(item.duration ? { video_duration: Math.round(item.duration) } : {}),
        title,
        description,
        ...base,
      };
    }
  }
}
