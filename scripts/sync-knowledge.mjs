#!/usr/bin/env node
// Syncs knowledge/soi-knowledge-base.md to the Zayd assistant on Vapi.
//
// Vapi files can't be edited in place, so each sync:
//   1. uploads the markdown as a NEW file
//   2. re-points every knowledge-base reference on the assistant to it
//   3. (optionally) deletes the old file
//
// Usage:
//   node scripts/sync-knowledge.mjs --dry-run      show what would change, touch nothing
//   node scripts/sync-knowledge.mjs                upload + re-point
//   node scripts/sync-knowledge.mjs --delete-old   ...and delete the superseded file
//   --assistant <id>  override the target assistant
//
// Needs VAPI_PRIVATE_KEY in .env.local (never printed). Does not use VAPI_ASSISTANT_ID,
// because .env.local may point at an older shared assistant.

import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const DEFAULT_ASSISTANT = "6a36456d-142e-4488-a439-c390948f5560"; // SOI Receptionist (Zayd)
const KB_PATH = resolve(ROOT, "knowledge/soi-knowledge-base.md");
const API = "https://api.vapi.ai";

const args = process.argv.slice(2);
const DRY = args.includes("--dry-run");
const DELETE_OLD = args.includes("--delete-old");
const aIdx = args.indexOf("--assistant");
const ASSISTANT_ID = aIdx >= 0 ? args[aIdx + 1] : DEFAULT_ASSISTANT;

function loadKey() {
  if (process.env.VAPI_PRIVATE_KEY) return process.env.VAPI_PRIVATE_KEY;
  const envPath = resolve(ROOT, ".env.local");
  if (!existsSync(envPath)) throw new Error(".env.local not found");
  for (const line of readFileSync(envPath, "utf8").split("\n")) {
    const m = line.match(/^\s*VAPI_PRIVATE_KEY\s*=\s*(.*)\s*$/);
    if (m) return m[1].replace(/^["']|["']$/g, "");
  }
  throw new Error("VAPI_PRIVATE_KEY missing from .env.local");
}

const KEY = loadKey();

async function vapi(path, init = {}) {
  const res = await fetch(API + path, {
    ...init,
    headers: { Authorization: `Bearer ${KEY}`, ...(init.headers || {}) },
  });
  const text = await res.text();
  let body;
  try { body = JSON.parse(text); } catch { body = text; }
  if (!res.ok) {
    throw new Error(`${init.method || "GET"} ${path} -> ${res.status}\n${typeof body === "string" ? body : JSON.stringify(body, null, 2)}`);
  }
  return body;
}

// Collect every fileIds array anywhere inside the model.
function collectFileIds(node, found = []) {
  if (Array.isArray(node)) node.forEach((n) => collectFileIds(n, found));
  else if (node && typeof node === "object") {
    for (const [k, v] of Object.entries(node)) {
      if (k === "fileIds" && Array.isArray(v)) found.push(...v);
      else collectFileIds(v, found);
    }
  }
  return found;
}

function replaceFileIds(node, newId) {
  let count = 0;
  (function walk(n) {
    if (Array.isArray(n)) n.forEach(walk);
    else if (n && typeof n === "object") {
      for (const [k, v] of Object.entries(n)) {
        if (k === "fileIds" && Array.isArray(v)) { n[k] = [newId]; count++; }
        else walk(v);
      }
    }
  })(node);
  return count;
}

const md = readFileSync(KB_PATH, "utf8");
console.log(`Knowledge file: ${KB_PATH} (${Buffer.byteLength(md)} bytes)`);

const assistant = await vapi(`/assistant/${ASSISTANT_ID}`);
console.log(`Assistant: ${assistant.name} (${ASSISTANT_ID})`);
const model = assistant.model;
if (!model) throw new Error("Assistant has no model object");

const oldIds = [...new Set(collectFileIds(model))];
console.log(`Current knowledge file id(s): ${oldIds.join(", ") || "(none)"}`);
if (oldIds.length > 1) {
  throw new Error("More than one distinct knowledge file is attached. Resolve that by hand first so nothing is dropped silently.");
}

if (DRY) {
  console.log("\nDRY RUN: would upload the file, re-point", oldIds.length ? "all references" : "nothing (no references found)", DELETE_OLD ? "and delete the old file." : "and keep the old file.");
  process.exit(0);
}

// Back up the current model so a bad sync can be rolled back by hand.
const stamp = new Date().toISOString().replace(/[:.]/g, "-");
const backupDir = resolve(ROOT, "scripts/.backups");
mkdirSync(backupDir, { recursive: true });
const backupPath = resolve(backupDir, `assistant-${stamp}.json`);
writeFileSync(backupPath, JSON.stringify({ id: ASSISTANT_ID, model }, null, 2));
console.log(`Backup written: ${backupPath}`);

// 1. Upload the new file.
const date = new Date().toISOString().slice(0, 10);
const form = new FormData();
form.append("file", new Blob([md], { type: "text/markdown" }), `soi-knowledge-${date}.md`);
const uploaded = await vapi("/file", { method: "POST", body: form });
console.log(`Uploaded: ${uploaded.id} (${uploaded.name})`);

// 2. Re-point and PATCH the whole model (Vapi does not deep-merge model).
const n = replaceFileIds(model, uploaded.id);
if (n === 0) console.warn("Warning: no fileIds arrays found to re-point; the new file is uploaded but not attached.");
await vapi(`/assistant/${ASSISTANT_ID}`, {
  method: "PATCH",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ model }),
});

// 3. Verify.
const after = await vapi(`/assistant/${ASSISTANT_ID}`);
const afterIds = [...new Set(collectFileIds(after.model))];
const ok = afterIds.length === 1 && afterIds[0] === uploaded.id;
console.log(`Re-pointed ${n} reference(s). Verified: ${ok ? "yes" : "NO - check manually"} (${afterIds.join(", ")})`);

if (ok && DELETE_OLD && oldIds[0]) {
  await vapi(`/file/${oldIds[0]}`, { method: "DELETE" });
  console.log(`Deleted old file ${oldIds[0]}`);
} else if (oldIds[0]) {
  console.log(`Old file ${oldIds[0]} kept. Re-run with --delete-old next time to tidy up.`);
}
console.log("\nDone. Make a test call and ask about the learning portal and the 14 October start.");
