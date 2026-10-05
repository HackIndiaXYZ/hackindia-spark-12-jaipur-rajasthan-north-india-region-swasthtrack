import type { Metadata, Viewport } from "next";
import { Inter, Noto_Sans_Devanagari } from "next/font/google";
import { AppShell } from "@/components/layout/app-shell";
import { THEME_COLOR } from "@/lib/brand";
import "./globals.css";

/**
 * Latin UI face (variable, so one file covers every weight in the type scale).
 */
const inter = Inter({
  subsets: ["latin"],
  variable: "--font-ui-latin",
  display: "swap",
});

/**
 * Devanagari face. Roughly half of SwasthTrack's copy is Hindi, so this is a
 * first-class UI font, not a fallback. Inter carries Latin and digits (it is
 * first in the font stack), so only the Devanagari subset is shipped.
 */
const notoDevanagari = Noto_Sans_Devanagari({
  subsets: ["devanagari"],
  variable: "--font-ui-devanagari",
  display: "swap",
});

export const viewport: Viewport = {
  // Same value as theme_color in src/app/manifest.ts (both from lib/brand.ts).
  themeColor: THEME_COLOR,
  colorScheme: "light",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export const metadata: Metadata = {
  title: {
    default: "SwasthTrack — Health Intelligence & Family Care",
    template: "%s · SwasthTrack",
  },
  description: "A personal health tracking and family care companion for parents and caregivers.",
  applicationName: "SwasthTrack",
  // Emits mobile-web-app-capable, apple-mobile-web-app-title and
  // apple-mobile-web-app-status-bar-style. No hand-written <meta> duplicates.
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "SwasthTrack",
  },
  // iOS Safari otherwise turns a reading like "120/80" or "98765" into a phone link.
  formatDetection: { telephone: false, email: false, address: false },
  // Older iOS only honours the apple- prefixed capability tag, which
  // `appleWebApp` does not emit.
  other: { "apple-mobile-web-app-capable": "yes" },
  icons: {
    icon: [
      { url: "/favicon.png", sizes: "64x64", type: "image/png" },
      { url: "/icons/icon-192x192.png", sizes: "192x192", type: "image/png" },
    ],
    apple: [
      { url: "/icons/apple-touch-icon.png", sizes: "180x180", type: "image/png" },
    ],
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="hi"
      className={`h-full antialiased ${inter.variable} ${notoDevanagari.variable}`}
    >
      <body className="min-h-dvh bg-canvas font-sans text-ink">
        <AppShell>{children}</AppShell>
      </body>
    </html>
  );
}
