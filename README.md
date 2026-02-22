# LibreRSS

Free, open-source RSS reader for a calm, ad-free reading flow.

## What it does

- Follow any RSS feed in seconds
- Organize feeds into clean categories
- Read normalized, distraction-free article views
- Manage everything from a simple dashboard

## Stack

- Next.js 16 + React 19 + TypeScript
- Tailwind CSS + shadcn/ui (Radix)
- Drizzle ORM + PostgreSQL
- Bun scripts

## Quick start

1. Install dependencies

   ```bash
   bun install
   ```

2. Create `.env.local`

   ```env
   DATABASE_URL="postgres://user:password@host:5432/dbname"
   ALLOW_SIGNUP="false"
   NODE_ENV="development"
   # TRUSTED_PROXY_COUNT=1
   ```

   `ALLOW_SIGNUP` controls whether users can create accounts through the UI/API. Set it to `"false"` to disable public signup while keeping login available for existing users.

   `TRUSTED_PROXY_COUNT` (default `1`) sets the number of trusted reverse-proxy hops in front of the app. The rate-limiter reads this value to select the correct IP from the `X-Forwarded-For` header (rightmost trusted hop), preventing IP spoofing. Set to `0` if running without any proxy, `1` behind a single load-balancer or Vercel edge, and increase by one per additional upstream hop.

3. Provision the database

   ```bash
   bun run db:provision
   ```

   This verifies your connection and pushes the full schema. Run it once on a fresh database or after pulling schema changes.

4. Start the development server

   ```bash
   bun dev
   ```

5. Open http://localhost:3000

---

## Database

### Provision from scratch

```bash
bun run db:provision
```

Validates `DATABASE_URL`, confirms the connection, and runs `drizzle-kit push` to create all tables. Safe to re-run — Drizzle only applies changes that are missing.

### Other database commands

| Command               | Description                                       |
| --------------------- | ------------------------------------------------- |
| `bun run db:push`     | Push schema changes directly (no migration files) |
| `bun run db:generate` | Generate SQL migration files                      |
| `bun run db:studio`   | Open Drizzle Studio to browse your data           |

---

## User management

### Create a user

```bash
bun run create-user <email> <password>
```

Creates an account directly in the database. Password must be at least 8 characters. Errors if the email already exists.

---

Made with love
