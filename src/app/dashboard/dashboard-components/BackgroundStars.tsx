"use client";

import { useCallback, useEffect, useRef } from "react";

import type { Star } from "@/app/dashboard/dashboard-components/BackgroundStars.scene";

import {
  useBackgroundCanvasAnimation,
  useBackgroundCanvasRefs,
  useBackgroundCanvasWindowEvents,
} from "@/app/dashboard/dashboard-components/background-hooks";
import {
  BACKGROUND_CANVAS_BASELINE_FRAME_MS,
  getBackgroundCanvasLerpFactor,
  getBackgroundCanvasScale,
  getVisibleBackgroundCanvasElementSize,
} from "@/app/dashboard/dashboard-components/background-internals";
import {
  buildBackgroundStar,
  drawBackgroundStar,
  resolveBackgroundStarPointerOffset,
  updateBackgroundStar as updateSceneBackgroundStar,
} from "@/app/dashboard/dashboard-components/BackgroundStars.scene";

/**
 * Describes the options for background star canvas.
 */
interface BackgroundStarCanvasOptions {
  canvasRef: React.RefObject<HTMLCanvasElement | null>;
  contextRef: React.RefObject<CanvasRenderingContext2D | null>;
  initStars: () => void;
}

/**
 * Describes the options for background star canvas setup.
 */
interface BackgroundStarCanvasSetupOptions {
  buildStar: () => Star;
  canvasContainerRef: React.RefObject<HTMLDivElement | null>;
  canvasRef: React.RefObject<HTMLCanvasElement | null>;
  canvasSize: React.RefObject<{ h: number; w: number }>;
  contextRef: React.RefObject<CanvasRenderingContext2D | null>;
  quantity: number;
  starsRef: React.RefObject<Star[]>;
}
/**
 * Describes the options for background star pointer handler.
 */
interface BackgroundStarPointerHandlerOptions {
  canvasRef: React.RefObject<HTMLCanvasElement | null>;
  canvasSize: React.RefObject<{ h: number; w: number }>;
  mouseRef: React.RefObject<{ x: number; y: number }>;
}

/**
 * Describes the options for background star renderer.
 */
interface BackgroundStarRendererOptions {
  canvasSize: React.RefObject<{ h: number; w: number }>;
  contextRef: React.RefObject<CanvasRenderingContext2D | null>;
  drawStar: typeof drawBackgroundStar;
  ease: number;
  mouseRef: React.RefObject<{ x: number; y: number }>;
  starsRef: React.RefObject<Star[]>;
  staticity: number;
}
/**
 * Describes the options for background stars frame.
 */
interface BackgroundStarsFrameOptions {
  canvasSize: React.RefObject<{ h: number; w: number }>;
  contextRef: React.RefObject<CanvasRenderingContext2D | null>;
  delta: number;
  drawStar: typeof drawBackgroundStar;
  ease: number;
  mouseRef: React.RefObject<{ x: number; y: number }>;
  starsRef: React.RefObject<Star[]>;
  staticity: number;
}

/**
 * Describes the options for background stars.
 */
interface BackgroundStarsOptions {
  contextRef: React.RefObject<CanvasRenderingContext2D | null>;
  height: number;
  stars: Star[];
  width: number;
}
/**
 * Describes the options for build background star.
 */
interface BuildBackgroundStarOptions {
  canvasSize: React.RefObject<{ h: number; w: number }>;
  color: "dark" | "light";
}

/**
 * Describes the options for rescale background star positions.
 */
interface RescaleBackgroundStarPositionsOptions {
  canvasSize: React.RefObject<{ h: number; w: number }>;
  resizeCanvas: () => boolean | undefined;
  starsRef: React.RefObject<Star[]>;
}
/**
 * Describes the options for resize background star canvas.
 */
interface ResizeBackgroundStarCanvasOptions {
  canvasContainerRef: React.RefObject<HTMLDivElement | null>;
  canvasRef: React.RefObject<HTMLCanvasElement | null>;
  canvasSize: React.RefObject<{ h: number; w: number }>;
  contextRef: React.RefObject<CanvasRenderingContext2D | null>;
}

/**
 * Describes the props for the stars component.
 */
interface StarsProps {
  className?: string;
  color?: "dark" | "light";
  ease?: number;
  quantity?: number;
  refresh?: boolean;
  staticity?: number;
} /**
 * Render the background stars component.
 * @param props - The component props.
 * @returns The rendered background stars component.
 */
export default function BackgroundStars(props: StarsProps) {
  const {
    className = "",
    color = "light",
    ease = 50,
    quantity = 30,
    refresh = false,
    staticity = 50,
  } = props;
  const runtime = useBackgroundStarsRuntime({
    color,
    ease,
    quantity,
    staticity,
  });

  useEffect(() => {
    initializeBackgroundStarCanvas({
      canvasRef: runtime.canvasRef,
      contextRef: runtime.contextRef,
      initStars: runtime.initStars,
    });
  }, [runtime]);

  useBackgroundCanvasWindowEvents({
    onMouseMove: runtime.handleMouseMove,
    onResize: runtime.onResize,
  });
  useBackgroundCanvasAnimation({ onFrame: runtime.animate });

  useEffect(() => {
    if (refresh) {
      runtime.initStars();
    }
  }, [refresh, runtime]);

  return (
    <div
      aria-hidden="true"
      className={className}
      ref={runtime.canvasContainerRef}
    >
      <canvas ref={runtime.canvasRef} />
    </div>
  );
}

/**
 * Draw the background stars.
 * @param options - The options used to draw the background stars.
 */
function drawBackgroundStars(options: BackgroundStarsOptions) {
  const { contextRef, height, stars, width } = options;
  const context = contextRef.current;
  if (!context) {
    return;
  }

  context.clearRect(0, 0, width, height);
  for (const star of stars) {
    drawBackgroundStar(context, star);
  }
} /**
 * Initialize the background star canvas.
 * @param options - The options used to initialize the background star canvas.
 */
function initializeBackgroundStarCanvas(options: BackgroundStarCanvasOptions) {
  const { canvasRef, contextRef, initStars } = options;
  const canvas = canvasRef.current;
  if (!canvas) {
    return;
  }

  const context = canvas.getContext("2d");
  if (!context) {
    return;
  }

  contextRef.current = context;
  initStars();
}

/**
 * Render the background stars frame.
 * @param options - The options used to render the background stars frame.
 */
function renderBackgroundStarsFrame(options: BackgroundStarsFrameOptions) {
  const {
    canvasSize,
    contextRef,
    delta,
    drawStar,
    ease,
    mouseRef,
    starsRef,
    staticity,
  } = options;
  const context = contextRef.current;
  if (!context) {
    return;
  }

  context.clearRect(0, 0, canvasSize.current.w, canvasSize.current.h);
  const lerpFactor = getBackgroundCanvasLerpFactor(
    ease,
    delta,
    BACKGROUND_CANVAS_BASELINE_FRAME_MS,
  );

  for (const star of starsRef.current) {
    updateSceneBackgroundStar(star, lerpFactor, mouseRef.current, staticity);
    drawStar(context, star);
  }
} /**
 * Process the rescale background star positions.
 * @param options - The options used to process the rescale background star positions.
 */
function rescaleBackgroundStarPositions(
  options: RescaleBackgroundStarPositionsOptions,
) {
  const { canvasSize, resizeCanvas, starsRef } = options;
  const oldW = canvasSize.current.w;
  const oldH = canvasSize.current.h;
  resizeCanvas();
  const newW = canvasSize.current.w;
  const newH = canvasSize.current.h;
  if (oldW <= 0 || oldH <= 0) {
    return;
  }

  const scaleX = newW / oldW;
  const scaleY = newH / oldH;
  for (const star of starsRef.current) {
    star.x *= scaleX;
    star.y *= scaleY;
  }
}

/**
 * Process the resize background star canvas.
 * @param options - The options used to process the resize background star canvas.
 * @returns Whether the canvas committed a visible non-zero size.
 */
function resizeBackgroundStarCanvas(
  options: ResizeBackgroundStarCanvasOptions,
) {
  const { canvasContainerRef, canvasRef, canvasSize, contextRef } = options;
  const canvas = canvasRef.current;
  const container = canvasContainerRef.current;
  const context = contextRef.current;
  if (!canvas || !container || !context) {
    return;
  }

  const visibleSize = getVisibleBackgroundCanvasElementSize(container);
  if (!visibleSize) {
    return false;
  }

  const dpr = getBackgroundCanvasScale(window.devicePixelRatio);
  const { height, width } = visibleSize;
  canvasSize.current = { h: height, w: width };
  canvas.width = width * dpr;
  canvas.height = height * dpr;
  canvas.style.width = `${width}px`;
  canvas.style.height = `${height}px`;
  context.setTransform(dpr, 0, 0, dpr, 0, 0);

  return true;
} /**
 * Manage the background star canvas setup.
 * @param options - The options used to manage the background star canvas setup.
 * @returns The background star canvas setup state and callbacks.
 */
function useBackgroundStarCanvasSetup(
  options: BackgroundStarCanvasSetupOptions,
) {
  const {
    buildStar,
    canvasContainerRef,
    canvasRef,
    canvasSize,
    contextRef,
    quantity,
    starsRef,
  } = options;
  const resizeCanvas = useCallback(() => {
    return resizeBackgroundStarCanvas({
      canvasContainerRef,
      canvasRef,
      canvasSize,
      contextRef,
    });
  }, [canvasContainerRef, canvasRef, canvasSize, contextRef]);
  const initStars = useCallback(() => {
    if (!resizeCanvas()) {
      return;
    }

    starsRef.current = Array.from({ length: quantity }, buildStar);
    drawBackgroundStars({
      contextRef,
      height: canvasSize.current.h,
      stars: starsRef.current,
      width: canvasSize.current.w,
    });
  }, [buildStar, canvasSize, contextRef, quantity, resizeCanvas, starsRef]);
  const onResize = useCallback(() => {
    rescaleBackgroundStarPositions({ canvasSize, resizeCanvas, starsRef });
  }, [canvasSize, resizeCanvas, starsRef]);

  return { initStars, onResize };
}

/**
 * Manage the background star pointer handler.
 * @param options - The options used to manage the background star pointer handler.
 * @returns The background star pointer handler state and callbacks.
 */
function useBackgroundStarPointerHandler(
  options: BackgroundStarPointerHandlerOptions,
) {
  const { canvasRef, canvasSize, mouseRef } = options;
  return useCallback(
    (event: MouseEvent) => {
      mouseRef.current = resolveBackgroundStarPointerOffset({
        canvasRef,
        canvasSize,
        event,
        fallback: mouseRef.current,
      });
    },
    [canvasRef, canvasSize, mouseRef],
  );
}

/**
 * Manage the background star renderer.
 * @param options - The options used to manage the background star renderer.
 * @returns The background star renderer state and callbacks.
 */
function useBackgroundStarRenderer(options: BackgroundStarRendererOptions) {
  const {
    canvasSize,
    contextRef,
    drawStar,
    ease,
    mouseRef,
    starsRef,
    staticity,
  } = options;
  return useCallback(
    (_now: number, delta: number) => {
      renderBackgroundStarsFrame({
        canvasSize,
        contextRef,
        delta,
        drawStar,
        ease,
        mouseRef,
        starsRef,
        staticity,
      });
    },
    [canvasSize, contextRef, drawStar, ease, mouseRef, starsRef, staticity],
  );
} /**
 * Manage the background stars runtime.
 * @param options - The options used to manage the background stars runtime.
 * @returns The background stars runtime state and callbacks.
 */
function useBackgroundStarsRuntime(
  options: Required<
    Pick<StarsProps, "color" | "ease" | "quantity" | "staticity">
  >,
) {
  const { color, ease, quantity, staticity } = options;
  const { canvasContainerRef, canvasRef } = useBackgroundCanvasRefs();
  const contextRef = useRef<CanvasRenderingContext2D | null>(null);
  const starsRef = useRef<Star[]>([]);
  const mouseRef = useRef({ x: 0, y: 0 });
  const canvasSize = useRef({ h: 0, w: 0 });
  const buildStar = useBuildBackgroundStar({ canvasSize, color });
  const { initStars, onResize } = useBackgroundStarCanvasSetup({
    buildStar,
    canvasContainerRef,
    canvasRef,
    canvasSize,
    contextRef,
    quantity,
    starsRef,
  });
  const animate = useBackgroundStarRenderer({
    canvasSize,
    contextRef,
    drawStar: drawBackgroundStar,
    ease,
    mouseRef,
    starsRef,
    staticity,
  });
  const handleMouseMove = useBackgroundStarPointerHandler({
    canvasRef,
    canvasSize,
    mouseRef,
  });

  return {
    animate,
    canvasContainerRef,
    canvasRef,
    contextRef,
    handleMouseMove,
    initStars,
    onResize,
  };
}

/**
 * Manage the build background star.
 * @param options - The options used to manage the build background star.
 * @returns The build background star state and callbacks.
 */
function useBuildBackgroundStar(options: BuildBackgroundStarOptions) {
  const { canvasSize, color } = options;
  return useCallback(
    () => buildBackgroundStar(canvasSize.current, color),
    [canvasSize, color],
  );
}
