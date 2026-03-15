"use client";

import { useCallback, useEffect, useState } from "react";

type ExpansionPhase =
  | "collapsed"
  | "collapsing"
  | "expanded"
  | "expanding"
  | "loading";

/**
 * Coordinates the article body's Motion-driven expand and collapse states.
 *
 * Full content stays mounted during collapse so the body can animate down to
 * the compact preview. Once the body animation settles, the hook marks the
 * card as fully expanded or fully collapsed for the cheaper resting state.
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
      setPhase((cur) =>
        cur === "expanded" || cur === "expanding" || cur === "loading"
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
