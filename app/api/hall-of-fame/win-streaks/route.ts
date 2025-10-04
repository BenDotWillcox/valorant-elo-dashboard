import { getLongestWinStreaks } from "@/db/queries/hall-of-fame-queries";
import { NextResponse } from "next/server";

export const revalidate = 300; // Cache for 5 minutes

export async function GET() {
  const data = await getLongestWinStreaks();
  return NextResponse.json(data);
} 