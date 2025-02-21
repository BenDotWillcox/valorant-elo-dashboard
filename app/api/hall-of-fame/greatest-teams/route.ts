import { getGreatestTeams } from "@/db/queries/hall-of-fame-queries";
import { NextResponse } from "next/server";

export async function GET() {
  const data = await getGreatestTeams();
  return NextResponse.json(data);
} 