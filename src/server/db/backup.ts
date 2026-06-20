import "server-only";

import Database from "better-sqlite3";
import fs from "fs";
import path from "path";
import { getDb } from "./index";

const DB_DIR = process.env.SPENT_DATA_DIR
  ? path.resolve(process.env.SPENT_DATA_DIR)
  : path.join(process.cwd(), "data");

const BACKUP_DIR = path.join(DB_DIR, "backups");
const DB_PATH = path.join(DB_DIR, "spent.db");

export interface BackupRecord {
  filename: string;
  createdAt: string;
  sizeBytes: number;
  sizeMb: string;
  integrity: "ok" | "failed" | "unknown";
  foreignKeys: "ok" | "failed" | "unknown";
  transactionCount: number | null;
  isSystemBackup: boolean;
}

function ensureBackupDir() {
  if (!fs.existsSync(BACKUP_DIR)) {
    fs.mkdirSync(BACKUP_DIR, { recursive: true });
  }
}

function safeFilename(name: string): boolean {
  return /^[\w.-]+\.db$/.test(name) && !name.includes("..") && !name.includes("/");
}

function verifyBackupFile(filePath: string): {
  integrity: "ok" | "failed" | "unknown";
  foreignKeys: "ok" | "failed" | "unknown";
  transactionCount: number | null;
} {
  let backup: Database.Database | null = null;
  try {
    backup = new Database(filePath, { readonly: true });
    const integrityRow = backup.prepare("PRAGMA integrity_check;").get() as
      | { integrity_check: string }
      | undefined;
    const integrity: "ok" | "failed" | "unknown" =
      integrityRow?.integrity_check === "ok" ? "ok" : "failed";

    const fkRows = (backup.prepare("PRAGMA foreign_key_check;").all() as unknown[]) ?? [];
    const foreignKeys: "ok" | "failed" | "unknown" = fkRows.length === 0 ? "ok" : "failed";

    let transactionCount: number | null = null;
    try {
      const row = backup
        .prepare("SELECT COUNT(*) as n FROM transactions;")
        .get() as { n: number } | undefined;
      transactionCount = row?.n ?? null;
    } catch {
      // table may not exist in very old backups
    }

    return { integrity, foreignKeys, transactionCount };
  } catch {
    return { integrity: "unknown", foreignKeys: "unknown", transactionCount: null };
  } finally {
    backup?.close();
  }
}

function makeTimestamp(): string {
  const now = new Date();
  return (
    `${now.getFullYear()}-` +
    `${String(now.getMonth() + 1).padStart(2, "0")}-` +
    `${String(now.getDate()).padStart(2, "0")}-` +
    `${String(now.getHours()).padStart(2, "0")}` +
    `${String(now.getMinutes()).padStart(2, "0")}` +
    `${String(now.getSeconds()).padStart(2, "0")}`
  );
}

export async function createUserBackup(): Promise<BackupRecord> {
  ensureBackupDir();

  const now = new Date();
  const filename = `backup-${makeTimestamp()}.db`;
  const destPath = path.join(BACKUP_DIR, filename);

  const db = getDb();
  await db.backup(destPath);

  const stat = fs.statSync(destPath);
  const { integrity, foreignKeys, transactionCount } = verifyBackupFile(destPath);

  return {
    filename,
    createdAt: now.toISOString(),
    sizeBytes: stat.size,
    sizeMb: (stat.size / 1024 / 1024).toFixed(2),
    integrity,
    foreignKeys,
    transactionCount,
    isSystemBackup: false,
  };
}

export function listBackups(): BackupRecord[] {
  ensureBackupDir();

  const files = fs.readdirSync(BACKUP_DIR).filter((f) => f.endsWith(".db"));

  return files
    .map((filename): BackupRecord | null => {
      const filePath = path.join(BACKUP_DIR, filename);
      let stat: fs.Stats;
      try {
        stat = fs.statSync(filePath);
      } catch {
        return null;
      }
      return {
        filename,
        createdAt: stat.mtime.toISOString(),
        sizeBytes: stat.size,
        sizeMb: (stat.size / 1024 / 1024).toFixed(2),
        integrity: "unknown",
        foreignKeys: "unknown",
        transactionCount: null,
        isSystemBackup: !filename.startsWith("backup-"),
      };
    })
    .filter((r): r is BackupRecord => r !== null)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export function getBackupMetadata(filename: string): BackupRecord | null {
  if (!safeFilename(filename)) return null;
  const filePath = path.join(BACKUP_DIR, filename);
  if (!fs.existsSync(filePath)) return null;

  const stat = fs.statSync(filePath);
  const { integrity, foreignKeys, transactionCount } = verifyBackupFile(filePath);

  return {
    filename,
    createdAt: stat.mtime.toISOString(),
    sizeBytes: stat.size,
    sizeMb: (stat.size / 1024 / 1024).toFixed(2),
    integrity,
    foreignKeys,
    transactionCount,
    isSystemBackup: !filename.startsWith("backup-"),
  };
}

export interface RestoreResult {
  success: boolean;
  preRestoreBackup: string;
  restoredFilename: string;
  transactionCount: number | null;
  requiresRestart: true;
}

const RESTORE_CONFIRMATION = "restore database";

export async function restoreFromBackup(
  filename: string,
  confirmation: string
): Promise<RestoreResult> {
  if (confirmation !== RESTORE_CONFIRMATION) {
    throw new Error(`Confirmation text must be exactly: "${RESTORE_CONFIRMATION}"`);
  }

  if (!safeFilename(filename)) {
    throw new Error("Invalid backup filename");
  }

  const sourcePath = path.join(BACKUP_DIR, filename);
  if (!fs.existsSync(sourcePath)) {
    throw new Error(`Backup not found: ${filename}`);
  }

  // Verify backup integrity before using it
  const { integrity, foreignKeys, transactionCount } = verifyBackupFile(sourcePath);
  if (integrity !== "ok") {
    throw new Error(
      `Backup integrity check failed — cannot restore from ${filename}`
    );
  }
  if (foreignKeys !== "ok") {
    throw new Error(
      `Backup foreign-key check failed — cannot restore from ${filename}`
    );
  }

  // Create automatic pre-restore backup of the current live DB
  ensureBackupDir();
  const preRestoreFilename = `pre-restore-${makeTimestamp()}.db`;
  const preRestorePath = path.join(BACKUP_DIR, preRestoreFilename);
  const liveDb = getDb();
  await liveDb.backup(preRestorePath);

  // Restore: open the backup as the source and write it to the live DB path.
  // The server process must be restarted after this for the singleton to reload.
  const sourceDb = new Database(sourcePath, { readonly: true });
  try {
    await sourceDb.backup(DB_PATH);
  } finally {
    sourceDb.close();
  }

  return {
    success: true,
    preRestoreBackup: preRestoreFilename,
    restoredFilename: filename,
    transactionCount,
    requiresRestart: true,
  };
}

export { RESTORE_CONFIRMATION };
