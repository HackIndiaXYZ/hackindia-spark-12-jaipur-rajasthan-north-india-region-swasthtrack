"use client";

import { todayIST } from "@/lib/health-rules";

/** Today's date as the household sees it: IST, whatever the device clock says. */
export function CurrentDate() {
  const now = new Date();
  const label = new Intl.DateTimeFormat("en-IN", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "Asia/Kolkata",
  }).format(now);

  return (
    <time lang="en-IN" dateTime={todayIST(now)} suppressHydrationWarning>
      {label}
    </time>
  );
}
