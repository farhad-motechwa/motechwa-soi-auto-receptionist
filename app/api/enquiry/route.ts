import { NextRequest, NextResponse } from "next/server";
import { enquirySchema } from "@/lib/validation";
import { sendEnquiryEmail } from "@/lib/email";

export const runtime = "nodejs";

/**
 * Single webhook for every tool the assistant can call — this is the URL
 * configured as the assistant's server.url via the Vapi API, so adding a
 * new tool later only means adding a case here, not reconfiguring Vapi.
 *
 * Accepts:
 *
 *  1. Vapi's current "tool-calls" server message (possibly several calls in
 *     one turn):
 *     { message: { type: "tool-calls", toolCalls: [{ id, function: { name, arguments } }] } }
 *
 *  2. Vapi's legacy "function-call" server message:
 *     { message: { type: "function-call", functionCall: { name, parameters } } }
 *
 *  3. A flat payload posted directly (useful for curl/Postman testing) —
 *     treated as a send_enquiry_email call for backwards compatibility:
 *     { entity, caller_name, contact_info, category, summary, urgency }
 *
 * The response shape mirrors whichever request shape was received: Vapi gets
 * the `results[]` array it expects (read back to the caller by the model),
 * while a direct/manual call gets a plain { success, message } shape.
 */

type VapiToolCall = {
  id?: string;
  type?: string;
  function?: { name?: string; arguments?: unknown };
};

type VapiEnvelope = {
  message?: {
    type?: string;
    toolCalls?: VapiToolCall[];
    functionCall?: { name?: string; parameters?: unknown };
  };
};

function parseArguments(raw: unknown): Record<string, unknown> {
  if (raw == null) return {};
  if (typeof raw === "string") {
    try {
      return JSON.parse(raw);
    } catch {
      return {};
    }
  }
  if (typeof raw === "object") return raw as Record<string, unknown>;
  return {};
}

const CONFIRMATION_MESSAGE = "Enquiry logged successfully";

/** Handles the send_enquiry_email tool call and always resolves to speakable text — never throws. */
async function resolveToolCall(args: Record<string, unknown>): Promise<string> {
  const parsed = enquirySchema.safeParse(args);

  if (!parsed.success) {
    const message = parsed.error.issues.map((issue) => issue.message).join("; ");
    return `Could not log the enquiry: ${message}`;
  }

  try {
    await sendEnquiryEmail(parsed.data);
    return CONFIRMATION_MESSAGE;
  } catch (err) {
    console.error("Failed to send enquiry email:", err);
    return "The enquiry could not be sent right now. Please advise the caller to try again shortly, or note the details down for them.";
  }
}

export async function POST(request: NextRequest) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { success: false, message: "Request body must be valid JSON." },
      { status: 400 }
    );
  }

  const envelope = body as VapiEnvelope;
  const toolCalls = envelope?.message?.toolCalls;
  const legacyCall = envelope?.message?.functionCall;

  if (Array.isArray(toolCalls) && toolCalls.length > 0) {
    const results = await Promise.all(
      toolCalls.map(async (call) => ({
        toolCallId: call.id ?? undefined,
        result: await resolveToolCall(parseArguments(call.function?.arguments)),
      }))
    );
    return NextResponse.json({ results }, { status: 200 });
  }

  if (legacyCall) {
    const result = await resolveToolCall(parseArguments(legacyCall.parameters));
    return NextResponse.json({ results: [{ result }] }, { status: 200 });
  }

  // Flat payload posted directly — validated and emailed as an enquiry.
  const args = (body as Record<string, unknown>) ?? {};
  const parsed = enquirySchema.safeParse(args);

  if (!parsed.success) {
    const message = parsed.error.issues.map((issue) => issue.message).join("; ");
    return NextResponse.json(
      { success: false, message: `Validation failed: ${message}` },
      { status: 400 }
    );
  }

  try {
    await sendEnquiryEmail(parsed.data);
  } catch (err) {
    console.error("Failed to send enquiry email:", err);
    return NextResponse.json(
      { success: false, message: "Failed to send enquiry email." },
      { status: 502 }
    );
  }

  return NextResponse.json({ success: true, message: CONFIRMATION_MESSAGE }, { status: 200 });
}
