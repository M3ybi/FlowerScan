import { useEffect, useState } from "react";
import { supabase } from "../../../lib/supabase";
import { defaultFinancialAssumptions, projectHouseholdEconomics } from "../../../lib/householdProfitability";

type Proposal = { sha256: string; plan: unknown; maxAttempts: number; maxUsd: number; durationSeconds: number; approved: boolean };
type Evidence = { sha256: string; release_revision: string; configurations: Record<string, string>; safety_configuration_ids: string[];
  limitations: string; engineering_checks_passed: boolean; false_acceptances: number; new_unknown_exposure: number };
type Acceptance = { id: string; revoked_at: string | null; state: string };
type Stage = { id: string; route: string; stage: number; applied_at: string | null; revoked_at: string | null };
type State = { proposals: Proposal[]; evidence: Evidence[]; acceptances: Acceptance[]; stages: Stage[]; routes: unknown; cutover: unknown };
type Finops = { spendingByModelAndRoute: Array<Record<string, string | number | null>>; unknownExposureAllTime: number;
  household: Record<string, unknown>; subscriptions: Record<string, unknown>; contribution: Record<string, unknown>;
  monthlyTrends: unknown; limitations: string[] };
const show = (value: unknown) => JSON.stringify(value, null, 2);
const routes = ["initial_care", "care_refresh", "diagnosis", "image_safety"];
const rollbackConditions = "Pause affected route on restricted-image acceptance, broken authorization/replay, unknown new financial exposure, wrong provider model or material output failure. After cutover use controlled failure or explicitly authorized qualified Luna recovery only; never GPT-4o or Terra.";

const Profitability = ({ finops }: { finops: Finops }) => {
  const mean = (model: string, route: string, effort: string | null) => {
    const row = finops.spendingByModelAndRoute.find(item => item.requested_model === model && item.route === route && item.requested_reasoning === effort);
    return row?.mean_attempt_usd !== undefined && row.mean_attempt_usd !== null ? Number(row.mean_attempt_usd) : null;
  };
  const series = [
    { label: "Historical GPT-4o", model: "gpt-4o", effort: null, safetyModel: "gpt-4o", safetyEffort: null },
    { label: "Luna none with historical safety", model: "gpt-6-luna", effort: "none", safetyModel: "gpt-4o", safetyEffort: null },
    { label: "Luna low with historical safety", model: "gpt-6-luna", effort: "low", safetyModel: "gpt-4o", safetyEffort: null },
    { label: "Luna none throughout (cost only)", model: "gpt-6-luna", effort: "none", safetyModel: "gpt-6-luna", safetyEffort: "none" },
    { label: "Luna low throughout (cost only)", model: "gpt-6-luna", effort: "low", safetyModel: "gpt-6-luna", safetyEffort: "low" },
  ];
  return <details><summary>€3.99 household contribution scenarios</summary>
    <p>Projections use current-month measured attempt means, including evaluation traffic and failures. They are not an equal-image controlled comparison or actual collected profit. An unmeasured safety cost remains unknown. A cost projection does not qualify a classifier.</p>
    <p>Assumptions: 23% VAT, 30% store commission, 1% RevenueCat on gross sales, 3% refunds, USD 1.10 per EUR, and €0.20 combined infrastructure, Free-tier allocation and support per paying household. Actual fees and FX may differ. Unlimited unique paid requests cannot guarantee profitability at arbitrary volume.</p>
    <pre style={{ whiteSpace: "pre-wrap" }}>{show(defaultFinancialAssumptions)}</pre>
    {series.map(item => {
      const initial = mean(item.model, "initial_care", item.effort), refresh = mean(item.model, "care_refresh", item.effort), diagnosis = mean(item.model, "diagnosis", item.effort);
      if (initial === null || refresh === null || diagnosis === null) return <p key={item.label}>{item.label}: generation cost measurements unavailable.</p>;
      const rows = projectHouseholdEconomics({ initial, refresh, diagnosis, safety: mean(item.safetyModel, "image_safety", item.safetyEffort) });
      return <details key={item.label}><summary>{item.label}: 56 scenarios</summary><div style={{ overflowX: "auto" }}><table>
        <thead><tr><th>Scenario</th><th>Scans/month</th><th>Projected AI USD</th><th>Projected contribution EUR</th><th>Break-even scans</th></tr></thead>
        <tbody>{rows.map(row => <tr key={`${row.scenario}:${row.scans}`}><td>{row.label}</td><td>{row.scans}</td><td>{row.aiUsd === null ? "Unknown" : row.aiUsd.toFixed(4)}</td><td>{row.contributionEur === null ? "Unknown" : row.contributionEur.toFixed(2)}</td><td>{row.breakEvenScans ?? "Unknown"}</td></tr>)}</tbody>
      </table></div></details>;
    })}
  </details>;
};

const invoke = async <T,>(body: Record<string, unknown>): Promise<T> => {
  if (!supabase) throw new Error("Owner service unavailable.");
  const { data, error } = await supabase.functions.invoke("ai-owner-control", { body });
  if (error || data?.error) throw new Error("The owner action was not applied. Sign-in, authorization or evidence may be required.");
  return data as T;
};

export const OwnerAiControls = ({ userId }: { userId: string }) => {
  const [owner, setOwner] = useState(false), [state, setState] = useState<State | null>(null), [finops, setFinops] = useState<Finops | null>(null);
  const [busy, setBusy] = useState(false), [status, setStatus] = useState("");
  const [spendingConsent, setSpendingConsent] = useState(false), [riskConsent, setRiskConsent] = useState(false);
  useEffect(() => {
    let current = true;
    setOwner(false); setState(null); setFinops(null);
    void invoke<{ owner: boolean }>({ action: "access" }).then(data => { if (current) setOwner(data.owner === true); }).catch(() => {});
    return () => { current = false; };
  }, [userId]);
  const refresh = async () => {
    const [nextState, nextFinops] = await Promise.all([invoke<{ result: State }>({ action: "state" }), invoke<{ result: Finops }>({ action: "finops" })]);
    setState(nextState.result); setFinops(nextFinops.result);
  };
  const run = async (body?: Record<string, unknown>) => {
    if (busy) return;
    setBusy(true); setStatus("");
    try { if (body) await invoke(body); await refresh(); setStatus(body ? "Action recorded. Review current state below." : "Authoritative ledger loaded."); }
    catch (error) { setStatus(error instanceof Error ? error.message : "Owner service unavailable."); }
    finally { setBusy(false); }
  };
  if (!owner) return null;
  return <details className="menu-section" onToggle={event => { if (event.currentTarget.open && !state && !busy) void run(); }}>
    <summary>Owner AI controls and FinOps</summary>
    <div className="menu-section-body">
      <p>Global owner access. Spending approval, unreviewed risk acceptance and rollout are separate recorded actions.</p>
      <button type="button" className="neutral-action" disabled={busy} onClick={() => void run()}>Refresh ledger and controls</button>
      <p role="status">{status}</p>
      {state && <>
        <h3>Bounded spending proposals</h3>
        <label><input type="checkbox" checked={spendingConsent} onChange={event => setSpendingConsent(event.target.checked)} /> I approve the exact displayed campaign, synthetic accounts and cleanup within its single total cap. No reset, continuation or Terra calls.</label>
        {state.proposals.map(proposal => <article key={proposal.sha256}>
          <p>Up to {proposal.maxAttempts} provider attempts, ${proposal.maxUsd}, {proposal.durationSeconds / 60} minutes. {proposal.approved ? "Approved" : "Not approved"}.</p>
          <details><summary>Exact campaign and hash</summary><pre style={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>{proposal.sha256}{"\n"}{show(proposal.plan)}</pre></details>
          <button type="button" className="neutral-action" disabled={busy || proposal.approved || !spendingConsent}
            onClick={() => void run({ action: "approveCampaign", proposalSha256: proposal.sha256 })}>Approve this spending cap</button>
        </article>)}
        <h3>Unreviewed migration acceptance</h3>
        <p>No independent botanical review has been performed. Engineering checks do not establish botanical non-inferiority.</p>
        <label><input type="checkbox" checked={riskConsent} onChange={event => setRiskConsent(event.target.checked)} /> I accept the displayed limitations and exact configurations, a maximum initial canary of 5%, and explicitly authorize stages 5%, 10%, 25%, 50% and 100% for each listed route only when its evidence gates pass.</label>
        {state.evidence.map(evidence => {
          const primary = routes.map(route => Object.keys(evidence.configurations).find(id => id.startsWith(`${route}:gpt-6-luna:none:`)
            && (route !== "image_safety" || evidence.safety_configuration_ids.includes(id)))
            ?? Object.keys(evidence.configurations).find(id => id.startsWith(`${route}:gpt-6-luna:low:`) && (route !== "image_safety" || evidence.safety_configuration_ids.includes(id)))).filter((id): id is string => Boolean(id));
          const recovery = Object.keys(evidence.configurations).filter(id => id.includes(":gpt-6-luna:low:") && !primary.includes(id)
            && (!id.startsWith("image_safety:") || evidence.safety_configuration_ids.includes(id)));
          return <article key={evidence.sha256}><p>{evidence.limitations}</p>
            <details><summary>Exact evidence, configurations and recovery scope</summary><pre style={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>{show({ evidence, primary, recovery, stages: [5, 10, 25, 50, 100], maximumInitialCanary: 5, rollbackConditions })}</pre></details>
            <button type="button" className="neutral-action" disabled={busy || !riskConsent || primary.length !== 4 || !evidence.engineering_checks_passed || evidence.false_acceptances !== 0 || Number(evidence.new_unknown_exposure) !== 0}
              onClick={() => void run({ action: "acceptRisk", evidenceSha256: evidence.sha256, configurationIds: primary, recoveryConfigurationIds: recovery, approvedStages: [5, 10, 25, 50, 100], rollbackConditions })}>Accept unreviewed migration and authorize listed stages</button>
          </article>;
        })}
        <h3>Rollout and revocation</h3>
        {state.stages.filter(stage => !stage.revoked_at).map(stage => <p key={stage.id}>{stage.route}: {stage.stage}% — {stage.applied_at ? "applied" : "approved, pending evidence"}{" "}
          {!stage.applied_at && <button type="button" className="neutral-action" disabled={busy} onClick={() => void run({ action: "applyStage", grantId: stage.id })}>Apply approved stage</button>}</p>)}
        {state.acceptances.filter(acceptance => !acceptance.revoked_at).map(acceptance => <p key={acceptance.id}>{acceptance.state}{" "}<button type="button" className="danger-action" disabled={busy}
          onClick={() => void run({ action: "revoke", acceptanceId: acceptance.id })}>Revoke and stop this rollout</button></p>)}
        <details><summary>Current routes and cutover</summary><pre style={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>{show({ routes: state.routes, cutover: state.cutover })}</pre></details>
      </>}
      {finops && <>
        <h3>Authoritative AI spending (USD)</h3>
        <p>Unknown exposure, all time: ${Number(finops.unknownExposureAllTime).toFixed(8)}. This is additional to measured spending.</p>
        <div style={{ overflowX: "auto" }}><table><thead><tr><th>Model</th><th>Purpose</th><th>Attempts</th><th>Measured USD</th><th>Reasoning tokens</th><th>p95 ms</th></tr></thead><tbody>
          {finops.spendingByModelAndRoute.map(row => <tr key={`${row.requested_model}:${row.requested_reasoning}:${row.route}`}><td>{row.requested_model} {row.requested_reasoning ?? "legacy"}</td><td>{row.route}</td><td>{row.attempts}</td><td>{row.measured_usd === null ? "Unknown" : Number(row.measured_usd).toFixed(8)}</td><td>{row.reasoning_tokens ?? "Unknown"}</td><td>{row.latency_p95_ms ?? "Unknown"}</td></tr>)}
        </tbody></table></div>
        <details><summary>Household distribution, revenue and monthly trends</summary><pre style={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>{show(finops)}</pre></details>
        {finops.limitations.map(item => <p key={item}>{item}</p>)}
        <Profitability finops={finops} />
      </>}
    </div>
  </details>;
};
