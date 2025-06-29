"use client";

import React, { useEffect, useMemo, useState } from "react";
import "./Space.css";

const MAX_PERCENTAGE = 100;
const MAX_STAR_SIZE = 3;
const MAX_GLOW_TIME = 10;
const MAX_TWINKLE_TIME = 15;

const getRandomNumber = (max: number, min: number = 0) =>
  Math.random() * (max - min) + min;

const generateStarStyle = () => {
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
    willChange: `opacity, box-shadow`,
  };
};

const Star = React.memo(({ starData }: { starData: any }) => {
  return <div className={`star`} style={starData} />;
});
Star.displayName = "Star";

const Space: React.FC = () => {
  const [isClient, setIsClient] = useState(false);
  const [starData, setStarData] = useState<any[]>([]);

  useEffect(() => {
    setIsClient(true);
    // Generate star data on client side only
    setStarData(Array.from({ length: 100 }, () => generateStarStyle()));
  }, []);

  const stars = useMemo(
    () => starData.map((data, i) => <Star key={i} starData={data} />),
    [starData]
  );

  if (!isClient) {
    // Return empty div with same structure on server
    return <div className="space"></div>;
  }

  return <div className="space">{stars}</div>;
};

export default Space;
