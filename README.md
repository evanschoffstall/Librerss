<div align="center">

<br />

<img src="public/favicon.svg" width="112" height="112" alt="LibreRSS logo" />

# LibreRSS

_A modern RSS reader for people who want precious signal, not sludge._

<p>
	<a href="https://www.typescriptlang.org"><img src="https://img.shields.io/badge/TypeScript-5-3178C6?style=for-the-badge&logo=typescript&logoColor=white" alt="TypeScript 5" /></a>
	<a href="https://bun.sh"><img src="https://img.shields.io/badge/Bun-runtime-F9F1E1?style=for-the-badge&logo=bun&logoColor=black" alt="Bun" /></a>
	<a href="https://www.postgresql.org"><img src="https://img.shields.io/badge/PostgreSQL-16-4169E1?style=for-the-badge&logo=postgresql&logoColor=white" alt="PostgreSQL" /></a>
	<a href="https://orm.drizzle.team"><img src="https://img.shields.io/badge/Drizzle-ORM-C5F74F?style=for-the-badge&logo=drizzle&logoColor=black" alt="Drizzle ORM" /></a>
	<a href="LICENSE"><img src="https://img.shields.io/badge/License-MIT-22c55e?style=for-the-badge" alt="MIT License" /></a>
</p>

<p>
	<a href="https://nextjs.org"><img src="https://img.shields.io/badge/Next.js-16-000000?style=for-the-badge&logo=next.js&logoColor=white" alt="Next.js 16" /></a>
	<a href="https://react.dev"><img src="https://img.shields.io/badge/React-19-61DAFB?style=for-the-badge&logo=react&logoColor=black" alt="React 19" /></a>
	<a href="https://tailwindcss.com"><img src="https://img.shields.io/badge/Tailwind%20CSS-4-06B6D4?style=for-the-badge&logo=tailwindcss&logoColor=white" alt="Tailwind CSS 4" /></a>
	<a href="https://motion.dev"><img src="https://img.shields.io/badge/Motion-12-101114?style=for-the-badge&logo=framer&logoColor=white" alt="Motion 12" /></a>
	<a href="https://playwright.dev"><img src="https://img.shields.io/badge/Playwright-E2E-2EAD33?style=for-the-badge&logo=playwright&logoColor=white" alt="Playwright" /></a>
</p>

</div>

LibreRSS is an open-source, self-hostable RSS reader built for focused reading. Subscribe to RSS, Atom, and JSON feeds, organize them into a fast dashboard, and read without algorithmic interference, engagement traps, or platform lock-in. Run it privately for yourself or open it selectively to a team.

## Highlights

| Capability               | What it gives you                                                                         |
| ------------------------ | ----------------------------------------------------------------------------------------- |
| Universal feed support   | Subscribe to RSS, Atom, and JSON feeds from across the open web.                          |
| Category organization    | Group sources into a browsing model that stays usable as your feed list grows.            |
| Distraction-free reading | Keep focus on the article instead of interface chrome, prompts, and engagement mechanics. |
| Fast dashboard workflows | Add, sort, refresh, and manage feeds from one responsive control surface.                 |
| Light and dark themes    | Choose the reading environment that fits the room, the hour, and your eyes.               |
| Self-hosted ownership    | Keep feed data, sessions, and deployment choices under your control.                      |
| Invite-only mode         | Disable public signup for personal, private, or small-team use.                           |
| Streaming refresh        | Watch updates arrive in a flow that feels live without feeling frantic.                   |

## Quick start

### Prerequisites

- Bun
- PostgreSQL, or a Neon-compatible Postgres connection string

### 1. Install dependencies

```bash
bun install
```

### 2. Configure local overrides

LibreRSS ships with a committed `.env` full of documented defaults. Put machine-specific settings in `.env.local`; keep secrets and credentials out of the committed file.

```env
DATABASE_URL="postgres://user:password@host:5432/dbname"
DB_DRIVER="pg" # or "neon"
ALLOW_SIGNUP=false
NODE_ENV="development"
LOG_LEVEL="warn"
```

- `DATABASE_URL`: your Postgres connection string.
- `DB_DRIVER`: `pg` for pooled TCP connections, or `neon` for fetch-backed Neon mode.
- `ALLOW_SIGNUP`: set to `true` for public registration; leave `false` for a private setup and use `bun run db:create-user` to create accounts.
- `LOG_LEVEL`: one of `none`, `error`, `warn`, `info`, or `verbose`.

Additional knobs: `LEGAL_PROFILE` (switch legal copy), `LOG_COLORS_ENABLED` (colored dev logs), `ARTICLE_EXTRACT_CACHE_ENABLED` (extraction caching), `PLAYWRIGHT_BASE_URL` (point Playwright at a custom host).

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

You should be able to open the dashboard, sign in, add a feed, and see articles populate. If feed refresh fails, check your `DATABASE_URL`, database reachability, and whether `DB_DRIVER` matches the connection you are using.

## Development

### Core commands

| Command             | Purpose                                              |
| ------------------- | ---------------------------------------------------- |
| `bun dev`           | Start the standard local Next.js development server. |
| `bun run build`     | Create a production build.                           |
| `bun run start`     | Run the production server after building.            |
| `bun check summary` | Run the repository quality summary.                  |
| `bun check --junit` | Run the Bun unit and integration test suite.         |

### Quality tooling

The full quality suite includes a pinned Python-based complexity check powered by `lizard`.

Install the Python tooling once before running `bun check` commands that include the `lizard` step:

```bash
python3 -m pip install -r requirements-dev.txt
```

### End-to-end testing

The Playwright workflow is isolated by design: it runs on port `3100` with its own `.next-playwright` build directory and cleans up afterward, leaving your normal dev session untouched. Browser binaries are not installed during `bun install` — run `bun run setup:playwright` first on any machine where you want to run the suite.

```bash
bun run setup:playwright
bun run test:e2e
```

Other useful variants:

| Command                     | Purpose                                             |
| --------------------------- | --------------------------------------------------- |
| `bun run test:e2e:headed`   | Run the suite with a visible browser window.        |
| `bun run test:e2e:ui`       | Open the Playwright UI runner.                      |
| `bun run test:e2e:coverage` | Generate Playwright coverage artifacts and reports. |

## Database workflow

| Command                | Purpose                                                          |
| ---------------------- | ---------------------------------------------------------------- |
| `bun run db:provision` | Verify the connection and apply the full schema.                 |
| `bun run db:push`      | Push schema changes directly without generating migration files. |
| `bun run db:generate`  | Generate SQL migrations with Drizzle Kit.                        |
| `bun run db:studio`    | Open Drizzle Studio in the browser.                              |

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

#

<div align="center">

Made with ❤️ by [Evan Schoffstall](https://github.com/evanschoffstall)

</div>
