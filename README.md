<div align="center">

<img src="public/favicon.svg" width="96" height="96" alt="LibreRSS logo" />

<h1>LibreRSS</h1>

<p><strong>Your feeds. Your rules. Zero noise.</strong></p>

<p>A self-hosted, open-source RSS reader built for calm, focused reading —<br/>no ads, no algorithms, no distractions.</p>

<p>
  <img src="https://img.shields.io/badge/Next.js-16-black?style=flat-square&logo=next.js" alt="Next.js 16" />
  <img src="https://img.shields.io/badge/React-19-61DAFB?style=flat-square&logo=react&logoColor=black" alt="React 19" />
  <img src="https://img.shields.io/badge/TypeScript-5-3178C6?style=flat-square&logo=typescript&logoColor=white" alt="TypeScript 5" />
  <img src="https://img.shields.io/badge/Bun-runtime-F9F1E1?style=flat-square&logo=bun&logoColor=black" alt="Bun" />
  <img src="https://img.shields.io/badge/license-MIT-green?style=flat-square" alt="MIT License" />
</p>

<br/>

</div>

---

## ✨ &nbsp;What is LibreRSS?

LibreRSS is a **beautiful, self-hosted RSS reader** you run on your own server. Subscribe to any feed, organize your sources into categories, and read clean distraction-free articles — all from one dashboard you control.

It also speaks the **GReader protocol**, so clients like **NetNewsWire** connect natively.

---

## 🌟 &nbsp;Features

|                                       |                                          |
| ------------------------------------- | ---------------------------------------- |
| 📡 &nbsp;**Universal RSS support**    | Subscribe to any RSS or Atom feed        |
| 🗂️ &nbsp;**Category organization**    | Group feeds however makes sense to you   |
| 🧘 &nbsp;**Distraction-free reading** | Clean article view, no clutter           |
| 🔗 &nbsp;**GReader API**              | Works with NetNewsWire, Reeder, and more |
| 🌙 &nbsp;**Dark & light mode**        | Looks great either way                   |
| 🔒 &nbsp;**Self-hosted**              | Your data stays on your server           |
| 🚪 &nbsp;**Invite-only mode**         | Disable public signup when you want      |

---

## 🚀 &nbsp;Quick Start

### 1 · Install dependencies

```bash
bun install
```

### 2 · Configure your environment

This repo ships with a committed `.env` containing all default app config.

Create `.env.local` at the project root for machine-specific overrides:

```env
DATABASE_URL="postgres://user:password@host:5432/dbname"
ALLOW_SIGNUP="false"
NODE_ENV="development"
LOG_LEVEL="warn"
...
```

### 3 · Provision the database

```bash
bun run db:provision
```

Verifies your connection and applies the full schema in one shot.

### 4 · Start the dev server

```bash
bun dev
```

Open **[http://localhost:3000](http://localhost:3000)** 🎉

> **GReader clients** connect at `http://localhost:3000/api/greader.php`

---

## 🧱 &nbsp;Stack

<table>
  <tr>
    <td><strong>⚡ Framework</strong></td>
    <td>Next.js 16 · React 19 · TypeScript 5</td>
  </tr>
  <tr>
    <td><strong>🎨 UI</strong></td>
    <td>Tailwind CSS v4 · shadcn/ui · Radix UI · Lucide Icons</td>
  </tr>
  <tr>
    <td><strong>🗄️ Database</strong></td>
    <td>PostgreSQL · Drizzle ORM</td>
  </tr>
  <tr>
    <td><strong>🏎️ Runtime</strong></td>
    <td>Bun</td>
  </tr>
</table>

---

## 🗄️ &nbsp;Database Commands

| Command                | Description                                                |
| ---------------------- | ---------------------------------------------------------- |
| `bun run db:provision` | ✅ &nbsp;Verify connection and apply full schema           |
| `bun run db:push`      | ⬆️ &nbsp;Push schema changes directly (no migration files) |
| `bun run db:generate`  | 📄 &nbsp;Generate SQL migration files via Drizzle Kit      |
| `bun run db:studio`    | 🔬 &nbsp;Open Drizzle Studio in the browser                |

---

## 👤 &nbsp;User Management

### Create a user

```bash
bun run create-user <email> <password>
```

Inserts a user directly into the database. Minimum 8-character password. Ideal when public signup is disabled.

---

## 🗂️ &nbsp;Project Structure

```
librerss/
├── src/
│   ├── app/
│   │   ├── api/          # Feed, article, and GReader API routes
│   │   ├── dashboard/    # Main reader UI
│   │   └── landing/      # Marketing / login page
│   └── lib/
│       ├── db/           # Drizzle schema and database client
│       └── api/          # Service layer
├── scripts/              # CLI scripts (provision, create-user, check)
└── public/               # Static assets
```

---

<div align="center">

**Made with ❤️ by [Evan Schoffstall](https://github.com/evanschoffstall)**

_MIT License · Free forever · Self-host it_

</div>
