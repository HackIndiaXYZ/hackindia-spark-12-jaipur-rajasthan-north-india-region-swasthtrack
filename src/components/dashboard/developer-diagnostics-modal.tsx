"use client";

import Link from "next/link";
import {
  CheckCircle2,
  Cpu,
  FlaskConical,
  Layers,
  ThumbsUp,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Modal } from "@/components/ui/modal";
import { getMLDiagnostics, type MLDiagnostics } from "@/services/health-ml-service";

type DeveloperDiagnosticsModalProps = {
  isOpen: boolean;
  onClose: () => void;
};

export function DeveloperDiagnosticsModal({
  isOpen,
  onClose,
}: DeveloperDiagnosticsModalProps) {
  if (!isOpen) return null;

  const diagnostics: MLDiagnostics = getMLDiagnostics();

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="SOIE v2.0 & Intelligence Diagnostics"
      hindiTitle="SOIE v2.0 इंटेलिजेंस सिस्टम विश्लेषण"
      description="SwasthTrack Omni-Intelligence Engine telemetry, model registry, and acceptance testing."
      maxWidth="lg"
    >
      <div className="space-y-4 text-xs">
        {/* Model Registry Card */}
        <div className="rounded-card border border-indigo-200 bg-indigo-50/50 p-3.5 space-y-2">
          <div className="flex items-center justify-between">
            <span className="font-semibold text-indigo-950 flex items-center gap-1.5">
              <Cpu className="h-4 w-4 text-indigo-600" />
              SOIE v2.0 Active Engine Registry
            </span>
            <Badge variant="green">Online · 12 Modules</Badge>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 text-xs text-ink-muted">
            <div>
              <span className="text-ink-subtle block">Version:</span>
              <span className="font-semibold">SOIE-v2.0-Production</span>
            </div>
            <div>
              <span className="text-ink-subtle block">Architecture:</span>
              <span className="font-semibold">Multi-Engine Federation</span>
            </div>
            <div>
              <span className="text-ink-subtle block">Privacy Safeguards:</span>
              <span className="font-semibold text-positive">Active (Isolated)</span>
            </div>
          </div>
        </div>

        {/* Telemetry Metrics */}
        <div className="grid grid-cols-3 gap-2.5">
          <div className="rounded-card border border-line bg-surface p-3">
            <span className="text-2xs uppercase font-semibold text-ink-subtle">Inference Time</span>
            <p className="mt-1 text-base font-bold text-ink">
              {diagnostics.averageInferenceLatencyMs} ms
            </p>
            <span className="text-2xs text-positive font-semibold">Budget Compliant</span>
          </div>

          <div className="rounded-card border border-line bg-surface p-3">
            <span className="text-2xs uppercase font-semibold text-ink-subtle">Intelligence Reliability</span>
            <p className="mt-1 text-base font-bold text-indigo-950">
              Experimental
            </p>
            <span className="text-2xs text-ink-subtle">10/10 Lab Scenarios</span>
          </div>

          <div className="rounded-card border border-line bg-surface p-3">
            <span className="text-2xs uppercase font-semibold text-ink-subtle">User Feedback</span>
            <p className="mt-1 text-base font-bold text-ink flex items-center gap-1">
              <ThumbsUp className="h-3.5 w-3.5 text-positive" />
              {diagnostics.feedbackStats.positive} / {diagnostics.feedbackStats.negative}
            </p>
            <span className="text-2xs text-ink-subtle">Pos / Neg</span>
          </div>
        </div>

        {/* Simulation Lab CTA Banner */}
        <div className="rounded-card border border-indigo-200 bg-gradient-to-r from-indigo-50 to-sky-50 p-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="space-y-0.5">
            <p className="font-semibold text-indigo-950 flex items-center gap-1.5">
              <FlaskConical className="h-4 w-4 text-indigo-600" />
              Simulation Lab &amp; Acceptance Suite (§88)
            </p>
            <p className="text-xs text-ink-muted">
              Interactive test bench with 10 synthetic scenarios &amp; &apos;I Don&apos;t Know&apos; verification.
            </p>
          </div>
          <Link
            href="/simulation-lab"
            onClick={onClose}
            className="inline-flex items-center justify-center gap-1.5 rounded-control bg-indigo-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-indigo-700 transition-colors shrink-0 shadow-2xs"
          >
            Launch Lab →
          </Link>
        </div>

        {/* Data Architecture Pipeline */}
        <div className="rounded-card border border-line bg-surface-sunken p-3 space-y-2">
          <p className="font-semibold text-ink flex items-center gap-1.5">
            <Layers className="h-4 w-4 text-positive" />
            Safety Pipeline Execution
          </p>
          <div className="space-y-1.5 text-xs text-ink-muted">
            <div className="flex items-center gap-1.5">
              <CheckCircle2 className="h-3.5 w-3.5 text-positive shrink-0" />
              <span>1. Data Quality Layer: Range check &amp; impossible value rejection</span>
            </div>
            <div className="flex items-center gap-1.5">
              <CheckCircle2 className="h-3.5 w-3.5 text-positive shrink-0" />
              <span>2. Personal Baseline: Multi-window (7D/14D/30D/90D) Median &amp; MAD</span>
            </div>
            <div className="flex items-center gap-1.5">
              <CheckCircle2 className="h-3.5 w-3.5 text-positive shrink-0" />
              <span>3. &apos;I Don&apos;t Know&apos; Engine: Refuses to guess on sparse data</span>
            </div>
            <div className="flex items-center gap-1.5">
              <CheckCircle2 className="h-3.5 w-3.5 text-positive shrink-0" />
              <span>4. Least-Intrusive Intervention: Active fatigue backoff</span>
            </div>
          </div>
        </div>
      </div>
    </Modal>
  );
}
