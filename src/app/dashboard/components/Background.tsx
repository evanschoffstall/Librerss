"use client";

import { useEffect, useState } from "react";

import BackgroundParticles from "./BackgroundParticles";
import BackgroundStars from "./BackgroundStars";

interface BackgroundLayerProps extends Props {
  gradientTone: "dark" | "light";
  particleColor: "dark" | "light";
  variant: "particles" | "stars";
}

interface Props {
  quantity?: number;
}

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
 * Renders a deterministic gradient during SSR and the initial client pass, then
 * upgrades to the animated canvas once hydration has completed.
 */
function BackgroundLayer({
  gradientTone,
  particleColor,
  quantity = 200,
  variant,
}: BackgroundLayerProps) {
  const [isClientReady, setIsClientReady] = useState(false);

  useEffect(() => {
    setIsClientReady(true);
  }, []);

  const gradientClassName =
    gradientTone === "dark"
      ? "absolute inset-0 bg-linear-to-tl from-black via-zinc-600/20 to-black"
      : "absolute inset-0 bg-linear-to-tl from-white via-zinc-400/20 to-white";

  return (
    <div
      aria-hidden="true"
      className="pointer-events-none absolute inset-0 z-0"
    >
      <div className={gradientClassName} />
      {isClientReady ? (
        variant === "particles" ? (
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
        )
      ) : null}
    </div>
  );
}
