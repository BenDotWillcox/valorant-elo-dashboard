import { NextResponse } from 'next/server';
import { db } from '@/db/db';
import {
  vpmPlayerLatestTable,
  playersTable,
  teamsTable,
} from '@/db/schema';
import { eq, and, desc, gte, isNotNull, lte } from 'drizzle-orm';
import { getActiveSeason } from '@/db/queries/seasons-queries';

export const revalidate = 60; // Revalidate every 60 seconds

export async function GET() {
  try {
    const activeSeason = await getActiveSeason();
    const conditions = [
      gte(vpmPlayerLatestTable.last_game_num, 50),
      isNotNull(vpmPlayerLatestTable.current_vpm_per24),
    ];

    if (activeSeason) {
      conditions.push(
        gte(vpmPlayerLatestTable.last_game_date, activeSeason.startDate.toISOString())
      );
      if (activeSeason.endDate) {
        conditions.push(
          lte(vpmPlayerLatestTable.last_game_date, activeSeason.endDate.toISOString())
        );
      }
    }

    const topPlayers = await db
      .select({
        ign: playersTable.ign,
        teamName: teamsTable.name,
        teamLogo: teamsTable.logo_url,
        vpm: vpmPlayerLatestTable.current_vpm_per24,
        mapsPlayed: vpmPlayerLatestTable.last_game_num,
      })
      .from(vpmPlayerLatestTable)
      .leftJoin(
        playersTable,
        eq(vpmPlayerLatestTable.player_id, playersTable.id)
      )
      .leftJoin(teamsTable, eq(playersTable.team_id, teamsTable.id))
      .where(and(...conditions))
      .orderBy(desc(vpmPlayerLatestTable.current_vpm_per24))
      .limit(10);

    return NextResponse.json(topPlayers);
  } catch (error) {
    console.error('Failed to fetch top players:', error);
    return NextResponse.json(
      { error: 'Failed to fetch top players' },
      { status: 500 }
    );
  }
}
