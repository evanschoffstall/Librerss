"use client";

import { useEffect, useState } from "react";

import BackgroundParticles from "@/app/dashboard/dashboard-components/BackgroundParticles";
import BackgroundStars from "@/app/dashboard/dashboard-components/BackgroundStars";

interface BackgroundLayerProps extends Props {
  gradientTone: "dark" | "light";
  particleColor: "dark" | "light";
  variant: "particles" | "stars";
}

interface Props {
  quantity?: number;
}

/**
 * Renders the dark particle dashboard background.
 * @param root0
 * @param root0.quantity
 */
export function ParticlesBackground({ quantity = 200 }: Props) {
  return (
    <BackgroundLayer
      gradientTone="dark"
      particleColor="light"
      quantity={quantity}
      variant="particles"
    />
  );
}

/**
 * Renders the light particle dashboard background.
 * @param root0
 * @param root0.quantity
 */
export function ParticlesBackgroundLight({ quantity = 200 }: Props) {
  return (
    <BackgroundLayer
      gradientTone="light"
      particleColor="dark"
      quantity={quantity}
      variant="particles"
    />
  );
}

/**
 * Renders the dark starfield dashboard background.
 * @param root0
 * @param root0.quantity
 */
export function StarsBackground({ quantity = 200 }: Props) {
  return (
    <BackgroundLayer
      gradientTone="dark"
      particleColor="light"
      quantity={quantity}
      variant="stars"
    />
  );
}

/**
 * Renders the light starfield dashboard background.
 * @param root0
 * @param root0.quantity
 */
export function StarsBackgroundLight({ quantity = 200 }: Props) {
  return (
    <BackgroundLayer
      gradientTone="light"
      particleColor="dark"
      quantity={quantity}
      variant="stars"
    />
  );
}

/**
 * Fades the decorative dashboard background in as a single surface so the
 * gradient and animated canvas appear together after hydration.
 * @param root0
 * @param root0.gradientTone
 * @param root0.particleColor
 * @param root0.quantity
 * @param root0.variant
 */
function BackgroundLayer({
  gradientTone,
  particleColor,
  quantity = 200,
  variant,
}: BackgroundLayerProps) {
  const [isClientReady, setIsClientReady] = useState(false);

  useEffect(() => {
    const frameId = window.requestAnimationFrame(() => {
      setIsClientReady(true);
    });

    return () => {
      window.cancelAnimationFrame(frameId);
    };
  }, []);

  const gradientClassName =
    gradientTone === "dark"
      ? "absolute inset-0 bg-linear-to-tl from-black via-zinc-600/20 to-black"
      : "absolute inset-0 bg-linear-to-tl from-white via-zinc-400/20 to-white";
  const surfaceOpacityClassName = isClientReady ? "opacity-100" : "opacity-0";

  return (
    <div
      aria-hidden="true"
      className="pointer-events-none absolute inset-0 z-0"
      data-background-root="true"
    >
      <div
        className={`
          absolute inset-0 transition-opacity duration-3200 ease-out
          ${surfaceOpacityClassName}
        `}
        data-background-surface="true"
      >
        <div
          className={gradientClassName}
          data-background-gradient-tone={gradientTone}
        />
        <div
          className="absolute inset-0"
          data-background-animation-layer={variant}
        >
          {variant === "particles" ? (
            <BackgroundParticles
              className="absolute inset-0"
              color={particleColor}
              quantity={quantity}
            />
          ) : (
            <BackgroundStars
              className="absolute inset-0"
              color={particleColor}
              quantity={quantity}
            />
          )}
        </div>
      </div>
    </div>
  );
}
