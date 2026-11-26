import type { Post } from '../types.js';
import { escapeHtml, escapeHtmlAttribute } from '../utils/html.js';

export interface DownloadSummary {
  isZip: boolean;
  fileCount: number;
  totalCount: number;
}

export function buildDownloadCaption(post: Post, summary: DownloadSummary): string {
  const author = escapeHtml(post.authorName.slice(0, 80));
  const handle = post.authorHandle
    ? ` (@${escapeHtml(post.authorHandle.slice(0, 20))})`
    : '';
  const header = `<b>${author}</b>${handle}`;

  let label = 'Download';
  if (summary.totalCount > 1 || summary.fileCount > 1) {
    const kind = summary.isZip ? 'ZIP' : 'Download';
    label =
      summary.fileCount === summary.totalCount
        ? `${kind} · ${summary.totalCount} media items`
        : `${kind} · ${summary.fileCount} of ${summary.totalCount} media items`;
  }

  const link = `<a href="${escapeHtmlAttribute(post.url)}">Open on X</a>`;
  return `${header}\n\n${label}\n\n${link}`;
}
