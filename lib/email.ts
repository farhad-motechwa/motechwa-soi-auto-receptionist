import nodemailer, { type Transporter } from "nodemailer";
import type { EnquiryPayload } from "./validation";

let cachedTransporter: Transporter | null = null;

function getTransporter(): Transporter {
  if (cachedTransporter) return cachedTransporter;

  const { SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS } = process.env;

  if (!SMTP_HOST || !SMTP_PORT || !SMTP_USER || !SMTP_PASS) {
    throw new Error(
      "Missing SMTP configuration. Ensure SMTP_HOST, SMTP_PORT, SMTP_USER and SMTP_PASS are set."
    );
  }

  const port = Number(SMTP_PORT);

  cachedTransporter = nodemailer.createTransport({
    host: SMTP_HOST,
    port,
    // 465 is implicit TLS; 587/25 use STARTTLS.
    secure: port === 465,
    auth: {
      user: SMTP_USER,
      pass: SMTP_PASS,
    },
  });

  return cachedTransporter;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** Best-effort detection of an email vs. a phone number, for the reply link. */
function buildContactLink(contactInfo: string): { href: string; label: string } {
  const trimmed = contactInfo.trim();
  const isEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed);
  if (isEmail) {
    return { href: `mailto:${trimmed}`, label: trimmed };
  }
  const digitsOnly = trimmed.replace(/[^\d+]/g, "");
  return { href: `tel:${digitsOnly}`, label: trimmed };
}

/**
 * Per-entity branding and inbox routing. Each organisation is distinct, so
 * this is the single place that decides which address receives an enquiry
 * and how the email is badged.
 */
const ENTITY_CONFIG: Record<
  EnquiryPayload["entity"],
  { adminEmailEnvVar: "ADMIN_EMAIL_MOTECHWA" | "ADMIN_EMAIL_SOI"; brandColor: string; footer: string }
> = {
  MOTECHWA: {
    adminEmailEnvVar: "ADMIN_EMAIL_MOTECHWA",
    brandColor: "#0f172a",
    footer: "Logged automatically by the MOTECHWA / Sayyidina Omar Institute shared line voice assistant",
  },
  "Sayyidina Omar Institute": {
    adminEmailEnvVar: "ADMIN_EMAIL_SOI",
    brandColor: "#006644",
    footer: "Logged automatically by the MOTECHWA / Sayyidina Omar Institute shared line voice assistant",
  },
};

export function buildEnquirySubject(payload: EnquiryPayload): string {
  return `[${payload.entity} Enquiry - ${payload.urgency}] ${payload.category} - ${payload.caller_name}`;
}

export function buildEnquiryHtml(payload: EnquiryPayload): string {
  const { entity, caller_name, contact_info, category, summary, urgency, caller_quote, caller_number, call_time } = payload;
  const isUrgent = urgency === "Urgent";
  const contactLink = buildContactLink(contact_info);
  const { brandColor, footer } = ENTITY_CONFIG[entity];
  const timestamp = new Date().toLocaleString("en-AU", {
    timeZone: "Australia/Perth",
    dateStyle: "full",
    timeStyle: "short",
  });

  const urgentBanner = isUrgent
    ? `
      <tr>
        <td style="background-color:#b91c1c;color:#ffffff;padding:12px 20px;font-weight:600;font-size:14px;letter-spacing:0.02em;">
          ⚠ URGENT — please respond as soon as possible
        </td>
      </tr>`
    : "";

  return `
  <!DOCTYPE html>
  <html lang="en">
    <head>
      <meta charset="utf-8" />
      <meta name="viewport" content="width=device-width, initial-scale=1" />
      <title>${escapeHtml(buildEnquirySubject(payload))}</title>
    </head>
    <body style="margin:0;padding:0;background-color:#f1f5f9;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#1e293b;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#f1f5f9;padding:24px 0;">
        <tr>
          <td align="center">
            <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="background-color:#ffffff;border-radius:12px;overflow:hidden;border:1px solid #e2e8f0;">
              <tr>
                <td style="background-color:${brandColor};padding:20px 24px;">
                  <span style="color:#ffffff;font-size:16px;font-weight:600;">${escapeHtml(entity)} — Voice Assistant Enquiry</span>
                </td>
              </tr>
              ${urgentBanner}
              <tr>
                <td style="padding:24px;">
                  <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
                    <tr>
                      <td style="padding:6px 0;color:#64748b;font-size:13px;width:140px;">Caller name</td>
                      <td style="padding:6px 0;color:#0f172a;font-size:14px;font-weight:600;">${escapeHtml(caller_name)}</td>
                    </tr>
                    <tr>
                      <td style="padding:6px 0;color:#64748b;font-size:13px;">Contact</td>
                      <td style="padding:6px 0;font-size:14px;">
                        <a href="${contactLink.href}" style="color:${brandColor};text-decoration:none;font-weight:600;">${escapeHtml(contactLink.label)}</a>
                      </td>
                    </tr>
                    ${caller_number ? `<tr>
                      <td style="padding:6px 0;color:#64748b;font-size:13px;">Phone (system)</td>
                      <td style="padding:6px 0;color:#0f172a;font-size:14px;">${escapeHtml(caller_number)}</td>
                    </tr>` : ""}
                    <tr>
                      <td style="padding:6px 0;color:#64748b;font-size:13px;">Category</td>
                      <td style="padding:6px 0;color:#0f172a;font-size:14px;">${escapeHtml(category)}</td>
                    </tr>
                    <tr>
                      <td style="padding:6px 0;color:#64748b;font-size:13px;">Urgency</td>
                      <td style="padding:6px 0;font-size:14px;font-weight:600;color:${isUrgent ? "#b91c1c" : "#0f172a"};">${escapeHtml(urgency)}</td>
                    </tr>
                    <tr>
                      <td style="padding:6px 0;color:#64748b;font-size:13px;">Received</td>
                      <td style="padding:6px 0;color:#0f172a;font-size:14px;">${escapeHtml(timestamp)} (AWST)</td>
                    </tr>
                    ${call_time ? `<tr>
                      <td style="padding:6px 0;color:#64748b;font-size:13px;">Call time (system)</td>
                      <td style="padding:6px 0;color:#0f172a;font-size:14px;">${escapeHtml(call_time)}</td>
                    </tr>` : ""}
                  </table>

                  <blockquote style="margin:20px 0 0 0;padding:14px 16px;background-color:#f8fafc;border-left:4px solid ${brandColor};border-radius:0 8px 8px 0;color:#334155;font-size:14px;line-height:1.6;">
                    ${escapeHtml(summary).replace(/\n/g, "<br />")}
                  </blockquote>

                  ${caller_quote ? `<div style="margin:16px 0 0 0;">
                    <p style="margin:0 0 6px 0;color:#64748b;font-size:12px;font-weight:600;text-transform:uppercase;letter-spacing:0.04em;">In the caller's words</p>
                    <blockquote style="margin:0;padding:14px 16px;background-color:#f8fafc;border-left:4px solid #94a3b8;border-radius:0 8px 8px 0;color:#334155;font-size:14px;font-style:italic;line-height:1.6;">
                      "${escapeHtml(caller_quote).replace(/\n/g, "<br />")}"
                    </blockquote>
                  </div>` : ""}

                  <table role="presentation" cellpadding="0" cellspacing="0" style="margin-top:24px;">
                    <tr>
                      <td>
                        <a href="${contactLink.href}" style="display:inline-block;background-color:${brandColor};color:#ffffff;text-decoration:none;font-size:13px;font-weight:600;padding:10px 18px;border-radius:8px;">
                          ${contactLink.href.startsWith("mailto:") ? "Reply by email" : "Call back"}
                        </a>
                      </td>
                    </tr>
                  </table>
                </td>
              </tr>
              <tr>
                <td style="padding:16px 24px;background-color:#f8fafc;border-top:1px solid #e2e8f0;">
                  <p style="margin:0;color:#94a3b8;font-size:12px;">
                    ${escapeHtml(footer)}
                  </p>
                </td>
              </tr>
            </table>
          </td>
        </tr>
      </table>
    </body>
  </html>`;
}

export async function sendEnquiryEmail(payload: EnquiryPayload): Promise<void> {
  const { adminEmailEnvVar } = ENTITY_CONFIG[payload.entity];
  const adminEmail = process.env[adminEmailEnvVar];
  if (!adminEmail) {
    throw new Error(`Missing ${adminEmailEnvVar} environment variable.`);
  }

  const transporter = getTransporter();

  const textLines = [
    `New ${payload.entity} enquiry from ${payload.caller_name} (${payload.contact_info})`,
    payload.caller_number ? `Phone (system): ${payload.caller_number}` : null,
    `Category: ${payload.category}`,
    `Urgency: ${payload.urgency}`,
    payload.call_time ? `Call time (system): ${payload.call_time}` : null,
    "",
    payload.summary,
    payload.caller_quote ? `\nIn the caller's words:\n"${payload.caller_quote}"` : null,
  ].filter((line): line is string => line !== null);

  await transporter.sendMail({
    from: `"${payload.entity} Assistant" <${process.env.SMTP_USER}>`,
    to: adminEmail,
    subject: buildEnquirySubject(payload),
    html: buildEnquiryHtml(payload),
    text: textLines.join("\n"),
  });
}
