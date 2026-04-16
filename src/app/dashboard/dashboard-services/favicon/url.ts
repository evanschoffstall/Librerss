import { getMergedFaviconCandidates } from "./candidates";

export const getFaviconUrl = (url: string) => {
  const candidates = getMergedFaviconCandidates(url);
  return candidates[0] ?? "";
};
