import {
  applySwipePointerMoveState,
  createCommittedSwipeState,
  resolveShouldCommit,
  shouldTrackSwipeMove,
  SWIPE_COMMIT_SLIDE_MS,
  SWIPE_IDLE,
  SWIPE_RELEASE_MS,
  type SwipeGestureContext,
} from "./swipeGestureShared";

/**
 * Describes the swipe gesture controls.
 */
interface SwipeGestureControls {
  animateRelease: () => void;
  clearReleaseTimer: () => void;
  releaseCapture: () => void;
  resetPointerState: () => void;
  restoreTouchAction: () => void;
  setTouchActionNone: () => void;
  trySetPointerCapture: (pointerId: number) => void;
}

/**
 * Create the swipe gesture runtime.
 * @param element - The element.
 * @param context - The context used to create the swipe gesture runtime.
 * @returns The swipe gesture runtime.
 */
export function createSwipeGestureRuntime(
  element: HTMLElement,
  context: SwipeGestureContext,
) {
  const controls = createSwipeGestureControls(element, context);
  const handlers = createSwipeGestureHandlers(element, context, controls);

  return {
    /**
     * Attach swipe gesture listeners to the target element.
     */
    attach: () => {
      element.addEventListener("pointerdown", handlers.handlePointerDown, true);
      element.addEventListener("pointermove", handlers.handlePointerMove, {
        capture: true,
        passive: false,
      });
      element.addEventListener("pointerup", handlers.handlePointerEnd, true);
      element.addEventListener(
        "pointercancel",
        handlers.handlePointerCancel,
        true,
      );
      element.addEventListener(
        "lostpointercapture",
        handlers.handleLostPointerCapture,
      );
    },
    /**
     * Detach swipe gesture listeners and reset any pending runtime state.
     */
    detach: () => {
      controls.clearReleaseTimer();
      controls.releaseCapture();
      controls.restoreTouchAction();
      element.removeEventListener(
        "pointerdown",
        handlers.handlePointerDown,
        true,
      );
      element.removeEventListener(
        "pointermove",
        handlers.handlePointerMove,
        true,
      );
      element.removeEventListener("pointerup", handlers.handlePointerEnd, true);
      element.removeEventListener(
        "pointercancel",
        handlers.handlePointerCancel,
        true,
      );
      element.removeEventListener(
        "lostpointercapture",
        handlers.handleLostPointerCapture,
      );
    },
  };
}

/**
 * Create the lost-pointer-capture handler.
 * @param context - The swipe gesture context.
 * @param controls - The swipe gesture controls.
 * @returns The handler for lost pointer capture events.
 */
function createLostPointerCaptureHandler(
  context: SwipeGestureContext,
  controls: SwipeGestureControls,
) {
  return (event: PointerEvent) => {
    if (context.activePointerIdRef.current === null) {
      return;
    }
    if (context.activePointerIdRef.current === event.pointerId) {
      context.hasCaptureRef.current = false;
      return;
    }

    controls.clearReleaseTimer();
    context.setState(SWIPE_IDLE);
    controls.resetPointerState();
  };
}

/**
 * Create the pointer-cancel handler.
 * @param context - The swipe gesture context.
 * @param controls - The swipe gesture controls.
 * @returns The handler for pointer cancel events.
 */
function createPointerCancelHandler(
  context: SwipeGestureContext,
  controls: SwipeGestureControls,
) {
  return (event: PointerEvent) => {
    if (context.activePointerIdRef.current !== event.pointerId) {
      return;
    }

    controls.releaseCapture();
    controls.animateRelease();
    controls.resetPointerState();
  };
}

/**
 * Create the pointer-down handler that primes swipe state for a new gesture.
 * @param element - The swipe target element.
 * @param context - The swipe gesture context.
 * @param controls - The swipe gesture controls.
 * @returns The handler for pointer down events.
 */
function createPointerDownHandler(
  element: HTMLElement,
  context: SwipeGestureContext,
  controls: SwipeGestureControls,
) {
  return (event: PointerEvent) => {
    if (context.disabledRef.current || event.pointerType === "mouse") {
      return;
    }
    if (context.shouldIgnoreTarget?.(event.target)) {
      return;
    }

    controls.clearReleaseTimer();
    context.setState(SWIPE_IDLE);
    context.activePointerIdRef.current = event.pointerId;
    context.startRef.current = { x: event.clientX, y: event.clientY };
    context.lockedRef.current = null;
    context.committedRef.current = false;
    context.containerWidthRef.current = element.offsetWidth || 300;
    context.velocityTrackRef.current = [
      { t: event.timeStamp, x: event.clientX },
    ];
  };
}

/**
 * Create the pointer-end handler that commits or releases the swipe gesture.
 * @param context - The swipe gesture context.
 * @param controls - The swipe gesture controls.
 * @returns The handler for pointer end events.
 */
function createPointerEndHandler(
  context: SwipeGestureContext,
  controls: SwipeGestureControls,
) {
  return (event: PointerEvent) => {
    if (context.activePointerIdRef.current !== event.pointerId) {
      return;
    }

    const shouldCommit = resolveShouldCommit(event, context);
    controls.releaseCapture();

    if (shouldCommit && !context.disabledRef.current) {
      context.setState(
        createCommittedSwipeState(
          context.isRight,
          context.containerWidthRef.current,
        ),
      );
      context.onCommitRef.current();
      controls.clearReleaseTimer();
      context.releaseTimerRef.current = setTimeout(() => {
        context.setState(SWIPE_IDLE);
        context.releaseTimerRef.current = null;
      }, SWIPE_COMMIT_SLIDE_MS);
    } else {
      controls.animateRelease();
    }

    controls.resetPointerState();
  };
}

/**
 * Create the pointer-move handler for swipe gesture updates.
 * @param context - The swipe gesture context.
 * @param controls - The swipe gesture controls.
 * @returns The handler for pointer move events.
 */
function createPointerMoveHandler(
  context: SwipeGestureContext,
  controls: SwipeGestureControls,
) {
  return (event: PointerEvent) => {
    if (context.activePointerIdRef.current !== event.pointerId) {
      return;
    }
    if (!shouldTrackSwipeMove(event, context, controls)) {
      return;
    }

    applySwipePointerMoveState(event, context);
  };
}

/**
 * Create the pointer-capture releaser for the swipe target element.
 * @param element - The swipe target element.
 * @param context - The swipe gesture context.
 * @returns Callback that releases pointer capture when the gesture ends or cancels.
 */
function createSwipeCaptureReleaser(
  element: HTMLElement,
  context: SwipeGestureContext,
) {
  return () => {
    const pointerId = context.activePointerIdRef.current;
    if (pointerId === null || !context.hasCaptureRef.current) {
      return;
    }

    try {
      if (element.hasPointerCapture(pointerId)) {
        element.releasePointerCapture(pointerId);
      }
    } catch {
      // Ignore release failures when the browser has already dropped capture.
    }

    context.hasCaptureRef.current = false;
  };
}

/**
 * Create the swipe gesture controls.
 * @param element - The element.
 * @param context - The context used to create the swipe gesture controls.
 * @returns The swipe gesture controls.
 */
function createSwipeGestureControls(
  element: HTMLElement,
  context: SwipeGestureContext,
): SwipeGestureControls {
  const clearReleaseTimer = createSwipeReleaseTimerClearer(context);
  const restoreTouchAction = createSwipeTouchActionRestorer(element);
  const releaseCapture = createSwipeCaptureReleaser(element, context);
  const resetPointerState = createSwipePointerStateResetter(
    context,
    restoreTouchAction,
  );

  return {
    animateRelease: createSwipeReleaseAnimator(context, clearReleaseTimer),
    clearReleaseTimer,
    releaseCapture,
    resetPointerState,
    restoreTouchAction,
    setTouchActionNone: createSwipeTouchActionDisabler(element),
    trySetPointerCapture: createSwipePointerCaptureSetter(element, context),
  };
}

/**
 * Create the swipe gesture handlers.
 * @param element - The element.
 * @param context - The context used to create the swipe gesture handlers.
 * @param controls - Swipe gesture control object providing the current gesture state.
 * @returns The swipe gesture handlers.
 */
function createSwipeGestureHandlers(
  element: HTMLElement,
  context: SwipeGestureContext,
  controls: SwipeGestureControls,
) {
  return {
    handleLostPointerCapture: createLostPointerCaptureHandler(
      context,
      controls,
    ),
    handlePointerCancel: createPointerCancelHandler(context, controls),
    handlePointerDown: createPointerDownHandler(element, context, controls),
    handlePointerEnd: createPointerEndHandler(context, controls),
    handlePointerMove: createPointerMoveHandler(context, controls),
  };
}

/**
 * Create the callback that attempts to capture the active pointer.
 * @param element - The swipe target element.
 * @param context - The swipe gesture context.
 * @returns Callback that captures the pointer for exclusive swipe gesture tracking.
 */
function createSwipePointerCaptureSetter(
  element: HTMLElement,
  context: SwipeGestureContext,
) {
  return (pointerId: number) => {
    try {
      element.setPointerCapture(pointerId);
      context.hasCaptureRef.current = true;
    } catch {
      context.hasCaptureRef.current = false;
    }
  };
}

/**
 * Create the pointer-state resetter used after swipe completion or cancellation.
 * @param context - The swipe gesture context.
 * @param restoreTouchAction - Restores the element touch-action style.
 * @returns Callback that resets all swipe gesture pointer state to idle.
 */
function createSwipePointerStateResetter(
  context: SwipeGestureContext,
  restoreTouchAction: () => void,
) {
  return () => {
    restoreTouchAction();
    context.startRef.current = null;
    context.lockedRef.current = null;
    context.committedRef.current = false;
    context.activePointerIdRef.current = null;
    context.hasCaptureRef.current = false;
    context.velocityTrackRef.current = [];
  };
}

/**
 * Create the release animation callback for swipe cancellation.
 * @param context - The swipe gesture context.
 * @param clearReleaseTimer - Clears any previously scheduled release timer.
 * @returns Callback that plays the cancel animation and returns the card to idle position.
 */
function createSwipeReleaseAnimator(
  context: SwipeGestureContext,
  clearReleaseTimer: () => void,
) {
  return () => {
    context.setState({
      committed: false,
      offsetX: 0,
      phase: "releasing",
      progress: 0,
    });
    clearReleaseTimer();
    context.releaseTimerRef.current = setTimeout(() => {
      context.setState(SWIPE_IDLE);
      context.releaseTimerRef.current = null;
    }, SWIPE_RELEASE_MS);
  };
}

/**
 * Create the release-timer clearer used by swipe gesture controls.
 * @param context - The swipe gesture context.
 * @returns Callback that cancels any pending pointer-release timer.
 */
function createSwipeReleaseTimerClearer(context: SwipeGestureContext) {
  return () => {
    if (context.releaseTimerRef.current !== null) {
      clearTimeout(context.releaseTimerRef.current);
      context.releaseTimerRef.current = null;
    }
  };
}

/**
 * Create the callback that disables touch-action while swiping.
 * @param element - The swipe target element.
 * @returns Callback that disables native touch-action on the swipe target element.
 */
function createSwipeTouchActionDisabler(element: HTMLElement) {
  return () => {
    element.style.touchAction = "none";
  };
}

/**
 * Create the touch-action restorer for the swipe target element.
 * @param element - The swipe target element.
 * @returns Callback that restores native touch-action on the swipe target element.
 */
function createSwipeTouchActionRestorer(element: HTMLElement) {
  return () => {
    if (element.style.touchAction === "none") {
      element.style.touchAction = "";
    }
  };
}
