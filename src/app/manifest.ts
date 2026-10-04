import type { MetadataRoute } from "next";
import { BRAND_COLOR, CANVAS_COLOR } from "@/lib/brand";

export default function manifest(): MetadataRoute.Manifest {
  return {
    // A stable identity, so changing start_url later does not make browsers
    // treat the installed app as a different one.
    id: "/",
    name: "SwasthTrack — Health Intelligence & Family Care",
    short_name: "SwasthTrack",
    description:
      "A personalized health tracking and family care companion for parents and caregivers.",
    start_url: "/",
    scope: "/",
    lang: "hi",
    dir: "ltr",
    display: "standalone",
    categories: ["health", "medical"],
    // Same values as the --color-canvas / --color-brand tokens (src/lib/brand.ts).
    background_color: CANVAS_COLOR,
    theme_color: BRAND_COLOR,
    icons: [
      // The base artwork runs almost to the edge of the canvas, so it is only
      // honest to declare it as "any". The maskable files are the same art
      // scaled into the central 80% safe zone on the same black field.
      {
        src: "/icons/icon-192x192.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icons/icon-512x512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icons/icon-maskable-192x192.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "maskable",
      },
      {
        src: "/icons/icon-maskable-512x512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
    shortcuts: [
      {
        name: "BP दर्ज करें",
        short_name: "Log BP",
        description: "Record a blood pressure reading",
        url: "/health",
      },
      {
        name: "दवाइयाँ",
        short_name: "Medicines",
        description: "Mark today's medicines",
        url: "/medicines",
      },
      {
        name: "डेटा से पूछें",
        short_name: "Ask",
        description: "Ask SwasthTrack about your data",
        url: "/ask",
      },
    ],
  };
}
