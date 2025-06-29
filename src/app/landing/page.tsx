"use client";

import { LANDING_CONTENT } from "@/src/constants/content";
import React from "react";

export default function Landing() {
  const { title, subtitle, features, description } = LANDING_CONTENT;

  return (
    <div className="text-center">
      <p className="luxury-title mt-28">{title.main}</p>
      <p className="luxury-title-cap-adjusted mb-16">{title.secondary}</p>

      <div className="luxury-subtitle mb-24">
        {subtitle.split(" ").map((word, index, array) => (
          <React.Fragment key={word}>
            {word}
            {index < array.length - 1 && <br />}
          </React.Fragment>
        ))}
      </div>

      <h3 className="py-2 mb-16">
        {features.map((feature, index) => (
          <React.Fragment key={feature}>
            {feature}
            {index < features.length - 1 && <br />}
          </React.Fragment>
        ))}
      </h3>

      <div className="space-y-4">
        <p className="py-4">{description.intro}</p>
        <p className="py-4">{description.mission}</p>
        <p className="py-4">{description.legacy}</p>
      </div>
    </div>
  );
}
