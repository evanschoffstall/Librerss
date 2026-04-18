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

const PURIFY_ALLOWED_ATTRIBUTES: Record<string, string[]> = {
  "*": ["class", "id", "lang", "dir", "title", "data-*"],
  a: ["href", "name", "target", "rel"],
  audio: ["src"],
  blockquote: ["cite"],
  details: ["open"],
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
  link: ["rel", "href", "type", "media"],
  meta: ["name", "content", "property"],
  ol: ["start", "reversed", "type"],
  q: ["cite"],
  source: ["src", "srcset", "sizes", "type", "media"],
  table: ["cellspacing", "cellpadding"],
  td: ["colspan", "rowspan", "scope", "align", "valign"],
  th: ["colspan", "rowspan", "scope", "align", "valign"],
  time: ["datetime"],
  track: ["src", "kind", "srclang", "label"],
  video: ["src", "width", "height"],
};

const PURIFY_ALLOWED_SCHEMES = [
  "http",
  "https",
  "mailto",
  "tel",
  "callto",
  "sms",
  "cid",
  "xmpp",
];

const PURIFY_ALLOWED_SCHEMES_BY_TAG: Record<string, string[]> = {
  audio: ["http", "https"],
  img: ["http", "https"],
  source: ["http", "https"],
  track: ["http", "https"],
  video: ["http", "https"],
};

const PURIFY_ALLOWED_TAGS = [
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
];

const PURIFY_OPTIONS = {
  allowedAttributes: PURIFY_ALLOWED_ATTRIBUTES,
  allowedSchemes: [...PURIFY_ALLOWED_SCHEMES],
  allowedSchemesByTag: PURIFY_ALLOWED_SCHEMES_BY_TAG,
  allowedTags: [...PURIFY_ALLOWED_TAGS],
  allowProtocolRelative: false,
} satisfies Parameters<typeof sanitizeHtml>[1];

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
 * - Normalizes markup for consistent downstream parsing.
 *
 * This is NOT the final sanitization step — downstream modules apply
 * additional content-specific filtering (image size limits, promotional
 * block removal, etc.). This step only provides baseline XSS protection.
 * @param rawHtml
 */
export function purifyRawHtml(rawHtml: string): string {
  if (!rawHtml || typeof rawHtml !== "string") {
    return "";
  }

  return sanitizeHtml(rawHtml, PURIFY_OPTIONS);
}
