import { getTopMapRatings } from "@/db/queries/hall-of-fame-queries";
import { NextResponse } from "next/server";

export async function GET() {
  const data = await getTopMapRatings();
  return NextResponse.json(data);
} 