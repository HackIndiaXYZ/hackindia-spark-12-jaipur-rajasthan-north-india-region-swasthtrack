import type { NextConfig } from "next";

/**
 * Security headers for every response. Not included, on purpose: a
 * Content-Security-Policy. Next injects inline bootstrap scripts, Supabase needs
 * a connect-src for the project URL, and a wrong policy blanks the whole app;
 * it cannot be verified without running the app, so it is left to a separate,
 * tested change (see the nonce-based setup in the Next.js CSP guide).
 */
const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  // Features the product never uses are switched off; camera/microphone stay
  // available to the app itself but not to anything embedded in it.
  {
    key: "Permissions-Policy",
    value:
      "camera=(self), microphone=(self), geolocation=(), payment=(), usb=(), bluetooth=(), interest-cohort=()",
  },
];

const nextConfig: NextConfig = {
  async headers() {
    return [
      { source: "/:path*", headers: securityHeaders },
      {
        // A cached worker script would pin users to an old version of it.
        source: "/sw.js",
        headers: [
          { key: "Content-Type", value: "application/javascript; charset=utf-8" },
          { key: "Cache-Control", value: "no-cache, no-store, must-revalidate" },
        ],
      },
    ];
  },
};

export default nextConfig;
