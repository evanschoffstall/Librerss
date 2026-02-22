declare module "sanitize-html" {
  interface SanitizeOptions {
    allowedTags?: string[];
    allowedAttributes?: Record<string, string[]>;
    allowedSchemes?: string[];
    transformTags?: Record<
      string,
      (
        tagName: string,
        attribs: Record<string, string>,
      ) => {
        tagName: string;
        attribs: Record<string, string>;
      }
    >;
  }

  function sanitizeHtml(dirty: string, options?: SanitizeOptions): string;

  export default sanitizeHtml;
}
