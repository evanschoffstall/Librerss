"use client";

import { Loader2 } from "lucide-react";
import { Suspense } from "react";
import { DashboardRouter } from "./DashboardRouter";

export default function Dashboard() {
  return (
    <div className="h-dvh overflow-hidden overscroll-contain">
      <Suspense
        fallback={
          <div className="flex h-full items-center justify-center overflow-hidden">
            <Loader2 className="size-4 animate-spin text-muted-foreground/40" />
          </div>
        }
      >
        <DashboardRouter />
      </Suspense>
    </div>
  );
}
