import { getMergedFaviconCandidates } from "./candidates";

/**
 * Return the favicon url.
 * @param url - The url.
 * @returns The favicon url.
 */
export const getFaviconUrl = (url: string) => {
  const candidates = getMergedFaviconCandidates(url);
  return candidates[0] ?? "";
};
