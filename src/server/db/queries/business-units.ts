import "server-only";

import { getDb } from "../index";
import type { BusinessUnitRecord } from "@/lib/types";

const COLUMNS = `
  id,
  workspace_id  AS workspaceId,
  slug, label, color, description,
  is_active     AS isActive,
  sort_order    AS sortOrder,
  created_at    AS createdAt,
  updated_at    AS updatedAt
`.trim();

function coerce(raw: BusinessUnitRecord): BusinessUnitRecord {
  return { ...raw, isActive: Boolean(raw.isActive) };
}

export function listBusinessUnits(
  workspaceId: number,
  opts?: { includeInactive?: boolean; includeCounts?: boolean }
): BusinessUnitRecord[] {
  const includeInactive = opts?.includeInactive === true;
  const includeCounts = opts?.includeCounts === true;

  const countCol = includeCounts
    ? `, (SELECT COUNT(*) FROM transactions t WHERE t.workspace_id = bu.workspace_id AND t.business_unit = bu.slug) AS txCount`
    : "";

  const where = includeInactive
    ? "WHERE workspace_id = ?"
    : "WHERE workspace_id = ? AND is_active = 1";

  const sql = `SELECT ${COLUMNS}${countCol} FROM business_units bu ${where} ORDER BY sort_order ASC, slug ASC`;
  const rows = getDb()
    .prepare(sql)
    .all(workspaceId) as BusinessUnitRecord[];
  return rows.map(coerce);
}

export type CreateBusinessUnitResult =
  | { ok: true; unit: BusinessUnitRecord }
  | { ok: false; reason: "slug-conflict" | "invalid-slug" };

export function createBusinessUnit(
  workspaceId: number,
  input: { slug: string; label: string; description?: string | null; color?: string | null }
): CreateBusinessUnitResult {
  const slug = input.slug.trim().toLowerCase().replace(/\s+/g, "-");
  if (!slug || !/^[a-z0-9-]+$/.test(slug)) {
    return { ok: false, reason: "invalid-slug" };
  }
  const label = input.label.trim();
  const description = input.description?.trim() || null;
  const color = input.color ?? pickColor(slug);

  const maxOrder = (
    getDb()
      .prepare("SELECT COALESCE(MAX(sort_order), 0) AS m FROM business_units WHERE workspace_id = ?")
      .get(workspaceId) as { m: number }
  ).m;

  try {
    const result = getDb()
      .prepare(
        `INSERT INTO business_units (workspace_id, slug, label, color, description, sort_order)
         VALUES (?, ?, ?, ?, ?, ?)`
      )
      .run(workspaceId, slug, label, color, description, maxOrder + 10);

    return {
      ok: true,
      unit: {
        id: Number(result.lastInsertRowid),
        workspaceId,
        slug,
        label,
        color,
        description,
        isActive: true,
        sortOrder: maxOrder + 10,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : "";
    if (msg.includes("UNIQUE")) return { ok: false, reason: "slug-conflict" };
    throw err;
  }
}

export type UpdateBusinessUnitResult =
  | { ok: true; unit: BusinessUnitRecord }
  | { ok: false; reason: "not-found" };

export function updateBusinessUnit(
  workspaceId: number,
  id: number,
  patch: { label?: string; description?: string | null; color?: string | null }
): UpdateBusinessUnitResult {
  const existing = getDb()
    .prepare(`SELECT ${COLUMNS} FROM business_units bu WHERE workspace_id = ? AND id = ?`)
    .get(workspaceId, id) as BusinessUnitRecord | undefined;
  if (!existing) return { ok: false, reason: "not-found" };

  const label = patch.label !== undefined ? patch.label.trim() : existing.label;
  const description =
    patch.description !== undefined
      ? patch.description?.trim() || null
      : existing.description;
  const color = patch.color !== undefined ? patch.color : existing.color;

  getDb()
    .prepare(
      `UPDATE business_units
       SET label = ?, description = ?, color = ?, updated_at = datetime('now')
       WHERE workspace_id = ? AND id = ?`
    )
    .run(label, description, color, workspaceId, id);

  const updated = getDb()
    .prepare(`SELECT ${COLUMNS} FROM business_units bu WHERE workspace_id = ? AND id = ?`)
    .get(workspaceId, id) as BusinessUnitRecord;
  return { ok: true, unit: coerce(updated) };
}

export type SetBusinessUnitActiveResult =
  | { ok: true }
  | { ok: false; reason: "not-found" | "reserved" };

const RESERVED_SLUGS = new Set(["unknown", "other", "personal"]);

export function setBusinessUnitActive(
  workspaceId: number,
  id: number,
  active: boolean
): SetBusinessUnitActiveResult {
  const row = getDb()
    .prepare("SELECT slug FROM business_units WHERE workspace_id = ? AND id = ?")
    .get(workspaceId, id) as { slug: string } | undefined;
  if (!row) return { ok: false, reason: "not-found" };
  if (!active && RESERVED_SLUGS.has(row.slug)) return { ok: false, reason: "reserved" };

  getDb()
    .prepare(
      `UPDATE business_units SET is_active = ?, updated_at = datetime('now') WHERE workspace_id = ? AND id = ?`
    )
    .run(active ? 1 : 0, workspaceId, id);
  return { ok: true };
}

// Generic entries only — workspace-specific units are created through the UI.
const DEFAULT_UNITS: Array<{
  slug: string;
  label: string;
  color: string;
  sortOrder: number;
}> = [
  { slug: "personal", label: "Personal", color: "#A2ABBB", sortOrder: 10 },
  { slug: "shared",   label: "Shared",   color: "#A4C386", sortOrder: 90 },
  { slug: "other",    label: "Other",    color: "#DBC27F", sortOrder: 95 },
  { slug: "unknown",  label: "Unknown",  color: "#C9C9C9", sortOrder: 100 },
];

export function seedBusinessUnitsForWorkspace(workspaceId: number): void {
  const db = getDb();
  const stmt = db.prepare(
    `INSERT OR IGNORE INTO business_units (workspace_id, slug, label, color, sort_order)
     VALUES (?, ?, ?, ?, ?)`
  );
  db.transaction(() => {
    for (const u of DEFAULT_UNITS) {
      stmt.run(workspaceId, u.slug, u.label, u.color, u.sortOrder);
    }
  })();
}

// Deterministic color picker for new units.
const UNIT_PALETTE = [
  "#7D90CA",
  "#E7A875",
  "#7BB36B",
  "#8BBBB8",
  "#E499A4",
  "#65C1D1",
  "#D692BF",
  "#C0D582",
  "#9186D1",
  "#73C4A8",
  "#D6C480",
  "#BFB89B",
] as const;

function pickColor(seed: string): string {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) {
    hash = (hash * 31 + seed.charCodeAt(i)) | 0;
  }
  return UNIT_PALETTE[Math.abs(hash) % UNIT_PALETTE.length];
}
