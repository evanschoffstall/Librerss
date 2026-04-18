import type { ComponentProps } from "react";

import { motion } from "motion/react";

import { ScrollArea } from "@/components/ui/scroll-area";

import { DashboardSidebarContent } from "./DashboardSidebarContent";

const DASHBOARD_SIDEBAR_TRANSITION = {
  duration: 0.28,
  ease: [0.16, 1, 0.3, 1] as const,
};

interface DashboardDesktopSidebarProps {
  isSidebarVisible: boolean;
  sidebarContentProps: ComponentProps<typeof DashboardSidebarContent>;
  sidebarScrollRef: ComponentProps<typeof ScrollArea>["ref"];
}

/**
 * Renders the desktop dashboard sidebar with its reveal transition.
 *
 * This isolates desktop-only sidebar animation and scroll wiring from the main
 * dashboard route view.
 *
 * @param props - Reveal state, scroll ref, and sidebar content props.
 * @param props.isSidebarVisible
 * @param props.sidebarContentProps
 * @param props.sidebarScrollRef
 * @returns The desktop sidebar surface used inside the shared dashboard scaffold.
 */
export function DashboardDesktopSidebar({
  isSidebarVisible,
  sidebarContentProps,
  sidebarScrollRef,
}: DashboardDesktopSidebarProps) {
  return (
    <motion.div
      animate={{
        opacity:
          sidebarContentProps.isCategoriesLoading || isSidebarVisible ? 1 : 0,
        y: sidebarContentProps.isCategoriesLoading || isSidebarVisible ? 0 : 8,
      }}
      className="h-full"
      initial={false}
      transition={DASHBOARD_SIDEBAR_TRANSITION}
    >
      <ScrollArea className="h-full" ref={sidebarScrollRef}>
        <DashboardSidebarContent {...sidebarContentProps} />
      </ScrollArea>
    </motion.div>
  );
}
