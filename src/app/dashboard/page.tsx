"use client";

import { Skeleton } from "@/components/ui/skeleton";
import { Suspense } from "react";
import { DashboardRouter } from "./DashboardRouter";

export default function Dashboard() {
  return (
    <div className="h-dvh overflow-hidden overscroll-contain">
      <Suspense
        fallback={
          <div className="flex h-full items-center justify-center overflow-hidden px-4">
            <div className="w-full max-w-3xl space-y-2">
              <Skeleton className="h-8 w-full rounded-xl" />
              <Skeleton className="h-24 w-full rounded-xl" />
              <Skeleton className="h-24 w-full rounded-xl" />
              <Skeleton className="h-24 w-full rounded-xl" />
            </div>
          </div>
        }
      >
        <DashboardRouter />
      </Suspense>
    </div>
  );
}
