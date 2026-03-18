import type { ReactNode } from "react";

import { ArrowLeft, Clock3 } from "lucide-react";
import Link from "next/link";

import { ScrollArea } from "@/components/ui/scroll-area";

/**
 * Props for the shared legal document shell used by privacy and terms pages.
 */
export interface LegalDocumentPageProps {
  contactCard: ReactNode;
  eyebrow: string;
  footerLinks: readonly {
    href: string;
    label: string;
  }[];
  intro: string;
  lastUpdated: string;
  returnHref: string;
  returnLabel: string;
  sections: readonly LegalSection[];
  title: string;
}

/**
 * One section of long-form legal copy rendered on the privacy and terms pages.
 */
export interface LegalSection {
  body: string;
  id: string;
  title: string;
}

export function LegalDocumentPage({
  contactCard,
  eyebrow,
  footerLinks,
  intro,
  lastUpdated,
  returnHref,
  returnLabel,
  sections,
  title,
}: LegalDocumentPageProps) {
  return (
    <main className="min-h-dvh overflow-hidden bg-background text-foreground">
      <ScrollArea className="h-dvh">
        <div className="relative min-h-dvh">
          <div className="pointer-events-none absolute inset-0">
            <div
              className="
                absolute inset-x-0 top-0 h-48 bg-linear-to-b from-foreground/4
                to-transparent
              "
            />
          </div>

          <div
            className="
              relative mx-auto w-full max-w-5xl px-4 pt-4 pb-8
              sm:px-6 sm:pt-6 sm:pb-10
            "
          >
            <div
              className="
                mb-6 flex items-center justify-start
                motion-safe:duration-500 motion-safe:animate-in
                motion-safe:fade-in motion-safe:slide-in-from-bottom-2
                sm:mb-8
              "
            >
              <Link
                className="
                  inline-flex items-center gap-2 text-sm text-muted-foreground
                  transition-colors
                  hover:text-foreground
                "
                href={returnHref}
              >
                <ArrowLeft className="size-4" />
                {returnLabel}
              </Link>
            </div>

            <header
              className="
                mx-auto max-w-3xl
                motion-safe:duration-500 motion-safe:animate-in
                motion-safe:fade-in motion-safe:slide-in-from-bottom-2
              "
            >
              <div
                className="
                  space-y-4 border-b border-border/60 pb-6
                  sm:pb-7
                "
              >
                <p
                  className="
                    text-xs font-medium tracking-[0.24em] text-muted-foreground
                    uppercase
                  "
                >
                  {eyebrow}
                </p>
                <h1
                  className="
                    max-w-2xl text-3xl font-semibold tracking-tight text-balance
                    sm:text-4xl
                  "
                >
                  {title}
                </h1>
                <p
                  className="
                    max-w-2xl text-sm/7 text-muted-foreground
                    sm:text-base/7
                  "
                >
                  {intro}
                </p>
                <div
                  className="
                    inline-flex items-center gap-2 text-xs text-muted-foreground
                  "
                >
                  <Clock3 className="size-3.5 shrink-0" />
                  Last updated: {lastUpdated}
                </div>
              </div>
            </header>

            <article
              className="
                mx-auto max-w-3xl pb-10
                motion-safe:duration-700 motion-safe:animate-in
                motion-safe:fade-in motion-safe:slide-in-from-bottom-2
              "
            >
              {sections.map((section) => (
                <section
                  className="
                    scroll-mt-8 border-b border-border/60 py-6
                    last:border-b-0
                    sm:py-7
                  "
                  id={section.id}
                  key={section.id}
                >
                  <div
                    className="
                      space-y-3
                      motion-safe:duration-500 motion-safe:animate-in
                      motion-safe:fade-in motion-safe:slide-in-from-bottom-2
                    "
                  >
                    <h2
                      className="
                        text-xl font-semibold tracking-tight
                        sm:text-2xl
                      "
                    >
                      {section.title}
                    </h2>
                    <p
                      className="
                        max-w-2xl text-sm/7 text-muted-foreground
                        sm:text-base/7
                      "
                    >
                      {section.body}
                    </p>

                    {section.id === "contact" && (
                      <div
                        className="
                          rounded-2xl bg-muted/40 px-4 py-3 text-sm/6
                          text-muted-foreground
                        "
                      >
                        {contactCard}
                      </div>
                    )}
                  </div>
                </section>
              ))}

              <footer
                className="
                  flex flex-wrap items-center gap-4 pt-8 text-sm
                  text-muted-foreground
                "
              >
                {footerLinks.map((link) => (
                  <Link
                    className="
                      transition-colors
                      hover:text-foreground
                    "
                    href={link.href}
                    key={link.href}
                  >
                    {link.label}
                  </Link>
                ))}
              </footer>
            </article>
          </div>
        </div>
      </ScrollArea>
    </main>
  );
}
