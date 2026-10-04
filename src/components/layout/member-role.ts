import type { MemberRole } from "@/lib/supabase/database.types";

/** Bilingual labels for the signed-in user's role on a patient. */
export const memberRoleLabel: Record<MemberRole, { en: string; hi: string }> = {
  owner: { en: "Owner", hi: "मालिक" },
  editor: { en: "Can edit", hi: "संपादक" },
  viewer: { en: "View only", hi: "केवल देखें" },
};
