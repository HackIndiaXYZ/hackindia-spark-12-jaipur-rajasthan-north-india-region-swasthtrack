/**
 * Shared look for every e-mail SwasthTrack sends (alerts, reports, account mail).
 * Mirrors supabase/email-templates/* so mail from Supabase Auth and mail from the
 * app look like they come from the same product: green header, gold rule, white
 * card, Hindi first with English underneath. Table layout + inline styles only,
 * because e-mail clients ignore most modern CSS.
 */

import type { EmailAlert, EmailSeverity } from "./types";

export const C = {
  page: "#f5f7f6",
  card: "#ffffff",
  line: "#e3e9e6",
  ink: "#14201d",
  muted: "#52625d",
  green: "#0f8a5f",
  greenSoft: "#f1f8f5",
  greenText: "#e6f5ee",
  gold: "#d8a936",
  goldSoft: "#fbf4e1",
  critical: "#b42318",
  criticalSoft: "#fdecea",
  criticalLine: "#f3b8b1",
  attention: "#9a5b00",
} as const;

const HI = "'Noto Sans Devanagari','Mukta','Nirmala UI','Mangal','Segoe UI',Arial,sans-serif";
const EN = "'Segoe UI',Roboto,Arial,sans-serif";
const MONO = "'Courier New',Courier,monospace";

export function esc(value: string | number): string {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** Absolute app link, or null when NEXT_PUBLIC_APP_URL is unset / still the placeholder. */
export function appUrl(path = ""): string | null {
  const base = process.env.NEXT_PUBLIC_APP_URL?.trim().replace(/\/$/, "");
  if (!base || !base.startsWith("http") || base.includes("your-domain")) return null;
  return `${base}${path}`;
}

interface TextOpts {
  size?: number;
  bold?: boolean;
  color?: string;
  mb?: number;
}

function line(font: string, text: string, o: TextOpts): string {
  return `<p style="margin:0 0 ${o.mb ?? 4}px 0;font-family:${font};font-size:${o.size ?? 13}px;line-height:${Math.round((o.size ?? 13) * 1.5)}px;${o.bold ? "font-weight:700;" : ""}color:${o.color ?? C.ink};">${esc(text)}</p>`;
}

/** Hindi line. */
export function hi(text: string, o: TextOpts = {}): string {
  return line(HI, text, { size: 13, ...o });
}

/** English line (muted by default, it is the secondary language). */
export function en(text: string, o: TextOpts = {}): string {
  return line(EN, text, { size: 12, color: C.muted, ...o });
}

/** Hindi headline with the English one under it. */
export function heading(hiText: string, enText: string): string {
  return `${hi(hiText, { size: 16, bold: true, mb: 2 })}${en(enText, { size: 12.5, bold: true, color: C.ink, mb: 10 })}`;
}

/** Hindi paragraph followed by its English twin. */
export function pair(hiText: string, enText: string): string {
  return `${hi(hiText, { mb: 2 })}${en(enText, { mb: 10 })}`;
}

export function sectionTitle(hiText: string, enText: string): string {
  return `<p style="margin:14px 0 5px 0;font-family:${EN};font-size:10.5px;line-height:14px;font-weight:700;letter-spacing:.8px;text-transform:uppercase;color:${C.green};">${esc(hiText)} · ${esc(enText)}</p>`;
}

type CalloutTone = "info" | "warn" | "danger" | "ok";

const CALLOUT: Record<CalloutTone, { bg: string; bar: string; title: string }> = {
  info: { bg: C.greenSoft, bar: C.line, title: C.ink },
  ok: { bg: C.greenSoft, bar: C.green, title: C.green },
  warn: { bg: C.goldSoft, bar: C.gold, title: C.ink },
  danger: { bg: C.criticalSoft, bar: C.critical, title: C.critical },
};

export function callout(
  tone: CalloutTone,
  titleHi: string,
  titleEn: string,
  bodyHi?: string,
  bodyEn?: string,
): string {
  const s = CALLOUT[tone];
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 8px 0;"><tr><td bgcolor="${s.bg}" style="background-color:${s.bg};border-left:3px solid ${s.bar};border-radius:6px;padding:8px 11px;">
${hi(titleHi, { size: 13, bold: true, color: s.title, mb: 1 })}${en(titleEn, { size: 11.5, mb: bodyHi || bodyEn ? 5 : 0 })}${bodyHi ? hi(bodyHi, { size: 12, mb: 1 }) : ""}${bodyEn ? en(bodyEn, { size: 11, mb: 0 }) : ""}
</td></tr></table>`;
}

/** Big monospace code in a gold-bordered box (invite code). */
export function codeBlock(code: string, labelHi: string, labelEn: string): string {
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:4px 0 12px 0;"><tr><td align="center" bgcolor="${C.greenSoft}" style="background-color:${C.greenSoft};border:2px solid ${C.gold};border-radius:12px;padding:12px 10px;">
<div style="font-family:${EN};font-size:10.5px;line-height:14px;color:${C.muted};letter-spacing:.8px;text-transform:uppercase;padding-bottom:5px;">${esc(labelHi)} / ${esc(labelEn)}</div>
<div style="font-family:${MONO};font-size:26px;line-height:32px;font-weight:700;color:${C.green};letter-spacing:6px;">${esc(code)}</div>
</td></tr></table>`;
}

/** Bulletproof button (a table cell, so Outlook renders it too). */
export function button(label: string, href: string): string {
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:10px 0 2px 0;"><tr><td bgcolor="${C.green}" style="background-color:${C.green};border-radius:8px;"><a href="${esc(href)}" style="display:inline-block;padding:8px 16px;font-family:${HI};font-size:12.5px;font-weight:700;color:#ffffff;text-decoration:none;">${esc(label)}</a></td></tr></table>`;
}

/** Open-in-app button, or nothing when the app URL is not configured. */
export function openApp(path: string, label = "ऐप में खोलें · Open in app"): string {
  const url = appUrl(path);
  return url ? button(label, url) : "";
}

/** Label / value rows. `value` is trusted HTML — escape user text with esc() before passing it. */
export function kv(rows: Array<{ label: string; value: string }>): string {
  const cell = `padding:4px 0;border-bottom:1px solid ${C.line};font-family:${EN};font-size:12px;line-height:17px;`;
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;">${rows
    .map(
      (r) =>
        `<tr><td style="${cell}color:${C.muted};">${esc(r.label)}</td><td align="right" style="${cell}font-weight:700;color:${C.ink};">${r.value}</td></tr>`,
    )
    .join("")}</table>`;
}

export function bullets(items: string[]): string {
  return `<ul style="margin:0 0 4px 0;padding-left:18px;font-family:${HI};font-size:12px;line-height:19px;color:${C.ink};">${items.map((i) => `<li>${esc(i)}</li>`).join("")}</ul>`;
}

const SEVERITY: Record<EmailSeverity, { tone: CalloutTone; label: string }> = {
  IMPORTANT: { tone: "danger", label: "ज़रूरी · Important" },
  ATTENTION: { tone: "warn", label: "ध्यान दें · Attention" },
  INFO: { tone: "info", label: "जानकारी · Info" },
};

/** One alert as a coloured callout with its own "open" link. */
export function alertBlock(a: EmailAlert): string {
  const s = SEVERITY[a.severity];
  const link = a.path ? appUrl(a.path) : null;
  return (
    callout(s.tone, a.titleHi, `${s.label} — ${a.titleEn}`, a.messageHi, a.messageEn) +
    (link
      ? `<p style="margin:-4px 0 8px 3px;font-family:${HI};font-size:11.5px;"><a href="${esc(link)}" style="color:${C.green};font-weight:700;">खोलें · Open →</a></p>`
      : "")
  );
}

export function toText(html: string): string {
  return html
    .replace(/<div[^>]*data-preheader[^>]*>.*?<\/div>/gis, "")
    .replace(/<(br|\/p|\/div|\/tr|\/h\d|\/li|\/table)[^>]*>/gi, "\n")
    .replace(/<\/t[dh]>/gi, "  ")
    .replace(/<a [^>]*href="([^"]+)"[^>]*>(.*?)<\/a>/gis, "$2 ($1)")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, "&")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export interface ShellOptions {
  /** <title> and screen-reader name; not shown in the card. */
  title: string;
  /** Inbox preview text. */
  preheader: string;
  body: string;
  /** Why this person is getting the mail, shown in the footer. */
  reasonHi?: string;
  reasonEn?: string;
  sample?: boolean;
}

export function emailShell(o: ShellOptions): string {
  const settings = appUrl("/settings");
  const sample = o.sample
    ? callout(
        "warn",
        "नमूना ईमेल",
        "Sample preview — the names and numbers below are made up, not real patient data.",
      )
    : "";
  return `<!DOCTYPE html>
<html lang="hi" xmlns="http://www.w3.org/1999/xhtml">
<head>
<meta http-equiv="Content-Type" content="text/html; charset=UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<meta name="x-apple-disable-message-reformatting" />
<meta name="color-scheme" content="light" />
<meta name="supported-color-schemes" content="light" />
<title>${esc(o.title)}</title>
</head>
<body style="margin:0;padding:0;background-color:${C.page};-webkit-text-size-adjust:100%;-ms-text-size-adjust:100%;">
<div data-preheader style="display:none;max-height:0;overflow:hidden;mso-hide:all;font-size:1px;line-height:1px;color:${C.page};opacity:0;">${esc(o.preheader)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="${C.page}" style="background-color:${C.page};"><tr><td align="center" style="padding:12px 8px;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:600px;width:100%;">
<tr><td align="center" bgcolor="${C.green}" style="background-color:${C.green};border-radius:12px 12px 0 0;padding:13px 18px 11px 18px;">
<div style="font-family:${EN};font-size:19px;line-height:24px;font-weight:700;color:#ffffff;letter-spacing:0.3px;">SwasthTrack</div>
<div style="font-family:${HI};font-size:11px;line-height:15px;color:${C.greenText};padding-top:1px;">परिवार की सेहत, एक जगह / Your family's health, in one place</div>
</td></tr>
<tr><td bgcolor="${C.gold}" height="3" style="background-color:${C.gold};height:3px;font-size:0;line-height:0;">&nbsp;</td></tr>
<tr><td bgcolor="${C.card}" style="background-color:${C.card};border-radius:0 0 12px 12px;padding:16px 18px 14px 18px;border:1px solid ${C.line};border-top:0;">
${sample}${o.body}
</td></tr>
<tr><td align="center" style="padding:10px 14px 2px 14px;">
${o.reasonHi ? `<p style="margin:0 0 4px 0;font-family:${HI};font-size:10.5px;line-height:15px;color:${C.muted};">${esc(o.reasonHi)}${o.reasonEn ? ` / ${esc(o.reasonEn)}` : ""}</p>` : ""}
${settings ? `<p style="margin:0 0 4px 0;font-family:${EN};font-size:10.5px;line-height:15px;"><a href="${esc(settings)}" style="color:${C.green};">ईमेल सेटिंग · Email settings</a></p>` : ""}
<p style="margin:0;font-family:${EN};font-size:10.5px;line-height:15px;color:${C.muted};">SwasthTrack एक ट्रैकिंग सहायक है, डॉक्टर की सलाह का विकल्प नहीं / A tracking aid, not a substitute for medical advice.</p>
</td></tr>
</table>
</td></tr></table>
</body>
</html>`;
}
