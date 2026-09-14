// SPDX-License-Identifier: GPL-3.0-or-later
/**
 * Verify a Tauri updater signature (minisign format) against the public key
 * embedded in the app, independent of the private key. This is the security
 * premise of auto-update: if this fails, the updater would reject the artifact.
 *
 * usage: verify-updater-signature.mjs <pubkey-b64> <file.sig> <file> [latest.json]
 *
 * The release `.sig` file is itself base64 of the minisign signature text:
 *   untrusted comment: signature from tauri secret key
 *   <base64 of (2-byte algo + 8-byte key id + 64-byte ed25519 signature)>
 *   trusted comment: <comment>
 *   <base64 global signature over signature||trusted-comment>
 */
import { readFileSync } from "node:fs";
import { createHash, createPublicKey, verify } from "node:crypto";

const [pubkeyB64, sigPath, dataPath, manifestPath] = process.argv.slice(2);
if (!pubkeyB64 || !sigPath || !dataPath) {
  console.error("usage: verify-updater-signature.mjs <pubkey-b64> <file.sig> <file> [latest.json]");
  process.exit(2);
}

const nonEmpty = (s) => s.replace(/\r/g, "").split("\n").filter((l) => l.length > 0);
const b64line = (lines) => lines.find((l) => !l.startsWith("untrusted") && !l.startsWith("trusted"));

const pubStruct = Buffer.from(b64line(nonEmpty(Buffer.from(pubkeyB64, "base64").toString("utf8"))), "base64");
if (pubStruct.length !== 42) throw new Error(`unexpected public key length: ${pubStruct.length}`);
const keyId = pubStruct.subarray(2, 10);
const rawPub = pubStruct.subarray(10, 42);

const sigFileText = readFileSync(sigPath, "utf8").trim();
const sigText = Buffer.from(sigFileText, "base64").toString("utf8");
const sigLines = nonEmpty(sigText);
const sigStruct = Buffer.from(sigLines[1], "base64");
if (sigStruct.length !== 74) throw new Error(`unexpected signature length: ${sigStruct.length}`);
const algo = sigStruct.subarray(0, 2).toString("ascii");
const sigKeyId = sigStruct.subarray(2, 10);
const sig = sigStruct.subarray(10, 74);
const trustedComment = (sigLines.find((l) => l.startsWith("trusted comment")) || "").replace("trusted comment: ", "");
const globalSig = Buffer.from(sigLines[sigLines.length - 1], "base64");

const data = readFileSync(dataPath);
const payload = algo === "ED" ? createHash("blake2b512").update(data).digest() : data;

const der = Buffer.concat([Buffer.from("302a300506032b6570032100", "hex"), rawPub]);
const key = createPublicKey({ key: der, format: "der", type: "spki" });

const mainOk = verify(null, payload, key, sig);
const globalOk = verify(null, Buffer.concat([sig, Buffer.from(trustedComment, "utf8")]), key, globalSig);
const keyIdOk = keyId.equals(sigKeyId);

if (manifestPath) {
  const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
  const platform = manifest.platforms["linux-x86_64"];
  if (!platform) throw new Error("latest.json has no linux-x86_64 entry");
  if (platform.signature !== sigFileText) throw new Error("latest.json signature does not match the .sig file");
}

if (!(keyIdOk && mainOk && globalOk)) {
  console.error(`signature INVALID (key id ${keyIdOk ? "ok" : "mismatch"}, main ${mainOk}, trusted comment ${globalOk})`);
  process.exit(1);
}
console.log(`signature OK: ${dataPath} (${algo}, sha256 ${createHash("sha256").update(data).digest("hex")})`);
