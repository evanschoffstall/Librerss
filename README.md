<div align="center">

<br/>

<img src="public/favicon.svg" width="112" height="112" alt="LibreRSS logo" />

<h1>LibreRSS</h1>

<p><em>Your feeds. Your rules. Zero noise.</em></p>

<p>
  <a href="https://nextjs.org"><img src="https://img.shields.io/badge/Next.js-16-000000?style=for-the-badge&logo=next.js&logoColor=white" alt="Next.js 16" /></a>
  <a href="https://react.dev"><img src="https://img.shields.io/badge/React-19-61DAFB?style=for-the-badge&logo=react&logoColor=black" alt="React 19" /></a>
  <a href="https://www.typescriptlang.org"><img src="https://img.shields.io/badge/TypeScript-5-3178C6?style=for-the-badge&logo=typescript&logoColor=white" alt="TypeScript 5" /></a>
  <a href="https://bun.sh"><img src="https://img.shields.io/badge/Bun-runtime-F9F1E1?style=for-the-badge&logo=bun&logoColor=black" alt="Bun" /></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/License-MIT-22c55e?style=for-the-badge" alt="MIT License" /></a>
</p>

<p>A self-hosted, open-source RSS feed platform built for calm, focused reading.<br/>Fast feeds. Clean layouts. No clutter.</p>

<br/>

</div>

---

## What is LibreRSS?

LibreRSS is a **self-hosted RSS feed platform** you run on your own server. Subscribe to any RSS or Atom feed, organize sources into categories, and read distraction-free articles from a single dashboard you fully control.

---

## Features

|     | Feature                      | Description                                       |
| --- | ---------------------------- | ------------------------------------------------- |
| 📡  | **Universal feed support**   | Subscribe to any RSS, Atom, or JSON feed          |
| 🗂️  | **Category organization**    | Group feeds into custom categories                |
| 🧘  | **Distraction-free reading** | Clean article view, no clutter                    |
| 🧩  | **Flexible feed management** | Organize, refresh, and manage sources from one UI |
| 🌙  | **Dark & light mode**        | Dark by default with manual override              |
| 🔒  | **Self-hosted**              | Your data stays on your server, always            |
| 🚪  | **Invite-only mode**         | Restrict registration via `ALLOW_SIGNUP` env flag |
| ⚡  | **Streaming refresh**        | Feeds update in real time via server-sent events  |

---

## Quick Start

### 1 · Install dependencies

```bash
bun install
```

### 2 · Configure your environment

This repo ships with a committed `.env` containing sensible defaults. Create `.env.local` at the project root for machine-specific overrides:

```env
DATABASE_URL="postgres://user:password@host:5432/dbname"
ALLOW_SIGNUP="false"
NODE_ENV="development"
LOG_LEVEL="warn"
```

### 3 · Provision the database

```bash
bun run db:provision
```

Verifies the database connection and applies the full schema.

### 4 · Start the dev server

```bash
bun dev
```

Open **[http://localhost:3000](http://localhost:3000)** and you're up.

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

## User Management

When public signup is disabled, create accounts directly from the CLI:

```bash
bun run db:create-user <email> <password>
```

Inserts a user into the database. Password must be at least 8 characters.

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

MIT License · Free forever · Self-host it

</div>
