"use client";

import Link from "next/link";
import { Cpu, FlaskConical, ThumbsUp } from "lucide-react";
import { buttonClasses, Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { getMLDiagnostics } from "@/services/health-ml-service";

type DeveloperDiagnosticsModalProps = {
  isOpen: boolean;
  onClose: () => void;
};

function formatWhen(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? "—"
    : d.toLocaleString("en-IN", { timeZone: "Asia/Kolkata", day: "numeric", month: "short", hour: "numeric", minute: "2-digit" });
}

/**
 * Admin-only. Everything shown is measured in this browser session by the
 * forecast engine (see `getMLDiagnostics`); a value that has not been measured
 * yet shows "—", never a made-up figure.
 */
export function DeveloperDiagnosticsModal({ isOpen, onClose }: DeveloperDiagnosticsModalProps) {
  if (!isOpen) return null;

  const d = getMLDiagnostics();
  const confidenceTotal = d.confidenceDistribution.high + d.confidenceDistribution.medium + d.confidenceDistribution.low;

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Forecast engine diagnostics"
      hindiTitle="फ़ोरकास्ट इंजन की जानकारी"
      description="इस ब्राउज़र सत्र में असल में नापे गए आँकड़े। जो अभी नापा नहीं गया, वह — दिखता है।"
      size="lg"
      footer={
        <div className="flex justify-end">
          <Button variant="secondary" onClick={onClose}>
            <span lang="hi">बंद करें</span>
          </Button>
        </div>
      }
    >
      <div className="space-y-4 text-sm">
        <div className="space-y-2 rounded-card border border-info-line bg-info-soft p-3.5">
          <p className="flex items-center gap-1.5 font-semibold text-ink">
            <Cpu aria-hidden className="h-4 w-4 text-info" />
            Model
          </p>
          <dl className="grid grid-cols-1 gap-2 text-xs sm:grid-cols-2">
            <div>
              <dt className="text-ink-muted">Version</dt>
              <dd className="font-semibold text-ink">{d.modelVersion}</dd>
            </div>
            <div>
              <dt className="text-ink-muted">Method</dt>
              <dd className="font-semibold text-ink">{d.modelType}</dd>
            </div>
          </dl>
        </div>

        <dl className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
          <div className="rounded-card border border-line bg-surface p-3">
            <dt className="text-2xs font-semibold uppercase text-ink-muted">Forecast time (avg)</dt>
            <dd className="tabular mt-1 text-base font-bold text-ink">
              {d.averageInferenceLatencyMs === null ? "—" : `${d.averageInferenceLatencyMs} ms`}
            </dd>
          </div>
          <div className="rounded-card border border-line bg-surface p-3">
            <dt className="text-2xs font-semibold uppercase text-ink-muted">Ranges produced</dt>
            <dd className="tabular mt-1 text-base font-bold text-ink">{d.predictionCount}</dd>
          </div>
          <div className="rounded-card border border-line bg-surface p-3">
            <dt className="text-2xs font-semibold uppercase text-ink-muted">Last run</dt>
            <dd className="mt-1 text-base font-bold text-ink">{formatWhen(d.lastInferenceTime)}</dd>
          </div>
          <div className="rounded-card border border-line bg-surface p-3">
            <dt className="text-2xs font-semibold uppercase text-ink-muted">Feedback (this device)</dt>
            <dd className="tabular mt-1 flex items-center gap-1 text-base font-bold text-ink">
              <ThumbsUp aria-hidden className="h-3.5 w-3.5 text-positive" />
              {d.feedbackStats.positive} / {d.feedbackStats.negative}
            </dd>
            <p className="text-2xs text-ink-muted">helpful / not helpful</p>
          </div>
        </dl>

        <div className="rounded-card border border-line bg-surface-sunken p-3 text-xs text-ink-muted">
          <p className="font-semibold text-ink">Confidence of the latest ranges</p>
          {confidenceTotal === 0 ? (
            <p className="mt-1">No ranges produced yet in this session.</p>
          ) : (
            <p className="tabular mt-1">
              High {d.confidenceDistribution.high} · Medium {d.confidenceDistribution.medium} · Low{" "}
              {d.confidenceDistribution.low}
            </p>
          )}
          <p className="mt-1">Patients forecast this session: {d.activePatientBaselines}</p>
        </div>

        <div className="flex flex-col gap-3 rounded-card border border-line bg-surface p-3.5 sm:flex-row sm:items-center sm:justify-between">
          <p className="flex items-center gap-1.5 text-xs text-ink-muted">
            <FlaskConical aria-hidden className="h-4 w-4 shrink-0 text-ink-muted" />
            Simulation lab: try the engine on synthetic scenarios.
          </p>
          <Link href="/simulation-lab" onClick={onClose} className={buttonClasses({ variant: "secondary" })}>
            Open lab →
          </Link>
        </div>
      </div>
    </Modal>
  );
}
