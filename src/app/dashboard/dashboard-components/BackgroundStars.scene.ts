const TWINKLE_MAX_SPEED = 0.003;
const TWINKLE_MIN_SPEED = 0.0012;
const FADE_MAX_SPEED = 0.0014;
const FADE_MIN_SPEED = 0.0006;

export interface Star {
  alpha: number;
  colorRgb: string;
  direction: -1 | 1;
  glowStrength: number;
  magnetism: number;
  maxAlpha: number;
  minAlpha: number;
  mode: "fade" | "steady" | "twinkle";
  size: number;
  speed: number;
  translateX: number;
  translateY: number;
  x: number;
  y: number;
}

/**
 * @param canvasSize
 * @param canvasSize.h
 * @param canvasSize.w
 * @param color
 */
export function buildBackgroundStar(
  canvasSize: { h: number; w: number },
  color: "dark" | "light",
): Star {
  const mode = resolveBackgroundStarMode();
  const profile = resolveBackgroundStarProfile(mode, Math.random());
  const { maxAlpha, minAlpha } = profile;

  return {
    alpha:
      mode === "steady" ? maxAlpha : resolveRandomAlpha(minAlpha, maxAlpha),
    colorRgb: resolveBackgroundStarColor(color, profile.isBrightStar),
    direction: Math.random() > 0.5 ? 1 : -1,
    glowStrength: profile.glowStrength,
    magnetism: 0.1 + Math.random() * 4,
    maxAlpha,
    minAlpha,
    mode,
    size: profile.size,
    speed: resolveBackgroundStarSpeed(mode),
    translateX: 0,
    translateY: 0,
    x: Math.floor(Math.random() * canvasSize.w),
    y: Math.floor(Math.random() * canvasSize.h),
  };
}

/**
 * @param context
 * @param star
 */
export function drawBackgroundStar(
  context: CanvasRenderingContext2D,
  star: Star,
) {
  const glowRadius = star.size * 4.2;
  context.save();
  context.translate(star.translateX, star.translateY);
  const glowGradient = context.createRadialGradient(
    star.x,
    star.y,
    0,
    star.x,
    star.y,
    glowRadius,
  );
  glowGradient.addColorStop(
    0,
    `rgba(${star.colorRgb}, ${Math.min(star.alpha * star.glowStrength, 0.35)})`,
  );
  glowGradient.addColorStop(1, `rgba(${star.colorRgb}, 0)`);
  context.beginPath();
  context.arc(star.x, star.y, glowRadius, 0, 2 * Math.PI);
  context.fillStyle = glowGradient;
  context.fill();
  context.beginPath();
  context.arc(star.x, star.y, star.size, 0, 2 * Math.PI);
  context.fillStyle = `rgba(${star.colorRgb}, ${star.alpha})`;
  context.fill();
  context.restore();
}

/**
 * @param root0
 * @param root0.canvasRef
 * @param root0.canvasSize
 * @param root0.event
 * @param root0.fallback
 * @param root0.fallback.x
 * @param root0.fallback.y
 */
export function resolveBackgroundStarPointerOffset({
  canvasRef,
  canvasSize,
  event,
  fallback,
}: {
  canvasRef: React.RefObject<HTMLCanvasElement | null>;
  canvasSize: React.RefObject<{ h: number; w: number }>;
  event: MouseEvent;
  fallback: { x: number; y: number };
}) {
  const canvas = canvasRef.current;
  if (!canvas) {
    return fallback;
  }

  const rect = canvas.getBoundingClientRect();
  const { h, w } = canvasSize.current;
  const x = event.clientX - rect.left - w / 2;
  const y = event.clientY - rect.top - h / 2;
  if (x >= -w / 2 && x <= w / 2 && y >= -h / 2 && y <= h / 2) {
    return { x, y };
  }

  return fallback;
}

/**
 * @param star
 * @param lerpFactor
 * @param mouse
 * @param mouse.x
 * @param mouse.y
 * @param staticity
 */
export function updateBackgroundStar(
  star: Star,
  lerpFactor: number,
  mouse: { x: number; y: number },
  staticity: number,
) {
  if (star.mode !== "steady") {
    star.alpha += star.speed * star.direction;
    if (star.alpha >= star.maxAlpha) {
      star.alpha = star.maxAlpha;
      star.direction = -1;
    } else if (star.alpha <= star.minAlpha) {
      star.alpha = star.minAlpha;
      star.direction = 1;
    }
  }

  const targetX = (mouse.x / (staticity / star.magnetism)) * 1.5;
  const targetY = (mouse.y / (staticity / star.magnetism)) * 1.5;
  star.translateX += (targetX - star.translateX) * lerpFactor;
  star.translateY += (targetY - star.translateY) * lerpFactor;
}

/**
 * @param color
 * @param isBrightStar
 */
function resolveBackgroundStarColor(
  color: "dark" | "light",
  isBrightStar: boolean,
) {
  if (color === "dark") {
    return isBrightStar ? "25, 25, 25" : "35, 35, 35";
  }

  const colorRoll = Math.random();
  if (colorRoll < 0.7) {
    return "255, 255, 255";
  }

  return colorRoll < 0.85 ? "236, 242, 255" : "255, 245, 224";
}

/**
 *
 */
function resolveBackgroundStarMode(): Star["mode"] {
  const modeRoll = Math.random();
  if (modeRoll < 0.55) {
    return "steady";
  }

  return modeRoll < 0.85 ? "twinkle" : "fade";
}

/**
 * @param mode
 * @param brightnessRoll
 */
function resolveBackgroundStarProfile(
  mode: Star["mode"],
  brightnessRoll: number,
) {
  const isDimStar = brightnessRoll < 0.55;
  const isBrightStar = brightnessRoll > 0.9;

  return {
    glowStrength: isBrightStar ? 0.28 : isDimStar ? 0.1 : 0.18,
    isBrightStar,
    maxAlpha: resolveMaxAlpha(isBrightStar, isDimStar),
    minAlpha: mode === "fade" ? 0 : resolveMinAlpha(isBrightStar, isDimStar),
    size: resolveBackgroundStarSize(isBrightStar, isDimStar),
  };
}

/**
 * @param isBrightStar
 * @param isDimStar
 */
function resolveBackgroundStarSize(isBrightStar: boolean, isDimStar: boolean) {
  if (isDimStar) {
    return Math.random() * 0.8 + 0.12;
  }

  return isBrightStar ? Math.random() * 1.4 + 1.1 : Math.random() * 1 + 0.45;
}

/**
 * @param mode
 */
function resolveBackgroundStarSpeed(mode: Star["mode"]) {
  if (mode === "twinkle") {
    return (
      Math.random() * (TWINKLE_MAX_SPEED - TWINKLE_MIN_SPEED) +
      TWINKLE_MIN_SPEED
    );
  }

  return mode === "fade"
    ? Math.random() * (FADE_MAX_SPEED - FADE_MIN_SPEED) + FADE_MIN_SPEED
    : 0;
}

/**
 * @param isBrightStar
 * @param isDimStar
 */
function resolveMaxAlpha(isBrightStar: boolean, isDimStar: boolean) {
  if (isDimStar) {
    return toFixedAlpha(Math.random() * 0.2 + 0.18);
  }

  return isBrightStar
    ? toFixedAlpha(Math.random() * 0.22 + 0.53)
    : toFixedAlpha(Math.random() * 0.22 + 0.36);
}

/**
 * @param isBrightStar
 * @param isDimStar
 */
function resolveMinAlpha(isBrightStar: boolean, isDimStar: boolean) {
  if (isDimStar) {
    return toFixedAlpha(Math.random() * 0.08 + 0.02);
  }

  return isBrightStar
    ? toFixedAlpha(Math.random() * 0.12 + 0.12)
    : toFixedAlpha(Math.random() * 0.1 + 0.07);
}

/**
 * @param minAlpha
 * @param maxAlpha
 */
function resolveRandomAlpha(minAlpha: number, maxAlpha: number) {
  return toFixedAlpha(Math.random() * (maxAlpha - minAlpha) + minAlpha);
}

/**
 * @param value
 */
function toFixedAlpha(value: number) {
  return parseFloat(value.toFixed(2));
}
