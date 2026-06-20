import { createUserBackup, listBackups } from "@/server/db/backup";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const backups = listBackups();
    return NextResponse.json({ backups });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to list backups";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST() {
  try {
    const record = await createUserBackup();
    return NextResponse.json({ backup: record });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Backup failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
