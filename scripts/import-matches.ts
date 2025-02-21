import { parse } from 'csv-parse/sync';
import { readFileSync } from 'fs';
import { db } from '@/db/db';
import { teamsTable, mapsTable } from '@/db/schema';
import { eq } from 'drizzle-orm';

type MatchRecord = {
  match_id: string;
  match_timestamp: string;
  winning_team: string;
  losing_team: string;
  winning_team_score: string;
  losing_team_score: string;
  map: string;
  region: string;
  event: string;
  league: string;
};

async function getTeamId(slug: string): Promise<number> {
  const team = await db.select()
    .from(teamsTable)
    .where(eq(teamsTable.slug, slug))
    .limit(1);

  if (!team.length) {
    throw new Error(`Team not found with slug: ${slug}`);
  }

  return team[0].id;
}

async function importMatches() {
  const fileContent = readFileSync('data/matches.csv', 'utf-8');
  const records: MatchRecord[] = parse(fileContent, {
    columns: true,
    skip_empty_lines: true
  });

  for (const record of records) {
    const winnerTeamId = await getTeamId(record.winning_team);
    const loserTeamId = await getTeamId(record.losing_team);

    await db.insert(mapsTable)
      .values({
        map_name: record.map,
        winner_team_id: winnerTeamId,
        loser_team_id: loserTeamId,
        winner_rounds: parseInt(record.winning_team_score),
        loser_rounds: parseInt(record.losing_team_score),
        event_name: record.event,
        region: record.region,
        completed_at: new Date(record.match_timestamp),
        processed: false,
      });
  }
}

importMatches()
  .then(() => {
    console.log('Import completed');
    process.exit(0);
  })
  .catch((error) => {
    console.error('Import failed:', error);
    process.exit(1);
  }); 