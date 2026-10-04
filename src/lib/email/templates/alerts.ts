import { alertBlock, callout, emailShell, esc, heading, kv, openApp, pair, toText, C } from "../layout";
import type { EmailAlert, RenderOptions, RenderedEmail, WeightAlertData } from "../types";

const ALERT_REASON = {
  hi: "आपने इस मरीज़ के स्वास्थ्य अलर्ट चालू रखे हैं",
  en: "You have health alerts turned on for this patient",
};

/**
 * Generic alert mail: one or more alerts as coloured blocks. Used for the
 * immediate BP alert and for the midday "missed / not logged" reminder.
 */
export function renderAlertEmail(
  patientName: string,
  alerts: EmailAlert[],
  subject: string,
  opts: RenderOptions = {},
): RenderedEmail {
  const many = alerts.length > 1;
  const body =
    heading(
      `${patientName} के लिए ${many ? `${alerts.length} ` : ""}स्वास्थ्य अलर्ट`,
      `Health alert${many ? "s" : ""} for ${patientName}`,
    ) +
    alerts.map(alertBlock).join("") +
    openApp(alerts[0]?.path ?? "/");

  const html = emailShell({
    title: subject,
    preheader: alerts[0] ? `${alerts[0].titleHi} · ${alerts[0].titleEn}` : "SwasthTrack alert",
    body,
    reasonHi: ALERT_REASON.hi,
    reasonEn: ALERT_REASON.en,
    sample: opts.sample,
  });
  return { subject, html, text: toText(html) };
}

/** Rapid weight gain / loss between two weigh-ins. */
export function renderWeightAlertEmail(d: WeightAlertData, opts: RenderOptions = {}): RenderedEmail {
  const gained = d.changeKg > 0;
  const abs = Math.abs(d.changeKg);
  const sign = gained ? "+" : "−";
  const subject = `⚠️ SwasthTrack · ${d.patientName} · weight ${sign}${abs} kg in ${d.days} day${d.days === 1 ? "" : "s"}`;

  const body =
    heading("वज़न में तेज़ बदलाव", `Rapid weight change for ${d.patientName}`) +
    callout(
      "warn",
      `${d.previousKg} kg → ${d.currentKg} kg (${sign}${abs} kg, ${d.days} दिन में)`,
      `${gained ? "Gained" : "Lost"} ${abs} kg in ${d.days} day${d.days === 1 ? "" : "s"} — ${d.ruleEn}`,
      d.ruleHi,
    ) +
    kv([
      { label: "पिछला वज़न · Previous", value: `${esc(d.previousKg)} kg` },
      { label: "अभी का वज़न · Latest", value: `${esc(d.currentKg)} kg` },
      {
        label: "बदलाव · Change",
        value: `<span style="color:${C.attention};">${sign}${esc(abs)} kg</span>`,
      },
    ]) +
    `<div style="height:14px;line-height:14px;font-size:0;">&nbsp;</div>` +
    pair(
      "वज़न अचानक बदलने की कई वजहें हो सकती हैं। अगर यह जारी रहे, या साथ में सूजन, कमज़ोरी या भूख में बदलाव दिखे, तो डॉक्टर को ज़रूर बताएं। खान-पान या दवा खुद से न बदलें।",
      "Sudden weight changes can have many causes. If it continues, or comes with swelling, weakness or a change in appetite, tell the doctor. Do not change food or medicines on your own.",
    ) +
    openApp("/health");

  const html = emailShell({
    title: subject,
    preheader: `${d.previousKg} → ${d.currentKg} kg (${sign}${abs} kg in ${d.days} days)`,
    body,
    reasonHi: ALERT_REASON.hi,
    reasonEn: ALERT_REASON.en,
    sample: opts.sample,
  });
  return { subject, html, text: toText(html) };
}
