"use client";

import { useEffect, useRef, useState } from "react";

// collapsed → loading (hydrating) → revealing (one-frame FLIP) → expanded → collapsed
type ExpansionPhase = "collapsed" | "loading" | "revealing" | "expanded";

/**
 * State machine for article card expand/collapse.
 *
 * Expand: collapsed → loading → revealing → expanded
 *   "revealing" gives the browser one frame to paint full content at
 *   collapsed height before triggering the CSS max-height transition.
 *
 * Collapse: expanded → collapsed (instant, no transition).
 */
export function useArticleExpansion(isExpanded: boolean, isHydrating: boolean) {
  const [phase, setPhase] = useState<ExpansionPhase>(
    isExpanded ? "expanded" : "collapsed",
  );
  // Once the expand transition finishes we swap max-height to "none" so
  // content (images, etc.) can resize freely without re-triggering a transition.
  const [expandTransitionDone, setExpandTransitionDone] = useState(isExpanded);

  useEffect(() => {
    if (isExpanded) {
      if (isHydrating) {
        setPhase("loading");
      } else {
        setPhase((cur) =>
          cur === "loading" || cur === "collapsed" ? "revealing" : cur,
        );
      }
    } else {
      setPhase("collapsed");
      setExpandTransitionDone(false);
    }
  }, [isExpanded, isHydrating]);

  // revealing → expanded: single rAF gives the browser one frame to paint the
  // collapsed-height layout before the CSS height transition fires.
  useEffect(() => {
    if (phase !== "revealing") return;
    const id = requestAnimationFrame(() => setPhase("expanded"));
    return () => cancelAnimationFrame(id);
  }, [phase]);

  const onContentTransitionEnd = (e: React.TransitionEvent) => {
    if (e.propertyName !== "max-height") return;
    if (phase === "expanded") setExpandTransitionDone(true);
  };

  return { phase, expandTransitionDone, onContentTransitionEnd };
}

/**
 * Tracks collapsed / expanded container heights for max-height animation.
 * Uses ResizeObserver instead of window.resize to avoid N global listeners.
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
