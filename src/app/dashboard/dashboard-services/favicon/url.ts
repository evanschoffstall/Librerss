import { getMergedFaviconCandidates } from "./candidates";

/**
 * @param url
 */
export const getFaviconUrl = (url: string) => {
  const candidates = getMergedFaviconCandidates(url);
  return candidates[0] ?? "";
};
