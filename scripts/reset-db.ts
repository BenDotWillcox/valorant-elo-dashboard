import { db } from '@/db/db';
import { sql } from 'drizzle-orm';

async function resetDatabase() {
  console.log('Resetting database...');

  const tables = [
    'player_map_stats',
    'players',
    'match_vetoes',
    'maps',
    'matches',
  ];

  try {
    await db.execute(sql.raw(`TRUNCATE TABLE ${tables.join(', ')} RESTART IDENTITY CASCADE;`));
    console.log('Successfully truncated all tables.');
  } catch (error) {
    console.error('Failed to reset database:', error);
    process.exit(1);
  }

  process.exit(0);
}

resetDatabase();
