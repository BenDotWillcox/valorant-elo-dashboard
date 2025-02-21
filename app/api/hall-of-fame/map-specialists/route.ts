import { getMapSpecialists } from "@/db/queries/hall-of-fame-queries";
import { NextResponse } from "next/server";

export async function GET() {
  const data = await getMapSpecialists();
  return NextResponse.json(data);
} 