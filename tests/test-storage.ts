export function createIsolatedStorage(
  initialEntries: Record<string, string> = {},
): Storage {
  const storageMap = new Map(Object.entries(initialEntries));

  return {
    clear() {
      storageMap.clear();
    },
    getItem(key: string) {
      return storageMap.get(key) ?? null;
    },
    key(index: number) {
      return [...storageMap.keys()][index] ?? null;
    },
    get length() {
      return storageMap.size;
    },
    removeItem(key: string) {
      storageMap.delete(key);
    },
    setItem(key: string, value: string) {
      storageMap.set(key, value);
    },
  } as Storage;
}
