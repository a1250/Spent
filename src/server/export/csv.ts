import "server-only";

const BOM = "\uFEFF";

export type CsvValue = string | number | boolean | null | undefined;

export function csvEscape(value: CsvValue): string {
  if (value == null) return "";
  const text = String(value);
  if (/[",\n\r]/.test(text)) {
    return `"${text.replace(/"/g, '""')}"`;
  }
  return text;
}

export function buildCsv(
  headers: string[],
  rows: CsvValue[][]
): string {
  return [
    headers.map(csvEscape).join(","),
    ...rows.map((row) => row.map(csvEscape).join(",")),
  ].join("\r\n");
}

export function safeExportFilename(
  name: string,
  extension = "csv"
): string {
  const cleaned = name
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 120);
  return `${cleaned || "export"}.${extension}`;
}

export function csvDownloadResponse(csv: string, filename: string): Response {
  const safeFilename = safeExportFilename(filename.replace(/\.csv$/i, ""));
  return new Response(`${BOM}${csv}`, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${safeFilename}"`,
      "Cache-Control": "no-store",
    },
  });
}
