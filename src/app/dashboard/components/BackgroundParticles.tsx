"use client";

import { useEffect, useMemo, useRef } from "react";
import { useMousePosition } from "../hooks/useMousePosition";

interface ParticlesProps {
  className?: string;
  quantity?: number;
  staticity?: number;
  ease?: number;
  refresh?: boolean;
  color?: "light" | "dark";
}

type Circle = {
  originX: number;
  originY: number;
  size: number;
  alphaBase: number;
  alphaPhase: number;
  driftX: number;
  driftY: number;
  sway: number;
};

export default function BackgroundParticles({
  className = "",
  quantity = 30,
  staticity = 50,
  ease = 50,
  refresh = false,
  color = "light",
}: ParticlesProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const canvasContainerRef = useRef<HTMLDivElement>(null);
  const circles = useRef<Circle[]>([]);
  const ctxRef = useRef<CanvasRenderingContext2D | null>(null);
  const frameRef = useRef<number | null>(null);
  const startedAtRef = useRef<number>(0);
  const mousePosition = useMousePosition();
  const canvasSize = useRef<{ width: number; height: number }>({
    width: 0,
    height: 0,
  });
  const pointerOffsetRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });

  const particleRgb = useMemo(
    () => (color === "dark" ? "0, 0, 0" : "255, 255, 255"),
    [color],
  );

  const seedParticles = (count: number, width: number, height: number): Circle[] =>
    Array.from({ length: count }, () => ({
      originX: Math.random() * width,
      originY: Math.random() * height,
      size: Math.random() * 1.9 + 0.2,
      alphaBase: Math.random() * 0.45 + 0.08,
      alphaPhase: Math.random() * Math.PI * 2,
      driftX: (Math.random() - 0.5) * 0.24,
      driftY: (Math.random() - 0.5) * 0.24,
      sway: Math.random() * 3.8 + 0.2,
    }));

  const resizeAndReseed = () => {
    const canvas = canvasRef.current;
    const container = canvasContainerRef.current;
    const ctx = ctxRef.current;
    if (!canvas || !container || !ctx) {
      return;
    }

    const dpr = window.devicePixelRatio || 1;
    const width = container.offsetWidth;
    const height = container.offsetHeight;

    canvasSize.current = { width, height };
    canvas.width = Math.floor(width * dpr);
    canvas.height = Math.floor(height * dpr);
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    circles.current = seedParticles(quantity, width, height);
  };

  const renderFrame = (now: number) => {
    const ctx = ctxRef.current;
    if (!ctx) {
      return;
    }

    const elapsed = (now - startedAtRef.current) / 1000;
    const { width, height } = canvasSize.current;
    const swayScale = staticity <= 0 ? 0 : 1 / staticity;

    ctx.clearRect(0, 0, width, height);

    for (const circle of circles.current) {
      circle.originX = (circle.originX + circle.driftX + width) % width;
      circle.originY = (circle.originY + circle.driftY + height) % height;

      const wave = Math.sin(elapsed * circle.sway + circle.alphaPhase);
      const alpha = Math.max(0.02, Math.min(0.75, circle.alphaBase + wave * 0.08));

      const parallaxX =
        pointerOffsetRef.current.x * swayScale * (circle.sway / Math.max(1, ease));
      const parallaxY =
        pointerOffsetRef.current.y * swayScale * (circle.sway / Math.max(1, ease));

      const drawX = circle.originX + parallaxX;
      const drawY = circle.originY + parallaxY;

      ctx.beginPath();
      ctx.arc(drawX, drawY, circle.size, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(${particleRgb}, ${alpha})`;
      ctx.fill();
    }

    frameRef.current = window.requestAnimationFrame(renderFrame);
  };

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
    resizeAndReseed();

    frameRef.current = window.requestAnimationFrame(renderFrame);

    const onResize = () => resizeAndReseed();
    window.addEventListener("resize", onResize);

    return () => {
      if (frameRef.current !== null) {
        window.cancelAnimationFrame(frameRef.current);
      }
      frameRef.current = null;
      window.removeEventListener("resize", onResize);
    };
  }, [ease, particleRgb, quantity, staticity]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) {
      return;
    }

    const rect = canvas.getBoundingClientRect();
    const halfW = canvasSize.current.width / 2;
    const halfH = canvasSize.current.height / 2;
    const localX = mousePosition.x - rect.left - halfW;
    const localY = mousePosition.y - rect.top - halfH;
    const pointerInside =
      localX < halfW && localX > -halfW && localY < halfH && localY > -halfH;

    pointerOffsetRef.current = pointerInside ? { x: localX, y: localY } : { x: 0, y: 0 };
  }, [mousePosition.x, mousePosition.y]);

  useEffect(() => {
    if (refresh) {
      resizeAndReseed();
    }
  }, [quantity, refresh]);

  return (
    <div className={className} ref={canvasContainerRef} aria-hidden="true">
      <canvas ref={canvasRef} />
    </div>
  );
}
