import type { ComponentProps } from "react";

import { DashboardSidebarContent } from "./DashboardSidebarContent";

import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";

export interface DashboardMobileSidebarSheetProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  sidebarContentProps: ComponentProps<typeof DashboardSidebarContent>;
}

/**
 * Renders the mobile feeds sidebar inside the dashboard sheet shell.
 *
 * Keeping the mobile sheet structure in its own component prevents the main
 * dashboard view from mixing route orchestration with sidebar chrome details.
 *
 * @param props Mobile sheet open state and sidebar content props.
 * @returns The mobile sidebar sheet used on narrow viewports.
 */
export function DashboardMobileSidebarSheet({
  isOpen,
  onOpenChange,
  sidebarContentProps,
}: DashboardMobileSidebarSheetProps) {
  return (
    <Sheet onOpenChange={onOpenChange} open={isOpen}>
      <SheetContent
        className="
          w-[min(22rem,88vw)] gap-0 p-0
          lg:hidden
        "
        side="left"
      >
        <SheetHeader className="space-y-0 px-4 pt-5 pb-2 text-left">
          <SheetTitle className="
            text-sm font-semibold tracking-tight text-foreground/90
          ">
            Feeds
          </SheetTitle>
        </SheetHeader>
        <div className="min-h-0 flex-1 overflow-hidden px-4 pb-4">
          <div className="h-full rounded-xl bg-card/35 p-2">
            <ScrollArea className="h-full">
              <DashboardSidebarContent {...sidebarContentProps} />
            </ScrollArea>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
