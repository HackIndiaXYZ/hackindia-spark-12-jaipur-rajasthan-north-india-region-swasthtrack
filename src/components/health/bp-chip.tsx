import { Badge } from "@/components/ui/badge";
import {
  DEFAULT_BP_THRESHOLDS,
  classifyBP,
  type BPClassification,
  type BPThresholds,
} from "@/lib/health-rules";

export type StatusTone = "positive" | "info" | "attention" | "critical";

/**
 * One reading -> one status colour, using this patient's own lines.
 * Red is reserved for readings at/above the alert line (or the crisis range);
 * everything between "normal" and that line is amber, so a mildly raised
 * evening reading does not read as an emergency.
 */
export function bpStatusTone(c: BPClassification): StatusTone {
  if (c.category === "crisis" || c.exceedsAlert || c.needsUrgentAttention) return "critical";
  if (c.category === "low") return "info";
  if (c.severity === 0) return "positive";
  return "attention";
}

export const statusTextClass: Record<StatusTone, string> = {
  positive: "text-positive",
  info: "text-info",
  attention: "text-attention",
  critical: "text-critical",
};

export function classifyReading(
  systolic: number,
  diastolic: number,
  thresholds: BPThresholds = DEFAULT_BP_THRESHOLDS,
) {
  const classification = classifyBP(systolic, diastolic, thresholds);
  return { classification, tone: bpStatusTone(classification) };
}

/**
 * Classification chip. Hindi label is the visible text, English is the
 * tooltip and the screen-reader text, so neither language is lost.
 */
export function BPChip({
  systolic,
  diastolic,
  thresholds,
  className,
}: {
  systolic: number;
  diastolic: number;
  thresholds?: BPThresholds;
  className?: string;
}) {
  const { classification, tone } = classifyReading(systolic, diastolic, thresholds);
  return (
    <Badge variant={tone} className={className} title={classification.labelEn}>
      <span lang="hi">{classification.labelHi}</span>
      <span className="sr-only"> ({classification.labelEn})</span>
    </Badge>
  );
}

/** Calm, non-diagnostic safety note for a reading that is far from the usual range. */
export function bpSafetyNote(c: BPClassification): string | null {
  if (c.category === "crisis") {
    return "यह रीडिंग बहुत ऊँची है। 5 मिनट आराम से बैठकर दोबारा नापें। तेज़ सिरदर्द, सीने में दर्द, साँस फूलना, कमज़ोरी या बोलने में दिक्कत हो तो तुरंत 112 / 108 पर कॉल करें, और डॉक्टर को बताएँ।";
  }
  if (c.category === "low" && c.needsUrgentAttention) {
    return "यह रीडिंग काफ़ी कम है। बैठ जाएँ, दोबारा नापें। चक्कर, बेहोशी जैसा लगे या दोबारा भी कम आए तो डॉक्टर से तुरंत संपर्क करें (112 / 108)।";
  }
  if (c.exceedsAlert) {
    return "यह रीडिंग तय सीमा से ऊपर है। आराम से बैठकर दोबारा नापें और अगर ऐसा बार-बार हो तो डॉक्टर को दिखाएँ।";
  }
  return null;
}
