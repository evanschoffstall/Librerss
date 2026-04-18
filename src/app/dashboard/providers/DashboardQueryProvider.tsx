"use client";

import {
  QueryClient,
  QueryClientProvider,
  type QueryKey,
} from "@tanstack/react-query";
import { useState } from "react";

interface DashboardQueryProviderProps {
  children: React.ReactNode;
}

/**
 * Provides a dashboard-scoped TanStack Query client for feed and source-tree cache.
 *
 * The dashboard still owns its optimistic article state locally, but query-backed
 * request dedupe and short-lived cache entries reduce repeated fetch churn when
 * users bounce between feeds or refresh the current selection.
 * @param root0
 * @param root0.children
 */
export function DashboardQueryProvider({
  children,
}: DashboardQueryProviderProps) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            gcTime: 30 * 60_000,
            queryKeyHashFn: hashDashboardQueryKey,
            refetchOnReconnect: false,
            refetchOnWindowFocus: false,
            retry: false,
          },
        },
      }),
  );

  return (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
}

/**
 * Hashes dashboard query keys deterministically so large batch-signature strings
 * do not rely on object identity.
 * @param queryKey
 */
function hashDashboardQueryKey(queryKey: QueryKey) {
  return JSON.stringify(queryKey);
}
