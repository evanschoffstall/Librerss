"use client";

import { useEffect, useRef, useState } from "react";

type ExpansionPhase = "collapsed" | "loading" | "ready" | "expanded";

/**
 * State machine for article card expand/collapse animation.
 *
 * Phases:
 *   collapsed → loading  (click while content not ready)
 *   loading   → ready    (content hydrated)
 *   ready     → expanded (one rAF after paint)
 *   expanded  → collapsed (click again, animate closed)
 */
export function useArticleExpansion(isExpanded: boolean, isHydrating: boolean) {
  const [phase, setPhase] = useState<ExpansionPhase>(
    isExpanded ? "expanded" : "collapsed",
  );
  const [isCollapsing, setIsCollapsing] = useState(false);
  const [expandTransitionDone, setExpandTransitionDone] = useState(isExpanded);

  // isExpanded / isHydrating → phase transitions
  useEffect(() => {
    if (isExpanded) {
      if (isHydrating) {
        setPhase("loading");
      } else {
        setPhase((current) =>
          current === "loading" || current === "collapsed" ? "ready" : current,
        );
      }
    } else {
      setPhase((current) => {
        if (current === "expanded") {
          setIsCollapsing(true);
          setExpandTransitionDone(false);
          requestAnimationFrame(() => {
            setPhase("collapsed");
            setIsCollapsing(false);
          });
          return current;
        }
        setIsCollapsing(false);
        setExpandTransitionDone(false);
        return "collapsed";
      });
    }
  }, [isExpanded, isHydrating]);

  // ready → expanded: one frame after browser paints collapsed content
  useEffect(() => {
    if (phase !== "ready") return;
    const frame = requestAnimationFrame(() => setPhase("expanded"));
    return () => cancelAnimationFrame(frame);
  }, [phase]);

  const onContentTransitionEnd = () => {
    if (phase === "expanded") {
      setExpandTransitionDone(true);
    }
  };

  return {
    phase,
    isCollapsing,
    expandTransitionDone,
    onContentTransitionEnd,
  };
}

/**
 * Tracks collapsed / expanded container heights for max-height animation.
 */
export function useArticleHeights(
  content: string,
  preview: string,
  richContentClassName: string,
) {
  const previewRef = useRef<HTMLParagraphElement>(null);
  const fullContentRef = useRef<HTMLDivElement>(null);
  const [collapsedHeight, setCollapsedHeight] = useState(0);
  const [expandedHeight, setExpandedHeight] = useState(0);

  useEffect(() => {
    const measure = () => {
      if (!previewRef.current || !fullContentRef.current) {
        setCollapsedHeight(0);
        setExpandedHeight(0);
        return;
      }
      setCollapsedHeight(previewRef.current.scrollHeight);
      setExpandedHeight(fullContentRef.current.scrollHeight);
    };
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, [content, preview, richContentClassName]);

  return { previewRef, fullContentRef, collapsedHeight, expandedHeight };
}
