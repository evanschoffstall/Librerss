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

/**
 * Process the bind viewport restore listeners.
 * @param viewport - The viewport.
 * @param sessionKey - The session key.
 * @param refs - The refs.
 * @param stopRestore - The callback that stop restore.
 * @param buildSavedScroll - The callback that saved scroll.
 * @returns The bind viewport restore listeners.
 */
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
  /**
   * Process the handle touch start.
   */
  const handleTouchStart = () => {
    stopRestore();
  };
  /**
   * Process the handle wheel.
   */
  const handleWheel = () => {
    stopRestore();
  };
  /**
   * Process the handle scroll.
   */
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

/**
 * Process the clear saved scroll.
 * @param sessionKey - The session key.
 * @returns Nothing.
 */
export function clearSavedScroll(sessionKey: string) {
  const storage = getSessionStorage();
  if (!storage) return;
  try {
    storage.removeItem(sessionKey);
  } catch {
    return undefined;
  }
}

/**
 * Return the session storage.
 * @returns The session storage.
 */
export function getSessionStorage() {
  try {
    return typeof window === "undefined" ? null : window.sessionStorage;
  } catch {
    return null;
  }
}

/**
 * Return whether is saved scroll.
 * @param value - The value.
 * @returns Whether is saved scroll.
 */
export function isSavedScroll(value: unknown): value is SavedScroll {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<SavedScroll>;
  return (
    Number.isFinite(candidate.ai) &&
    Number.isFinite(candidate.ao) &&
    Number.isFinite(candidate.t)
  );
}

/**
 * Process the observe viewport restore targets.
 * @param viewport - The viewport.
 * @param restore - The callback that restore.
 * @returns The observe viewport restore targets.
 */
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
  /**
   * Process the observe child.
   */
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

/**
 * Process the read saved scroll.
 * @param sessionKey - The session key.
 * @returns The read saved scroll.
 */
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

/**
 * Process the write saved scroll.
 * @param sessionKey - The session key.
 * @param saved - The saved.
 * @returns Nothing.
 */
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
