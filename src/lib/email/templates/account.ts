import {
  bullets,
  callout,
  codeBlock,
  emailShell,
  esc,
  heading,
  kv,
  openApp,
  pair,
  sectionTitle,
  toText,
} from "../layout";
import type {
  AccessChangedData,
  CaregiverInviteData,
  CaregiverJoinedData,
  CaregiverRole,
  RenderOptions,
  RenderedEmail,
  TestEmailData,
  WelcomeData,
} from "../types";

const ROLE: Record<CaregiverRole, { hi: string; en: string; hiHelp: string; enHelp: string }> = {
  editor: {
    hi: "एडिटर",
    en: "Editor",
    hiHelp: "आप BP, दवा, खाना जैसी readings दर्ज और बदल सकेंगे।",
    enHelp: "You will be able to add and edit readings such as BP, medicines and food.",
  },
  viewer: {
    hi: "सिर्फ़ देखने वाले",
    en: "Viewer",
    hiHelp: "आप सिर्फ़ देख सकेंगे, कुछ बदल नहीं सकेंगे।",
    enHelp: "You will be able to view everything but not change anything.",
  },
};

function finish(
  subject: string,
  preheader: string,
  body: string,
  opts: RenderOptions,
  reason?: { hi: string; en: string },
): RenderedEmail {
  const html = emailShell({
    title: subject,
    preheader,
    body,
    reasonHi: reason?.hi,
    reasonEn: reason?.en,
    sample: opts.sample,
  });
  return { subject, html, text: toText(html) };
}

export function renderWelcomeEmail(d: WelcomeData, opts: RenderOptions = {}): RenderedEmail {
  const body =
    heading(`नमस्ते ${d.name}, SwasthTrack में स्वागत है`, `Welcome to SwasthTrack, ${d.name}`) +
    pair(
      d.patientName
        ? `${d.patientName} का खाता तैयार है। हर दिन थोड़ा-थोड़ा दर्ज करें, बाकी हम संभाल लेंगे।`
        : "आपका खाता तैयार है। हर दिन थोड़ा-थोड़ा दर्ज करें, बाकी हम संभाल लेंगे।",
      d.patientName
        ? `${d.patientName}'s profile is ready. Log a little every day and we will do the rest.`
        : "Your account is ready. Log a little every day and we will do the rest.",
    ) +
    sectionTitle("शुरू कैसे करें", "Getting started") +
    bullets([
      "सुबह-शाम BP नापकर दर्ज करें (Log BP morning and evening)",
      "दवाइयाँ जोड़ें और लेते ही टिक करें (Add medicines and tick them off)",
      "खाना, कदम और नींद दर्ज करें (Log food, steps and sleep)",
      "परिवार के किसी सदस्य को केयरगिवर बनाएं (Invite a family member as caregiver)",
    ]) +
    sectionTitle("आपको कौन से ईमेल मिलेंगे", "Emails you will get") +
    bullets([
      "ज़रूरी अलर्ट: ऊँचा/कम BP, छूटी दवाई, डेटा दर्ज न होना (Important alerts)",
      "रोज़ रात की रिपोर्ट और हर हफ़्ते/महीने का सारांश (Daily, weekly and monthly reports)",
    ]) +
    openApp("/", "SwasthTrack खोलें · Open SwasthTrack");

  return finish(
    `SwasthTrack में स्वागत है, ${d.name} · Welcome`,
    "आपका खाता तैयार है · Your account is ready",
    body,
    opts,
    { hi: "आपने SwasthTrack पर खाता बनाया है", en: "You created a SwasthTrack account" },
  );
}

/** Sent from Settings to prove the SMTP path works and show what to expect. */
export function renderTestEmail(d: TestEmailData, opts: RenderOptions = {}): RenderedEmail {
  const body =
    heading("टेस्ट ईमेल सफल रहा", "Your test email arrived") +
    callout(
      "ok",
      "ईमेल सेटअप सही चल रहा है",
      "Email delivery is working",
      "अलर्ट और रिपोर्ट इसी पते पर आएंगे।",
      "Alerts and reports will be sent to this address.",
    ) +
    kv([
      { label: "भेजा गया · Sent to", value: esc(d.to) },
      { label: "समय · Sent at", value: esc(d.sentAtLabel) },
    ]) +
    sectionTitle("अगर यह स्पैम में आया", "If this landed in spam") +
    pair(
      "ईमेल को 'Not spam' चिह्नित करें और भेजने वाले को कॉन्टैक्ट में जोड़ लें, ताकि ज़रूरी अलर्ट न छूटें।",
      "Mark it 'Not spam' and add the sender to your contacts so important alerts are never missed.",
    ) +
    openApp("/settings");

  return finish(
    "SwasthTrack test email · ईमेल टेस्ट",
    "ईमेल सही चल रहा है · Email delivery is working",
    body,
    opts,
    { hi: "आपने टेस्ट ईमेल भेजा था", en: "You asked for a test email" },
  );
}

export function renderCaregiverInviteEmail(d: CaregiverInviteData, opts: RenderOptions = {}): RenderedEmail {
  const role = ROLE[d.role];
  const body =
    heading(
      `${d.inviterName} ने आपको ${d.patientName} की देखभाल में जोड़ा है`,
      `${d.inviterName} invited you to help care for ${d.patientName}`,
    ) +
    codeBlock(d.code, "आपका इनवाइट कोड", "Your invite code") +
    callout(
      "warn",
      `यह कोड ${d.minutesValid} मिनट में खत्म हो जाएगा (${d.expiresAtLabel})`,
      `This code expires in ${d.minutesValid} minutes (${d.expiresAtLabel}). Ask for a new one if it stops working.`,
    ) +
    sectionTitle("कोड कैसे इस्तेमाल करें", "How to join") +
    bullets([
      "SwasthTrack खोलें और इसी ईमेल से साइन-अप / लॉग-इन करें (Sign up or log in with this email)",
      "'मरीज़ जोड़ें' (Join patient) चुनें (Choose Join patient)",
      "ऊपर दिया 8 अक्षरों का कोड डालें (Enter the 8-character code)",
    ]) +
    sectionTitle("आपका एक्सेस", "Your access") +
    pair(`${role.hi}: ${role.hiHelp}`, `${role.en}: ${role.enHelp}`) +
    callout(
      "danger",
      "यह कोड सिर्फ़ उसी को दें जिसे आप जानते हैं",
      "Only share this code with someone you know and trust. Anyone with it can join as a caregiver until it expires.",
    ) +
    pair(
      "अगर आप इन्हें नहीं जानते, तो इस ईमेल को अनदेखा करें। कुछ नहीं होगा।",
      "If you do not know this person, just ignore this email. Nothing will happen.",
    ) +
    openApp("/", "SwasthTrack खोलें · Open SwasthTrack");

  return finish(
    `${d.inviterName} invited you to ${d.patientName} on SwasthTrack · इनवाइट कोड ${d.code}`,
    `आपका कोड ${d.code} · Your invite code is ${d.code}`,
    body,
    opts,
    { hi: "किसी ने आपको केयरगिवर के रूप में बुलाया है", en: "Someone invited you as a caregiver" },
  );
}

export function renderCaregiverJoinedEmail(d: CaregiverJoinedData, opts: RenderOptions = {}): RenderedEmail {
  const role = ROLE[d.role];
  const body =
    heading(
      `${d.caregiverName} अब ${d.patientName} की देखभाल से जुड़ गए हैं`,
      `${d.caregiverName} joined ${d.patientName}'s care team`,
    ) +
    kv([
      { label: "नाम · Name", value: esc(d.caregiverName) },
      ...(d.caregiverEmail ? [{ label: "ईमेल · Email", value: esc(d.caregiverEmail) }] : []),
      { label: "भूमिका · Role", value: `${esc(role.hi)} · ${esc(role.en)}` },
      { label: "कब · When", value: esc(d.joinedAtLabel) },
    ]) +
    `<div style="height:10px;line-height:10px;font-size:0;">&nbsp;</div>` +
    callout(
      "warn",
      "क्या आप इन्हें नहीं जानते?",
      "Do not recognise this person?",
      "सेटिंग्स में जाकर तुरंत इनका एक्सेस हटा दें।",
      "Open Settings and remove their access right away.",
    ) +
    openApp("/settings", "एक्सेस देखें · Review access");

  return finish(
    `${d.caregiverName} joined ${d.patientName} on SwasthTrack · नया केयरगिवर`,
    `${d.caregiverName} · ${role.en}`,
    body,
    opts,
    { hi: "आप इस मरीज़ के मालिक हैं", en: "You own this patient profile" },
  );
}

export function renderAccessChangedEmail(d: AccessChangedData, opts: RenderOptions = {}): RenderedEmail {
  if (d.change === "removed") {
    const body =
      heading("आपका एक्सेस हटा दिया गया है", "Your access was removed") +
      pair(
        `${d.ownerName} ने ${d.patientName} का आपका एक्सेस हटा दिया है। अब आप इनका डेटा नहीं देख पाएंगे।`,
        `${d.ownerName} removed your access to ${d.patientName}. You can no longer see this patient's data.`,
      ) +
      pair(
        "अगर यह गलती से हुआ है, तो उनसे नया इनवाइट कोड माँगें।",
        "If this was a mistake, ask them for a new invite code.",
      );
    return finish(
      `Your access to ${d.patientName} was removed · एक्सेस हटाया गया`,
      "आपका एक्सेस हटा दिया गया · Your access was removed",
      body,
      opts,
      { hi: "आप इस मरीज़ के केयरगिवर थे", en: "You were a caregiver for this patient" },
    );
  }

  const role = ROLE[d.newRole ?? "viewer"];
  const body =
    heading("आपकी भूमिका बदल गई है", "Your role was changed") +
    pair(
      `${d.ownerName} ने ${d.patientName} पर आपकी भूमिका बदलकर "${role.hi}" कर दी है।`,
      `${d.ownerName} changed your role on ${d.patientName} to ${role.en}.`,
    ) +
    pair(role.hiHelp, role.enHelp) +
    openApp("/", "SwasthTrack खोलें · Open SwasthTrack");
  return finish(
    `Your role on ${d.patientName} is now ${role.en} · भूमिका बदली`,
    `${role.hi} · ${role.en}`,
    body,
    opts,
    { hi: "आप इस मरीज़ के केयरगिवर हैं", en: "You are a caregiver for this patient" },
  );
}
