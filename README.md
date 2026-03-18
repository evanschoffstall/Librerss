<div align="center">

<br/>

<img src="public/favicon.svg" width="112" height="112" alt="LibreRSS logo" />

<h1>LibreRSS</h1>

<p><em>A modern RSS reader for people who want precious signal, not sludge.</em></p>

<p>
  <a href="https://nextjs.org"><img src="https://img.shields.io/badge/Next.js-16-000000?style=for-the-badge&logo=next.js&logoColor=white" alt="Next.js 16" /></a>
  <a href="https://react.dev"><img src="https://img.shields.io/badge/React-19-61DAFB?style=for-the-badge&logo=react&logoColor=black" alt="React 19" /></a>
  <a href="https://www.typescriptlang.org"><img src="https://img.shields.io/badge/TypeScript-5-3178C6?style=for-the-badge&logo=typescript&logoColor=white" alt="TypeScript 5" /></a>
  <a href="https://bun.sh"><img src="https://img.shields.io/badge/Bun-runtime-F9F1E1?style=for-the-badge&logo=bun&logoColor=black" alt="Bun" /></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/License-MIT-22c55e?style=for-the-badge" alt="MIT License" /></a>
</p>

</div>

---

## What is LibreRSS?

LibreRSS is a **modern, beautiful, open-source, self-hostable RSS reader** built for end-to-end distraction-free reading. Subscribe to any RSS or Atom feed, organize sources into categories, and follow everything from one calm, fast dashboard you fully control.

It is designed for readers who want a beautiful, unified, and clean experience to keep up with the web: no algorithmic chaos, no bloated interface, and no surrendering their data to a third-party platform.

---

## Features

|     | Feature                      | Description                                                            |
| --- | ---------------------------- | ---------------------------------------------------------------------- |
| 📡  | **Universal feed support**   | Pull in RSS, Atom, and JSON feeds from across the open web             |
| 🗂️  | **Category organization**    | Turn a noisy reading list into a clean, browsable system               |
| 🧘  | **Distraction-free reading** | Focus on the article, not the chrome, clutter, or engagement traps     |
| 🧩  | **Flexible feed management** | Add, sort, refresh, and manage sources from one fast dashboard         |
| 🌙  | **Dark & light mode**        | Choose the look that fits your workflow, day or night                  |
| 🔒  | **Self-hosted**              | Keep your feeds, reading history, and access on infrastructure you own |
| 🚪  | **Invite-only mode**         | Run it privately or gate access with a simple environment flag         |
| ⚡  | **Streaming refresh**        | See feed updates arrive in real time with a responsive reading flow    |

---

## Quick Start

### 1 · Install dependencies

```bash
bun install
```

### 2 · Configure your environment

This repo ships with a committed `.env` containing sensible defaults. Create `.env.local` at the project root to point LibreRSS at your own database and local runtime settings:

```env
DATABASE_URL="postgres://user:password@host:5432/dbname"
DB_DRIVER="pg" # or stateless "neon"
ALLOW_SIGNUP="false"
NODE_ENV="development"
LOG_LEVEL="warn"
```

### 3 · Provision the database

```bash
bun run db:provision
```

Verifies the database connection and applies the full schema so you can start with a ready-to-use instance.

### 4 · Add a user

When public signup is disabled, create accounts directly from the CLI for a private or invite-only deployment:

```bash
bun run db:create-user <email> <password> # Password must be at least 8 characters.
```

### 4 · Start the dev server

```bash
bun dev
```

Open **[http://localhost:3000](http://localhost:3000)** to start reading in a clean, self-hosted dashboard.

### 5 · Run the Playwright e2e suite

The e2e suite starts its own dedicated Next.js dev server on port `3100`, uses a separate `.next-playwright` build directory so it does not collide with your normal local app session, shuts that server down when the run finishes, and removes the temporary build output afterward so repo checks stay clean.

```bash
bunx playwright install chromium
bun run test:e2e
```

---

## Stack

| Layer        | Technology                                            |
| ------------ | ----------------------------------------------------- |
| ⚡ Framework | Next.js 16 · React 19 · TypeScript 5                  |
| 🎨 UI        | Tailwind CSS v4 · shadcn/ui · Radix UI · Lucide Icons |
| 🗄️ Database  | PostgreSQL · Drizzle ORM                              |
| 🏎️ Runtime   | Bun                                                   |

---

## Database Commands

| Command                | Description                                       |
| ---------------------- | ------------------------------------------------- |
| `bun run db:provision` | Verify connection and apply full schema           |
| `bun run db:push`      | Push schema changes directly (no migration files) |
| `bun run db:generate`  | Generate SQL migration files via Drizzle Kit      |
| `bun run db:studio`    | Open Drizzle Studio in the browser                |

---

## Project Structure

```
librerss/
├── src/
│   ├── app/
│   │   ├── api/          # Feed, article, auth, and settings routes
│   │   ├── dashboard/    # Main dashboard UI
│   │   └── landing/      # Login and marketing page
│   └── lib/
│       ├── api/          # HTTP client, services, response helpers
│       ├── auth/         # Credentials, CSRF, session management
│       ├── core/         # Domain logic: feed fetching, parsing, articles
│       ├── db/           # Drizzle schema and database client
│       ├── distill/      # Article distillation strategies: custom, Readability, Defuddle
│       ├── extract/      # Upstream fetch orchestration and caching
│       ├── fetch/        # Fingerprinted HTTP fetching: TLS client, proxy/SOCKS, cookies
│       ├── hooks/        # React hooks (client-side only)
│       ├── sanitize/     # HTML sanitization pipeline
│       ├── server/       # Server-only guards, rate limiting, CSP, proxy routing
│       └── utils/        # Pure utility functions
├── scripts/              # CLI utilities (provision, db-create-user, check)
└── public/               # Static assets
```

---

<div align="center">

Made with ❤️ by [Evan Schoffstall](https://github.com/evanschoffstall)

MIT License · Open source · Self-host it your way

</div>
