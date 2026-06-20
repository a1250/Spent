import { restoreFromBackup, RESTORE_CONFIRMATION } from "@/server/db/backup";
import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (
    typeof body !== "object" ||
    body === null ||
    typeof (body as Record<string, unknown>).filename !== "string" ||
    typeof (body as Record<string, unknown>).confirmation !== "string"
  ) {
    return NextResponse.json(
      {
        error: `Body must be { filename: string, confirmation: "${RESTORE_CONFIRMATION}" }`,
      },
      { status: 400 }
    );
  }

  const { filename, confirmation } = body as { filename: string; confirmation: string };

  try {
    const result = await restoreFromBackup(filename, confirmation);
    return NextResponse.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Restore failed";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
