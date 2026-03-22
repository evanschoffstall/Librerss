import { AnimatePresence, motion } from "motion/react";

interface ArticleCardContentProps {
  bodyMeasureRef: React.RefObject<HTMLDivElement | null>;
  bodyTransitionMs: number;
  collapsedPreview: string;
  collapsedPreviewClassName: string;
  contentGradientOverlayRef: React.RefObject<HTMLDivElement | null>;
  contentZoneRef: React.RefObject<HTMLDivElement | null>;
  expandedBodyContent: React.ReactNode;
  expandTransitionDone: boolean;
  gradientCls: string;
  phase: "collapsed" | "collapsing" | "expanded" | "expanding" | "loading";
  resolvedBodyHeight: number;
  showPreviewLayer: boolean;
  stopExpandedContentPropagation: (
    event: React.MouseEvent | React.PointerEvent,
  ) => void;
  visuallyExpanded: boolean;
}

const ARTICLE_SURFACE_EASING_ARRAY: [number, number, number, number] = [0.25, 1, 0.5, 1];

export function ArticleCardContent({
  bodyMeasureRef,
  bodyTransitionMs,
  collapsedPreview,
  collapsedPreviewClassName,
  contentGradientOverlayRef,
  contentZoneRef,
  expandedBodyContent,
  expandTransitionDone,
  gradientCls,
  phase,
  resolvedBodyHeight,
  showPreviewLayer,
  stopExpandedContentPropagation,
  visuallyExpanded,
}: ArticleCardContentProps) {
  return (
    <div
      className={`
        relative
        ${
          visuallyExpanded
            ? `rounded-b-xl bg-card/85 px-4 pt-3 pb-4`
            : `rounded-b-xl bg-card/70 px-3 pt-2 pb-3`
        }
      `}
      data-article-swipe-zone="content"
      onClick={stopExpandedContentPropagation}
      onMouseDown={stopExpandedContentPropagation}
      onPointerCancel={stopExpandedContentPropagation}
      onPointerDown={stopExpandedContentPropagation}
      onPointerMove={stopExpandedContentPropagation}
      onPointerUp={stopExpandedContentPropagation}
      ref={contentZoneRef}
    >
      <div
        className="
          pointer-events-none absolute inset-0 overflow-hidden rounded-b-xl
        "
      >
        <div className={gradientCls} ref={contentGradientOverlayRef} />
      </div>
      <div className="relative z-10">
        <motion.div
          animate={{ height: resolvedBodyHeight }}
          className="overflow-hidden"
          initial={false}
          style={{
            willChange: phase === "expanding" || phase === "collapsing" ? "height" : undefined,
          }}
          transition={{
            duration: bodyTransitionMs / 1000,
            ease: ARTICLE_SURFACE_EASING_ARRAY,
          }}
        >
          <div className="relative min-h-0 overflow-hidden">
            <motion.div
              animate={{
                opacity: phase === "collapsed" ? 0 : 1,
                y: phase === "expanding" ? 0 : phase === "collapsed" ? 4 : 0,
              }}
              className={`
                article-swipe-body overflow-hidden
                ${visuallyExpanded ? `select-text` : ""}
              `}
              initial={false}
              onClick={
                visuallyExpanded
                  ? (event) => {
                      event.stopPropagation();
                    }
                  : undefined
              }
              onMouseDown={
                visuallyExpanded
                  ? (event) => {
                      event.stopPropagation();
                    }
                  : undefined
              }
              onPointerDown={
                visuallyExpanded
                  ? (event) => {
                      event.stopPropagation();
                    }
                  : undefined
              }
              ref={bodyMeasureRef}
              style={{
                containIntrinsicSize:
                  expandTransitionDone && !visuallyExpanded ? "auto 24px" : undefined,
                contentVisibility:
                  expandTransitionDone && !visuallyExpanded ? "auto" : "visible",
                cursor: visuallyExpanded ? "text" : undefined,
                inset: phase === "collapsed" || phase === "collapsing" ? 0 : undefined,
                pointerEvents: visuallyExpanded ? "auto" : "none",
                position:
                  phase === "collapsed" || phase === "collapsing" ? "absolute" : "relative",
                touchAction: "pan-y",
                userSelect: visuallyExpanded ? "text" : "none",
                WebkitTouchCallout: visuallyExpanded ? "default" : "none",
                WebkitUserSelect: visuallyExpanded ? "text" : "none",
              }}
              transition={{
                duration: Math.max(180, bodyTransitionMs - 40) / 1000,
                ease: ARTICLE_SURFACE_EASING_ARRAY,
              }}
            >
              {expandedBodyContent}
            </motion.div>
            <AnimatePresence>
              {showPreviewLayer ? (
                <motion.div
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -3 }}
                  initial={{ opacity: 0, y: 3 }}
                  key="collapsed-preview"
                  style={{ position: "relative" }}
                  transition={{
                    duration: Math.max(160, bodyTransitionMs - 60) / 1000,
                    ease: ARTICLE_SURFACE_EASING_ARRAY,
                  }}
                >
                  <p
                    className={collapsedPreviewClassName}
                    data-article-preview="true"
                  >
                    {collapsedPreview}
                  </p>
                </motion.div>
              ) : null}
            </AnimatePresence>
          </div>
        </motion.div>
      </div>
    </div>
  );
}