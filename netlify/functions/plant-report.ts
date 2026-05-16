import { schedule } from "@netlify/functions";
import { createEmailReport } from "./_shared/report";
import { readRecords, readSettings, writeSettings } from "./_shared/storage";

const bratislavaParts = () => {
  const parts = new Intl.DateTimeFormat("en-CA", {
    day: "2-digit",
    hour: "2-digit",
    hour12: false,
    minute: "2-digit",
    month: "2-digit",
    timeZone: "Europe/Bratislava",
    year: "numeric",
  }).formatToParts(new Date());

  const value = (type: string) => parts.find((part) => part.type === type)?.value ?? "";

  return {
    date: `${value("year")}-${value("month")}-${value("day")}`,
    hour: value("hour"),
    minute: value("minute"),
  };
};

const sendEmail = async (to: string, subject: string, html: string, text: string) => {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.REPORT_FROM_EMAIL || "FlowerScan <onboarding@resend.dev>";

  if (!apiKey) {
    throw new Error("RESEND_API_KEY is missing.");
  }

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ from, html, subject, text, to }),
  });

  if (!response.ok) {
    throw new Error(`Email provider returned ${response.status}.`);
  }
};

export const handler = schedule("0 * * * *", async () => {
  const now = bratislavaParts();

  if (now.hour !== "19") {
    return { statusCode: 200, body: "Skipped: not 19:00 Europe/Bratislava." };
  }

  const settings = await readSettings();

  if (!settings.recipient) {
    return { statusCode: 200, body: "Skipped: recipient is not configured." };
  }

  if (settings.lastSentDate === now.date) {
    return { statusCode: 200, body: "Skipped: report already sent today." };
  }

  const records = await readRecords();
  const report = createEmailReport(records);

  await sendEmail(settings.recipient, report.subject, report.html, report.text);
  await writeSettings({ ...settings, lastSentDate: now.date });

  return { statusCode: 200, body: `Sent ${report.rows.length} report rows.` };
});
