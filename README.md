# LibreRSS 📰

Free, open-source RSS reader for a calm, ad-free reading flow.

## ✨ What it does

- Follow any RSS feed in seconds
- Organize feeds into clean categories
- Read normalized, distraction-free article views
- Manage everything from a simple dashboard

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
   NODE_ENV="development"
   ```

3. Push the database schema

   ```bash
   bun run db:push
   ```

4. Start the development server

   ```bash
   bun dev
   ```

5. Open http://localhost:3000 ✨

---

Made with love ❤️
