import { AnimatePresence, motion, type MotionStyle } from "motion/react";

interface ArticleCardContentProps {
  bodyMeasureRef: React.RefObject<HTMLDivElement | null>;
  bodyTransitionMs: number;
  collapsedPreview: string;
  collapsedPreviewClassName: string;
  contentGradientOverlayRef: React.RefObject<HTMLDivElement | null>;
  contentZoneRef: React.RefObject<HTMLDivElement | null>;
  expandedBodyContent: React.ReactNode;
  gradientCls: string;
  phase: "collapsed" | "collapsing" | "expanded" | "expanding" | "loading";
  resolvedBodyHeight: number;
  showPreviewLayer: boolean;
  stopExpandedContentPropagation: (
    event: React.MouseEvent | React.PointerEvent,
  ) => void;
  visuallyExpanded: boolean;
}

const ARTICLE_SURFACE_EASING_ARRAY: [number, number, number, number] = [
  0.25, 1, 0.5, 1,
];

interface ArticleBodyMotionProps {
  bodyInteractionProps: Pick<
    React.ComponentProps<typeof motion.div>,
    "onClick" | "onMouseDown" | "onPointerDown"
  >;
  bodyMeasureRef: ArticleCardContentProps["bodyMeasureRef"];
  bodyTransitionMs: number;
  collapsedPreview: string;
  collapsedPreviewClassName: string;
  expandedBodyContent: React.ReactNode;
  phase: ArticleCardContentProps["phase"];
  resolvedBodyHeight: number;
  showPreviewLayer: boolean;
  visuallyExpanded: boolean;
}
interface ArticleCollapsedPreviewProps {
  bodyTransitionMs: number;
  collapsedPreview: string;
  collapsedPreviewClassName: string;
  showPreviewLayer: boolean;
}

/**
 * Render the article card content component.
 * @param props - The component props.
 * @returns The rendered article card content component.
 */
export function ArticleCardContent(props: ArticleCardContentProps) {
  const {
    bodyMeasureRef,
    bodyTransitionMs,
    collapsedPreview,
    collapsedPreviewClassName,
    contentGradientOverlayRef,
    contentZoneRef,
    expandedBodyContent,
    gradientCls,
    phase,
    resolvedBodyHeight,
    showPreviewLayer,
    stopExpandedContentPropagation,
    visuallyExpanded,
  } = props;
  const bodyInteractionProps = getExpandedBodyInteractionProps(
    visuallyExpanded,
    stopExpandedContentPropagation,
  );

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
      style={{
        transition: `padding ${bodyTransitionMs}ms cubic-bezier(0.25, 1, 0.5, 1), background-color ${bodyTransitionMs}ms cubic-bezier(0.25, 1, 0.5, 1)`,
      }}
    >
      <div
        className="
          pointer-events-none absolute inset-0 overflow-hidden rounded-b-xl
        "
      >
        <div className={gradientCls} ref={contentGradientOverlayRef} />
      </div>
      <div className="relative z-10">
        <ArticleBodyMotion
          bodyInteractionProps={bodyInteractionProps}
          bodyMeasureRef={bodyMeasureRef}
          bodyTransitionMs={bodyTransitionMs}
          collapsedPreview={collapsedPreview}
          collapsedPreviewClassName={collapsedPreviewClassName}
          expandedBodyContent={expandedBodyContent}
          phase={phase}
          resolvedBodyHeight={resolvedBodyHeight}
          showPreviewLayer={showPreviewLayer}
          visuallyExpanded={visuallyExpanded}
        />
      </div>
    </div>
  );
}
/**
 * Render the article body motion component.
 * @param props - The component props.
 * @returns The rendered article body motion component.
 */
function ArticleBodyMotion(props: ArticleBodyMotionProps) {
  const {
    bodyInteractionProps,
    bodyMeasureRef,
    bodyTransitionMs,
    collapsedPreview,
    collapsedPreviewClassName,
    expandedBodyContent,
    phase,
    resolvedBodyHeight,
    showPreviewLayer,
    visuallyExpanded,
  } = props;
  return (
    <motion.div
      animate={{ height: resolvedBodyHeight }}
      className="overflow-hidden"
      initial={false}
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
          ref={bodyMeasureRef}
          style={getExpandedBodyMotionStyle(phase, visuallyExpanded)}
          transition={{
            duration: Math.max(180, bodyTransitionMs - 40) / 1000,
            ease: ARTICLE_SURFACE_EASING_ARRAY,
          }}
          {...bodyInteractionProps}
        >
          {expandedBodyContent}
        </motion.div>
        <ArticleCollapsedPreview
          bodyTransitionMs={bodyTransitionMs}
          collapsedPreview={collapsedPreview}
          collapsedPreviewClassName={collapsedPreviewClassName}
          showPreviewLayer={showPreviewLayer}
        />
      </div>
    </motion.div>
  );
}

/**
 * Render the article collapsed preview component.
 * @param props - The component props.
 * @returns The rendered article collapsed preview component.
 */
function ArticleCollapsedPreview(props: ArticleCollapsedPreviewProps) {
  const {
    bodyTransitionMs,
    collapsedPreview,
    collapsedPreviewClassName,
    showPreviewLayer,
  } = props;
  return (
    <AnimatePresence>
      {showPreviewLayer ? (
        <motion.div
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -3 }}
          initial={false}
          key="collapsed-preview"
          style={{ position: "relative" }}
          transition={{
            duration: Math.max(160, bodyTransitionMs - 60) / 1000,
            ease: ARTICLE_SURFACE_EASING_ARRAY,
          }}
        >
          <p className={collapsedPreviewClassName} data-article-preview="true">
            {collapsedPreview}
          </p>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}

/**
 * Return the expanded body interaction props.
 * @param visuallyExpanded - The visually expanded.
 * @param stopExpandedContentPropagation - The callback that stop expanded content propagation.
 * @returns The expanded body interaction props.
 */
function getExpandedBodyInteractionProps(
  visuallyExpanded: boolean,
  stopExpandedContentPropagation: ArticleCardContentProps["stopExpandedContentPropagation"],
) {
  if (!visuallyExpanded) {
    return {
      onClick: undefined,
      onMouseDown: undefined,
      onPointerDown: undefined,
    };
  }

  return {
    onClick: stopExpandedContentPropagation,
    onMouseDown: stopExpandedContentPropagation,
    onPointerDown: stopExpandedContentPropagation,
  };
}

/**
 * Return the expanded body motion style.
 * @param phase - The phase.
 * @param visuallyExpanded - The visually expanded.
 * @returns The expanded body motion style.
 */
function getExpandedBodyMotionStyle(
  phase: ArticleCardContentProps["phase"],
  visuallyExpanded: boolean,
): MotionStyle {
  const isCollapsedPhase = phase === "collapsed" || phase === "collapsing";

  return {
    cursor: visuallyExpanded ? "text" : undefined,
    inset: isCollapsedPhase ? 0 : undefined,
    pointerEvents: visuallyExpanded ? "auto" : "none",
    position: isCollapsedPhase ? "absolute" : "relative",
    touchAction: "pan-y" as const,
    userSelect: visuallyExpanded ? "text" : "none",
    WebkitTouchCallout: visuallyExpanded ? "default" : "none",
    WebkitUserSelect: visuallyExpanded ? "text" : "none",
  };
}
