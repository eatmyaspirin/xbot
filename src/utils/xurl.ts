export interface StatusLink {
  id: string;
  handle: string | null;
  canonical: string;
}

const ALLOWED_HOSTS = new Set([
  'x.com',
  'twitter.com',
  'fxtwitter.com',
  'vxtwitter.com',
  'fixupx.com',
  'fixvx.com',
]);

const X_URL_PATTERN =
  /(?:https?:\/\/)?(?:www\.|mobile\.)?(?:x\.com|twitter\.com|fxtwitter\.com|vxtwitter\.com|fixupx\.com|fixvx\.com)\/[^\s<>"'`]+/gi;

const LOOKS_LIKE_X_URL =
  /(?:^|[/.\s])(?:x|twitter|fxtwitter|vxtwitter|fixupx|fixvx)\.com\//i;

function isStatusId(value: string | undefined): value is string {
  return value !== undefined && /^\d{1,25}$/.test(value);
}

function cleanHandle(value: string | undefined): string | null {
  if (!value) return null;
  return /^[A-Za-z0-9_]{1,15}$/.test(value) ? value : null;
}

export function canonicalStatusUrl(id: string, handle: string | null): string {
  return handle
    ? `https://x.com/${handle}/status/${id}`
    : `https://x.com/i/web/status/${id}`;
}

export function parseStatusUrl(input: string): StatusLink | null {
  const trimmed = input
    .trim()
    .replace(/^[(\[{'"`]+/, '')
    .replace(/[.,;:!?)\]}>'"]+$/g, '');
  if (!trimmed) return null;

  let url: URL;
  try {
    url = new URL(/^[a-z][a-z0-9+.-]*:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`);
  } catch {
    return null;
  }

  const host = url.hostname.toLowerCase().replace(/^www\./, '').replace(/^mobile\./, '');
  if (!ALLOWED_HOSTS.has(host)) return null;

  const segments = url.pathname.split('/').filter(Boolean);
  let handle: string | null = null;
  let id: string | null = null;

  // /<handle>/status/<id> and its /photo/1, /video/1 variants
  if (segments.length >= 3 && segments[1]?.toLowerCase() === 'status' && isStatusId(segments[2])) {
    handle = cleanHandle(segments[0]);
    id = segments[2];
  }

  // /i/web/status/<id>
  if (
    !id &&
    segments.length >= 4 &&
    segments[0]?.toLowerCase() === 'i' &&
    segments[1]?.toLowerCase() === 'web' &&
    segments[2]?.toLowerCase() === 'status' &&
    isStatusId(segments[3])
  ) {
    id = segments[3];
  }

  if (!id) return null;

  return { id, handle, canonical: canonicalStatusUrl(id, handle) };
}

export function extractStatusLinks(text: string): StatusLink[] {
  const links: StatusLink[] = [];
  const seen = new Set<string>();

  for (const match of text.matchAll(X_URL_PATTERN)) {
    const link = parseStatusUrl(match[0]);
    if (!link || seen.has(link.id)) continue;
    seen.add(link.id);
    links.push(link);
  }

  return links;
}

export function looksLikeXLink(text: string): boolean {
  return LOOKS_LIKE_X_URL.test(text);
}
