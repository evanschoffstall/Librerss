"use client";

import { useCallback, useEffect, useRef } from "react";

import type { Star } from "@/app/dashboard/dashboard-components/BackgroundStars.scene";

import {
  useBackgroundCanvasAnimation,
  useBackgroundCanvasWindowEvents,
} from "@/app/dashboard/dashboard-components/background-hooks";
import {
  BACKGROUND_CANVAS_BASELINE_FRAME_MS,
  getBackgroundCanvasScale,
} from "@/app/dashboard/dashboard-components/background-internals";
import {
  buildBackgroundStar,
  drawBackgroundStar,
  resolveBackgroundStarPointerOffset,
  updateBackgroundStar as updateSceneBackgroundStar,
} from "@/app/dashboard/dashboard-components/BackgroundStars.scene";

interface StarsProps {
  className?: string;
  color?: "dark" | "light";
  ease?: number;
  quantity?: number;
  refresh?: boolean;
  staticity?: number;
}

/**
 * @param root0
 * @param root0.className
 * @param root0.color
 * @param root0.ease
 * @param root0.quantity
 * @param root0.refresh
 * @param root0.staticity
 */
export default function BackgroundStars({
  className = "",
  color = "light",
  ease = 50,
  quantity = 30,
  refresh = false,
  staticity = 50,
}: StarsProps) {
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
 * @param root0
 * @param root0.contextRef
 * @param root0.height
 * @param root0.stars
 * @param root0.width
 */
function drawBackgroundStars({
  contextRef,
  height,
  stars,
  width,
}: {
  contextRef: React.RefObject<CanvasRenderingContext2D | null>;
  height: number;
  stars: Star[];
  width: number;
}) {
  const context = contextRef.current;
  if (!context) {
    return;
  }

  context.clearRect(0, 0, width, height);
  for (const star of stars) {
    drawBackgroundStar(context, star);
  }
}

/**
 * @param root0
 * @param root0.canvasRef
 * @param root0.contextRef
 * @param root0.initStars
 */
function initializeBackgroundStarCanvas({
  canvasRef,
  contextRef,
  initStars,
}: {
  canvasRef: React.RefObject<HTMLCanvasElement | null>;
  contextRef: React.RefObject<CanvasRenderingContext2D | null>;
  initStars: () => void;
}) {
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
 * @param root0
 * @param root0.canvasSize
 * @param root0.contextRef
 * @param root0.delta
 * @param root0.drawStar
 * @param root0.ease
 * @param root0.mouseRef
 * @param root0.starsRef
 * @param root0.staticity
 */
function renderBackgroundStarsFrame({
  canvasSize,
  contextRef,
  delta,
  drawStar,
  ease,
  mouseRef,
  starsRef,
  staticity,
}: {
  canvasSize: React.RefObject<{ h: number; w: number }>;
  contextRef: React.RefObject<CanvasRenderingContext2D | null>;
  delta: number;
  drawStar: typeof drawBackgroundStar;
  ease: number;
  mouseRef: React.RefObject<{ x: number; y: number }>;
  starsRef: React.RefObject<Star[]>;
  staticity: number;
}) {
  const context = contextRef.current;
  if (!context) {
    return;
  }

  context.clearRect(0, 0, canvasSize.current.w, canvasSize.current.h);
  const dtScale =
    delta > 0 ? Math.min(delta, 100) / BACKGROUND_CANVAS_BASELINE_FRAME_MS : 1;
  const lerpFactor = 1 - Math.pow(1 - 1 / ease, dtScale);

  for (const star of starsRef.current) {
    updateSceneBackgroundStar(star, lerpFactor, mouseRef.current, staticity);
    drawStar(context, star);
  }
}

/**
 * @param root0
 * @param root0.canvasSize
 * @param root0.resizeCanvas
 * @param root0.starsRef
 */
function rescaleBackgroundStarPositions({
  canvasSize,
  resizeCanvas,
  starsRef,
}: {
  canvasSize: React.RefObject<{ h: number; w: number }>;
  resizeCanvas: () => void;
  starsRef: React.RefObject<Star[]>;
}) {
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
 * @param root0
 * @param root0.canvasContainerRef
 * @param root0.canvasRef
 * @param root0.canvasSize
 * @param root0.contextRef
 */
function resizeBackgroundStarCanvas({
  canvasContainerRef,
  canvasRef,
  canvasSize,
  contextRef,
}: {
  canvasContainerRef: React.RefObject<HTMLDivElement | null>;
  canvasRef: React.RefObject<HTMLCanvasElement | null>;
  canvasSize: React.RefObject<{ h: number; w: number }>;
  contextRef: React.RefObject<CanvasRenderingContext2D | null>;
}) {
  const canvas = canvasRef.current;
  const container = canvasContainerRef.current;
  const context = contextRef.current;
  if (!canvas || !container || !context) {
    return;
  }

  const dpr = getBackgroundCanvasScale(window.devicePixelRatio);
  const width = container.offsetWidth;
  const height = container.offsetHeight;
  canvasSize.current = { h: height, w: width };
  canvas.width = width * dpr;
  canvas.height = height * dpr;
  canvas.style.width = `${width}px`;
  canvas.style.height = `${height}px`;
  context.setTransform(dpr, 0, 0, dpr, 0, 0);
}

/**
 * @param root0
 * @param root0.buildStar
 * @param root0.canvasContainerRef
 * @param root0.canvasRef
 * @param root0.canvasSize
 * @param root0.contextRef
 * @param root0.quantity
 * @param root0.starsRef
 */
function useBackgroundStarCanvasSetup({
  buildStar,
  canvasContainerRef,
  canvasRef,
  canvasSize,
  contextRef,
  quantity,
  starsRef,
}: {
  buildStar: () => Star;
  canvasContainerRef: React.RefObject<HTMLDivElement | null>;
  canvasRef: React.RefObject<HTMLCanvasElement | null>;
  canvasSize: React.RefObject<{ h: number; w: number }>;
  contextRef: React.RefObject<CanvasRenderingContext2D | null>;
  quantity: number;
  starsRef: React.RefObject<Star[]>;
}) {
  const resizeCanvas = useCallback(() => {
    resizeBackgroundStarCanvas({
      canvasContainerRef,
      canvasRef,
      canvasSize,
      contextRef,
    });
  }, [canvasContainerRef, canvasRef, canvasSize, contextRef]);
  const initStars = useCallback(() => {
    resizeCanvas();
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
 * @param root0
 * @param root0.canvasRef
 * @param root0.canvasSize
 * @param root0.mouseRef
 */
function useBackgroundStarPointerHandler({
  canvasRef,
  canvasSize,
  mouseRef,
}: {
  canvasRef: React.RefObject<HTMLCanvasElement | null>;
  canvasSize: React.RefObject<{ h: number; w: number }>;
  mouseRef: React.RefObject<{ x: number; y: number }>;
}) {
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
 * @param root0
 * @param root0.canvasSize
 * @param root0.contextRef
 * @param root0.drawStar
 * @param root0.ease
 * @param root0.mouseRef
 * @param root0.starsRef
 * @param root0.staticity
 */
function useBackgroundStarRenderer({
  canvasSize,
  contextRef,
  drawStar,
  ease,
  mouseRef,
  starsRef,
  staticity,
}: {
  canvasSize: React.RefObject<{ h: number; w: number }>;
  contextRef: React.RefObject<CanvasRenderingContext2D | null>;
  drawStar: typeof drawBackgroundStar;
  ease: number;
  mouseRef: React.RefObject<{ x: number; y: number }>;
  starsRef: React.RefObject<Star[]>;
  staticity: number;
}) {
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
}

/**
 * @param root0
 * @param root0.color
 * @param root0.ease
 * @param root0.quantity
 * @param root0.staticity
 */
function useBackgroundStarsRuntime({
  color,
  ease,
  quantity,
  staticity,
}: Required<Pick<StarsProps, "color" | "ease" | "quantity" | "staticity">>) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const canvasContainerRef = useRef<HTMLDivElement>(null);
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
 * @param root0
 * @param root0.canvasSize
 * @param root0.color
 */
function useBuildBackgroundStar({
  canvasSize,
  color,
}: {
  canvasSize: React.RefObject<{ h: number; w: number }>;
  color: "dark" | "light";
}) {
  return useCallback(
    () => buildBackgroundStar(canvasSize.current, color),
    [canvasSize, color],
  );
}
