import { ROLE, bi, type Bi } from "../format";
import {
  C,
  appBase,
  callout,
  codeBox,
  ctaSection,
  en,
  esc,
  finish,
  heading,
  hi,
  kvRows,
  noteBox,
  pair,
  pill,
  section,
  spacer,
  stepRows,
  successCallout,
  title,
  topBar,
} from "../layout";
import type {
  AccessChangedData,
  CaregiverInviteData,
  CaregiverJoinedData,
  RenderOptions,
  RenderedEmail,
  TestEmailData,
  WelcomeData,
} from "../types";


const EN_FONT = "font-family:'Segoe UI',Roboto,Arial,sans-serif;";
const TBL = "border-collapse:collapse;border-spacing:0;mso-table-lspace:0pt;mso-table-rspace:0pt;width:100%;";
const rule = `border-top:1px solid ${C.rule};`;

/** Bold single-line value for detail rows (long addresses wrap instead of overflowing). */
const detail = (text: string) =>
  `<span style="${EN_FONT}font-size:12.5px;line-height:16px;font-weight:700;color:${C.ink};white-space:normal;word-break:break-all;">${esc(text)}</span>`;

// ---- welcome ----------------------------------------------------------------

const SCHEDULE: { name: Bi; when: Bi }[] = [
  { name: { hi: "ज़रूरी अलर्ट", en: "Urgent alerts" }, when: { hi: "तुरंत", en: "Right away" } },
  { name: { hi: "दैनिक रिपोर्ट", en: "Daily report" }, when: { hi: "रोज़ रात 9 बजे", en: "Every day, 9 PM" } },
  { name: { hi: "साप्ताहिक रिपोर्ट", en: "Weekly report" }, when: { hi: "हर रविवार, रात 8 बजे", en: "Sundays, 8 PM" } },
  { name: { hi: "मासिक रिपोर्ट", en: "Monthly report" }, when: { hi: "हर महीने की 1 तारीख, सुबह 9 बजे", en: "1st of the month, 9 AM" } },
];

function scheduleRows(): string {
  return `<table role="presentation" width="100%" style="${TBL}">${SCHEDULE.map(
    (r) =>
      `<tr><td valign="middle" style="padding:7px 0;${rule}">${hi(r.name.hi, { size: 12.5, lh: 19, weight: 600 })}${en(r.name.en, { size: 11, lh: 15, color: C.muted })}</td><td align="right" valign="middle" style="padding:7px 0 7px 10px;${rule}">${hi(r.when.hi, { size: 12, lh: 18, weight: 600, align: "right" })}${en(r.when.en, { size: 11, lh: 15, color: C.muted, align: "right" })}</td></tr>`,
  ).join("")}</table>`;
}

export function renderWelcomeEmail(d: WelcomeData, opts: RenderOptions = {}): RenderedEmail {
  const base = opts.base === undefined ? appBase() : opts.base;
  const intro: Bi = d.patientName
    ? {
        hi: `${d.patientName} की प्रोफ़ाइल तैयार है। अब पूरा परिवार मिलकर उनकी सेहत का ध्यान एक जगह रख सकता है।`,
        en: `${d.patientName}'s profile is ready. Now your whole family can look after their health together, in one place.`,
      }
    : {
        hi: "आपका खाता तैयार है। अब पूरा परिवार मिलकर सेहत का ध्यान एक जगह रख सकता है।",
        en: "Your account is ready. Now your whole family can look after health together, in one place.",
      };

  const sections = [
    section(
      topBar(pill("ok", "स्वागत है · Welcome")) +
        title({ hi: `नमस्ते ${d.name}, SwasthTrack में आपका स्वागत है`, en: `Hello ${d.name}, welcome to SwasthTrack` }) +
        pair(intro, { mt: 8 }),
      { first: true },
    ),
    section(
      heading({ hi: "शुरुआत के 4 आसान कदम", en: "4 quick-start tips" }) +
        stepRows([
          { hi: "सुबह और शाम बीपी दर्ज करें", en: "Log BP every morning and evening — the same time each day works best." },
          { hi: "दवाएँ जोड़ें और लेने पर टिक करें", en: "Add medicines once, then tick each dose when it's taken." },
          { hi: "खाना, कदम और नींद दर्ज करें", en: "Log food, steps and sleep to see the full picture." },
          { hi: "परिवार के किसी सदस्य को केयरगिवर बनाएँ", en: "Invite a family member as a caregiver so you share the care." },
        ]),
    ),
    section(
      heading({ hi: "आपको ये ईमेल मिलेंगे", en: "Emails you'll receive" }) +
        scheduleRows() +
        hi("इन्हें आप कभी भी ईमेल सेटिंग्स में बदल सकते हैं।", { size: 11.5, lh: 18, color: C.muted, mt: 8 }) +
        en("You can change these anytime in Email settings.", { size: 11, lh: 15, color: C.muted, mt: 1 }),
    ),
    ctaSection(base, "/", { hi: "SwasthTrack खोलें", en: "Open SwasthTrack" }),
  ];

  return finish({
    subject: `SwasthTrack में आपका स्वागत है, ${d.name} · Welcome`,
    title: "SwasthTrack · Welcome",
    preheader: "आपका खाता तैयार है · Your account is ready",
    sections,
    reason: d.patientName
      ? {
          hi: `आपको यह ईमेल इसलिए मिला क्योंकि आपने SwasthTrack पर ${d.patientName} की प्रोफ़ाइल बनाई है।`,
          en: `You're receiving this because you created ${d.patientName}'s profile on SwasthTrack.`,
        }
      : {
          hi: "आपको यह ईमेल इसलिए मिला क्योंकि आपने SwasthTrack पर खाता बनाया है।",
          en: "You're receiving this because you created a SwasthTrack account.",
        },
    ...opts,
  });
}

// ---- test -------------------------------------------------------------------

/** Sent from Settings to prove delivery works. */
export function renderTestEmail(d: TestEmailData, opts: RenderOptions = {}): RenderedEmail {
  const base = opts.base === undefined ? appBase() : opts.base;
  const sections = [
    section(
      topBar(pill("ok", "टेस्ट ईमेल · Test email"), bi(d.sentAt)) +
        title({ hi: "आपके ईमेल सही से काम कर रहे हैं", en: "Your emails are working" }) +
        spacer(12) +
        successCallout(
          { hi: "बधाई हो! टेस्ट ईमेल सही तरह से पहुँच गया।", en: "Success! Your test email arrived safely." },
          { hi: "अब SwasthTrack के अलर्ट और रिपोर्ट इसी पते पर आएँगे।", en: "SwasthTrack alerts and reports will reach this address." },
        ),
      { first: true, pad: "16px 22px 16px" },
    ),
    section(
      heading({ hi: "जानकारी", en: "Details" }) +
        kvRows([
          { label: { hi: "भेजा गया पता", en: "Sent to" }, value: detail(d.to) },
          { label: { hi: "भेजने का समय", en: "Sent at" }, value: detail(bi(d.sentAt)) },
        ]),
    ),
    section(
      noteBox(
        "warn",
        hi("सुझाव · Tip", { size: 12.5, lh: 19, weight: 700, color: C.attn }) +
          hi("अगर यह ईमेल स्पैम में मिला, तो इसे “Not spam” चिह्नित करें और भेजने वाले को अपने कॉन्टैक्ट्स में जोड़ें, ताकि ज़रूरी अलर्ट न छूटें।", { size: 12, lh: 19, mt: 4 }) +
          en("If this landed in spam, mark it “Not spam” and add the sender to your contacts so important alerts aren't missed.", { size: 11.5, lh: 16, color: C.muted, mt: 1 }),
      ),
    ),
    ctaSection(base, "/settings", { hi: "ईमेल सेटिंग्स खोलें", en: "Open email settings" }),
  ];

  return finish({
    subject: "SwasthTrack test email · ईमेल टेस्ट",
    title: "SwasthTrack · Test email",
    preheader: "ईमेल सही चल रहा है · Email delivery is working",
    sections,
    reason: {
      hi: "आपको यह ईमेल इसलिए मिला क्योंकि आपने सेटिंग्स में “टेस्ट ईमेल भेजें” दबाया।",
      en: "You're receiving this because you tapped “Send test email” in Settings.",
    },
    ...opts,
  });
}

// ---- caregiver --------------------------------------------------------------

export function renderCaregiverInviteEmail(d: CaregiverInviteData, opts: RenderOptions = {}): RenderedEmail {
  const base = opts.base === undefined ? appBase() : opts.base;
  const role = ROLE[d.role];
  const legend = (["editor", "viewer"] as const)
    .map(
      (k) =>
        `<tr><td valign="middle" style="padding:7px 0;${rule}">${hi(bi(ROLE[k].name), { size: 11.5, lh: 17, weight: 600 })}${en(bi(ROLE[k].short), { size: 11, lh: 15, color: C.muted })}</td></tr>`,
    )
    .join("");

  const sections = [
    section(
      topBar(pill("ok", "केयरगिवर आमंत्रण · Caregiver invite")) +
        title({
          hi: `${d.inviterName} ने आपको ${d.patientName} की देखभाल में जुड़ने के लिए बुलाया है`,
          en: `${d.inviterName} invited you to help care for ${d.patientName}`,
        }) +
        spacer(14) +
        codeBox({
          label: { hi: "आपका आमंत्रण कोड", en: "Your invite code" },
          code: d.code,
          size: 30,
          spacing: 7,
          note: {
            hi: `यह कोड ${d.minutesValid} मिनट के लिए मान्य है — ${d.validUntil} तक।`,
            en: `Valid for ${d.minutesValid} minutes — until ${d.validUntil}.`,
          },
        }),
      { first: true, pad: "16px 22px 16px" },
    ),
    section(
      heading({ hi: "जुड़ने के 3 कदम", en: "3 steps to join" }) +
        stepRows([
          { hi: "SwasthTrack ऐप खोलें", en: "Open the SwasthTrack app." },
          { hi: "इसी ईमेल पते से साइन अप या लॉग इन करें", en: "Sign up or log in with this email address." },
          { hi: "“Join patient” चुनें और ऊपर दिया कोड डालें", en: "Choose “Join patient” and enter the code above." },
        ]),
    ),
    section(
      heading({ hi: "आपकी भूमिका", en: "Your role" }) +
        noteBox(
          "neutral",
          `<p style="margin:0;line-height:20px;">${pill("ok", bi(role.name))}</p>` +
            hi(role.can.hi, { size: 12.5, lh: 20, mt: 6 }) +
            en(role.can.en, { size: 11.5, lh: 16, color: C.muted, mt: 1 }) +
            `<table role="presentation" width="100%" style="${TBL}margin-top:8px;">${legend}</table>`,
        ),
    ),
    section(
      noteBox(
        "warn",
        hi("यह कोड सिर्फ़ भरोसेमंद लोगों के साथ साझा करें", { size: 13, lh: 20, weight: 700, color: C.attn }) +
          en("Share this code only with people you trust", { size: 12, lh: 17, weight: 600, color: C.attn, mt: 1 }) +
          hi(`इस कोड से ${d.patientName} की स्वास्थ्य जानकारी तक पहुँच मिलती है।`, { size: 12, lh: 19, mt: 4 }) +
          en(`This code gives access to ${d.patientName}'s health information.`, { size: 11.5, lh: 16, color: C.muted, mt: 1 }),
      ) +
        hi(`अगर आप ${d.inviterName} को नहीं जानते, तो इस ईमेल को अनदेखा करें। कुछ नहीं बदलेगा।`, { size: 11.5, lh: 18, color: C.muted, mt: 10 }) +
        en("If you don't know this person, ignore this email. Nothing will change.", { size: 11, lh: 15, color: C.muted, mt: 1 }),
      { pad: "14px 22px 6px" },
    ),
    ctaSection(base, "/", { hi: "SwasthTrack खोलें", en: "Open SwasthTrack" }),
  ];

  return finish({
    subject: `${d.inviterName} invited you to ${d.patientName} on SwasthTrack · इनवाइट कोड ${d.code}`,
    title: "SwasthTrack · Caregiver invite",
    preheader: `आपका कोड ${d.code} · Your invite code is ${d.code}`,
    sections,
    reason: {
      hi: `आपको यह ईमेल इसलिए मिला क्योंकि ${d.inviterName} ने SwasthTrack पर यह पता केयरगिवर के रूप में जोड़ा।`,
      en: `You're receiving this because ${d.inviterName} added this address as a caregiver on SwasthTrack.`,
    },
    ...opts,
  });
}

export function renderCaregiverJoinedEmail(d: CaregiverJoinedData, opts: RenderOptions = {}): RenderedEmail {
  const base = opts.base === undefined ? appBase() : opts.base;
  const role = ROLE[d.role];
  const sections = [
    section(
      topBar(pill("ok", "नया केयरगिवर · New caregiver"), bi(d.joinedAt)) +
        title({
          hi: `${d.caregiverName} अब ${d.patientName} की देखभाल से जुड़ गए हैं`,
          en: `${d.caregiverName} has joined ${d.patientName}'s care circle`,
        }),
      { first: true },
    ),
    section(
      heading({ hi: "जानकारी", en: "Details" }) +
        kvRows([
          { label: { hi: "नाम", en: "Name" }, value: detail(d.caregiverName) },
          ...(d.caregiverEmail ? [{ label: { hi: "ईमेल", en: "Email" }, value: detail(d.caregiverEmail) }] : []),
          { label: { hi: "भूमिका", en: "Role" }, value: detail(bi(role.name)) },
          { label: { hi: "कब जुड़े", en: "Joined" }, value: detail(bi(d.joinedAt)) },
        ]),
    ),
    section(
      callout(
        "warn",
        { hi: "क्या आप इस व्यक्ति को नहीं पहचानते?", en: "Don't recognise this person?" },
        { hi: "सेटिंग्स में जाकर तुरंत उनकी पहुँच हटा दें।", en: "Remove their access in Settings right away." },
      ),
    ),
    ctaSection(base, "/settings", { hi: "पहुँच देखें", en: "Review access" }),
  ];

  return finish({
    subject: `${d.caregiverName} joined ${d.patientName} on SwasthTrack · नया केयरगिवर`,
    title: "SwasthTrack · New caregiver",
    preheader: `${d.caregiverName} · ${role.name.en}`,
    sections,
    reason: {
      hi: `आपको यह ईमेल इसलिए मिला क्योंकि आप SwasthTrack पर ${d.patientName} की प्रोफ़ाइल के मालिक हैं।`,
      en: `You're receiving this because you own ${d.patientName}'s profile on SwasthTrack.`,
    },
    ...opts,
  });
}

export function renderAccessChangedEmail(d: AccessChangedData, opts: RenderOptions = {}): RenderedEmail {
  const base = opts.base === undefined ? appBase() : opts.base;
  const reason: Bi = {
    hi: "आपको यह ईमेल इसलिए मिला क्योंकि SwasthTrack पर आपकी पहुँच में बदलाव हुआ है।",
    en: "You're receiving this because your access on SwasthTrack has changed.",
  };

  if (d.change === "removed") {
    return finish({
      subject: `Your access to ${d.patientName} was removed · पहुँच हटाई गई`,
      title: "SwasthTrack · Access removed",
      preheader: "आपकी पहुँच हटा दी गई · Your access was removed",
      sections: [
        section(
          topBar(pill("attention", "पहुँच हटाई गई · Access removed")) +
            title({
              hi: `${d.ownerName} ने ${d.patientName} की प्रोफ़ाइल से आपकी पहुँच हटा दी है`,
              en: `${d.ownerName} removed your access to ${d.patientName}'s profile`,
            }) +
            pair(
              {
                hi: `अब आप ${d.patientName} का स्वास्थ्य डेटा नहीं देख पाएँगे, और उनके अलर्ट या रिपोर्ट भी नहीं मिलेंगे।`,
                en: `You can no longer see ${d.patientName}'s health data, and you won't receive their alerts or reports.`,
              },
              { mt: 8 },
            ),
          { first: true, pad: "16px 22px 14px" },
        ),
        section(
          noteBox(
            "neutral",
            hi(`अगर यह गलती से हुआ है, तो ${d.ownerName} से नया आमंत्रण कोड माँगें।`, { size: 12.5, lh: 19 }) +
              en(`If this was a mistake, ask ${d.ownerName} for a new invite code.`, { size: 11.5, lh: 16, color: C.muted, mt: 1 }),
          ),
          { pad: "0 22px 18px", rule: false },
        ),
      ],
      reason,
      ...opts,
    });
  }

  const role = ROLE[d.newRole ?? "viewer"];
  return finish({
    subject: `Your role on ${d.patientName} is now ${role.name.en} · भूमिका बदली`,
    title: "SwasthTrack · Role updated",
    preheader: `${bi(role.name)}`,
    sections: [
      section(
        topBar(pill("ok", "भूमिका बदली · Role updated")) +
          title({
            hi: `${d.patientName} के लिए आपकी भूमिका अब ${bi(role.name)} है`,
            en: `Your role for ${d.patientName} is now ${role.name.en}`,
          }),
        { first: true },
      ),
      section(
        heading({ hi: "अब आप क्या कर सकते हैं", en: "What you can do now" }) +
          noteBox(
            "neutral",
            `<p style="margin:0;line-height:20px;">${pill("ok", bi(role.name))}</p>` +
              hi(role.can.hi, { size: 12.5, lh: 20, mt: 6 }) +
              en(role.can.en, { size: 11.5, lh: 16, color: C.muted, mt: 1 }),
          ) +
          hi(`यह बदलाव ${d.ownerName} ने किया है।`, { size: 11.5, lh: 18, color: C.muted, mt: 10 }) +
          en(`This change was made by ${d.ownerName}.`, { size: 11, lh: 15, color: C.muted, mt: 1 }),
      ),
      ctaSection(base, "/", { hi: "SwasthTrack खोलें", en: "Open SwasthTrack" }),
    ],
    reason,
    ...opts,
  });
}
