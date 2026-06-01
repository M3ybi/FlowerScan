import { CloudUpload } from "lucide-react";
import { useMemo, useState } from "react";
import type { Flower } from "../data/flowers";
import type { FlowerRecords } from "../hooks/useFlowerRecords";
import {
  detectLegacyHouseholdState,
  migrateLegacyHouseholdToSupabase,
  previewLegacyMigration,
  validateMigrationResult,
} from "../lib/legacyMigrationService";
import type { LegacyMigrationResult, LegacyReportSettings } from "../lib/legacyMigrationService";
import type { PlantDiagnosticEntry } from "../utils/diagnostics";
import type { HouseholdSession } from "../utils/household";

type LegacyMigrationCardProps = {
  activeHousehold: HouseholdSession | null;
  allFlowers: Flower[];
  customFlowers: Flower[];
  diagnostics: PlantDiagnosticEntry[];
  isAuthenticated: boolean;
  records: FlowerRecords;
  removedFlowerIds: string[];
  reportSettings: LegacyReportSettings;
};

export const LegacyMigrationCard = ({
  activeHousehold,
  allFlowers,
  customFlowers,
  diagnostics,
  isAuthenticated,
  records,
  removedFlowerIds,
  reportSettings,
}: LegacyMigrationCardProps) => {
  const [confirmed, setConfirmed] = useState(false);
  const [isMigrating, setIsMigrating] = useState(false);
  const [result, setResult] = useState<LegacyMigrationResult | null>(null);
  const [status, setStatus] = useState("");

  const state = useMemo(
    () =>
      detectLegacyHouseholdState({
        activeHousehold,
        allFlowers,
        customFlowers,
        diagnostics,
        records,
        removedFlowerIds,
        reportSettings,
      }),
    [activeHousehold, allFlowers, customFlowers, diagnostics, records, removedFlowerIds, reportSettings],
  );
  const preview = useMemo(() => previewLegacyMigration(state), [state]);
  const validation = result ? validateMigrationResult(result) : null;

  const runMigration = async () => {
    if (!confirmed || isMigrating) {
      return;
    }

    try {
      setIsMigrating(true);
      setStatus("Importujem legacy domácnosť do Supabase účtu...");
      const migrationResult = await migrateLegacyHouseholdToSupabase(state);
      setResult(migrationResult);
      const migrationValidation = validateMigrationResult(migrationResult);
      setStatus(migrationValidation.isValid ? "Import je dokončený. Legacy úložisko zostáva primárne." : "Import skončil s upozorneniami.");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Import do Supabase zlyhal. Legacy dáta ostali nezmenené.");
    } finally {
      setIsMigrating(false);
    }
  };

  return (
    <section className="migration-card" aria-labelledby="legacy-migration-title">
      <div className="section-title">
        <CloudUpload size={18} aria-hidden="true" />
        <h2 id="legacy-migration-title">Import current Plantie household to cloud account</h2>
      </div>
      <p>
        Import skopíruje aktuálnu legacy domácnosť do Supabase. Lokálne dáta, Netlify Blob sync a household link ostávajú
        nezmenené.
      </p>

      {!isAuthenticated ? (
        <p className="report-status">Najprv sa prihlás. Import používa tvoj Supabase účet a RLS pravidlá.</p>
      ) : (
        <>
          <div className="migration-preview-grid">
            <span>Built-in rastliny: {preview.builtInPlants}</span>
            <span>Custom rastliny: {preview.customPlants}</span>
            <span>Záznamy starostlivosti: {preview.careRecords}</span>
            <span>Diagnostiky: {preview.diagnostics}</span>
            <span>Skryté rastliny: {preview.hiddenPlants}</span>
            <span>Report email: {preview.reportSettings.hasRecipientEmail ? "áno" : "nie"}</span>
          </div>
          {preview.unsupportedItems.length > 0 ? (
            <ul className="migration-warning-list">
              {preview.unsupportedItems.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          ) : null}
          <label className="toggle-field migration-confirm">
            <span>Rozumiem, že legacy úložisko ostáva primárne a nič sa nemaže.</span>
            <input type="checkbox" checked={confirmed} onChange={(event) => setConfirmed(event.target.checked)} />
          </label>
          <button className="primary-action" type="button" disabled={!confirmed || isMigrating} onClick={() => void runMigration()}>
            {isMigrating ? "Importujem..." : "Importovať do Supabase"}
          </button>
        </>
      )}

      {status ? <p className="report-status">{status}</p> : null}
      {result ? (
        <div className="migration-result">
          <strong>Výsledok importu</strong>
          <span>Vytvorené rastliny: {result.createdPlants}</span>
          <span>Opätovne použité rastliny: {result.reusedPlants}</span>
          <span>Migrované záznamy: {result.updatedRecords}</span>
          <span>Migrované diagnostiky: {result.diagnosticsMigrated}</span>
          <span>Image fallback: {result.imageFallbacks}</span>
          {validation?.warnings.map((warning) => <small key={warning}>{warning}</small>)}
        </div>
      ) : null}
    </section>
  );
};
