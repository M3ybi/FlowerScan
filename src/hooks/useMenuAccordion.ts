import { useEffect, useState } from "react";

const informationSections = ["household", "subscription", "language", "support", "about"] as const;
export type MenuInformationSection = typeof informationSections[number];
const informationSection = (value: string) => informationSections.find(section => section === (value === "settings" ? "language" : value)) ?? null;

// Account is permanent content and never participates in this state.
export const useMenuAccordion = (section: string, isAuthenticated?: boolean) => {
  const [expandedSection, setExpandedSection] = useState<MenuInformationSection | null>(() => informationSection(section));
  useEffect(() => setExpandedSection(informationSection(section)), [section, isAuthenticated]);
  const toggleSection = (next: MenuInformationSection) => setExpandedSection(current => current === next ? null : next);
  return { expandedSection, toggleSection };
};
