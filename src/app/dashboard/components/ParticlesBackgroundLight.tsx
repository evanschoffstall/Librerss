"use client";

import ParticlesLight from "./ParticlesLight";

type Props = {
  quantity?: number;
};

export function ParticlesBackgroundLight({ quantity = 200 }: Props) {
  return (
    <div className="pointer-events-none absolute inset-0 z-0" aria-hidden="true">
      <div className="absolute inset-0 bg-gradient-to-tl from-white via-zinc-400/20 to-white" />
      <ParticlesLight className="absolute inset-0" quantity={quantity} />
    </div>
  );
}
