"use client";

import { SPACE_CONSTANTS } from "@/src/constants";
import { getRandomNumber } from "@/src/lib/utils";
import type { StarStyle } from "@/src/types";
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

interface StarProps {
  starData: StarStyle;
}

const Star = React.memo<StarProps>(({ starData }) => {
  return <div className="star" style={starData} />;
});
Star.displayName = "Star";

const Space: React.FC = () => {
  const [isClient, setIsClient] = useState(false);
  const [starData, setStarData] = useState<StarStyle[]>([]);

  useEffect(() => {
    setIsClient(true);
    // Generate star data on client side only
    setStarData(
      Array.from({ length: SPACE_CONSTANTS.STAR_COUNT }, () => generateStarStyle())
    );
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
