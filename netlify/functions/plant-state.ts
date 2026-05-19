import type { Handler } from "@netlify/functions";
import { getHouseholdByToken, getHouseholdTokenFromRequest, headers, readPlantState, sanitizePlantState, writePlantState } from "./_shared/storage";

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

    const state = await readPlantState(householdToken);
    return { body: JSON.stringify(state), headers, statusCode: 200 };
  }

  if (event.httpMethod !== "POST") {
    return { body: JSON.stringify({ error: "Method not allowed" }), headers, statusCode: 405 };
  }

  let body: unknown;
  try {
    body = JSON.parse(event.body || "{}");
  } catch {
    return { body: JSON.stringify({ error: "Invalid JSON body." }), headers, statusCode: 400 };
  }

  const householdToken = getHouseholdTokenFromRequest(event);
  if (!householdToken) {
    return { body: JSON.stringify({ error: "Household access is required." }), headers, statusCode: 401 };
  }
  if (!(await getHouseholdByToken(householdToken))) {
    return { body: JSON.stringify({ error: "Household access is invalid." }), headers, statusCode: 404 };
  }

  const state = sanitizePlantState(body);
  await writePlantState(householdToken, state);

  return { body: JSON.stringify(state), headers, statusCode: 200 };
};
