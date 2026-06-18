import { NextResponse } from "next/server";
import { runDetection } from "@/server/forecast/detect-recurring";
import { getWorkspaceIdFromRequest } from "@/server/lib/workspace-context";

// POST /api/forecast/detect
// Runs read-only recurring-pattern detection against transaction history.
// Never persists any candidates — results are returned for user review only.
export async function POST(request: Request) {
  const workspaceId = getWorkspaceIdFromRequest(request);
  const result = runDetection(workspaceId);
  return NextResponse.json(result);
}
