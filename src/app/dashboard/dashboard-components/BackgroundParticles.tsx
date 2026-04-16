"use client";

import { useCallback, useEffect, useMemo, useRef } from "react";

import {
  useBackgroundCanvasAnimation,
  useBackgroundCanvasWindowEvents,
} from "@/app/dashboard/dashboard-components/background-hooks";
import {
  BACKGROUND_CANVAS_BASELINE_FRAME_MS,
  getBackgroundCanvasScale,
} from "@/app/dashboard/dashboard-components/background-internals";

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

interface ParticlesProps {
  className?: string;
  color?: "dark" | "light";
  ease?: number;
  quantity?: number;
  refresh?: boolean;
  staticity?: number;
}

export default function BackgroundParticles({
  className = "",
  color = "light",
  ease = 50,
  quantity = 30,
  refresh = false,
  staticity = 50,
}: ParticlesProps) {
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

function initializeBackgroundParticleCanvas({
  canvasRef,
  ctxRef,
  initParticles,
  startedAtRef,
}: {
  canvasRef: React.RefObject<HTMLCanvasElement | null>;
  ctxRef: React.RefObject<CanvasRenderingContext2D | null>;
  initParticles: () => void;
  startedAtRef: React.RefObject<number>;
}) {
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

function renderBackgroundParticleCircles({
  circles,
  ctx,
  elapsed,
  height,
  lerpFactor,
  particleRgb,
  pointerOffset,
  staticity,
  width,
}: {
  circles: Circle[];
  ctx: CanvasRenderingContext2D;
  elapsed: number;
  height: number;
  lerpFactor: number;
  particleRgb: string;
  pointerOffset: { x: number; y: number };
  staticity: number;
  width: number;
}) {
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

function renderBackgroundParticleFrame({
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
}: {
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
}) {
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

function rescaleBackgroundParticleOrigins({
  canvasSize,
  circles,
  resizeCanvas,
}: {
  canvasSize: React.RefObject<{ height: number; width: number }>;
  circles: React.RefObject<Circle[]>;
  resizeCanvas: () => void;
}) {
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

function resizeBackgroundParticleCanvas({
  canvasContainerRef,
  canvasRef,
  canvasSize,
  ctxRef,
}: {
  canvasContainerRef: React.RefObject<HTMLDivElement | null>;
  canvasRef: React.RefObject<HTMLCanvasElement | null>;
  canvasSize: React.RefObject<{ height: number; width: number }>;
  ctxRef: React.RefObject<CanvasRenderingContext2D | null>;
}) {
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

function resolveBackgroundParticlePointerOffset({
  canvasRef,
  canvasSize,
  event,
}: {
  canvasRef: React.RefObject<HTMLCanvasElement | null>;
  canvasSize: React.RefObject<{ height: number; width: number }>;
  event: MouseEvent;
}) {
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

function updateBackgroundParticleCircle({
  circle,
  elapsed,
  height,
  lerpFactor,
  pointerOffset,
  staticity,
  width,
}: {
  circle: Circle;
  elapsed: number;
  height: number;
  lerpFactor: number;
  pointerOffset: { x: number; y: number };
  staticity: number;
  width: number;
}) {
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

function useBackgroundParticleCanvasSetup({
  canvasContainerRef,
  canvasRef,
  canvasSize,
  circles,
  ctxRef,
  quantity,
  seedParticles,
  startedAtRef,
}: {
  canvasContainerRef: React.RefObject<HTMLDivElement | null>;
  canvasRef: React.RefObject<HTMLCanvasElement | null>;
  canvasSize: React.RefObject<{ height: number; width: number }>;
  circles: React.RefObject<Circle[]>;
  ctxRef: React.RefObject<CanvasRenderingContext2D | null>;
  quantity: number;
  seedParticles: (count: number, width: number, height: number) => Circle[];
  startedAtRef: React.RefObject<number>;
}) {
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

function useBackgroundParticlePointerHandler({
  canvasRef,
  canvasSize,
  pointerOffsetRef,
}: {
  canvasRef: React.RefObject<HTMLCanvasElement | null>;
  canvasSize: React.RefObject<{ height: number; width: number }>;
  pointerOffsetRef: React.RefObject<{ x: number; y: number }>;
}) {
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

function useBackgroundParticleRenderer({
  canvasSize,
  circles,
  ctxRef,
  ease,
  particleRgb,
  pointerOffsetRef,
  startedAtRef,
  staticity,
}: {
  canvasSize: React.RefObject<{ height: number; width: number }>;
  circles: React.RefObject<Circle[]>;
  ctxRef: React.RefObject<CanvasRenderingContext2D | null>;
  ease: number;
  particleRgb: string;
  pointerOffsetRef: React.RefObject<{ x: number; y: number }>;
  startedAtRef: React.RefObject<number>;
  staticity: number;
}) {
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

function useBackgroundParticlesRuntime({
  color,
  ease,
  quantity,
  staticity,
}: Required<
  Pick<ParticlesProps, "color" | "ease" | "quantity" | "staticity">
>) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const canvasContainerRef = useRef<HTMLDivElement>(null);
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
