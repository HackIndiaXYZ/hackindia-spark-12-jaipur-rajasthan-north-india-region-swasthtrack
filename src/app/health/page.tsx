"use client";

import { useId, useRef, useState } from "react";
import Link from "next/link";
import { Eye, Footprints, HeartPulse, LayoutGrid, Moon, Scale } from "lucide-react";
import { BloodPressurePanel } from "@/components/health/blood-pressure-panel";
import { WeightPanel } from "@/components/health/weight-panel";
import { SleepPanel } from "@/components/health/sleep-panel";
import { ActivityPanel } from "@/components/health/activity-panel";
import { HealthOverview, type Tracker } from "@/components/health/health-overview";
import { NoPatientState } from "@/components/health/no-patient-state";
import { HISTORY_PAGE, type PanelTab } from "@/components/health/panel-parts";
import { isNoPatientError, loadErrorMessage, useAsyncData } from "@/components/health/use-async-data";
import { SkeletonHealthPanel } from "@/components/ui/skeleton-loaders";
import { ErrorState, PageBody, PageHeader } from "@/components/ui/page";
import { Segmented, segmentedPanelId, segmentedTabId, type SegmentedOption } from "@/components/ui/segmented";
import { useAuth } from "@/context/auth-context";
import {
  getActivityLogs,
  getBloodPressureLogs,
  getPatientProfile,
  getSleepLogs,
  getWeightLogs,
} from "@/services/patient-service";
import { getPatientSettingsOrDefault } from "@/services/settings-service";

type HealthTab = "all" | Tracker;

const TABS: SegmentedOption<HealthTab>[] = [
  { value: "all", label: "All", hindiLabel: "सभी", icon: LayoutGrid },
  { value: "bp", label: "BP", hindiLabel: "रक्तचाप", icon: HeartPulse },
  { value: "weight", label: "Weight", hindiLabel: "वजन", icon: Scale },
  { value: "sleep", label: "Sleep", hindiLabel: "नींद", icon: Moon },
  { value: "activity", label: "Steps", hindiLabel: "कदम", icon: Footprints },
];

export default function HealthPage() {
  const { activePatientId, canWrite, loading: authLoading } = useAuth();
  const [activeTab, setActiveTab] = useState<HealthTab>("all");
  // A tracker's panel is mounted the first time it is opened and then kept (hidden), so a half-typed
  // entry survives a look at another tracker. Each keeps its own New / History / Trend tab.
  const [visited, setVisited] = useState<ReadonlySet<HealthTab>>(() => new Set<HealthTab>(["all"]));
  const [subTabs, setSubTabs] = useState<Partial<Record<Tracker, PanelTab>>>({});
  const panelsRef = useRef<HTMLDivElement>(null);
  const tabsId = useId();

  // One request set per patient; the shared patient-service cache dedupes
  // overlapping reads with the dashboard.
  const { data, error, loading, reload } = useAsyncData(
    async () => {
      const pid = activePatientId!;
      const [patient, settings, bp, weight, sleep, activity] = await Promise.all([
        getPatientProfile(pid),
        getPatientSettingsOrDefault(pid),
        getBloodPressureLogs(pid, HISTORY_PAGE),
        getWeightLogs(pid, HISTORY_PAGE),
        getSleepLogs(pid, HISTORY_PAGE),
        getActivityLogs(pid, HISTORY_PAGE),
      ]);
      return { patient, settings, bp, weight, sleep, activity };
    },
    [activePatientId],
    activePatientId !== null,
  );

  const header = (
    <PageHeader
      eyebrow="Health tracking"
      title="Vitals & daily trackers"
      hindiTitle="रक्तचाप, वजन, नींद और कदम"
      description="रीडिंग दर्ज करें, पुराना इतिहास देखें और ट्रेंड से बदलाव समझें।"
    />
  );

  if (!authLoading && activePatientId === null) {
    return (
      <PageBody>
        {header}
        <NoPatientState what="स्वास्थ्य रिकॉर्ड" />
      </PageBody>
    );
  }

  if (error) {
    return (
      <PageBody>
        {header}
        {isNoPatientError(error) ? (
          <NoPatientState what="स्वास्थ्य रिकॉर्ड" />
        ) : (
          <ErrorState
            title="स्वास्थ्य रिकॉर्ड लोड नहीं हो पाए"
            englishTitle="Health records could not be loaded"
            description={loadErrorMessage(error)}
            onRetry={reload}
          />
        )}
      </PageBody>
    );
  }

  if (authLoading || loading || !data || !activePatientId) {
    return (
      <PageBody>
        {header}
        <div aria-busy="true" aria-label="लोड हो रहा है" className="space-y-5">
          <SkeletonHealthPanel />
          <SkeletonHealthPanel />
        </div>
      </PageBody>
    );
  }

  const { patient, settings, bp, weight, sleep, activity } = data;
  const t = settings.bp_targets;
  const subTab = (tracker: Tracker): PanelTab => subTabs[tracker] ?? (canWrite ? "form" : "history");

  function selectTab(next: HealthTab) {
    setActiveTab(next);
    setVisited((seen) => (seen.has(next) ? seen : new Set(seen).add(next)));
    // Land on the top of the panel when the page was scrolled well down inside the previous one.
    window.requestAnimationFrame(() => {
      const el = panelsRef.current;
      if (el && el.getBoundingClientRect().top < 100) el.scrollIntoView({ block: "start" });
    });
  }

  function open(tracker: Tracker, entry?: boolean) {
    if (entry && canWrite) setSubTabs((prev) => ({ ...prev, [tracker]: "form" }));
    selectTab(tracker);
  }

  // One wrapper per tab, always present so the tab strip's aria-controls point at something real.
  const panelProps = (tab: HealthTab) => ({
    role: "tabpanel" as const,
    id: segmentedPanelId(tabsId, tab),
    "aria-labelledby": segmentedTabId(tabsId, tab),
    hidden: activeTab !== tab,
  });

  const setSub = (tracker: Tracker) => (next: PanelTab) => setSubTabs((prev) => ({ ...prev, [tracker]: next }));

  return (
    <PageBody>
      {header}

      {/* The tracker strip stays under the header while a long history scrolls. */}
      <div className="sticky top-[calc(var(--header-h)+env(safe-area-inset-top,0px))] z-20 -mx-4 bg-canvas/85 px-4 py-1 backdrop-blur-md sm:-mx-6 sm:px-6 lg:-mx-8 lg:px-8">
        <Segmented
          mode="tabs"
          idPrefix={tabsId}
          options={TABS}
          value={activeTab}
          onChange={selectTab}
          ariaLabel="Health tracker filter — कौन सा ट्रैकर देखें"
        />
      </div>

      {!canWrite ? (
        <p className="flex items-start gap-2 rounded-card border border-info-line bg-info-soft p-3 text-sm text-ink-muted">
          <Eye aria-hidden className="mt-0.5 h-4 w-4 shrink-0 text-info" />
          <span lang="hi">आपके पास सिर्फ़ देखने की अनुमति है, इसलिए नई रीडिंग दर्ज करना या बदलना बंद है।</span>
        </p>
      ) : null}

      <div
        ref={panelsRef}
        className="grid scroll-mt-[calc(var(--header-h)+env(safe-area-inset-top,0px)+4.5rem)] gap-5 sm:gap-6"
      >
        <div {...panelProps("all")} className="space-y-5 sm:space-y-6">
          {activeTab === "all" ? (
            <>
              <HealthOverview
                bp={bp}
                weight={weight}
                sleep={sleep}
                activity={activity}
                thresholds={t}
                targetWeight={patient.target_weight_kg}
                targetHours={settings.sleep_target_hours}
                targetSteps={settings.daily_step_goal}
                canWrite={canWrite}
                onOpen={open}
              />

              {settings.is_default ? (
                <p className="rounded-card border border-line bg-surface-sunken p-3 text-xs text-ink-muted">
                  <span lang="hi">
                    इस मरीज़ के लक्ष्य अभी सेटिंग में तय नहीं हैं, इसलिए सामान्य सीमाएँ इस्तेमाल हो रही हैं (BP {t.target_systolic}/{t.target_diastolic}, {settings.daily_step_goal} कदम, {settings.sleep_target_hours} घंटे नींद)।
                  </span>{" "}
                  {canWrite ? (
                    <Link href="/settings" className="font-semibold text-brand-ink underline underline-offset-2">
                      सेटिंग में बदलें
                    </Link>
                  ) : null}
                </p>
              ) : null}
            </>
          ) : null}
        </div>

        <div {...panelProps("bp")}>
          {visited.has("bp") ? (
            <BloodPressurePanel
              patientId={patient.id}
              logs={bp}
              thresholds={t}
              canWrite={canWrite}
              active={activeTab === "bp"}
              tab={subTab("bp")}
              onTabChange={setSub("bp")}
              onSuccess={reload}
            />
          ) : null}
        </div>

        <div {...panelProps("weight")}>
          {visited.has("weight") ? (
            <WeightPanel
              patientId={patient.id}
              logs={weight}
              targetWeight={patient.target_weight_kg}
              heightCm={patient.height_cm}
              canWrite={canWrite}
              active={activeTab === "weight"}
              tab={subTab("weight")}
              onTabChange={setSub("weight")}
              onSuccess={reload}
            />
          ) : null}
        </div>

        <div {...panelProps("sleep")}>
          {visited.has("sleep") ? (
            <SleepPanel
              patientId={patient.id}
              logs={sleep}
              targetHours={settings.sleep_target_hours}
              canWrite={canWrite}
              active={activeTab === "sleep"}
              tab={subTab("sleep")}
              onTabChange={setSub("sleep")}
              onSuccess={reload}
            />
          ) : null}
        </div>

        <div {...panelProps("activity")}>
          {visited.has("activity") ? (
            <ActivityPanel
              patientId={patient.id}
              logs={activity}
              targetSteps={settings.daily_step_goal}
              bodyWeightKg={patient.current_weight_kg}
              canWrite={canWrite}
              active={activeTab === "activity"}
              tab={subTab("activity")}
              onTabChange={setSub("activity")}
              onSuccess={reload}
            />
          ) : null}
        </div>
      </div>
    </PageBody>
  );
}
