"use client";

import BackgroundParticles from "./BackgroundParticles";
import BackgroundStars from "./BackgroundStars";

interface Props {
  quantity?: number;
}

export function ParticlesBackground({ quantity = 200 }: Props) {
  return (
    <div
      aria-hidden="true"
      className="pointer-events-none absolute inset-0 z-0"
    >
      <div className="
        absolute inset-0 bg-linear-to-tl from-black via-zinc-600/20 to-black
      " />
      <BackgroundParticles
        className="absolute inset-0"
        color="light"
        quantity={quantity}
      />
    </div>
  );
}

export function ParticlesBackgroundLight({ quantity = 200 }: Props) {
  return (
    <div
      aria-hidden="true"
      className="pointer-events-none absolute inset-0 z-0"
    >
      <div className="
        absolute inset-0 bg-linear-to-tl from-white via-zinc-400/20 to-white
      " />
      <BackgroundParticles
        className="absolute inset-0"
        color="dark"
        quantity={quantity}
      />
    </div>
  );
}

export function StarsBackground({ quantity = 200 }: Props) {
  return (
    <div
      aria-hidden="true"
      className="pointer-events-none absolute inset-0 z-0"
    >
      <div className="
        absolute inset-0 bg-linear-to-tl from-black via-zinc-600/20 to-black
      " />
      <BackgroundStars
        className="absolute inset-0"
        color="light"
        quantity={quantity}
      />
    </div>
  );
}

export function StarsBackgroundLight({ quantity = 200 }: Props) {
  return (
    <div
      aria-hidden="true"
      className="pointer-events-none absolute inset-0 z-0"
    >
      <div className="
        absolute inset-0 bg-linear-to-tl from-white via-zinc-400/20 to-white
      " />
      <BackgroundStars
        className="absolute inset-0"
        color="dark"
        quantity={quantity}
      />
    </div>
  );
}
