# المنزل (Al-Monzel)

Arabic-first web app to download **video**, **audio**, and **images** from 1000+ platforms (YouTube, TikTok, Instagram, X, and more) with multiple quality options.

**Stack:** Next.js 16 · TypeScript · Tailwind CSS · yt-dlp (`yt-dlp-wrap`)

## Features

- RTL Arabic UI
- Paste URL → analyze → pick type & quality → download with progress
- Image / thumbnail downloads
- Optional Umami analytics & Sentry monitoring

## Requirements

- **Node.js** 18+
- **ffmpeg** (recommended) for merged video+audio streams — [ffmpeg.org](https://ffmpeg.org/download.html)

On first run, **yt-dlp** is downloaded into `.bin/` (gitignored).

## Quick start

```bash
npm install
cp .env.example .env.local   # optional: GitHub, Umami, Sentry
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Environment

| Variable | Description |
|----------|-------------|
| `NEXT_PUBLIC_GITHUB_URL` | Navbar GitHub link (default: `https://github.com/AbdAlm10`) |
| `NEXT_PUBLIC_UMAMI_WEBSITE_ID` | Umami analytics |
| `NEXT_PUBLIC_SENTRY_DSN` | Sentry error reporting |

## API

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/health` | GET | Engine ready status |
| `/api/info` | POST | `{ "url": "..." }` → formats |
| `/api/download` | GET | Stream file (`formatId`, `url` or `directUrl`, …) |

Rate limits apply per IP. URLs are validated; private-network (SSRF) targets are blocked.

## Security

- Input validation (Zod) on all API params
- SSRF protection on outbound `directUrl` fetches
- Security headers via middleware
- Generic error messages in production
- Rate limiting on `/api/*`

## Legal

For **personal use** only. Respect copyright and platform terms of service.

## Structure

```
src/
  app/              # Pages & API routes
  components/       # UI
  lib/
    api/            # Rate limit, responses, guards
    security/       # URL safety checks
    download-client.ts
    media-helpers.ts
    ytdlp.ts, formats.ts, validate.ts
  middleware.ts     # Security headers
```
