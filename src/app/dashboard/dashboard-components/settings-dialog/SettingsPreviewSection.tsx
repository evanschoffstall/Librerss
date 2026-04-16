import type { ReactNode } from "react";

const DEMO_OVERLAY_LABEL = "Not available in demo mode";

interface SettingsPreviewSectionProps {
  children: ReactNode;
  isPreviewMode?: boolean;
}

/** Applies the demo-mode overlay to settings sections that are read-only in preview mode. */
export function SettingsPreviewSection({
  children,
  isPreviewMode = false,
}: SettingsPreviewSectionProps) {
  return (
    <div className="relative">
      {isPreviewMode && <DemoOverlay />}
      {children}
    </div>
  );
}

function DemoOverlay() {
  return (
    <div
      className="
        pointer-events-none absolute inset-0 z-10 flex items-center
        justify-center rounded-lg bg-background/60 backdrop-blur-[2px]
      "
    >
      <span
        className="
          rounded-md border bg-card px-2.5 py-1 text-[11px]
          text-muted-foreground shadow-sm
        "
      >
        {DEMO_OVERLAY_LABEL}
      </span>
    </div>
  );
}
