/**
 * RFC 4180 CSV writing. Fields containing a comma, quote or line break are
 * quoted and embedded quotes doubled. Free-text cells that a spreadsheet would
 * treat as a formula ("=...", "+...", "@...") are prefixed with an apostrophe.
 */
export type CsvCell = string | number | boolean | null | undefined;

const NEEDS_QUOTING = /[",\r\n]/;
const FORMULA_START = /^[=+@\t\r]/;

export function csvEscape(value: CsvCell): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "number") return Number.isFinite(value) ? String(value) : "";
  if (typeof value === "boolean") return value ? "true" : "false";
  let s = value;
  // A leading "-" is only a formula risk for non-numeric text ("-1.5" is a number).
  if (FORMULA_START.test(s) || (s.startsWith("-") && Number.isNaN(Number(s)))) s = `'${s}`;
  if (NEEDS_QUOTING.test(s) || s !== s.trim()) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

export function csvRow(cells: CsvCell[]): string {
  return cells.map(csvEscape).join(",");
}

/** Rows joined with CRLF (what RFC 4180 and Excel expect). */
export function toCsv(rows: CsvCell[][]): string {
  return rows.map(csvRow).join("\r\n");
}

/** Safe file-name fragment from a patient name (keeps Devanagari letters). */
export function safeFileName(name: string): string {
  const cleaned = name.replace(/[^\p{L}\p{N}\p{M}]+/gu, "_").replace(/^_+|_+$/g, "");
  return cleaned || "patient";
}
