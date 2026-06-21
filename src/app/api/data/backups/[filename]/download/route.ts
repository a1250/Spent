import fs from "fs";
import { NextResponse } from "next/server";
import { getVerifiedBackupDownload } from "@/server/db/backup";

export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ filename: string }> }
) {
  const { filename } = await params;
  const backup = getVerifiedBackupDownload(filename);

  if (!backup) {
    return NextResponse.json(
      { error: "Backup not found or failed verification" },
      { status: 404 }
    );
  }

  const file = fs.readFileSync(backup.filePath);
  return new Response(file, {
    headers: {
      "Content-Type": "application/vnd.sqlite3",
      "Content-Length": String(backup.record.sizeBytes),
      "Content-Disposition": `attachment; filename="${backup.downloadFilename}"`,
      "Cache-Control": "no-store",
    },
  });
}
