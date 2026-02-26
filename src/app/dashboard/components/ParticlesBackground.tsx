"use client";

import Particles from "./Particles";
import Stars from "./Stars";

type Props = {
  quantity?: number;
};

export function ParticlesBackground({ quantity = 200 }: Props) {
  return (
    <div className="pointer-events-none absolute inset-0 z-0" aria-hidden="true">
      <div className="absolute inset-0 bg-gradient-to-tl from-black via-zinc-600/20 to-black" />
      <Particles className="absolute inset-0" quantity={quantity} />
    </div>
  );
}

export function StarsBackground({ quantity = 200 }: Props) {
  return (
    <div className="pointer-events-none absolute inset-0 z-0" aria-hidden="true">
      <div className="absolute inset-0 bg-gradient-to-tl from-black via-zinc-600/20 to-black" />
      <Stars className="absolute inset-0" quantity={quantity} color="light" />
    </div>
  );
}
