"use client";

import { useState } from "react";
import { FileSpreadsheet, Printer } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Segmented, type SegmentedOption } from "@/components/ui/segmented";
import { DoctorVisitReportView } from "./doctor-visit-report-view";
import { DailyReportView } from "./daily-report-view";
import { WeeklyReportView } from "./weekly-report-view";
import { MonthlyReportView } from "./monthly-report-view";
import { YearlyReportView } from "./yearly-report-view";
import {
  generateCSVReport,
  getWeeklyReportData,
} from "@/services/reports-analytics-service";
import { getPatientProfile } from "@/services/patient-service";

type ReportTabType = "daily" | "weekly" | "monthly" | "yearly" | "doctor";

type ReportsTabsProps = {
  patientId: string;
};

export function ReportsTabs({ patientId }: ReportsTabsProps) {
  const [activeTab, setActiveTab] = useState<ReportTabType>("weekly");
  const [exporting, setExporting] = useState(false);

  const tabs: SegmentedOption<ReportTabType>[] = [
    { value: "daily", label: "Daily", hindiLabel: "दैनिक" },
    { value: "weekly", label: "Weekly", hindiLabel: "साप्ताहिक" },
    { value: "monthly", label: "Monthly", hindiLabel: "मासिक" },
    { value: "yearly", label: "Yearly", hindiLabel: "वार्षिक" },
    { value: "doctor", label: "Doctor visit", hindiLabel: "डॉक्टर" },
  ];

  async function handleDownloadCSV() {
    try {
      setExporting(true);
      const [weekly, profile] = await Promise.all([
        getWeeklyReportData(patientId),
        getPatientProfile(),
      ]);
      const csv = generateCSVReport(weekly, profile.name);
      const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.setAttribute("href", url);
      link.setAttribute(
        "download",
        `SwasthTrack_Report_${profile.name.replace(/\s+/g, "_")}_${new Date().toISOString().split("T")[0]}.csv`,
      );
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error("CSV export error:", err);
    } finally {
      setExporting(false);
    }
  }

  function handlePrint() {
    window.print();
  }

  return (
    <div className="space-y-5">
      {/* Tabs and export actions */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <Segmented
          options={tabs}
          value={activeTab}
          onChange={setActiveTab}
          ariaLabel="Report period"
          size="sm"
          className="min-w-0 flex-1"
        />

        <div className="flex shrink-0 items-center gap-2 self-end sm:self-auto">
          {/* These labels used to be hidden behind an `xs:` breakpoint that
              does not exist in this Tailwind config, so both buttons rendered
              as unlabelled icons at every width. */}
          <Button
            variant="secondary"
            size="sm"
            onClick={handleDownloadCSV}
            disabled={exporting}
          >
            <FileSpreadsheet aria-hidden className="h-4 w-4" />
            <span>{exporting ? "Generating…" : "CSV"}</span>
          </Button>

          <Button variant="secondary" size="sm" onClick={handlePrint}>
            <Printer aria-hidden className="h-4 w-4" />
            <span>Print</span>
          </Button>
        </div>
      </div>

      {/* Tab content */}
      <div>
        {activeTab === "daily" && <DailyReportView patientId={patientId} />}
        {activeTab === "weekly" && <WeeklyReportView patientId={patientId} />}
        {activeTab === "monthly" && <MonthlyReportView patientId={patientId} />}
        {activeTab === "yearly" && <YearlyReportView patientId={patientId} />}
        {activeTab === "doctor" && <DoctorVisitReportView patientId={patientId} />}
      </div>
    </div>
  );
}
