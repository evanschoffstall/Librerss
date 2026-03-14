/**
 * Minimal IndexedDB extension for browsers that expose database enumeration.
 */
interface IndexedDbFactoryWithDatabases extends IDBFactory {
  databases?: () => Promise<{ name?: string }[]>;
}

/**
 * Clears origin-scoped client persistence after logout.
 *
 * The reset is intentionally dynamic and not tied to application keys: it wipes
 * localStorage, sessionStorage, Cache Storage, and enumerable IndexedDB
 * databases for the active origin.
 */
export async function clearClientOriginState() {
  if (typeof window === "undefined") return;

  clearWebStorage(window.localStorage);
  clearWebStorage(window.sessionStorage);

  await Promise.allSettled([clearCacheStorage(), clearIndexedDb()]);
}

/** Removes every Cache Storage entry for the active origin. */
async function clearCacheStorage() {
  if (typeof caches === "undefined") return;

  const cacheNames = await caches.keys();
  await Promise.allSettled(
    cacheNames.map(async (cacheName) => caches.delete(cacheName)),
  );
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
