import type { ComponentProps } from "react";

import { MOBILE_UI_GROUPED_LAYOUT_STORAGE_KEY } from "@/app/dashboard/services/dashboard-constants";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { useLocalStorage } from "@/lib/hooks";

import { DashboardSidebarContent } from "./DashboardSidebarContent";

/**
 * Describes the props for the dashboard mobile sidebar sheet component.
 */
interface DashboardMobileSidebarSheetProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  sidebarContentProps: ComponentProps<typeof DashboardSidebarContent>;
}

/**
 * Render the dashboard mobile sidebar sheet component.
 * @param props - The component props.
 * @returns The rendered dashboard mobile sidebar sheet component.
 */
export function DashboardMobileSidebarSheet(
  props: DashboardMobileSidebarSheetProps,
) {
  const { isOpen, onOpenChange, sidebarContentProps } = props;
  const [mobileGroupedLayout] = useLocalStorage(
    MOBILE_UI_GROUPED_LAYOUT_STORAGE_KEY,
    true,
  );

  return (
    <Sheet onOpenChange={onOpenChange} open={isOpen}>
      <SheetContent
        className="
          flex h-full w-[min(22rem,88vw)] flex-col gap-0 overflow-hidden p-0
          lg:hidden
        "
        side={mobileGroupedLayout ? "right" : "left"}
      >
        <SheetHeader className="space-y-0 px-4 pt-5 pb-2 text-left">
          <SheetTitle
            className="
            text-sm font-semibold tracking-tight text-foreground/90
          "
          >
            Feeds
          </SheetTitle>
        </SheetHeader>
        <div className="min-h-0 flex-1 overflow-hidden px-4 pb-4">
          <div
            className="
            flex h-full min-h-0 flex-col rounded-xl bg-card/35 p-2
          "
          >
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
