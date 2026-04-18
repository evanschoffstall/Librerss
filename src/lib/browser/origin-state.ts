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
 * Process the clear client origin state.
 * @param options - The options used to process the clear client origin state.
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

/**
 * Process the clear cache storage.
 */
async function clearCacheStorage() {
  if (typeof caches === "undefined") return;

  try {
    const cacheNames = await caches.keys();
    await runCleanupTasks(
      cacheNames.map((cacheName) => ({
        operation: "delete cache",
        /**
         * Deletes one named Cache Storage entry.
         * @returns A promise that resolves once the cache has been deleted.
         */
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

/**
 * Process the clear document cookies.
 */
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

/**
 * Process the clear indexed db.
 */
async function clearIndexedDb() {
  if (typeof indexedDB === "undefined") return;

  const databaseNames = await listIndexedDbNames(indexedDB);
  if (databaseNames.length === 0) return;

  await runCleanupTasks(
    databaseNames.map((databaseName) => ({
      operation: "delete indexeddb database",
      /**
       * Deletes one IndexedDB database by name.
       * @returns A promise that resolves once the database has been removed.
       */
      run: async () => {
        await deleteIndexedDb(databaseName);
      },
      target: databaseName,
    })),
  );
}

/**
 * Process the clear service workers.
 */
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
        /**
         * Unregisters one service worker registration.
         * @returns A promise that resolves once the registration is removed.
         */
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

/**
 * Process the clear web storage.
 * @param storage - The storage.
 */
function clearWebStorage(storage: Storage) {
  try {
    storage.clear();
  } catch (error) {
    warnCleanupFailure({ error, operation: "clear web storage" });
  }
}

/**
 * Process the delete indexed db.
 * @param databaseName - The database name.
 */
function deleteIndexedDb(databaseName: string) {
  return new Promise<void>((resolve, reject) => {
    try {
      const request = indexedDB.deleteDatabase(databaseName);
      /**
       * Rejects the delete promise when IndexedDB reports an error.
       */
      request.onerror = () => {
        reject(request.error ?? new Error("IndexedDB delete failed"));
      };
      /**
       * Rejects the delete promise when another connection blocks deletion.
       */
      request.onblocked = () => {
        reject(new Error("IndexedDB delete blocked"));
      };
      /**
       * Resolves the delete promise once IndexedDB confirms deletion.
       */
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

/**
 * Return the cookie paths.
 * @param pathname - The pathname.
 * @returns The cookie paths.
 */
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

/**
 * Process the list indexed db names.
 * @param indexedDbFactory - The indexed db factory.
 * @returns The list indexed db names.
 */
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

/**
 * Process the read preserved storage entries.
 * @param storage - The storage.
 * @param preserveKeys - The preserve keys.
 * @returns The read preserved storage entries.
 */
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

/**
 * Process the restore storage entries.
 * @param storage - The storage.
 * @param entries - The entries.
 */
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

/**
 * Process the run cleanup tasks.
 * @param tasks - The tasks.
 */
async function runCleanupTasks(tasks: readonly CleanupTask[]) {
  let nextTaskIndex = 0;

  /**
   * Process the worker.
   */
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

/**
 * Process the warn cleanup failure.
 * @param options - The options used to process the warn cleanup failure.
 */
function warnCleanupFailure(options: CleanupWarningContext) {
  const { error, operation, target } = options;
  console.warn("Client origin cleanup failed", {
    error,
    operation,
    target,
  });
}
