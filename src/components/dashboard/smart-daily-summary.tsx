"use client";

import Link from "next/link";
import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  ListTodo,
} from "lucide-react";
import { Card } from "@/components/ui/card";
import type { SmartDailySummary as DailySummaryType } from "@/services/smart-insights-service";

type SmartDailySummaryProps = {
  summary: DailySummaryType;
};

export function SmartDailySummaryCard({ summary }: SmartDailySummaryProps) {
  const { completedItems, missingItems, summaryTextHi } = summary;

  return (
    <Card className="border-line bg-surface p-5 shadow-xs transition-all">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <span className="flex h-6 w-6 items-center justify-center rounded-control bg-brand-soft text-brand-ink">
            <ListTodo className="h-3.5 w-3.5" />
          </span>
          <h3 className="font-semibold text-ink text-sm sm:text-base">
            Today&apos;s Tracking Summary · आज का सारांश
          </h3>
        </div>
      </div>

      {/* Summary Message Banner */}
      <p className="mt-2 text-xs font-medium text-ink-muted leading-relaxed bg-surface-sunken border border-line rounded-card p-3">
        {summaryTextHi}
      </p>

      {/* Completed & Missing Lists */}
      <div className="mt-4 grid gap-3 md:grid-cols-2 text-xs">
        {/* Completed Items */}
        {completedItems.length > 0 && (
          <div className="rounded-card border border-positive-line bg-positive-soft/40 p-3 space-y-2">
            <p className="font-semibold text-positive flex items-center gap-1.5 text-xs uppercase tracking-wider">
              <CheckCircle2 className="h-3.5 w-3.5 text-positive" />
              दर्ज की गई प्रविष्टियां ({completedItems.length}):
            </p>
            <ul className="space-y-1 text-positive font-medium">
              {completedItems.map((item, idx) => (
                <li key={idx} className="flex items-center gap-1.5">
                  <span className="h-1.5 w-1.5 rounded-full bg-positive shrink-0" />
                  <span>{item.labelHi}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Missing Items with Direct Action Links */}
        {missingItems.length > 0 ? (
          <div className="rounded-card border border-attention-line/70 bg-attention-soft/40 p-3 space-y-2">
            <p className="font-semibold text-attention flex items-center gap-1.5 text-xs uppercase tracking-wider">
              <AlertTriangle className="h-3.5 w-3.5 text-attention" />
              लॉग होना शेष ({missingItems.length}):
            </p>
            <ul className="space-y-1 text-attention font-medium">
              {missingItems.map((item, idx) => (
                <li key={idx} className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-1.5">
                    <span className="h-1.5 w-1.5 rounded-full bg-attention shrink-0" />
                    <span>{item.labelHi}</span>
                  </div>
                  {item.actionUrl && (
                    <Link
                      href={item.actionUrl}
                      className="inline-flex items-center gap-1 text-2xs font-semibold text-attention hover:underline"
                    >
                      लॉग करें
                      <ArrowRight className="h-2.5 w-2.5" />
                    </Link>
                  )}
                </li>
              ))}
            </ul>
          </div>
        ) : (
          <div className="rounded-card border border-positive-line bg-positive-soft p-3 text-positive text-xs font-medium flex items-center gap-2">
            <CheckCircle2 className="h-4 w-4 text-positive shrink-0" />
            <span>आज के सभी प्रमुख स्वास्थ्य डेटा सफलता से दर्ज हैं!</span>
          </div>
        )}
      </div>
    </Card>
  );
}
