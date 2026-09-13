/**
 * Pins scripts/verify-updater-signature.mjs against a synthetic minisign key
 * pair. This is the check that proves a released artifact matches the pubkey
 * embedded in the app; a regression here would silently break auto-update.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { generateKeyPairSync, sign, createHash, randomBytes } from "node:crypto";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const SCRIPT = join(ROOT, "scripts", "verify-updater-signature.mjs");

function makeSignedArtifact(dir, data, algo = "ED") {
  const { publicKey, privateKey } = generateKeyPairSync("ed25519");
  const rawPub = publicKey.export({ format: "der", type: "spki" }).subarray(-32);
  const keyId = randomBytes(8);
  const pubStruct = Buffer.concat([Buffer.from(algo, "ascii"), keyId, rawPub]);
  const pubKeyB64 = Buffer.from(`untrusted comment: minisign public key: TEST\n${pubStruct.toString("base64")}\n`).toString("base64");

  const payload = algo === "ED" ? createHash("blake2b512").update(data).digest() : data;
  const sig = sign(null, payload, privateKey);
  const trustedComment = "timestamp:1\tfile:test";
  const globalSig = sign(null, Buffer.concat([sig, Buffer.from(trustedComment, "utf8")]), privateKey);
  const sigStruct = Buffer.concat([Buffer.from(algo, "ascii"), keyId, sig]);
  const sigText = `untrusted comment: signature from tauri secret key\n${sigStruct.toString("base64")}\ntrusted comment: ${trustedComment}\n${globalSig.toString("base64")}\n`;
  const sigFile = Buffer.from(sigText).toString("base64");

  writeFileSync(join(dir, "data"), data);
  writeFileSync(join(dir, "data.sig"), sigFile);
  writeFileSync(join(dir, "latest.json"), JSON.stringify({ version: "1.2.3", platforms: { "linux-x86_64": { signature: sigFile, url: "https://example/x" } } }));
  return pubKeyB64;
}

test("verify-updater-signature: accepts a valid prehashed signature and matching manifest", () => {
  const dir = mkdtempSync(join(tmpdir(), "ld-sig-"));
  try {
    const pub = makeSignedArtifact(dir, Buffer.from("art" + randomBytes(4096).toString("hex")));
    const out = execFileSync("node", [SCRIPT, pub, join(dir, "data.sig"), join(dir, "data"), join(dir, "latest.json")], { encoding: "utf8" });
    assert.match(out, /signature OK/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("verify-updater-signature: accepts a raw (non-prehashed) signature", () => {
  const dir = mkdtempSync(join(tmpdir(), "ld-sig-"));
  try {
    const pub = makeSignedArtifact(dir, Buffer.from("raw payload"), "Ed");
    execFileSync("node", [SCRIPT, pub, join(dir, "data.sig"), join(dir, "data")], { encoding: "utf8" });
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("verify-updater-signature: rejects tampered data and mismatched manifests", () => {
  const dir = mkdtempSync(join(tmpdir(), "ld-sig-"));
  try {
    const pub = makeSignedArtifact(dir, Buffer.from("original"));
    writeFileSync(join(dir, "data"), "tampered"); // signature no longer matches
    assert.throws(() => execFileSync("node", [SCRIPT, pub, join(dir, "data.sig"), join(dir, "data")], { stdio: "pipe" }));

    const pub2 = makeSignedArtifact(dir, Buffer.from("payload"));
    const manifest = JSON.parse(readFileSync(join(dir, "latest.json"), "utf8"));
    manifest.platforms["linux-x86_64"].signature = "AAAA"; // no longer matches the .sig file
    writeFileSync(join(dir, "bad.json"), JSON.stringify(manifest));
    assert.throws(() => execFileSync("node", [SCRIPT, pub2, join(dir, "data.sig"), join(dir, "data"), join(dir, "bad.json")], { stdio: "pipe" }));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
