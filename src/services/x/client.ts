import { config } from '../../config.js';
import { logger } from '../../logger.js';
import type { Post } from '../../types.js';
import {
  normalizeFxStatus,
  normalizeVxStatus,
  PostError,
  type FxResponse,
  type VxResponse,
} from './normalize.js';

interface Provider {
  name: string;
  endpoint: (id: string) => string;
  parse: (json: unknown, id: string) => Post;
}

function parseFx(json: unknown, id: string): Post {
  const response = json as FxResponse;

  if (typeof response.code === 'number' && response.code >= 400) {
    const message = response.message || `X API error ${response.code}`;
    if (response.code === 404) throw new PostError(message, 'not_found');
    if (response.code === 401 || response.code === 403) {
      throw new PostError(message, 'protected');
    }
    throw new PostError(message, 'upstream');
  }

  return normalizeFxStatus(response.status ?? response.tweet, id);
}

const PROVIDERS: Provider[] = [];

if (config.xApiBase) {
  PROVIDERS.push({
    name: 'fxtwitter',
    endpoint: (id) => `${config.xApiBase}/2/status/${id}`,
    parse: parseFx,
  });
}

if (config.xFallbackApiBase) {
  PROVIDERS.push({
    name: 'vxtwitter',
    endpoint: (id) => `${config.xFallbackApiBase}/status/${id}`,
    parse: (json, id) => normalizeVxStatus(json as VxResponse, id),
  });
}

function hostOf(url: string): string {
  try {
    return new URL(url).host;
  } catch {
    return 'X';
  }
}

async function getJson(url: string): Promise<unknown> {
  let response: Response;

  try {
    response = await fetch(url, {
      headers: {
        accept: 'application/json',
        'user-agent': 'xbot/0.1 (+https://github.com)',
      },
      redirect: 'follow',
      signal: AbortSignal.timeout(config.requestTimeoutMs),
    });
  } catch (error) {
    throw new PostError(`Could not reach ${hostOf(url)}`, 'upstream', { cause: error });
  }

  if (!response.ok) {
    void response.body?.cancel().catch(() => {});
    if (response.status === 404) {
      throw new PostError('Post not found on X', 'not_found');
    }
    if (response.status === 401 || response.status === 403) {
      throw new PostError('Post is private or unavailable', 'protected');
    }
    if (response.status === 429) {
      throw new PostError('The X API is rate limiting requests', 'upstream');
    }
    throw new PostError(`X API responded with HTTP ${response.status}`, 'upstream');
  }

  try {
    return (await response.json()) as unknown;
  } catch (error) {
    throw new PostError('X API returned invalid JSON', 'upstream', { cause: error });
  }
}

export async function fetchPost(id: string): Promise<Post> {
  if (PROVIDERS.length === 0) {
    throw new PostError('No X API provider is configured', 'invalid');
  }

  const errors: PostError[] = [];

  for (const provider of PROVIDERS) {
    try {
      const json = await getJson(provider.endpoint(id));
      return provider.parse(json, id);
    } catch (error) {
      const postError =
        error instanceof PostError
          ? error
          : new PostError('Unexpected error while loading the post', 'upstream', {
              cause: error,
            });
      errors.push(postError);
      logger.warn(`Provider ${provider.name} failed`, {
        postId: id,
        code: postError.code,
        message: postError.message,
      });
    }
  }

  const notFound = errors.find((error) => error.code === 'not_found');
  if (notFound && errors.every((error) => error.code === 'not_found')) {
    throw notFound;
  }

  throw (
    errors.find((error) => error.code === 'upstream' || error.code === 'protected') ??
    errors[0] ??
    new PostError('Could not load post from X', 'upstream')
  );
}
