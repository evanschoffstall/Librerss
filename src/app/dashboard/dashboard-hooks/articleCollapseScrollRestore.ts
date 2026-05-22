"use client";

import type React from "react";

import type { ArticleViewportSnapshot } from "@/app/dashboard/dashboard-hooks/articleCollapseViewport";

import {
  ARTICLE_DEEXPAND_REMOVAL_ANIMATION_MS,
  ARTICLE_SCROLL_RESTORE_BUFFER_MS,
} from "@/app/dashboard/dashboard-hooks/articleCollapseConstants";
import {
  observeCollapseRestoreLayout,
  resolveCollapseRestoreViewport,
} from "@/app/dashboard/dashboard-hooks/articleCollapseViewport";

/**
 * Describes the options for collapse scroll restore runtime.
 */
interface CollapseScrollRestoreRuntimeOptions {
  articleKey: string;
  clearPreExpandSnapshot: (
    expectedSnapshot?: ArticleViewportSnapshot | null,
  ) => void;
  setIsCollapseScrollRestoreActive: React.Dispatch<
    React.SetStateAction<boolean>
  >;
  snapshot: ArticleViewportSnapshot;
}

/**
 * Describes the options for collapse viewport sync.
 */
interface CollapseViewportSyncOptions {
  adoptViewport: (nextViewport: HTMLElement) => void;
  articleKey: string;
  release: () => void;
  scheduleViewportSync: () => void;
  state: ReturnType<typeof createCollapseScrollRestoreState>;
}

/**
 * Create the collapse scroll restore runtime.
 * @param options - The options used to create the collapse scroll restore runtime.
 * @returns The collapse scroll restore runtime.
 */
export function createCollapseScrollRestoreRuntime(
  options: CollapseScrollRestoreRuntimeOptions,
) {
  const {
    articleKey,
    clearPreExpandSnapshot,
    setIsCollapseScrollRestoreActive,
    snapshot,
  } = options;
  const state = createCollapseScrollRestoreState(articleKey, snapshot);
  /**
   * Process the release.
   */
  const release = () => {
    releaseCollapseScrollRestore(
      state,
      clearPreExpandSnapshot,
      release,
      setIsCollapseScrollRestoreActive,
    );
  };
  /**
   * Process the reconnect layout observers.
   */
  const reconnectLayoutObservers = () => {
    state.disconnectLayoutObservers?.();
    state.disconnectLayoutObservers = observeCollapseRestoreLayout({
      articleKey,
      onLayoutChange: syncViewportScroll,
      viewport: state.activeViewport,
    });
  };
  /**
   * Process the adopt viewport.
   * @param nextViewport - The next viewport.
   */
  const adoptViewport = (nextViewport: HTMLElement) => {
    adoptCollapseRestoreViewport(
      state,
      nextViewport,
      reconnectLayoutObservers,
      release,
    );
  };
  /**
   * Process the schedule viewport sync.
   */
  const scheduleViewportSync = () => {
    scheduleCollapseViewportSync(state, syncViewportScroll);
  };
  const syncViewportScroll = createCollapseViewportSync({
    adoptViewport,
    articleKey,
    release,
    scheduleViewportSync,
    state,
  });

  initializeCollapseScrollRestore(state, reconnectLayoutObservers, release);
  syncViewportScroll();

  return {
    release,
    syncViewportScroll,
  };
}

/**
 * Process the adopt collapse restore viewport.
 * @param state - Article-collapse scroll-restore state object.
 * @param nextViewport - The next viewport.
 * @param reconnectLayoutObservers - Callback that reconnects layout observers after scroll restoration.
 * @param release - Callback that releases the active scroll-restore session.
 */
function adoptCollapseRestoreViewport(
  state: ReturnType<typeof createCollapseScrollRestoreState>,
  nextViewport: HTMLElement,
  reconnectLayoutObservers: () => void,
  release: () => void,
) {
  if (nextViewport === state.activeViewport) {
    return;
  }

  bindCollapseReleaseListeners(state.activeViewport, release, false);
  state.activeViewport.style.overflowAnchor = state.activeOverflowAnchor;
  state.activeViewport = nextViewport;
  state.activeOverflowAnchor = state.activeViewport.style.overflowAnchor;
  state.activeViewport.style.overflowAnchor = "none";
  bindCollapseReleaseListeners(state.activeViewport, release, true);
  reconnectLayoutObservers();
}

/**
 * Process the bind collapse release listeners.
 * @param targetViewport - The target viewport.
 * @param release - Callback that releases the active scroll-restore session.
 * @param shouldBind - Whether should bind.
 */
function bindCollapseReleaseListeners(
  targetViewport: HTMLElement,
  release: () => void,
  shouldBind: boolean,
) {
  const method = shouldBind ? "addEventListener" : "removeEventListener";
  targetViewport[method]("wheel", release, { passive: true });
  targetViewport[method]("touchmove", release, { passive: true });
}
/**
 * Create the collapse scroll restore state.
 * @param articleKey - The article key.
 * @param snapshot - The snapshot.
 * @returns The collapse scroll restore state.
 */
function createCollapseScrollRestoreState(
  articleKey: string,
  snapshot: ArticleViewportSnapshot,
) {
  const { viewport, viewportScrollTop } = snapshot;

  return {
    activeOverflowAnchor: (
      resolveCollapseRestoreViewport(articleKey, viewport) ?? viewport
    ).style.overflowAnchor,
    activeViewport:
      resolveCollapseRestoreViewport(articleKey, viewport) ?? viewport,
    animationFrameId: 0,
    disconnectLayoutObservers: null as (() => void) | null,
    releaseAt:
      performance.now() +
      ARTICLE_DEEXPAND_REMOVAL_ANIMATION_MS +
      ARTICLE_SCROLL_RESTORE_BUFFER_MS,
    snapshot,
    viewportScrollTop,
  };
}

/**
 * Create the collapse viewport sync.
 * @param options - The options used to create the collapse viewport sync.
 * @returns The collapse viewport sync.
 */
function createCollapseViewportSync(options: CollapseViewportSyncOptions) {
  /**
   * Synchronizes the viewport back to the preserved collapse position.
   */
  return function syncViewportScroll() {
    const currentViewport = resolveCollapseRestoreViewport(
      options.articleKey,
      options.state.activeViewport,
    );

    if (!currentViewport) {
      options.release();
      return;
    }

    options.adoptViewport(currentViewport);

    if (!options.state.activeViewport.isConnected) {
      options.release();
      return;
    }

    if (
      Math.abs(
        options.state.activeViewport.scrollTop -
          options.state.viewportScrollTop,
      ) > 1
    ) {
      options.state.activeViewport.scrollTop = options.state.viewportScrollTop;
    }

    if (performance.now() >= options.state.releaseAt) {
      options.release();
      return;
    }

    options.scheduleViewportSync();
  };
}

/**
 * Initialize the collapse scroll restore.
 * @param state - Article-collapse scroll-restore state object.
 * @param reconnectLayoutObservers - Callback that reconnects layout observers after scroll restoration.
 * @param release - Callback that releases the active scroll-restore session.
 */
function initializeCollapseScrollRestore(
  state: ReturnType<typeof createCollapseScrollRestoreState>,
  reconnectLayoutObservers: () => void,
  release: () => void,
) {
  state.activeViewport.style.overflowAnchor = "none";
  bindCollapseReleaseListeners(state.activeViewport, release, true);
  reconnectLayoutObservers();
}

/**
 * Process the release collapse scroll restore.
 * @param state - Article-collapse scroll-restore state object.
 * @param clearPreExpandSnapshot - Callback that clears the captured pre-expand scroll snapshot.
 * @param release - Callback that releases the active scroll-restore session.
 * @param setIsCollapseScrollRestoreActive - The set is collapse scroll restore active.
 */
function releaseCollapseScrollRestore(
  state: ReturnType<typeof createCollapseScrollRestoreState>,
  clearPreExpandSnapshot: (
    expectedSnapshot?: ArticleViewportSnapshot | null,
  ) => void,
  release: () => void,
  setIsCollapseScrollRestoreActive: React.Dispatch<
    React.SetStateAction<boolean>
  >,
) {
  if (state.animationFrameId !== 0) {
    window.cancelAnimationFrame(state.animationFrameId);
    state.animationFrameId = 0;
  }

  bindCollapseReleaseListeners(state.activeViewport, release, false);
  state.disconnectLayoutObservers?.();
  state.disconnectLayoutObservers = null;
  state.activeViewport.style.overflowAnchor = state.activeOverflowAnchor;
  setIsCollapseScrollRestoreActive(false);
  clearPreExpandSnapshot(state.snapshot);
}

/**
 * Process the schedule collapse viewport sync.
 * @param state - Article-collapse scroll-restore state object.
 * @param syncViewportScroll - Callback that synchronizes the viewport scroll position.
 */
function scheduleCollapseViewportSync(
  state: ReturnType<typeof createCollapseScrollRestoreState>,
  syncViewportScroll: () => void,
) {
  if (state.animationFrameId !== 0) {
    return;
  }

  state.animationFrameId = window.requestAnimationFrame(() => {
    state.animationFrameId = 0;
    syncViewportScroll();
  });
}
