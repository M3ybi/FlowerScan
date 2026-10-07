import { Home, LoaderCircle } from "lucide-react";
import type { Household } from "../lib/plantieRepository";

type HouseholdSwitcherProps = {
  households: Household[];
  currentHouseholdId: string | null;
  loading: boolean;
  label: string;
  onSelect: (householdId: string) => void;
  compact?: boolean;
};

export const HouseholdSwitcher = ({ households, currentHouseholdId, loading, label, onSelect, compact = false }: HouseholdSwitcherProps) => (
  <label className={`household-switcher${compact ? " is-compact" : ""}`}>
    <span className="household-switcher-label"><Home size={17} aria-hidden="true" />{label}</span>
    {loading ? <LoaderCircle size={17} className="menu-invite-spinner" aria-hidden="true" /> : null}
    <select aria-label={label} value={currentHouseholdId ?? ""} disabled={loading || !households.length} onChange={(event) => onSelect(event.target.value)}>
      {!currentHouseholdId ? <option value="" disabled>{label}</option> : null}
      {households.map((household) => <option value={household.id} key={household.id}>{household.name}</option>)}
    </select>
  </label>
);
