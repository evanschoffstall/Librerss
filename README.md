# 📰 LibreRSS

A free, open-source RSS reader for a calm, ad-free reading flow.

## ✨ What it does

- Subscribe to any RSS feed quickly
- Organize feeds into categories
- Read normalized, distraction-free articles
- Manage everything from one dashboard
- Connect NetNewsWire/FreshRSS-style clients via a greader-compatible API

## 🧱 Stack

- Next.js 16 + React 19 + TypeScript
- Tailwind CSS + shadcn/ui (Radix)
- Drizzle ORM + PostgreSQL
- Bun scripts

## 🚀 Quick start

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

   - `ALLOW_SIGNUP`: set to `"false"` to disable public signup (existing users can still log in)
   - `TRUSTED_PROXY_COUNT`: trusted reverse-proxy hops for `X-Forwarded-For` IP detection (default `1`)

3. Provision the database

   ```bash
   bun run db:provision
   ```

   Verifies `DATABASE_URL`, checks the connection, and applies the schema.

4. Start the development server

   ```bash
   bun dev
   ```

5. Open 🌐 http://localhost:3000

   NetNewsWire/FreshRSS-style greader clients can use `http://localhost:3000/api/greader.php`.

---

## 🗄️ Database

### ⚙️ Commands

| Command                | Description                                       |
| ---------------------- | ------------------------------------------------- |
| `bun run db:provision` | Validate connection and apply full schema         |
| `bun run db:push`      | Push schema changes directly (no migration files) |
| `bun run db:generate`  | Generate SQL migration files                      |
| `bun run db:studio`    | Open Drizzle Studio                               |

---

## 👤 User management

### ➕ Create a user

```bash
bun run create-user <email> <password>
```

Creates a user directly in the database. Password must be at least 8 characters.

---

Made with love by Evan Schoffstall ❤️
