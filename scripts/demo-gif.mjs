// SPDX-License-Identifier: GPL-3.0-or-later
/**
 * Render docs/screenshots/demo.gif — the real CLI report, revealed inside a
 * terminal window.
 *
 * Self-contained: runs `bin/doctor.js`, renders the output in a styled
 * terminal with Playwright's cached Chromium, captures one frame per step, and
 * assembles the GIF with ffmpeg. No VHS/ttyd needed.
 *
 * Usage:
 *   node scripts/demo-gif.mjs                 # writes docs/screenshots/demo.gif
 *   node scripts/demo-gif.mjs out.gif        # custom output
 *   CHROME_PATH=/path/to/chrome ...          # override the browser
 */
import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright-core";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const OUT = process.argv[2] || join(ROOT, "docs", "screenshots", "demo.gif");
const WIDTH = 1100;
const HEIGHT = 720;
const FPS = 12;
const VISIBLE = 28;

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

function captureReport() {
  const dir = mkdtempSync(join(tmpdir(), "ld-demo-"));
  const history = join(dir, "history.json");
  const env = { ...process.env, LINUX_DOCTOR_HISTORY: history };
  const args = [join(ROOT, "bin", "doctor.js"), "--severity", "medium"];
  const runOnce = () => {
    const r = spawnSync(process.execPath, args, { cwd: ROOT, env, encoding: "utf8", timeout: 180000 });
    if (r.error) throw r.error;
    if (!r.stdout) throw new Error(`doctor produced no output (exit ${r.status})`);
    return r.stdout;
  };
  runOnce();
  const out = runOnce();
  rmSync(dir, { recursive: true, force: true });
  return out.replace(/\n$/, "").split("\n");
}

const esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

function lineHtml(l) {
  if (/^🩺/.test(l)) return `<span class="t">${esc(l)}</span>`;
  if (/^=+$/.test(l)) return `<span class="dim">${esc(l)}</span>`;
  if (/^▶ START HERE/.test(l)) return `<span class="start">${esc(l)}</span>`;
  if (/^🔴/.test(l)) return `<span class="high">${esc(l)}</span>`;
  if (/^🟡/.test(l)) return `<span class="med">${esc(l)}</span>`;
  if (/^\d+\. \[/.test(l)) return `<span class="finding">${esc(l)}</span>`;
  if (/^\s+Evidence:/.test(l)) return `<span class="lab">${esc(l)}</span>`;
  if (/^\s+\$ /.test(l)) return `<span class="ev">${esc(l)}</span>`;
  if (/^\s+How to fix:/.test(l)) return `<span class="fix">${esc(l)}</span>`;
  if (/^─+$/.test(l)) return `<span class="dim">${esc(l)}</span>`;
  if (/^(STATUS)/.test(l))
    return esc(l)
      .replace(/(\d+) high/, '<span class="high">$1 high</span>')
      .replace(/(\d+) medium/, '<span class="med">$1 medium</span>')
      .replace(/(\d+) info/, '<span class="dim">$1 info</span>');
  if (/^(System|Note):|^SCORE|^TREND|^SINCE LAST RUN|^Ran |^⚠|^Found |^✓/.test(l)) return `<span class="dim">${esc(l)}</span>`;
  if (/^Linux Doctor only|^Report bugs/.test(l)) return `<span class="dim">${esc(l)}</span>`;
  return esc(l);
}

const CMD = "linux-doctor";
const OUTPUT = captureReport();
const TYPE = CMD.length;
const PAUSE = 3;
const STEP = 2;
const HOLD = 14;
const OUT_FRAMES = Math.ceil(OUTPUT.length / STEP);
const TOTAL = TYPE + PAUSE + OUT_FRAMES + HOLD;

const html = `<!doctype html><html><head><meta charset="utf-8"><style>
  :root{--term:#282a36;--bar:#21222c;--fg:#f8f8f2;--dim:#6272a4;--green:#50fa7b;--red:#ff5555;--yellow:#f1fa8c;--cyan:#8be9fd;--purple:#bd93f9}
  *{box-sizing:border-box} html,body{margin:0;padding:0;background:transparent}
  #card{width:${WIDTH}px;height:${HEIGHT}px;background:var(--term);border-radius:14px;overflow:hidden;display:flex;flex-direction:column;
        font-family:"Noto Sans Mono","Liberation Mono","DejaVu Sans Mono",monospace}
  #bar{height:40px;flex:0 0 40px;background:var(--bar);display:flex;align-items:center;gap:9px;padding:0 18px}
  .dot{width:12px;height:12px;border-radius:50%} .r{background:#ff5555}.y{background:#f1fa8c}.g{background:#50fa7b}
  .ttl{margin-left:12px;color:var(--dim);font-size:14px}
  #term{flex:1;padding:16px 20px;color:var(--fg);font-size:15px;line-height:1.45;white-space:pre-wrap;word-break:break-word;overflow:hidden}
  .t{color:var(--fg);font-weight:700}.dim{color:var(--dim)}.start{color:var(--green);font-weight:700}
  .high{color:var(--red);font-weight:700}.med{color:var(--yellow);font-weight:700}
  .finding{color:var(--cyan);font-weight:700}.lab{color:var(--purple);font-weight:700}
  .ev{color:var(--dim)}.fix{color:var(--green)}.status{color:var(--fg);font-weight:700}
  .p{color:var(--green);font-weight:700}.path{color:var(--cyan)}.cmd{color:var(--fg)}
  .cur{color:var(--green)}
</style></head><body>
<div id="card"><div id="bar"><span class="dot r"></span><span class="dot y"></span><span class="dot g"></span><span class="ttl">linux-doctor — bash</span></div><pre id="term"></pre></div>
<script>
const CMD=${JSON.stringify(CMD)}, OUTPUT=${JSON.stringify(OUTPUT)}, VISIBLE=${VISIBLE}, TYPE=${TYPE}, PAUSE=${PAUSE}, STEP=${STEP};
const esc=${esc.toString()};
const LINE_FN=${lineHtml.toString()};
function prompt(typed, cursor){return '<span class="p">➜</span> <span class="path">~</span> <span class="cmd">'+typed+'</span>'+(cursor?'<span class="cur">█</span>':'');}
window.renderFrame=function(i){
  const term=document.getElementById('term'); let out;
  if(i<TYPE){ out=prompt(CMD.slice(0,i+1), i%2===0); }
  else if(i<TYPE+PAUSE){ out=prompt(CMD, i%2===0); }
  else {
    const shown=Math.min(OUTPUT.length, (i-(TYPE+PAUSE)+1)*STEP);
    const tail=OUTPUT.slice(0,shown).slice(-VISIBLE);
    out=prompt(CMD,false)+'\\n'+tail.map(LINE_FN).join('\\n');
  }
  term.innerHTML=out;
};
window.renderFrame(0);
</script></body></html>`;

const exe = findChromium();
const framesDir = mkdtempSync(join(tmpdir(), "ld-demo-frames-"));
const browser = await chromium.launch({ executablePath: exe, headless: true, args: ["--no-sandbox"] });
try {
  const context = await browser.newContext({ viewport: { width: WIDTH, height: HEIGHT }, deviceScaleFactor: 2 });
  const page = await context.newPage();
  await page.setContent(html, { waitUntil: "load" });
  const card = page.locator("#card");
  for (let i = 0; i < TOTAL; i++) {
    await page.evaluate((n) => window.renderFrame(n), i);
    await card.screenshot({ path: join(framesDir, `${String(i).padStart(4, "0")}.png`) });
  }
} finally {
  await browser.close();
}

console.log(`Captured ${TOTAL} frames (~${(TOTAL / FPS).toFixed(1)}s) — encoding GIF…`);
const vf = `fps=${FPS},scale=950:-1:flags=lanczos,split[s0][s1];[s0]palettegen=max_colors=96[p];[s1][p]paletteuse=dither=bayer:bayer_scale=5`;
const res = spawnSync("ffmpeg", ["-y", "-loglevel", "error", "-framerate", String(FPS), "-i", join(framesDir, "%04d.png"), "-vf", vf, "-loop", "0", OUT], { stdio: "inherit" });
rmSync(framesDir, { recursive: true, force: true });
if (res.status !== 0) throw new Error("ffmpeg failed");
console.log(`Wrote ${OUT}`);
