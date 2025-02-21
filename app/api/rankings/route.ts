import { getCurrentMapRankings } from "@/db/queries/rankings-queries";
import { MAP_POOL } from "@/lib/constants/maps";
import { NextResponse } from "next/server";

export async function GET() {
  const maps = [...MAP_POOL.active, ...MAP_POOL.inactive];
  const rankings = await Promise.all(
    maps.map(async (map) => [
      map,
      await getCurrentMapRankings(map)
    ])
  );

  return NextResponse.json(Object.fromEntries(rankings));
} 