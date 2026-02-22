/**
 * Date formatting utilities — pure functions, no side effects.
 * Safe to import from both server and client modules.
 */

/**
 * Returns a human-readable relative date label:
 * "Today", "Yesterday", "N days ago", or the locale date string.
 */
export const formatRelativeDate = (date: Date): string => {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const target = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const diffDays = Math.round(
    (today.getTime() - target.getTime()) / 86_400_000,
  );

  if (diffDays === 0) return "Today";
  if (diffDays === 1) return "Yesterday";
  if (diffDays <= 6) return `${diffDays} days ago`;
  return date.toLocaleDateString();
};
