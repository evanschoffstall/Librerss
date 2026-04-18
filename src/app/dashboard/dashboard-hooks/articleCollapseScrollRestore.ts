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
 * @param root0
 * @param root0.articleKey
 * @param root0.clearPreExpandSnapshot
 * @param root0.setIsCollapseScrollRestoreActive
 * @param root0.snapshot
 */
export function createCollapseScrollRestoreRuntime({
  articleKey,
  clearPreExpandSnapshot,
  setIsCollapseScrollRestoreActive,
  snapshot,
}: {
  articleKey: string;
  clearPreExpandSnapshot: () => void;
  setIsCollapseScrollRestoreActive: React.Dispatch<
    React.SetStateAction<boolean>
  >;
  snapshot: ArticleViewportSnapshot;
}) {
  const state = createCollapseScrollRestoreState(articleKey, snapshot);
  /**
   *
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
   *
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
   * @param nextViewport
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
   *
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

  return {
    release,
    syncViewportScroll,
  };
}

/**
 * @param state
 * @param nextViewport
 * @param reconnectLayoutObservers
 * @param release
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
 * @param targetViewport
 * @param release
 * @param shouldBind
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
 * @param articleKey
 * @param snapshot
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
    viewportScrollTop,
  };
}

/**
 * @param options
 * @param options.adoptViewport
 * @param options.articleKey
 * @param options.release
 * @param options.scheduleViewportSync
 * @param options.state
 */
function createCollapseViewportSync(options: {
  adoptViewport: (nextViewport: HTMLElement) => void;
  articleKey: string;
  release: () => void;
  scheduleViewportSync: () => void;
  state: ReturnType<typeof createCollapseScrollRestoreState>;
}) {
  /**
   *
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
 * @param state
 * @param reconnectLayoutObservers
 * @param release
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
 * @param state
 * @param clearPreExpandSnapshot
 * @param release
 * @param setIsCollapseScrollRestoreActive
 */
function releaseCollapseScrollRestore(
  state: ReturnType<typeof createCollapseScrollRestoreState>,
  clearPreExpandSnapshot: () => void,
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
  clearPreExpandSnapshot();
}

/**
 * @param state
 * @param syncViewportScroll
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
