import { getSeasons } from "@/db/queries/rankings-queries";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET() {
  const seasons = await getSeasons();
  return NextResponse.json(seasons);
}
