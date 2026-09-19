import type { Metadata, Viewport } from "next";
import { Inter, Noto_Sans_Devanagari } from "next/font/google";
import { AppShell } from "@/components/layout/app-shell";
import "./globals.css";

/**
 * Latin UI face. Variable weights 400–800 cover the whole type scale.
 */
const inter = Inter({
  subsets: ["latin"],
  variable: "--font-ui-latin",
  display: "swap",
  weight: ["400", "500", "600", "700", "800"],
});

/**
 * Devanagari face. Roughly half of SwasthTrack's copy is Hindi, so this is a
 * first-class UI font, not a fallback.
 */
const notoDevanagari = Noto_Sans_Devanagari({
  subsets: ["devanagari", "latin"],
  variable: "--font-ui-devanagari",
  display: "swap",
  weight: ["400", "500", "600", "700"],
});

export const viewport: Viewport = {
  // Kept in sync with theme_color in src/app/manifest.ts, the single source
  // of truth for the web app manifest.
  themeColor: "#059669",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export const metadata: Metadata = {
  title: "SwasthTrack — Health Intelligence & Family Care",
  description: "A personal health tracking and family care companion for parents and caregivers.",
  applicationName: "SwasthTrack",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "SwasthTrack",
  },
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
      <head>
        {/* src/app/manifest.ts (the file-convention route) already injects
            the <link rel="manifest"> tag pointing at /manifest.webmanifest;
            a second manual tag here would compete with it. */}
        <meta name="mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="default" />
        <meta name="apple-mobile-web-app-title" content="SwasthTrack" />
      </head>
      <body className="min-h-full bg-canvas text-ink font-sans">
        <AppShell>{children}</AppShell>
      </body>
    </html>
  );
}
