import { getPerfectGames } from "@/db/queries/hall-of-fame-queries";
import { NextResponse } from "next/server";

export async function GET() {
  const data = await getPerfectGames();
  return NextResponse.json(data);
} 