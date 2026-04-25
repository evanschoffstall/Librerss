"use client";

import { useCallback, useEffect, useMemo, useRef } from "react";

import {
  useBackgroundCanvasAnimation,
  useBackgroundCanvasRefs,
  useBackgroundCanvasWindowEvents,
} from "@/app/dashboard/dashboard-components/background-hooks";
import {
  BACKGROUND_CANVAS_BASELINE_FRAME_MS,
  getBackgroundCanvasScale,
} from "@/app/dashboard/dashboard-components/background-internals";

/**
 * Manage the background particle canvas setup.
 * @param options - The options used to manage the background particle canvas setup.
 * @returns The background particle canvas setup state and callbacks.
 */
interface BackgroundParticleCanvasSetupOptions {
  canvasContainerRef: React.RefObject<HTMLDivElement | null>;
  canvasRef: React.RefObject<HTMLCanvasElement | null>;
  canvasSize: React.RefObject<{ height: number; width: number }>;
  circles: React.RefObject<Circle[]>;
  ctxRef: React.RefObject<CanvasRenderingContext2D | null>;
  quantity: number;
  seedParticles: (count: number, width: number, height: number) => Circle[];
  startedAtRef: React.RefObject<number>;
}

/**
 * Update the background particle circle.
 * @param options - The options used to update the background particle circle.
 * @returns The background particle circle.
 */
interface BackgroundParticleCircleOptions {
  circle: Circle;
  elapsed: number;
  height: number;
  lerpFactor: number;
  pointerOffset: { x: number; y: number };
  staticity: number;
  width: number;
}

/**
 * Render the background particle circles.
 * @param options - The options used to render the background particle circles.
 */
interface BackgroundParticleCirclesOptions {
  circles: Circle[];
  ctx: CanvasRenderingContext2D;
  elapsed: number;
  height: number;
  lerpFactor: number;
  particleRgb: string;
  pointerOffset: { x: number; y: number };
  staticity: number;
  width: number;
}

/**
 * Render the background particle frame.
 * @param options - The options used to render the background particle frame.
 */
interface BackgroundParticleFrameOptions {
  canvasSize: React.RefObject<{ height: number; width: number }>;
  circles: React.RefObject<Circle[]>;
  ctxRef: React.RefObject<CanvasRenderingContext2D | null>;
  delta: number;
  ease: number;
  now: number;
  particleRgb: string;
  pointerOffsetRef: React.RefObject<{ x: number; y: number }>;
  startedAtRef: React.RefObject<number>;
  staticity: number;
}

/**
 * Manage the background particle pointer handler.
 * @param options - The options used to manage the background particle pointer handler.
 * @returns The background particle pointer handler state and callbacks.
 */
interface BackgroundParticlePointerHandlerOptions {
  canvasRef: React.RefObject<HTMLCanvasElement | null>;
  canvasSize: React.RefObject<{ height: number; width: number }>;
  pointerOffsetRef: React.RefObject<{ x: number; y: number }>;
}

/**
 * Resolve the background particle pointer offset.
 * @param options - The options used to resolve the background particle pointer offset.
 * @returns The background particle pointer offset.
 */
interface BackgroundParticlePointerOffsetOptions {
  canvasRef: React.RefObject<HTMLCanvasElement | null>;
  canvasSize: React.RefObject<{ height: number; width: number }>;
  event: MouseEvent;
}

/**
 * Manage the background particle renderer.
 * @param options - The options used to manage the background particle renderer.
 * @returns The background particle renderer state and callbacks.
 */
interface BackgroundParticleRendererOptions {
  canvasSize: React.RefObject<{ height: number; width: number }>;
  circles: React.RefObject<Circle[]>;
  ctxRef: React.RefObject<CanvasRenderingContext2D | null>;
  ease: number;
  particleRgb: string;
  pointerOffsetRef: React.RefObject<{ x: number; y: number }>;
  startedAtRef: React.RefObject<number>;
  staticity: number;
}

interface Circle {
  alphaBase: number;
  alphaPhase: number;
  driftX: number;
  driftY: number;
  originX: number;
  originY: number;
  size: number;
  sway: number;
  translateX: number;
  translateY: number;
}

interface InitializeBackgroundParticleCanvasOptions {
  canvasRef: React.RefObject<HTMLCanvasElement | null>;
  ctxRef: React.RefObject<CanvasRenderingContext2D | null>;
  initParticles: () => void;
  startedAtRef: React.RefObject<number>;
}

interface ParticlesProps {
  className?: string;
  color?: "dark" | "light";
  ease?: number;
  quantity?: number;
  refresh?: boolean;
  staticity?: number;
}

/**
 * Process the rescale background particle origins.
 * @param options - The options used to process the rescale background particle origins.
 */
interface RescaleBackgroundParticleOriginsOptions {
  canvasSize: React.RefObject<{ height: number; width: number }>;
  circles: React.RefObject<Circle[]>;
  resizeCanvas: () => void;
}

/**
 * Process the resize background particle canvas.
 * @param options - The options used to process the resize background particle canvas.
 */
interface ResizeBackgroundParticleCanvasOptions {
  canvasContainerRef: React.RefObject<HTMLDivElement | null>;
  canvasRef: React.RefObject<HTMLCanvasElement | null>;
  canvasSize: React.RefObject<{ height: number; width: number }>;
  ctxRef: React.RefObject<CanvasRenderingContext2D | null>;
}

/**
 * Render the background particles component.
 * @param props - The component props.
 * @returns The rendered background particles component.
 */
export default function BackgroundParticles(props: ParticlesProps) {
  const {
    className = "",
    color = "light",
    ease = 50,
    quantity = 30,
    refresh = false,
    staticity = 50,
  } = props;
  const runtime = useBackgroundParticlesRuntime({
    color,
    ease,
    quantity,
    staticity,
  });

  useEffect(() => {
    initializeBackgroundParticleCanvas({
      canvasRef: runtime.canvasRef,
      ctxRef: runtime.ctxRef,
      initParticles: runtime.initParticles,
      startedAtRef: runtime.startedAtRef,
    });
  }, [runtime]);

  useBackgroundCanvasWindowEvents({
    onMouseMove: runtime.handleMouseMove,
    onResize: runtime.onResize,
  });

  useBackgroundCanvasAnimation({
    onFrame: runtime.renderFrame,
    onResume: useCallback(() => {
      runtime.startedAtRef.current = performance.now();
    }, [runtime]),
  });

  useEffect(() => {
    if (refresh) {
      runtime.initParticles();
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
 * Draw the background particle circle.
 * @param ctx - The canvas rendering context.
 * @param circle - The circle.
 * @param particleRgb - The particle rgb.
 * @param alpha - The alpha.
 */
function drawBackgroundParticleCircle(
  ctx: CanvasRenderingContext2D,
  circle: Circle,
  particleRgb: string,
  alpha: number,
) {
  ctx.beginPath();
  ctx.arc(
    circle.originX + circle.translateX,
    circle.originY + circle.translateY,
    circle.size,
    0,
    Math.PI * 2,
  );
  ctx.fillStyle = `rgba(${particleRgb}, ${alpha})`;
  ctx.fill();
}

/**
 * Initialize the background particle canvas.
 * @param options - The options used to initialize the background particle canvas.
 */
function initializeBackgroundParticleCanvas(
  options: InitializeBackgroundParticleCanvasOptions,
) {
  const { canvasRef, ctxRef, initParticles, startedAtRef } = options;
  const canvas = canvasRef.current;
  if (!canvas) {
    return;
  }

  const context = canvas.getContext("2d");
  if (!context) {
    return;
  }

  ctxRef.current = context;
  startedAtRef.current = performance.now();
  initParticles();
}

/**
 * Render the background particle circles.
 * @param options - The options used to render the background particle circles.
 */
function renderBackgroundParticleCircles(
  options: BackgroundParticleCirclesOptions,
) {
  const {
    circles,
    ctx,
    elapsed,
    height,
    lerpFactor,
    particleRgb,
    pointerOffset,
    staticity,
    width,
  } = options;
  for (const circle of circles) {
    const alpha = updateBackgroundParticleCircle({
      circle,
      elapsed,
      height,
      lerpFactor,
      pointerOffset,
      staticity,
      width,
    });
    drawBackgroundParticleCircle(ctx, circle, particleRgb, alpha);
  }
}

/**
 * Render the background particle frame.
 * @param options - The options used to render the background particle frame.
 */
function renderBackgroundParticleFrame(
  options: BackgroundParticleFrameOptions,
) {
  const {
    canvasSize,
    circles,
    ctxRef,
    delta,
    ease,
    now,
    particleRgb,
    pointerOffsetRef,
    startedAtRef,
    staticity,
  } = options;
  const ctx = ctxRef.current;
  if (!ctx) {
    return;
  }

  const elapsed = (now - startedAtRef.current) / 1000;
  const { height, width } = canvasSize.current;
  const dtScale =
    delta > 0 ? Math.min(delta, 100) / BACKGROUND_CANVAS_BASELINE_FRAME_MS : 1;
  const lerpFactor = 1 - Math.pow(1 - 1 / ease, dtScale);
  ctx.clearRect(0, 0, width, height);

  renderBackgroundParticleCircles({
    circles: circles.current,
    ctx,
    elapsed,
    height,
    lerpFactor,
    particleRgb,
    pointerOffset: pointerOffsetRef.current,
    staticity,
    width,
  });
}

/**
 * Process the rescale background particle origins.
 * @param options - The options used to process the rescale background particle origins.
 */
function rescaleBackgroundParticleOrigins(
  options: RescaleBackgroundParticleOriginsOptions,
) {
  const { canvasSize, circles, resizeCanvas } = options;
  const oldW = canvasSize.current.width;
  const oldH = canvasSize.current.height;
  resizeCanvas();
  const newW = canvasSize.current.width;
  const newH = canvasSize.current.height;
  if (oldW <= 0 || oldH <= 0) return;

  const scaleX = newW / oldW;
  const scaleY = newH / oldH;
  for (const circle of circles.current) {
    circle.originX *= scaleX;
    circle.originY *= scaleY;
  }
}

/**
 * Process the resize background particle canvas.
 * @param options - The options used to process the resize background particle canvas.
 */
function resizeBackgroundParticleCanvas(
  options: ResizeBackgroundParticleCanvasOptions,
) {
  const { canvasContainerRef, canvasRef, canvasSize, ctxRef } = options;
  const canvas = canvasRef.current;
  const container = canvasContainerRef.current;
  const ctx = ctxRef.current;
  if (!canvas || !container || !ctx) return;

  const dpr = getBackgroundCanvasScale(window.devicePixelRatio);
  const width = container.offsetWidth;
  const height = container.offsetHeight;
  canvasSize.current = { height, width };
  canvas.width = Math.floor(width * dpr);
  canvas.height = Math.floor(height * dpr);
  canvas.style.width = `${width}px`;
  canvas.style.height = `${height}px`;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
}

/**
 * Resolve the background particle pointer offset.
 * @param options - The options used to resolve the background particle pointer offset.
 * @returns The background particle pointer offset.
 */
function resolveBackgroundParticlePointerOffset(
  options: BackgroundParticlePointerOffsetOptions,
) {
  const { canvasRef, canvasSize, event } = options;
  const canvas = canvasRef.current;
  if (!canvas) {
    return { x: 0, y: 0 };
  }

  const rect = canvas.getBoundingClientRect();
  const halfW = canvasSize.current.width / 2;
  const halfH = canvasSize.current.height / 2;
  const localX = event.clientX - rect.left - halfW;
  const localY = event.clientY - rect.top - halfH;
  const inside =
    localX < halfW && localX > -halfW && localY < halfH && localY > -halfH;
  return inside ? { x: localX, y: localY } : { x: 0, y: 0 };
}

/**
 * Update the background particle circle.
 * @param options - The options used to update the background particle circle.
 * @returns The background particle circle.
 */
function updateBackgroundParticleCircle(
  options: BackgroundParticleCircleOptions,
) {
  const {
    circle,
    elapsed,
    height,
    lerpFactor,
    pointerOffset,
    staticity,
    width,
  } = options;
  circle.originX = (circle.originX + circle.driftX + width) % width;
  circle.originY = (circle.originY + circle.driftY + height) % height;
  const wave = Math.sin(elapsed * circle.sway + circle.alphaPhase);
  const magnetism = 0.1 + circle.sway * 4;
  const targetX = (pointerOffset.x / (staticity / magnetism)) * 0.3;
  const targetY = (pointerOffset.y / (staticity / magnetism)) * 0.3;
  circle.translateX += (targetX - circle.translateX) * lerpFactor;
  circle.translateY += (targetY - circle.translateY) * lerpFactor;

  return Math.max(0.02, Math.min(0.75, circle.alphaBase + wave * 0.08));
}

/**
 * Manage the background particle canvas setup.
 * @param options - The options used to manage the background particle canvas setup.
 * @returns The background particle canvas setup state and callbacks.
 */
function useBackgroundParticleCanvasSetup(
  options: BackgroundParticleCanvasSetupOptions,
) {
  const {
    canvasContainerRef,
    canvasRef,
    canvasSize,
    circles,
    ctxRef,
    quantity,
    seedParticles,
    startedAtRef,
  } = options;
  const resizeCanvas = useCallback(() => {
    resizeBackgroundParticleCanvas({
      canvasContainerRef,
      canvasRef,
      canvasSize,
      ctxRef,
    });
  }, [canvasContainerRef, canvasRef, canvasSize, ctxRef]);
  const initParticles = useCallback(() => {
    resizeCanvas();
    circles.current = seedParticles(
      quantity,
      canvasSize.current.width,
      canvasSize.current.height,
    );
    startedAtRef.current = performance.now();
  }, [
    canvasSize,
    circles,
    quantity,
    resizeCanvas,
    seedParticles,
    startedAtRef,
  ]);
  const onResize = useCallback(() => {
    rescaleBackgroundParticleOrigins({ canvasSize, circles, resizeCanvas });
  }, [canvasSize, circles, resizeCanvas]);

  return { initParticles, onResize };
}

/**
 * Manage the background particle pointer handler.
 * @param options - The options used to manage the background particle pointer handler.
 * @returns The background particle pointer handler state and callbacks.
 */
function useBackgroundParticlePointerHandler(
  options: BackgroundParticlePointerHandlerOptions,
) {
  const { canvasRef, canvasSize, pointerOffsetRef } = options;
  return useCallback(
    (event: MouseEvent) => {
      pointerOffsetRef.current = resolveBackgroundParticlePointerOffset({
        canvasRef,
        canvasSize,
        event,
      });
    },
    [canvasRef, canvasSize, pointerOffsetRef],
  );
}

/**
 * Manage the background particle renderer.
 * @param options - The options used to manage the background particle renderer.
 * @returns The background particle renderer state and callbacks.
 */
function useBackgroundParticleRenderer(
  options: BackgroundParticleRendererOptions,
) {
  const {
    canvasSize,
    circles,
    ctxRef,
    ease,
    particleRgb,
    pointerOffsetRef,
    startedAtRef,
    staticity,
  } = options;
  return useCallback(
    (now: number, delta: number) => {
      renderBackgroundParticleFrame({
        canvasSize,
        circles,
        ctxRef,
        delta,
        ease,
        now,
        particleRgb,
        pointerOffsetRef,
        startedAtRef,
        staticity,
      });
    },
    [
      canvasSize,
      circles,
      ctxRef,
      ease,
      particleRgb,
      pointerOffsetRef,
      startedAtRef,
      staticity,
    ],
  );
}

/**
 * Manage the background particles runtime.
 * @param options - The options used to manage the background particles runtime.
 * @returns The background particles runtime state and callbacks.
 */
function useBackgroundParticlesRuntime(
  options: Required<
    Pick<ParticlesProps, "color" | "ease" | "quantity" | "staticity">
  >,
) {
  const { color, ease, quantity, staticity } = options;
  const { canvasContainerRef, canvasRef } = useBackgroundCanvasRefs();
  const circles = useRef<Circle[]>([]);
  const ctxRef = useRef<CanvasRenderingContext2D | null>(null);
  const startedAtRef = useRef(0);
  const canvasSize = useRef({ height: 0, width: 0 });
  const pointerOffsetRef = useRef({ x: 0, y: 0 });
  const particleRgb = useMemo(
    () => (color === "dark" ? "0, 0, 0" : "255, 255, 255"),
    [color],
  );
  const seedParticles = useSeedParticles();
  const { initParticles, onResize } = useBackgroundParticleCanvasSetup({
    canvasContainerRef,
    canvasRef,
    canvasSize,
    circles,
    ctxRef,
    quantity,
    seedParticles,
    startedAtRef,
  });
  const renderFrame = useBackgroundParticleRenderer({
    canvasSize,
    circles,
    ctxRef,
    ease,
    particleRgb,
    pointerOffsetRef,
    startedAtRef,
    staticity,
  });
  const handleMouseMove = useBackgroundParticlePointerHandler({
    canvasRef,
    canvasSize,
    pointerOffsetRef,
  });

  return {
    canvasContainerRef,
    canvasRef,
    ctxRef,
    handleMouseMove,
    initParticles,
    onResize,
    renderFrame,
    startedAtRef,
  };
}

/**
 * Manage the seed particles.
 * @returns The seed particles state and callbacks.
 */
function useSeedParticles() {
  return useCallback(
    (count: number, width: number, height: number): Circle[] =>
      Array.from({ length: count }, () => ({
        alphaBase: Math.random() * 0.45 + 0.08,
        alphaPhase: Math.random() * Math.PI * 2,
        driftX: (Math.random() - 0.5) * 0.24,
        driftY: (Math.random() - 0.5) * 0.24,
        originX: Math.random() * width,
        originY: Math.random() * height,
        size: Math.random() * 1.9 + 0.2,
        sway: Math.random() * 3.8 + 0.2,
        translateX: 0,
        translateY: 0,
      })),
    [],
  );
}
