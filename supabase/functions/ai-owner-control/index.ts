import { createServiceClient, requireUser } from "../_shared/auth.ts";
import { corsHeaders, json } from "../_shared/cors.ts";
import { readImageRequest } from "../_shared/imageUpload.ts";

const uuid = /^[a-f0-9]{8}-[a-f0-9]{4}-[1-5][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i;
const sha256 = /^[a-f0-9]{64}$/;
const list = (value: unknown, max: number) => Array.isArray(value) && value.length <= max
  && value.every(item => typeof item === "string" && item.length <= 120);

Deno.serve(async request => {
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders });
  if (request.method !== "POST") return json(405, { error: "Method not allowed" });
  const auth = await requireUser(request.headers.get("authorization") ?? "");
  if (!auth) return json(401, { error: "Sign in required." });
  try {
    const body = await readImageRequest(request), client = createServiceClient();
    const { data: allowed, error: accessError } = await client.rpc("ai_owner_access", { actor: auth.user.id });
    if (body.action === "access") return json(200, { owner: !accessError && allowed === true });
    if (accessError || allowed !== true) return json(403, { error: "Owner access required." });
    let name: string, args: Record<string, unknown>;
    const actor = auth.user.id;
    switch (body.action) {
      case "state": name = "ai_owner_state"; args = { actor }; break;
      case "finops": name = "ai_owner_finops"; args = { actor }; break;
      case "approveCampaign":
        if (typeof body.proposalSha256 !== "string" || !sha256.test(body.proposalSha256)) return json(400, { error: "Invalid proposal." });
        name = "ai_owner_approve_campaign"; args = { actor, proposal_sha256: body.proposalSha256 }; break;
      case "acceptRisk":
        if (typeof body.evidenceSha256 !== "string" || !sha256.test(body.evidenceSha256)
          || !list(body.configurationIds, 4) || !list(body.recoveryConfigurationIds, 4)
          || JSON.stringify(body.approvedStages) !== "[5,10,25,50,100]"
          || typeof body.rollbackConditions !== "string" || body.rollbackConditions.length < 1 || body.rollbackConditions.length > 4000)
          return json(400, { error: "Invalid risk acceptance." });
        name = "ai_owner_accept_risk"; args = { actor, evidence_sha256: body.evidenceSha256,
          configuration_ids: body.configurationIds, recovery_configuration_ids: body.recoveryConfigurationIds,
          approved_stages: body.approvedStages, rollback_conditions: body.rollbackConditions }; break;
      case "revoke":
        if (typeof body.acceptanceId !== "string" || !uuid.test(body.acceptanceId)) return json(400, { error: "Invalid acceptance." });
        name = "ai_owner_revoke"; args = { actor, acceptance: body.acceptanceId }; break;
      case "applyStage":
        if (typeof body.grantId !== "string" || !uuid.test(body.grantId)) return json(400, { error: "Invalid stage grant." });
        name = "ai_owner_apply_stage"; args = { grant_id: body.grantId }; break;
      case "commitCutover":
        if (typeof body.acceptanceId !== "string" || !uuid.test(body.acceptanceId)
          || typeof body.releaseRevision !== "string" || !/^[a-f0-9]{40}$/.test(body.releaseRevision)) return json(400, { error: "Invalid release." });
        name = "ai_owner_commit_cutover"; args = { acceptance: body.acceptanceId, release_revision: body.releaseRevision }; break;
      case "recover":
        if (typeof body.acceptanceId !== "string" || !uuid.test(body.acceptanceId)
          || typeof body.configurationId !== "string" || body.configurationId.length > 120) return json(400, { error: "Invalid recovery." });
        name = "ai_owner_recover_luna"; args = { actor, acceptance: body.acceptanceId, configuration_id: body.configurationId }; break;
      default: return json(400, { error: "Invalid owner action." });
    }
    // No client actor, SQL, prices or claimed passing evidence is forwarded.
    const { data, error } = await client.rpc(name, args);
    if (error) return json(409, { error: "The owner action was not applied. Its authorization or evidence gate is not satisfied." });
    return json(200, { result: data });
  } catch { return json(503, { error: "Owner controls are temporarily unavailable." }); }
});
