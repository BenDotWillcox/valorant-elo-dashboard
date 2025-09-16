import { runMonteCarloSimulation } from "@/lib/simulation/simulation";
import { NextResponse } from "next/server";

export async function POST(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const numSimulationsParam = searchParams.get("simulations");
    const numSimulations = numSimulationsParam
      ? parseInt(numSimulationsParam)
      : 10000;

    if (isNaN(numSimulations) || numSimulations <= 0) {
      return NextResponse.json(
        { error: "Invalid number of simulations" },
        { status: 400 }
      );
    }
    
    const body = await request.json();
    const eventName = body.eventName;

    if (!eventName) {
      return NextResponse.json(
        { error: "Event name is required" },
        { status: 400 }
      );
    }

    const results = await runMonteCarloSimulation(numSimulations, eventName);
    return NextResponse.json({
      results,
      numSimulations,
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
    const { searchParams } = new URL(request.url);
    const numSimulationsParam = searchParams.get("simulations");
    const numSimulations = numSimulationsParam
      ? parseInt(numSimulationsParam)
      : 10000;

    if (isNaN(numSimulations) || numSimulations <= 0) {
      return NextResponse.json(
        { error: "Invalid number of simulations" },
        { status: 400 }
      );
    }

    const results = await runMonteCarloSimulation(numSimulations, "VCT Champions 2025"); // Default event
    return NextResponse.json({
      results,
      numSimulations,
    });
  } catch (error) {
    console.error("Error running simulation:", error);
    return NextResponse.json(
      { error: "Internal Server Error" },
      { status: 500 }
    );
  }
}
