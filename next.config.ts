import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: [
    "got-scraping",
    "header-generator",
    "generative-bayesian-network",
  ],
  outputFileTracingIncludes: {
    // header-generator loads its bayesian network definitions from zip files at
    // runtime via __dirname.  Next.js standalone file tracing does not discover
    // these data files automatically, so they must be explicitly included so the
    // module can initialise correctly in production.
    "/api/**": [
      "./node_modules/header-generator/data_files/**",
      "./node_modules/generative-bayesian-network/**",
    ],
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          {
            key: "X-Frame-Options",
            value: "DENY",
          },
          {
            key: "X-Content-Type-Options",
            value: "nosniff",
          },
          {
            key: "Referrer-Policy",
            value: "strict-origin-when-cross-origin",
          },
          {
            key: "Permissions-Policy",
            value:
              "accelerometer=(), camera=(), geolocation=(), gyroscope=(), magnetometer=(), microphone=(), payment=(), usb=()",
          },
          {
            key: "Cross-Origin-Opener-Policy",
            value: "same-origin",
          },
          {
            // SECURITY: HSTS prevents SSL-stripping and MITM on subsequent
            // visits.  One-year max-age with includeSubDomains is the
            // OWASP-recommended baseline.  Remove or shorten during initial
            // rollout if you have HTTP-only subdomains.
            key: "Strict-Transport-Security",
            value: "max-age=31536000; includeSubDomains",
          },
          {
            // Mitigates reflected / stored XSS by constraining resource
            // loading origins. 'unsafe-inline' is required for Next.js
            // style injection; adopt nonces for stricter enforcement.
            key: "Content-Security-Policy",
            value: [
              "default-src 'self'",
              "script-src 'self' 'unsafe-inline'", //strict does not permit the app to work as is.
              "style-src 'self' 'unsafe-inline'",
              "img-src 'self' data: https: blob:",
              "font-src 'self' data:",
              "connect-src 'self'",
              "frame-ancestors 'none'",
              "object-src 'none'",
              "base-uri 'self'",
              // Restrict form submissions to same origin — prevents a
              // mis-directed form (e.g. from a stored XSS payload) submitting
              // credentials to an attacker-controlled endpoint.
              "form-action 'self'",
              // Disallow service workers from any origin other than self.
              // A rogue SW can intercept all same-origin requests indefinitely.
              "worker-src 'self'",
            ].join("; "),
          },
        ],
      },
    ];
  },
};

export default nextConfig;
