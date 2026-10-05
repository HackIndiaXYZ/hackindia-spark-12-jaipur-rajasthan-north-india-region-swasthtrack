import { useId } from "react";
import { WORDMARK as W } from "./wordmark-paths";

/**
 * The SwasthTrack wordmark: "Swasth" in navy, "Track" in green, a sprout
 * growing out of the S and a heartbeat line (ending in a gold bead) running
 * under the word. The letters are outlines (Nunito Black, SIL OFL), so it looks
 * the same on every device and needs no web font.
 *
 *   full     letters + sprout + heartbeat. Login, splash, hero spots.
 *   compact  letters + sprout. Headers, sidebar, footer: at ~24px tall the
 *            heartbeat line would be a hairline, so it is left out there.
 *
 * Size it with the height only (`h-6 w-auto`); the width follows the viewBox.
 * The same artwork is published as /brand/wordmark.svg (and
 * /brand/wordmark-tagline.svg) for places that cannot render React: emails,
 * the offline page, sharing images.
 *
 * Gradient ids come from useId, so several wordmarks on one page never share
 * (or lose, when one sits inside a `display: none` sidebar) their paint.
 */

const LEFT = 18;
const TOP = 12;

export function Wordmark({
  variant = "full",
  decorative = false,
  className,
}: {
  variant?: "full" | "compact";
  /** Set when the brand name is already readable next to it. */
  decorative?: boolean;
  className?: string;
}) {
  const id = useId();
  const paint = (name: string) => `url(#${id}-${name})`;
  const full = variant === "full";
  const bottom = full ? W.heightFull : W.heightCompact;

  return (
    <svg
      viewBox={`${LEFT} ${TOP} ${W.width - LEFT * 2} ${bottom - TOP}`}
      role={decorative ? undefined : "img"}
      aria-label={decorative ? undefined : "SwasthTrack"}
      aria-hidden={decorative || undefined}
      focusable="false"
      className={className}
    >
      <defs>
        <linearGradient id={`${id}-navy`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#1b63b0" />
          <stop offset=".5" stopColor="#0c4286" />
          <stop offset="1" stopColor="#062b57" />
        </linearGradient>
        <linearGradient id={`${id}-green`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#3ed577" />
          <stop offset=".5" stopColor="#17a35c" />
          <stop offset="1" stopColor="#0a6b43" />
        </linearGradient>
        {/* Lit top edge: the same glossy reflection the gilded cards carry. */}
        <linearGradient id={`${id}-gloss`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#fff" stopOpacity=".2" />
          <stop offset=".46" stopColor="#fff" stopOpacity=".04" />
          <stop offset=".5" stopColor="#fff" stopOpacity="0" />
        </linearGradient>
        <linearGradient id={`${id}-leaf`} x1="0" y1="1" x2="1" y2="0">
          <stop offset="0" stopColor="#0f9d58" />
          <stop offset="1" stopColor="#43d77a" />
        </linearGradient>
        <linearGradient id={`${id}-leaf2`} x1="1" y1="1" x2="0" y2="0">
          <stop offset="0" stopColor="#0e8f52" />
          <stop offset="1" stopColor="#36c96d" />
        </linearGradient>
        {full ? (
          <>
            <linearGradient
              id={`${id}-pulse`}
              gradientUnits="userSpaceOnUse"
              x1={W.pulseFrom}
              y1="0"
              x2={W.pulseTo}
              y2="0"
            >
              <stop offset="0" stopColor="#0c4286" stopOpacity=".05" />
              <stop offset=".28" stopColor="#0f6fa0" />
              <stop offset=".62" stopColor="#17a35c" />
              <stop offset="1" stopColor="#17a35c" />
            </linearGradient>
            <radialGradient id={`${id}-gold`} cx=".38" cy=".3" r=".8">
              <stop offset="0" stopColor="#fff2b8" />
              <stop offset=".5" stopColor="#e8b83e" />
              <stop offset="1" stopColor="#b9801a" />
            </radialGradient>
          </>
        ) : null}
      </defs>

      <path d={W.swasth} fill={paint("navy")} />
      <path d={W.track} fill={paint("green")} />
      <path d={W.swasth} fill={paint("gloss")} />
      <path d={W.track} fill={paint("gloss")} />

      <g transform={`translate(${W.leaf.x} ${W.leaf.y}) scale(1.12)`}>
        <path d="M0 0C1-10 4-20 10-28" fill="none" stroke={paint("leaf")} strokeWidth="3.4" strokeLinecap="round" />
        <path d="M9-26C8-44 22-62 48-66 49-42 36-24 9-26Z" fill={paint("leaf")} />
        <path d="M9-26C24-40 34-50 46-62" fill="none" stroke="#fff" strokeOpacity=".5" strokeWidth="1.6" strokeLinecap="round" />
        <path d="M3-12C-10-14-20-24-22-38-8-38 2-28 3-12Z" fill={paint("leaf2")} />
      </g>

      {full ? (
        <>
          <path
            d={W.pulse}
            fill="none"
            stroke={paint("pulse")}
            strokeWidth="4.6"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <circle cx={W.dot.cx} cy={W.dot.cy} r={W.dot.r} fill={paint("gold")} />
        </>
      ) : null}
    </svg>
  );
}
