# xbot

A Telegram bot that turns **X (Twitter) posts with multiple photos, videos or GIFs into a gallery** — with a grid view, a one-message carousel, native albums, an image-only mode, and inline sharing.

Paste a post link and the bot opens a contact sheet of the whole gallery:

```text
[ 1 ] [ 2 ] [ 3 ] [ 4 ]
[ 🎠 Carousel ] [ 📚 Album ]
[ 📝 Hide text ]
[ Open on X ]
```

Every button edits the **same Telegram message**, so switching views does not spam the chat. Metadata comes from the public [FxTwitter](https://github.com/FxEmbed/FxEmbed) API, with VxTwitter as a fallback — no X developer account or API key required.

## Views

| View | What it does |
| --- | --- |
| **Grid** | Shows a contact sheet of all photos at once. Numbered buttons jump straight to a specific item. |
| **Carousel** | One photo/video at a time with `◀️` / `▶️` and a position counter. |
| **Album** | Sends the media as native Telegram albums (up to 10 items), which users can swipe natively. |
| **Hide text** | Toggles captions off for a clean, image-only view. The setting follows you when switching views. |

Photo galleries open in **Grid** by default. Other posts (video-only or mixed media) open in **Carousel**, with the other views one tap away.

## Inline mode

Use the bot without leaving a chat:

```text
@your_bot https://x.com/user/status/1234567890123456789
```

The inline result is inserted into the current chat with working `◀️` / `▶️`, grid, and hide-text buttons. Inline edits use the public media URLs, so the bot does not upload new files when you navigate.

To enable inline mode:

1. Open [@BotFather](https://t.me/BotFather).
2. Send `/setinline`, select your bot, and enter a placeholder such as `Paste an X link…`.
3. Optionally send `/setinlinefeedback` if you want feedback settings.
4. Restart or just use the bot — inline queries are now delivered.

Albums are not available inside inline messages because Telegram inline results cannot create media groups. Grid and Carousel are fully supported.

## Features

- Handles `x.com`, `twitter.com`, `mobile.twitter.com`, `fxtwitter.com`, `vxtwitter.com`, `fixupx.com` and `fixvx.com` links.
- Understands `/status/<id>`, `/photo/1`, `/video/1` and `/i/web/status/<id>` URLs (plus trailing punctuation from chat apps).
- Photos, videos and animated GIFs.
- Grid, carousel and native album views, switchable in place.
- Image-only mode with a single **Hide text** toggle.
- Captions with author, post text, view label and a link back to X.
- Sensitive posts are sent with Telegram's spoiler flag (direct messages only; inline results do not support spoilers).
- In-memory LRU + TTL cache for post JSON, downloaded media and grid images.
- Falls back to smaller image/video variants when a file exceeds Telegram's limit.
- Friendly errors for deleted, private, oversized or temporarily unavailable posts.
- HTML-escaped captions (no markup injection from post text).
- Strict TypeScript, unit tests, Dockerfile and Compose file.

## Quick start

1. Create a bot with [@BotFather](https://t.me/BotFather) and copy the token.
2. Install dependencies:

   ```bash
   cd xbot
   npm install
   ```

3. Create your environment file:

   ```bash
   cp .env.example .env
   ```

   Set `BOT_TOKEN` in `.env`.

4. Start the bot in development mode:

   ```bash
   npm run dev
   ```

5. Open your bot in Telegram, press **Start**, and paste a post link such as:

   ```text
   https://x.com/SpaceX/status/2125649126398591003
   ```

6. For inline mode, enable it in BotFather with `/setinline` (see above).

## Environment variables

| Variable | Default | Description |
| --- | --- | --- |
| `BOT_TOKEN` | — | **Required.** Telegram bot token from BotFather. |
| `X_API_BASE` | `https://api.fxtwitter.com` | Primary post-metadata provider. |
| `X_FALLBACK_API_BASE` | `https://api.vxtwitter.com` | Fallback provider. Set empty to disable. |
| `MAX_PHOTO_MB` | `10` | Maximum photo upload size. Telegram's own limit is 10 MB. |
| `MAX_VIDEO_MB` | `45` | Maximum video/animation upload size. Telegram's own limit is 50 MB. |
| `CACHE_TTL_MINUTES` | `30` | How long post JSON and media bytes stay cached. |
| `MEDIA_CACHE_MB` | `64` | Byte budget for cached media, and the budget for one album send. |
| `REQUEST_TIMEOUT_SECONDS` | `20` | Timeout for X API and CDN requests. |
| `MAX_LINKS_PER_MESSAGE` | `2` | Links processed from one message. |
| `DROP_PENDING_UPDATES` | `false` | Drop updates queued while the bot was offline. |
| `LOG_LEVEL` | `info` | `debug`, `info`, `warn` or `error`. |

## How it works

1. `handlers/links.ts` extracts status IDs from message text. It parses the URL path instead of relying on a fragile one-line regex.
2. `services/x` fetches the post as JSON from FxTwitter (`/2/status/<id>`), falling back to VxTwitter (`/status/<id>`). Both are normalized into one `Post` shape.
3. Photo galleries carry a provider-rendered mosaic (`mosaic.fxtwitter.com`), used as the grid image. Posts without one still get carousel and album views.
4. The first view is sent as a single message with stateless inline buttons. Callback data is `xb:<mode>:<postId>:<index>:<text>` — no session store.
5. Carousel and grid taps rehydrate the post from cache (or refetch it), download the requested media and call `editMessageMedia`. Inline messages are edited with public URLs, because Telegram does not allow uploading new files to inline messages.
6. Album taps download up to 10 items and call `sendMediaGroup`. Oversized items are skipped to stay inside Telegram's limits.
7. Post JSON, media bytes and grid images live in bounded in-memory caches. There is no database.

Because callback data only contains the post ID, mode and index, the gallery keeps working even if the bot restarts — as long as X still serves the post.

```text
src/
  index.ts              process entry point, polling + shutdown
  bot.ts                bot wiring, auto-retry, error boundary
  config.ts             validated environment configuration
  logger.ts             tiny leveled logger
  handlers/
    commands.ts         /start and /help
    links.ts            detect post links, choose grid/carousel
    callbacks.ts        view switching, navigation, albums
    inline.ts           inline query results
  services/
    carousel.ts         send/edit views, send albums
    media.ts            capped downloads + media cache
    cache.ts            TTL/LRU cache
    x/
      client.ts         FxTwitter / VxTwitter providers
      normalize.ts      API payloads -> Post (including mosaic)
      index.ts          post cache + request deduplication
  ui/
    carousel.ts         captions, keyboards, callback data, InputMedia
  utils/
    xurl.ts             URL parsing and extraction
    html.ts             HTML escaping
    telegram.ts         reply helpers
tests/                  URL, normalization, carousel and cache tests
```

## Scripts

| Command | What it does |
| --- | --- |
| `npm run dev` | Run with `tsx watch` and reload on changes. |
| `npm run build` | Compile TypeScript to `dist/`. |
| `npm start` | Run the compiled bot. |
| `npm run typecheck` | Type-check without emitting. |
| `npm test` | Run the Vitest suite. |

## Using the bot in groups

Telegram bots have **privacy mode** enabled by default: in groups they only receive commands and direct replies, not every pasted link. If you want xbot to react to links in a group:

1. Open [@BotFather](https://t.me/BotFather) → `/setprivacy` → select the bot → **Disable**.
2. Remove and re-add the bot to the group (privacy changes apply after re-adding).

In private chats no configuration is needed.

## Docker

```bash
cp .env.example .env   # fill in BOT_TOKEN
docker compose up -d --build
docker compose logs -f
```

The image builds the TypeScript project in a first stage and runs only production dependencies in the final stage as the non-root `node` user.

## Limitations

- Only **public** posts are supported. Deleted, private, age-restricted or login-walled posts cannot be loaded.
- FxTwitter and VxTwitter are third-party mirrors. If both are down or rate limit you, the bot reports an upstream error.
- Telegram bot upload limits: 10 MB for photos and 50 MB for videos. The defaults (10 / 45 MB) leave a little headroom.
- Telegram albums hold at most **10** items and must contain at least 2. Larger galleries use the grid and carousel, which cover every item.
- Inline results cannot create albums, and their photo URLs must be JPEG and at most 5 MB. The bot requests a suitable CDN variant for inline photos.
- Videos are sent as normal Telegram videos, not streamed inline.
- Inline editing uses media URLs, so private or login-walled media will not load inline.
- Only status URLs are recognized. `t.co` short links are not resolved.
- Telegram only allows editing messages for 48 hours. Tapping a very old gallery asks the user to resend the link.
- Caches are per-process and in memory. Running multiple replicas is fine but each replica keeps its own cache; use Redis if you need shared state.
- There is no per-user rate limiting yet. If you expose the bot publicly, consider adding one in `handlers/links.ts`.

## Notes on security

- Keep `BOT_TOKEN` in `.env` (git-ignored) or your host's secret manager. Never commit it.
- Captions are built with `parse_mode: 'HTML'` and all post text/author fields are escaped before insertion.
- The bot does not execute anything from X. It only downloads media from `pbs.twimg.com`, `video.twimg.com`, `mosaic.fxtwitter.com` and provider-rendered URLs returned by the metadata sources.

## License

MIT
