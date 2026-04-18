const FNV_OFFSET_BASIS = 2166136261;
const FNV_PRIME = 16777619;

/**
 * Process the hash string to uint32.
 * @param value - The value.
 * @returns The hash string to uint32.
 */
const hashStringToUint32 = (value: string) => {
  let hash = FNV_OFFSET_BASIS;

  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, FNV_PRIME);
  }

  return hash >>> 0;
};

/**
 * Return the favicon tint colors.
 * @param urls - The urls.
 * @returns The favicon tint colors.
 */
export function getFaviconTintColors(urls: (string | undefined)[]) {
  const seedSource =
    urls.find((url) => Boolean(url?.trim())) ??
    urls.find(Boolean) ??
    "librerss-default";
  const hash = hashStringToUint32(seedSource);
  const hue = hash % 360;
  const saturation = 62 + (hash % 16);
  const foregroundLightness = 38 + ((hash >>> 7) % 14);
  const backgroundLightness = 88 + ((hash >>> 13) % 6);

  return {
    background: `hsl(${hue} ${Math.max(42, saturation - 18)}% ${backgroundLightness}% / 0.35)`,
    foreground: `hsl(${hue} ${saturation}% ${foregroundLightness}%)`,
  };
}
