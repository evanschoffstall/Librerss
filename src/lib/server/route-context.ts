/**
 * Minimal Next.js route-handler context shape for static and dynamic API
 * routes.
 */
export interface RouteHandlerContext {
  params: Promise<Record<string, string | string[] | undefined>>;
}

/**
 * Returns whether the provided route argument is the framework context object
 * rather than a test dependency bag.
 */
export function isRouteHandlerContext(
  value: unknown,
): value is RouteHandlerContext {
  if (typeof value !== "object" || value === null || !("params" in value)) {
    return false;
  }

  const { params } = value as { params?: unknown };
  return typeof params === "object" && params !== null && "then" in params;
}

/**
 * Preserves route dependency injection for tests while treating the framework
 * context object as an empty dependency bag at runtime.
 */
export function resolveRouteHandlerDeps<T extends object>(
  depsOrContext: RouteHandlerContext | T | undefined,
): T {
  if (depsOrContext === undefined || isRouteHandlerContext(depsOrContext)) {
    return {} as T;
  }

  return depsOrContext;
}
