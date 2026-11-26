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
| **Download** | Sends the original file as a document; multiple files are packaged into a ZIP. |
| **Hide text** | Toggles captions off for a clean, image-only view. The setting follows you when switching views. |

Photo galleries open in **Grid** by default. Other posts (video-only or mixed media) open in **Carousel**, with the other views one tap away.

## Downloads

The **⬇️ Download** button sends media as documents, so photos keep their original quality and videos keep their original file:

- One media item → the original file (`.jpg`, `.png`, `.mp4`, etc.).
- Multiple items → a ZIP named `xbot-<post-id>.zip` containing numbered files such as `01-photo.jpg` and `02-video.mp4`.
- The ZIP is built in a request-specific temporary directory, uploaded, and deleted immediately after the upload finishes. A startup sweep also removes any stale request directories left by a crash.
- `MAX_DOWNLOAD_MB` (default `45`) caps the total uncompressed media included. If a gallery is too large, the bot includes what fits and tells you how many items were skipped.
- Downloads are not available on inline messages because Telegram inline results have no chat ID to send a document to.

Telegram's bot document limit is 50 MB. The default 45 MB cap leaves room for ZIP overhead.

## What embeds work

| Post type | What you get |
| --- | --- |
| **Photos** (single or gallery) | Grid, carousel, album, image-only mode, and inline results. |
| **Videos** | Carousel, album (as a video item), and inline video results. Large files fall back to lower-quality variants. |
| **Animated GIFs** | Carousel (as a Telegram animation), album (as a silent MP4 video), and inline MPEG-4 GIF results. |
| **Quote posts** | If the linked post has no media of its own, the bot follows the quoted post and shows its media, with an extra **Quoted post** link. Outer media always wins. |
| **Reposts / retweets** | The provider resolves them to the original post, so the media works normally. |
| **Mixed photo + video** | X does not normally compose these in one post, but if the API returns both, carousel and album handle every item. Grid only appears when a photo mosaic exists. |
| **Text-only posts / polls** | No media to show; the bot replies with a short explanation. Polls are not rendered. |
| **Link cards / YouTube embeds** | Not downloaded or embedded. Use **Open on X** to view the card. |
| **Live broadcasts** | Not supported; the stream URL cannot be uploaded as a normal Telegram video. |

Sensitive posts are marked with a spoiler in direct chats. Inline results cannot carry Telegram spoilers.

## Inline mode

Use the bot without leaving a chat:

```text
@your_bot https://x.com/user/status/1234567890123456789
```

The inline result is inserted into the current chat with working `◀️` / `▶️`, grid, and hide-text buttons. Inline edits use the public media URLs, so the bot does not upload new files when you navigate.

Telegram does not expose the **target chat ID** for inline queries, only the sender and the chat type. Inline results therefore cannot be filtered by the chat allowlist. Inline mode is available to anyone who knows the bot, and inline gallery buttons work for everyone. The allowlist applies to direct messages and owner commands. If you need to restrict inline usage, disable inline mode in BotFather.

To enable inline mode in BotFather:

1. Open [@BotFather](https://t.me/BotFather).
2. Send `/setinline`, select your bot, and enter a placeholder such as `Paste an X link…`.
3. Restart or just use the bot — inline queries are now delivered.

Albums are not available inside inline messages because Telegram inline results cannot create media groups. Grid and Carousel are fully supported.

## Access control

By default the bot only responds to direct messages in the owner's private chat and explicitly allowed chats. Inline queries are exempt because Telegram does not expose their target chat ID; see **Inline mode** above.

The owner is configured with `OWNER_ID` — a numeric Telegram user ID. Only that user can change the allowlist. Owner commands:

| Command | Purpose |
| --- | --- |
| `/allow` | Run inside a group to allow that group. |
| `/allow <chat_id>` | Allow a specific chat by numeric ID. |
| `/deny` | Run inside a group to remove that group. |
| `/deny <chat_id>` | Remove a specific chat. |
| `/allowed` | List the owner ID and every allowed chat. |
| `/chatid` | Show the current chat ID, type, title and your user ID. |
| `/stat` | Show usage statistics. `/stats` is an alias. |

The owner's private chat is always allowed and cannot be removed. To allow a group:

1. Add the bot to the group.
2. As the owner, send `/allow` in that group (or use `/chatid` there and `/allow <id>` from private chat).
3. The group can now use link detection and inline mode.

The allowlist is stored in `state.json` under `DATA_DIR` (default `./data`), with `0600` permissions and atomic writes. When Telegram upgrades a group to a supergroup, the stored chat ID is migrated automatically.

If a chat is removed with `/deny`, the bot silently ignores new messages there and answers any remaining gallery buttons with an authorization error. Unauthorized private chats receive a short "this bot is private" reply.

To reset access, stop the bot and delete `DATA_DIR/state.json`. The owner private chat remains available.

## Usage statistics

`/stat` (owner-only; `/stats` is an alias) reports:

- unique users
- total chats, split into private chats, groups and channels
- messages, links, downloads, albums, inline queries and errors
- today's links, downloads and inline queries
- a seven-day daily breakdown (UTC)
- the top groups by links processed
- the database size and the date stats collection started

Stats are stored in `DATA_DIR/stats.db` using Node's built-in `node:sqlite` in WAL mode. No external database service is needed. Usage is recorded only for updates that pass the access checks, so unauthorized chats do not inflate the numbers. Inline queries are counted even though they have no chat ID.

To reset stats, stop the bot and delete `DATA_DIR/stats.db` (plus any `-wal`/`-shm` files).

## Features

- Private by default: owner-only access management with a persistent chat allowlist.
- Owner-only usage statistics in SQLite, available with `/stat`.
- Handles `x.com`, `twitter.com`, `mobile.twitter.com`, `fxtwitter.com`, `vxtwitter.com`, `fixupx.com` and `fixvx.com` links.
- Understands `/status/<id>`, `/photo/1`, `/video/1` and `/i/web/status/<id>` URLs (plus trailing punctuation from chat apps).
- Photos, videos and animated GIFs.
- Quote posts fall back to the quoted post's media when the linked post has none.
- Grid, carousel and native album views, switchable in place.
- Original-quality downloads: single files or a ZIP for galleries, with automatic temp cleanup.
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

   Set `BOT_TOKEN` and `OWNER_ID` in `.env`. `OWNER_ID` is your numeric
   Telegram user ID (get it from [@userinfobot](https://t.me/userinfobot)).

4. Start the bot in development mode:

   ```bash
   npm run dev
   ```

5. Open your bot in Telegram, press **Start**, and paste a post link such as:

   ```text
   https://x.com/SpaceX/status/2125649126398591003
   ```

   Your private chat is allowed automatically. Use `/allow` in a group to
   enable the bot there.

6. For inline mode, enable it in BotFather with `/setinline` (see above).

## Environment variables

| Variable | Default | Description |
| --- | --- | --- |
| `BOT_TOKEN` | — | **Required.** Telegram bot token from BotFather. |
| `OWNER_ID` | — | **Required.** Numeric Telegram user ID allowed to manage the allowlist. |
| `DATA_DIR` | `./data` | Writable directory for `state.json` (allowlist) and `stats.db` (usage counters). |
| `X_API_BASE` | `https://api.fxtwitter.com` | Primary post-metadata provider. |
| `X_FALLBACK_API_BASE` | `https://api.vxtwitter.com` | Fallback provider. Set empty to disable. |
| `MAX_PHOTO_MB` | `10` | Maximum photo upload size. Telegram's own limit is 10 MB. |
| `MAX_VIDEO_MB` | `45` | Maximum video/animation upload size. Telegram's own limit is 50 MB. |
| `MAX_DOWNLOAD_MB` | `45` | Maximum total media size for a single download/ZIP. |
| `CACHE_TTL_MINUTES` | `30` | How long post JSON and media bytes stay cached. |
| `MEDIA_CACHE_MB` | `64` | Byte budget for cached media, and the budget for one album send. |
| `REQUEST_TIMEOUT_SECONDS` | `20` | Timeout for X API and CDN requests. |
| `MAX_LINKS_PER_MESSAGE` | `2` | Links processed from one message. |
| `DROP_PENDING_UPDATES` | `false` | Drop updates queued while the bot was offline. |
| `LOG_LEVEL` | `info` | `debug`, `info`, `warn` or `error`. |

## How it works

1. `handlers/links.ts` extracts status IDs from message text. It parses the URL path instead of relying on a fragile one-line regex.
2. `services/x` fetches the post as JSON from FxTwitter (`/2/status/<id>`), falling back to VxTwitter (`/status/<id>`). Both are normalized into one `Post` shape.
3. Photo galleries carry a provider-rendered mosaic (`mosaic.fxtwitter.com`), used as the grid image. Posts without one still get carousel and album views. Quote posts with no media of their own follow the quoted post.
4. The first view is sent as a single message with stateless inline buttons. Callback data is `xb:<mode>:<postId>:<index>:<text>` — no session store.
5. Carousel and grid taps rehydrate the post from cache (or refetch it), download the requested media and call `editMessageMedia`. Inline messages are edited with public URLs, because Telegram does not allow uploading new files to inline messages.
6. Album taps download up to 10 items and call `sendMediaGroup`. Oversized items are skipped to stay inside Telegram's limits.
7. Download taps write media to a request-specific temp directory, ZIP multiple files with `fflate`, send the result as a document, then delete the directory in a `finally` block.
8. Post JSON, media bytes and grid images live in bounded in-memory caches. Persistent state is the chat allowlist in `DATA_DIR/state.json` and usage counters in `DATA_DIR/stats.db`.
9. The access middleware touches users/chats and records message and inline-query events. Links, downloads, albums and errors are recorded by their handlers. `/stat` aggregates the SQLite tables into a plain-text report.

Because callback data only contains the post ID, mode and index, the gallery keeps working even if the bot restarts — as long as X still serves the post.

```text
src/
  index.ts              process entry point, polling + shutdown
  bot.ts                bot wiring, auto-retry, error boundary
  config.ts             validated environment configuration
  logger.ts             tiny leveled logger
  handlers/
    commands.ts         /start and /help
    owner.ts            /allow, /deny, /allowed, /chatid
    stat.ts             owner-only /stat and /stats
    links.ts            detect post links, choose grid/carousel
    callbacks.ts        view switching, navigation, albums, downloads
    inline.ts           inline query handling
  middleware/
    access.ts           chat allowlist enforcement + usage touch
  services/
    access.ts           owner checks + allowlist API
    stats.ts            stats singleton + safe writes
    carousel.ts         send/edit views, send albums
    download.ts         temp files, ZIP creation, cleanup
    media.ts            capped downloads + media cache
    cache.ts            TTL/LRU cache
    x/
      client.ts         FxTwitter / VxTwitter providers
      normalize.ts      API payloads -> Post (including mosaic)
      index.ts          post cache + request deduplication
  storage/
    stateStore.ts       atomic JSON persistence for allowed chats
    statsStore.ts       SQLite schema and usage aggregation
  ui/
    carousel.ts         captions, keyboards, callback data, InputMedia
    download.ts         download document caption
    inline.ts           inline result builder
    stats.ts            stats report formatter
  utils/
    xurl.ts             URL parsing and extraction
    html.ts             HTML escaping
    telegram.ts         reply helpers + chat ID parsing
tests/                  URL, normalization, carousel, access and state tests
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
3. As the owner, send `/allow` in the group. Until it is allowed, the bot will ignore messages there.

In private chats, the owner's chat works immediately; other private chats need `/allow <user_id>`.

## Docker

```bash
cp .env.example .env   # fill in BOT_TOKEN
docker compose up -d --build
docker compose logs -f
```

The image builds the TypeScript project in a first stage and runs only production dependencies in the final stage as the non-root `node` user. Compose mounts the `xbot-data` volume at `/app/data` so the allowlist and stats database survive container recreation.

## Limitations

- Only **public** posts are supported. Deleted, private, age-restricted or login-walled posts cannot be loaded.
- FxTwitter and VxTwitter are third-party mirrors. If both are down or rate limit you, the bot reports an upstream error.
- Telegram bot upload limits: 10 MB for photos and 50 MB for videos. The defaults (10 / 45 MB) leave a little headroom.
- Telegram albums hold at most **10** items and must contain at least 2. Larger galleries use the grid and carousel, which cover every item.
- Inline results cannot create albums, and their photo URLs must be JPEG and at most 5 MB. The bot requests a suitable CDN variant for inline photos.
- Videos are sent as normal Telegram videos, not streamed inline.
- Inline editing uses media URLs, so private or login-walled media will not load inline.
- Inline queries cannot be tied to a whitelisted chat ID because Telegram does not expose it; inline mode is open to any user who knows the bot.
- Downloads are capped at 45 MB by default; larger galleries are partially included, and anything that cannot be uploaded is skipped with a notice.
- Downloads are unavailable on inline messages because there is no chat ID to send a document to.
- Usage stats are approximate and start when this feature was first deployed; they do not backfill older activity. Unauthorized chats are not counted.
- Polls, link cards, external players and live broadcasts are not turned into Telegram media; only photos, videos and GIFs are uploaded.
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
