import type { Handler } from "@netlify/functions";
import {
  createHousehold,
  getHouseholdByToken,
  getHouseholdTokenFromRequest,
  headers,
  isValidHouseholdToken,
} from "./_shared/storage";

const publicHousehold = (household: { name: string; publicToken: string }) => ({
  name: household.name,
  publicToken: household.publicToken,
});

export const handler: Handler = async (event) => {
  if (event.httpMethod === "OPTIONS") {
    return { headers, statusCode: 204 };
  }

  if (event.httpMethod === "GET") {
    const householdToken = getHouseholdTokenFromRequest(event);
    if (!householdToken) {
      return { body: JSON.stringify({ error: "Household access is required." }), headers, statusCode: 401 };
    }

    const household = await getHouseholdByToken(householdToken);
    if (!household) {
      return { body: JSON.stringify({ error: "Household access is invalid." }), headers, statusCode: 404 };
    }

    return { body: JSON.stringify({ household: publicHousehold(household) }), headers, statusCode: 200 };
  }

  if (event.httpMethod !== "POST") {
    return { body: JSON.stringify({ error: "Method not allowed" }), headers, statusCode: 405 };
  }

  let body: { name?: unknown; householdId?: unknown };
  try {
    body = JSON.parse(event.body || "{}") as { name?: unknown; householdId?: unknown };
  } catch {
    return { body: JSON.stringify({ error: "Invalid JSON body." }), headers, statusCode: 400 };
  }

  if (body.householdId && !isValidHouseholdToken(body.householdId)) {
    return { body: JSON.stringify({ error: "Invalid household token." }), headers, statusCode: 400 };
  }

  const household = await createHousehold(typeof body.name === "string" ? body.name : undefined);
  return { body: JSON.stringify({ household: publicHousehold(household) }), headers, statusCode: 201 };
};
