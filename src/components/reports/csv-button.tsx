"use client";

import { useState } from "react";
import { FileSpreadsheet } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";

/** Saves text as a file from the browser (the BOM, if wanted, is part of `content`). */
export function downloadTextFile(content: string, fileName: string, mime = "text/csv;charset=utf-8;"): void {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

/**
 * "CSV" button: builds the file on demand, downloads it and says so. The report
 * shown is the one exported — `build` closes over the period on screen.
 */
export function CsvButton({
  label,
  build,
  doneHint,
  disabled,
}: {
  label: string;
  build: () => Promise<{ csv: string; fileName: string }>;
  doneHint: string;
  disabled?: boolean;
}) {
  const toast = useToast();
  const [busy, setBusy] = useState(false);

  async function run() {
    setBusy(true);
    try {
      const { csv, fileName } = await build();
      downloadTextFile(csv, fileName);
      toast.success("CSV तैयार है", doneHint);
    } catch {
      toast.error("CSV नहीं बन पाई", "Could not prepare the file. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Button variant="secondary" loading={busy} disabled={disabled} onClick={() => void run()} className="no-print print:hidden">
      <FileSpreadsheet aria-hidden className="h-4 w-4" />
      {label}
    </Button>
  );
}
