# LibreRSS 📰

> **Reviving the free cloud tradition**

LibreRSS is a free, open-source cloud RSS service and reader that allows users to subscribe to any RSS feed and read their favorite websites in a single place, without ads, in a standardized minimalist format, across any device.

[![MIT License](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![TypeScript](https://img.shields.io/badge/TypeScript-007ACC?logo=typescript&logoColor=white)](#)
[![Next.js](https://img.shields.io/badge/Next.js-000000?logo=next.js&logoColor=white)](#)
[![Drizzle](https://img.shields.io/badge/Drizzle-000000?logo=drizzle&logoColor=C5F74F)](#)

## ✨ Features

- **100% Free** - No subscription fees or premium tiers
- **Open Source** - Fully transparent and self-hostable
- **No Ads** - Clean, distraction-free reading experience
- **Modern Design** - Minimalist UI with beautiful animations
- **Cross-Device** - Works seamlessly across all your devices
- **RSS Parsing** - Subscribe to any RSS feed with ease
- **Cloud Sync** - Your feeds and articles synchronized across devices

## 🚀 Tech Stack

- **Frontend**: Next.js 15, React 19, TypeScript
- **Styling**: Tailwind CSS with custom components
- **UI Components**: shadcn/ui (Radix UI)
- **Database**: PostgreSQL with Drizzle ORM
- **Hosting**: Supabase (database)
- **Package Manager**: Bun/PNPM

## 🏃‍♂️ Getting Started

### Prerequisites

- Node.js 18+
- Bun or PNPM package manager
- PostgreSQL database (or Supabase account)

### Installation

1. **Clone the repository**

   ```bash
   git clone https://github.com/yourusername/librerss.git
   cd librerss
   ```

2. **Install dependencies**

   ```bash
   bun install
   # or
   pnpm install
   ```

3. **Set up environment variables**

   Create a `.env.local` file in the root directory:

   ```env
   # Database
   SUPABASE_URL="your_supabase_database_url"

   # Next.js
   NODE_ENV="development"
   ```

4. **Set up the database**

   ```bash
   # Generate SQL migrations (optional)
   bun run db:generate

   # Push schema changes
   bun run db:push
   ```

5. **Start the development server**

   ```bash
   bun dev
   # or
   pnpm dev
   ```

6. **Open your browser**

   Navigate to [http://localhost:3000](http://localhost:3000) to see LibreRSS in action!

## 📖 Usage

### Adding RSS Feeds

1. Go to the Dashboard
2. Click on "Settings" in the menu
3. Add a new category or feed URL
4. Your feeds will be automatically fetched and updated

### Reading Articles

- Browse feeds in the sidebar
- Click on any article to read it
- Articles are cached for optimal performance
- Enjoy an ad-free, clean reading experience

## 🛠️ Development

### Project Structure

```
src/
├── app/                    # Next.js app directory
│   ├── api/               # API routes
│   ├── dashboard/         # Dashboard page
│   └── landing/           # Landing page
├── components/            # Reusable UI components
├── lib/                   # Utilities and services
│   ├── core/             # Core utilities and constants
│   └── services/         # External services (RSS, database)
└── styles/               # Global stylesheets
```

### Available Scripts

```bash
# Development
bun dev          # Start development server with Turbopack

# Building
bun build        # Build for production
bun start        # Start production server

# Code Quality
bun lint         # Run ESLint

# Database
bun run db:generate   # Generate Drizzle migrations
bun run db:push       # Push schema changes to database
bun run db:studio     # Open Drizzle Studio
```

### Database Schema

The application uses a simple schema with three main models:

- **Feed**: RSS feed information and metadata
- **Article**: Individual articles from feeds
- **FeedCategory**: Organization of feeds into categories

## 🔧 Configuration

### Environment Variables

| Variable              | Description                                        | Required |
| --------------------- | -------------------------------------------------- | -------- |
| `SUPABASE_URL`        | PostgreSQL database connection URL                 | Yes      |
| `SUPABASE_DIRECT_URL` | Direct database connection URL (legacy / optional) | No       |
| `NODE_ENV`            | Environment (development/production)               | No       |

### Customization

- **Styling**: Modify `tailwind.config.ts` and component styles
- **Content**: Update constants in `src/lib/core/constants.ts`
- **Features**: Add new components and services as needed

## 🤝 Contributing

We welcome contributions! Please feel free to submit a Pull Request. For major changes, please open an issue first to discuss what you would like to change.

### Development Guidelines

1. Follow TypeScript best practices
2. Use Tailwind CSS for styling
3. Write meaningful commit messages
4. Test your changes thoroughly

## 📜 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🌟 Inspiration

LibreRSS is inspired by the legacy of Google Reader (2005-2013), aiming to capture the same magic of long-lasting free accessibility and low mental overhead that made RSS reading a joy.

## 📞 Support

- 🐛 **Bug Reports**: [Create an issue](https://github.com/yourusername/librerss/issues)
- 💡 **Feature Requests**: [Create an issue](https://github.com/yourusername/librerss/issues)
- 💬 **Questions**: [Discussions](https://github.com/yourusername/librerss/discussions)

---

**Built with ❤️ by the LibreRSS team**

_In the tradition of the open internet, LibreRSS provides a completely free alternative to paid RSS services with no advertising or subscription fees._
