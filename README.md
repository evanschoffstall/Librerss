<div align="center">

<br />

<img src="public/favicon.svg" width="112" height="112" alt="LibreRSS logo" />

# LibreRSS

*A modern RSS reader for people who want precious signal, not sludge.*

[![Next.js 16](https://img.shields.io/badge/Next.js-16-000000?style=for-the-badge&logo=next.js&logoColor=white)](https://nextjs.org)
[![React 19](https://img.shields.io/badge/React-19-61DAFB?style=for-the-badge&logo=react&logoColor=black)](https://react.dev)
[![TypeScript 5](https://img.shields.io/badge/TypeScript-5-3178C6?style=for-the-badge&logo=typescript&logoColor=white)](https://www.typescriptlang.org)
[![Bun](https://img.shields.io/badge/Bun-runtime-F9F1E1?style=for-the-badge&logo=bun&logoColor=black)](https://bun.sh)
[![MIT License](https://img.shields.io/badge/License-MIT-22c55e?style=for-the-badge)](LICENSE)

</div>

LibreRSS is an open-source, self-hostable RSS reader built for focused reading. It pulls feeds from across the open web, organizes them into a fast dashboard, and keeps the experience calm: no algorithmic feed shaping, no engagement traps, and no platform lock-in.

It is for people who still want the web to feel readable. If you want one place to follow publications, blogs, research, release notes, and long-form writing without surrendering your attention or your data, LibreRSS is the product.

> [!TIP]
> LibreRSS is a strong fit for personal deployments, research reading, private team dashboards, and any setup where you want a quieter alternative to platform-driven feeds.

## Why it exists

- Read the web without an engagement treadmill.
- Keep your subscriptions, history, and access rules on infrastructure you control.
- Turn a noisy stream of sources into a clean, durable reading system.
- Move from inbox-style triage to article-first reading.
- Run it privately for yourself or open it up selectively.

## Highlights

| Capability | What it gives you |
| --- | --- |
| Universal feed support | Subscribe to RSS, Atom, and JSON feeds from across the open web. |
| Category organization | Group sources into a browsing model that stays usable as your feed list grows. |
| Distraction-free reading | Keep focus on the article instead of interface chrome, prompts, and engagement mechanics. |
| Fast dashboard workflows | Add, sort, refresh, and manage feeds from one responsive control surface. |
| Light and dark themes | Choose the reading environment that fits the room, the hour, and your eyes. |
| Self-hosted ownership | Keep feed data, sessions, and deployment choices under your control. |
| Invite-only mode | Disable public signup for personal, private, or small-team use. |
| Streaming refresh | Watch updates arrive in a flow that feels live without feeling frantic. |

## Quick start

### Prerequisites

- Bun
- PostgreSQL, or a Neon-compatible Postgres connection string

### 1. Install dependencies

```bash
bun install
```

### 2. Configure local overrides

LibreRSS ships with a committed `.env` full of documented defaults. Put machine-specific settings in `.env.local` so you can preserve the defaults and override only what you need.

> [!NOTE]
> Keep secrets and machine-specific values in `.env.local`. The committed `.env` is meant to document defaults, not to hold your local credentials.

```env
DATABASE_URL="postgres://user:password@host:5432/dbname"
DB_DRIVER="pg" # or "neon"
ALLOW_SIGNUP=false
NODE_ENV="development"
LOG_LEVEL="warn"
```

Common settings:

- `DATABASE_URL`: your Postgres connection string.
- `DB_DRIVER`: `pg` for pooled TCP connections, or `neon` for fetch-backed Neon mode.
- `ALLOW_SIGNUP`: set to `true` if you want public registration.
- `LOG_LEVEL`: one of `none`, `error`, `warn`, `info`, or `verbose`.
- `DEV_AUTO_LOGIN_EMAIL` and `DEV_AUTO_LOGIN_PASSWORD`: in development only, automatically sign into `/dashboard` with an existing account using the normal login flow.

> [!TIP]
> Leave `ALLOW_SIGNUP=false` if you want a private or invite-only reader and create accounts with `bun run db:create-user` instead.

<details>
<summary>More useful configuration knobs</summary>

- `LEGAL_PROFILE`: switch between generic self-hosted legal copy and a branded hosted deployment.
- `LOG_COLORS_ENABLED`: enable colored logs locally.
- `ARTICLE_EXTRACT_CACHE_ENABLED`: control article extraction caching.
- `PLAYWRIGHT_BASE_URL`: point Playwright at a specific running environment when needed.

</details>

### 3. Provision the database

```bash
bun run db:provision
```

This verifies the connection and applies the schema.

### 4. Create the first user

When signup is disabled, create an account from the CLI:

```bash
bun run db:create-user <email> <password>
```

Passwords must be at least 8 characters long.

### 5. Start the app

```bash
bun dev
```

Open [http://localhost:3000](http://localhost:3000) and sign in.

### 6. Verify the install

You should be able to:

- open the dashboard without runtime setup errors
- sign in with the user you created
- add a feed and see articles populate in the reading view

> [!IMPORTANT]
> If the app boots but feed refresh fails, check your `DATABASE_URL`, database reachability, and whether your selected `DB_DRIVER` matches the connection you are using.

## Development

### Core commands

| Command | Purpose |
| --- | --- |
| `bun dev` | Start the standard local Next.js development server. |
| `bun run dev:local` | Bind the dev server to `0.0.0.0:3000` for LAN access. |
| `bun run build` | Create a production build. |
| `bun run start` | Run the production server after building. |
| `bun check summary` | Run the repository quality summary. |
| `bun check --junit` | Run the Bun unit and integration test suite. |

For a faster local auth loop in development, you can also add this to `.env.local`:

```env
DEV_AUTO_LOGIN_EMAIL="you@example.com"
DEV_AUTO_LOGIN_PASSWORD="your-existing-password"
```

When both values are present and `NODE_ENV=development`, visiting `/` will route through `/dashboard` and auto-create a normal session cookie with those credentials.

### End-to-end testing

The Playwright workflow is isolated by design. It starts a dedicated Next.js dev server on port `3100`, uses its own `.next-playwright` build directory, and cleans up afterward so your regular development session stays untouched.

> [!IMPORTANT]
> This separation is intentional. It prevents Playwright runs from clobbering your normal development server or `.next` output.

```bash
bunx playwright install chromium
bun run test:e2e
```

Other useful variants:

| Command | Purpose |
| --- | --- |
| `bun run test:e2e:headed` | Run the suite with a visible browser window. |
| `bun run test:e2e:ui` | Open the Playwright UI runner. |
| `bun run test:e2e:coverage` | Generate Playwright coverage artifacts and reports. |

## Database workflow

| Command | Purpose |
| --- | --- |
| `bun run db:provision` | Verify the connection and apply the full schema. |
| `bun run db:push` | Push schema changes directly without generating migration files. |
| `bun run db:generate` | Generate SQL migrations with Drizzle Kit. |
| `bun run db:studio` | Open Drizzle Studio in the browser. |

## Stack

| Layer | Technology |
| --- | --- |
| Framework | Next.js 16, React 19, TypeScript 5 |
| Runtime | Bun |
| Styling | Tailwind CSS v4, shadcn/ui, Radix UI |
| Data | PostgreSQL, Drizzle ORM |
| Content pipeline | Feed parsing, article distillation, sanitization, and extract orchestration |

## Project structure

```text
librerss/
├── src/
│   ├── app/
│   │   ├── api/          # Feed, article, auth, and settings routes
│   │   ├── dashboard/    # Primary reading and feed-management UI
│   │   └── landing/      # Sign-in and public entry experience
│   ├── components/       # Shared app components and vendor-managed UI wrappers
│   └── lib/
│       ├── api/          # HTTP client, services, and response helpers
│       ├── auth/         # Session, CSRF, and credentials logic
│       ├── core/         # Feed fetching, parsing, and article domain logic
│       ├── db/           # Drizzle schema and database access
│       ├── distill/      # Readability and extraction strategies
│       ├── extract/      # Upstream fetch orchestration and caching
│       ├── fetch/        # Transport, proxy, TLS, and cookie-aware fetching
│       ├── hooks/        # Client-side React hooks
│       ├── sanitize/     # HTML sanitization pipeline
│       ├── server/       # Server-only guards, CSP, rate limits, and routing helpers
│       └── utils/        # Pure utility functions
├── scripts/              # Provisioning, user creation, and repo check tooling
├── public/               # Static assets
└── tests/                # Bun and Playwright coverage for product behavior
```

## Configuration notes

- `.env` is committed and documents the full default configuration surface.
- `.env.local` is the right place for machine-specific secrets and deployment overrides.
- `ALLOW_SIGNUP=false` gives you a private or invite-only setup.
- `LEGAL_PROFILE` and related variables let you switch between generic self-hosted copy and a branded hosted deployment.
- `PLAYWRIGHT_BASE_URL` can point Playwright at a specific running environment when needed.

> [!CAUTION]
> Do not treat the committed `.env` as a deployment secret store. Production secrets and local credentials should come from your environment or `.env.local`.

## Design principle

LibreRSS is built around a simple idea: the best feed reader should disappear behind the reading. The interface should help you move through information with intent, not trap you in an infinite loop of updates, nudges, and synthetic urgency.

That principle shapes the app from the bottom up. Feed fetching, content extraction, sanitization, dashboard flow, and self-hosted control all exist to make the reading experience calmer, faster, and more trustworthy.

## License

LibreRSS is released under the [MIT License](LICENSE).

<div align="center">

Made with ❤️ by [Evan Schoffstall](https://github.com/evanschoffstall)

</div>
