import { z } from "zod";

/**
 * Which organisation an enquiry belongs to. This decides which inbox the
 * email goes to (see lib/email.ts).
 */
export const ENTITIES = ["MOTECHWA", "Sayyidina Omar Institute"] as const;

const MOTECHWA_CATEGORIES = [
  "Cloud & Infrastructure Advisory",
  "Fractional CTO",
  "Cybersecurity Consulting",
  "Cybersecurity Incident",
] as const;

const SOI_CATEGORIES = [
  "Programme Enquiry",
  "How You See Yourself at 30",
  "Murabbi Formation",
  "Project Amanah",
  "Cloud Broadcasting",
  "Imam or Scholar Consultation",
  "Welfare or Safeguarding",
] as const;

/** Valid for either organisation. */
const SHARED_CATEGORIES = ["General"] as const;

/**
 * Every category the assistant may use. Keep in sync with the `category`
 * enum in the Vapi tool definition (lib/vapi-assistant-config.mjs).
 */
export const ENQUIRY_CATEGORIES = [
  ...MOTECHWA_CATEGORIES,
  ...SOI_CATEGORIES,
  ...SHARED_CATEGORIES,
] as const;

export const URGENCY_LEVELS = ["Standard", "Urgent"] as const;

/**
 * Be forgiving about how the model words urgency. "High", "critical" or
 * "ASAP" mean Urgent; anything else unrecognised or missing means Standard.
 * A wording slip must never cause a whole enquiry to be rejected.
 */
const urgencySchema = z.preprocess((value) => {
  if (typeof value !== "string") return "Standard";
  return /^(urgent|high|critical|asap|emergency|immediate)$/i.test(value.trim())
    ? "Urgent"
    : "Standard";
}, z.enum(URGENCY_LEVELS));

const CONTACT_HINT =
  "contact_info must be a phone number or an email written as name@example.com (never spoken words like 'at' or 'dot')";

export const enquirySchema = z
  .object({
    entity: z.enum(ENTITIES, {
      errorMap: () => ({
        message: `entity must be one of: ${ENTITIES.join(", ")}`,
      }),
    }),
    caller_name: z
      .string({ required_error: "caller_name is required" })
      .trim()
      .min(2, "caller_name must be at least 2 characters"),
    contact_info: z
      .string({ required_error: "contact_info is required" })
      .trim()
      .min(5, "contact_info must be at least 5 characters")
      .refine((value) => !/\b(at|dot)\b/i.test(value), CONTACT_HINT)
      .refine(
        (value) =>
          /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value) ||
          (value.match(/\d/g) ?? []).length >= 8,
        CONTACT_HINT
      ),
    category: z.enum(ENQUIRY_CATEGORIES, {
      errorMap: () => ({
        message: `category must be one of: ${ENQUIRY_CATEGORIES.join(", ")}`,
      }),
    }),
    summary: z
      .string({ required_error: "summary is required" })
      .trim()
      .min(1, "summary is required")
      .max(1500, "summary must be 1500 characters or fewer"),
    urgency: urgencySchema,
    // A short verbatim excerpt of what the caller said.
    caller_quote: z.string().trim().max(500).optional(),
    // Call metadata supplied by Vapi itself, not by the model. Prefer filling
    // these in the webhook from message.call rather than the tool schema.
    caller_number: z.string().trim().optional(),
    call_time: z.string().trim().optional(),
  })
  .superRefine((data, ctx) => {
    const allowed: readonly string[] =
      data.entity === "MOTECHWA"
        ? [...MOTECHWA_CATEGORIES, ...SHARED_CATEGORIES]
        : [...SOI_CATEGORIES, ...SHARED_CATEGORIES];
    if (!allowed.includes(data.category)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["category"],
        message: `category "${data.category}" does not belong to ${data.entity}. Allowed: ${allowed.join(", ")}`,
      });
    }
  });

export type EnquiryPayload = z.infer<typeof enquirySchema>;
