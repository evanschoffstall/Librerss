import { ArrowLeft, Clock3 } from "lucide-react";
import Link from "next/link";

import type {
  LegalDocumentPageProps,
  LegalSection,
} from "@/app/app-components/legal";

import { ScrollArea } from "@/components/ui/scroll-area";

export type { LegalDocumentPageProps, LegalSection };

/**
 * Describes the props for the legal document section component.
 */
interface LegalDocumentSectionProps {
  contactCard: LegalDocumentPageProps["contactCard"];
  section: LegalSection;
}

/**
 * Render the legal document page component.
 * @param props - The component props.
 * @returns The rendered legal document page component.
 */
export function LegalDocumentPage(props: LegalDocumentPageProps) {
  const {
    contactCard,
    eyebrow,
    footerLinks,
    intro,
    lastUpdated,
    returnHref,
    returnLabel,
    sections,
    title,
  } = props;
  return (
    <main className="min-h-dvh overflow-hidden bg-background text-foreground">
      <ScrollArea className="h-dvh">
        <div className="relative min-h-dvh">
          <LegalPageBackground />

          <div
            className="
                  relative mx-auto w-full max-w-5xl px-4 pt-4 pb-8
                  sm:px-6 sm:pt-6 sm:pb-10
                "
          >
            <LegalDocumentReturnLink
              returnHref={returnHref}
              returnLabel={returnLabel}
            />
            <LegalDocumentHeader
              eyebrow={eyebrow}
              intro={intro}
              lastUpdated={lastUpdated}
              title={title}
            />
            <LegalDocumentArticle
              contactCard={contactCard}
              footerLinks={footerLinks}
              sections={sections}
            />
          </div>
        </div>
      </ScrollArea>
    </main>
  );
}

/**
 * Render the legal document article component.
 * @param props - The component props.
 * @returns The rendered legal document article component.
 */
function LegalDocumentArticle(
  props: Pick<
    LegalDocumentPageProps,
    "contactCard" | "footerLinks" | "sections"
  >,
) {
  const { contactCard, footerLinks, sections } = props;
  return (
    <article
      className="
        mx-auto max-w-3xl pb-10
        motion-safe:duration-700 motion-safe:animate-in motion-safe:fade-in
        motion-safe:slide-in-from-bottom-2
      "
    >
      {sections.map((section) => (
        <LegalDocumentSection
          contactCard={contactCard}
          key={section.id}
          section={section}
        />
      ))}
      <LegalDocumentFooter footerLinks={footerLinks} />
    </article>
  );
}

/**
 * Render the legal document footer component.
 * @param props - The component props.
 * @returns The rendered legal document footer component.
 */
function LegalDocumentFooter(
  props: Pick<LegalDocumentPageProps, "footerLinks">,
) {
  const { footerLinks } = props;
  return (
    <footer
      className="
        flex flex-wrap items-center gap-4 pt-8 text-sm text-muted-foreground
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
  );
}

/**
 * Render the legal document header component.
 * @param props - The component props.
 * @returns The rendered legal document header component.
 */
function LegalDocumentHeader(
  props: Pick<
    LegalDocumentPageProps,
    "eyebrow" | "intro" | "lastUpdated" | "title"
  >,
) {
  const { eyebrow, intro, lastUpdated, title } = props;
  return (
    <header
      className="
        mx-auto max-w-3xl
        motion-safe:duration-500 motion-safe:animate-in motion-safe:fade-in
        motion-safe:slide-in-from-bottom-2
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
  );
} /**
 * Render the legal document return link component.
 * @param props - The component props.
 * @returns The rendered legal document return link component.
 */
function LegalDocumentReturnLink(
  props: Pick<LegalDocumentPageProps, "returnHref" | "returnLabel">,
) {
  const { returnHref, returnLabel } = props;
  return (
    <div
      className="
        mb-6 flex items-center justify-start
        motion-safe:duration-500 motion-safe:animate-in motion-safe:fade-in
        motion-safe:slide-in-from-bottom-2
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
  );
}

/**
 * Render the legal document section component.
 * @param props - The component props.
 * @returns The rendered legal document section component.
 */
function LegalDocumentSection(props: LegalDocumentSectionProps) {
  const { contactCard, section } = props;
  return (
    <section
      className="
        scroll-mt-8 border-b border-border/60 py-6
        last:border-b-0
        sm:py-7
      "
      id={section.id}
    >
      <div
        className="
          space-y-3
          motion-safe:duration-500 motion-safe:animate-in motion-safe:fade-in
          motion-safe:slide-in-from-bottom-2
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

        {section.id === "contact" ? (
          <div
            className="
              rounded-2xl bg-muted/40 px-4 py-3 text-sm/6 text-muted-foreground
            "
          >
            {contactCard}
          </div>
        ) : null}
      </div>
    </section>
  );
}

/**
 * Render the legal page background component.
 * @returns The rendered legal page background component.
 */
function LegalPageBackground() {
  return (
    <div className="pointer-events-none absolute inset-0">
      <div
        className="
          absolute inset-x-0 top-0 h-48 bg-linear-to-b from-foreground/4
          to-transparent
        "
      />
    </div>
  );
}
