#!/usr/bin/env node
/**
 * Creates or updates the shared Vapi assistant for MOTECHWA and the
 * Sayyidina Omar Institute via the Vapi REST API, wiring the system
 * prompt, the send_enquiry_email tool, and the webhook URL (this app's
 * /api/enquiry route) together in one place.
 *
 * Usage:
 *   VAPI_PRIVATE_KEY=... WEBHOOK_URL=https://your-domain.com/api/enquiry node scripts/create-assistant.mjs
 *
 * To update an existing assistant instead of creating a new one, also pass:
 *   VAPI_ASSISTANT_ID=...
 *
 * Requires Node 18+ (for global fetch). Loads variables from .env / .env.local
 * if present via a minimal parser — no extra dependency required.
 */
import { readFileSync, existsSync } from "node:fs";
import { buildAssistantPayload } from "../lib/vapi-assistant-config.mjs";

function loadDotEnv(path) {
  if (!existsSync(path)) return;
  const contents = readFileSync(path, "utf8");
  for (const line of contents.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (!(key in process.env)) process.env[key] = value;
  }
}

loadDotEnv(".env.local");
loadDotEnv(".env");

const VAPI_PRIVATE_KEY = process.env.VAPI_PRIVATE_KEY;
const WEBHOOK_URL = process.env.WEBHOOK_URL;
const WEBHOOK_SECRET = process.env.VAPI_WEBHOOK_SECRET;
const VAPI_ASSISTANT_ID = process.env.VAPI_ASSISTANT_ID;

if (!VAPI_PRIVATE_KEY) {
  console.error(
    "Missing VAPI_PRIVATE_KEY. Get this from the Vapi dashboard (Settings > API Keys) — it is the PRIVATE/server key, not the public web key."
  );
  process.exit(1);
}

if (!WEBHOOK_URL) {
  console.error(
    "Missing WEBHOOK_URL. Set it to your deployed /api/enquiry endpoint, e.g. https://your-domain.com/api/enquiry (use an ngrok/tunnel URL for local testing)."
  );
  process.exit(1);
}

const payload = buildAssistantPayload({
  webhookUrl: WEBHOOK_URL,
  webhookSecret: WEBHOOK_SECRET,
});

const isUpdate = Boolean(VAPI_ASSISTANT_ID);
const url = isUpdate
  ? `https://api.vapi.ai/assistant/${VAPI_ASSISTANT_ID}`
  : "https://api.vapi.ai/assistant";

const response = await fetch(url, {
  method: isUpdate ? "PATCH" : "POST",
  headers: {
    Authorization: `Bearer ${VAPI_PRIVATE_KEY}`,
    "Content-Type": "application/json",
  },
  body: JSON.stringify(payload),
});

const body = await response.json();

if (!response.ok) {
  console.error(`Vapi API error (${response.status}):`, JSON.stringify(body, null, 2));
  process.exit(1);
}

console.log(isUpdate ? "Assistant updated successfully.\n" : "Assistant created successfully.\n");
console.log(`Assistant ID: ${body.id}`);
console.log(
  "\nAdd this to your .env.local as NEXT_PUBLIC_VAPI_ASSISTANT_ID if you just created a new assistant."
);
