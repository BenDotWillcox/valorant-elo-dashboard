import { and, asc, eq, gte, inArray, lt, sql } from "drizzle-orm";
import { db } from "../db/db";
import { eloRatingsTable } from "../db/schema/elo-ratings-schema";
import { mapsTable } from "../db/schema/maps-schema";
import { matchesTable } from "../db/schema/matches-schema";
import { matchVetoesTable } from "../db/schema/match-vetoes-schema";
import { matchVetoAnalysisTable } from "../db/schema/match-veto-analysis-schema";
import {
  scorePickBanVetoSequence,
} from "../lib/elo/pick-ban-policy";
import {
  ratingBeforePickBanCutoff,
  type PickBanRatingHistoryEntry,
} from "../lib/elo/pick-ban-rating-history";
import { assertSourceLessPickBanRatingsAreAuditable } from "../lib/elo/pick-ban-rating-provenance";

type AnalysisInsert = typeof matchVetoAnalysisTable.$inferInsert;

type EloHistories = Map<number, Map<string, PickBanRatingHistoryEntry[]>>;

const INSERT_CHUNK_SIZE = 500;
const PROGRESS_INTERVAL = 100;
const INVALID_LOG_LIMIT = 25;

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

function buildEloHistories(
  rows: {
    id: number;
    teamId: number;
    mapName: string;
    rating: string;
    ratingDate: Date;
    sourceMatchId: number | null;
  }[]
): EloHistories {
  const histories: EloHistories = new Map();

  for (const row of rows) {
    let teamHistories = histories.get(row.teamId);
    if (!teamHistories) {
      teamHistories = new Map();
      histories.set(row.teamId, teamHistories);
    }

    let mapHistory = teamHistories.get(row.mapName);
    if (!mapHistory) {
      mapHistory = [];
      teamHistories.set(row.mapName, mapHistory);
    }

    mapHistory.push({
      id: row.id,
      rating: Number(row.rating),
      ratingDate: row.ratingDate,
      sourceMatchId: row.sourceMatchId,
    });
  }

  histories.forEach((teamHistories) => {
    teamHistories.forEach((mapHistory) => {
      mapHistory.sort((left, right) => {
        const dateDifference = left.ratingDate.getTime() - right.ratingDate.getTime();
        return dateDifference !== 0 ? dateDifference : left.id - right.id;
      });
    });
  });

  return histories;
}

function ratingBeforeMatch(
  histories: EloHistories,
  teamId: number,
  mapName: string,
  targetMatchId: number,
  matchCompletedAt: Date
) {
  const history = histories.get(teamId)?.get(mapName);
  return ratingBeforePickBanCutoff(history, targetMatchId, matchCompletedAt);
}

function buildPreMatchRatings(
  histories: EloHistories,
  teamId: number,
  mapNames: string[],
  targetMatchId: number,
  matchCompletedAt: Date
) {
  return Array.from(new Set(mapNames)).map((mapName) => ({
    mapName,
    rating: ratingBeforeMatch(
      histories,
      teamId,
      mapName,
      targetMatchId,
      matchCompletedAt
    ),
  }));
}

async function processPickBanAnalysis() {
  console.log("Starting leakage-safe pick/ban analysis rebuild...");

  const sourceSnapshot = await db.transaction(async (tx) => {
    const allMatches = await tx
      .select({
        id: matchesTable.id,
        team1Id: matchesTable.team1_id,
        team2Id: matchesTable.team2_id,
        completedAt: matchesTable.completed_at,
      })
      .from(matchesTable)
      .where(sql`${matchesTable.id} IN (SELECT match_id FROM ${matchVetoesTable})`)
      .orderBy(asc(matchesTable.completed_at), asc(matchesTable.id));
    const allVetoes = await tx
      .select({
        id: matchVetoesTable.id,
        matchId: matchVetoesTable.match_id,
        orderIndex: matchVetoesTable.order_index,
        action: matchVetoesTable.action,
        mapName: matchVetoesTable.map_name,
        teamId: matchVetoesTable.team_id,
      })
      .from(matchVetoesTable)
      .orderBy(
        asc(matchVetoesTable.match_id),
        asc(matchVetoesTable.order_index),
        asc(matchVetoesTable.id)
      );

    const neededTeamIds = new Set<number>();
    let earliestSeasonStart = Number.POSITIVE_INFINITY;
    let latestCompletedAt = Number.NEGATIVE_INFINITY;

    for (const match of allMatches) {
      const completedAt = match.completedAt;
      if (!completedAt || !Number.isFinite(completedAt.getTime())) continue;

      const completedAtTime = completedAt.getTime();
      const seasonStart = Date.UTC(completedAt.getUTCFullYear(), 0, 1);
      earliestSeasonStart = Math.min(earliestSeasonStart, seasonStart);
      latestCompletedAt = Math.max(latestCompletedAt, completedAtTime);

      if (match.team1Id != null) neededTeamIds.add(match.team1Id);
      if (match.team2Id != null) neededTeamIds.add(match.team2Id);
    }

    const eloRows =
      neededTeamIds.size > 0 &&
      Number.isFinite(earliestSeasonStart) &&
      Number.isFinite(latestCompletedAt)
        ? await tx
            .select({
              id: eloRatingsTable.id,
              teamId: eloRatingsTable.team_id,
              mapName: eloRatingsTable.map_name,
              rating: eloRatingsTable.rating,
              ratingDate: eloRatingsTable.rating_date,
              sourceMatchId: mapsTable.match_id,
            })
            .from(eloRatingsTable)
            .leftJoin(mapsTable, eq(eloRatingsTable.map_played_id, mapsTable.id))
            .where(
              and(
                inArray(eloRatingsTable.team_id, Array.from(neededTeamIds)),
                gte(eloRatingsTable.rating_date, new Date(earliestSeasonStart)),
                lt(eloRatingsTable.rating_date, new Date(latestCompletedAt))
              )
            )
            .orderBy(
              asc(eloRatingsTable.team_id),
              asc(eloRatingsTable.map_name),
              asc(eloRatingsTable.rating_date),
              asc(eloRatingsTable.id)
            )
        : [];

    return {
      allMatches,
      allVetoes,
      eloRows,
      neededTeamCount: neededTeamIds.size,
    };
  }, {
    isolationLevel: "repeatable read",
    accessMode: "read only",
  });

  const { allMatches, allVetoes, eloRows, neededTeamCount } = sourceSnapshot;

  // Fail before any derived-table swap if a source-less row cannot be proven
  // to be a synthetic season reset.
  assertSourceLessPickBanRatingsAreAuditable(
    eloRows,
    "Pick/ban analysis rating history"
  );

  console.log(
    `Bulk-loaded one repeatable-read snapshot with ${allMatches.length} matches, ` +
      `${allVetoes.length} ordered vetoes, and ${eloRows.length} Elo history rows.`
  );

  const vetoesByMatch = new Map<number, (typeof allVetoes)[number][]>();
  for (const veto of allVetoes) {
    const matchVetoes = vetoesByMatch.get(veto.matchId);
    if (matchVetoes) {
      matchVetoes.push(veto);
    } else {
      vetoesByMatch.set(veto.matchId, [veto]);
    }
  }

  const eloHistories = buildEloHistories(eloRows);
  console.log(`Indexed Elo history for ${neededTeamCount} teams.`);

  const invalidMatches: string[] = [];
  const analysisRows: AnalysisInsert[] = [];
  let validMatchCount = 0;

  for (let matchIndex = 0; matchIndex < allMatches.length; matchIndex += 1) {
    const match = allMatches[matchIndex];
    const team1Id = match.team1Id;
    const team2Id = match.team2Id;
    const completedAt = match.completedAt;

    if (
      team1Id == null ||
      team2Id == null ||
      !completedAt ||
      !Number.isFinite(completedAt.getTime())
    ) {
      invalidMatches.push(`match_id=${match.id} missing team/valid completed_at`);
    } else {
      const vetoes = vetoesByMatch.get(match.id) ?? [];

      try {
        const mapNames = vetoes.map((veto) => veto.mapName);
        const score = scorePickBanVetoSequence({
          team1Id,
          team2Id,
          vetoes: vetoes.map((veto) => ({
            orderIndex: veto.orderIndex,
            action: veto.action,
            mapName: veto.mapName,
            teamId: veto.teamId,
          })),
          team1Ratings: buildPreMatchRatings(
            eloHistories,
            team1Id,
            mapNames,
            match.id,
            completedAt
          ),
          team2Ratings: buildPreMatchRatings(
            eloHistories,
            team2Id,
            mapNames,
            match.id,
            completedAt
          ),
        });

        analysisRows.push(
          ...score.steps.map((step) => ({
            matchId: match.id,
            teamId: step.teamId,
            vetoOrder: step.vetoOrder,
            action: step.action,
            mapName: step.mapName,
            eloLost: step.eloLost,
            cumulativeEloLost: step.cumulativeEloLost,
            optimalChoice: step.optimalChoice,
            availableMaps: step.availableMaps,
          }))
        );
        validMatchCount += 1;
      } catch (error) {
        invalidMatches.push(`match_id=${match.id} ${errorMessage(error)}`);
      }
    }

    const processedMatches = matchIndex + 1;
    if (
      processedMatches % PROGRESS_INTERVAL === 0 ||
      processedMatches === allMatches.length
    ) {
      console.log(
        `Processed ${processedMatches}/${allMatches.length} matches: ` +
          `${validMatchCount} valid, ${invalidMatches.length} excluded, ` +
          `${analysisRows.length} derived rows.`
      );
    }
  }

  if (invalidMatches.length > 0) {
    console.warn("Pick/ban analysis excluded invalid matches from the rebuilt derived table:");
    for (const invalidMatch of invalidMatches.slice(0, INVALID_LOG_LIMIT)) {
      console.warn(`- ${invalidMatch}`);
    }
    if (invalidMatches.length > INVALID_LOG_LIMIT) {
      console.warn(
        `- ... ${invalidMatches.length - INVALID_LOG_LIMIT} additional invalid match(es)`
      );
    }
    console.warn(`Excluded ${invalidMatches.length} invalid match record(s).`);
  }

  if (validMatchCount === 0 || analysisRows.length === 0) {
    throw new Error(
      "Pick/ban analysis produced no valid derived rows; existing rows were preserved."
    );
  }

  await db.transaction(async (tx) => {
    await tx.delete(matchVetoAnalysisTable);

    for (let start = 0; start < analysisRows.length; start += INSERT_CHUNK_SIZE) {
      await tx
        .insert(matchVetoAnalysisTable)
        .values(analysisRows.slice(start, start + INSERT_CHUNK_SIZE));
    }
  });

  console.log(
    `Successfully replaced pick/ban analysis with ${analysisRows.length} leakage-safe rows ` +
      `from ${validMatchCount} valid matches; excluded ${invalidMatches.length}.`
  );
}

processPickBanAnalysis()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("Pick/ban analysis failed:", error);
    process.exit(1);
  });
