"use client";

import { useId, useState } from "react";
import { Printer } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Segmented, segmentedPanelId, segmentedTabId, type SegmentedOption } from "@/components/ui/segmented";
import { DoctorVisitReportView } from "./doctor-visit-report-view";
import { DailyReportView } from "./daily-report-view";
import { WeeklyReportView } from "./weekly-report-view";
import { MonthlyReportView } from "./monthly-report-view";
import { YearlyReportView } from "./yearly-report-view";

type ReportTabType = "daily" | "weekly" | "monthly" | "yearly" | "doctor";

type ReportsTabsProps = {
  patientId: string;
};

const TABS: SegmentedOption<ReportTabType>[] = [
  { value: "daily", label: "Daily", hindiLabel: "दैनिक" },
  { value: "weekly", label: "Weekly", hindiLabel: "साप्ताहिक" },
  { value: "monthly", label: "Monthly", hindiLabel: "मासिक" },
  { value: "yearly", label: "Yearly", hindiLabel: "वार्षिक" },
  { value: "doctor", label: "Doctor visit", hindiLabel: "डॉक्टर" },
];

export function ReportsTabs({ patientId }: ReportsTabsProps) {
  const tabsId = useId();
  const [activeTab, setActiveTab] = useState<ReportTabType>("weekly");

  return (
    <div className="space-y-5">
      {/* The period picker, CSV export and Print live with each report, so what is exported is exactly what is on screen. */}
      <div className="no-print flex items-center justify-between gap-3 print:hidden">
        <Segmented
          mode="tabs"
          idPrefix={tabsId}
          options={TABS}
          value={activeTab}
          onChange={setActiveTab}
          ariaLabel="Report type — रिपोर्ट का प्रकार"
          className="min-w-0 flex-1"
        />
        {activeTab !== "doctor" ? (
          <div className="hidden shrink-0 sm:block">
            <Button variant="secondary" size="sm" onClick={() => window.print()}>
              <Printer aria-hidden className="h-4 w-4" />
              Print
            </Button>
          </div>
        ) : null}
      </div>

      <div role="tabpanel" id={segmentedPanelId(tabsId, activeTab)} aria-labelledby={segmentedTabId(tabsId, activeTab)}>
        {activeTab === "daily" && <DailyReportView patientId={patientId} />}
        {activeTab === "weekly" && <WeeklyReportView patientId={patientId} />}
        {activeTab === "monthly" && <MonthlyReportView patientId={patientId} />}
        {activeTab === "yearly" && <YearlyReportView patientId={patientId} />}
        {activeTab === "doctor" && <DoctorVisitReportView patientId={patientId} />}
      </div>
    </div>
  );
}
