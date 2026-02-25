"use client";

import { useCallback, useEffect, useRef } from "react";
import { useMousePosition } from "../hooks/useMousePosition";

interface ParticlesLightProps {
  className?: string;
  quantity?: number;
  staticity?: number;
  ease?: number;
  refresh?: boolean;
}

type Circle = {
  x: number;
  y: number;
  translateX: number;
  translateY: number;
  size: number;
  alpha: number;
  targetAlpha: number;
  dx: number;
  dy: number;
  magnetism: number;
};

export default function ParticlesLight({
  className = "",
  quantity = 30,
  staticity = 50,
  ease = 50,
  refresh = false,
}: ParticlesLightProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const canvasContainerRef = useRef<HTMLDivElement>(null);
  const context = useRef<CanvasRenderingContext2D | null>(null);
  const circles = useRef<Circle[]>([]);
  const mousePosition = useMousePosition();
  const mouse = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  const canvasSize = useRef<{ w: number; h: number }>({ w: 0, h: 0 });

  const remapValue = useCallback(
    (value: number, start1: number, end1: number, start2: number, end2: number): number => {
      const remapped =
        ((value - start1) * (end2 - start2)) / (end1 - start1) + start2;
      return remapped > 0 ? remapped : 0;
    },
    [],
  );

  const clearContext = useCallback(() => {
    if (!context.current) {
      return;
    }

    context.current.clearRect(0, 0, canvasSize.current.w, canvasSize.current.h);
  }, []);

  const circleParams = useCallback((): Circle => {
    const x = Math.floor(Math.random() * canvasSize.current.w);
    const y = Math.floor(Math.random() * canvasSize.current.h);

    return {
      x,
      y,
      translateX: 0,
      translateY: 0,
      size: Math.floor(Math.random() * 2) + 0.1,
      alpha: 0,
      targetAlpha: parseFloat((Math.random() * 0.4 + 0.2).toFixed(2)),
      dx: (Math.random() - 0.5) * 0.2,
      dy: (Math.random() - 0.5) * 0.2,
      magnetism: 0.1 + Math.random() * 4,
    };
  }, []);

  const drawCircle = useCallback((circle: Circle, update = false) => {
    if (!context.current) {
      return;
    }

    const dpr = window.devicePixelRatio || 1;
    const { x, y, translateX, translateY, size, alpha } = circle;

    context.current.translate(translateX, translateY);
    context.current.beginPath();
    context.current.arc(x, y, size, 0, 2 * Math.PI);
    // Dark particles for light background
    context.current.fillStyle = `rgba(40, 40, 48, ${alpha})`;
    context.current.fill();
    context.current.setTransform(dpr, 0, 0, dpr, 0, 0);

    if (!update) {
      circles.current.push(circle);
    }
  }, []);

  const drawParticles = useCallback(() => {
    clearContext();

    for (let i = 0; i < quantity; i++) {
      drawCircle(circleParams());
    }
  }, [circleParams, clearContext, drawCircle, quantity]);

  const resizeCanvas = useCallback(() => {
    if (!canvasContainerRef.current || !canvasRef.current || !context.current) {
      return;
    }

    const dpr = window.devicePixelRatio || 1;
    circles.current.length = 0;
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
    drawParticles();
  }, [drawParticles, resizeCanvas]);

  const animate = useCallback(() => {
    clearContext();

    for (let i = circles.current.length - 1; i >= 0; i--) {
      const circle = circles.current[i];
      const edge = [
        circle.x + circle.translateX - circle.size,
        canvasSize.current.w - circle.x - circle.translateX - circle.size,
        circle.y + circle.translateY - circle.size,
        canvasSize.current.h - circle.y - circle.translateY - circle.size,
      ];

      const closestEdge = edge.reduce((a, b) => Math.min(a, b));
      const remapClosestEdge = parseFloat(remapValue(closestEdge, 0, 20, 0, 1).toFixed(2));

      if (remapClosestEdge > 1) {
        circle.alpha += 0.02;
        if (circle.alpha > circle.targetAlpha) {
          circle.alpha = circle.targetAlpha;
        }
      } else {
        circle.alpha = circle.targetAlpha * remapClosestEdge;
      }

      circle.x += circle.dx;
      circle.y += circle.dy;
      circle.translateX +=
        (mouse.current.x / (staticity / circle.magnetism) - circle.translateX) / ease;
      circle.translateY +=
        (mouse.current.y / (staticity / circle.magnetism) - circle.translateY) / ease;

      if (
        circle.x < -circle.size ||
        circle.x > canvasSize.current.w + circle.size ||
        circle.y < -circle.size ||
        circle.y > canvasSize.current.h + circle.size
      ) {
        circles.current.splice(i, 1);
        drawCircle(circleParams());
      } else {
        drawCircle({
          ...circle,
          x: circle.x,
          y: circle.y,
          translateX: circle.translateX,
          translateY: circle.translateY,
          alpha: circle.alpha,
        }, true);
      }
    }
  }, [circleParams, clearContext, drawCircle, ease, remapValue, staticity]);

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

    const handleResize = () => initCanvas();
    window.addEventListener("resize", handleResize);

    return () => {
      cancelAnimationFrame(animationId);
      window.removeEventListener("resize", handleResize);
    };
  }, [animate, initCanvas]);

  useEffect(() => {
    if (!canvasRef.current) {
      return;
    }

    const rect = canvasRef.current.getBoundingClientRect();
    const { w, h } = canvasSize.current;
    const x = mousePosition.x - rect.left - w / 2;
    const y = mousePosition.y - rect.top - h / 2;
    const inside = x < w / 2 && x > -w / 2 && y < h / 2 && y > -h / 2;

    if (inside) {
      mouse.current.x = x;
      mouse.current.y = y;
    }
  }, [mousePosition.x, mousePosition.y]);

  useEffect(() => {
    initCanvas();
  }, [initCanvas, refresh]);

  return (
    <div className={className} ref={canvasContainerRef} aria-hidden="true">
      <canvas ref={canvasRef} />
    </div>
  );
}
