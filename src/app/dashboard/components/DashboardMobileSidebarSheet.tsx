import type { ComponentProps } from "react";

import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { useLocalStorage } from "@/lib/hooks/useLocalStorage";

import { MOBILE_TOOLBAR_MIRROR_STORAGE_KEY } from "../constants";
import { DashboardSidebarContent } from "./DashboardSidebarContent";

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
  const [mobileToolbarMirror] = useLocalStorage(
    MOBILE_TOOLBAR_MIRROR_STORAGE_KEY,
    true,
  );

  return (
    <Sheet onOpenChange={onOpenChange} open={isOpen}>
      <SheetContent
        className="
          flex h-full w-[min(22rem,88vw)] flex-col gap-0 overflow-hidden p-0
          lg:hidden
        "
        side={mobileToolbarMirror ? "right" : "left"}
      >
        <SheetHeader className="space-y-0 px-4 pt-5 pb-2 text-left">
          <SheetTitle className="
            text-sm font-semibold tracking-tight text-foreground/90
          ">
            Feeds
          </SheetTitle>
        </SheetHeader>
        <div className="min-h-0 flex-1 overflow-hidden px-4 pb-4">
          <div className="
            flex h-full min-h-0 flex-col rounded-xl bg-card/35 p-2
          ">
            <ScrollArea
              className="
                min-h-0 flex-1 overscroll-contain
                [&_[data-radix-scroll-area-viewport]>div]:block!
                [&_[data-radix-scroll-area-viewport]>div]:w-full!
                [&_[data-radix-scroll-area-viewport]>div]:min-w-0!
              "
            >
              <DashboardSidebarContent {...sidebarContentProps} />
            </ScrollArea>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
