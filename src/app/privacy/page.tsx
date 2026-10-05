import { Lock, Mail, Shield, Trash2, Users } from "lucide-react";
import { ContactCard, LegalBody, LegalList, LegalPage, LegalSection } from "@/components/legal/legal-page";

const LAST_UPDATED = "October 2026";

export default function PrivacyPolicyPage() {
  return (
    <LegalPage
      eyebrow="Legal & privacy"
      title="Privacy Policy"
      hindiTitle="गोपनीयता नीति"
      description={`Your health records are personal. This page explains what SwasthTrack stores, who can see it, and what leaves the app. Last updated: ${LAST_UPDATED}.`}
    >
      <LegalBody>
        <LegalSection title="1. Overview" icon={<Shield aria-hidden className="h-4 w-4 text-brand" />}>
          <p>
            SwasthTrack (&ldquo;we&rdquo;, &ldquo;the app&rdquo;) is a family health tracker. Health records you enter belong to you and
            to the family members you choose to share them with.
          </p>
          <p className="rounded-card border border-positive-line bg-positive-soft p-3 font-semibold text-ink">
            We do not sell health data, and we do not show advertisements or share records with advertisers or data brokers.
          </p>
        </LegalSection>

        <LegalSection title="2. Information we store">
          <LegalList>
            <li>
              <strong className="text-ink">Account</strong>: your email address, a display name, and your sign-in credentials. Your password is
              stored only as a salted one-way hash (never in readable form), and sign-in codes are sent to your e-mail address.
            </li>
            <li>
              <strong className="text-ink">Patient profile</strong>: name, age, gender, height, weight, target weight and daily calorie
              target, as far as you choose to fill them in.
            </li>
            <li>
              <strong className="text-ink">Health logs</strong>: blood pressure and pulse, weight, steps, sleep, medicines and whether each
              dose was taken, and the meals you log.
            </li>
            <li>
              <strong className="text-ink">Family access</strong>: which accounts are linked to a patient and their role (owner, editor or
              viewer), and invite codes while they are valid.
            </li>
            <li>
              <strong className="text-ink">Ask conversations</strong>: questions you type to the Ask assistant and its answers, saved to
              your account so you can continue them later.
            </li>
          </LegalList>
        </LegalSection>

        <LegalSection title="3. Who can see a patient's records">
          <p>
            Records are visible only to signed-in members of that patient&apos;s family circle. There is no public access: a person who is
            not signed in cannot read any patient data.
          </p>
          <LegalList>
            <li>
              <strong className="text-ink">Owner</strong> can view and change everything, invite family and manage roles.
            </li>
            <li>
              <strong className="text-ink">Editor</strong> can view and add or change records.
            </li>
            <li>
              <strong className="text-ink">Viewer</strong> can only view.
            </li>
          </LegalList>
          <p>
            The owner can change a member&apos;s role or remove their access at any time in{" "}
            <strong className="text-ink">Settings</strong>. Access is enforced by the database itself (row-level security), not only by
            what the screen shows.
          </p>
        </LegalSection>

        <LegalSection title="4. How information is used">
          <LegalList>
            <li>Showing daily summaries, trends and the tracking score.</li>
            <li>Letting authorised family members see the same records and what needs attention.</li>
            <li>Building reports and CSV files when you ask for them.</li>
            <li>Suggesting quick food shortcuts from how often you have logged a food.</li>
            <li>Answering your questions in Ask, from your own records.</li>
          </LegalList>
        </LegalSection>

        <LegalSection title="5. Optional AI answers (Ask)" icon={<Lock aria-hidden className="h-4 w-4 text-brand" />}>
          <p>
            Ask can answer from the rules built into the app. When the app&apos;s operator has switched on AI answers, your question and
            the parts of the selected patient&apos;s records needed to answer it are sent to Anthropic, which processes them to write the
            reply. When internet search is enabled it uses only generic search terms about a topic; it is not given the patient&apos;s name or
            readings.
          </p>
          <p>
            AI answers are informational, can be wrong, and are not medical advice. If AI is not enabled, nothing is sent to Anthropic.
          </p>
        </LegalSection>

        <LegalSection title="6. Storage and security" icon={<Lock aria-hidden className="h-4 w-4 text-brand" />}>
          <p>Records are kept in a MySQL database run by the app operator. The app uses:</p>
          <LegalList>
            <li>
              <strong className="text-ink">Access checks on the server</strong>: the browser never talks to the database directly; every
              request is checked against the signed-in person&apos;s access to that patient, so a query only returns rows they are allowed to
              see.
            </li>
            <li>
              <strong className="text-ink">Encrypted connections</strong>: HTTPS/TLS between your device and our servers.
            </li>
            <li>
              <strong className="text-ink">Preferences on your device</strong>: small settings such as the last patient you opened, saved
              food shortcuts and recent searches are kept in your browser. Health readings are not cached in browser storage.
            </li>
          </LegalList>
          <p className="text-xs text-ink-subtle">
            No online service can promise absolute security, but we take reasonable steps to protect your records.
          </p>
        </LegalSection>

        <LegalSection title="7. Insights and estimates">
          <p>
            Trends, scores and calorie figures are calculated from what you log. They are statistical estimates, not clinical diagnoses.
            Estimates are labelled as such in the app.
          </p>
        </LegalSection>

        <LegalSection title="8. Service providers">
          <p>
            We use a database host to store the records, a web host to serve the app, an e-mail delivery service for sign-in codes, and, only if enabled, Anthropic for AI answers. If
            e-mail alerts or reports are switched on by the app operator, the summaries are delivered through an e-mail delivery service.
            These providers process data only to run the app.
          </p>
        </LegalSection>

        <LegalSection title="9. Retention and deletion" icon={<Trash2 aria-hidden className="h-4 w-4 text-bp" />}>
          <p>
            Records are kept while the account is active so long-term trends stay available. You can ask for your account and its
            records to be deleted, and an owner can remove caregivers or individual records inside the app. To request deletion, write to
            the contact below.
          </p>
        </LegalSection>

        <LegalSection title="10. Family caregivers" icon={<Users aria-hidden className="h-4 w-4 text-brand" />}>
          <p>
            By joining a patient with an invite code you confirm you have the patient&apos;s (or their guardian&apos;s) permission to view
            their records for supportive care.
          </p>
        </LegalSection>

        <LegalSection title="11. Questions" icon={<Mail aria-hidden className="h-4 w-4 text-brand" />} divider>
          <p>For questions about this policy or your data, contact:</p>
          <ContactCard>
            <p>
              <strong>Contact</strong>: Pawan Kumar
            </p>
            <p>
              <strong>Email</strong>:{" "}
              <a href="mailto:me.guptapawan@gmail.com" className="font-semibold text-brand-ink underline underline-offset-2">
                me.guptapawan@gmail.com
              </a>
            </p>
            <p>
              <strong>App</strong>: SwasthTrack family health companion
            </p>
          </ContactCard>
        </LegalSection>
      </LegalBody>
    </LegalPage>
  );
}
