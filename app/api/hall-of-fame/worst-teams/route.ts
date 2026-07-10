import { getWorstTeams } from "@/db/queries/hall-of-fame-queries";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET() {
  const data = await getWorstTeams();
  return NextResponse.json(data);
}
