import { z } from "zod";

/**
 * Which organisation an enquiry belongs to. This is what decides which
 * inbox the email goes to — see lib/email.ts.
 */
export const ENTITIES = ["MOTECHWA", "Sayyidina Omar Institute"] as const;

/**
 * Categories the voice assistant is allowed to file an enquiry under,
 * spanning both entities. Keep this in sync with the `category` enum in
 * the Vapi tool definition (lib/vapi-assistant-config.mjs).
 */
export const ENQUIRY_CATEGORIES = [
  "Cloud & Infrastructure Advisory",
  "Fractional CTO",
  "Cybersecurity Consulting",
  "Programme Enquiry",
  "How You See Yourself at 30",
  "Murabbi Formation",
  "Project Amanah",
  "Cloud Broadcasting",
  "Imam or Scholar Consultation",
  "General",
] as const;

export const URGENCY_LEVELS = ["Standard", "Urgent"] as const;

export const enquirySchema = z.object({
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
    .min(5, "contact_info must be at least 5 characters"),
  category: z.enum(ENQUIRY_CATEGORIES, {
    errorMap: () => ({
      message: `category must be one of: ${ENQUIRY_CATEGORIES.join(", ")}`,
    }),
  }),
  summary: z
    .string({ required_error: "summary is required" })
    .trim()
    .min(1, "summary is required"),
  urgency: z.enum(URGENCY_LEVELS).optional().default("Standard"),
  // A short verbatim excerpt of what the caller said, quoted directly.
  caller_quote: z.string().trim().optional(),
  // Call metadata supplied by Vapi itself (Static Body Fields, via Liquid
  // templates), not spoken by the caller or filled in by the model — may be
  // absent when testing outside a real call.
  caller_number: z.string().trim().optional(),
  call_time: z.string().trim().optional(),
});

export type EnquiryPayload = z.infer<typeof enquirySchema>;
