import type { LucideIcon } from "lucide-react";
import type { CSSProperties, ReactNode } from "react";

/** Shared grid overlay used by all app status pages. */
const statusPageGridStyle = {
  backgroundImage:
    "linear-gradient(hsl(var(--foreground)) 1px, transparent 1px), linear-gradient(90deg, hsl(var(--foreground)) 1px, transparent 1px)",
  backgroundSize: "64px 64px",
} satisfies CSSProperties;

/** Props for the shared status-page shell. */
interface StatusPageProps {
  action: ReactNode;
  code: string;
  eyebrow: string;
  icon: LucideIcon;
  iconClassName?: string;
  message: string;
}

/**
 * Reusable visual shell for app-wide status pages such as 403, 404, and 500.
 * Keeps the layout, atmospheric background, and content framing aligned while
 * leaving the status-specific copy and action slot configurable.
 * @param root0
 * @param root0.action
 * @param root0.code
 * @param root0.eyebrow
 * @param root0.icon
 * @param root0.iconClassName
 * @param root0.message
 */
export function StatusPage({
  action,
  code,
  eyebrow,
  icon: Icon,
  iconClassName,
  message,
}: StatusPageProps) {
  return (
    <main
      className="
        relative flex min-h-dvh flex-col items-center justify-center
        overflow-hidden bg-background text-foreground
      "
      data-status-page={code}
    >
      <StatusPageBackground />
      <div
        className="pointer-events-none absolute inset-0 opacity-[0.015]"
        style={statusPageGridStyle}
      />
      <StatusPageContent
        action={action}
        code={code}
        eyebrow={eyebrow}
        icon={Icon}
        iconClassName={iconClassName}
        message={message}
      />
    </main>
  );
}

/**
 *
 */
function StatusPageBackground() {
  return (
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
  );
}

/**
 * @param root0
 * @param root0.action
 * @param root0.code
 * @param root0.eyebrow
 * @param root0.icon
 * @param root0.iconClassName
 * @param root0.message
 */
function StatusPageContent({
  action,
  code,
  eyebrow,
  icon: Icon,
  iconClassName,
  message,
}: StatusPageProps) {
  return (
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
        data-status-page-icon={code}
      >
        <Icon className={iconClassName ?? "size-7 text-muted-foreground"} />
      </div>

      <p
        className="
          mb-3 text-xs font-medium tracking-[0.24em] text-muted-foreground
          uppercase
        "
      >
        {eyebrow}
      </p>

      <h1
        className="
          mb-4 text-4xl font-bold tracking-tight
          sm:text-5xl
        "
      >
        {code}
      </h1>

      <p
        className="
          mb-8 max-w-sm text-sm/7 text-muted-foreground
          sm:text-base/7
        "
      >
        {message}
      </p>

      {action}
    </div>
  );
}
