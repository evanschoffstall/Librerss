"use client";

import BackgroundParticles from "./BackgroundParticles";
import BackgroundStars from "./BackgroundStars";

type Props = {
  quantity?: number;
};

export function ParticlesBackground({ quantity = 200 }: Props) {
  return (
    <div className="pointer-events-none absolute inset-0 z-0" aria-hidden="true">
      <div className="absolute inset-0 bg-gradient-to-tl from-black via-zinc-600/20 to-black" />
      <BackgroundParticles className="absolute inset-0" quantity={quantity} color="light" />
    </div>
  );
}

export function StarsBackground({ quantity = 200 }: Props) {
  return (
    <div className="pointer-events-none absolute inset-0 z-0" aria-hidden="true">
      <div className="absolute inset-0 bg-gradient-to-tl from-black via-zinc-600/20 to-black" />
      <BackgroundStars className="absolute inset-0" quantity={quantity} color="light" />
    </div>
  );
}

export function ParticlesBackgroundLight({ quantity = 200 }: Props) {
  return (
    <div className="pointer-events-none absolute inset-0 z-0" aria-hidden="true">
      <div className="absolute inset-0 bg-gradient-to-tl from-white via-zinc-400/20 to-white" />
      <BackgroundParticles className="absolute inset-0" quantity={quantity} color="dark" />
    </div>
  );
}

export function StarsBackgroundLight({ quantity = 200 }: Props) {
  return (
    <div className="pointer-events-none absolute inset-0 z-0" aria-hidden="true">
      <div className="absolute inset-0 bg-gradient-to-tl from-white via-zinc-400/20 to-white" />
      <BackgroundStars className="absolute inset-0" quantity={quantity} color="dark" />
    </div>
  );
}
