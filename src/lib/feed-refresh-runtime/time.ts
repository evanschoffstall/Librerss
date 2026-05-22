/**
 * Return the age in minutes.
 * @param date - The date.
 * @returns The age in minutes.
 */
export function getAgeInMinutes(date: Date): number {
  return (Date.now() - date.getTime()) / 60_000;
}
