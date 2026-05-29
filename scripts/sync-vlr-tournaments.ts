import axios from "axios";
import { load } from "cheerio";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tournaments, type TournamentStatus } from "../lib/constants/tournaments";

type TournamentRecord = {
  id: number;
  region: string;
  status: TournamentStatus;
  start_date?: Date;
  end_date?: Date;
};

type VlrEvent = TournamentRecord & {
  name: string;
};

const EVENTS_URL = "https://www.vlr.gg/events/?tier=60";
const TOURNAMENTS_PATH = join(process.cwd(), "lib", "constants", "tournaments.ts");
const DRY_RUN = process.argv.includes("--dry-run");
const DEFER_COMPLETED_TRANSITIONS = process.argv.includes("--defer-completed-transitions");

const REGION_BY_NAME: Array<[RegExp, string]> = [
  [/\bamericas\b/i, "Americas"],
  [/\bemea\b/i, "EMEA"],
  [/\bpacific\b/i, "Pacific"],
  [/\bchina\b/i, "China"],
];

function isVctEvent(name: string) {
  if (/champions china qualifier/i.test(name)) return false;

  return (
    /\bvct\b/i.test(name) ||
    /champions tour/i.test(name) ||
    /valorant masters/i.test(name) ||
    /valorant champions/i.test(name) ||
    /lock\/\/in/i.test(name)
  );
}

function inferRegion(name: string) {
  if (/masters|champions|lock\/\/in/i.test(name)) return "International";

  for (const [pattern, region] of REGION_BY_NAME) {
    if (pattern.test(name)) return region;
  }

  return "International";
}

function inferYear(name: string) {
  const match = name.match(/\b(20\d{2})\b/);
  return match ? Number(match[1]) : new Date().getFullYear();
}

function getTournamentYear(name: string, tournament: TournamentRecord) {
  if (tournament.start_date) return tournament.start_date.getUTCFullYear();
  return inferYear(name);
}

function parseStatus(text: string): TournamentStatus | null {
  const lower = text.toLowerCase();
  if (/\bcompleted\b/.test(lower)) return "completed";
  if (/\bongoing\b/.test(lower)) return "ongoing";
  if (/\bupcoming\b/.test(lower)) return "upcoming";
  return null;
}

function monthNumber(month: string) {
  const months: Record<string, number> = {
    jan: 0,
    feb: 1,
    mar: 2,
    apr: 3,
    may: 4,
    jun: 5,
    jul: 6,
    aug: 7,
    sep: 8,
    oct: 9,
    nov: 10,
    dec: 11,
  };

  return months[month.slice(0, 3).toLowerCase()];
}

function parseDateRange(text: string, year: number) {
  const compactText = text.replace(/\s+/g, " ");
  const match = compactText.match(
    /\b(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\s+(\d{1,2})\s*[—-]\s*(?:(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\s+)?(\d{1,2})\b/i
  );

  if (!match) return {};

  const startMonth = monthNumber(match[1]);
  const endMonth = monthNumber(match[3] ?? match[1]);

  if (startMonth == null || endMonth == null) return {};

  return {
    start_date: new Date(Date.UTC(year, startMonth, Number(match[2]))),
    end_date: new Date(Date.UTC(year, endMonth, Number(match[4]))),
  };
}

async function fetchVlrEvents() {
  const response = await axios.get(EVENTS_URL, {
    headers: {
      "User-Agent": "valorant-elo-dashboard-etl/1.0",
    },
  });

  const $ = load(response.data);
  const events = new Map<number, VlrEvent>();

  $('a[href^="/event/"]').each((_, element) => {
    const href = $(element).attr("href") ?? "";
    const idMatch = href.match(/^\/event\/(\d+)\//);
    if (!idMatch) return;

    const id = Number(idMatch[1]);
    const rawText = $(element).text().replace(/\s+/g, " ").trim();
    const status = parseStatus(rawText);
    if (!status) return;

    const name = rawText
      .replace(/\b(?:completed|ongoing|upcoming)\s+Status\b.*$/i, "")
      .trim();

    if (!name || !isVctEvent(name)) return;

    const year = inferYear(name);

    events.set(id, {
      id,
      name,
      region: inferRegion(name),
      status,
      ...parseDateRange(rawText, year),
    });
  });

  return Array.from(events.values()).sort((a, b) => a.id - b.id);
}

function mergeTournaments(vlrEvents: VlrEvent[]) {
  const merged = new Map<string, TournamentRecord>(Object.entries(tournaments));
  const existingNameById = new Map<number, string>();

  for (const [name, tournament] of Object.entries(tournaments)) {
    existingNameById.set(tournament.id, name);
  }

  const added: VlrEvent[] = [];
  const updated: Array<{ name: string; before: TournamentRecord; after: TournamentRecord }> = [];
  const deferredCompleted: VlrEvent[] = [];

  for (const event of vlrEvents) {
    const existingName = existingNameById.get(event.id) ?? event.name;
    const before = merged.get(existingName);
    const shouldDeferCompletedTransition =
      DEFER_COMPLETED_TRANSITIONS &&
      before?.status === "ongoing" &&
      event.status === "completed";

    if (shouldDeferCompletedTransition) {
      deferredCompleted.push(event);
    }

    const after: TournamentRecord = {
      id: event.id,
      region: before?.region ?? event.region,
      status: shouldDeferCompletedTransition ? before.status : event.status,
      start_date: before ? before.start_date : event.start_date,
      end_date: before ? before.end_date : event.end_date,
    };

    if (!before) {
      merged.set(event.name, after);
      added.push(event);
      continue;
    }

    if (hasTournamentChanged(before, after)) {
      merged.set(existingName, after);
      updated.push({ name: existingName, before, after });
    }
  }

  return { merged, added, updated, deferredCompleted };
}

function hasTournamentChanged(before: TournamentRecord, after: TournamentRecord) {
  return (
    before.id !== after.id ||
    before.region !== after.region ||
    before.status !== after.status ||
    before.start_date?.toISOString() !== after.start_date?.toISOString() ||
    before.end_date?.toISOString() !== after.end_date?.toISOString()
  );
}

function quote(value: string) {
  return JSON.stringify(value);
}

function formatDate(date: Date | undefined) {
  if (!date) return undefined;
  return `new Date("${date.toISOString().slice(0, 10)}")`;
}

function formatTournament(name: string, tournament: TournamentRecord) {
  const parts = [
    `id: ${tournament.id}`,
    `region: ${quote(tournament.region)}`,
    `status: ${quote(tournament.status)}`,
  ];

  const startDate = formatDate(tournament.start_date);
  const endDate = formatDate(tournament.end_date);

  if (startDate) parts.push(`start_date: ${startDate}`);
  if (endDate) parts.push(`end_date: ${endDate}`);

  return `    ${quote(name)}: { ${parts.join(", ")} },`;
}

function renderTournamentsFile(merged: Map<string, TournamentRecord>) {
  const source = readFileSync(TOURNAMENTS_PATH, "utf8");
  const objectStart = source.indexOf("export const tournaments:");
  const objectEnd = source.indexOf("export const UPCOMING_TOURNAMENT_NAME");

  if (objectStart === -1 || objectEnd === -1) {
    throw new Error("Could not find tournaments export block in tournaments.ts");
  }

  const entries = Array.from(merged.entries()).sort(([, a], [, b]) => a.id - b.id);
  const lines = [
    "export const tournaments: Record<string, { id: number; region: string; status: TournamentStatus; start_date?: Date; end_date?: Date }> = {",
    "",
  ];

  let currentYear: number | null = null;
  for (const [name, tournament] of entries) {
    const year = getTournamentYear(name, tournament);
    if (currentYear !== year) {
      if (currentYear !== null) lines.push("");
      lines.push(`    // VCT ${year}`);
      currentYear = year;
    }
    lines.push(formatTournament(name, tournament));
  }

  lines.push("  };", "");

  return `${source.slice(0, objectStart)}${lines.join("\n")}\n${source.slice(objectEnd)}`;
}

async function main() {
  console.log(`Fetching VLR events from ${EVENTS_URL}`);
  if (DEFER_COMPLETED_TRANSITIONS) {
    console.log("Deferring ongoing -> completed status transitions for this sync run.");
  }
  const vlrEvents = await fetchVlrEvents();
  console.log(`Found ${vlrEvents.length} VCT events on VLR events page`);

  const { merged, added, updated, deferredCompleted } = mergeTournaments(vlrEvents);

  for (const event of added) {
    console.log(`ADD ${event.name} (${event.id}) status=${event.status} region=${event.region}`);
  }

  for (const change of updated) {
    console.log(
      `UPDATE ${change.name} (${change.after.id}) ` +
        `status=${change.before.status}->${change.after.status}`
    );
  }

  for (const event of deferredCompleted) {
    console.log(`DEFER ${event.name} (${event.id}) status=ongoing->completed`);
  }

  if (added.length === 0 && updated.length === 0) {
    console.log("Tournament constants are already in sync with VLR.");
    return;
  }

  if (DRY_RUN) {
    console.log("Dry run enabled; tournaments.ts was not updated.");
    return;
  }

  writeFileSync(TOURNAMENTS_PATH, renderTournamentsFile(merged));
  console.log(`Updated ${TOURNAMENTS_PATH}`);
}

main().catch((error) => {
  console.error("Failed to sync VLR tournaments:", error);
  process.exit(1);
});
