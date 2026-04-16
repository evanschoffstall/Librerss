/** Shared session-storage contract for persisted viewport restoration snapshots. */
export interface SavedScroll {
  ai: number;
  ao: number;
  k?: string;
  t: number;
}

/** Mutable refs shared across viewport restore lifecycle helpers. */
export interface ViewportRestoreRefs {
  applyingRef: WritableRef<boolean>;
  applyRafRef: WritableRef<number>;
  offsetRef: WritableRef<number>;
  pendingRef: WritableRef<null | SavedScroll>;
  restoreUntilRef: WritableRef<number>;
  saveRafRef: WritableRef<number>;
  viewportRef: WritableRef<HTMLElement | null>;
}

/** Lightweight mutable ref contract used by viewport-restore helpers outside React. */
export interface WritableRef<T> {
  current: T;
}

/** Binds passive listeners that persist viewport position after explicit user scrolling. */
export function bindViewportRestoreListeners(
  viewport: HTMLElement,
  sessionKey: string,
  refs: ViewportRestoreRefs,
  stopRestore: () => void,
  buildSavedScroll: (
    viewport: HTMLElement,
    scrollOffset: number,
  ) => null | SavedScroll,
): () => void {
  const handleTouchStart = () => {
    stopRestore();
  };
  const handleWheel = () => {
    stopRestore();
  };
  const handleScroll = () => {
    if (refs.applyingRef.current) {
      return;
    }

    stopRestore();
    cancelAnimationFrame(refs.saveRafRef.current);
    refs.saveRafRef.current = requestAnimationFrame(() => {
      writeSavedScroll(
        sessionKey,
        buildSavedScroll(viewport, refs.offsetRef.current),
      );
    });
  };

  viewport.addEventListener("touchstart", handleTouchStart, { passive: true });
  viewport.addEventListener("wheel", handleWheel, { passive: true });
  viewport.addEventListener("scroll", handleScroll, { passive: true });

  return () => {
    viewport.removeEventListener("touchstart", handleTouchStart);
    viewport.removeEventListener("wheel", handleWheel);
    viewport.removeEventListener("scroll", handleScroll);
    cancelAnimationFrame(refs.saveRafRef.current);
  };
}

/** Clears the persisted viewport restore snapshot for the current session key. */
export function clearSavedScroll(sessionKey: string) {
  const storage = getSessionStorage();
  if (!storage) return;
  try {
    storage.removeItem(sessionKey);
  } catch {
    return undefined;
  }
}

/** Safely resolves sessionStorage when the environment allows it. */
export function getSessionStorage() {
  try {
    return typeof window === "undefined" ? null : window.sessionStorage;
  } catch {
    return null;
  }
}

/** Runtime validator for persisted viewport restore snapshots. */
export function isSavedScroll(value: unknown): value is SavedScroll {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<SavedScroll>;
  return (
    Number.isFinite(candidate.ai) &&
    Number.isFinite(candidate.ao) &&
    Number.isFinite(candidate.t)
  );
}

/** Observes viewport child size and structure changes that can re-open restore opportunities. */
export function observeViewportRestoreTargets(
  viewport: HTMLElement,
  restore: () => void,
): () => void {
  const resizeObserver =
    typeof ResizeObserver === "undefined"
      ? null
      : new ResizeObserver(() => {
          restore();
        });
  const observeChild = () => {
    resizeObserver?.disconnect();
    const child = viewport.firstElementChild;
    if (child) {
      resizeObserver?.observe(child);
    }
  };

  observeChild();
  const mutationObserver =
    typeof MutationObserver === "undefined"
      ? null
      : new MutationObserver(() => {
          observeChild();
          restore();
        });
  mutationObserver?.observe(viewport, { childList: true });

  return () => {
    resizeObserver?.disconnect();
    mutationObserver?.disconnect();
  };
}

/** Reads the saved viewport restore snapshot for the current session key. */
export function readSavedScroll(sessionKey: string): null | SavedScroll {
  const storage = getSessionStorage();
  if (!storage) return null;
  try {
    const serializedScroll = storage.getItem(sessionKey);
    if (!serializedScroll) return null;
    const parsedScroll: unknown = JSON.parse(serializedScroll);
    if (!isSavedScroll(parsedScroll)) return null;
    return parsedScroll;
  } catch {
    return null;
  }
}

/** Writes or clears the saved viewport restore snapshot for the current session key. */
export function writeSavedScroll(
  sessionKey: string,
  saved: null | SavedScroll,
) {
  const storage = getSessionStorage();
  if (!storage) return;
  try {
    if (!saved) {
      storage.removeItem(sessionKey);
      return;
    }
    storage.setItem(sessionKey, JSON.stringify(saved));
  } catch {
    return undefined;
  }
}
