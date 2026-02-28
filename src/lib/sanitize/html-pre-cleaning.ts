/**
 * Remove the entire subtree of the first element whose `id` exactly matches
 * `idValue`.  Uses depth-counting so nested tags of the same type are handled
 * correctly.  Returns the original string when no match is found.
 */
function removeElementById(rawHtml: string, idValue: string): string {
  const escaped = idValue.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  // Use ["'] bracket instead of a backreference — simpler and avoids group
  // numbering bugs. Attribute values in HTML are always quoted in practice.
  const startRe = new RegExp(
    `<([a-z][a-z0-9:-]*)\\b[^>]*\\bid=["']${escaped}["'][^>]*>`,
    "i",
  );

  const startMatch = startRe.exec(rawHtml);
  if (!startMatch) return rawHtml;

  const tagName = startMatch[1];
  if (!tagName) return rawHtml;
  const startIdx = startMatch.index;
  const afterOpenTag = startIdx + startMatch[0].length;

  const tagRe = new RegExp(`<\\/?${tagName}\\b[^>]*>`, "gi");
  tagRe.lastIndex = afterOpenTag;
  let depth = 1;
  let endIdx = -1;
  let m: RegExpExecArray | null;

  while (depth > 0 && (m = tagRe.exec(rawHtml)) !== null) {
    if (m[0].startsWith("</")) depth--;
    else depth++;
    if (depth === 0) endIdx = m.index + m[0].length;
  }

  if (endIdx < 0) return rawHtml;
  return rawHtml.slice(0, startIdx) + rawHtml.slice(endIdx);
}

/**
 * Strip known noise containers from raw article HTML **before** passing to the
 * content extractor.  This prevents the extractor from picking comment widgets,
 * paywall overlays, recirculation blocks, or site-chrome as the primary article
 * body.
 *
 * Background — why pre-cleaning is necessary:
 * The article extractor uses heuristic selectors to find the article body
 * container.  However, large non-article nodes (footers, comment widgets,
 * link-heavy navigation) can interfere with correct selection when their
 * byte size or density rivals the article body.
 *
 * Specific cases that drove each removal rule:
 *
 * `<header>` / `<footer>` — Sites with dense navigation or copyright footers
 * (dozens of nav links, social icons, tag lists) can produce a footer whose
 * raw link density exceeds the main article area.  Readability selected such
 * a footer as the primary content block in tested scenarios, returning site
 * navigation HTML instead of the article text.
 *
 * Pure-link `<ul>` lists — "Tag cloud" and hashtag panels rendered as
 * `<ul><li><a>…</a></li>…</ul>` accumulate link density rapidly.  When such
 * a panel appears in DOM order *before* the article body and contains 30+
 * items, Readability scores it above the article.  The panel then gets
 * correctly identified as boilerplate by `isLikelyNavFooterBoilerplate` and
 * discarded — leaving the pipeline with no content at all.
 *
 * Comment widgets / paywall overlays — Large interactive widgets injected near
 * the article end.  Some paywall scripts insert substantial visible text that
 * Readability can absorb into its candidate selection.
 *
 * `<aside data-nosnippet>` — Publisher-marked recirculation blocks.  The
 * `data-nosnippet` attribute is the canonical signal that a block must not
 * be treated as primary content.
 */
export function preCleanHtmlForExtraction(rawHtml: string): string {
  let html = rawHtml
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, "")
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, "");

  // Remove <header> and <footer> before extraction.
  //
  // Finding: Readability uses link-density scoring.  A site footer that
  // contains 30-50 nav/social/copyright links can score higher than an article
  // body of equal byte size, especially when the article uses minimal semantic
  // markup (e.g. bare divs instead of <article>/<p>).  In tested scenarios the
  // extractor returned the footer's navigation HTML as the "article", producing
  // hundreds of useless link characters instead of prose content.
  //
  // These are standard HTML5 sectioning elements whose purpose is unambiguous;
  // stripping them unconditionally is safe — they never contain article body.
  html = html.replace(/<header\b[^>]*>[\s\S]*?<\/header>/gi, "");
  html = html.replace(/<footer\b[^>]*>[\s\S]*?<\/footer>/gi, "");

  // Known comment / engagement widget container ids.
  const idsToRemove = [
    "viafoura-comments",
    "viafoura-comments-container",
    "viafoura-comment-wrapper",
    "kiosq-app-paywall-js",
    "kiosq-app",
    "coral-display-comments",
    "comment-container",
    "mj-comments-container",
  ];

  for (const id of idsToRemove) {
    html = removeElementById(html, id);
  }

  // Remove "pure link lists" — <ul> blocks where every <li> contains only a
  // single <a> element with no surrounding text.  These are non-content
  // navigation constructs: tag clouds, hashtag panels, breadcrumb trees,
  // sidebar link collections.
  //
  // Finding: After footer removal, Readability selected a 30-item tag-cloud
  // <ul> that appeared ~3,800 bytes *before* the article body in DOM order.
  // Because every list item was a bare hyperlink the block had 100% link
  // density — the highest possible Readability score — so it was chosen as the
  // candidate node.  `isLikelyNavFooterBoilerplate` then correctly discarded
  // it, but that left the pipeline with zero content and forced a metadata-only
  // fallback (363 chars of og:description instead of the full article).
  //
  // The 8-item threshold is intentional: genuine article bullet lists may
  // consist entirely of hyperlinks (e.g. "Related reading" sections) but
  // rarely exceed 7-8 items.  Navigation clouds have 15-100+ items.
  html = html.replace(/<ul\b[^>]*>[\s\S]*?<\/ul>/gi, (ulBlock) => {
    const items = [...ulBlock.matchAll(/<li\b[^>]*>([\s\S]*?)<\/li>/gi)];
    if (items.length < 8) return ulBlock;
    const allPureLinks = items.every((m) =>
      /^\s*<a\b[^>]*>[\s\S]*?<\/a>\s*$/i.test((m[1] ?? "").trim()),
    );
    return allPureLinks ? "" : ulBlock;
  });

  // Remove <aside data-nosnippet> recirculation / promo blocks.
  html = html.replace(
    /<aside\b[^>]*\bdata-nosnippet\b[^>]*>[\s\S]*?<\/aside>/gi,
    "",
  );

  // Remove social share link blocks — <ul> blocks where every <li> contains
  // only a social-sharing <a> (facebook sharer, twitter/x intent, whatsapp,
  // mailto share links).  These are non-content widgets that pollute
  // extraction when they appear inside article body containers.
  html = html.replace(/<ul\b[^>]*>[\s\S]*?<\/ul>/gi, (ulBlock) => {
    const items = [...ulBlock.matchAll(/<li\b[^>]*>([\s\S]*?)<\/li>/gi)];
    if (items.length === 0) return ulBlock;
    const allShareLinks = items.every((m) => {
      const inner = (m[1] ?? "").trim();
      if (!/^\s*<a\b[^>]*>[\s\S]*?<\/a>\s*$/i.test(inner)) return false;
      return /facebook\.com\/sharer|x\.com\/intent\/tweet|twitter\.com\/intent\/tweet|whatsapp(?:\.com|:\/\/)|mailto:\?/i.test(
        inner,
      );
    });
    return allShareLinks ? "" : ulBlock;
  });

  return html;
}
