/**
 * The three sign-in mails (confirm sign-up, sign-in code, password reset) in the same
 * look as the app's own mail. They carry the real 6-digit one-time code that
 * src/lib/auth/service.ts generates.
 */
import type { Bi } from "../format";
import { C, codeBox, en, finish, hi, noteBox, pill, section, spacer, title, topBar } from "../layout";
import type { AuthCodeData, RenderOptions, RenderedEmail } from "../types";

interface AuthKind {
  pillLabel: string;
  title: Bi;
  intro: Bi;
  subject: string;
  titleText: string;
}

const CONFIRM: AuthKind = {
  pillLabel: "ईमेल पुष्टि · Confirm email",
  title: { hi: "अपना ईमेल पता पक्का करें", en: "Confirm your email address" },
  intro: {
    hi: "SwasthTrack खाता बनाने के लिए नीचे दिया कोड ऐप में डालें।",
    en: "Enter the code below in the app to finish creating your SwasthTrack account.",
  },
  subject: "SwasthTrack: अपना ईमेल पक्का करें / Confirm your email",
  titleText: "SwasthTrack · Confirm email",
};

const SIGN_IN: AuthKind = {
  pillLabel: "साइन-इन कोड · Sign-in code",
  title: { hi: "आपका साइन-इन कोड", en: "Your sign-in code" },
  intro: { hi: "SwasthTrack में लॉग इन करने के लिए यह कोड ऐप में डालें।", en: "Enter this code in the app to log in to SwasthTrack." },
  subject: "SwasthTrack: आपका साइन-इन कोड / Your sign-in code",
  titleText: "SwasthTrack · Sign-in code",
};

const RESET: AuthKind = {
  pillLabel: "पासवर्ड रीसेट · Password reset",
  title: { hi: "पासवर्ड बदलने के लिए कोड", en: "Code to reset your password" },
  intro: { hi: "नया पासवर्ड सेट करने के लिए यह कोड ऐप में डालें।", en: "Enter this code in the app to set a new password." },
  subject: "SwasthTrack: पासवर्ड बदलने का कोड / Your password reset code",
  titleText: "SwasthTrack · Password reset",
};

function render(k: AuthKind, d: AuthCodeData, opts: RenderOptions): RenderedEmail {
  const sections = [
    section(
      topBar(pill("ok", k.pillLabel)) +
        title(k.title) +
        hi(k.intro.hi, { size: 12.5, lh: 19, mt: 8 }) +
        en(k.intro.en, { size: 11.5, lh: 16, color: C.muted, mt: 1 }) +
        spacer(14) +
        codeBox({
          label: { hi: "आपका 6 अंकों का कोड", en: "Your 6-digit code" },
          code: d.code,
          size: 34,
          spacing: 10,
          note: {
            hi: `यह कोड ${d.validMinutes ?? 10} मिनट तक मान्य है और सिर्फ़ एक बार इस्तेमाल हो सकता है।`,
            en: `Valid for ${d.validMinutes ?? 10} minutes and can be used only once.`,
          },
        }),
      { first: true, pad: "16px 22px 16px" },
    ),
    section(
      noteBox(
        "warn",
        hi("यह कोड कभी किसी के साथ साझा न करें।", { size: 12.5, lh: 19, weight: 700, color: C.attn }) +
          en("Never share this code.", { size: 11.5, lh: 16, weight: 600, color: C.attn, mt: 1 }) +
          hi("SwasthTrack कभी भी फ़ोन, मैसेज या ईमेल पर यह कोड नहीं माँगेगा।", { size: 12, lh: 19, mt: 4 }) +
          en("SwasthTrack will never ask for it — not by phone, message or email.", { size: 11.5, lh: 16, color: C.muted, mt: 1 }),
      ) +
        hi("अगर आपने यह अनुरोध नहीं किया, तो इस ईमेल को अनदेखा करें। आपके खाते में कोई बदलाव नहीं होगा।", { size: 11.5, lh: 18, color: C.muted, mt: 10 }) +
        en("If you didn't request this, ignore this email. Nothing will change on your account.", { size: 11, lh: 15, color: C.muted, mt: 1 }),
      { pad: "14px 22px 18px" },
    ),
  ];

  return finish({
    subject: k.subject,
    title: k.titleText,
    preheader: "आपका कोड अंदर है · Your code is inside",
    sections,
    reason: {
      hi: "यह ईमेल इसलिए भेजा गया क्योंकि SwasthTrack पर इस पते के लिए एक कोड माँगा गया।",
      en: "You're receiving this because a code was requested for this address on SwasthTrack.",
    },
    ...opts,
  });
}

export const renderConfirmSignupEmail = (d: AuthCodeData, opts: RenderOptions = {}) => render(CONFIRM, d, opts);
export const renderSignInCodeEmail = (d: AuthCodeData, opts: RenderOptions = {}) => render(SIGN_IN, d, opts);
export const renderPasswordResetEmail = (d: AuthCodeData, opts: RenderOptions = {}) => render(RESET, d, opts);
