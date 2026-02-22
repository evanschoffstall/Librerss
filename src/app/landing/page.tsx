"use client";

import { Button } from "@/components/ui/button";
import { DebugBorder, DebugGrid } from "@/components";
import { ENV } from "@/lib";
import { motion, useReducedMotion } from "framer-motion";
import { ArrowRight, Cloud, Rss, Zap } from "lucide-react";
import Link from "next/link";

const LandingView = () => {
  const reduceMotion = useReducedMotion();

  const reveal = {
    hidden: { opacity: 0, y: reduceMotion ? 0 : 24 },
    show: {
      opacity: 1,
      y: 0,
      transition: { duration: 0.8 },
    },
  };

  const stagger = {
    hidden: {},
    show: { transition: { staggerChildren: reduceMotion ? 0 : 0.12 } },
  };

  return (
    <div className="relative flex min-h-screen flex-col items-center justify-center overflow-hidden">
      {/* Ambient background glow */}
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2">
          <motion.div
            className="h-[800px] w-[800px] rounded-full bg-gradient-radial from-primary/[0.03] to-transparent"
            style={{ willChange: "transform, opacity" }}
            initial={{ opacity: 0.5, scale: 0.96 }}
            animate={
              reduceMotion
                ? { opacity: 0.5 }
                : { opacity: [0.42, 0.6, 0.42], scale: [0.96, 1, 0.96] }
            }
            transition={{ duration: 9, repeat: Infinity, ease: "easeInOut" }}
          />
        </div>
        <div className="absolute left-1/4 top-1/3 -translate-x-1/2 -translate-y-1/2">
          <motion.div
            className="h-[400px] w-[400px] rounded-full bg-gradient-radial from-primary/[0.02] to-transparent blur-3xl"
            style={{ willChange: "transform, opacity" }}
            initial={{ opacity: 0.3, x: 0, y: 0 }}
            animate={
              reduceMotion
                ? { opacity: 0.3 }
                : { opacity: [0.24, 0.42, 0.24], x: [0, 14, 0], y: [0, -10, 0] }
            }
            transition={{ duration: 11, repeat: Infinity, ease: "easeInOut" }}
          />
        </div>
        <motion.div
          className="absolute right-1/4 bottom-1/3 h-[300px] w-[300px] rounded-full bg-gradient-radial from-primary/[0.02] to-transparent blur-3xl"
          style={{ willChange: "transform, opacity" }}
          initial={{ opacity: 0.3, x: 0, y: 0 }}
          animate={
            reduceMotion
              ? { opacity: 0.3 }
              : { opacity: [0.2, 0.36, 0.2], x: [0, -10, 0], y: [0, 12, 0] }
          }
          transition={{ duration: 12, repeat: Infinity, ease: "easeInOut" }}
        />
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
      <motion.div
        className="relative z-10 mx-auto max-w-4xl px-6 text-center"
        variants={stagger}
        initial="hidden"
        animate="show"
      >

        {/* Headline */}
        <motion.h1
          variants={reveal}
          className="mt-10 mb-6 text-5xl font-bold tracking-tight sm:text-7xl lg:text-8xl"
        >
          <span className="block">Your reading,</span>
          <span className="block text-muted-foreground/70">without the noise.</span>
        </motion.h1>

        {/* Subtitle */}
        <motion.p
          variants={reveal}
          className="mx-auto mb-10 max-w-lg text-lg text-muted-foreground sm:text-xl"
        >
          A free, open-source cloud reader for RSS.
          All your sources in one calm, focused inbox.
        </motion.p>

        {/* Single CTA */}
        <motion.div variants={reveal} className="mb-16">
          <motion.div
            whileHover={reduceMotion ? undefined : { y: -2 }}
            whileTap={reduceMotion ? undefined : { scale: 0.985 }}
            transition={{ type: "spring", stiffness: 320, damping: 20 }}
          >
            <Button size="lg" className="h-12 px-8 text-base shadow-sm" asChild>
              <Link href="/dashboard">
              Start Reading
                <motion.span
                  className="ml-2 inline-flex"
                  animate={reduceMotion ? undefined : { x: [0, 4, 0] }}
                  transition={{ duration: 1.8, repeat: Infinity, repeatDelay: 0.8 }}
                >
                  <ArrowRight className="h-4 w-4" />
                </motion.span>
              </Link>
            </Button>
          </motion.div>
        </motion.div>

        {/* Feature pillars */}
        <motion.div
          variants={stagger}
          className="mx-auto grid max-w-2xl gap-6 sm:grid-cols-3"
        >
          {[
            {
              icon: Cloud,
              label: "Cloud Synced",
              desc: "Access your feeds from anywhere",
            },
            {
              icon: Zap,
              label: "Instant & Free",
              desc: "No accounts, no ads, no cost",
            },
            {
              icon: Rss,
              label: "Any RSS Feed",
              desc: "Add any source in seconds",
            },
          ].map(({ icon: Icon, label, desc }, index) => (
            <motion.div
              key={label}
              className="flex flex-col items-center gap-2 rounded-xl border border-transparent p-5 transition-colors hover:border-border/40 hover:bg-card/40"
              variants={reveal}
              whileHover={
                reduceMotion
                  ? undefined
                  : { y: -6, borderColor: "hsl(var(--border) / 0.4)" }
              }
              transition={{ duration: 0.35, delay: index * 0.03 }}
            >
              <motion.div
                className="flex h-10 w-10 items-center justify-center rounded-lg bg-muted/50"
                whileHover={reduceMotion ? undefined : { rotate: [0, -8, 8, 0], scale: 1.04 }}
                transition={{ duration: 0.5 }}
              >
                <Icon className="h-5 w-5 text-muted-foreground" />
              </motion.div>
              <span className="text-sm font-medium">{label}</span>
              <span className="text-xs text-muted-foreground">{desc}</span>
            </motion.div>
          ))}
        </motion.div>
      </motion.div>

      {/* Bottom tagline */}
      <motion.p
        initial={{ opacity: 0, y: reduceMotion ? 0 : 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.8, delay: 0.5 }}
        className="absolute bottom-8 text-xs text-muted-foreground/40"
      >
        Open source &middot; Self-hostable &middot; No tracking
      </motion.p>
    </div>
  );
};

export default function Landing() {
  return (
    <>
      {ENV.isDevelopment && (
        <>
          <DebugBorder />
          <DebugGrid />
        </>
      )}
      <main>
        <LandingView />
      </main>
    </>
  );
}
