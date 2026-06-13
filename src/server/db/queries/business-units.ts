import "server-only";

import { getDb } from "../index";
import type { BusinessUnitRecord } from "@/lib/types";

export function listBusinessUnits(workspaceId: number): BusinessUnitRecord[] {
  return getDb()
    .prepare(
      `SELECT id,
              workspace_id AS workspaceId,
              slug, label, color,
              is_active    AS isActive,
              sort_order   AS sortOrder,
              created_at   AS createdAt,
              updated_at   AS updatedAt
       FROM business_units
       WHERE workspace_id = ? AND is_active = 1
       ORDER BY sort_order ASC, slug ASC`
    )
    .all(workspaceId) as BusinessUnitRecord[];
}

const DEFAULT_UNITS: Array<{
  slug: string;
  label: string;
  color: string;
  sortOrder: number;
}> = [
  { slug: "personal",   label: "Personal",    color: "#A2ABBB", sortOrder: 10  },
  { slug: "umino",      label: "Umino",       color: "#7D90CA", sortOrder: 20  },
  { slug: "paseo",      label: "Paseo",       color: "#E7A875", sortOrder: 30  },
  { slug: "topsoccer",  label: "Top Soccer",  color: "#7BB36B", sortOrder: 40  },
  { slug: "playground", label: "Playground",  color: "#8BBBB8", sortOrder: 45  },
  { slug: "mytiv",      label: "Mytiv",       color: "#E499A4", sortOrder: 50  },
  { slug: "cctv360",    label: "CCTV 360",    color: "#65C1D1", sortOrder: 60  },
  { slug: "gazebo",     label: "Gazebo",      color: "#D692BF", sortOrder: 70  },
  { slug: "advance",    label: "Advance",     color: "#C0D582", sortOrder: 80  },
  { slug: "shared",     label: "Shared",      color: "#A4C386", sortOrder: 90  },
  { slug: "other",      label: "Other",       color: "#DBC27F", sortOrder: 95  },
  { slug: "unknown",    label: "Unknown",     color: "#C9C9C9", sortOrder: 100 },
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
