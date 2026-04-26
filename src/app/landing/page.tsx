"use client";

import { ArrowRight, Cloud, Rss, Zap } from "lucide-react";
import { motion } from "motion/react";
import Link from "next/link";

import { ThemeNoticeDialog } from "@/components";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";

const features = [
  {
    desc: "Access your feeds from anywhere",
    icon: Cloud,
    label: "Cloud Synced",
  },
  {
    desc: "No subscriptions, no ads",
    icon: Zap,
    label: "Instant & Free",
  },
  {
    desc: "Add any source in seconds",
    icon: Rss,
    label: "Any RSS Feed",
  },
] as const;

const LANDING_REVEAL_TRANSITION = {
  duration: 0.42,
  ease: [0.16, 1, 0.3, 1] as const,
};

const LANDING_GLOW_TRANSITION = {
  duration: 8,
  ease: "easeInOut" as const,
  repeat: Number.POSITIVE_INFINITY,
  repeatType: "mirror" as const,
};

/**
 * Return the landing reveal transition.
 * @param delay - The delay.
 * @returns The landing reveal transition.
 */
function getLandingRevealTransition(delay: number) {
  return {
    ...LANDING_REVEAL_TRANSITION,
    delay,
  };
}

/**
 * Render the landing view component.
 * @returns The rendered landing view component.
 */
const LandingView = () => {
  return (
    <div className="relative box-border flex flex-1 flex-col overflow-hidden">
      <ThemeNoticeDialog />

      <LandingBackground />

      <div
        className="
          relative z-10 mx-auto flex min-h-full w-full max-w-4xl flex-1 flex-col
          px-4
          sm:px-6
        "
      >
        <LandingHero />
        <LandingFeatureGrid />
      </div>
    </div>
  );
};

/**
 * Describes the props for the landing feature card component.
 */
interface LandingFeatureCardProps {
  delay: number;
  desc: string;
  icon: (typeof features)[number]["icon"];
  label: string;
}

/**
 * Render the landing component.
 * @returns The rendered landing component.
 */
export default function Landing() {
  return (
    <main className="min-h-dvh overflow-hidden">
      <ScrollArea className="h-dvh">
        <div className="flex min-h-dvh flex-col">
          <header
            className="
              relative z-10 mx-auto w-full max-w-5xl px-4 py-3
              sm:px-6 sm:pt-6 sm:pb-8
            "
          >
            <div className="flex items-start justify-center">
              <div
                className="
                  inline-flex max-w-full items-center gap-2 rounded-full border
                  border-border/50 bg-card/50 px-3.5 py-1.5 text-[0.68rem]/4
                  font-medium tracking-[0.03em] text-muted-foreground
                  backdrop-blur-sm
                  sm:text-xs
                "
              >
                <Rss className="size-3 shrink-0" />
                <span className="truncate">
                  Open-source · Self-hostable · Feed-first
                </span>
              </div>
            </div>
          </header>

          <LandingView />

          <footer
            className="
              relative z-10 mx-auto mt-4 flex w-full max-w-5xl flex-row
              flex-nowrap items-center justify-center gap-2 px-4 pt-2 pb-4
              text-center text-[0.72rem]/5 text-muted-foreground
              sm:mt-10 sm:px-6 sm:pt-6 sm:pb-8 sm:text-xs/4
            "
          >
            <Link
              className="
                whitespace-nowrap transition-colors
                hover:text-foreground
              "
              href="/privacy"
            >
              Privacy Policy
            </Link>

            <span aria-hidden="true" className="text-muted-foreground/40">
              •
            </span>

            <p
              className="
              text-center whitespace-nowrap text-muted-foreground/50
            "
            >
              Made with ❤️ by Evan Schoffstall
            </p>

            <span aria-hidden="true" className="text-muted-foreground/40">
              •
            </span>

            <Link
              className="
                whitespace-nowrap transition-colors
                hover:text-foreground
              "
              href="/terms"
            >
              Terms
            </Link>
          </footer>
        </div>
      </ScrollArea>
    </main>
  );
}
/**
 * Render the landing background component.
 * @returns The rendered landing background component.
 */
function LandingBackground() {
  return (
    <>
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute top-1/2 left-1/2 -translate-1/2">
          <motion.div
            animate={{ opacity: [0.42, 0.6, 0.42], scale: [0.96, 1, 0.96] }}
            className="
              bg-gradient-radial size-[800px] rounded-full from-primary/3
              to-transparent
            "
            transition={LANDING_GLOW_TRANSITION}
          />
        </div>
        <div className="absolute top-1/3 left-1/4 -translate-1/2">
          <motion.div
            animate={{
              opacity: [0.24, 0.42, 0.24],
              x: [0, 14, 0],
              y: [0, -10, 0],
            }}
            className="
              bg-gradient-radial size-[400px] rounded-full from-primary/2
              to-transparent blur-3xl
            "
            transition={{ ...LANDING_GLOW_TRANSITION, duration: 10 }}
          />
        </div>
        <motion.div
          animate={{ opacity: [0.2, 0.36, 0.2], x: [0, -10, 0], y: [0, 12, 0] }}
          className="
            bg-gradient-radial absolute right-1/4 bottom-1/3 size-[300px]
            rounded-full from-primary/2 to-transparent blur-3xl
          "
          transition={{ ...LANDING_GLOW_TRANSITION, duration: 9 }}
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
    </>
  );
}

/**
 * Render the landing feature card component.
 * @param props - The component props.
 * @returns The rendered landing feature card component.
 */
function LandingFeatureCard(props: LandingFeatureCardProps) {
  const { delay, desc, icon: Icon, label } = props;
  return (
    <motion.div
      animate="visible"
      className="
        flex min-h-[6.9rem] flex-col items-center justify-center gap-2.5
        rounded-[1.4rem] border border-border/20 bg-card/[0.035] p-4 text-center
        hover:-translate-y-1 hover:border-border/50 hover:bg-card/50
        sm:min-h-0 sm:gap-3 sm:p-5
      "
      initial="hidden"
      transition={getLandingRevealTransition(delay)}
      variants={{
        hidden: { opacity: 0, y: 24 },
        hover: { y: -4 },
        visible: { opacity: 1, y: 0 },
      }}
      whileHover="hover"
    >
      <div className="relative flex shrink-0 items-center justify-center">
        <div
          className="
            absolute size-14 rounded-full border border-border/20
            max-sm:hidden
          "
        />
        <motion.div
          className="
            relative flex size-10 items-center justify-center rounded-lg border
            border-border/40 bg-card/70 shadow-sm backdrop-blur-sm
          "
          transition={{ duration: 0.42, ease: "easeInOut" }}
          variants={{
            hidden: { opacity: 0, scale: 0.94 },
            hover: { rotate: [0, -8, 8, 0], scale: [1, 1.04, 1.04, 1] },
            visible: { opacity: 1, scale: 1 },
          }}
        >
          <Icon className="size-5 text-muted-foreground" />
        </motion.div>
      </div>
      <div className="flex max-w-56 flex-col items-center gap-0.5 text-center">
        <span
          className="
            text-[0.95rem] font-semibold tracking-[-0.02em]
            sm:text-sm
          "
        >
          {label}
        </span>
        <span
          className="
            text-[0.84rem]/[1.45] text-muted-foreground/85
            sm:text-xs/5
          "
        >
          {desc}
        </span>
      </div>
    </motion.div>
  );
}

/**
 * Render the landing feature grid component.
 * @returns The rendered landing feature grid component.
 */
function LandingFeatureGrid() {
  return (
    <div
      className="
        mx-auto grid w-full max-w-sm gap-2.5 pb-4
        sm:max-w-3xl sm:grid-cols-3 sm:gap-4 sm:pb-10
      "
    >
      {features.map(({ desc, icon: Icon, label }, index) => (
        <LandingFeatureCard
          delay={0.24 + (index + 1) * 0.06}
          desc={desc}
          icon={Icon}
          key={label}
          label={label}
        />
      ))}
    </div>
  );
}

/**
 * Render the landing hero component.
 * @returns The rendered landing hero component.
 */
function LandingHero() {
  return (
    <div
      className="
        flex flex-1 flex-col items-center justify-center pt-5 pb-6 text-center
        sm:py-14
      "
    >
      <motion.h1
        animate={{ opacity: 1, y: 0 }}
        className="
          mb-5 max-w-[9.5ch] text-[clamp(2.6rem,13vw,4.25rem)] leading-[0.9]
          font-bold tracking-[-0.05em]
          sm:mb-7 sm:max-w-none sm:text-6xl sm:leading-[1.02]
          lg:text-8xl
        "
        initial={{ opacity: 0, y: 24 }}
        transition={getLandingRevealTransition(0.08)}
      >
        <span className="block">Your reading,</span>
        <span
          className="
            block bg-linear-to-br from-foreground/60 via-muted-foreground/60
            to-muted-foreground/40 bg-clip-text text-transparent
          "
        >
          without the noise.
        </span>
      </motion.h1>

      <motion.p
        animate={{ opacity: 1, y: 0 }}
        className="
          mx-auto mb-6 max-w-74 text-[0.95rem]/[1.7] text-muted-foreground/95
          sm:mb-12 sm:max-w-lg sm:text-xl/8
        "
        initial={{ opacity: 0, y: 24 }}
        transition={getLandingRevealTransition(0.16)}
      >
        A free, open-source feed hub for RSS. All your sources in one calm,
        focused inbox.
      </motion.p>
      <LandingHeroCallToAction />
    </div>
  );
}

/**
 * Render the landing hero call to action component.
 * @returns The rendered landing hero call to action component.
 */
function LandingHeroCallToAction() {
  return (
    <motion.div
      animate={{ opacity: 1, y: 0 }}
      className="
        w-full max-w-70
        sm:w-auto sm:max-w-none
      "
      initial={{ opacity: 0, y: 24 }}
      transition={getLandingRevealTransition(0.24)}
    >
      <motion.div whileHover={{ y: -2 }}>
        <Button
          asChild
          className="
            h-12 w-full rounded-xl px-5 text-[1rem] shadow-sm
            sm:h-12 sm:w-auto sm:px-8 sm:text-base
          "
          size="lg"
        >
          <Link
            className="group inline-flex items-center justify-center"
            href="/dashboard"
          >
            Open Dashboard
            <motion.span
              animate={{ x: [0, 4, 0] }}
              className="ml-2 inline-flex"
              transition={{
                duration: 1.4,
                ease: "easeInOut",
                repeat: Number.POSITIVE_INFINITY,
              }}
              whileHover={{ x: 6 }}
            >
              <ArrowRight className="size-4" />
            </motion.span>
          </Link>
        </Button>
      </motion.div>
    </motion.div>
  );
}
