/**
 * Triggers a browser download of in-memory text content — used for every
 * "Export" / "Download" action in the dash until those are backed by a
 * real API endpoint that streams a generated file instead.
 */
export function downloadTextFile(filename: string, content: string, mime = "text/plain") {
  const blob = new Blob([content], { type: `${mime};charset=utf-8` });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

/** Escapes a single CSV field, quoting it if it contains a comma, quote or newline. */
function csvField(value: unknown): string {
  const str = value === null || value === undefined ? "" : String(value);
  if (/[",\n]/.test(str)) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

/** Turns an array of flat objects into a CSV string (header row + one row per record). */
export function toCsv<T extends Record<string, unknown>>(rows: T[], columns: (keyof T & string)[]) {
  const header = columns.join(",");
  const body = rows.map((row) => columns.map((col) => csvField(row[col])).join(","));
  return [header, ...body].join("\n");
}

/** Convenience: builds a CSV from records and downloads it in one call. */
export function downloadCsv<T extends Record<string, unknown>>(
  filename: string,
  rows: T[],
  columns: (keyof T & string)[],
) {
  downloadTextFile(filename, toCsv(rows, columns), "text/csv");
}
