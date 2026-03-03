/**
 * Build a Content-Security-Policy header value with nonces.
 *
 * Note: This is available for testing purposes. In production,
 * CSP is configured in next.config.ts with 'unsafe-inline' to
 * support Next.js's dynamic style injection.
 *
 * @param scriptNonce - Nonce for script-src directive
 * @param styleNonce - Nonce for style-src directive
 * @returns CSP header value string
 */
export function buildCspHeader(
  scriptNonce: string,
  styleNonce: string,
): string {
  return [
    "default-src 'self'",
    `script-src 'self' 'nonce-${scriptNonce}' 'strict-dynamic'`,
    `style-src 'self' 'nonce-${styleNonce}' 'unsafe-inline'`,
    "img-src 'self' data: https: blob:",
    "font-src 'self' data:",
    "connect-src 'self'",
    "frame-ancestors 'none'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "worker-src 'self'",
  ].join("; ");
}
