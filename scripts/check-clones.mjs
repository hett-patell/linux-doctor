#!/usr/bin/env node
// SPDX-License-Identifier: GPL-3.0-or-later
/**
 * Scan for clones or impersonations of Linux Doctor.
 *
 *   node scripts/check-clones.mjs
 *
 * Checks GitHub (repositories with a look-alike name + code search for
 * distinctive strings from this project), npm, the AUR and Fedora COPR.
 * Read-only; needs `gh` (authenticated) and network access. It always exits
 * 0 — this is a report, not a gate.
 */
import { spawnSync } from "node:child_process";

const ME = "zShaD0w7x";
const MY_NAMES = ["zShaD0w7x", "7sh1d0w7x"]; // GitHub handle, npm handle
const REPO = `${ME}/linux-doctor`;
const RULES = /linux[-_ ]?doctor/i;
const hits = [];

function sh(cmd, args) {
  const r = spawnSync(cmd, args, { encoding: "utf8", timeout: 60000 });
  return r.status === 0 ? r.stdout : null;
}
function ghJson(args) {
  const out = sh("gh", args);
  if (!out) return null;
  try {
    return JSON.parse(out);
  } catch {
    return null;
  }
}
async function getJson(url) {
  try {
    const res = await fetch(url, { headers: { "User-Agent": "linux-doctor-clone-check" } });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

// 1. GitHub repositories with a look-alike name.
for (const r of ghJson(["search", "repos", "linux-doctor", "--limit", "30", "--json", "fullName,description"]) ?? []) {
  if (r.fullName !== REPO && RULES.test(r.fullName)) {
    hits.push(`GitHub repo: ${r.fullName} — ${r.description ?? "(no description)"}`);
  }
}

// 2. GitHub code search for distinctive strings from this project.
for (const q of ['"Linux Doctor only reads system information"', '"MOST URGENT · RECOMMENDED"', '"timers/broken" "zram/ok"']) {
  for (const c of ghJson(["search", "code", q, "--limit", "10", "--json", "repository,path"]) ?? []) {
    const name = c.repository?.nameWithOwner ?? c.repository?.name;
    if (name && name !== REPO) hits.push(`GitHub code ${q}: ${name}/${c.path}`);
  }
}

// 3. npm — who owns the package name.
const npmOut = sh("npm", ["view", "linux-doctor", "maintainers", "repository.url", "--json"]);
if (npmOut) {
  try {
    const owners = JSON.stringify(JSON.parse(npmOut));
    if (!MY_NAMES.some((n) => owners.includes(n))) hits.push(`npm: linux-doctor is owned by ${owners}, not us`);
  } catch {
    /* ignore */
  }
}

// 4. AUR (best effort).
const aur = await getJson("https://aur.archlinux.org/rpc/?v=5&type=search&arg=linux-doctor");
for (const p of aur?.results ?? []) {
  if (RULES.test(p.Name) && p.Maintainer && !MY_NAMES.includes(p.Maintainer)) hits.push(`AUR: ${p.Name} (maintainer ${p.Maintainer})`);
}

// 5. Fedora COPR (best effort).
const copr = await getJson("https://copr.fedorainfracloud.org/api_3/project/search?query=linux-doctor");
for (const p of copr?.items ?? []) {
  const owner = p.owner_name ?? p.ownername;
  if (RULES.test(p.name) && owner && !MY_NAMES.includes(owner)) hits.push(`COPR: ${owner}/${p.name}`);
}

if (!hits.length) {
  console.log("No look-alike projects or copied strings found.");
} else {
  console.log(`Possible look-alikes (${hits.length}):`);
  for (const h of hits) console.log("  - " + h);
  console.log("\nA similar name is normal; copied code or impersonation is not.");
}
