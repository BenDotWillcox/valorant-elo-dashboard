// scrape_new_maps.ts
import axios from 'axios';
import { load } from 'cheerio';
import puppeteer from 'puppeteer';
import { tournaments } from '@/lib/constants/tournaments';
import { db } from '@/db/db';
import { mapsTable } from '@/db/schema/maps-schema';
import { teamsTable } from '@/db/schema/teams-schema';
import { sql } from 'drizzle-orm';
// import { mapsTable } from './maps-schema'; // (assuming this defines table/columns, not explicitly needed for query)

const REQUEST_DELAY = 1000;  // 1 second delay between requests to avoid flooding&#8203;:contentReference[oaicite:3]{index=3}

async function scrapeRecentMaps() {
  for (const [eventName, eventInfo] of Object.entries(tournaments)) {
    // Skip completed tournaments
    if (eventInfo.status === 'completed') {
      console.log(`Skipping completed tournament: ${eventName}`);
      continue;
    }

    // Skip upcoming tournaments
    if (eventInfo.status === 'upcoming') {
      console.log(`Skipping upcoming tournament: ${eventName}`);
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
    // Select all match links on the event page that are completed
    const matchLinks: string[] = [];
    $('a').each((_, element) => {
      const text = $(element).text();
      const href = $(element).attr('href');
      if (!href) return;
      // Only consider links that look like match pages (href starts with "/" followed by digits) and have "Completed"
      if (/^\/\d+\//.test(href) && text.includes('Completed')) {
        // Optionally, skip matches that are clearly old (months/years ago) if focusing on recent data
        if (text.match(/Completed\s+\d+mo/) || text.match(/Completed\s+\d+yr/)) {
          return; // skip matches completed months/years ago (handled by backfill script)
        }
        matchLinks.push(`https://www.vlr.gg${href}`);
      }
    });

    for (const matchUrl of matchLinks) {
      await new Promise(res => setTimeout(res, REQUEST_DELAY));  // throttle requests&#8203;:contentReference[oaicite:4]{index=4}
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

      // Get team IDs from database
      const [team1Data, team2Data] = await Promise.all([
        db.select().from(teamsTable).where(sql`vlr_slug = ${team1Slug}`).limit(1),
        db.select().from(teamsTable).where(sql`vlr_slug = ${team2Slug}`).limit(1)
      ]);

      const team1Id = team1Data[0]?.id;
      const team2Id = team2Data[0]?.id;

      if (!team1Id || !team2Id) {
        console.warn(`Could not find team IDs for ${team1Slug} or ${team2Slug} in database`);
        continue;
      }

      // Determine how many maps were played from the match score (e.g., "2 : 1")
      let mapsPlayed = 0;
      let winnerTeamId: number | null = null;
      let loserTeamId: number | null = null;
      const scoreText = $$('.match-header').text(); // try to get the match score text
      const scoreMatch = scoreText.match(/(\d+)\s*:\s*(\d+)/);
      if (scoreMatch) {
        const [_, winsA, winsB] = scoreMatch;
        const teamAWins = parseInt(winsA, 10), teamBWins = parseInt(winsB, 10);
        mapsPlayed = teamAWins + teamBWins;
        // Determine match winner (for context, not directly needed for per-map but useful for logging)
        if (teamAWins > teamBWins) {
          winnerTeamId = team1Id ? parseInt(team1Id) : null;
          loserTeamId = team2Id ? parseInt(team2Id) : null;
        } else if (teamBWins > teamAWins) {
          winnerTeamId = team2Id ? parseInt(team2Id) : null;
          loserTeamId = team1Id ? parseInt(team1Id) : null;
        }
      }

      // Extract match date/time and format completed_at
      let completedAt: string | null = null;
      try {
        const dateText = $$('div.match-header-date').first().text().trim();
        const timeText = $$('div.match-header-date').last().text().trim();
        
        // Extract date components with regex
        const dateMatch = dateText.match(/(\w+),\s+(\w+)\s+(\d+)/);
        const timeMatch = timeText.match(/(\d+):(\d+)\s+(AM|PM)\s+(\w+)/);
        
        if (dateMatch && timeMatch) {
          const [_, __, month, day] = dateMatch;
          const [___, hours, minutes, meridiem, timezone] = timeMatch;
          
          // Convert to 24-hour format
          let hour = parseInt(hours);
          if (meridiem === 'PM' && hour !== 12) hour += 12;
          if (meridiem === 'AM' && hour === 12) hour = 0;
          
          // Create date string in SQL format
          const dateStr = `2025-${getMonthNumber(month)}-${day.padStart(2, '0')} ${hour.toString().padStart(2, '0')}:${minutes}:00`;
          completedAt = dateStr;
        } else {
          console.warn(`Could not parse date components for ${matchUrl}`);
          completedAt = null;
        }
      } catch (err) {
        console.error(`Date parse error for ${matchUrl}:`, err);
        completedAt = null;
      }

      // Now retrieve per-map details with reliable score extraction
      let mapResults: { map: string; winner: number | null; loser: number | null; win_rounds: number; lose_rounds: number }[] = [];

      // Use Puppeteer to get map scores
      let browser;
      try {
        browser = await puppeteer.launch({ headless: true });
        const page = await browser.newPage();
        await page.goto(matchUrl, { waitUntil: 'networkidle0' });
        
        // Wait for map tabs to be visible
        await page.waitForSelector('.vm-stats-gamesnav-item', { timeout: 10000 });
        
        // Get map names
        const mapNames = await page.$$eval('.vm-stats-gamesnav-item', (elements) =>
          elements
            .map(el => el.textContent?.trim())
            .filter((text): text is string => !!text)
            .filter(text => !text.toLowerCase().includes('all maps'))
            .map(text => text.replace(/^\d+\s+/, ''))
        );

        // For each map
        for (let i = 0; i < mapNames.length; i++) {
          try {
            // Check if map was played
            const isClickable = await page.$eval(
              `.vm-stats-gamesnav-item:nth-child(${i + 2})`,
              el => el.getAttribute('data-disabled') === '0'
            ).catch(() => false);

            if (!isClickable) {
              console.log(`Map ${mapNames[i]} was not played`);
              continue;
            }

            // Get game ID and click tab
            const gameId = await page.$eval(
              `.vm-stats-gamesnav-item:nth-child(${i + 2})`,
              el => el.getAttribute('data-game-id')
            );
            
            await page.click(`.vm-stats-gamesnav-item:nth-child(${i + 2})`);
            await new Promise(resolve => setTimeout(resolve, 1000));

            // Get scores
            const scores = await page.$$eval(
              `.vm-stats-game[data-game-id="${gameId}"] .team .score`,
              elements => {
                console.log(`Found ${elements.length} score elements`);
                return elements
                  .map(el => parseInt(el.textContent?.trim() || '0'))
                  .filter(score => !isNaN(score))
                  .slice(0, 2);
              }
            );

            if (scores.length === 2) {
              const [scoreA, scoreB] = scores;
              let winner = null, loser = null;
              
              if (scoreA > scoreB) {
                winner = team1Id ? parseInt(team1Id) : null;
                loser = team2Id ? parseInt(team2Id) : null;
              } else if (scoreB > scoreA) {
                winner = team2Id ? parseInt(team2Id) : null;
                loser = team1Id ? parseInt(team1Id) : null;
              }

              if (winner && loser) {
                mapResults.push({
                  map: mapNames[i],
                  winner,
                  loser,
                  win_rounds: Math.max(scoreA, scoreB),
                  lose_rounds: Math.min(scoreA, scoreB)
                });
              }
            }
          } catch (err) {
            console.error(`Error getting scores for ${mapNames[i]}:`, err);
          }
        }
      } catch (err) {
        console.error(`Puppeteer error on ${matchUrl}:`, err);
      } finally {
        if (browser) await browser.close();
      }

      // Check if map already exists before insertion
      for (const result of mapResults) {
        const { map, winner, loser, win_rounds, lose_rounds } = result;
        
        const winnerTeamId = winner === parseInt(team1Id.toString()) ? team1Id : team2Id;
        const loserTeamId = loser === parseInt(team1Id.toString()) ? team1Id : team2Id;

        try {
          // Check if this map result already exists
          const existingMap = await db.select()
            .from(mapsTable)
            .where(sql`
              map_name = ${map} AND 
              winner_team_id = ${winnerTeamId} AND 
              loser_team_id = ${loserTeamId} AND 
              winner_rounds = ${win_rounds} AND 
              loser_rounds = ${lose_rounds} AND 
              event_name = ${eventName}
            `)
            .limit(1);

          if (existingMap.length > 0) {
            console.log(`Skipping existing map: [${eventName}] ${map}`);
          continue;
        }

          // Insert new map result
          await db.insert(mapsTable).values({
            map_name: map,
            winner_team_id: winnerTeamId,
            loser_team_id: loserTeamId,
            winner_rounds: win_rounds,
            loser_rounds: lose_rounds,
            event_name: eventName,
            region: region,
            completed_at: completedAt ? new Date(completedAt) : null
          });
          
          console.log(`Inserted new map: [${eventName}] ${map} – ${winnerTeamId} beat ${loserTeamId} (${win_rounds}-${lose_rounds})`);
        } catch (dbErr) {
          console.error(`DB error for ${eventName} ${map}:`, dbErr);
        }
      }
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
