import { NextResponse } from "next/server";
import {
  listBusinessUnits,
  createBusinessUnit,
} from "@/server/db/queries/business-units";
import { getWorkspaceIdFromRequest } from "@/server/lib/workspace-context";

export async function GET(request: Request) {
  const workspaceId = getWorkspaceIdFromRequest(request);
  const { searchParams } = new URL(request.url);
  const includeInactive = searchParams.get("includeInactive") === "1";
  const includeCounts = searchParams.get("includeCounts") === "1";
  return NextResponse.json(
    listBusinessUnits(workspaceId, { includeInactive, includeCounts })
  );
}

export async function POST(request: Request) {
  const workspaceId = getWorkspaceIdFromRequest(request);
  const body = (await request.json()) as {
    slug?: string;
    label?: string;
    description?: string | null;
    color?: string | null;
  };
  if (!body.slug || !body.label) {
    return NextResponse.json(
      { error: "slug and label are required" },
      { status: 400 }
    );
  }
  const result = createBusinessUnit(workspaceId, {
    slug: body.slug,
    label: body.label,
    description: body.description,
    color: body.color,
  });
  if (!result.ok) {
    const status = result.reason === "slug-conflict" ? 409 : 400;
    return NextResponse.json({ error: result.reason }, { status });
  }
  return NextResponse.json(result.unit, { status: 201 });
}
