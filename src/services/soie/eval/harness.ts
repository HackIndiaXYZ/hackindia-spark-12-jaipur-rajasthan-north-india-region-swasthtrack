/**
 * Tiny test harness shared by the evaluation cases. No framework: it must run
 * under plain Node (strip-types) and in the browser on /simulation-lab.
 *
 * A case returns a list of failure messages; an empty list means it passed.
 */

export interface EvalCase {
  id: string;
  group: string;
  title: string;
  run: () => string[] | Promise<string[]>;
}

export interface CaseResult {
  id: string;
  group: string;
  title: string;
  passed: boolean;
  failures: string[];
  ms: number;
}

export interface EvalReport {
  results: CaseResult[];
  passed: number;
  failed: number;
  total: number;
  ms: number;
  byGroup: Array<{ group: string; passed: number; total: number }>;
}

export class Checks {
  failures: string[] = [];
  ok(cond: unknown, message: string): void {
    if (!cond) this.failures.push(message);
  }
  eq<T>(actual: T, expected: T, message: string): void {
    if (JSON.stringify(actual) !== JSON.stringify(expected)) this.failures.push(`${message}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  }
  includes(text: string, needle: string, message: string): void {
    if (!text.includes(needle)) this.failures.push(`${message}: ${JSON.stringify(needle)} not found in ${JSON.stringify(text.length > 240 ? `${text.slice(0, 240)}...` : text)}`);
  }
  excludes(text: string, needle: string, message: string): void {
    if (text.includes(needle)) this.failures.push(`${message}: ${JSON.stringify(needle)} should not appear`);
  }
  near(actual: number | null | undefined, expected: number, tol: number, message: string): void {
    if (actual === null || actual === undefined || Math.abs(actual - expected) > tol) this.failures.push(`${message}: expected ${expected} (+/-${tol}), got ${actual}`);
  }
}

export function caseOf(group: string, id: string, title: string, fn: (c: Checks) => void | Promise<void>): EvalCase {
  return {
    id,
    group,
    title,
    run: async () => {
      const c = new Checks();
      try {
        await fn(c);
      } catch (e) {
        c.failures.push(`threw: ${e instanceof Error ? e.message : String(e)}`);
      }
      return c.failures;
    },
  };
}

export async function runCases(cases: EvalCase[], onProgress?: (done: number, total: number) => void): Promise<EvalReport> {
  const t0 = Date.now();
  const results: CaseResult[] = [];
  for (const c of cases) {
    const s = Date.now();
    let failures: string[];
    try {
      failures = await c.run();
    } catch (e) {
      failures = [`threw: ${e instanceof Error ? e.message : String(e)}`];
    }
    results.push({ id: c.id, group: c.group, title: c.title, passed: failures.length === 0, failures, ms: Date.now() - s });
    onProgress?.(results.length, cases.length);
  }
  const groups = Array.from(new Set(results.map((r) => r.group)));
  return {
    results,
    passed: results.filter((r) => r.passed).length,
    failed: results.filter((r) => !r.passed).length,
    total: results.length,
    ms: Date.now() - t0,
    byGroup: groups.map((g) => ({ group: g, passed: results.filter((r) => r.group === g && r.passed).length, total: results.filter((r) => r.group === g).length })),
  };
}
