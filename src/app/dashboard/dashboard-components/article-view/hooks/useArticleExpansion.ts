"use client";

import { useEffect, useRef, useState } from "react";

type ExpansionPhase =
  | "collapsed"
  | "collapsing"
  | "expanded"
  | "expanding"
  | "loading";

const ARTICLE_EXPAND_DURATION_MS = 160;
const ARTICLE_COLLAPSE_DURATION_MS = 130;

/**
 * Manage the article expansion.
 * @param isExpanded - Whether is expanded.
 * @param isHydrating - Whether is hydrating.
 * @returns The article expansion state and callbacks.
 */
export function useArticleExpansion(isExpanded: boolean, isHydrating: boolean) {
  const [phase, setPhase] = useState<ExpansionPhase>(
    isExpanded ? (isHydrating ? "loading" : "expanded") : "collapsed",
  );
  const settleTimeoutRef = useRef<null | ReturnType<typeof setTimeout>>(null);

  useEffect(() => {
    return () => {
      if (settleTimeoutRef.current) {
        clearTimeout(settleTimeoutRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (settleTimeoutRef.current) {
      clearTimeout(settleTimeoutRef.current);
      settleTimeoutRef.current = null;
    }

    if (isExpanded) {
      if (isHydrating) {
        setPhase("loading");
      } else {
        setPhase((current) => (current === "expanded" ? current : "expanding"));
        settleTimeoutRef.current = setTimeout(() => {
          setPhase("expanded");
        }, ARTICLE_EXPAND_DURATION_MS);
      }
    } else {
      setPhase((current) => {
        if (
          current === "expanded" ||
          current === "expanding" ||
          current === "loading"
        ) {
          settleTimeoutRef.current = setTimeout(() => {
            setPhase("collapsed");
          }, ARTICLE_COLLAPSE_DURATION_MS);
          return "collapsing";
        }

        return "collapsed";
      });
    }
  }, [isExpanded, isHydrating]);

  return { phase };
}
