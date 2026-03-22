import { ArrowLeft, FileQuestion } from "lucide-react";
import Link from "next/link";

import { Button } from "@/components/ui/button";

/**
 * Custom 404 page rendered when a route is not found.
 * Inherits the root layout, so no `<html>` or `<body>` wrapper is needed.
 */
export default function NotFound() {
  return (
    <main className="
      relative flex min-h-dvh flex-col items-center justify-center
      overflow-hidden bg-background text-foreground
    ">
      <div className="pointer-events-none absolute inset-0">
        <div
          className="
            absolute inset-x-0 top-0 h-48 bg-linear-to-b from-foreground/4
            to-transparent
          "
        />
        <div
          className="
            bg-gradient-radial absolute top-1/2 left-1/2 size-[600px]
            -translate-1/2 rounded-full from-primary/3 to-transparent
          "
        />
      </div>

      <div
        className="pointer-events-none absolute inset-0 opacity-[0.015]"
        style={{
          backgroundImage:
            "linear-gradient(hsl(var(--foreground)) 1px, transparent 1px), linear-gradient(90deg, hsl(var(--foreground)) 1px, transparent 1px)",
          backgroundSize: "64px 64px",
        }}
      />

      <div
        className="
          relative z-10 mx-auto flex max-w-lg flex-col items-center px-4
          text-center
          motion-safe:duration-500 motion-safe:animate-in motion-safe:fade-in
          motion-safe:slide-in-from-bottom-3
        "
      >
        <div
          className="
            mb-6 flex size-16 items-center justify-center rounded-2xl border
            border-border/40 bg-card/70 shadow-sm backdrop-blur-sm
          "
        >
          <FileQuestion className="size-7 text-muted-foreground" />
        </div>

        <p
          className="
            mb-3 text-xs font-medium tracking-[0.24em] text-muted-foreground
            uppercase
          "
        >
          Page not found
        </p>

        <h1
          className="
            mb-4 text-4xl font-bold tracking-tight
            sm:text-5xl
          "
        >
          404
        </h1>

        <p
          className="
            mb-8 max-w-sm text-sm/7 text-muted-foreground
            sm:text-base/7
          "
        >
          The page you&rsquo;re looking for doesn&rsquo;t exist or has been
          moved.
        </p>

        <Button asChild className="h-11 rounded-xl px-6" size="lg">
          <Link className="inline-flex items-center gap-2" href="/landing">
            <ArrowLeft className="size-4" />
            Back to home
          </Link>
        </Button>
      </div>
    </main>
  );
}
