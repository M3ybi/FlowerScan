import type { Handler } from "@netlify/functions";
import { getHouseholdByToken, getHouseholdTokenFromRequest, headers, readRecords, sanitizeRecords, writeRecords } from "./_shared/storage";

export const handler: Handler = async (event) => {
  if (event.httpMethod === "OPTIONS") {
    return { headers, statusCode: 204 };
  }

  if (event.httpMethod === "GET") {
    const householdToken = getHouseholdTokenFromRequest(event);
    if (!householdToken) {
      return { body: JSON.stringify({ error: "Household access is required." }), headers, statusCode: 401 };
    }
    if (!(await getHouseholdByToken(householdToken))) {
      return { body: JSON.stringify({ error: "Household access is invalid." }), headers, statusCode: 404 };
    }

    const records = await readRecords(householdToken);
    return { body: JSON.stringify({ records }), headers, statusCode: 200 };
  }

  if (event.httpMethod !== "POST") {
    return { body: JSON.stringify({ error: "Method not allowed" }), headers, statusCode: 405 };
  }

  const body = JSON.parse(event.body || "{}") as { records?: unknown };
  const householdToken = getHouseholdTokenFromRequest(event);
  if (!householdToken) {
    return { body: JSON.stringify({ error: "Household access is required." }), headers, statusCode: 401 };
  }
  if (!(await getHouseholdByToken(householdToken))) {
    return { body: JSON.stringify({ error: "Household access is invalid." }), headers, statusCode: 404 };
  }

  const records = sanitizeRecords(body.records);
  await writeRecords(householdToken, records);

  return { body: JSON.stringify({ records }), headers, statusCode: 200 };
};
