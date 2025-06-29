"use client";

import { SPACE_CONSTANTS, getRandomNumber, type StarStyle } from "@/src/shared";
import React, { useEffect, useMemo, useState } from "react";
import "./Space.css";

const generateStarStyle = (): StarStyle => {
  const { MAX_PERCENTAGE, MAX_STAR_SIZE, MAX_GLOW_TIME, MAX_TWINKLE_TIME } = SPACE_CONSTANTS;
  const shouldTwinkle = Math.random() < 0.5;

  const animation = shouldTwinkle
    ? `glow ${getRandomNumber(MAX_GLOW_TIME, 1)}s infinite alternate-reverse,
       twinkle ${getRandomNumber(MAX_TWINKLE_TIME, 4)}s infinite`
    : `glow ${getRandomNumber(MAX_GLOW_TIME, 1)}s infinite alternate-reverse`;

  return {
    height: `${getRandomNumber(MAX_STAR_SIZE, 1)}px`,
    width: `${getRandomNumber(MAX_STAR_SIZE, 1)}px`,
    top: `${getRandomNumber(MAX_PERCENTAGE)}vh`,
    left: `${getRandomNumber(MAX_PERCENTAGE)}vw`,
    animation,
    willChange: "opacity, box-shadow",
  };
};

const Star = React.memo<{ starData: StarStyle }>(({ starData }) => (
  <div className="star" style={starData} />
));
Star.displayName = "Star";

export const Space: React.FC = () => {
  const [isClient, setIsClient] = useState(false);
  const [starData, setStarData] = useState<StarStyle[]>([]);

  useEffect(() => {
    setIsClient(true);
    setStarData(Array.from({ length: SPACE_CONSTANTS.STAR_COUNT }, () => generateStarStyle()));
  }, []);

  const stars = useMemo(
    () => starData.map((data, i) => <Star key={i} starData={data} />),
    [starData]
  );

  return <div className="space">{isClient ? stars : null}</div>;
};
