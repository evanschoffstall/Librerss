"use client";

import { useCallback, useEffect, useRef } from "react";

interface StarsProps {
  className?: string;
  quantity?: number;
  staticity?: number;
  ease?: number;
  color?: "light" | "dark";
  refresh?: boolean;
}

type Star = {
  x: number;
  y: number;
  translateX: number;
  translateY: number;
  size: number;
  alpha: number;
  minAlpha: number;
  maxAlpha: number;
  speed: number;
  magnetism: number;
  colorRgb: string;
  glowStrength: number;
  mode: "steady" | "twinkle" | "fade";
  direction: 1 | -1;
};

const TWINKLE_MAX_SPEED = 0.003;
const TWINKLE_MIN_SPEED = 0.0012;
const FADE_MAX_SPEED = 0.0014;
const FADE_MIN_SPEED = 0.0006;

export default function BackgroundStars({
  className = "",
  quantity = 30,
  staticity = 50,
  ease = 50,
  color = "light",
  refresh = false,
}: StarsProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const canvasContainerRef = useRef<HTMLDivElement>(null);
  const context = useRef<CanvasRenderingContext2D | null>(null);
  const stars = useRef<Star[]>([]);
  const mouse = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  const canvasSize = useRef<{ w: number; h: number }>({ w: 0, h: 0 });

  const clearContext = useCallback(() => {
    if (!context.current) {
      return;
    }

    context.current.clearRect(0, 0, canvasSize.current.w, canvasSize.current.h);
  }, []);

  const starParams = useCallback((): Star => {
    const x = Math.floor(Math.random() * canvasSize.current.w);
    const y = Math.floor(Math.random() * canvasSize.current.h);
    const randomBehavior = Math.random();
    const mode: Star["mode"] =
      randomBehavior < 0.55
        ? "steady"
        : randomBehavior < 0.85
          ? "twinkle"
          : "fade";

    const brightnessRoll = Math.random();
    const isDimStar = brightnessRoll < 0.55;
    const isBrightStar = brightnessRoll > 0.9;

    const size = isDimStar
      ? Math.random() * 0.8 + 0.12
      : isBrightStar
        ? Math.random() * 1.4 + 1.1
        : Math.random() * 1 + 0.45;

    const minAlpha =
      mode === "fade"
        ? 0
        : isDimStar
          ? parseFloat((Math.random() * 0.08 + 0.02).toFixed(2))
          : isBrightStar
            ? parseFloat((Math.random() * 0.12 + 0.12).toFixed(2))
            : parseFloat((Math.random() * 0.1 + 0.07).toFixed(2));

    const maxAlpha = isDimStar
      ? parseFloat((Math.random() * 0.2 + 0.18).toFixed(2))
      : isBrightStar
        ? parseFloat((Math.random() * 0.22 + 0.58).toFixed(2))
        : parseFloat((Math.random() * 0.22 + 0.36).toFixed(2));

    const darkSkyColorRoll = Math.random();
    const colorRgb =
      color === "light"
        ? darkSkyColorRoll < 0.7
          ? "255, 255, 255"
          : darkSkyColorRoll < 0.85
            ? "236, 242, 255"
            : "255, 245, 224"
        : isBrightStar
          ? "25, 25, 25"
          : "35, 35, 35";

    return {
      x,
      y,
      translateX: 0,
      translateY: 0,
      size,
      alpha:
        mode === "steady"
          ? maxAlpha
          : parseFloat(
              (Math.random() * (maxAlpha - minAlpha) + minAlpha).toFixed(2),
            ),
      minAlpha,
      maxAlpha,
      speed:
        mode === "twinkle"
          ? Math.random() * (TWINKLE_MAX_SPEED - TWINKLE_MIN_SPEED) +
            TWINKLE_MIN_SPEED
          : mode === "fade"
            ? Math.random() * (FADE_MAX_SPEED - FADE_MIN_SPEED) + FADE_MIN_SPEED
            : 0,
      magnetism: 0.1 + Math.random() * 4,
      colorRgb,
      glowStrength: isBrightStar ? 0.28 : isDimStar ? 0.1 : 0.18,
      mode,
      direction: Math.random() > 0.5 ? 1 : -1,
    };
  }, [color]);

  const drawStar = useCallback((star: Star, update = false) => {
    if (!context.current) {
      return;
    }

    const ctx = context.current;
    const glowRadius = star.size * 4.2;

    ctx.save();
    ctx.translate(star.translateX, star.translateY);

    // Gradient must be created after translate so its coordinates are in the
    // same space as the arc — otherwise the glow center drifts from the dot
    // under mouse parallax, producing degenerate gradient artifacts (red flash).
    const glowGradient = ctx.createRadialGradient(
      star.x,
      star.y,
      0,
      star.x,
      star.y,
      glowRadius,
    );
    glowGradient.addColorStop(
      0,
      `rgba(${star.colorRgb}, ${Math.min(star.alpha * star.glowStrength, 0.35)})`,
    );
    glowGradient.addColorStop(1, `rgba(${star.colorRgb}, 0)`);

    ctx.beginPath();
    ctx.arc(star.x, star.y, glowRadius, 0, 2 * Math.PI);
    ctx.fillStyle = glowGradient;
    ctx.fill();
    ctx.beginPath();
    ctx.arc(star.x, star.y, star.size, 0, 2 * Math.PI);
    ctx.fillStyle = `rgba(${star.colorRgb}, ${star.alpha})`;
    ctx.fill();

    ctx.restore();

    if (!update) {
      stars.current.push(star);
    }
  }, []);

  const drawStars = useCallback(() => {
    clearContext();
    stars.current.length = 0;

    for (let i = 0; i < quantity; i++) {
      drawStar(starParams());
    }
  }, [clearContext, drawStar, quantity, starParams]);

  const resizeCanvas = useCallback(() => {
    if (!canvasContainerRef.current || !canvasRef.current || !context.current) {
      return;
    }

    const dpr = window.devicePixelRatio || 1;
    canvasSize.current.w = canvasContainerRef.current.offsetWidth;
    canvasSize.current.h = canvasContainerRef.current.offsetHeight;
    canvasRef.current.width = canvasSize.current.w * dpr;
    canvasRef.current.height = canvasSize.current.h * dpr;
    canvasRef.current.style.width = `${canvasSize.current.w}px`;
    canvasRef.current.style.height = `${canvasSize.current.h}px`;
    context.current.setTransform(dpr, 0, 0, dpr, 0, 0);
  }, []);

  const initCanvas = useCallback(() => {
    resizeCanvas();
    drawStars();
  }, [drawStars, resizeCanvas]);

  const starInRegion = useCallback(
    (minX: number, minY: number, maxX: number, maxY: number): Star => {
      const saved = { w: canvasSize.current.w, h: canvasSize.current.h };
      canvasSize.current.w = maxX;
      canvasSize.current.h = maxY;
      const s = starParams();
      canvasSize.current.w = saved.w;
      canvasSize.current.h = saved.h;
      s.x = Math.floor(Math.random() * (maxX - minX)) + minX;
      s.y = Math.floor(Math.random() * (maxY - minY)) + minY;
      return s;
    },
    [starParams],
  );

  const onResize = useCallback(() => {
    if (!canvasContainerRef.current || !canvasRef.current || !context.current)
      return;
    const oldW = canvasSize.current.w;
    const oldH = canvasSize.current.h;
    resizeCanvas();
    const newW = canvasSize.current.w;
    const newH = canvasSize.current.h;
    if (oldW <= 0 || oldH <= 0) return;

    // Drop stars outside shrunk viewport
    stars.current = stars.current.filter((s) => s.x < newW && s.y < newH);

    // Compute density and fill newly exposed regions
    const density = quantity / (oldW * oldH);
    if (newW > oldW) {
      const count = Math.round(density * (newW - oldW) * Math.min(newH, oldH));
      for (let i = 0; i < count; i++) {
        const s = starInRegion(oldW, 0, newW, Math.min(newH, oldH));
        stars.current.push(s);
      }
    }
    if (newH > oldH) {
      const count = Math.round(density * newW * (newH - oldH));
      for (let i = 0; i < count; i++) {
        const s = starInRegion(0, oldH, newW, newH);
        stars.current.push(s);
      }
    }
  }, [quantity, resizeCanvas, starInRegion]);

  const animate = useCallback(() => {
    clearContext();

    for (const star of stars.current) {
      if (star.mode !== "steady") {
        star.alpha += star.speed * star.direction;

        if (star.alpha >= star.maxAlpha) {
          star.alpha = star.maxAlpha;
          star.direction = -1;
        }

        if (star.alpha <= star.minAlpha) {
          star.alpha = star.minAlpha;
          star.direction = 1;
        }
      }

      star.translateX +=
        (mouse.current.x / (staticity / star.magnetism) - star.translateX) /
        ease;
      star.translateY +=
        (mouse.current.y / (staticity / star.magnetism) - star.translateY) /
        ease;

      drawStar(star, true);
    }
  }, [clearContext, drawStar, ease, staticity]);

  useEffect(() => {
    if (!canvasRef.current) {
      return;
    }

    context.current = canvasRef.current.getContext("2d");
    initCanvas();

    let animationId = requestAnimationFrame(function animateLoop() {
      animate();
      animationId = requestAnimationFrame(animateLoop);
    });

    const handleMouseMove = (event: MouseEvent) => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const rect = canvas.getBoundingClientRect();
      const { w, h } = canvasSize.current;
      const x = event.clientX - rect.left - w / 2;
      const y = event.clientY - rect.top - h / 2;
      if (x < w / 2 && x > -w / 2 && y < h / 2 && y > -h / 2) {
        mouse.current.x = x;
        mouse.current.y = y;
      }
    };
    window.addEventListener("mousemove", handleMouseMove, { passive: true });
    window.addEventListener("resize", onResize);

    return () => {
      cancelAnimationFrame(animationId);
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("resize", onResize);
    };
  }, [animate, initCanvas, onResize]);

  useEffect(() => {
    initCanvas();
  }, [initCanvas, refresh]);

  return (
    <div className={className} ref={canvasContainerRef} aria-hidden="true">
      <canvas ref={canvasRef} />
    </div>
  );
}
