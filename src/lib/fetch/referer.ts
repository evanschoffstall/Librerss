export function buildDdgReferer(url: string): string {
  try {
    const segments = new URL(url).pathname.split("/").filter(Boolean);
    const slug = segments[segments.length - 1] ?? "";
    const q =
      slug
        .replace(/\.[^.]+$/, "")
        .replace(/[-_]/g, " ")
        .trim() || "news right now";
    return `https://duckduckgo.com/?q=${encodeURIComponent(q).replace(/%20/g, "+")}&ia=web`;
  } catch {
    return "https://duckduckgo.com/?q=news+right+now&ia=web";
  }
}
