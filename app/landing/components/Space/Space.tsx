"use client";

import React, { useMemo } from "react";
import "./Space.css";

const STAR_COUNT = 100;
const MAX_STAR_SIZE = 3;
const MAX_GLOW_TIME = 10;
const MAX_TWINKLE_TIME = 15;

const getRandomNumber = (max: number, min: number = 0) =>
  Math.random() * (max - min) + min;

const generateStars = () => {
  return Array.from({ length: STAR_COUNT }, (_, i) => ({
    id: i,
    size: getRandomNumber(MAX_STAR_SIZE, 1),
    x: getRandomNumber(100),
    y: getRandomNumber(100),
    glowTime: getRandomNumber(MAX_GLOW_TIME, 1),
    twinkleTime: getRandomNumber(MAX_TWINKLE_TIME, 4),
    shouldTwinkle: Math.random() < 0.5,
  }));
};

const Space: React.FC = () => {
  const stars = useMemo(generateStars, []);

  return (
    <div className="space">
      {stars.map(({ id, size, x, y, glowTime, twinkleTime, shouldTwinkle }) => (
        <div
          key={id}
          className="star"
          style={{
            width: `${size}px`,
            height: `${size}px`,
            transform: `translate(${x}vw, ${y}vh)`,
            animation: shouldTwinkle
              ? `glow ${glowTime}s infinite alternate-reverse, twinkle ${twinkleTime}s infinite`
              : `glow ${glowTime}s infinite alternate-reverse`,
          }}
        />
      ))}
    </div>
  );
};

export default Space;
