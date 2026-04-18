/**
 * Process the format relative date.
 * @param date - The date.
 * @returns The format relative date.
 */
export const formatRelativeDate = (date: Date): string => {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const target = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const diffDays = Math.round(
    (today.getTime() - target.getTime()) / 86_400_000,
  );

  const timeLabel = date.toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
  });

  if (diffDays === 0) return `Today ${timeLabel}`;
  if (diffDays === 1) return `Yesterday ${timeLabel}`;
  if (diffDays <= 6) return `${diffDays} days ago`;
  return date.toLocaleDateString();
};

/**
 * Parse the date or fallback.
 * @param value - The value.
 * @param fallback - The fallback.
 * @returns The date or fallback.
 */
export function parseDateOrFallback(value: unknown, fallback: Date): Date {
  return parseDateOrNull(value) ?? fallback;
}

/**
 * Parse the date or null.
 * @param value - The value.
 * @returns The date or null.
 */
export function parseDateOrNull(value: unknown): Date | null {
  if (!(typeof value === "string" || value instanceof Date)) {
    return null;
  }

  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}
