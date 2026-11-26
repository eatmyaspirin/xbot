export type MediaKind = 'photo' | 'video' | 'animation';

export interface MediaItem {
  kind: MediaKind;
  /** Best candidate URL, attempted first. */
  url: string;
  /** Lower-quality fallbacks, tried when the primary is too large or unavailable. */
  variants?: string[];
  thumbnailUrl?: string;
  width: number;
  height: number;
  duration?: number;
  alt?: string;
}

export interface QuotedPost {
  authorName: string;
  authorHandle: string | null;
  url: string;
  text: string;
}

export interface Post {
  id: string;
  url: string;
  authorName: string;
  authorHandle: string | null;
  text: string;
  createdAt: string | null;
  sensitive: boolean;
  media: MediaItem[];
  /** Contact-sheet image for photo galleries, when the provider supplies one. */
  mosaicUrl?: string;
  /** Set when the media comes from the quoted post rather than the linked post. */
  quoted?: QuotedPost;
}
