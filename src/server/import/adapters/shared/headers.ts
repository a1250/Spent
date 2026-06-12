export function normalizeHeader(value: unknown): string {
  return String(value ?? "")
    .replace(/\r?\n/g, " ")
    .replace(/\u200e|\u200f|\u202a|\u202b|\u202c/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

export function findHeaderRow(
  rows: unknown[][],
  requiredHeaders: string[]
): number {
  return rows.findIndex((row) => {
    const values = new Set(row.map(normalizeHeader));
    return requiredHeaders.every((header) => values.has(header));
  });
}
