"use client";

import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { AlertCircle, Check, Copy, KeyRound, Loader2, Mail, RefreshCw, Share2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ChoiceGroup, TextInput } from "@/components/ui/form-field";
import { Modal } from "@/components/ui/modal";
import { generateCaregiverInviteCode, type CaregiverInvitation } from "@/services/auth-service";
import { sendAppEmail } from "@/services/email-client";

type InviteRole = "viewer" | "editor";

type AddCaregiverDialogProps = {
  isOpen: boolean;
  onClose: () => void;
  patientId: string;
  /** Called whenever the dialog closes: by then a caregiver may have joined, so the roster should be reloaded. */
  onSuccess?: () => void;
  /** @deprecated No longer needed: the owner is read from the session. */
  userId?: string;
};

function formatRemaining(ms: number): string {
  const total = Math.max(0, Math.ceil(ms / 1000));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

function InviteForm({ patientId, onDone }: { patientId: string; onDone: () => void }) {
  const [role, setRole] = useState<InviteRole>("viewer");
  const [invitation, setInvitation] = useState<CaregiverInvitation | null>(null);
  // Starts true: the first code is requested as soon as the dialog opens.
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);
  const [emailTo, setEmailTo] = useState("");
  const [emailState, setEmailState] = useState<"idle" | "sending" | "sent" | "error">("idle");
  const [emailMessage, setEmailMessage] = useState("");
  const [now, setNow] = useState(() => Date.now());
  const startedRef = useRef(false);
  const requestSeq = useRef(0);

  const requestCode = useCallback(
    async (nextRole: InviteRole) => {
      const seq = ++requestSeq.current;
      try {
        const inv = await generateCaregiverInviteCode(patientId, nextRole);
        if (seq === requestSeq.current) setInvitation(inv);
      } catch (err) {
        if (seq === requestSeq.current) {
          setInvitation(null);
          setError(err instanceof Error ? err.message : "कोड नहीं बन सका। (Could not create a code.)");
        }
      } finally {
        if (seq === requestSeq.current) setLoading(false);
      }
    },
    [patientId],
  );

  // One code per opening of the dialog. (The guard also covers React's dev double-invoke.)
  useEffect(() => {
    if (startedRef.current) return;
    startedRef.current = true;
    void requestCode("viewer");
  }, [requestCode]);

  useEffect(() => {
    if (!invitation) return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [invitation]);

  function regenerate(nextRole: InviteRole) {
    setRole(nextRole);
    setLoading(true);
    setError("");
    setCopied(false);
    setEmailState("idle");
    setEmailMessage("");
    void requestCode(nextRole);
  }

  const remainingMs = invitation ? new Date(invitation.expires_at).getTime() - now : 0;
  const expired = invitation !== null && remainingMs <= 0;
  const shareText = invitation
    ? `SwasthTrack में मरीज़ का रिकॉर्ड जोड़ने के लिए यह कोड डालें: ${invitation.invite_code} (15 मिनट में समाप्त होगा)`
    : "";

  async function handleCopy() {
    if (!invitation) return;
    try {
      await navigator.clipboard.writeText(invitation.invite_code);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch {
      setError("कॉपी नहीं हो सका। कोड को देखकर लिख लें। (Copy failed; note the code down.)");
    }
  }

  async function handleShare() {
    if (!shareText) return;
    try {
      await navigator.share({ text: shareText });
    } catch {
      // dismissed by the user
    }
  }

  async function handleEmailInvite(e: FormEvent) {
    e.preventDefault();
    if (!invitation || emailState === "sending") return;
    setEmailState("sending");
    setEmailMessage("");
    try {
      const { to } = await sendAppEmail({
        type: "caregiver.invite",
        patientId,
        inviteId: invitation.id,
        to: emailTo.trim(),
      });
      setEmailState("sent");
      setEmailMessage(`${to} पर कोड भेज दिया गया। (Sent)`);
    } catch (err) {
      setEmailState("error");
      setEmailMessage(err instanceof Error ? err.message : "ईमेल नहीं जा सका। (Could not send.)");
    }
  }

  const canShare = typeof navigator !== "undefined" && typeof navigator.share === "function";

  return (
    <div className="space-y-4">
      <ChoiceGroup<InviteRole>
        label="एक्सेस का प्रकार (Access level)"
        value={role}
        onChange={regenerate}
        options={[
          { value: "viewer", label: "Viewer", hindiLabel: "सिर्फ़ देख सकेगा" },
          { value: "editor", label: "Editor", hindiLabel: "रिकॉर्ड भी जोड़ेगा" },
        ]}
        hint="बदलने पर नया कोड बनता है और पुराना बंद हो जाता है। (Changing it issues a new code and cancels the old one.)"
      />

      <div aria-live="polite" className="empty:hidden">
        {error ? (
          <div
            role="alert"
            className="flex items-start gap-2 rounded-card border border-critical-line bg-critical-soft p-3 text-sm font-medium text-critical"
          >
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
            <span>{error}</span>
          </div>
        ) : null}
      </div>

      <div className="gold-edge space-y-2 rounded-card p-5 text-center">
        <span className="block text-xs font-semibold uppercase tracking-wider text-ink-subtle">
          8 अक्षरों का इनविटेशन कोड (Invite code)
        </span>

        {loading ? (
          <div className="skeleton mx-auto h-10 w-48" aria-label="कोड बन रहा है" />
        ) : (
          <div
            className={`font-mono text-3xl font-bold tracking-[0.25em] ${expired ? "text-ink-subtle line-through" : "text-ink"}`}
            aria-label={invitation ? `Invite code ${invitation.invite_code.split("").join(" ")}` : undefined}
          >
            {invitation?.invite_code ?? "--------"}
          </div>
        )}

        {invitation ? (
          <p className={`text-sm ${expired ? "font-semibold text-critical" : "text-ink-muted"}`} role="timer">
            {expired ? "यह कोड समाप्त हो गया है। (Expired)" : `समाप्त होने में ${formatRemaining(remainingMs)} (Expires in)`}
          </p>
        ) : null}
      </div>

      <div className="flex flex-col gap-2 sm:flex-row">
        {expired ? (
          <Button variant="primary" block onClick={() => regenerate(role)} disabled={loading}>
            <RefreshCw className="h-4 w-4" aria-hidden />
            नया कोड बनाएं (New code)
          </Button>
        ) : (
          <>
            <Button variant="secondary" block onClick={handleCopy} disabled={!invitation || loading}>
              {copied ? (
                <span className="flex items-center gap-1.5 text-positive">
                  <Check className="h-4 w-4" aria-hidden />
                  कोड कॉपी हो गया
                </span>
              ) : (
                <span className="flex items-center gap-1.5">
                  <Copy className="h-4 w-4" aria-hidden />
                  कोड कॉपी करें (Copy)
                </span>
              )}
            </Button>
            {canShare ? (
              <Button variant="secondary" block onClick={handleShare} disabled={!invitation || loading}>
                <Share2 className="h-4 w-4" aria-hidden />
                भेजें (Share)
              </Button>
            ) : null}
          </>
        )}
      </div>

      {invitation && !expired ? (
        <form onSubmit={handleEmailInvite} className="space-y-2 rounded-card border border-line p-3">
          <label htmlFor="invite-email" className="flex items-center gap-1.5 text-sm font-semibold text-ink">
            <Mail className="h-4 w-4 text-brand" aria-hidden />
            ईमेल से भेजें (Send by email)
          </label>
          <div className="flex gap-2">
            <TextInput
              id="invite-email"
              type="email"
              inputMode="email"
              autoComplete="off"
              placeholder="caregiver@example.com"
              value={emailTo}
              onChange={(e) => {
                setEmailTo(e.target.value);
                if (emailState !== "sending") setEmailState("idle");
              }}
              required
            />
            <Button type="submit" variant="secondary" disabled={emailState === "sending" || !emailTo.trim()}>
              {emailState === "sending" ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Mail className="h-4 w-4" aria-hidden />}
              भेजें
            </Button>
          </div>
          <p
            aria-live="polite"
            className={`text-xs empty:hidden ${emailState === "error" ? "font-medium text-critical" : "text-positive"}`}
          >
            {emailMessage}
          </p>
        </form>
      ) : null}

      <div className="space-y-1 rounded-card border border-line bg-surface-sunken p-3 text-sm text-ink-muted">
        <p className="flex items-center gap-1.5 font-semibold text-ink">
          <KeyRound className="h-4 w-4 text-brand" aria-hidden />
          केयरगिवर के लिए निर्देश
        </p>
        <p>1. केयरगिवर पहले अपने ईमेल से SwasthTrack में खाता बनाएं और लॉगिन करें।</p>
        <p>2. &quot;मेरे पास इनविटेशन कोड है&quot; चुनकर यह कोड डालें।</p>
        <p>कोड 15 मिनट तक और सिर्फ़ एक बार चलता है। किसी अनजान को न दें।</p>
      </div>

      <div className="flex justify-end">
        <Button variant="ghost" onClick={onDone}>
          बंद करें (Done)
        </Button>
      </div>
    </div>
  );
}

export function AddCaregiverDialog({ isOpen, onClose, patientId, onSuccess }: AddCaregiverDialogProps) {
  function finish() {
    onClose();
    onSuccess?.();
  }

  return (
    <Modal
      isOpen={isOpen}
      onClose={finish}
      title="Add caregiver / family member"
      hindiTitle="केयरगिवर या परिवार का सदस्य जोड़ें"
      description="Share this temporary code with the person you want to give access."
    >
      {/* Mounted only while open, so every opening issues exactly one fresh code. */}
      {isOpen ? <InviteForm patientId={patientId} onDone={finish} /> : null}
    </Modal>
  );
}
