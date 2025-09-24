import { PlayerGraphSection } from "./player-graph-section";
import { PlayerRatingsTable } from "./player-ratings-table";

export default async function PlayerRatingsPage() {
  return (
    <main className="container mx-auto flex flex-col gap-4 p-4">
      <h1 className="text-4xl font-bold mb-4 text-center text-green-500 dark:text-green-400 font-display">
        Player Ratings
      </h1>
      <PlayerGraphSection />
      <PlayerRatingsTable />
    </main>
  );
} 