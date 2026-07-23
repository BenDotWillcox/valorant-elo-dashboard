// backfill_maps.ts - mass backfill of completed matches, maps, vetoes, and per-map player stats
import axios from 'axios';
import { load } from 'cheerio';
import puppeteer, { type Browser } from 'puppeteer';
import { tournaments } from '@/lib/constants/tournaments';
import { db } from '@/db/db';
import { mapsTable, type NewMap } from '@/db/schema/maps-schema';
import { teamsTable } from '@/db/schema/teams-schema';
import { teamSlugAliasesTable } from '@/db/schema/team-slug-aliases-schema';
import { teamNameAliasesTable } from '@/db/schema/team-name-aliases-schema';
import { matchesTable } from '@/db/schema/matches-schema';
import { matchVetoesTable } from '@/db/schema/match-vetoes-schema';
import { playersTable } from '@/db/schema/players-schema';
import { playerMapStatsTable } from '@/db/schema/player-map-stats-schema';
import { sql, and, eq } from 'drizzle-orm';
import { MAP_POOL } from '@/lib/constants/maps';

const REQUEST_DELAY_MS = 750;

async function backfillCompletedMaps() {
  const allMaps = [...MAP_POOL.active, ...MAP_POOL.inactive];
  const mapRegex = new RegExp(`\\b(${allMaps.join('|')})\\b`, 'i');

  const safeParseInt = <T extends number | null>(val: string, fallback: T): number | T => {
    const parsed = parseInt(val, 10);
    return isNaN(parsed) ? fallback : parsed;
  };

  for (const [eventName, eventInfo] of Object.entries(tournaments)) {
    const { id: eventId, region } = eventInfo;
    const eventUrl = `https://www.vlr.gg/event/matches/${eventId}`;

    let eventHtml = '';
    try {
      const res = await axios.get(eventUrl);
      eventHtml = res.data;
    } catch (err) {
      console.error(`Failed to fetch event ${eventName}:`, err);
      continue;
    }

    const $ = load(eventHtml);
    const matchLinks: string[] = [];
    $('a').each((_, el) => {
      const text = $(el).text();
      const href = $(el).attr('href');
      if (href && /^\/\d+\//.test(href) && text.includes('Completed')) {
        matchLinks.push(`https://www.vlr.gg${href}`);
      }
    });

    const uniqueMatchLinks = Array.from(new Set(matchLinks));
    console.log(`[${eventName}] Found ${uniqueMatchLinks.length} completed matches`);

    let browser: Browser | undefined;
    try {
      browser = await puppeteer.launch({ headless: true });
      const page = await browser.newPage();

      for (let idx = 0; idx < uniqueMatchLinks.length; idx++) {
        const matchUrl = uniqueMatchLinks[idx];
        console.log(`[${eventName}] (${idx + 1}/${uniqueMatchLinks.length}) ${matchUrl}`);
        await delay(REQUEST_DELAY_MS);

        // parse vlr match id
        const matchIdStr = matchUrl.match(/\/(\d+)\//)?.[1];
        if (!matchIdStr) {
          console.warn(`Could not parse match id from ${matchUrl}`);
          continue;
        }
        const vlrMatchId = parseInt(matchIdStr, 10);

        // fetch static html for header, teams, and veto
        let matchHtml = '';
        try {
          const res = await axios.get(matchUrl);
          matchHtml = res.data;
        } catch (err) {
          console.error(`Failed to fetch match URL ${matchUrl}:`, err);
          continue;
        }
        const $$ = load(matchHtml);

        // teams by slug
        const teamLinks = $$('a[href*="/team/"]');
        if (teamLinks.length < 2) {
          console.warn(`Skipping: team info not found`);
          continue;
        }
        const team1Slug = ($$(teamLinks[0]).attr('href') || '').split('/').pop() || '';
        const team2Slug = ($$(teamLinks[1]).attr('href') || '').split('/').pop() || '';

        const getTeamData = async (slug: string) => {
          // Find the base team record first
          let teamRecord: { id: number; name: string; slug: string | null; } | null = null;
          
          const teamResult = await db.select({ id: teamsTable.id, name: teamsTable.name, slug: teamsTable.slug }).from(teamsTable).where(eq(teamsTable.slug, slug)).limit(1);
          
          if (teamResult.length > 0) {
            teamRecord = teamResult[0];
          } else {
            const aliasResult = await db.select({ teamId: teamSlugAliasesTable.team_id }).from(teamSlugAliasesTable).where(eq(teamSlugAliasesTable.slug, slug)).limit(1);
            if (aliasResult.length > 0) {
              const parentTeamResult = await db.select({ id: teamsTable.id, name: teamsTable.name, slug: teamsTable.slug }).from(teamsTable).where(eq(teamsTable.id, aliasResult[0].teamId)).limit(1);
              if (parentTeamResult.length > 0) {
                teamRecord = parentTeamResult[0];
              }
            }
          }
        
          if (!teamRecord) return null;
        
          // Now that we have the team, get its name aliases
          const aliases = await db.select({ alias: teamNameAliasesTable.alias })
            .from(teamNameAliasesTable)
            .where(eq(teamNameAliasesTable.team_id, teamRecord.id));
        
          return {
            ...teamRecord,
            aliases: aliases.map(a => a.alias),
          };
        }

        const [team1Data, team2Data] = await Promise.all([
          getTeamData(team1Slug),
          getTeamData(team2Slug),
        ]);
        
        const team1Id = team1Data?.id;
        const team2Id = team2Data?.id;

        if (!team1Id || !team2Id || !team1Data || !team2Data) {
          console.warn(`Missing team ids for ${team1Slug} / ${team2Slug}`);
          continue;
        }

        // header score, best_of, and completed_at
        const scoreSpans = $$('div.match-header-vs-score span').filter((_i, el) => {
          return $$(el).text().trim() !== ':';
        });

        const score1Text = scoreSpans.length > 0 ? $$(scoreSpans[0]).text().trim() : null;
        const score2Text = scoreSpans.length > 1 ? $$(scoreSpans[1]).text().trim() : null;
        const teamAWins = score1Text ? parseInt(score1Text, 10) : null;
        const teamBWins = score2Text ? parseInt(score2Text, 10) : null;
        
        const boText = $$('div.match-header-vs-note').last().text().trim();
        const boMatch = boText.match(/Bo(\d+)/i);
        const bestOf = boMatch ? parseInt(boMatch[1], 10) : null;

        const dateEl = $$('div.moment-tz-convert[data-utc-ts]').first();
        const utcTimestamp = dateEl.attr('data-utc-ts');
        const completedAt = utcTimestamp ? new Date(utcTimestamp + 'Z') : null;

        // upsert match
        const [matchRow] = await db
          .insert(matchesTable)
          .values({
            vlr_match_id: vlrMatchId,
            event_name: eventName,
            region,
            completed_at: completedAt ?? null,
            team1_id: team1Id,
            team2_id: team2Id,
            team1_score: teamAWins,
            team2_score: teamBWins,
            best_of: bestOf,
          })
          .onConflictDoUpdate({
            target: matchesTable.vlr_match_id,
            set: {
              event_name: eventName,
              region,
              completed_at: completedAt ?? null,
              team1_id: team1Id,
              team2_id: team2Id,
              team1_score: teamAWins,
              team2_score: teamBWins,
              best_of: bestOf,
            },
          })
          .returning();
        const matchId = matchRow.id;

        // veto list (static)
        const vetoInserts: Array<{ order: number; action: 'ban'|'pick'|'decider'; map: string; teamId?: number }> = [];
        let order = 0;

        // Attempt 1: Structured list
        const vetoHeading = $$('div.vm-stats-header').filter((_, el) => $$(el).text().trim().toLowerCase() === 'map veto').first();
        const vetoContainer = vetoHeading.next();
        
        const getTeamIdFromText = (text: string) => {
          const lowerText = text.toLowerCase();
          
          const team1Identifiers = [team1Data.name, team1Data.slug, ...team1Data.aliases].filter((s): s is string => !!s).map(s => s.toLowerCase());
          for (const identifier of team1Identifiers) {
              if (lowerText.includes(identifier)) return team1Id;
          }
      
          const team2Identifiers = [team2Data.name, team2Data.slug, ...team2Data.aliases].filter((s): s is string => !!s).map(s => s.toLowerCase());
          for (const identifier of team2Identifiers) {
              if (lowerText.includes(identifier)) return team2Id;
          }
      
          return undefined;
        }

        vetoContainer.find('div, li').each((_i, el) => {
          const text = $$(el).text().replace(/\s+/g, ' ').trim().toLowerCase();
          if (!text || text.length < 10) return;
          order += 1;

          const isDecider = /decider|remains/.test(text);
          const action: 'ban'|'pick'|'decider' = isDecider ? 'decider' : (/ban/.test(text) ? 'ban' : 'pick');
          const mapMatch = text.match(mapRegex);
          const map = mapMatch ? mapMatch[0].replace(/^\w/, c => c.toUpperCase()) : '';
          const teamId = isDecider ? undefined : getTeamIdFromText(text);

          if (map) vetoInserts.push({ order, action, map, teamId });
        });

        // Attempt 2: One-liner
        if (vetoInserts.length === 0) {
          const noteText = $$('div.match-header-note').first().text().trim();
          const parts = noteText.split(';').map(p => p.trim());
          order = 0;

          for (const part of parts) {
              order += 1;
              const text = part.toLowerCase();

              const isDecider = /remains/.test(text);
              const action: 'ban'|'pick'|'decider' = isDecider ? 'decider' : (/ban/.test(text) ? 'ban' : 'pick');
              const mapMatch = text.match(mapRegex);
              const map = mapMatch ? mapMatch[0].replace(/^\w/, c => c.toUpperCase()) : '';
              const teamId = isDecider ? undefined : getTeamIdFromText(text);

              if (map) {
                  vetoInserts.push({ order, action, map, teamId });
              }
          }
        }

        for (const v of vetoInserts) {
          await db.insert(matchVetoesTable).values({
            match_id: matchId,
            order_index: v.order,
            action: v.action,
            map_name: v.map,
            team_id: v.teamId ?? undefined,
          }).onConflictDoNothing();
        }

        // go to rendered page for per-map panels + players
        await page.goto(matchUrl, { waitUntil: 'networkidle0', timeout: 60000 });
        await page.waitForSelector('.vm-stats-game', { timeout: 60000 });
        const rendered = await page.content();
        const $$$ = load(rendered);

        let gameNumberCounter = 0;
        const panels = $$$('.vm-stats-game').toArray();
        for (let i = 0; i < panels.length; i++) {
          const panel = panels[i];
          const root = $$$(panel);

          const gameId = root.attr('data-game-id');
          const navItem = gameId ? $$$(`.vm-stats-gamesnav-item[data-game-id="${gameId}"]`) : null;
          const mapNameFromNav = (navItem?.text() || '').trim().replace(/^\d+\s+/, '');
          
          const mapNameFromHeader = (() => {
            const header = root.find('.map, .vm-stats-game-header').text();
            const m = header.match(mapRegex);
            return m?.[0] ? m[0].replace(/^\w/, c => c.toUpperCase()) : '';
          })();
          
          const mapName = mapNameFromNav || mapNameFromHeader;
          if (!mapName) continue;

          gameNumberCounter++;
          const gameNumber = gameNumberCounter;

          const scores = root.find('.team .score').slice(0, 2).map((_, s) => parseInt($$$(s).text().trim() || '0', 10)).get() as number[];
          if (scores.length !== 2) continue;
          const [scoreA, scoreB] = scores;

          const winnerTeamIdNum = scoreA > scoreB ? team1Id : (scoreB > scoreA ? team2Id : null);
          const loserTeamIdNum = scoreA > scoreB ? team2Id : (scoreB > scoreA ? team1Id : null);
          if (!winnerTeamIdNum || !loserTeamIdNum) continue;

          // Upsert/fetch map row by (match_id, game_number)
          const existingMap = await db
            .select({ id: mapsTable.id })
            .from(mapsTable)
            .where(and(eq(mapsTable.match_id, matchId), eq(mapsTable.game_number, gameNumber)))
            .limit(1);
          const mapRow = existingMap[0] ?? (await db
            .insert(mapsTable)
            .values({
              map_name: mapName,
              winner_team_id: winnerTeamIdNum,
              loser_team_id: loserTeamIdNum,
              winner_rounds: Math.max(scoreA, scoreB),
              loser_rounds: Math.min(scoreA, scoreB),
              event_name: eventName,
              region,
              completed_at: completedAt ?? null,
              match_id: matchId,
              game_number: gameNumber,
            } satisfies NewMap)
            .onConflictDoNothing()
            .returning())[0];

          // Parse two tables (team 1 / team 2)
          const statTables = root.find('table').toArray().filter(table => {
            const headerTexts = $$$(table).find('thead th').map((_, th) => $$$(th).text().trim().toLowerCase()).get();
            return headerTexts.some(h => h.includes('k/d/a') || h.includes('acs'));
          });

          for (let tIndex = 0; tIndex < statTables.length; tIndex++) {
            const table = statTables[tIndex];
            const teamIdForTable = tIndex === 0 ? team1Id : team2Id;
            const headers = $$$(table).find('thead th').map((_, th) => $$$(th).text().trim().toLowerCase()).get();
            
            const findExactHeaderIndex = (label: string) => headers.indexOf(label);

            const getCellText = (rowIndex: number, ...possibleLabels: string[]) => {
              for (const label of possibleLabels) {
                const colIndex = findExactHeaderIndex(label);
                if (colIndex !== -1) {
                  return $$$(table).find('tbody tr').eq(rowIndex).find('td').eq(colIndex).text().trim();
                }
              }
              return '';
            }

            const rows = $$$(table).find('tbody tr').toArray();
            for (let rIndex = 0; rIndex < rows.length; rIndex++) {
              const row = rows[rIndex];
              const $row = $$$(row);
              const href = $row.find('a[href*="/player/"]').first().attr('href') || '';
              const playerIdPart = href.split('/')[2];
              const playerSlug = href.split('/').pop() || '';
              if (!playerSlug) continue;
              const vlrPlayerId = playerIdPart ? parseInt(playerIdPart, 10) : null;
              const ign = ($row.find('.text-of, .name').first().text().trim()) || playerSlug;
              const agent = ($row.find('img[alt][src*="/agents/"]').attr('alt') || '').trim() || 'Unknown';

              let kills = 0, deaths = 0, assists = 0;
              const kdaText = getCellText(rIndex, 'k/d/a', 'kda');
              const kdaMatch = kdaText.match(/(\d+)\s*\/\s*(\d+)\s*\/\s*(\d+)/);

              if (kdaMatch) {
                  kills = safeParseInt(kdaMatch[1], 0);
                  deaths = safeParseInt(kdaMatch[2], 0);
                  assists = safeParseInt(kdaMatch[3], 0);
              } else {
                  kills = safeParseInt(getCellText(rIndex, 'k', 'kills'), 0);
                  
                  const deathsColIndex = findExactHeaderIndex('d') !== -1 ? findExactHeaderIndex('d') : findExactHeaderIndex('deaths');
                  let deathText = '';
                  if (deathsColIndex !== -1) {
                      const deathsCell = $row.find('td').eq(deathsColIndex);
                      deathText = deathsCell.find('span.mod-both').text().trim();
                  }
                  deaths = safeParseInt(deathText, 0);

                  assists = safeParseInt(getCellText(rIndex, 'a', 'assists'), 0);
              }

              const acs = safeParseInt(getCellText(rIndex, 'acs'), null);
              const adr = safeParseInt(getCellText(rIndex, 'adr'), null);
              const kastMatch = (getCellText(rIndex, 'kast', 'kast%') || '').match(/([\d.]+)\s*%/);
              const kast = kastMatch ? parseFloat(kastMatch[1]) : null;
              const fk = safeParseInt(getCellText(rIndex, 'fk', 'fk'), 0);
              const fd = safeParseInt(getCellText(rIndex, 'fd', 'fd'), 0);

              const [playerRow] = await db
                .insert(playersTable)
                .values({ slug: playerSlug, ign, team_id: teamIdForTable, vlr_player_id: vlrPlayerId ?? undefined })
                .onConflictDoUpdate({ target: playersTable.slug, set: { ign, team_id: teamIdForTable, vlr_player_id: vlrPlayerId ?? undefined } })
                .returning();

              await db.insert(playerMapStatsTable).values({
                match_id: matchId,
                map_id: mapRow.id,
                game_number: gameNumber,
                team_id: teamIdForTable,
                player_id: playerRow.id,
                agent,
                kills,
                deaths,
                assists,
                fk,
                fd,
                acs: acs ?? undefined,
                adr: adr ?? undefined,
                kast: kast != null ? String(kast) : undefined,
              });
            }
          }
        }
      }
    } catch (err) {
      console.error(`Puppeteer failure for ${eventName}:`, err);
    } finally {
      // Close browser if opened
      try { await browser?.close(); } catch {}
    }
  }
}

if (require.main === module) {
  backfillCompletedMaps().then(() => {
    console.log('Backfill completed.');
    process.exit(0);
  }).catch(err => {
    console.error('Unexpected error in backfill:', err);
    process.exit(1);
  });
}

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function getMonthNumber(month: string): string {
  const months: Record<string, string> = {
    January: '01', February: '02', March: '03', April: '04',
    May: '05', June: '06', July: '07', August: '08',
    September: '09', October: '10', November: '11', December: '12',
  };
  return months[month] || '01';
}
