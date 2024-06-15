"use client";

import React, { useState, useEffect } from "react";
import { useHotkeys } from "react-hotkeys-hook";
import "./Debug.css";

const Debug: React.FC = () => {
  const [debug, setDebug] = useState(false);
  const [DebugModule, setDebugModule] = useState<any>(null);

  useHotkeys("shift+d", async () => {
    setDebug(!debug);
    if (!debug) {
      document.body.classList.add("debug-mode");
    } else {
      document.body.classList.remove("debug-mode");
    }
  });

  return null;
};

export default Debug;
