import type { LucideIcon } from "lucide-react";

export const SettingsSectionHeader = ({ icon: Icon, title, description, premium = false }: {
  icon: LucideIcon;
  title: string;
  description: string;
  premium?: boolean;
}) => <>
  <span className={`menu-section-summary-icon${premium ? " is-premium" : ""}`} aria-hidden="true"><Icon size={22} /></span>
  <span className="menu-section-summary-copy"><strong>{title}</strong><small>{description}</small></span>
</>;
