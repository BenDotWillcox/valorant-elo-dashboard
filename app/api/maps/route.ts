import { getAllMapNames } from "@/db/queries/rankings-queries";
import { NextResponse } from "next/server";

export async function GET() {
  const maps = await getAllMapNames();
  return NextResponse.json(maps);
} 