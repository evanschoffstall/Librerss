"use client";

import { useEffect, useState } from "react";

import BackgroundParticles from "@/app/dashboard/components/BackgroundParticles";
import BackgroundStars from "@/app/dashboard/components/BackgroundStars";

/**
 * Describes the props for the background layer component.
 */
interface BackgroundLayerProps extends Props {
  gradientTone: "dark" | "light";
  particleColor: "dark" | "light";
  variant: "particles" | "stars";
}

/**
 * Describes the props for the props component.
 */
interface Props {
  quantity?: number;
}

/**
 * Render the particles background component.
 * @param props - The component props.
 * @returns The rendered particles background component.
 */
export function ParticlesBackground(props: Props) {
  const { quantity = 200 } = props;
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
 * Render the particles background light component.
 * @param props - The component props.
 * @returns The rendered particles background light component.
 */
export function ParticlesBackgroundLight(props: Props) {
  const { quantity = 200 } = props;
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
 * Render the stars background component.
 * @param props - The component props.
 * @returns The rendered stars background component.
 */
export function StarsBackground(props: Props) {
  const { quantity = 200 } = props;
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
 * Render the stars background light component.
 * @param props - The component props.
 * @returns The rendered stars background light component.
 */
export function StarsBackgroundLight(props: Props) {
  const { quantity = 200 } = props;
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
 * Render the background layer component.
 * @param props - The component props.
 * @returns The rendered background layer component.
 */
function BackgroundLayer(props: BackgroundLayerProps) {
  const { gradientTone, particleColor, quantity = 200, variant } = props;
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
