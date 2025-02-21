import { getCurrentMapRankings } from "@/db/queries/rankings-queries";
import { NextResponse } from "next/server";
import { MAP_POOL } from '@/lib/constants/maps';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const mapsParam = searchParams.get('maps');
  const seasonId = searchParams.get('seasonId');
  
  const maps = mapsParam 
    ? mapsParam.split(',')
    : MAP_POOL.active;

  const allRankings = await Promise.all(
    maps.map(async (map) => {
      const rankings = await getCurrentMapRankings(
        map, 
        seasonId ? parseInt(seasonId) : undefined
      );
      return rankings.map(r => ({
        ...r,
        mapName: map
      }));
    })
  );

  const flattenedRankings = allRankings.flat();
  return NextResponse.json(flattenedRankings);
} 