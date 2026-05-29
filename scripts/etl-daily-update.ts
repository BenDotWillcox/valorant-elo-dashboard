import { spawn } from "node:child_process";
import { createWriteStream, mkdirSync } from "node:fs";
import { join } from "node:path";
import { performance } from "node:perf_hooks";
import { config } from "dotenv";

config({ path: ".env.local" });

type EtlStep = {
  name: string;
  command: string;
  args: string[];
  required?: boolean;
  skip?: boolean;
  skipReason?: string;
};

type StepResult = {
  name: string;
  status: "success" | "failed" | "skipped";
  durationMs: number;
  exitCode?: number | null;
  error?: string;
};

type EmailConfig = {
  apiKey: string;
  from: string;
  to: string[];
  notifyOnSuccess: boolean;
};

const repoRoot = process.cwd();
const runStartedAt = new Date();
const runId = runStartedAt.toISOString().replace(/[:.]/g, "-");
const logDir = join(repoRoot, "logs", "etl");
const logPath = join(logDir, `${runId}.log`);

const includeInteractiveSteps = process.argv.includes("--include-interactive");
const dryRun = process.argv.includes("--dry-run");
const forceEmail = process.argv.includes("--email");
const npmCommand = process.platform === "win32" ? "npm.cmd" : "npm";
const logBuffer: string[] = [];

const steps: EtlStep[] = [
  {
    name: "sync-vlr-tournaments",
    command: npmCommand,
    args: ["run", "sync:vlr-tournaments", "--", "--defer-completed-transitions"],
    required: true,
  },
  {
    name: "scrape-new-maps",
    command: npmCommand,
    args: ["run", "scrape:new"],
    required: true,
  },
  {
    name: "finalize-vlr-tournament-statuses",
    command: npmCommand,
    args: ["run", "sync:vlr-tournaments"],
    required: true,
  },
  {
    name: "process-elo",
    command: npmCommand,
    args: ["run", "process:elo"],
    required: true,
  },
  {
    name: "auto-fix-null-vetoes",
    command: npmCommand,
    args: ["run", "fix:null-vetoes:auto"],
    required: false,
  },
  {
    name: "fix-null-vetoes-interactive",
    command: npmCommand,
    args: ["run", "fix:null-vetoes"],
    required: false,
    skip: !includeInteractiveSteps,
    skipReason: "Skipped because interactive veto repair is disabled for normal unattended ETL runs.",
  },
  {
    name: "validate-null-vetoes",
    command: npmCommand,
    args: ["run", "validate:null-vetoes"],
    required: true,
  },
  {
    name: "process-pick-ban-analysis",
    command: npmCommand,
    args: ["run", "process:pick-ban-analysis"],
    required: true,
  },
  {
    name: "populate-tournament-winners",
    command: npmCommand,
    args: ["run", "populate:tournament-winners"],
    required: false,
  },
  {
    name: "process-vpm",
    command: npmCommand,
    args: ["run", "process:vpm"],
    required: true,
  },
];

function log(message: string) {
  const line = `[${new Date().toISOString()}] ${message}`;
  console.log(line);
  logStream.write(`${line}\n`);
  logBuffer.push(line);
}

function formatDuration(ms: number) {
  const seconds = Math.round(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  return minutes > 0 ? `${minutes}m ${remainingSeconds}s` : `${remainingSeconds}s`;
}

function runStep(step: EtlStep): Promise<StepResult> {
  if (step.skip) {
    const startedAt = performance.now();
    log(`SKIP ${step.name}: ${step.skipReason ?? "No reason provided."}`);
    return Promise.resolve({
      name: step.name,
      status: "skipped",
      durationMs: performance.now() - startedAt,
    });
  }

  if (dryRun) {
    const startedAt = performance.now();
    log(`DRY RUN ${step.name}: ${step.command} ${step.args.join(" ")}`);
    return Promise.resolve({
      name: step.name,
      status: "success",
      durationMs: performance.now() - startedAt,
      exitCode: 0,
    });
  }

  return new Promise((resolve) => {
    const startedAt = performance.now();
    log(`START ${step.name}: ${step.command} ${step.args.join(" ")}`);

    const child = spawn(step.command, step.args, {
      cwd: repoRoot,
      env: process.env,
      shell: process.platform === "win32",
      stdio: ["ignore", "pipe", "pipe"],
    });

    child.stdout.on("data", (chunk: Buffer) => {
      const text = chunk.toString();
      process.stdout.write(text);
      logStream.write(text);
    });

    child.stderr.on("data", (chunk: Buffer) => {
      const text = chunk.toString();
      process.stderr.write(text);
      logStream.write(text);
    });

    child.on("error", (error) => {
      const durationMs = performance.now() - startedAt;
      log(`FAIL ${step.name}: ${error.message}`);
      resolve({
        name: step.name,
        status: "failed",
        durationMs,
        error: error.message,
      });
    });

    child.on("close", (exitCode) => {
      const durationMs = performance.now() - startedAt;
      if (exitCode === 0) {
        log(`DONE ${step.name} in ${formatDuration(durationMs)}`);
        resolve({ name: step.name, status: "success", durationMs, exitCode });
        return;
      }

      log(`FAIL ${step.name} after ${formatDuration(durationMs)} with exit code ${exitCode}`);
      resolve({ name: step.name, status: "failed", durationMs, exitCode });
    });
  });
}

function printSummary(results: StepResult[]) {
  log("");
  log("ETL summary:");
  for (const result of results) {
    const duration = formatDuration(result.durationMs);
    const detail =
      result.status === "failed" && result.exitCode != null
        ? ` exit=${result.exitCode}`
        : result.error
          ? ` error=${result.error}`
          : "";
    log(`- ${result.status.toUpperCase()} ${result.name} (${duration})${detail}`);
  }
  log(`Log file: ${logPath}`);
}

function getEmailConfig(): EmailConfig | null {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.ETL_ALERT_EMAIL_FROM;
  const to = process.env.ETL_ALERT_EMAIL_TO;

  if (!apiKey || !from || !to) return null;

  return {
    apiKey,
    from,
    to: to
      .split(",")
      .map((value) => value.trim())
      .filter(Boolean),
    notifyOnSuccess: process.env.ETL_ALERT_EMAIL_ON_SUCCESS === "true",
  };
}

function buildEmailText(results: StepResult[], failedRequiredStep: boolean) {
  const status = failedRequiredStep ? "FAILED" : "SUCCEEDED";
  const summary = results
    .map((result) => {
      const duration = formatDuration(result.durationMs);
      const detail =
        result.status === "failed" && result.exitCode != null
          ? ` exit=${result.exitCode}`
          : result.error
            ? ` error=${result.error}`
            : "";
      return `- ${result.status.toUpperCase()} ${result.name} (${duration})${detail}`;
    })
    .join("\n");

  const logTail = logBuffer.slice(-250).join("\n");

  return [
    `Valorant ETL ${status}`,
    "",
    `Started: ${runStartedAt.toISOString()}`,
    `Finished: ${new Date().toISOString()}`,
    `Working directory: ${repoRoot}`,
    `Log file: ${logPath}`,
    "",
    "Steps:",
    summary,
    "",
    "Log tail:",
    logTail,
  ].join("\n");
}

async function sendEmailNotification(results: StepResult[], failedRequiredStep: boolean) {
  const config = getEmailConfig();
  const shouldNotify = forceEmail || failedRequiredStep || config?.notifyOnSuccess;

  if (!shouldNotify) return;

  if (!config) {
    log("Email notification skipped: set RESEND_API_KEY, ETL_ALERT_EMAIL_FROM, and ETL_ALERT_EMAIL_TO.");
    return;
  }

  const status = failedRequiredStep ? "FAILED" : "SUCCEEDED";
  const subject = `[valorant-etl] ${status} ${runStartedAt.toISOString().slice(0, 10)}`;
  const text = buildEmailText(results, failedRequiredStep);

  try {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${config.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: config.from,
        to: config.to,
        subject,
        text,
      }),
    });

    if (!response.ok) {
      const body = await response.text();
      log(`Email notification failed: ${response.status} ${body}`);
      if (failedRequiredStep) process.exitCode = 1;
      return;
    }

    log(`Email notification sent to ${config.to.join(", ")}`);
  } catch (error) {
    log(`Email notification failed: ${error instanceof Error ? error.message : String(error)}`);
    if (failedRequiredStep) process.exitCode = 1;
  }
}

mkdirSync(logDir, { recursive: true });
const logStream = createWriteStream(logPath, { flags: "a" });

function closeLogStream() {
  return new Promise<void>((resolve) => {
    logStream.end(resolve);
  });
}

async function main() {
  log(`Daily ETL run started: ${runStartedAt.toISOString()}`);
  log(`Working directory: ${repoRoot}`);
  log(`Interactive steps: ${includeInteractiveSteps ? "enabled" : "disabled"}`);
  log(`Dry run: ${dryRun ? "enabled" : "disabled"}`);
  log(`Force email: ${forceEmail ? "enabled" : "disabled"}`);

  const results: StepResult[] = [];

  for (const step of steps) {
    const result = await runStep(step);
    results.push(result);

    if (result.status === "failed" && step.required !== false) {
      log(`Stopping because required step failed: ${step.name}`);
      break;
    }
  }

  printSummary(results);

  const failedRequiredStep = results.some((result) => {
    const step = steps.find((candidate) => candidate.name === result.name);
    return result.status === "failed" && step?.required !== false;
  });

  await sendEmailNotification(results, failedRequiredStep);

  await closeLogStream();
  process.exit(failedRequiredStep ? 1 : 0);
}

main().catch(async (error) => {
  log(`Unexpected ETL orchestrator failure: ${error instanceof Error ? error.stack ?? error.message : String(error)}`);
  await closeLogStream();
  process.exit(1);
});
