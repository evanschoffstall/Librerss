"use client";

import { useCallback, useEffect, useMemo, useRef } from "react";

import { useBackgroundCanvasAnimation } from "../hooks/useBackgroundCanvasAnimation";
import { useBackgroundCanvasWindowEvents } from "../hooks/useBackgroundCanvasWindowEvents";
import {
  BACKGROUND_CANVAS_BASELINE_FRAME_MS,
  getBackgroundCanvasScale,
} from "./background-canvas";

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
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const canvasContainerRef = useRef<HTMLDivElement>(null);
  const circles = useRef<Circle[]>([]);
  const ctxRef = useRef<CanvasRenderingContext2D | null>(null);
  const startedAtRef = useRef<number>(0);
  const canvasSize = useRef<{ height: number; width: number }>({
    height: 0,
    width: 0,
  });
  const pointerOffsetRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });

  const particleRgb = useMemo(
    () => (color === "dark" ? "0, 0, 0" : "255, 255, 255"),
    [color],
  );

  const seedParticles = useCallback(
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

  const resizeCanvas = useCallback(() => {
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
  }, []);

  const initParticles = useCallback(() => {
    resizeCanvas();
    circles.current = seedParticles(
      quantity,
      canvasSize.current.width,
      canvasSize.current.height,
    );
  }, [quantity, resizeCanvas, seedParticles]);

  const onResize = useCallback(() => {
    const oldW = canvasSize.current.width;
    const oldH = canvasSize.current.height;
    resizeCanvas();
    const newW = canvasSize.current.width;
    const newH = canvasSize.current.height;
    if (oldW <= 0 || oldH <= 0) return;

    // Drop particles outside shrunk viewport
    circles.current = circles.current.filter(
      (c) => c.originX < newW && c.originY < newH,
    );

    // Fill newly exposed regions at same density
    const density = quantity / (oldW * oldH);
    const spawn = (
      minX: number,
      minY: number,
      maxX: number,
      maxY: number,
      n: number,
    ) => {
      for (let i = 0; i < n; i++) {
        circles.current.push({
          alphaBase: Math.random() * 0.45 + 0.08,
          alphaPhase: Math.random() * Math.PI * 2,
          driftX: (Math.random() - 0.5) * 0.24,
          driftY: (Math.random() - 0.5) * 0.24,
          originX: Math.random() * (maxX - minX) + minX,
          originY: Math.random() * (maxY - minY) + minY,
          size: Math.random() * 1.9 + 0.2,
          sway: Math.random() * 3.8 + 0.2,
          translateX: 0,
          translateY: 0,
        });
      }
    };
    if (newW > oldW) {
      spawn(
        oldW,
        0,
        newW,
        Math.min(newH, oldH),
        Math.round(density * (newW - oldW) * Math.min(newH, oldH)),
      );
    }
    if (newH > oldH) {
      spawn(0, oldH, newW, newH, Math.round(density * newW * (newH - oldH)));
    }
  }, [quantity, resizeCanvas]);

  const renderFrame = useCallback(
    (now: number, delta: number) => {
      const ctx = ctxRef.current;
      if (!ctx) {
        return;
      }

      const elapsed = (now - startedAtRef.current) / 1000;
      const { height, width } = canvasSize.current;

      // Frame-rate-independent lerp factor matching the stars parallax feel.
      const dtScale =
        delta > 0
          ? Math.min(delta, 100) / BACKGROUND_CANVAS_BASELINE_FRAME_MS
          : 1;
      const lerpFactor = 1 - Math.pow(1 - 1 / ease, dtScale);

      ctx.clearRect(0, 0, width, height);

      for (const circle of circles.current) {
        circle.originX = (circle.originX + circle.driftX + width) % width;
        circle.originY = (circle.originY + circle.driftY + height) % height;

        const wave = Math.sin(elapsed * circle.sway + circle.alphaPhase);
        const alpha = Math.max(
          0.02,
          Math.min(0.75, circle.alphaBase + wave * 0.08),
        );

        // Target offset uses the same depth formula as BackgroundStars so
        // both layers move with the same luxurious momentum.
        const magnetism = 0.1 + circle.sway * 4;
        const targetX =
          (pointerOffsetRef.current.x / (staticity / magnetism)) * 0.3;
        const targetY =
          (pointerOffsetRef.current.y / (staticity / magnetism)) * 0.3;

        circle.translateX += (targetX - circle.translateX) * lerpFactor;
        circle.translateY += (targetY - circle.translateY) * lerpFactor;

        const drawX = circle.originX + circle.translateX;
        const drawY = circle.originY + circle.translateY;

        ctx.beginPath();
        ctx.arc(drawX, drawY, circle.size, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(${particleRgb}, ${alpha})`;
        ctx.fill();
      }
    },
    [ease, particleRgb, staticity],
  );

  const handleMouseMove = useCallback((event: MouseEvent) => {
    const canvas = canvasRef.current;
    if (!canvas) {
      return;
    }

    const rect = canvas.getBoundingClientRect();
    const halfW = canvasSize.current.width / 2;
    const halfH = canvasSize.current.height / 2;
    const localX = event.clientX - rect.left - halfW;
    const localY = event.clientY - rect.top - halfH;
    const inside =
      localX < halfW && localX > -halfW && localY < halfH && localY > -halfH;
    pointerOffsetRef.current = inside
      ? { x: localX, y: localY }
      : { x: 0, y: 0 };
  }, []);

  useEffect(() => {
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
  }, [initParticles, onResize]);

  useBackgroundCanvasWindowEvents({ onMouseMove: handleMouseMove, onResize });

  useBackgroundCanvasAnimation({
    onFrame: renderFrame,
    onResume: useCallback(() => {
      startedAtRef.current = performance.now();
    }, []),
  });

  useEffect(() => {
    if (refresh) {
      initParticles();
    }
  }, [refresh, initParticles]);

  return (
    <div aria-hidden="true" className={className} ref={canvasContainerRef}>
      <canvas ref={canvasRef} />
    </div>
  );
}
