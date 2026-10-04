"use client";

import { useId, useRef, useState, type FormEvent } from "react";
import { AlertCircle, Check, UserCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { TextInput } from "@/components/ui/form-field";
import { Modal } from "@/components/ui/modal";
import { useAuth } from "@/context/auth-context";
import { acceptCaregiverInviteCode } from "@/services/auth-service";
import { sendAppEmailQuietly } from "@/services/email-client";

const CODE_LENGTH = 8;

type JoinPatientDialogProps = {
  isOpen: boolean;
  onClose: () => void;
  /** Called with the joined patient's id once access is granted and the account data is refreshed. */
  onSuccess?: (patientId?: string) => void;
  /** @deprecated No longer needed: the signed-in user is read from the session. */
  caregiverUserId?: string;
};

function JoinForm({ onClose, onSuccess }: Pick<JoinPatientDialogProps, "onClose" | "onSuccess">) {
  const { refreshSession, setActivePatientId } = useAuth();
  const codeId = useId();
  const [code, setCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [joined, setJoined] = useState(false);
  const busyRef = useRef(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (busyRef.current) return;
    setError("");

    if (code.length !== CODE_LENGTH) {
      setError(`कृपया पूरा ${CODE_LENGTH} अक्षरों का कोड दर्ज करें। (Enter the full ${CODE_LENGTH}-character code.)`);
      return;
    }

    busyRef.current = true;
    setLoading(true);
    try {
      const res = await acceptCaregiverInviteCode(code);
      // Tell the owner who joined; courtesy only, never blocks or fails the join.
      sendAppEmailQuietly({ type: "caregiver.joined", patientId: res.patientId });
      await refreshSession();
      setActivePatientId(res.patientId);
      setJoined(true);
      onSuccess?.(res.patientId);
      setTimeout(onClose, 1200);
    } catch (err) {
      setError(err instanceof Error ? err.message : "कोड जांचा नहीं जा सका। (Could not check the code.)");
    } finally {
      busyRef.current = false;
      setLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
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
        {joined ? (
          <div className="flex items-center gap-2 rounded-card border border-positive-line bg-positive-soft p-3 text-sm font-medium text-positive">
            <Check className="h-4 w-4 shrink-0" aria-hidden />
            मरीज़ का एक्सेस मिल गया! (Access granted.)
          </div>
        ) : null}
      </div>

      <div className="gold-edge rounded-card p-4">
        <label htmlFor={codeId} className="block text-sm font-medium text-ink">
          {CODE_LENGTH} अक्षरों का इनविटेशन कोड (Invite code)
        </label>
        <TextInput
          id={codeId}
          autoFocus
          autoCapitalize="characters"
          autoComplete="off"
          spellCheck={false}
          maxLength={CODE_LENGTH}
          placeholder="------"
          value={code}
          onChange={(e) => setCode(e.target.value.toUpperCase().replace(/[^A-HJ-NP-Z2-9]/g, "").slice(0, CODE_LENGTH))}
          aria-describedby={`${codeId}-hint`}
          className="mt-1.5 text-center font-mono text-xl font-bold tracking-[0.4em]"
          required
        />
        <p id={`${codeId}-hint`} className="mt-1.5 text-xs text-ink-subtle">
          मरीज़ के मालिक के फोन में Settings &gt; केयरगिवर जोड़ें से कोड मिलता है। कोड 15 मिनट तक चलता है।
        </p>
      </div>

      <div className="mt-6 flex flex-col-reverse gap-2.5 sm:flex-row sm:justify-end">
        <Button variant="ghost" onClick={onClose} disabled={loading}>
          रद्द करें (Cancel)
        </Button>
        <Button variant="primary" type="submit" disabled={loading || joined || code.length !== CODE_LENGTH}>
          <UserCheck className="h-4 w-4" aria-hidden />
          {loading ? "जांच हो रही है..." : "मरीज़ जोड़ें (Connect)"}
        </Button>
      </div>
    </form>
  );
}

export function JoinPatientDialog({ isOpen, onClose, onSuccess }: JoinPatientDialogProps) {
  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Join a patient as caregiver"
      hindiTitle="मरीज़ का रिकॉर्ड जोड़ें"
      description="Enter the 8-character invite code shared by the patient's owner."
    >
      {isOpen ? <JoinForm onClose={onClose} onSuccess={onSuccess} /> : null}
    </Modal>
  );
}
