import { BadgeCheck, FileDown, Mail, Trash2 } from "lucide-react";
import {
  getReleaseHealthChecks,
  legalPageById,
  productionReadinessChecklist,
  securityReviewChecklist,
  storeAssetChecklist,
  storeMetadata,
  summarizeReleaseHealth,
} from "../lib/releaseReadiness.js";
import type { LegalPageId, ReleaseEnvSnapshot } from "../lib/releaseReadiness.js";

const iconByPage: Record<LegalPageId, typeof BadgeCheck> = {
  "delete-account": Trash2,
  privacy: BadgeCheck,
  "subscription-terms": FileDown,
  support: Mail,
  terms: FileDown,
};

export const LegalPageView = ({
  deleteRequestStatus,
  onRequestDeletion,
  pageId,
  requestEmail,
  setRequestEmail,
}: {
  deleteRequestStatus?: string;
  onRequestDeletion?: () => void;
  pageId: LegalPageId;
  requestEmail?: string;
  setRequestEmail?: (value: string) => void;
}) => {
  const page = legalPageById.get(pageId);
  if (!page) {
    return null;
  }

  const Icon = iconByPage[page.id];

  return (
    <section className="release-page" aria-labelledby={`${page.id}-title`}>
      <div className="section-title">
        <Icon size={20} aria-hidden="true" />
        <h1 id={`${page.id}-title`}>{page.title}</h1>
      </div>
      <p>{page.summary}</p>
      {page.sections.map((section) => (
        <section className="release-section" key={section.heading}>
          <h2>{section.heading}</h2>
          {section.body.map((paragraph) => (
            <p key={paragraph}>{paragraph}</p>
          ))}
        </section>
      ))}
      {page.id === "delete-account" ? (
        <form
          className="release-form"
          onSubmit={(event) => {
            event.preventDefault();
            onRequestDeletion?.();
          }}
        >
          <label className="field">
            <span>Account email or user ID</span>
            <input
              type="text"
              value={requestEmail ?? ""}
              maxLength={120}
              placeholder="you@example.com"
              onChange={(event) => setRequestEmail?.(event.target.value)}
            />
          </label>
          <button className="danger-action" type="submit">
            Request account deletion review
          </button>
          {deleteRequestStatus ? <p className="report-status">{deleteRequestStatus}</p> : null}
        </form>
      ) : null}
    </section>
  );
};

export const ReleaseChecklistPage = () => (
  <section className="release-page" aria-labelledby="release-checklist-title">
    <div className="section-title">
      <BadgeCheck size={20} aria-hidden="true" />
      <h1 id="release-checklist-title">Production Readiness</h1>
    </div>
    <p>Store-readiness checklist for Plantie beta and release review.</p>
    <section className="release-section">
      <h2>Manual store setup</h2>
      <ul>{productionReadinessChecklist.map((item) => <li key={item}>{item}</li>)}</ul>
    </section>
    <section className="release-section">
      <h2>Store assets</h2>
      <ul>{storeAssetChecklist.map((item) => <li key={item}>{item}</li>)}</ul>
    </section>
    <section className="release-section">
      <h2>Security review</h2>
      <ul>{securityReviewChecklist.map((item) => <li key={item}>{item}</li>)}</ul>
    </section>
    <section className="release-section">
      <h2>App metadata</h2>
      <p>{storeMetadata.shortDescription}</p>
      <p>{storeMetadata.longDescription}</p>
      <p>Keywords: {storeMetadata.keywords.join(", ")}</p>
      <ul>{storeMetadata.features.map((item) => <li key={item}>{item}</li>)}</ul>
    </section>
    <section className="release-section">
      <h2>Beta tester instructions</h2>
      <ol>{storeMetadata.betaTesterInstructions.map((item) => <li key={item}>{item}</li>)}</ol>
    </section>
  </section>
);

export const HealthPage = ({ backendStatus, env }: { backendStatus?: string; env: ReleaseEnvSnapshot }) => {
  const checks = getReleaseHealthChecks(env);
  const summary = summarizeReleaseHealth(checks);

  return (
    <section className="release-page" aria-labelledby="health-title">
      <div className="section-title">
        <BadgeCheck size={20} aria-hidden="true" />
        <h1 id="health-title">Release Health</h1>
      </div>
      <p>Public-safe diagnostics. This page reports presence only and never prints secret values.</p>
      <div className="migration-preview-grid">
        {checks.map((check) => (
          <span key={check.key}>
            {check.label}: {check.ok ? "present" : "missing"}
          </span>
        ))}
        <span>Backend health endpoint: /.netlify/functions/health</span>
        <span>Delete request endpoint: /.netlify/functions/delete-account-request</span>
        <span>Backend reachability: {backendStatus ?? "not checked"}</span>
      </div>
      <p className="report-status">
        {summary.ok ? "Required public config is present." : `Missing public config: ${summary.missing.join(", ")}`}
      </p>
    </section>
  );
};
