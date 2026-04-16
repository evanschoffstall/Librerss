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
  const release = () => {
    releaseCollapseScrollRestore(
      state,
      clearPreExpandSnapshot,
      release,
      setIsCollapseScrollRestoreActive,
    );
  };
  const reconnectLayoutObservers = () => {
    state.disconnectLayoutObservers?.();
    state.disconnectLayoutObservers = observeCollapseRestoreLayout({
      articleKey,
      onLayoutChange: syncViewportScroll,
      viewport: state.activeViewport,
    });
  };
  const adoptViewport = (nextViewport: HTMLElement) => {
    adoptCollapseRestoreViewport(
      state,
      nextViewport,
      reconnectLayoutObservers,
      release,
    );
  };
  const scheduleViewportSync = () =>
    { scheduleCollapseViewportSync(state, syncViewportScroll); };

  function syncViewportScroll() {
    const currentViewport = resolveCollapseRestoreViewport(
      articleKey,
      state.activeViewport,
    );

    if (!currentViewport) {
      release();
      return;
    }

    adoptViewport(currentViewport);

    if (!state.activeViewport.isConnected) {
      release();
      return;
    }

    if (
      Math.abs(state.activeViewport.scrollTop - state.viewportScrollTop) > 1
    ) {
      state.activeViewport.scrollTop = state.viewportScrollTop;
    }

    if (performance.now() >= state.releaseAt) {
      release();
      return;
    }

    scheduleViewportSync();
  }

  initializeCollapseScrollRestore(state, reconnectLayoutObservers, release);

  return {
    release,
    syncViewportScroll,
  };
}

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

function bindCollapseReleaseListeners(
  targetViewport: HTMLElement,
  release: () => void,
  shouldBind: boolean,
) {
  const method = shouldBind ? "addEventListener" : "removeEventListener";
  targetViewport[method]("wheel", release, { passive: true });
  targetViewport[method]("touchmove", release, { passive: true });
}

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

function initializeCollapseScrollRestore(
  state: ReturnType<typeof createCollapseScrollRestoreState>,
  reconnectLayoutObservers: () => void,
  release: () => void,
) {
  state.activeViewport.style.overflowAnchor = "none";
  bindCollapseReleaseListeners(state.activeViewport, release, true);
  reconnectLayoutObservers();
}

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
