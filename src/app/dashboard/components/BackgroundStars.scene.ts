const TWINKLE_MAX_SPEED = 0.003;
const TWINKLE_MIN_SPEED = 0.0012;
const FADE_MAX_SPEED = 0.0014;
const FADE_MIN_SPEED = 0.0006;

/**
 * Describes the star.
 */
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
 * Describes the background star canvas size.
 */
interface BackgroundStarCanvasSize {
  h: number;
  w: number;
}

/**
 * Describes the background star mouse.
 */
interface BackgroundStarMouse {
  x: number;
  y: number;
}

/**
 * Describes the options for background star pointer offset.
 */
interface BackgroundStarPointerOffsetOptions {
  canvasRef: React.RefObject<HTMLCanvasElement | null>;
  canvasSize: React.RefObject<{ h: number; w: number }>;
  event: { clientX: number; clientY: number };
  fallback: { x: number; y: number };
} /**
 * Build the background star.
 * @param canvasSize - The canvas size.
 * @param color - The color.
 * @returns The background star.
 */
export function buildBackgroundStar(
  canvasSize: BackgroundStarCanvasSize,
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
 * Draw the background star.
 * @param context - The context used to draw the background star.
 * @param star - The star.
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
} /**
 * Resolve the background star pointer offset.
 * @param options - The options used to resolve the background star pointer offset.
 * @returns The background star pointer offset.
 */
export function resolveBackgroundStarPointerOffset(
  options: BackgroundStarPointerOffsetOptions,
) {
  const { canvasRef, canvasSize, event, fallback } = options;
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
 * Update the background star.
 *
 * Pointer-driven parallax interpolation always runs because it is a direct
 * response to user input. Autonomous twinkle and fade alpha modulation also
 * advances on every frame so the background keeps its ambient star-field
 * character in browsers that report reduced motion through system settings,
 * including Microsoft Edge on Windows.
 * @param star - The star to update in place.
 * @param lerpFactor - The interpolation factor for pointer parallax.
 * @param mouse - The pointer offset relative to the canvas center.
 * @param staticity - The pointer staticity controlling parallax strength.
 */
export function updateBackgroundStar(
  star: Star,
  lerpFactor: number,
  mouse: BackgroundStarMouse,
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
 * Resolve the background star color.
 * @param color - The color.
 * @param isBrightStar - Whether is bright star.
 * @returns The background star color.
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
 * Resolve the background star mode.
 * @returns The background star mode.
 */
function resolveBackgroundStarMode(): Star["mode"] {
  const modeRoll = Math.random();
  if (modeRoll < 0.55) {
    return "steady";
  }

  return modeRoll < 0.85 ? "twinkle" : "fade";
}

/**
 * Resolve the background star profile.
 * @param mode - The mode.
 * @param brightnessRoll - The brightness roll.
 * @returns The background star profile.
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
 * Resolve the background star size.
 * @param isBrightStar - Whether is bright star.
 * @param isDimStar - Whether is dim star.
 * @returns The background star size.
 */
function resolveBackgroundStarSize(isBrightStar: boolean, isDimStar: boolean) {
  if (isDimStar) {
    return Math.random() * 0.8 + 0.12;
  }

  return isBrightStar ? Math.random() * 1.4 + 1.1 : Math.random() * 1 + 0.45;
}

/**
 * Resolve the background star speed.
 * @param mode - The mode.
 * @returns The background star speed.
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
 * Resolve the max alpha.
 * @param isBrightStar - Whether is bright star.
 * @param isDimStar - Whether is dim star.
 * @returns The max alpha.
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
 * Resolve the min alpha.
 * @param isBrightStar - Whether is bright star.
 * @param isDimStar - Whether is dim star.
 * @returns The min alpha.
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
 * Resolve the random alpha.
 * @param minAlpha - The min alpha.
 * @param maxAlpha - The max alpha.
 * @returns The random alpha.
 */
function resolveRandomAlpha(minAlpha: number, maxAlpha: number) {
  return toFixedAlpha(Math.random() * (maxAlpha - minAlpha) + minAlpha);
}

/**
 * Process the to fixed alpha.
 * @param value - The value.
 * @returns The to fixed alpha.
 */
function toFixedAlpha(value: number) {
  return parseFloat(value.toFixed(2));
}
