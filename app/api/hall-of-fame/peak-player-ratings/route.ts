import { NextResponse } from 'next/server';
import { db } from '@/db/db';
import {
  vpmPlayerKfTable,
  vpmPlayerLatestTable,
  playersTable,
  teamsTable,
} from '@/db/schema';
import { sql, eq, and, desc, gte } from 'drizzle-orm';

export const revalidate = 60; // Revalidate every 60 seconds

export async function GET() {
  try {
    const filteredKfs = db
      .select()
      .from(vpmPlayerKfTable)
      .where(gte(vpmPlayerKfTable.game_num, 25))
      .as('filtered_kfs');

    const peakKfs = db
      .select({
        playerId: filteredKfs.player_id,
        smoothMean: filteredKfs.smooth_mean,
        gameDate: filteredKfs.game_date,
        rowNumber: sql<number>`row_number() OVER (PARTITION BY ${filteredKfs.player_id} ORDER BY ${filteredKfs.smooth_mean} DESC)`.as(
          'rn'
        ),
      })
      .from(filteredKfs)
      .as('peak_kfs');

    const peakPlayers = await db
      .select({
        ign: playersTable.ign,
        teamName: teamsTable.name,
        teamLogo: teamsTable.logo_url,
        peakVpm: peakKfs.smoothMean,
        gameDate: peakKfs.gameDate,
      })
      .from(peakKfs)
      .innerJoin(
        vpmPlayerLatestTable,
        eq(peakKfs.playerId, vpmPlayerLatestTable.player_id)
      )
      .innerJoin(playersTable, eq(peakKfs.playerId, playersTable.id))
      .leftJoin(teamsTable, eq(playersTable.team_id, teamsTable.id))
      .where(
        and(
          eq(peakKfs.rowNumber, 1),
          gte(vpmPlayerLatestTable.last_game_num, 50)
        )
      )
      .orderBy(desc(peakKfs.smoothMean))
      .limit(10);

    return NextResponse.json(peakPlayers);
  } catch (error) {
    console.error('Failed to fetch peak player ratings:', error);
    return NextResponse.json(
      { error: 'Failed to fetch peak player ratings' },
      { status: 500 }
    );
  }
}
