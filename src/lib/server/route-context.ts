/**
 * Minimal Next.js route-handler context shape for static and dynamic API
 * routes.
 */
export interface RouteHandlerContext {
  params: Promise<Record<string, string | string[] | undefined>>;
}

/**
 * Return whether is route handler context.
 * @param value - The value.
 * @returns Whether is route handler context.
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
 * Resolve the route handler deps.
 * @param depsOrContext - The deps or context.
 * @returns The route handler deps.
 */
export function resolveRouteHandlerDeps<T extends object>(
  depsOrContext: RouteHandlerContext | T | undefined,
): T {
  if (depsOrContext === undefined || isRouteHandlerContext(depsOrContext)) {
    return {} as T;
  }

  return depsOrContext;
}
