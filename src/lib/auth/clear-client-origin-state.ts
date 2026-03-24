/**
 * Minimal IndexedDB enumeration contract for browsers that implement
 * `indexedDB.databases()`.
 */
type IndexedDbFactoryWithDatabases = IDBFactory & {
  databases?: () => Promise<readonly IDBDatabaseInfo[]>;
};

/**
 * Clears origin-scoped client persistence after logout.
 *
 * The reset is intentionally dynamic and not tied to application keys: it wipes
 * localStorage, sessionStorage, client-visible cookies, Cache Storage,
 * service-worker registrations, and enumerable IndexedDB databases for the
 * active origin.
 */
export async function clearClientOriginState() {
  if (typeof window === "undefined") return;

  clearWebStorage(window.localStorage);
  clearWebStorage(window.sessionStorage);
  clearDocumentCookies();

  await Promise.allSettled([
    clearCacheStorage(),
    clearIndexedDb(),
    clearServiceWorkers(),
  ]);
}

/** Removes every Cache Storage entry for the active origin. */
async function clearCacheStorage() {
  if (typeof caches === "undefined") return;

  const cacheNames = await caches.keys();
  await Promise.allSettled(
    cacheNames.map(async (cacheName) => caches.delete(cacheName)),
  );
}

/** Best-effort removal of all client-visible cookies for the current origin. */
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

/** Deletes every enumerable IndexedDB database for the active origin. */
async function clearIndexedDb() {
  if (typeof indexedDB === "undefined") return;

  const databaseNames = await listIndexedDbNames(indexedDB);
  if (databaseNames.length === 0) return;

  await Promise.allSettled(
    databaseNames.map(async (databaseName) => deleteIndexedDb(databaseName)),
  );
}

/** Unregisters service workers so client caches and fetch handlers are dropped. */
async function clearServiceWorkers() {
  if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) {
    return;
  }

  try {
    const registrations = await navigator.serviceWorker.getRegistrations();
    await Promise.allSettled(
      registrations.map(async (registration) => registration.unregister()),
    );
  } catch {
    return undefined;
  }
}

/** Best-effort storage clear that tolerates restricted browser environments. */
function clearWebStorage(storage: Storage) {
  try {
    storage.clear();
  } catch {
    return undefined;
  }
}

/** Wraps IndexedDB deletion so logout cleanup never rejects. */
function deleteIndexedDb(databaseName: string) {
  return new Promise<void>((resolve) => {
    try {
      const request = indexedDB.deleteDatabase(databaseName);
      request.onerror = () => {
        resolve();
      };
      request.onblocked = () => {
        resolve();
      };
      request.onsuccess = () => {
        resolve();
      };
    } catch {
      resolve();
    }
  });
}

/** Returns the path variants needed to best-effort clear current-origin cookies. */
function getCookiePaths(pathname: string) {
  const normalizedPath = pathname.startsWith("/") ? pathname : `/${pathname}`;
  const segments = normalizedPath.split("/").filter((segment) => segment.length > 0);
  const paths = new Set<string>(["/"]);

  let currentPath = "";
  for (const segment of segments) {
    currentPath += `/${segment}`;
    paths.add(currentPath);
  }

  return [...paths];
}

/** Lists IndexedDB names when the browser supports enumeration. */
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
  } catch {
    return [] as string[];
  }
}
