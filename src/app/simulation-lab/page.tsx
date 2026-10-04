"use client";

import { useState } from "react";
import { CheckCircle2, FlaskConical, Loader2, Play, XCircle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState, PageBody, PageHeader, Section } from "@/components/ui/page";
import { useAuth } from "@/context/auth-context";
import { authFetch } from "@/lib/supabase/auth-fetch";
import type { EvalReport } from "@/services/soie/eval/harness";

interface ServerInfo {
  ai: boolean;
  webSearch: boolean;
  model: string | null;
  rateLimitPerHour: number;
}

/**
 * SOIE evaluation & diagnostics (admin only).
 *
 * "Run the evaluation" executes REAL engine code in this browser: the safety
 * gate, date resolver, fact ledger, answer verifier, rules engine, agent loop
 * (driven by a scripted fake model) and data loaders (against an in-memory fake
 * database), over synthetic patients. Pass/fail is computed, never canned.
 *
 * It does not call a real model or database. The server status below only says
 * whether a key is configured; it does not call the model either.
 */
export default function SimulationLabPage() {
  const { profile, loading } = useAuth();
  const [report, setReport] = useState<EvalReport | null>(null);
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState<[number, number]>([0, 0]);
  const [server, setServer] = useState<ServerInfo | null | "error">(null);
  const [showAll, setShowAll] = useState(false);

  if (loading) {
    return (
      <PageBody>
        <p className="py-10 text-center text-sm text-ink-muted" role="status">
          लोड हो रहा है…
        </p>
      </PageBody>
    );
  }
  if (profile?.role !== "admin") {
    return (
      <PageBody>
        <EmptyState icon={FlaskConical} title="Admins only" hindiTitle="यह पेज सिर्फ़ एडमिन के लिए है" description="SOIE की जाँच और डायग्नोस्टिक्स केवल एडमिन खाते दिखा सकते हैं।" />
      </PageBody>
    );
  }

  async function run() {
    setRunning(true);
    setReport(null);
    try {
      const { runEval } = await import("@/services/soie/eval");
      // Yield once so the spinner paints before the (synchronous-ish) work starts.
      await new Promise((r) => setTimeout(r, 30));
      setReport(await runEval((done, total) => setProgress([done, total])));
    } finally {
      setRunning(false);
    }
  }

  async function checkServer() {
    setServer(null);
    try {
      const res = await authFetch("/api/soie");
      setServer(res.ok ? ((await res.json()) as ServerInfo) : "error");
    } catch {
      setServer("error");
    }
  }

  const failing = report?.results.filter((r) => !r.passed) ?? [];

  return (
    <PageBody>
      <PageHeader eyebrow="Admin" title="SOIE evaluation & diagnostics" hindiTitle="SOIE की जाँच" description="असली इंजन कोड पर चलने वाले टेस्ट। नतीजे गणना से आते हैं, पहले से तय नहीं।" />

      <Card className="space-y-3">
        <div className="flex flex-wrap items-center gap-3">
          <Button variant="primary" onClick={run} disabled={running}>
            {running ? <Loader2 aria-hidden className="h-4 w-4 animate-spin" /> : <Play aria-hidden className="h-4 w-4" />}
            {running ? `चल रहा है… ${progress[0]}/${progress[1]}` : "मूल्यांकन चलाएँ (Run evaluation)"}
          </Button>
          {report ? (
            <Badge variant={report.failed === 0 ? "positive" : "critical"}>
              {report.failed === 0 ? <CheckCircle2 aria-hidden className="h-3 w-3" /> : <XCircle aria-hidden className="h-3 w-3" />}
              {report.passed}/{report.total} पास · {report.ms} ms
            </Badge>
          ) : null}
        </div>
        <p className="text-xs text-ink-subtle">
          चलता है: सुरक्षा गेट, तारीख़ समझ (IST), फ़ैक्ट लेजर, उत्तर-जाँचकर्ता (verifier), नियम-आधारित इंजन, एजेंट लूप (नकली स्क्रिप्टेड मॉडल के साथ) और डेटा-लोडर (नकली मेमोरी डेटाबेस के साथ), कृत्रिम मरीज़ों पर। असली AI मॉडल या असली डेटाबेस इसमें नहीं बुलाए जाते।
        </p>
      </Card>

      {report ? (
        <>
          <Section title="Results by area" hindiTitle="क्षेत्र के अनुसार नतीजे">
            <Card flush className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-line text-xs text-ink-subtle">
                    <th scope="col" className="px-4 py-2 font-medium">
                      Area
                    </th>
                    <th scope="col" className="px-4 py-2 text-right font-medium">
                      Passed
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {report.byGroup.map((g) => (
                    <tr key={g.group} className="border-b border-line last:border-b-0">
                      <td className="px-4 py-2 text-ink">{g.group}</td>
                      <td className="tabular px-4 py-2 text-right">
                        <span className={g.passed === g.total ? "font-semibold text-positive" : "font-semibold text-critical"}>
                          {g.passed}/{g.total}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Card>
          </Section>

          {failing.length > 0 ? (
            <Section title={`Failures (${failing.length})`} hindiTitle="जो केस फेल हुए">
              <div className="space-y-3">
                {failing.map((r) => (
                  <Card key={r.id} className="border-critical-line">
                    <p className="text-sm font-semibold text-critical">{r.title}</p>
                    <p className="text-2xs text-ink-subtle">
                      {r.group} · {r.id}
                    </p>
                    <pre className="mt-2 overflow-x-auto whitespace-pre-wrap rounded-field bg-surface-sunken p-2.5 font-mono text-2xs text-ink-muted">{r.failures.join("\n")}</pre>
                  </Card>
                ))}
              </div>
            </Section>
          ) : (
            <Card tone="sunken" className="flex items-center gap-2 text-sm text-positive">
              <CheckCircle2 aria-hidden className="h-4 w-4" />
              <span>सभी {report.total} केस पास हुए।</span>
            </Card>
          )}

          <Section title="All cases" hindiTitle="सभी केस" action={<Button size="sm" variant="quiet" onClick={() => setShowAll((s) => !s)}>{showAll ? "छिपाएँ" : "दिखाएँ"}</Button>}>
            {showAll ? (
              <Card flush>
                <ul className="divide-y divide-line">
                  {report.results.map((r) => (
                    <li key={r.id} className="flex items-start gap-2 px-4 py-2 text-sm">
                      {r.passed ? <CheckCircle2 aria-label="pass" className="mt-0.5 h-4 w-4 shrink-0 text-positive" /> : <XCircle aria-label="fail" className="mt-0.5 h-4 w-4 shrink-0 text-critical" />}
                      <span className="min-w-0 flex-1 text-ink">
                        {r.title}
                        <span className="block text-2xs text-ink-subtle">{r.group}</span>
                      </span>
                      <span className="tabular text-2xs text-ink-subtle">{r.ms} ms</span>
                    </li>
                  ))}
                </ul>
              </Card>
            ) : null}
          </Section>
        </>
      ) : null}

      <Section title="Server configuration" hindiTitle="सर्वर की स्थिति">
        <Card className="space-y-2 text-sm">
          <Button variant="secondary" onClick={checkServer}>
            जाँचें
          </Button>
          {server === "error" ? <p className="text-critical">स्थिति नहीं मिल सकी।</p> : null}
          {server && server !== "error" ? (
            <ul className="space-y-1 text-ink-muted">
              <li>
                AI कुंजी: <strong className={server.ai ? "text-positive" : "text-attention"}>{server.ai ? "सेट है" : "सेट नहीं है (नियम-आधारित मोड)"}</strong>
              </li>
              <li>मॉडल: {server.model ?? "—"}</li>
              <li>इंटरनेट खोज: {server.webSearch ? "चालू" : "बंद"}</li>
              <li>सीमा: {server.rateLimitPerHour} सवाल प्रति घंटा प्रति उपयोगकर्ता</li>
            </ul>
          ) : null}
          <p className="text-xs text-ink-subtle">यह सिर्फ़ कॉन्फ़िगरेशन बताता है; असली मॉडल को कॉल नहीं करता। असली जाँच के लिए /ask पर एक सवाल पूछें (docs/soie.md में स्मोक-टेस्ट देखें)।</p>
        </Card>
      </Section>
    </PageBody>
  );
}
