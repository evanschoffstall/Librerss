/**
 * HTML sanitization — the MANDATORY first entry point for all raw HTML
 * entering the sanitization pipeline.
 *
 * This module must be called BEFORE any other HTML processing (parsing,
 * extraction, transformation, or sanitization). It provides a hardened
 * defense against malicious markup (XSS, script injection, data exfiltration)
 * before any downstream logic touches the content.
 *
 * CRITICAL: No raw HTML from upstream sources (feed fetchers, article
 * extractors, user input, external APIs) should bypass this step.
 */

import sanitizeHtml from "sanitize-html";

/**
 * Purify raw HTML with hardened configuration.
 *
 * This is the MANDATORY first step for ALL raw HTML entering lib/sanitize.
 * Strips script tags, event handlers, dangerous protocols, and other XSS
 * vectors before any downstream processing.
 *
 * Configuration:
 * - Allows a broad set of tags and attributes for subsequent processing
 * - Removes all script/event handler attributes
 * - Blocks javascript:, data:, and vbscript: protocols
 * - Normalizes markup for consistent downstream parsing
 *
 * This is NOT the final sanitization step — downstream modules apply
 * additional content-specific filtering (image size limits, promotional
 * block removal, etc.). This step only provides baseline XSS protection.
 */
export function purifyRawHtml(rawHtml: string): string {
  if (!rawHtml || typeof rawHtml !== "string") {
    return "";
  }

  const purified = sanitizeHtml(rawHtml, {
    allowedTags: [
      "html",
      "head",
      "body",
      "div",
      "span",
      "p",
      "br",
      "a",
      "strong",
      "em",
      "b",
      "i",
      "u",
      "s",
      "strike",
      "abbr",
      "code",
      "pre",
      "blockquote",
      "cite",
      "q",
      "mark",
      "small",
      "sub",
      "sup",
      "time",
      "h1",
      "h2",
      "h3",
      "h4",
      "h5",
      "h6",
      "ul",
      "ol",
      "li",
      "dl",
      "dt",
      "dd",
      "table",
      "thead",
      "tbody",
      "tfoot",
      "tr",
      "th",
      "td",
      "caption",
      "colgroup",
      "col",
      "figure",
      "figcaption",
      "img",
      "picture",
      "source",
      "video",
      "audio",
      "track",
      "article",
      "section",
      "nav",
      "aside",
      "header",
      "footer",
      "main",
      "address",
      "details",
      "summary",
      "hr",
      "noscript",
      "meta",
      "link",
      "title",
    ],
    allowedAttributes: {
      "*": ["class", "id", "lang", "dir", "title", "data-*"],
      a: ["href", "name", "target", "rel"],
      img: [
        "src",
        "srcset",
        "sizes",
        "alt",
        "width",
        "height",
        "loading",
        "decoding",
        "fetchpriority",
        "crossorigin",
        "referrerpolicy",
      ],
      source: ["src", "srcset", "sizes", "type", "media"],
      video: ["src", "width", "height"],
      audio: ["src"],
      track: ["src", "kind", "srclang", "label"],
      time: ["datetime"],
      blockquote: ["cite"],
      q: ["cite"],
      meta: ["name", "content", "property"],
      link: ["rel", "href", "type", "media"],
      table: ["cellspacing", "cellpadding"],
      td: ["colspan", "rowspan", "scope", "align", "valign"],
      th: ["colspan", "rowspan", "scope", "align", "valign"],
      ol: ["start", "reversed", "type"],
      details: ["open"],
    },
    allowedSchemes: [
      "http",
      "https",
      "mailto",
      "tel",
      "callto",
      "sms",
      "cid",
      "xmpp",
    ],
    allowedSchemesByTag: {
      img: ["http", "https"],
      // data: URIs are intentionally excluded — data:image/svg+xml can execute scripts
      source: ["http", "https"],
      video: ["http", "https"],
      audio: ["http", "https"],
      track: ["http", "https"],
    },
    allowProtocolRelative: false,
  });

  return purified;
}
