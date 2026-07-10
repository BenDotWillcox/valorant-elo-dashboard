import assert from "node:assert/strict";
import { spawn } from "node:child_process";

import axe from "axe-core";
import puppeteer, { type Page } from "puppeteer";

const port = Number(process.env.A11Y_PORT ?? 3100);
const suppliedBaseUrl = process.env.A11Y_BASE_URL;
const baseUrl = suppliedBaseUrl ?? `http://127.0.0.1:${port}`;
const serverOutput: string[] = [];

type AxeViolation = {
  id: string;
  impact: string | null;
  help: string;
  nodes: Array<{ target: string[]; failureSummary?: string }>;
};

function startProductionServer() {
  if (suppliedBaseUrl) return null;

  const child = spawn(
    process.execPath,
    [
      "node_modules/next/dist/bin/next",
      "start",
      "-H",
      "127.0.0.1",
      "-p",
      String(port),
    ],
    {
      cwd: process.cwd(),
      env: { ...process.env, PORT: String(port) },
      stdio: ["ignore", "pipe", "pipe"],
    }
  );

  const capture = (chunk: Buffer) => {
    serverOutput.push(chunk.toString());
    if (serverOutput.length > 40) serverOutput.shift();
  };

  child.stdout.on("data", capture);
  child.stderr.on("data", capture);

  return child;
}

async function waitForServer(server: ReturnType<typeof startProductionServer>) {
  const deadline = Date.now() + 45_000;

  while (Date.now() < deadline) {
    if (server?.exitCode != null) {
      throw new Error(
        `Next.js exited before the smoke test started.\n${serverOutput.join("")}`
      );
    }

    try {
      const response = await fetch(baseUrl, { redirect: "manual" });
      if (response.status < 500) return;
    } catch {
      // The server is still starting.
    }

    await new Promise((resolve) => setTimeout(resolve, 400));
  }

  throw new Error(`Timed out waiting for ${baseUrl}.\n${serverOutput.join("")}`);
}

async function installHermeticApiFixtures(page: Page) {
  await page.setRequestInterception(true);
  page.on("request", (request) => {
    const url = new URL(request.url());
    if (url.pathname === "/api/current-elo") {
      void request.respond({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify([
          { teamId: 1, teamName: "Alpha", teamSlug: "alpha", rating: "1020", mapName: "Ascent" },
          { teamId: 1, teamName: "Alpha", teamSlug: "alpha", rating: "1010", mapName: "Bind" },
          { teamId: 2, teamName: "Beta", teamSlug: "beta", rating: "980", mapName: "Ascent" },
          { teamId: 2, teamName: "Beta", teamSlug: "beta", rating: "990", mapName: "Bind" },
        ]),
      });
      return;
    }
    void request.continue();
  });
}

async function runAxe(page: Page, pathname: string) {
  await page.goto(`${baseUrl}${pathname}`, {
    waitUntil: "networkidle0",
    timeout: 45_000,
  });
  await page.addScriptTag({ content: axe.source });

  const violations = await page.evaluate(async () => {
    const result = await (globalThis as typeof globalThis & {
      axe: { run: (root: Document, options: object) => Promise<{ violations: AxeViolation[] }> };
    }).axe.run(document, {
      runOnly: {
        type: "tag",
        values: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"],
      },
    });

    return result.violations;
  });

  if (violations.length > 0) {
    const summary = violations
      .map((violation) => {
        const visibleNodes = violation.nodes.slice(0, 5);
        const omittedNodeCount = violation.nodes.length - visibleNodes.length;
        const nodeSummary = visibleNodes
          .map((node) => `  ${node.target.join(" ")}: ${node.failureSummary ?? ""}`)
          .join("\n");
        const omittedSummary =
          omittedNodeCount > 0
            ? `\n  ... ${omittedNodeCount} additional affected node${
                omittedNodeCount === 1 ? "" : "s"
              } omitted`
            : "";

        return `${violation.id} (${violation.impact ?? "unknown"}): ${
          violation.help
        }\n${nodeSummary}${omittedSummary}`;
      })
      .join("\n\n");
    throw new Error(`axe found violations on ${pathname}:\n${summary}`);
  }
}

async function assertLandingSemantics(page: Page) {
  const videoRequests: string[] = [];
  page.on("request", (request) => {
    if (/\.mp4(?:$|\?)/i.test(request.url())) videoRequests.push(request.url());
  });

  await page.emulateMediaFeatures([
    { name: "prefers-reduced-motion", value: "reduce" },
  ]);
  await page.goto(baseUrl, { waitUntil: "networkidle0", timeout: 45_000 });

  const structure = await page.evaluate(() => ({
    mainCount: document.querySelectorAll("main").length,
    nestedInteractiveCount: document.querySelectorAll("a button, button a").length,
    videos: Array.from(document.querySelectorAll("video")).map((video) => ({
      dataPoster: video.dataset.poster ?? "",
      poster: video.poster,
      preload: video.preload,
      src: video.currentSrc || video.getAttribute("src") || "",
    })),
  }));

  assert.equal(structure.mainCount, 1, "The landing page must expose exactly one main landmark.");
  assert.equal(structure.nestedInteractiveCount, 0, "CTAs must not nest links and buttons.");
  assert.equal(structure.videos.length, 10, "Every feature should retain its video preview.");
  assert.ok(
    structure.videos.every((video) => video.dataPoster),
    "Every video needs a deferred poster contract."
  );
  assert.ok(
    structure.videos.filter((video) => video.poster).length < 10,
    "Offscreen posters must not all load eagerly."
  );
  assert.ok(
    structure.videos.every((video) => video.preload === "metadata"),
    'Every video must use preload="metadata".'
  );
  assert.ok(
    structure.videos.every((video) => video.src === ""),
    "Reduced-motion mode must not attach video sources."
  );
  assert.equal(videoRequests.length, 0, "Reduced-motion mode must not request MP4 assets.");

  await page.evaluate(() => {
    document.querySelector("video")?.scrollIntoView({ block: "center" });
  });
  await page.waitForFunction(() => Boolean(document.querySelector("video")?.poster), {
    timeout: 10_000,
  });

  let focusedMathCta = false;
  for (let index = 0; index < 40; index += 1) {
    await page.keyboard.press("Tab");
    focusedMathCta = await page.evaluate(
      () => document.activeElement?.matches('a[href="/math-blog"]') ?? false
    );
    if (focusedMathCta) break;
  }

  assert.ok(focusedMathCta, "The Math CTA must be reachable using the Tab key.");
  await page.keyboard.press("Enter");
  await page.waitForFunction(() => window.location.pathname === "/math-blog", {
    timeout: 10_000,
  });
}

async function assertPredictionControlNames(page: Page) {
  await page.goto(`${baseUrl}/predictions`, {
    waitUntil: "networkidle0",
    timeout: 45_000,
  });

  const names = await page.$$eval('[role="combobox"]', (elements) =>
    elements.map((element) => element.getAttribute("aria-label")?.trim()).filter(Boolean)
  );

  assert.ok(names.includes("Team 1"), 'The first team combobox needs the accessible name "Team 1".');
  assert.ok(names.includes("Team 2"), 'The second team combobox needs the accessible name "Team 2".');
  assert.ok(names.includes("Match Type"), 'The match-type combobox needs the accessible name "Match Type".');
  assert.ok(names.some((name) => /^Map 1$/.test(name!)), 'The first map combobox needs the accessible name "Map 1".');
}

async function assertViewportVideoLoading(page: Page) {
  const videoRequests: string[] = [];
  page.on("request", (request) => {
    if (/\.mp4(?:$|\?)/i.test(request.url())) videoRequests.push(request.url());
  });

  await page.goto(baseUrl, { waitUntil: "networkidle0", timeout: 45_000 });
  const initialAttached = await page.$$eval(
    "video",
    (videos) => videos.filter((video) => Boolean(video.currentSrc)).length
  );
  const initialPosters = await page.$$eval(
    "video",
    (videos) => videos.filter((video) => Boolean(video.poster)).length
  );

  assert.ok(
    initialAttached < 10,
    `Offscreen previews must remain detached; found ${initialAttached} eager video sources.`
  );
  assert.ok(
    videoRequests.length < 10,
    `Initial navigation must not request every MP4; observed ${videoRequests.length} requests.`
  );
  assert.ok(
    initialPosters < 10,
    `Initial navigation must not attach every poster; found ${initialPosters}.`
  );

  await page.evaluate(() => {
    document.querySelector("video")?.scrollIntoView({ block: "center" });
  });
  await page.waitForFunction(
    () => {
      const video = document.querySelector("video");
      return Boolean(video?.currentSrc && video.poster);
    },
    { timeout: 10_000 }
  );

  const visibleAttached = await page.$$eval(
    "video",
    (videos) => videos.filter((video) => Boolean(video.currentSrc)).length
  );
  assert.ok(visibleAttached >= 1, "A preview must attach when it enters the viewport.");
  assert.ok(visibleAttached < 10, "Viewport loading must not attach every preview at once.");

  await page.evaluate(() => window.scrollTo({ top: document.body.scrollHeight, behavior: "auto" }));
  await page.waitForFunction(() => document.querySelector("video")?.paused === true, {
    timeout: 10_000,
  });
}

async function main() {
  const server = startProductionServer();
  let browser: Awaited<ReturnType<typeof puppeteer.launch>> | null = null;

  try {
    await waitForServer(server);
    browser = await puppeteer.launch({
      headless: true,
      args: ["--no-sandbox", "--disable-setuid-sandbox"],
    });

    const page = await browser.newPage();
    await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 1 });
    await installHermeticApiFixtures(page);

    await assertLandingSemantics(page);
    await page.emulateMediaFeatures([
      { name: "prefers-reduced-motion", value: "no-preference" },
    ]);
    await assertViewportVideoLoading(page);
    await assertPredictionControlNames(page);

    for (const pathname of [
      "/",
      "/predictions",
      "/math-blog",
      "/methodology",
      "/player-ratings",
    ]) {
      await runAxe(page, pathname);
      const mainCount = await page.$$eval("main", (elements) => elements.length);
      assert.equal(mainCount, 1, `${pathname} must expose exactly one main landmark.`);
    }

    console.log(
      "Accessibility smoke checks passed for /, /predictions, /math-blog, /methodology, and /player-ratings."
    );
  } finally {
    await browser?.close();
    server?.kill("SIGTERM");
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack ?? error.message : error);
  process.exit(1);
});
