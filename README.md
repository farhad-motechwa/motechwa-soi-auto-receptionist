# MOTECHWA & Sayyidina Omar Institute — Shared Line Voice Assistant

An AI voice receptionist for a single shared phone number (+61 495 042 008) answering calls
for two distinct organisations: **MOTECHWA** (technology consulting and fractional CTO
services) and the **Sayyidina Omar Institute** (character-formation and mentorship). Built on
the same pattern as Al-Hidayah Centre's `ahc-auto-receptionist`: [Vapi](https://vapi.ai) hosts
the actual voice AI (speech-to-text, the LLM, text-to-speech), Twilio just forwards the call to
Vapi, and this app is a small webhook that Vapi calls whenever the assistant needs to log an
enquiry by email.

Phone only — no browser widget in this version (that can be added later without touching the
assistant's brain).

## 1. Directory structure

```
motechwa-soi-auto-receptionist/
├── app/
│   ├── api/
│   │   └── enquiry/
│   │       └── route.ts        # Webhook: validates + emails tool-call payloads from Vapi
│   ├── globals.css
│   ├── layout.tsx
│   └── page.tsx                 # Minimal status page (no caller-facing UI)
├── lib/
│   ├── email.ts                  # Nodemailer transport, per-entity branding + inbox routing
│   ├── validation.ts              # Zod schema for the enquiry payload (entity, category, etc.)
│   └── vapi-assistant-config.mjs  # System prompt, tool schema, assistant payload builder
├── scripts/
│   └── create-assistant.mjs      # One-off script: creates/updates the assistant via Vapi's API
├── .env.example
└── ...
```

## 2. How it fits together

1. A caller dials +61 495 042 008. Twilio forwards the call to Vapi's inbound webhook.
2. Vapi runs the assistant configured by `scripts/create-assistant.mjs` from
   `lib/vapi-assistant-config.mjs`: it greets the caller, asks which organisation they mean,
   answers from the standard knowledge in the system prompt, and never invents pricing,
   programme dates, or religious rulings.
3. When the assistant needs to log an enquiry, Vapi calls this app's `POST /api/enquiry` with
   the tool-call payload (including which `entity` — MOTECHWA or Sayyidina Omar Institute).
4. `app/api/enquiry/route.ts` validates the payload with Zod, and `lib/email.ts` routes the
   email to the right inbox: `ADMIN_EMAIL_MOTECHWA` or `ADMIN_EMAIL_SOI`.
5. It replies in the shape Vapi expects so the assistant can confirm the outcome to the caller
   out loud.

## 3. Prerequisites

- Node.js 18.18 or later
- A [Vapi](https://vapi.ai) account (free tier is sufficient to start)
- Your Twilio Account SID and Auth Token (Console → Account → API keys & tokens), to import
  the shared number into Vapi
- Two SMTP-capable mailboxes for outbound email — each entity sends its own enquiry
  emails from its own Google Workspace mailbox (`farhad@motechwa.com.au` and
  `farhad@sayyidinaomarinstitute.au`), each with its own
  [App Password](https://support.google.com/accounts/answer/185833)

## 4. Local setup

```bash
cd motechwa-soi-auto-receptionist
npm install
cp .env.example .env.local
```

Fill in `.env.local`:

- `ADMIN_EMAIL_MOTECHWA`, `ADMIN_EMAIL_SOI` — already defaulted in `.env.example` to
  `farhad@motechwa.com.au` and `farhad@sayyidinaomarinstitute.au`.
- `SMTP_HOST` / `SMTP_PORT` — shared by both mailboxes (`smtp.gmail.com` / `587`),
  already defaulted in `.env.example`.
- `SMTP_USER_MOTECHWA` / `SMTP_PASS_MOTECHWA` — MOTECHWA's own mailbox
  (`farhad@motechwa.com.au`) and its Google Workspace App Password.
- `SMTP_USER_SOI` / `SMTP_PASS_SOI` — the Institute's own mailbox
  (`farhad@sayyidinaomarinstitute.au`) and its Google Workspace App Password.
  Each entity's enquiry emails are sent from that entity's own mailbox, not a shared sender.
- Leave the Vapi variables for the next step.

### Create the Vapi assistant

The assistant's brain (system prompt, guardrails, and tool schema) is defined in code so it's
version-controlled, not hand-configured in a dashboard.

1. In the [Vapi dashboard](https://dashboard.vapi.ai), copy your **Public Key** and **Private
   Key** from Settings → API Keys.
2. Add the private key to `.env.local` as `VAPI_PRIVATE_KEY`.
3. For local testing, expose your dev server with a tunnel (e.g. `npx ngrok http 3000`) and set
   `WEBHOOK_URL` in `.env.local` to `https://<your-tunnel>/api/enquiry`. In production, use your
   real deployed URL instead (see §6).
4. Run:

   ```bash
   npm run create-assistant
   ```

   This prints an `Assistant ID`. Keep it — you'll need it both to re-run this script after any
   future prompt change (pass it as `VAPI_ASSISTANT_ID` to update in place instead of creating a
   duplicate) and to point the shared phone number at this assistant in the next step.

5. Browse [Vapi's voice library](https://docs.vapi.ai/customization/speech-configuration) and
   swap the placeholder ElevenLabs voice ID in `vapi-assistant-config.mjs` for one that suits
   both organisations' tone, then re-run `create-assistant` with `VAPI_ASSISTANT_ID` set.

### Point the shared Twilio number at this assistant

This is the same mechanism Al-Hidayah Centre's number uses (Voice webhook →
`https://api.vapi.ai/twilio/inbound_call`), done through Vapi's dashboard rather than by hand
in Twilio, so Vapi can also tie the number to the right assistant:

1. In the Vapi dashboard, go to **Phone Numbers → Import → Twilio**.
2. Enter your Twilio Account SID, Auth Token, and the number `+61495042008`.
3. Assign it to the assistant you just created.

Vapi will configure the number's Voice webhook in Twilio automatically. No manual TwiML or
Studio flow needed.

### Testing the webhook directly

You can exercise `/api/enquiry` without a live call:

```bash
curl -X POST http://localhost:3000/api/enquiry \
  -H "Content-Type: application/json" \
  -d '{
    "entity": "MOTECHWA",
    "caller_name": "Jane Citizen",
    "contact_info": "0412 345 678",
    "category": "Fractional CTO",
    "summary": "Wants to discuss a fractional CTO engagement for a 20-person startup.",
    "urgency": "Standard"
  }'
```

You should receive `{"success":true,"message":"Enquiry logged successfully"}` and an email at
`ADMIN_EMAIL_MOTECHWA`. Swap `"entity": "Sayyidina Omar Institute"` (and a matching category) to
test the other inbox.

## 5. Environment variables

| Variable | Where used | Notes |
|---|---|---|
| `ADMIN_EMAIL_MOTECHWA` | Server | Inbox for MOTECHWA enquiries |
| `ADMIN_EMAIL_SOI` | Server | Inbox for Sayyidina Omar Institute enquiries |
| `VAPI_PRIVATE_KEY` | Build-time script only | Never expose to the browser |
| `WEBHOOK_URL` | Build-time script only | Used to wire the assistant's tool-call server |
| `VAPI_WEBHOOK_SECRET` | Server + script | Optional shared secret for verifying webhook calls |
| `SMTP_HOST` / `SMTP_PORT` | Server | Shared Google Workspace SMTP host/port (`smtp.gmail.com` / `587`) |
| `SMTP_USER_MOTECHWA` / `SMTP_PASS_MOTECHWA` | Server | MOTECHWA's own mailbox + App Password (sends MOTECHWA enquiry emails) |
| `SMTP_USER_SOI` / `SMTP_PASS_SOI` | Server | Institute's own mailbox + App Password (sends Institute enquiry emails) |

## 6. Deployment (Vercel)

1. Push this project to a GitHub repository.
2. In [Vercel](https://vercel.com), "Add New… → Project" and import the repository.
3. Under Project Settings → Environment Variables, add every variable from `.env.example`
   **except** `VAPI_PRIVATE_KEY` and `WEBHOOK_URL` (those are only needed locally when you run
   `npm run create-assistant`, not at runtime).
4. Deploy. Vercel gives you a URL like `https://motechwa-soi-receptionist.vercel.app`.
5. Run `npm run create-assistant` **once more locally**, with `WEBHOOK_URL` set to
   `https://motechwa-soi-receptionist.vercel.app/api/enquiry` and `VAPI_ASSISTANT_ID` set to the
   assistant you created earlier, so the assistant now points at your live webhook instead of
   the tunnel.
6. Add a custom domain under Project Settings → Domains if desired.

## 7. Guardrails built into the assistant

- The assistant only answers from the standard knowledge in its system prompt for each
  organisation — it does not invent pricing, programme dates, or availability.
- Its very first job on a call is to establish which organisation the caller means, since that
  decides which inbox the enquiry reaches.
- For Sayyidina Omar Institute calls, it explicitly refuses to issue fatwas, fiqh rulings, or
  theological arbitration, and instead offers to log the matter under "Imam or Scholar
  Consultation".
- Every enquiry it logs is validated server-side with Zod before an email is sent, so malformed
  or incomplete tool calls never reach either inbox silently mangled.

## 8. Security notes

- Keep `VAPI_PRIVATE_KEY`, your Twilio Auth Token, and both `SMTP_PASS_MOTECHWA` / `SMTP_PASS_SOI` out of version control —
  `.gitignore` already excludes `.env*` files, but double-check before pushing to a public
  repository.
- `npm audit` will flag advisories against the pinned Next.js 14.2.x line, inherited from the
  Al-Hidayah template. This app uses none of the affected features (no `next/image`, no
  Middleware, no custom server, no i18n), so exposure is low, but a future Next.js major-version
  upgrade is worth scheduling as routine maintenance.

## 9. Extending this

- Add a browser "speak with assistant" widget later using `@vapi-ai/web`, following the same
  pattern as `ahc-auto-receptionist`'s `components/VoiceAssistant.tsx`, if a website presence
  becomes useful.
- Add SMS notifications (e.g. via Twilio) alongside email in `lib/email.ts` if urgent enquiries
  should also push to a phone.
- If call volume grows, Vapi's dashboard provides transcripts and call recordings without any
  changes to this codebase.
