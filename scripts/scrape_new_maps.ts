// scrape_new_maps.ts
import axios from 'axios';
import { load } from 'cheerio';
import puppeteer, { type Browser } from 'puppeteer';
import { tournaments } from '@/lib/constants/tournaments';
import { db } from '@/db/db';
import { mapsTable } from '@/db/schema/maps-schema';
import { teamsTable } from '@/db/schema/teams-schema';
import { teamSlugAliasesTable } from '@/db/schema/team-slug-aliases-schema';
import { teamNameAliasesTable } from '@/db/schema/team-name-aliases-schema';
import { matchesTable } from '@/db/schema/matches-schema';
import { matchVetoesTable } from '@/db/schema/match-vetoes-schema';
import { playersTable } from '@/db/schema/players-schema';
import { playerMapStatsTable } from '@/db/schema/player-map-stats-schema';
import { sql, and, eq } from 'drizzle-orm';
import type { NewMap } from '@/db/schema/maps-schema'; // at top
import { MAP_POOL } from '@/lib/constants/maps';

const REQUEST_DELAY = 1000;  // 1 second delay between requests to avoid flooding

const safeParseInt = <T extends number | null>(val: string, fallback: T): number | T => {
  const parsed = parseInt(val, 10);
  return isNaN(parsed) ? fallback : parsed;
};

async function scrapeRecentMaps() {
  for (const [eventName, eventInfo] of Object.entries(tournaments)) {
    // Only process ongoing tournaments to find upcoming and completed matches
    if (eventInfo.status !== 'ongoing') {
      console.log(`Skipping tournament '${eventName}' with status: ${eventInfo.status}`);
      continue;
    }

    const { id: eventId, region } = eventInfo;
    const eventUrl = `https://www.vlr.gg/event/matches/${eventId}`;
    let eventHtml: string;
    try {
      // Fetch the event's matches page
      const res = await axios.get(eventUrl);
      eventHtml = res.data;
    } catch (err) {
      console.error(`Failed to fetch event page for "${eventName}":`, err);
      continue;  // skip this event on error
    }

    const $ = load(eventHtml);
    // Select all match links on the event page
    const matchInfos: { url: string; isCompleted: boolean }[] = [];
    $('a').each((_, element) => {
      const href = $(element).attr('href');
      if (!href || !/^\/\d+\//.test(href)) return;

      const text = $(element).text();
      if (text.includes('Completed')) {
        if (text.match(/Completed\s+\d+mo/) || text.match(/Completed\s+\d+yr/)) {
          return; // skip matches completed months/years ago
        }
        matchInfos.push({ url: `https://www.vlr.gg${href}`, isCompleted: true });
      } else {
        matchInfos.push({ url: `https://www.vlr.gg${href}`, isCompleted: false });
      }
    });

    for (const { url: matchUrl, isCompleted } of matchInfos) {
      const matchIdStr = matchUrl.match(/\/(\d+)\//)?.[1] || null;
      if (!matchIdStr) {
        console.warn(`Could not parse match ID from URL: ${matchUrl}`);
        continue;
      }
      const vlrMatchId = parseInt(matchIdStr, 10);

      // Check if match already exists in the database
      const [existingMatch] = await db
        .select({ id: matchesTable.id, team1_score: matchesTable.team1_score })
        .from(matchesTable)
        .where(sql`vlr_match_id = ${vlrMatchId}`)
        .limit(1);

      // If match is fully processed, skip
      if (existingMatch && existingMatch.team1_score !== null) {
        console.log(`Match ${vlrMatchId} already processed. Skipping.`);
        continue;
      }
      
      // If it's an upcoming match
      if (!isCompleted) {
        if (existingMatch) {
          console.log(`Upcoming match ${vlrMatchId} already in DB. Skipping.`);
          continue;
        }

        console.log(`Processing new upcoming match: ${vlrMatchId}`);
        await new Promise(res => setTimeout(res, REQUEST_DELAY));
        let matchHtml: string;
        try {
          const res = await axios.get(matchUrl);
          matchHtml = res.data;
        } catch (err) {
          console.error(`Failed to fetch upcoming match page ${matchUrl}:`, err);
          continue;
        }
        const $$ = load(matchHtml);

        const teamLinks = $$('a[href*="/team/"]');
        if (teamLinks.length < 2) continue;
        const team1Slug = ($$(teamLinks[0]).attr('href') || '').split('/').pop() || '';
        const team2Slug = ($$(teamLinks[1]).attr('href') || '').split('/').pop() || '';

        const [team1Data, team2Data] = await Promise.all([
          db.select().from(teamsTable).where(sql`vlr_slug = ${team1Slug}`).limit(1),
          db.select().from(teamsTable).where(sql`vlr_slug = ${team2Slug}`).limit(1)
        ]);
        const team1Id = team1Data[0]?.id;
        const team2Id = team2Data[0]?.id;
        if (!team1Id || !team2Id) continue;

        let completedAt: string | null = null;
        try {
          const dateText = $$('div.match-header-date').first().text().trim();
          const timeText = $$('div.match-header-date').last().text().trim();
          const dateMatch = dateText.match(/(\w+),\s+(\w+)\s+(\d+)/);
          const timeMatch = timeText.match(/(\d+):(\d+)\s+(AM|PM)\s+(\w+)/);
          if (dateMatch && timeMatch) {
            const [_, __, month, day] = dateMatch;
            const [___, hours, minutes, meridiem] = timeMatch;
            let hour = parseInt(hours);
            if (meridiem === 'PM' && hour !== 12) hour += 12;
            if (meridiem === 'AM' && hour === 12) hour = 0;
            const year = new Date().getFullYear();
            const dateStr = `${year}-${getMonthNumber(month)}-${day.padStart(2, '0')} ${hour.toString().padStart(2, '0')}:${minutes}:00`;
            completedAt = dateStr;
          }
        } catch (err) {
          console.error(`Date parse error for ${matchUrl}:`, err);
        }

        await db.insert(matchesTable).values({
          vlr_match_id: vlrMatchId,
          event_name: eventName,
          region,
          completed_at: completedAt ? new Date(completedAt) : null,
          team1_id: team1Id,
          team2_id: team2Id,
        }).onConflictDoNothing();
        
        continue; // Done with this upcoming match
      }

      console.log(`Processing completed match: ${vlrMatchId}`);
      await new Promise(res => setTimeout(res, REQUEST_DELAY));  // throttle requests
      let matchHtml: string;
      try {
        const res = await axios.get(matchUrl);
        matchHtml = res.data;
      } catch (err) {
        console.error(`Failed to fetch match page ${matchUrl}:`, err);
        continue;
      }
      const $$ = load(matchHtml);

      // Extract team IDs from team anchor hrefs
      const teamLinks = $$('a[href*="/team/"]');
      if (teamLinks.length < 2) {
        console.warn(`Team links not found on ${matchUrl}, skipping match.`);
        continue;
      }

      // Get team slugs instead of raw IDs
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

      // Get team IDs from database
      const [team1Data, team2Data] = await Promise.all([
        getTeamData(team1Slug),
        getTeamData(team2Slug),
      ]);

      const team1Id = team1Data?.id;
      const team2Id = team2Data?.id;

      if (!team1Id || !team2Id || !team1Data || !team2Data) {
        console.warn(`Could not find team IDs for ${team1Slug} or ${team2Slug} in database`);
        continue;
      }

      // Determine how many maps were played from the match score (e.g., "2 : 1")
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

      // Extract match date/time and format completed_at
      const dateEl = $$('div.moment-tz-convert[data-utc-ts]').first();
      const utcTimestamp = dateEl.attr('data-utc-ts');
      const completedAt = utcTimestamp ? new Date(utcTimestamp + 'Z') : null;

      // Now retrieve per-map details with reliable score extraction

      // Upsert match
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
            completed_at: completedAt ?? null,
            team1_id: team1Id,
            team2_id: team2Id,
            team1_score: teamAWins,
            team2_score: teamBWins,
            best_of: bestOf,
            event_name: eventName,
            region,
          },
        })
        .returning();
      
      const matchId = matchRow.id;

      const allMaps = [...MAP_POOL.active, ...MAP_POOL.inactive];
      const mapRegex = new RegExp(`\\b(${allMaps.join('|')})\\b`, 'i');
      
      // Parse vetoes from the static match HTML
      const vetoItems: Array<{ order: number; action: 'ban' | 'pick' | 'decider'; map: string; teamId?: number }> = [];
      let order = 0;

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

      // Attempt 1: Structured list
      const vetoHeading = $$('div.vm-stats-header').filter((_, el) => $$(el).text().trim().toLowerCase() === 'map veto').first();
      const vetoContainer = vetoHeading.next();

      vetoContainer.find('div, li').each((_i, el) => {
        const text = $$(el).text().replace(/\s+/g, ' ').trim().toLowerCase();
        if (!text || text.length < 10) return;
        order += 1;

        const isDecider = /decider|remains/.test(text);
        const action: 'ban'|'pick'|'decider' = isDecider ? 'decider' : (/ban/.test(text) ? 'ban' : 'pick');
        const mapMatch = text.match(mapRegex);
        const map = mapMatch ? mapMatch[0].replace(/^\w/, c => c.toUpperCase()) : '';
        const teamId = isDecider ? undefined : getTeamIdFromText(text);

        if (map) vetoItems.push({ order, action, map, teamId });
      });

      // Attempt 2: One-liner
      if (vetoItems.length === 0) {
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
                vetoItems.push({ order, action, map, teamId });
            }
        }
      }
      
      // Insert vetoes
      for (const v of vetoItems) {
        await db
          .insert(matchVetoesTable)
          .values({
            match_id: matchId,
            order_index: v.order,
            action: v.action,
            map_name: v.map,
            team_id: v.teamId ?? undefined,
          })
          .onConflictDoNothing();
      }

      // Use Puppeteer to get map scores
      let browser: Browser | undefined;
      try {
        browser = await puppeteer.launch({ headless: true });
        const page = await browser.newPage();
        await page.goto(matchUrl, { waitUntil: 'networkidle0' });
        
        // Wait for map tabs to be visible
        await page.waitForSelector('.vm-stats-game', { timeout: 60000 });
        const rendered = await page.content();
        const $$$ = load(rendered);

        let gameNumberCounter = 0;
        const panels = $$$('.vm-stats-game').toArray();

        for (let i = 0; i < panels.length; i++) {
          try {
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
            
            const [mapRow] = await db.insert(mapsTable).values({
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
            } satisfies NewMap).onConflictDoNothing().returning();

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

          } catch (err) {
            console.error(`Error getting scores for map:`, err);
          }
        }
      } catch (err) {
        console.error(`Puppeteer error on ${matchUrl}:`, err);
      } finally {
        if (browser) await browser.close();
      }

      // Legacy post-processing removed; maps inserted inline per game
    } // matches loop
  } // events loop
}

// Run the scraper
scrapeRecentMaps().then(() => {
  console.log("Recent VCT maps scraped successfully.");
  process.exit(0);
}).catch(err => {
  console.error("Unexpected error in scrapeRecentMaps:", err);
  process.exit(1);
});

// Helper function to convert month name to number
function getMonthNumber(month: string): string {
  const months: Record<string, string> = {
    'January': '01', 'February': '02', 'March': '03', 'April': '04',
    'May': '05', 'June': '06', 'July': '07', 'August': '08',
    'September': '09', 'October': '10', 'November': '11', 'December': '12'
  };
  return months[month] || '01';
}
