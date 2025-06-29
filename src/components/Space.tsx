"use client";

import { SPACE_CONSTANTS, getRandomNumber, type StarStyle } from "@/src/lib";
import "@/src/styles/components.css";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";

// Pre-generate animation variations to reduce runtime calculations
const ANIMATION_VARIANTS = {
  glowOnly: [
    "glow 8s infinite alternate-reverse",
    "glow 5s infinite alternate-reverse",
    "glow 12s infinite alternate-reverse",
    "glow 3s infinite alternate-reverse"
  ],
  withTwinkle: [
    "glow 6s infinite alternate-reverse, twinkle 8s infinite",
    "glow 4s infinite alternate-reverse, twinkle 12s infinite",
    "glow 10s infinite alternate-reverse, twinkle 6s infinite",
    "glow 7s infinite alternate-reverse, twinkle 15s infinite"
  ]
};

const generateStarStyle = (): StarStyle => {
  const { MAX_PERCENTAGE, MAX_STAR_SIZE } = SPACE_CONSTANTS;
  const shouldTwinkle = Math.random() < 0.3; // Reduced from 0.5 to have fewer twinkling stars

  // Use pre-defined animation variants instead of calculating random times
  const animations = shouldTwinkle ? ANIMATION_VARIANTS.withTwinkle : ANIMATION_VARIANTS.glowOnly;
  const animation = animations[Math.floor(Math.random() * animations.length)];

  return {
    height: `${getRandomNumber(MAX_STAR_SIZE, 1)}px`,
    width: `${getRandomNumber(MAX_STAR_SIZE, 1)}px`,
    top: `${getRandomNumber(MAX_PERCENTAGE)}vh`,
    left: `${getRandomNumber(MAX_PERCENTAGE)}vw`,
    animation,
    // Remove willChange from individual stars - we'll use it on the container
  };
};

const Star = React.memo<{ starData: StarStyle }>(({ starData }) => (
  <div className="star" style={starData} />
));
Star.displayName = "Star";

export const Space: React.FC = () => {
  const [isClient, setIsClient] = useState(false);
  const spaceRef = useRef<HTMLDivElement>(null);
  const [isVisible, setIsVisible] = useState(true);

  // Reduce star count on mobile devices for better performance
  const getStarCount = useCallback(() => {
    if (typeof window === 'undefined') return SPACE_CONSTANTS.STAR_COUNT;
    return window.innerWidth <= 768 ? Math.floor(SPACE_CONSTANTS.STAR_COUNT * 0.6) : SPACE_CONSTANTS.STAR_COUNT;
  }, []);

  // Memoize star data generation to avoid recalculating on every render
  const starData = useMemo(() =>
    Array.from({ length: getStarCount() }, () => generateStarStyle()),
    [getStarCount]
  );

  // Performance optimization: pause animations when not visible
  useEffect(() => {
    const observer = new IntersectionObserver(
      ([entry]) => {
        setIsVisible(entry.isIntersecting);
      },
      { threshold: 0 }
    );

    if (spaceRef.current) {
      observer.observe(spaceRef.current);
    }

    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    setIsClient(true);
  }, []);

  // Use transform3d to enable hardware acceleration
  const stars = useMemo(
    () => starData.map((data, i) => (
      <Star key={i} starData={data} />
    )),
    [starData]
  );

  return (
    <div
      ref={spaceRef}
      className="space"
      style={{
        // Hardware acceleration hints
        transform: 'translateZ(0)',
        willChange: isVisible ? 'opacity' : 'auto',
        // Pause animations when not visible to save resources
        animationPlayState: isVisible ? 'running' : 'paused'
      }}
    >
      {isClient ? stars : null}
    </div>
  );
};
