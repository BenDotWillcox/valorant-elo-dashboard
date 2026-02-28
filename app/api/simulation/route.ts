import { runMonteCarloSimulation } from "@/lib/simulation/simulation";
import { getTournamentConfig } from "@/lib/simulation/tournament-formats";
import { NextResponse } from "next/server";

function parseSimulationCount(request: Request): number | null {
  const { searchParams } = new URL(request.url);
  const numSimulationsParam = searchParams.get("simulations");
  const numSimulations = numSimulationsParam ? parseInt(numSimulationsParam, 10) : 10000;

  if (isNaN(numSimulations) || numSimulations <= 0) {
    return null;
  }

  return numSimulations;
}

function resolveTournamentConfig(tournamentId?: string | null) {
  if (!tournamentId) {
    return { config: undefined as undefined, error: null as string | null };
  }

  const config = getTournamentConfig(tournamentId);
  if (!config) {
    return { config: undefined as undefined, error: `Unknown tournamentId: ${tournamentId}` };
  }

  return { config, error: null as string | null };
}

export async function POST(request: Request) {
  try {
    const numSimulations = parseSimulationCount(request);
    if (numSimulations === null) {
      return NextResponse.json(
        { error: "Invalid number of simulations" },
        { status: 400 }
      );
    }

    const { searchParams } = new URL(request.url);
    const body = await request.json();
    const tournamentId = body.tournamentId ?? searchParams.get("tournamentId");
    const { config, error } = resolveTournamentConfig(tournamentId);
    if (error) {
      return NextResponse.json(
        { error },
        { status: 400 }
      );
    }

    const completedWinners = body.completedWinners;
    const results = await runMonteCarloSimulation(numSimulations, completedWinners, config);

    return NextResponse.json({
      results,
      numSimulations,
      tournamentId: config?.id ?? null,
    });
  } catch (error) {
    console.error("Error running simulation:", error);
    return NextResponse.json(
      { error: "Internal Server Error" },
      { status: 500 }
    );
  }
}

export async function GET(request: Request) {
  try {
    const numSimulations = parseSimulationCount(request);
    if (numSimulations === null) {
      return NextResponse.json(
        { error: "Invalid number of simulations" },
        { status: 400 }
      );
    }

    const { searchParams } = new URL(request.url);
    const tournamentId = searchParams.get("tournamentId");
    const { config, error } = resolveTournamentConfig(tournamentId);
    if (error) {
      return NextResponse.json(
        { error },
        { status: 400 }
      );
    }

    const results = await runMonteCarloSimulation(numSimulations, undefined, config);
    return NextResponse.json({
      results,
      numSimulations,
      tournamentId: config?.id ?? null,
    });
  } catch (error) {
    console.error("Error running simulation:", error);
    return NextResponse.json(
      { error: "Internal Server Error" },
      { status: 500 }
    );
  }
}
