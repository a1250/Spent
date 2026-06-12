import { NextResponse } from "next/server";
import { writeFileSync, mkdirSync } from "fs";
import path from "path";
import os from "os";
import { getWorkspaceIdFromRequest } from "@/server/lib/workspace-context";
import { parseAndStageFile } from "@/server/import/core/orchestrator";
import { listImportBatches } from "@/server/db/queries/import-batches";
import { ImportDetectionError } from "@/server/import/adapters/detector";

export async function POST(request: Request) {
  try {
    const workspaceId = getWorkspaceIdFromRequest(request);
    const formData = await request.formData();
    const file = formData.get("file") as File | null;

    if (!file) {
      return NextResponse.json({ error: "No file provided" }, { status: 400 });
    }

    if (!file.name.match(/\.(xlsx|xls|csv)$/i)) {
      return NextResponse.json(
        { error: "Only .xlsx, .xls, or .csv files are supported" },
        { status: 400 }
      );
    }

    // Write to temp file (Next.js API routes don't persist multipart to disk)
    const tmpDir = path.join(os.tmpdir(), "budgetwise-import");
    mkdirSync(tmpDir, { recursive: true });
    const tmpPath = path.join(tmpDir, `${Date.now()}-${file.name}`);
    const buffer = Buffer.from(await file.arrayBuffer());
    writeFileSync(tmpPath, buffer);

    const result = await parseAndStageFile(tmpPath, workspaceId, file.name);

    return NextResponse.json({
      batch: result.batch,
      summary: {
        totalRows: result.totalRows,
        autoClassified: result.autoClassified,
        needsReview: result.needsReview,
        duplicates: result.duplicates,
        skipped: result.skipped,
        pending: result.pending,
      },
    });
  } catch (err) {
    if (err instanceof ImportDetectionError) {
      return NextResponse.json(
        {
          error: err.message,
          code: err.code,
          profileHint: err.profileHint,
        },
        { status: 422 }
      );
    }
    const message = err instanceof Error ? err.message : "Import failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function GET(request: Request) {
  try {
    const workspaceId = getWorkspaceIdFromRequest(request);
    const batches = listImportBatches(workspaceId);
    return NextResponse.json({ batches });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to list batches";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
