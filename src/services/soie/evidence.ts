/**
 * Citation index. PURE.
 *
 * Every record has a stable ref ("bp:2026-10-03T08:15") and every ledger fact an
 * id ("bp.7d.mean_sys"). The model cites them; the verifier checks they exist;
 * the UI resolves them to the underlying record so a tap on an evidence chip
 * shows exactly what the number was computed from.
 */

import { factLine, valueText } from "./ledger";
import type { EvidenceItem, Ledger, PatientContext } from "./types";

interface RefEntry {
  label: string;
  valueText: string;
  date?: string;
}

const cache = new WeakMap<PatientContext, Map<string, RefEntry>>();

export function refIndex(ctx: PatientContext): Map<string, RefEntry> {
  const hit = cache.get(ctx);
  if (hit) return hit;
  const m = new Map<string, RefEntry>();
  for (const r of ctx.bp) {
    m.set(r.ref, { label: "BP", valueText: `${r.systolic}/${r.diastolic} mmHg${r.pulse !== null ? `, pulse ${r.pulse}` : ""} (${r.category})${r.notes ? `, note: ${r.notes}` : ""}`, date: `${r.date} ${r.time}` });
  }
  for (const r of ctx.weight) m.set(r.ref, { label: "Weight", valueText: `${r.kg} kg`, date: `${r.date} ${r.time}` });
  for (const r of ctx.food) {
    m.set(r.ref, { label: `Food (${r.meal})`, valueText: `${r.name}, ${r.quantity} ${r.unit}, ${Math.round(r.calories)} kcal${r.sodium_mg !== null ? `, sodium ${Math.round(r.sodium_mg)} mg` : ""}`, date: `${r.date} ${r.time}` });
  }
  for (const r of ctx.sleep) m.set(r.ref, { label: "Sleep", valueText: `${r.hours} hours`, date: r.date });
  for (const r of ctx.activity) m.set(r.ref, { label: "Steps", valueText: `${r.steps} steps, ${r.distance_km} km, ${r.walking_minutes} min`, date: r.date });
  for (const r of ctx.doses) m.set(r.ref, { label: `Medicine: ${r.medicineName} ${r.dose}`, valueText: `${r.status} (due ${r.scheduled}${r.source === "auto_missed" ? ", auto-counted missed after the grace window" : ""})`, date: r.date });
  cache.set(ctx, m);
  return m;
}

/** Every ref and fact id a citation may legitimately point at. */
export function knownRefs(ctx: PatientContext, ledger: Ledger): Set<string> {
  const s = new Set<string>(refIndex(ctx).keys());
  for (const f of ledger.facts) s.add(f.id);
  return s;
}

export function resolveEvidence(refs: string[], ctx: PatientContext, ledger: Ledger): EvidenceItem[] {
  const idx = refIndex(ctx);
  const out: EvidenceItem[] = [];
  const seen = new Set<string>();
  for (const ref of refs) {
    if (!ref || seen.has(ref)) continue;
    seen.add(ref);
    const fact = ledger.byId[ref];
    if (fact) {
      out.push({
        ref,
        kind: "fact",
        label: fact.label,
        valueText: `${valueText(fact)}${fact.note ? ` (${fact.note})` : ""}`,
        window: fact.window ? `${fact.window.label}: ${fact.window.from} to ${fact.window.to}` : undefined,
        n: fact.n,
      });
      continue;
    }
    const rec = idx.get(ref);
    if (rec) out.push({ ref, kind: "record", label: rec.label, valueText: rec.valueText, date: rec.date });
  }
  return out;
}

/** All refs an answer cites (key points + numbers + recommendation-free). */
export function citedRefs(answer: { key_points: Array<{ fact_refs: string[] }>; numbers: Array<{ ref: string }> }): string[] {
  return [...answer.key_points.flatMap((k) => k.fact_refs), ...answer.numbers.map((n) => n.ref)];
}

/** The text a citation stands for: what the verifier may treat as backing a number. */
export function refEvidenceText(ref: string, ctx: PatientContext, ledger: Ledger): string | null {
  const fact = ledger.byId[ref];
  if (fact) return factLine(fact);
  const rec = refIndex(ctx).get(ref);
  if (rec) return `${rec.label} ${rec.valueText} ${rec.date ?? ""}`;
  return null;
}
