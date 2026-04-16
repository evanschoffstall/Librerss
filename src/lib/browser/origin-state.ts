interface ClearClientOriginStateOptions {
  preserveLocalStorageKeys?: readonly string[];
}

const ORIGIN_CLEANUP_CONCURRENCY = 4;

interface CleanupTask {
  operation: string;
  run: () => Promise<void>;
  target?: string;
}

interface CleanupWarningContext {
  error: unknown;
  operation: string;
  target?: string;
}

/**
 * Minimal IndexedDB enumeration contract for browsers that implement
 * `indexedDB.databases()`.
 */
type IndexedDbFactoryWithDatabases = IDBFactory & {
  databases?: () => Promise<readonly IDBDatabaseInfo[]>;
};

/**
 * Clears origin-scoped client persistence.
 *
 * By default the wipe is intentionally dynamic and not tied to application
 * keys: it clears localStorage, sessionStorage, client-visible cookies, Cache
 * Storage, service-worker registrations, and enumerable IndexedDB databases for
 * the active origin. Callers may allowlist a small set of localStorage keys
 * when a full logout-style wipe would be too destructive.
 */
export async function clearClientOriginState(
  options: ClearClientOriginStateOptions = {},
) {
  if (typeof window === "undefined") return;

  const preservedLocalStorageEntries = readPreservedStorageEntries(
    window.localStorage,
    options.preserveLocalStorageKeys ?? [],
  );
  clearWebStorage(window.localStorage);
  restoreStorageEntries(window.localStorage, preservedLocalStorageEntries);
  clearWebStorage(window.sessionStorage);
  clearDocumentCookies();

  await Promise.all([
    clearCacheStorage(),
    clearIndexedDb(),
    clearServiceWorkers(),
  ]);
}

async function clearCacheStorage() {
  if (typeof caches === "undefined") return;

  try {
    const cacheNames = await caches.keys();
    await runCleanupTasks(
      cacheNames.map((cacheName) => ({
        operation: "delete cache",
        run: async () => {
          await caches.delete(cacheName);
        },
        target: cacheName,
      })),
    );
  } catch (error) {
    warnCleanupFailure({ error, operation: "list caches" });
  }
}

function clearDocumentCookies() {
  if (typeof document === "undefined" || document.cookie.trim() === "") {
    return;
  }

  const cookieNames = document.cookie
    .split(";")
    .map((cookiePart) => cookiePart.split("=")[0].trim())
    .filter((cookieName) => cookieName.length > 0);

  const expiry = "Expires=Thu, 01 Jan 1970 00:00:00 GMT; Max-Age=0";

  for (const cookieName of cookieNames) {
    for (const path of getCookiePaths(window.location.pathname)) {
      document.cookie = `${cookieName}=; Path=${path}; ${expiry}; SameSite=Lax`;
    }
  }
}

async function clearIndexedDb() {
  if (typeof indexedDB === "undefined") return;

  const databaseNames = await listIndexedDbNames(indexedDB);
  if (databaseNames.length === 0) return;

  await runCleanupTasks(
    databaseNames.map((databaseName) => ({
      operation: "delete indexeddb database",
      run: async () => {
        await deleteIndexedDb(databaseName);
      },
      target: databaseName,
    })),
  );
}

async function clearServiceWorkers() {
  const serviceWorker = (
    navigator as Navigator & {
      serviceWorker?: ServiceWorkerContainer;
    }
  ).serviceWorker;

  if (
    typeof navigator === "undefined" ||
    typeof serviceWorker === "undefined" ||
    typeof serviceWorker.getRegistrations !== "function"
  ) {
    return;
  }

  try {
    const registrations = await serviceWorker.getRegistrations();
    await runCleanupTasks(
      registrations.map((registration, index) => ({
        operation: "unregister service worker",
        run: async () => {
          await registration.unregister();
        },
        target: String(index),
      })),
    );
  } catch (error) {
    warnCleanupFailure({ error, operation: "list service workers" });
  }
}

function clearWebStorage(storage: Storage) {
  try {
    storage.clear();
  } catch (error) {
    warnCleanupFailure({ error, operation: "clear web storage" });
  }
}

function deleteIndexedDb(databaseName: string) {
  return new Promise<void>((resolve, reject) => {
    try {
      const request = indexedDB.deleteDatabase(databaseName);
      request.onerror = () => {
        reject(request.error ?? new Error("IndexedDB delete failed"));
      };
      request.onblocked = () => {
        reject(new Error("IndexedDB delete blocked"));
      };
      request.onsuccess = () => {
        resolve();
      };
    } catch (error) {
      reject(
        error instanceof Error ? error : new Error("IndexedDB delete failed"),
      );
    }
  });
}

function getCookiePaths(pathname: string) {
  const normalizedPath = pathname.startsWith("/") ? pathname : `/${pathname}`;
  const segments = normalizedPath
    .split("/")
    .filter((segment) => segment.length > 0);
  const paths = new Set<string>(["/"]);

  let currentPath = "";
  for (const segment of segments) {
    currentPath += `/${segment}`;
    paths.add(currentPath);
  }

  return [...paths];
}

async function listIndexedDbNames(indexedDbFactory: IDBFactory) {
  const indexedDbFactoryWithDatabases =
    indexedDbFactory as IndexedDbFactoryWithDatabases;
  if (typeof indexedDbFactoryWithDatabases.databases !== "function") {
    return [] as string[];
  }

  try {
    const databases = await indexedDbFactoryWithDatabases.databases();
    return databases
      .map((database) => database.name)
      .filter(
        (databaseName): databaseName is string =>
          typeof databaseName === "string" && databaseName.length > 0,
      );
  } catch (error) {
    warnCleanupFailure({ error, operation: "list indexeddb databases" });
    return [] as string[];
  }
}

function readPreservedStorageEntries(
  storage: Storage,
  preserveKeys: readonly string[],
) {
  return preserveKeys.flatMap((key) => {
    try {
      const value = storage.getItem(key);
      return value === null ? [] : ([[key, value]] as const);
    } catch {
      return [];
    }
  });
}

function restoreStorageEntries(
  storage: Storage,
  entries: readonly (readonly [string, string])[],
) {
  for (const [key, value] of entries) {
    try {
      storage.setItem(key, value);
    } catch (error) {
      warnCleanupFailure({
        error,
        operation: "restore web storage entry",
        target: key,
      });
    }
  }
}

/** Run cleanup work in a bounded queue so large origins do not fan out unbounded async work. */
async function runCleanupTasks(tasks: readonly CleanupTask[]) {
  let nextTaskIndex = 0;

  async function worker() {
    while (nextTaskIndex < tasks.length) {
      const currentTaskIndex = nextTaskIndex;
      nextTaskIndex += 1;
      const task = tasks[currentTaskIndex];

      try {
        await task.run();
      } catch (error) {
        warnCleanupFailure({
          error,
          operation: task.operation,
          target: task.target,
        });
      }
    }
  }

  await Promise.all(
    Array.from(
      { length: Math.min(ORIGIN_CLEANUP_CONCURRENCY, tasks.length) },
      () => worker(),
    ),
  );
}

function warnCleanupFailure({
  error,
  operation,
  target,
}: CleanupWarningContext) {
  console.warn("Client origin cleanup failed", {
    error,
    operation,
    target,
  });
}
