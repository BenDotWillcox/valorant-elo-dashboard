import { PlayerGraphSection } from "./player-graph-section";
import { PlayerRatingsTable } from "./player-ratings-table";

export default async function PlayerRatingsPage() {
  return (
    <main className="container mx-auto flex flex-col gap-4 p-4">
      <h1 className="text-2xl font-bold">Player Ratings</h1>
      <PlayerGraphSection />
      <PlayerRatingsTable />
    </main>
  );
} 