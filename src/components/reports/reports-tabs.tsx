"use client";

import { useId, useState } from "react";
import { FileSpreadsheet, Printer } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Segmented, segmentedPanelId, segmentedTabId, type SegmentedOption } from "@/components/ui/segmented";
import { useToast } from "@/components/ui/toast";
import { safeFileName } from "@/lib/analytics/csv";
import { todayIST } from "@/lib/health-rules";
import { DoctorVisitReportView } from "./doctor-visit-report-view";
import { DailyReportView } from "./daily-report-view";
import { WeeklyReportView } from "./weekly-report-view";
import { MonthlyReportView } from "./monthly-report-view";
import { YearlyReportView } from "./yearly-report-view";
import { generateCSVReport, getWeeklyReportData } from "@/services/reports-analytics-service";
import { getPatientProfile } from "@/services/patient-service";

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
  const toast = useToast();
  const tabsId = useId();
  const [activeTab, setActiveTab] = useState<ReportTabType>("weekly");
  const [exporting, setExporting] = useState(false);

  async function handleDownloadCSV() {
    setExporting(true);
    try {
      const [weekly, profile] = await Promise.all([getWeeklyReportData(patientId), getPatientProfile(patientId)]);
      const csv = generateCSVReport(weekly, profile.name);
      // generateCSVReport already starts with a BOM, so Excel reads Devanagari names correctly.
      const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `SwasthTrack_${safeFileName(profile.name)}_${todayIST()}.csv`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
      toast.success("CSV तैयार है", "Last 7 days downloaded.");
    } catch {
      toast.error("CSV नहीं बन पाई", "Could not prepare the file. Please try again.");
    } finally {
      setExporting(false);
    }
  }

  return (
    <div className="space-y-5">
      <div className="no-print flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between print:hidden">
        <Segmented
          mode="tabs"
          idPrefix={tabsId}
          options={TABS}
          value={activeTab}
          onChange={setActiveTab}
          ariaLabel="Report period — रिपोर्ट की अवधि"
          size="sm"
          className="min-w-0 flex-1"
        />

        <div className="flex shrink-0 items-center gap-2 self-end sm:self-auto">
          <Button variant="secondary" size="sm" loading={exporting} onClick={() => void handleDownloadCSV()}>
            <FileSpreadsheet aria-hidden className="h-4 w-4" />
            CSV (7 दिन)
          </Button>
          <Button variant="secondary" size="sm" onClick={() => window.print()}>
            <Printer aria-hidden className="h-4 w-4" />
            Print
          </Button>
        </div>
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
