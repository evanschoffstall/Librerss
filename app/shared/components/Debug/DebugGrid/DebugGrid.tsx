"use client";

import React from "react";
import { useHotkeys } from "react-hotkeys-hook";
import { useCallback, useEffect, useState } from "react";
import "./DebugGrid.css";

const DebugGrid = () => {
  const [debug, setDebug] = useState(false);

  const toggle = useCallback(() => {
    setDebug((prevDebug) => !prevDebug);
  }, []);

  useHotkeys("shift+g", toggle);

  useEffect(() => {
    const gridOverlay = document.getElementById("debug-grid-overlay");
    if (gridOverlay) {
      gridOverlay.style.display = debug ? "block" : "none";
    }
  }, [debug]);

  if (typeof window === "undefined") {
    return null;
  }

  return (
    <div id="debug-grid-overlay" className="debug-grid">
      <div
        className="bg-green-500 xs:bg-red-500 sm:bg-blue-500 sm-md:bg-yellow-500 md:bg-purple-500 md-lg:bg-pink-500 lg:bg-indigo-500 lg-xl:bg-teal-500 xl:bg-gray-500 w-20 h-20 relative flex items-center justify-center"
        style={{ position: 'absolute', bottom: '20px', right: '20px', borderRadius: '10px' }}
      >
        <div className="absolute inset-0 bg-gradient-to-t from-transparent to-white opacity-40 rounded-lg pointer-events-none"></div>
        <span className="text-white text-3xl font-bold text-center block xs:hidden">n/a</span>
        <span className="text-white text-3xl font-bold text-center hidden xs:block sm:hidden">xs</span>
        <span className="text-white text-3xl font-bold text-center hidden sm:block sm-md:hidden">sm</span>
        <span className="text-white text-3xl font-bold text-center hidden sm-md:block md:hidden">sm-md</span>
        <span className="text-white text-3xl font-bold text-center hidden md:block md-lg:hidden">md</span>
        <span className="text-white text-3xl font-bold text-center hidden md-lg:block lg-lx:hidden">md-lg</span>
        <span className="text-white text-3xl font-bold text-center hidden lg-xl:block lg:hidden">lg-xl</span>
        <span className="text-white text-3xl font-bold text-center hidden lg:block xl:hidden">lg</span>
        <span className="text-white text-3xl font-bold text-center hidden xl:block 2xl:hidden">xl</span>
        <span className="text-white text-3xl font-bold text-center hidden 2xl:block">2xl+</span>
      </div>
    </div>
  );
};

export default DebugGrid;