"use client";

import { AlertTriangle, RotateCcw } from "lucide-react";

/**
 * Global error boundary rendered for unrecoverable runtime errors.
 * Replaces the root layout, so it provides its own `<html>` and `<body>`.
 */
export default function GlobalError({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="en">
      <body
        className="
          min-h-dvh bg-[hsl(0,0%,100%)] font-sans text-[hsl(0,0%,3.9%)]
          antialiased
          dark:bg-[hsl(0,0%,3.9%)] dark:text-[hsl(0,0%,98%)]
        "
      >
        <main className="
          relative flex min-h-dvh flex-col items-center justify-center
          overflow-hidden
        ">
          <div className="pointer-events-none absolute inset-0">
            <div
              className="
                absolute inset-x-0 top-0 h-48 bg-linear-to-b
                from-[hsl(0,0%,3.9%)]/4 to-transparent
                dark:from-[hsl(0,0%,98%)]/4
              "
            />
            <div
              className="
                absolute top-1/2 left-1/2 size-[600px] -translate-1/2
                rounded-full
                bg-[radial-gradient(circle,hsl(0,0%,9%)/0.03,transparent)]
                dark:bg-[radial-gradient(circle,hsl(0,0%,98%)/0.03,transparent)]
              "
            />
          </div>

          <div
            className="pointer-events-none absolute inset-0 opacity-[0.015]"
            style={{
              backgroundImage:
                "linear-gradient(hsl(0 0% 3.9%) 1px, transparent 1px), linear-gradient(90deg, hsl(0 0% 3.9%) 1px, transparent 1px)",
              backgroundSize: "64px 64px",
            }}
          />

          <div
            className="
              relative z-10 mx-auto flex max-w-lg flex-col items-center px-4
              text-center duration-500 animate-in fade-in slide-in-from-bottom-3
            "
          >
            <div
              className="
                mb-6 flex size-16 items-center justify-center rounded-2xl border
                border-[hsl(0,0%,89.8%)]/40 bg-[hsl(0,0%,100%)]/70 shadow-sm
                dark:border-[hsl(0,0%,14.9%)]/40 dark:bg-[hsl(0,0%,3.9%)]/70
              "
            >
              <AlertTriangle className="size-7 text-[hsl(0,84.2%,60.2%)]" />
            </div>

            <p
              className="
                mb-3 text-xs font-medium tracking-[0.24em]
                text-[hsl(0,0%,45.1%)] uppercase
              "
            >
              Something went wrong
            </p>

            <h1
              className="
                mb-4 text-4xl font-bold tracking-tight
                sm:text-5xl
              "
            >
              500
            </h1>

            <p
              className="
                mb-8 max-w-sm text-sm/7 text-[hsl(0,0%,45.1%)]
                sm:text-base/7
              "
            >
              An unexpected error occurred. Please try again, or return to the
              home page if the problem persists.
            </p>

            <button
              className="
                inline-flex h-11 items-center justify-center gap-2 rounded-xl
                bg-[hsl(0,0%,9%)] px-6 text-sm font-medium text-[hsl(0,0%,98%)]
                shadow-sm transition-colors
                hover:bg-[hsl(0,0%,9%)]/90
                dark:bg-[hsl(0,0%,98%)] dark:text-[hsl(0,0%,9%)]
                dark:hover:bg-[hsl(0,0%,98%)]/90
              "
              onClick={reset}
              type="button"
            >
              <RotateCcw className="size-4" />
              Try again
            </button>
          </div>
        </main>
      </body>
    </html>
  );
}
