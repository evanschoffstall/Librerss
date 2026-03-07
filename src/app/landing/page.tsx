"use client";

import { ThemeNoticeDialog } from "@/components/ThemeNoticeDialog";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { ArrowRight, Cloud, Rss, Zap } from "lucide-react";
import Link from "next/link";

const features = [
  {
    icon: Cloud,
    label: "Cloud Synced",
    desc: "Access your feeds from anywhere",
  },
  {
    icon: Zap,
    label: "Instant & Free",
    desc: "No subscriptions, no ads",
  },
  {
    icon: Rss,
    label: "Any RSS Feed",
    desc: "Add any source in seconds",
  },
] as const;

const LandingView = () => {
  return (
    <div className="relative flex min-h-full flex-col items-center justify-center py-12 sm:py-20">
      <ThemeNoticeDialog />

      {/* Ambient background glow */}
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2">
          <div className="landing-glow-main h-[800px] w-[800px] rounded-full bg-gradient-radial from-primary/[0.03] to-transparent" />
        </div>
        <div className="absolute left-1/4 top-1/3 -translate-x-1/2 -translate-y-1/2">
          <div className="landing-glow-left h-[400px] w-[400px] rounded-full bg-gradient-radial from-primary/[0.02] to-transparent blur-3xl" />
        </div>
        <div className="landing-glow-right absolute right-1/4 bottom-1/3 h-[300px] w-[300px] rounded-full bg-gradient-radial from-primary/[0.02] to-transparent blur-3xl" />
      </div>

      {/* Subtle grid pattern */}
      <div
        className="pointer-events-none absolute inset-0 opacity-[0.015]"
        style={{
          backgroundImage:
            "linear-gradient(hsl(var(--foreground)) 1px, transparent 1px), linear-gradient(90deg, hsl(var(--foreground)) 1px, transparent 1px)",
          backgroundSize: "64px 64px",
        }}
      />

      {/* Content */}
      <div className="relative z-10 mx-auto w-full max-w-4xl px-4 text-center sm:px-6">
        {/* Eyebrow pill */}
        <div
          className="landing-reveal mb-5 inline-flex max-w-[90vw] items-center gap-2 rounded-full border border-border/50 bg-card/50 px-3.5 py-1.5 text-xs font-medium text-muted-foreground backdrop-blur-sm sm:mb-6"
          style={{ animationDelay: "var(--motion-delay-0)" }}
        >
          <Rss className="size-3 shrink-0" />
          <span className="truncate">
            Open-source · Self-hostable · GReader compatible
          </span>
        </div>

        {/* Headline */}
        <h1
          className="landing-reveal mb-4 text-[2.5rem] font-bold leading-[1.1] tracking-tight sm:mb-6 sm:text-6xl lg:text-8xl"
          style={{ animationDelay: "var(--motion-delay-1)" }}
        >
          <span className="block">Your reading,</span>
          <span className="block bg-gradient-to-br from-foreground/60 via-muted-foreground/60 to-muted-foreground/40 bg-clip-text text-transparent">
            without the noise.
          </span>
        </h1>

        {/* Subtitle */}
        <p
          className="landing-reveal mx-auto mb-8 max-w-lg text-base text-muted-foreground sm:mb-10 sm:text-xl"
          style={{ animationDelay: "var(--motion-delay-2)" }}
        >
          A free, open-source cloud reader for RSS. All your sources in one
          calm, focused inbox.
        </p>

        {/* Single CTA */}
        <div
          className="landing-reveal mb-10 sm:mb-16"
          style={{ animationDelay: "var(--motion-delay-3)" }}
        >
          <div className="transition-transform anim-duration-ui anim-ease-ui hover:-translate-y-0.5">
            <Button size="lg" className="h-12 px-8 text-base shadow-sm" asChild>
              <Link
                href="/dashboard"
                className="group inline-flex items-center"
              >
                Start Reading
                <span className="landing-arrow-bob ml-2 inline-flex transition-transform anim-duration-ui anim-ease-ui group-hover:translate-x-1">
                  <ArrowRight className="h-4 w-4" />
                </span>
              </Link>
            </Button>
          </div>
        </div>

        {/* Feature pillars */}
        <div className="mx-auto grid max-w-3xl gap-3 sm:grid-cols-3 sm:gap-4">
          {features.map(({ icon: Icon, label, desc }, index) => (
            <div
              key={label}
              className="landing-reveal landing-feature group flex items-center gap-4 rounded-xl border border-border/20 p-4 transition-[transform,border-color,background-color] anim-duration-ui anim-ease-ui sm:flex-col sm:items-center sm:gap-3 sm:p-5 hover:-translate-y-1 hover:border-border/50 hover:bg-card/50"
              style={{
                animationDelay: `calc(var(--motion-delay-3) + (${index + 1} * var(--motion-delay-step)))`,
              }}
            >
              <div className="relative flex shrink-0 items-center justify-center">
                <div className="absolute size-14 rounded-full border border-border/20 max-sm:hidden" />
                <div className="landing-feature-icon relative flex size-10 items-center justify-center rounded-lg border border-border/40 bg-card/70 shadow-sm backdrop-blur-sm">
                  <Icon className="h-5 w-5 text-muted-foreground" />
                </div>
              </div>
              <div className="flex flex-col items-start gap-0.5 sm:items-center">
                <span className="text-sm font-medium">{label}</span>
                <span className="text-xs text-muted-foreground">{desc}</span>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Bottom tagline */}
      <div className="landing-tagline mt-12 text-center text-xs text-muted-foreground/50">
        <p>
          Made with ❤️ by{" "}
          <a
            href="https://github.com/evanschoffstall"
            target="_blank"
            rel="noreferrer"
            className="underline-offset-2 hover:underline"
          >
            Evan Schoffstall
          </a>
        </p>
      </div>
    </div>
  );
};

export default function Landing() {
  return (
    <main className="h-full">
      <ScrollArea className="h-full">
        <LandingView />
      </ScrollArea>
    </main>
  );
}
