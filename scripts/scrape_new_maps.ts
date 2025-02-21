// scrape_new_maps.ts
import axios from 'axios';
import cheerio from 'cheerio';
import puppeteer from 'puppeteer';
import { tournaments } from '@/lib/constants/tournaments';
import { db } from '@/db/db';
import { mapsTable } from '@/db/schema/maps-schema';
// import { mapsTable } from './maps-schema'; // (assuming this defines table/columns, not explicitly needed for query)

const REQUEST_DELAY = 1000;  // 1 second delay between requests to avoid flooding&#8203;:contentReference[oaicite:3]{index=3}

async function scrapeRecentMaps() {
  for (const [eventName, eventInfo] of Object.entries(tournaments)) {
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

    const $ = cheerio.load(eventHtml);
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
      const $$ = cheerio.load(matchHtml);

      // Extract team IDs from team anchor hrefs (e.g., /team/1234/Team-Name)
      const teamLinks = $$('a[href*="/team/"]');
      if (teamLinks.length < 2) {
        console.warn(`Team links not found on ${matchUrl}, skipping match.`);
        continue;
      }
      const team1Href = $$(teamLinks[0]).attr('href') || '';
      const team2Href = $$(teamLinks[1]).attr('href') || '';
      const team1Id = team1Href.split('/')[2] || null;
      const team2Id = team2Href.split('/')[2] || null;
      if (!team1Id || !team2Id) {
        console.warn(`Could not parse team IDs from hrefs on ${matchUrl}`);
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
        // Get date and time strings from the page
        const dateText = $$('div.match-header-date').first().text().trim() || '';    // e.g. "Thursday, August 1st"
        const timeText = $$('div.match-header-date').last().text().trim() || '';     // e.g. "3:00 AM CDT"
        // If the site uses the same class for date and time, handle accordingly:
        let datePart = dateText, timePart = timeText;
        if (!timeText && dateText.match(/(AM|PM)/)) {
          // If both date and time are in dateText (no separate timeText)
          const match = dateText.match(/^(.+)\s+(\d+:\d+\s*(AM|PM)\s*[A-Z]+)$/);
          if (match) {
            datePart = match[1];
            timePart = match[2];
          }
        }
        // Infer year from event name or current year if not present
        let year = new Date().getFullYear();
        const yearMatch = eventName.match(/\b(20\d{2})\b/);
        if (yearMatch) year = parseInt(yearMatch[1]);
        // Remove ordinal suffixes from date (1st -> 1, 2nd -> 2, etc.)
        const ordinalDate = datePart.replace(/(\d+)(st|nd|rd|th)/, '$1');
        const dateTimeStr = `${ordinalDate}, ${year} ${timePart}`;  // e.g. "Thursday, August 1, 2025 3:00 AM CDT"
        const dateObj = new Date(dateTimeStr);
        completedAt = dateObj.toISOString();  // ISO format (UTC) for DB storage
      } catch (e) {
        console.warn(`Failed to parse date/time for match ${matchUrl}:`, e);
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

      // Insert each map result into the database
      for (const result of mapResults) {
        const { map, winner, loser, win_rounds, lose_rounds } = result;
        if (winner === null || loser === null) {
          // Skip if we couldn't determine winner/loser (e.g., incomplete data)
          continue;
        }
        try {
          await db.insert(mapsTable).values({
            map_name: map,
            winner_team_id: winner,
            loser_team_id: loser,
            winner_rounds: win_rounds,
            loser_rounds: lose_rounds,
            event_name: eventName,
            region: region,
            completed_at: completedAt ? new Date(completedAt) : null
          }).onConflictDoNothing();
          
          console.log(`Inserted: [${eventName}] ${map} – ${winner} beat ${loser} (${win_rounds}-${lose_rounds})`);
        } catch (dbErr) {
          console.error(`DB insert error for ${eventName} ${map}:`, dbErr);
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
