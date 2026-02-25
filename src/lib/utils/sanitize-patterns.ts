export const AP_JUNK_CLASS_PATTERN =
  /(?:hub[\s_-]?peek|related[\s_-]?stories|related[\s_-]?content|related[\s_-]?links|more[\s_-]?on|tag[\s_-]?page|inline[\s_-]?module)/i;

export const RELATED_HEADING_PATTERN =
  /^\s*(?:more\s+on|related(?:\s+(?:stories|articles|content|links|news))?|see\s+also|also\s+(?:of\s+interest|read)|you\s+may\s+(?:also\s+)?like|trending\s+now|popular\s+now|from\s+our\s+partners)\b/i;

export const ARTICLE_SANITIZE_OPTIONS = {
  allowedTags: [
    "p",
    "br",
    "h1",
    "h2",
    "h3",
    "h4",
    "h5",
    "h6",
    "ul",
    "ol",
    "li",
    "blockquote",
    "pre",
    "code",
    "strong",
    "em",
    "b",
    "i",
    "u",
    "a",
    "img",
    "hr",
  ],
  nonTextTags: [
    "style",
    "script",
    "textarea",
    "aside",
    "nav",
    "section",
    "iframe",
  ],
  allowedAttributes: {
    a: ["href", "name", "target", "rel"],
    img: [
      "src",
      "srcset",
      "sizes",
      "alt",
      "title",
      "width",
      "height",
      "loading",
      "decoding",
      "referrerpolicy",
    ],
    code: ["class"],
    pre: ["class"],
  },
  allowedSchemes: ["http", "https", "mailto"],
  allowedSchemesByTag: {
    img: ["http", "https"],
  },
  transformTags: {
    a: (tagName: string, attribs: Record<string, string>) => ({
      tagName,
      attribs: {
        ...attribs,
        rel: "noopener noreferrer nofollow",
        target: "_blank",
      },
    }),
    img: (tagName: string, attribs: Record<string, string>) => ({
      tagName,
      attribs: {
        ...attribs,
        referrerpolicy: attribs.referrerpolicy || "no-referrer",
        loading: attribs.loading || "lazy",
      },
    }),
  },
};
