import { NextResponse } from "next/server";
import {
  updateBusinessUnit,
  setBusinessUnitActive,
} from "@/server/db/queries/business-units";
import { getWorkspaceIdFromRequest } from "@/server/lib/workspace-context";

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const workspaceId = getWorkspaceIdFromRequest(request);
  const { id } = await params;
  const unitId = Number(id);
  if (!Number.isFinite(unitId)) {
    return NextResponse.json({ error: "invalid id" }, { status: 400 });
  }

  const body = (await request.json()) as {
    label?: string;
    description?: string | null;
    color?: string | null;
    isActive?: boolean;
  };

  if (body.isActive !== undefined) {
    const result = setBusinessUnitActive(workspaceId, unitId, body.isActive);
    if (!result.ok) {
      const status = result.reason === "not-found" ? 404 : 409;
      return NextResponse.json({ error: result.reason }, { status });
    }
  }

  if (body.label !== undefined || body.description !== undefined || body.color !== undefined) {
    const result = updateBusinessUnit(workspaceId, unitId, {
      label: body.label,
      description: body.description,
      color: body.color,
    });
    if (!result.ok) {
      return NextResponse.json({ error: result.reason }, { status: 404 });
    }
    return NextResponse.json(result.unit);
  }

  return NextResponse.json({ ok: true });
}
