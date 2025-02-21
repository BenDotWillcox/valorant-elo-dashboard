// backfill_maps.ts
import axios from 'axios';
import * as cheerio from 'cheerio';
import puppeteer from 'puppeteer';
import { tournaments } from '@/lib/constants/tournaments';
import { db } from '@/db/db';
import { mapsTable, NewMap } from '@/db/schema/maps-schema';
import { teamsTable } from '@/db/schema/teams-schema';
import { sql } from 'drizzle-orm';

const REQUEST_DELAY = 1000;  // 1 sec delay to avoid hitting rate limits

async function backfill2025Maps() {
  console.log('Starting backfill process...');
  
  for (const [eventName, eventInfo] of Object.entries(tournaments)) {
    console.log(`\nProcessing event: ${eventName}`);
    
    const { id: eventId, region } = eventInfo;
    const eventUrl = `https://www.vlr.gg/event/matches/${eventId}`;
    let eventHtml: string;
    try {
      const res = await axios.get(eventUrl);
      eventHtml = res.data;
    } catch (err) {
      console.error(`Failed to fetch event ${eventName}:`, err);
      continue;
    }
    const $ = cheerio.load(eventHtml);
    const matchLinks: string[] = [];
    // Gather *all* completed match links (no date filtering, since we want full history)
    $('a').each((_, element) => {
      const text = $(element).text();
      const href = $(element).attr('href');
      if (href && /^\/\d+\//.test(href) && text.includes('Completed')) {
        matchLinks.push(`https://www.vlr.gg${href}`);
      }
    });

    // Remove duplicates (in case the page listed some matches twice due to stage filters, etc.)
    const uniqueMatchLinks = Array.from(new Set(matchLinks));

    // Use one Puppeteer browser instance for all matches in this event to reduce overhead
    let browser = await puppeteer.launch({ headless: true });
    const page = await browser.newPage();
    
    // After getting match links
    console.log(`Found ${uniqueMatchLinks.length} matches to process`);
    
    let processedMatches = 0;
    let processedMaps = 0;
    
    for (const matchUrl of uniqueMatchLinks) {
      processedMatches++;
      console.log(`\nProcessing match ${processedMatches}/${uniqueMatchLinks.length}: ${matchUrl}`);
      
      await new Promise(res => setTimeout(res, REQUEST_DELAY));
      let matchHtml: string;
      try {
        const res = await axios.get(matchUrl);
        matchHtml = res.data;
      } catch (err) {
        console.error(`Failed to fetch match URL ${matchUrl}:`, err);
        continue;
      }
      const $$ = cheerio.load(matchHtml);
      const teamLinks = $$('a[href*="/team/"]');
      if (teamLinks.length < 2) {
        console.warn(`Skipping ${matchUrl}: team info not found`);
        continue;
      }
      const team1Href = $$(teamLinks[0]).attr('href') || '';
      const team2Href = $$(teamLinks[1]).attr('href') || '';
      const team1Id = parseInt(team1Href.split('/')[2] || '0');
      const team2Id = parseInt(team2Href.split('/')[2] || '0');

      // Parse match date/time
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

      // Use Puppeteer to get map outcomes (since historical data likely not in static HTML)
      let mapResults: Array<{ map: string; team1Score: number; team2Score: number }> = [];
      try {
        await page.goto(matchUrl, { waitUntil: 'networkidle0' });
        
        // Get team info first
        const teams = await page.$$eval('.match-header-link-name', els => 
          els.map(el => ({
            name: el.textContent?.trim() || '',
            link: el.closest('a')?.getAttribute('href') || ''
          }))
        );

        const team1Slug = teams[0].link.split('/').pop() || '';
        const team2Slug = teams[1].link.split('/').pop() || '';

        // Get team IDs from database
        const [team1Data, team2Data] = await Promise.all([
          db.select().from(teamsTable).where(sql`vlr_slug = ${team1Slug}`).limit(1),
          db.select().from(teamsTable).where(sql`vlr_slug = ${team2Slug}`).limit(1)
        ]);

        const team1Id = team1Data[0]?.id;
        const team2Id = team2Data[0]?.id;

        if (!team1Id || !team2Id) {
          console.error(`Could not find team IDs for ${team1Slug} or ${team2Slug}`);
          continue;
        }

        // Wait for the map tabs to be visible
        await page.waitForSelector('.vm-stats-gamesnav-item', { timeout: 10000 });
        
        // Get map names
        const mapNames = await page.$$eval('.vm-stats-gamesnav-item', (elements) =>
          elements
            .map(el => el.textContent?.trim())
            .filter((text): text is string => !!text)  // Type guard to remove undefined
            .filter(text => !text.toLowerCase().includes('all maps'))
            .map(text => text.replace(/^\d+\s+/, ''))
        );

        console.log('Map names found:', mapNames);
        
        // For each map
        for (let i = 0; i < mapNames.length; i++) {
          try {
            // Check if map tab is clickable
            const isClickable = await page.$eval(
              `.vm-stats-gamesnav-item:nth-child(${i + 2})`,
              el => el.getAttribute('data-disabled') === '0'
            ).catch(() => false);

            if (!isClickable) {
              console.log(`Map ${mapNames[i]} was not played (disabled tab)`);
              continue;
            }

            // Get the game ID for this map
            const gameId = await page.$eval(
              `.vm-stats-gamesnav-item:nth-child(${i + 2})`,
              el => el.getAttribute('data-game-id')
            );

            // Click and wait a bit
            await page.click(`.vm-stats-gamesnav-item:nth-child(${i + 2})`);
            await new Promise(resolve => setTimeout(resolve, 1000));

            // Get scores with detailed logging
            const mapScores = await page.$$eval(
              `.vm-stats-game[data-game-id="${gameId}"] .team .score`,
              elements => {
                console.log(`Found ${elements.length} score elements`);
                const scores = elements.map(el => {
                  const text = el.textContent?.trim() || '';
                  console.log(`Score element text: "${text}"`);
                  return parseInt(text || '0');
                })
                .filter(score => !isNaN(score))
                .slice(0, 2);
                
                return scores;
              }
            );

            console.log(`Raw scores for ${mapNames[i]} (game ${gameId}):`, mapScores);
            
            if (mapScores.length === 2) {
              mapResults.push({
                map: mapNames[i],
                team1Score: mapScores[0],
                team2Score: mapScores[1]
              });
              console.log(`Valid scores found for ${mapNames[i]}: ${mapScores[0]}-${mapScores[1]}`);
            } else {
              console.log(`No valid scores found for ${mapNames[i]} - found ${mapScores.length} scores`);
            }
          } catch (err) {
            console.error(`Error getting scores for ${mapNames[i]}:`, err);
          }
        }

        // Process maps right here, inside the try block where team1Data/team2Data are in scope
        for (const result of mapResults) {
          const { map, team1Score, team2Score } = result;
          
          let winnerTeamId, loserTeamId, winnerRounds, loserRounds;
          
          if (team1Score > team2Score) {
            winnerTeamId = team1Data[0].id;
            loserTeamId = team2Data[0].id;
            winnerRounds = team1Score;
            loserRounds = team2Score;
          } else {
            winnerTeamId = team2Data[0].id;
            loserTeamId = team1Data[0].id;
            winnerRounds = team2Score;
            loserRounds = team1Score;
          }

          console.log(`Teams: ${team1Data[0].name}(${team1Data[0].id}) vs ${team2Data[0].name}(${team2Data[0].id})`); // Debug log

          // Before DB insert
          console.log(`Attempting to insert: ${map} (${winnerRounds}-${loserRounds})`);
          
          try {
            const newMap: NewMap = {
              map_name: map,
              winner_team_id: winnerTeamId,
              loser_team_id: loserTeamId,
              winner_rounds: winnerRounds,
              loser_rounds: loserRounds,
              event_name: eventName,
              region,
              completed_at: completedAt ? new Date(completedAt) : null
            };
            
            await db.insert(mapsTable).values(newMap).onConflictDoNothing();
            
            console.log(`✓ Successfully inserted: [${eventName}] ${map} ${winnerRounds}-${loserRounds}`);
          } catch (err) {
            console.error(`✗ DB insert error for ${eventName} ${map}:`, err);
          }
        }
      } catch (err) {
        console.error(`Puppeteer parsing failed for ${matchUrl}:`, err);
      }
      
      console.log(`\nCompleted event ${eventName}:`);
      console.log(`- Processed ${processedMatches} matches`);
      console.log(`- Processed ${processedMaps} maps`);
    } // end match loop
    await browser.close();
  } // end event loop
  
  console.log('\nBackfill completed. Total events processed:', Object.keys(tournaments).length);
}

backfill2025Maps().then(() => {
  console.log("Backfill completed.");
  process.exit(0);
}).catch(err => {
  console.error("Unexpected error in backfill:", err);
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
