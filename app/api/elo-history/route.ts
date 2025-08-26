import { getEloHistory } from "@/db/queries/rankings-queries";
import { NextResponse } from "next/server";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const seasonId = searchParams.get('seasonId');
  
  const data = await getEloHistory(seasonId ? parseInt(seasonId) : 1);
  return NextResponse.json(data);
} 