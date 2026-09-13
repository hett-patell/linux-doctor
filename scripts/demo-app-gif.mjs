/**
 * Render docs/screenshots/app.gif — the dashboard UI (what the desktop app
 * shows), recorded from a scripted session.
 *
 * Self-contained: captures a real report via `bin/doctor.js --json`, serves it
 * from an in-process mock server, drives the built dashboard with Playwright's
 * Chromium while recording video, and converts the video to a GIF with ffmpeg.
 *
 * Usage:
 *   node scripts/demo-app-gif.mjs            # writes docs/screenshots/app.gif
 *   node scripts/demo-app-gif.mjs out.gif
 *   CHROME_PATH=/path/to/chrome ...          # override the browser
 */
import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs";
import http from "node:http";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright-core";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const OUT = process.argv[2] || join(ROOT, "docs", "screenshots", "app.gif");
const WIDTH = 1280;
const HEIGHT = 800;
const FPS = 10;

function findChromium() {
  if (process.env.CHROME_PATH) return process.env.CHROME_PATH;
  const base = join(process.env.HOME || "", ".cache", "ms-playwright");
  if (existsSync(base)) {
    const dirs = readdirSync(base).filter((d) => d.startsWith("chromium-")).sort().reverse();
    for (const d of dirs) {
      const p = join(base, d, "chrome-linux64", "chrome");
      if (existsSync(p)) return p;
    }
  }
  throw new Error("no Chromium found — set CHROME_PATH or run `npx playwright install chromium`");
}

function captureData() {
  const dir = mkdtempSync(join(tmpdir(), "ld-app-"));
  const env = { ...process.env, LINUX_DOCTOR_HISTORY: join(dir, "history.json") };
  const cli = (flag) => {
    const r = spawnSync(process.execPath, [join(ROOT, "bin", "doctor.js"), flag], { cwd: ROOT, env, encoding: "utf8", timeout: 180000 });
    if (!r.stdout) throw new Error(`doctor ${flag} produced no output (exit ${r.status})`);
    return r.stdout;
  };
  cli("--summary"); // seed two runs so the dashboard has a trend to draw
  cli("--summary");
  const data = { report: JSON.parse(cli("--json")), history: JSON.parse(cli("--history-json")), checks: JSON.parse(cli("--check-list")) };
  rmSync(dir, { recursive: true, force: true });
  return data;
}

function serve(data) {
  const html = readFileSync(join(ROOT, "src-gui", "index.html"), "utf8");
  const json = (res, obj) => {
    res.writeHead(200, { "Content-Type": "application/json", "Cache-Control": "no-store" });
    res.end(JSON.stringify(obj));
  };
  const server = http.createServer((req, res) => {
    const path = new URL(req.url, "http://127.0.0.1").pathname;
    if (path === "/" || path === "/index.html") {
      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
      res.end(html);
    } else if (path === "/api/report") json(res, data.report);
    else if (path === "/api/history") json(res, data.history);
    else if (path === "/api/checks") json(res, { checks: data.checks });
    else if (path === "/api/schedule") json(res, { schedule: { installed: false, enabled: false, active: false } });
    else {
      res.writeHead(404, { "Content-Type": "application/json" });
      res.end("{}");
    }
  });
  return server;
}

const data = captureData();
const server = serve(data);
await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
const url = `http://127.0.0.1:${server.address().port}/`;

const videoDir = mkdtempSync(join(tmpdir(), "ld-app-video-"));
const browser = await chromium.launch({ executablePath: findChromium(), headless: true, args: ["--no-sandbox"] });
let videoPath;
try {
  const context = await browser.newContext({
    viewport: { width: WIDTH, height: HEIGHT },
    recordVideo: { dir: videoDir, size: { width: WIDTH, height: HEIGHT } },
  });
  const page = await context.newPage();
  await page.goto(url, { waitUntil: "load" });
  await page.waitForFunction(() => {
    const el = document.getElementById("scorenum");
    return el && /\d/.test(el.textContent || "");
  }, { timeout: 30000 });
  await page.waitForTimeout(1400);

  // Open a finding card (inline explanation + fix).
  await page.evaluate(() => {
    const cards = [...document.querySelectorAll("#report details[data-code]")].filter((el) => el.getClientRects().length);
    const card = cards.find((el) => !el.open) || cards[cards.length - 1];
    if (card) {
      card.scrollIntoView({ block: "center" });
      card.querySelector("summary").click();
    }
  });
  await page.waitForTimeout(1600);

  // Cycle the theme to dark (auto -> light -> dark) and show another view.
  await page.click("#theme", { force: true });
  await page.waitForTimeout(300);
  await page.click("#theme", { force: true });
  await page.waitForTimeout(1400);
  await page.click('button.viewtab[data-view="schedule"]', { force: true });
  await page.waitForTimeout(1500);
  await page.click('button.viewtab[data-view="overview"]', { force: true });
  await page.evaluate(() => window.scrollTo({ top: 0, behavior: "smooth" }));
  await page.waitForTimeout(1400);

  await context.close();
  videoPath = await page.video().path();
} finally {
  await browser.close();
  server.close();
}

console.log("Recording done — encoding GIF…");
const vf = `fps=${FPS},scale=900:-1:flags=lanczos,split[s0][s1];[s0]palettegen=max_colors=96[p];[s1][p]paletteuse=dither=bayer:bayer_scale=5`;
const res = spawnSync("ffmpeg", ["-y", "-loglevel", "error", "-ss", "0.4", "-i", videoPath, "-vf", vf, "-loop", "0", OUT], { stdio: "inherit" });
rmSync(videoDir, { recursive: true, force: true });
if (res.status !== 0) throw new Error("ffmpeg failed");
console.log(`Wrote ${OUT}`);
