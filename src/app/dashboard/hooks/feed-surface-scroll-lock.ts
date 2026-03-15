import { escapeArticleKey } from "./useArticleHydration";

const LOCK_RELEASE_BUFFER_MS = 80;
const LOCK_RELEASE_FALLBACK_MS = 320;
const PRE_EXPAND_SCROLL_SESSION_KEY = "librerss:article-pre-expand-scroll";

interface PersistedPreExpandScroll {
  articleKey: string;
  scrollTop: number;
}

/**
 * Clears any persisted pre-expand scroll snapshot from session storage.
 */
export function clearPersistedPreExpandScroll() {
  const storage = getSessionStorage();
  if (!storage) return;
  try {
    storage.removeItem(PRE_EXPAND_SCROLL_SESSION_KEY);
  } catch {
    return undefined;
  }
}

/**
 * Resolves the current feed viewport that contains the given article key.
 *
 * @param articleKey Dashboard article key rendered into the feed surface DOM.
 * @returns The closest Radix viewport for the article when available.
 */
export function findArticleViewport(articleKey: string) {
  try {
    const article = document.querySelector<HTMLElement>(
      `[data-article-key="${escapeArticleKey(articleKey)}"]`,
    );

    return (
      article?.closest<HTMLElement>("[data-radix-scroll-area-viewport]") ?? null
    );
  } catch {
    return null;
  }
}

/**
 * Computes the scroll-lock release duration from the dashboard motion variable.
 */
export function getScrollLockReleaseMs() {
  if (typeof window === "undefined" || typeof getComputedStyle !== "function") {
    return LOCK_RELEASE_FALLBACK_MS;
  }

  const duration =
    parseCssDurationMs(
      document.body.style.getPropertyValue("--motion-duration-expand"),
    ) ??
    parseCssDurationMs(
      getComputedStyle(document.body).getPropertyValue(
        "--motion-duration-expand",
      ),
    ) ??
    parseCssDurationMs(
      getComputedStyle(document.documentElement).getPropertyValue(
        "--motion-duration-expand",
      ),
    );
  return duration === null
    ? LOCK_RELEASE_FALLBACK_MS
    : duration + LOCK_RELEASE_BUFFER_MS;
}

/**
 * Reads a persisted pre-expand scroll snapshot when it matches the target article.
 *
 * @param articleKey Dashboard article key used to validate the stored snapshot.
 * @returns The persisted snapshot for that article, or null when none matches.
 */
export function readPersistedPreExpandScroll(articleKey: string) {
  const storage = getSessionStorage();
  if (!storage) return null;
  try {
    const raw = storage.getItem(PRE_EXPAND_SCROLL_SESSION_KEY);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    if (!isPersistedPreExpandScroll(parsed)) return null;
    return parsed.articleKey === articleKey ? parsed : null;
  } catch {
    return null;
  }
}

/**
 * Aligns an expanded article into its viewport without overscrolling above the sentinel offset.
 *
 * @param article Expanded article element.
 * @param viewport Scroll viewport containing the article.
 * @param restingScrollOffset Minimum allowed scroll position that keeps the pull sentinel hidden.
 */
export function scrollExpandedArticleIntoView(
  article: HTMLElement,
  viewport: HTMLElement,
  restingScrollOffset: number,
) {
  const articleTop = article.getBoundingClientRect().top;
  const viewportRect = viewport.getBoundingClientRect();
  if (articleTop >= viewportRect.top && articleTop <= viewportRect.bottom) {
    return;
  }

  viewport.scrollTop = clampViewportScrollTop(
    viewport,
    viewport.scrollTop + articleTop - viewportRect.top,
    restingScrollOffset,
  );
}

/**
 * Persists the current pre-expand scroll snapshot for later collapse restoration.
 *
 * @param saved Scroll snapshot captured immediately before expansion.
 */
export function writePersistedPreExpandScroll(saved: {
  articleKey: string;
  scrollTop: number;
}) {
  const storage = getSessionStorage();
  if (!storage) return;
  try {
    storage.setItem(PRE_EXPAND_SCROLL_SESSION_KEY, JSON.stringify(saved));
  } catch {
    return undefined;
  }
}

function clampViewportScrollTop(
  viewport: HTMLElement,
  target: number,
  restingScrollOffset: number,
) {
  const maxScrollTop = Math.max(
    restingScrollOffset,
    viewport.scrollHeight - viewport.clientHeight,
  );
  return Math.min(maxScrollTop, Math.max(restingScrollOffset, target));
}

function getSessionStorage() {
  try {
    return typeof window === "undefined" ? null : window.sessionStorage;
  } catch {
    return null;
  }
}

function isPersistedPreExpandScroll(
  value: unknown,
): value is PersistedPreExpandScroll {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<PersistedPreExpandScroll>;
  return (
    typeof candidate.articleKey === "string" &&
    Number.isFinite(candidate.scrollTop)
  );
}

function parseCssDurationMs(value: string) {
  const trimmed = value.trim();
  if (trimmed.length === 0) return null;

  if (trimmed.endsWith("ms")) {
    const parsed = Number.parseFloat(trimmed.slice(0, -2));
    return Number.isFinite(parsed) ? parsed : null;
  }

  if (trimmed.endsWith("s")) {
    const parsed = Number.parseFloat(trimmed.slice(0, -1));
    return Number.isFinite(parsed) ? parsed * 1000 : null;
  }

  const parsed = Number.parseFloat(trimmed);
  return Number.isFinite(parsed) ? parsed : null;
}
