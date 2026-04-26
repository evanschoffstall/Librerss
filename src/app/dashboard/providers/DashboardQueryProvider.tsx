"use client";

import {
  QueryClient,
  QueryClientProvider,
  type QueryKey,
} from "@tanstack/react-query";
import { useState } from "react";

/**
 * Describes the props for the dashboard query provider component.
 */
interface DashboardQueryProviderProps {
  children: React.ReactNode;
}

/**
 * Render the dashboard query provider component.
 * @param props - The component props.
 * @returns The rendered dashboard query provider component.
 */
export function DashboardQueryProvider(props: DashboardQueryProviderProps) {
  const { children } = props;
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
 * Process the hash dashboard query key.
 * @param queryKey - The query key.
 * @returns The hash dashboard query key.
 */
function hashDashboardQueryKey(queryKey: QueryKey) {
  return JSON.stringify(queryKey);
}
