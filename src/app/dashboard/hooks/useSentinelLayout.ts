/**
 * ## Sentinel layout engine for pull-to-refresh
 *
 * Manages three layout invariants that keep the pull-to-refresh sentinel
 * hidden during normal scrolling and visible only during an active pull:
 *
 * ### 1. Sentinel height + hide offset
 * The sentinel renders at `SENTINEL_HEIGHT`, while the hidden-rest scroll
 * target uses `SENTINEL_SCROLL_OFFSET` (`height + snap buffer`). That slight
 * overshoot keeps the sentinel top edge buried during normal browsing even
 * with sub-pixel rounding or compositor drift. The padding + `scrollTop`
 * initialisation (invariants 2 & 3) keeps it scrolled out of view.
 *
 * Fixes: sentinel unreachable with few/no articles.
 *
 * ### 2. Minimum overflow padding (`ensureMinOverflow`)
 * Ensures `viewport.scrollHeight ≥ viewport.clientHeight + sentinelHeight`.
 * Without this, setting `scrollTop = sentinelHeight` would be clamped to 0
 * by the browser, exposing the sentinel. Adds `paddingBottom` to the
 * content wrapper to guarantee enough scrollable space.
 *
 * Important: never strip-then-add padding. That transiently reduces
 * `scrollHeight`, which browsers use to clamp `scrollTop`, exposing
 * the sentinel during expand/collapse animations.
 *
 * ### 3. Scrollbar inset (`syncScrollbar`)
 * Offsets the Radix scrollbar thumb so it's flush at the top edge when
 * the sentinel is scrolled out of view. Without this, the scrollbar
 * track would include the sentinel zone, making the thumb start below
 * its expected position. Hidden entirely when content doesn't overflow.
 *
 * ### ResizeObserver scroll-pin modes
 * The ResizeObserver watches the content wrapper and has three modes,
 * driven by `suppressSnapRef` from `useScrollPin`:
 *
 * | Mode              | Trigger          | Behavior |
 * |-------------------|------------------|----------|
 * | Normal            | `false`          | `ensureMinOverflow()` + sentinel snap-back |
 * | Collapse pin      | `number > 0`     | Pad bottom + hard-pin `scrollTop = target` |
 * | Expand suppress   | `-1`             | Skip entirely (bail) |
 *
 * - **Collapse pin**: while CSS `max-height` shrinks the card, `scrollHeight`
 *   decreases. The observer adds enough `paddingBottom` so the browser
 *   never clamps `scrollTop` below the pin target, then re-sets
 *   `scrollTop` on every frame.
 *
 * - **Expand suppress**: the observer bails entirely. No padding changes,
 *   no `scrollTop` writes. Browser scroll anchoring handles expansion;
 *   user can scroll freely during the transition.
 */

import type { ScrollPinTarget } from "./useScrollPin";

/** Height of the pull-to-refresh sentinel zone. */
export const SENTINEL_HEIGHT = 104;
/**
 * Extra pixels added to the sentinel height so the hide-scroll target
 * overshoots, ensuring the sentinel top edge is never visible during
 * normal browsing even with sub-pixel rounding.
 */
export const SENTINEL_SNAP_BUFFER = 6;
/** scrollTop value that fully hides the sentinel (height + buffer). */
export const SENTINEL_SCROLL_OFFSET = SENTINEL_HEIGHT + SENTINEL_SNAP_BUFFER;

interface SentinelLayoutElements {
  viewport: HTMLElement;
  sentinel: HTMLElement | null;
  wrapper: HTMLElement | null;
  scrollRoot: HTMLElement;
}

/**
 * Find the Radix scrollbar element (conditionally mounted by Presence).
 * Returns null if not currently mounted.
 */
function findScrollbar(root: HTMLElement) {
  return root.querySelector<HTMLElement>(
    ':scope > [data-orientation="vertical"]',
  );
}

/**
 * Apply or clear inset styles on the Radix scrollbar to hide the sentinel zone.
 *
 * When content doesn't overflow (sentinel hidden or no real scroll),
 * the scrollbar is hidden entirely. Otherwise, the thumb track is offset
 * so its top edge aligns with the visible content boundary.
 *
 * Fixes: scrollbar thumb starting below expected position due to sentinel.
 */
function syncScrollbar(
  root: HTMLElement,
  viewport: HTMLElement,
  sentinelHeight: number,
) {
  const sb = findScrollbar(root);
  if (!sb) return;
  const H = viewport.scrollHeight;
  const realOverflow = H - sentinelHeight > viewport.clientHeight;
  if (!realOverflow) {
    sb.style.display = "none";
    return;
  }
  sb.style.display = "";
  // D = S·C/(H−S) makes translate3d(0, D, 0) land at the visible top edge.
  const inset =
    H > sentinelHeight
      ? (sentinelHeight * viewport.clientHeight) / (H - sentinelHeight)
      : 0;
  sb.style.marginTop = `-${inset.toFixed(2)}px`;
  sb.style.height = `calc(100% + ${inset.toFixed(2)}px)`;
}

/**
 * Ensure viewport has enough scroll space to hide the sentinel.
 * Adds `paddingBottom` to the wrapper so `scrollHeight ≥ clientHeight + sentinelHeight`.
 *
 * Also syncs sentinel visibility and scrollbar inset.
 *
 * Fixes: `scrollTop = SENTINEL_SCROLL_OFFSET` clamped to 0, exposing sentinel.
 */
function ensureMinOverflow({
  viewport,
  sentinel,
  wrapper,
  scrollRoot,
}: SentinelLayoutElements) {
  if (!sentinel || !wrapper) return;
  const height = sentinel.offsetHeight;
  syncScrollbar(scrollRoot, viewport, height);
  if (height === 0) return;
  const currentPad = parseFloat(wrapper.style.paddingBottom) || 0;
  const contentHeight = wrapper.offsetHeight - currentPad;
  const needed = Math.max(0, viewport.clientHeight + height - contentHeight);
  const next = needed > 0 ? `${needed}px` : "";
  if (wrapper.style.paddingBottom !== next) wrapper.style.paddingBottom = next;
}

/**
 * Handle the collapse-pin ResizeObserver path. Pads the bottom so the
 * browser never clamps `scrollTop` below the pin target, then hard-pins
 * `scrollTop` to the target value.
 *
 * Fixes: scroll jumping to bottom during article collapse animation.
 */
function handleCollapsePinResize(
  { viewport, sentinel, wrapper, scrollRoot }: SentinelLayoutElements,
  pinTarget: number,
) {
  if (!sentinel || !wrapper) return;
  const height = sentinel.offsetHeight;
  if (height <= 0) return;
  const currentPad = parseFloat(wrapper.style.paddingBottom) || 0;
  const contentHeight = wrapper.offsetHeight - currentPad;
  const minContent = viewport.clientHeight + Math.max(height, pinTarget);
  const needed = Math.max(0, minContent - contentHeight);
  const next = needed > 0 ? `${needed}px` : "";
  if (wrapper.style.paddingBottom !== next) wrapper.style.paddingBottom = next;
  syncScrollbar(scrollRoot, viewport, height);
  viewport.scrollTop = pinTarget;
}

/**
 * Create and attach all layout observers for the sentinel system.
 *
 * Returns a cleanup function that disconnects all observers and
 * removes all inline styles.
 */
export function attachSentinelLayout(
  elements: SentinelLayoutElements,
  suppressSnapRef: React.RefObject<ScrollPinTarget> | undefined,
  pullStateRefs: {
    touchActive: React.RefObject<boolean>;
    holding: React.RefObject<boolean>;
    pulling: React.RefObject<boolean>;
  },
): () => void {
  const { viewport, sentinel, wrapper, scrollRoot } = elements;

  // Prevent iOS from rubber-banding the page.
  viewport.style.overscrollBehaviorY = "none";

  // Keep the rendered sentinel compact; the hidden-rest scroll target adds a
  // small overshoot via SENTINEL_SCROLL_OFFSET so the sentinel top edge stays
  // buried during normal browsing.
  if (sentinel) sentinel.style.height = `${SENTINEL_HEIGHT}px`;

  // Radix sets overflow-y:hidden on the viewport when it detects no content
  // overflow, which prevents touch-scroll entirely. Our ensureMinOverflow
  // guarantees scrollHeight > clientHeight, but Radix's detection is async
  // (ResizeObserver-driven), leaving a window where the viewport is locked.
  // Force overflow-y:scroll immediately and re-enforce via MutationObserver
  // so Radix can never sneak in "hidden".
  viewport.style.overflowY = "scroll";
  const overflowObserver =
    typeof MutationObserver !== "undefined"
      ? new MutationObserver(() => {
          if (viewport.style.overflowY !== "scroll")
            viewport.style.overflowY = "scroll";
        })
      : null;
  overflowObserver?.observe(viewport, {
    attributes: true,
    attributeFilter: ["style"],
  });

  const sh = () => sentinel?.offsetHeight ?? 0;

  // ── Initial layout ──────────────────────────────────────────────────
  ensureMinOverflow(elements);
  viewport.scrollTop = SENTINEL_SCROLL_OFFSET;

  const rafId = requestAnimationFrame(() => {
    ensureMinOverflow(elements);
    if (sh() > 0 && viewport.scrollTop < SENTINEL_SCROLL_OFFSET) {
      viewport.scrollTop = SENTINEL_SCROLL_OFFSET;
    }
  });

  // ── Scrollbar mutation observer ─────────────────────────────────────
  // Radix mounts/unmounts the scrollbar via Presence. Re-sync inset
  // whenever the DOM structure under the scroll root changes.
  const mutObserver =
    typeof MutationObserver !== "undefined"
      ? new MutationObserver(() => syncScrollbar(scrollRoot, viewport, sh()))
      : null;
  mutObserver?.observe(scrollRoot, { childList: true, subtree: false });

  // ── Resize observer (three-mode) ────────────────────────────────────
  const resizeObserver =
    typeof ResizeObserver !== "undefined" && wrapper
      ? new ResizeObserver(() => {
          const target = suppressSnapRef?.current;

          if (typeof target === "number") {
            // Expand suppress: bail entirely so neither padding nor
            // scrollTop writes fight user scrolling or browser scroll
            // anchoring during the CSS expand transition.
            if (target < 0) return;

            // Collapse pin: hold scrollTop stable while max-height shrinks.
            handleCollapsePinResize(elements, target);
            return;
          }

          // Normal mode: maintain layout invariants + snap sentinel.
          const scrollTopBefore = viewport.scrollTop;
          ensureMinOverflow(elements);
          const height = sh();
          if (
            height > 0 &&
            scrollTopBefore < SENTINEL_SCROLL_OFFSET &&
            viewport.scrollTop < SENTINEL_SCROLL_OFFSET &&
            !pullStateRefs.touchActive.current &&
            !pullStateRefs.holding.current &&
            !pullStateRefs.pulling.current
          ) {
            viewport.scrollTop = SENTINEL_SCROLL_OFFSET;
          }
        })
      : null;
  if (wrapper) resizeObserver?.observe(wrapper);

  // ── Cleanup ─────────────────────────────────────────────────────────
  return () => {
    resizeObserver?.disconnect();
    overflowObserver?.disconnect();
    mutObserver?.disconnect();
    cancelAnimationFrame(rafId);
    viewport.style.overscrollBehaviorY = "";
    viewport.style.overflowY = "";
    if (sentinel) sentinel.style.height = "";
    if (wrapper) wrapper.style.paddingBottom = "";
    const sb = findScrollbar(scrollRoot);
    if (sb) {
      sb.style.marginTop = "";
      sb.style.height = "";
      sb.style.display = "";
    }
  };
}
