"use client";

import { ThemeNoticeDialog } from "@/components/ThemeNoticeDialog";
import { Button } from "@/components/ui/button";
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
    <div className="relative flex min-h-screen flex-col items-center justify-center overflow-hidden">
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
      <div className="relative z-10 mx-auto max-w-4xl px-6 text-center">
        {/* Eyebrow pill */}
        <div
          className="landing-reveal mb-6 inline-flex items-center gap-2 rounded-full border border-border/50 bg-card/50 px-3.5 py-1.5 text-xs font-medium text-muted-foreground backdrop-blur-sm"
          style={{ animationDelay: "var(--motion-delay-0)" }}
        >
          <Rss className="size-3" />
          Open-source · Self-hostable · GReader compatible
        </div>

        {/* Headline */}
        <h1
          className="landing-reveal mb-6 text-5xl font-bold tracking-tight sm:text-7xl lg:text-8xl"
          style={{ animationDelay: "var(--motion-delay-1)" }}
        >
          <span className="block">Your reading,</span>
          <span className="block bg-gradient-to-br from-foreground/60 via-muted-foreground/60 to-muted-foreground/40 bg-clip-text text-transparent">
            without the noise.
          </span>
        </h1>

        {/* Subtitle */}
        <p
          className="landing-reveal mx-auto mb-10 max-w-lg text-lg text-muted-foreground sm:text-xl"
          style={{ animationDelay: "var(--motion-delay-2)" }}
        >
          A free, open-source cloud reader for RSS. All your sources in one
          calm, focused inbox.
        </p>

        {/* Single CTA */}
        <div
          className="landing-reveal mb-16"
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
        <div className="mx-auto grid max-w-3xl gap-4 sm:grid-cols-3">
          {features.map(({ icon: Icon, label, desc }, index) => (
            <div
              key={label}
              className="landing-reveal landing-feature group flex flex-col items-center gap-3 rounded-xl border border-border/20 p-5 transition-[transform,border-color,background-color] anim-duration-ui anim-ease-ui hover:-translate-y-1 hover:border-border/50 hover:bg-card/50"
              style={{
                animationDelay: `calc(var(--motion-delay-3) + (${index + 1} * var(--motion-delay-step)))`,
              }}
            >
              <div className="relative flex items-center justify-center">
                <div className="absolute size-14 rounded-full border border-border/20" />
                <div className="landing-feature-icon relative flex size-10 items-center justify-center rounded-lg border border-border/40 bg-card/70 shadow-sm backdrop-blur-sm">
                  <Icon className="h-5 w-5 text-muted-foreground" />
                </div>
              </div>
              <span className="text-sm font-medium">{label}</span>
              <span className="text-xs text-muted-foreground">{desc}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Bottom tagline */}
      <div className="landing-tagline absolute bottom-8 text-center text-xs text-muted-foreground/50">
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
    <main>
      <LandingView />
    </main>
  );
}
