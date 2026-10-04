import Link from "next/link";
import { UserRound } from "lucide-react";
import { buttonClasses } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/page";

/**
 * Shown when the signed-in user has no patient yet (activePatientId is null) or
 * lost access to the one they were viewing. A calm empty state, not an error.
 */
export function NoPatientState({ what = "यह जानकारी" }: { what?: string }) {
  return (
    <EmptyState
      icon={UserRound}
      title="अभी कोई मरीज़ चुना नहीं गया है"
      hindiTitle="No patient selected"
      description={`${what} देखने के लिए पहले किसी मरीज़ की प्रोफ़ाइल बनाएँ, या परिवार के किसी सदस्य के न्योते (कोड) से जुड़ें।`}
      action={
        <div className="flex flex-wrap items-center justify-center gap-2">
          <Link href="/onboarding" className={buttonClasses({ variant: "primary" })}>
            प्रोफ़ाइल बनाएँ
          </Link>
          <Link href="/caregiver" className={buttonClasses({ variant: "secondary" })}>
            कोड से जुड़ें
          </Link>
        </div>
      }
    />
  );
}
