"use client";

import { useCallback, useEffect, useState } from "react";

type ExpansionPhase =
  | "collapsed"
  | "collapsing"
  | "expanded"
  | "expanding"
  | "loading";

/**
 * Coordinates the article body's expand and collapse state contract.
 *
 * The card still uses the richer phase model so loading, expanded, and
 * collapse rendering all preserve the previous hydration behavior. Motion
 * timings are now zeroed elsewhere, so these phases settle immediately in
 * practice while keeping the old rendering semantics intact.
 */
export function useArticleExpansion(isExpanded: boolean, isHydrating: boolean) {
  const [phase, setPhase] = useState<ExpansionPhase>(
    isExpanded ? (isHydrating ? "loading" : "expanded") : "collapsed",
  );
  const [expandTransitionDone, setExpandTransitionDone] = useState(
    isExpanded && !isHydrating,
  );

  useEffect(() => {
    if (isExpanded) {
      if (isHydrating) {
        setPhase("loading");
        setExpandTransitionDone(false);
      } else {
        setPhase((current) => (current === "expanded" ? current : "expanding"));
        setExpandTransitionDone((current) =>
          phase === "expanded" ? current : false,
        );
      }
    } else {
      setPhase((current) =>
        current === "expanded" ||
        current === "expanding" ||
        current === "loading"
          ? "collapsing"
          : "collapsed",
      );
      setExpandTransitionDone(false);
    }
  }, [isExpanded, isHydrating, phase]);

  const onBodyAnimationComplete = useCallback(() => {
    if (!isExpanded) {
      setPhase((current) => (current === "collapsing" ? "collapsed" : current));
      return;
    }

    if (isHydrating) {
      return;
    }

    setPhase((current) =>
      current === "expanding" || current === "loading" ? "expanded" : current,
    );
    setExpandTransitionDone(true);
  }, [isExpanded, isHydrating]);

  return { expandTransitionDone, onBodyAnimationComplete, phase };
}
