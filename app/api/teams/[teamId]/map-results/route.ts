import { NextRequest, NextResponse } from "next/server";
import { getTeamRecentMapResultsAction } from "@/actions/teams-actions";

export async function GET(
  request: NextRequest,
  { params }: { params: { teamId: string } }
) {
  try {
    const teamId = parseInt(params.teamId);
    const { searchParams } = new URL(request.url);
    const mapName = searchParams.get("map");

    if (!mapName) {
      return NextResponse.json(
        { status: "error", message: "Map name is required" },
        { status: 400 }
      );
    }

    const result = await getTeamRecentMapResultsAction(teamId, mapName);

    if (result.status === "error") {
      return NextResponse.json(result, { status: 500 });
    }

    return NextResponse.json(result);
  } catch (error) {
    console.error("Error in map-results API:", error);
    return NextResponse.json(
      { status: "error", message: "Internal server error" },
      { status: 500 }
    );
  }
}
