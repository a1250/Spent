import "server-only";

import { getDb } from "../index";
import { seedBusinessUnitsForWorkspace } from "./business-units";
import type { Workspace } from "@/lib/types";

interface WorkspaceRow {
  id: number;
  name: string;
  slug: string;
  created_at: string;
  updated_at: string;
}

function mapRow(row: WorkspaceRow): Workspace {
  return {
    id: row.id,
    name: row.name,
    slug: row.slug,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function listWorkspaces(): Workspace[] {
  const rows = getDb()
    .prepare(
      "SELECT id, name, slug, created_at, updated_at FROM workspaces ORDER BY id"
    )
    .all() as WorkspaceRow[];
  return rows.map(mapRow);
}

export function getWorkspace(id: number): Workspace | null {
  const row = getDb()
    .prepare(
      "SELECT id, name, slug, created_at, updated_at FROM workspaces WHERE id = ?"
    )
    .get(id) as WorkspaceRow | undefined;
  return row ? mapRow(row) : null;
}

export function countWorkspaces(): number {
  const row = getDb()
    .prepare("SELECT COUNT(*) as count FROM workspaces")
    .get() as { count: number };
  return row.count;
}

// Seed taxonomy: mirrors migration 031_category_taxonomy.sql.
// Must stay in sync with that migration so new workspaces get the same
// categories as existing ones that ran through the migration.

interface SeedParent {
  name: string;
  kind: "expense" | "income";
  color: string;
  icon: string;
  description: string;
}

interface SeedLeaf {
  parent: string;
  name: string;
  kind: "expense" | "income";
  color: string;
  icon: string;
  description: string;
}

const SEED_PARENTS: SeedParent[] = [
  // Income groups
  { name: "Operating Revenue",   kind: "income",  color: "#C0D582", icon: "trending-up",      description: "Sales, service fees, and event income." },
  { name: "Passive Income",      kind: "income",  color: "#7B85C9", icon: "percent",           description: "Dividends and interest." },
  { name: "Adjustments",         kind: "income",  color: "#7DC8B3", icon: "rotate-ccw",        description: "Refunds and credits — not counted as operating revenue." },
  { name: "Capital & Financing", kind: "income",  color: "#A2ABBB", icon: "arrow-left-right",  description: "Owner deposits, loans in, and inter-account transfers in." },
  // Expense groups
  { name: "Cost of Revenue",     kind: "expense", color: "#E7A875", icon: "utensils-crossed",  description: "Direct costs of delivering the product or service." },
  { name: "People",              kind: "expense", color: "#85B59A", icon: "users",             description: "Payroll, salaries, and contractor payments." },
  { name: "Operations",          kind: "expense", color: "#7D90CA", icon: "settings",          description: "Rent, utilities, equipment, repairs, transportation, and insurance." },
  { name: "Sales & Admin",       kind: "expense", color: "#AB9DDB", icon: "settings-2",        description: "Marketing, software, professional services, bank fees, and taxes." },
  { name: "Personal",            kind: "expense", color: "#D692BF", icon: "sparkles",          description: "Personal spending: groceries, dining, shopping, health, travel, and more." },
  { name: "Money Movement",      kind: "expense", color: "#A2ABBB", icon: "arrow-left-right",  description: "Transfers, loan repayments, investments, and other balance-sheet flows." },
];

const SEED_LEAVES: SeedLeaf[] = [
  // Operating Revenue
  { parent: "Operating Revenue",   name: "Sales & Revenue",        kind: "income",  color: "#85B59A", icon: "banknote",         description: "Customer payments, invoices, and business sales." },
  { parent: "Operating Revenue",   name: "Service Income",         kind: "income",  color: "#94A0DD", icon: "briefcase",        description: "Consulting, professional services, and recurring service fees." },
  { parent: "Operating Revenue",   name: "Event & Venue Income",   kind: "income",  color: "#D692BF", icon: "ticket",           description: "Ticket sales, venue hire, and event-related revenue." },
  // Passive Income
  { parent: "Passive Income",      name: "Dividends",              kind: "income",  color: "#7BB36B", icon: "trending-up",      description: "Stock and fund dividends." },
  { parent: "Passive Income",      name: "Interest Income",        kind: "income",  color: "#6EBFB5", icon: "percent",          description: "Bank interest and bond income." },
  // Adjustments
  { parent: "Adjustments",         name: "Refunds & Credits",      kind: "income",  color: "#65C1D1", icon: "rotate-ccw",       description: "Expense reversals, supplier credits, and customer refunds received. financial_nature=refund." },
  // Capital & Financing
  { parent: "Capital & Financing", name: "Owner Deposit",          kind: "income",  color: "#C0D582", icon: "arrow-down-circle", description: "Owner capital injection into the business." },
  { parent: "Capital & Financing", name: "Loan Received",          kind: "income",  color: "#C29B6F", icon: "landmark",         description: "Bank loans, credit lines, and other borrowings received." },
  { parent: "Capital & Financing", name: "Transfer In",            kind: "income",  color: "#A2AAC2", icon: "arrow-left-right", description: "Internal transfers arriving from another account or entity." },
  { parent: "Capital & Financing", name: "Other Income",           kind: "income",  color: "#C9C9C9", icon: "circle-help",      description: "Income that does not fit another category." },
  // Cost of Revenue
  { parent: "Cost of Revenue",     name: "Food & Beverage Suppliers", kind: "expense", color: "#E89B80", icon: "utensils-crossed", description: "Wholesale food and drink purchases for resale or service." },
  { parent: "Cost of Revenue",     name: "Packaging & Materials",  kind: "expense", color: "#DCB87A", icon: "box",              description: "Packaging, disposables, and raw materials used in production." },
  // People
  { parent: "People",              name: "Payroll & Salaries",     kind: "expense", color: "#81B482", icon: "users",            description: "Employee salaries, wages, and payroll-related costs." },
  { parent: "People",              name: "Contractors & Freelancers", kind: "expense", color: "#AB9DDB", icon: "user-check",   description: "Freelancer invoices and contractor payments." },
  // Operations
  { parent: "Operations",          name: "Rent & Property",        kind: "expense", color: "#D3A96F", icon: "home",            description: "Office, warehouse, or venue rent and property-related costs." },
  { parent: "Operations",          name: "Utilities & Energy",     kind: "expense", color: "#B8A98F", icon: "zap",             description: "Electricity, water, gas, internet, and phone bills." },
  { parent: "Operations",          name: "Equipment & Assets",     kind: "expense", color: "#65AFD2", icon: "wrench",          description: "Machinery, tools, hardware, and capital equipment purchases." },
  { parent: "Operations",          name: "Repairs & Maintenance",  kind: "expense", color: "#A57B5B", icon: "hammer",          description: "Repairs, servicing, and maintenance of equipment or premises." },
  { parent: "Operations",          name: "Transportation & Fuel",  kind: "expense", color: "#7D90CA", icon: "tram-front",      description: "Fuel, vehicle costs, deliveries, and business travel transport." },
  { parent: "Operations",          name: "Insurance",              kind: "expense", color: "#E59A99", icon: "shield",          description: "Business and asset insurance premiums." },
  // Sales & Admin
  { parent: "Sales & Admin",       name: "Marketing & Advertising", kind: "expense", color: "#E499A4", icon: "megaphone",     description: "Paid ads, campaigns, events marketing, and promotional materials." },
  { parent: "Sales & Admin",       name: "Software & Subscriptions", kind: "expense", color: "#AB9DDB", icon: "refresh-cw",  description: "SaaS tools, apps, and recurring digital service fees." },
  { parent: "Sales & Admin",       name: "Professional Services",  kind: "expense", color: "#94A0DD", icon: "scale",          description: "Legal, accounting, consulting, and other professional fees." },
  { parent: "Sales & Admin",       name: "Bank Fees & Interest",   kind: "expense", color: "#B8A98F", icon: "receipt",        description: "Account fees, wire charges, card fees, and loan interest paid." },
  { parent: "Sales & Admin",       name: "Taxes & Levies",         kind: "expense", color: "#C29B6F", icon: "landmark",       description: "VAT, income tax, municipal levies, and other government charges." },
  { parent: "Sales & Admin",       name: "Office & Supplies",      kind: "expense", color: "#DBC27F", icon: "paperclip",      description: "Stationery, office consumables, cleaning, and small supplies." },
  // Personal
  { parent: "Personal",            name: "Groceries",              kind: "expense", color: "#81B482", icon: "shopping-basket", description: "Supermarkets, food markets, and grocery stores." },
  { parent: "Personal",            name: "Restaurants & Dining",   kind: "expense", color: "#E89B80", icon: "utensils-crossed", description: "Restaurants, cafes, takeout, and food delivery." },
  { parent: "Personal",            name: "Shopping & Retail",      kind: "expense", color: "#DCB87A", icon: "shopping-bag",  description: "Clothing, electronics, household goods, and general retail." },
  { parent: "Personal",            name: "Entertainment",          kind: "expense", color: "#E499A4", icon: "ticket",         description: "Cinemas, concerts, sports, streaming, and leisure activities." },
  { parent: "Personal",            name: "Health & Medical",       kind: "expense", color: "#75BCA3", icon: "heart-pulse",    description: "Pharmacies, clinics, doctors, dentists, and medical equipment." },
  { parent: "Personal",            name: "Travel",                 kind: "expense", color: "#64B8D2", icon: "plane",          description: "Flights, hotels, car rentals, and holiday expenses." },
  { parent: "Personal",            name: "Personal Care",          kind: "expense", color: "#D5A4D7", icon: "sparkles",       description: "Hair, beauty, spa, cosmetics, and grooming." },
  { parent: "Personal",            name: "Education",              kind: "expense", color: "#94A0DD", icon: "graduation-cap", description: "Tuition, courses, books, and school supplies." },
  { parent: "Personal",            name: "Home & Bills",           kind: "expense", color: "#A4C386", icon: "home",           description: "Personal home rent, utilities, repairs, and household bills." },
  { parent: "Personal",            name: "Donations & Charity",    kind: "expense", color: "#C87EB8", icon: "heart-handshake", description: "Charitable donations, nonprofit support, and giving." },
  { parent: "Personal",            name: "Personal Insurance",     kind: "expense", color: "#D9A3C7", icon: "shield",          description: "Personal insurance payments such as car, health, or other private coverage." },
  // Money Movement
  { parent: "Money Movement",      name: "Internal Transfer",      kind: "expense", color: "#A2AAC2", icon: "arrow-left-right", description: "Transfers between accounts within the same entity. Not P&L." },
  { parent: "Money Movement",      name: "Loan Repayment",         kind: "expense", color: "#C29B6F", icon: "landmark",       description: "Principal and interest repayment on loans or credit lines." },
  { parent: "Money Movement",      name: "Credit Card Payment",    kind: "expense", color: "#DBC27F", icon: "credit-card",    description: "Monthly credit card settlement payments (working capital movement)." },
  { parent: "Money Movement",      name: "Investment Made",        kind: "expense", color: "#7B85C9", icon: "trending-up",    description: "Securities purchased, funds deposited, or capital deployed." },
  { parent: "Money Movement",      name: "Owner Draw",             kind: "expense", color: "#E7A875", icon: "arrow-up-circle", description: "Owner withdrawals and distributions from the business." },
  { parent: "Money Movement",      name: "Working Capital",        kind: "expense", color: "#A4C386", icon: "coins",          description: "Short-term cash movements: inventory, receivables, and payables." },
  { parent: "Money Movement",      name: "Unknown / Needs Review", kind: "expense", color: "#C9C9C9", icon: "circle-help",    description: "Unclassified transactions that require manual review." },
];

function slugify(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40) || "workspace";
}

function uniqueSlug(base: string): string {
  const db = getDb();
  let candidate = base;
  let n = 2;
  while (
    (db
      .prepare("SELECT 1 FROM workspaces WHERE slug = ?")
      .get(candidate) as { 1: number } | undefined)
  ) {
    candidate = `${base}-${n++}`;
  }
  return candidate;
}

export function createWorkspace(name: string): Workspace {
  const trimmed = name.trim();
  if (!trimmed) throw new Error("Workspace name is required");
  if (trimmed.length > 60) throw new Error("Workspace name too long");

  const db = getDb();
  const slug = uniqueSlug(slugify(trimmed));

  const create = db.transaction(() => {
    const result = db
      .prepare("INSERT INTO workspaces (name, slug) VALUES (?, ?)")
      .run(trimmed, slug);
    const id = Number(result.lastInsertRowid);

    // Pass 1: insert parent categories, collect their IDs by name.
    const insertParent = db.prepare(
      `INSERT INTO categories (workspace_id, name, color, icon, kind, description)
       VALUES (?, ?, ?, ?, ?, ?)`
    );
    const parentIdByName = new Map<string, number>();
    for (const p of SEED_PARENTS) {
      const r = insertParent.run(id, p.name, p.color, p.icon, p.kind, p.description);
      parentIdByName.set(p.name, Number(r.lastInsertRowid));
    }

    // Pass 2: insert leaf categories with parent_id resolved.
    const insertLeaf = db.prepare(
      `INSERT INTO categories (workspace_id, name, color, icon, kind, description, parent_id)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    );
    for (const l of SEED_LEAVES) {
      const parentId = parentIdByName.get(l.parent) ?? null;
      insertLeaf.run(id, l.name, l.color, l.icon, l.kind, l.description, parentId);
    }

    seedBusinessUnitsForWorkspace(id);
    return id;
  });

  const id = create();
  const row = getWorkspace(id);
  if (!row) throw new Error("Workspace creation failed");
  return row;
}

export function updateWorkspace(id: number, name: string): Workspace {
  const trimmed = name.trim();
  if (!trimmed) throw new Error("Workspace name is required");
  if (trimmed.length > 60) throw new Error("Workspace name too long");

  const db = getDb();
  const existing = getWorkspace(id);
  if (!existing) throw new Error("Workspace not found");

  let slug = existing.slug;
  if (trimmed.toLowerCase() !== existing.name.toLowerCase()) {
    slug = uniqueSlug(slugify(trimmed));
  }

  db.prepare(
    "UPDATE workspaces SET name = ?, slug = ?, updated_at = datetime('now') WHERE id = ?"
  ).run(trimmed, slug, id);

  const updated = getWorkspace(id);
  if (!updated) throw new Error("Workspace update failed");
  return updated;
}

export function deleteWorkspace(id: number): void {
  if (countWorkspaces() <= 1) {
    throw new Error("Cannot delete the only workspace");
  }
  getDb().prepare("DELETE FROM workspaces WHERE id = ?").run(id);
}
