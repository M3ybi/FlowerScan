import { ArrowLeft } from "lucide-react";

type Props = {
  href: "#/" | "#/menu";
  label: string;
};

// Explicit parent destinations also work after a refresh or an external deep link.
export const BackLink = ({ href, label }: Props) => (
  <a className="icon-link floating-back-link" href={href} aria-label={label}>
    <ArrowLeft size={22} aria-hidden="true" />
  </a>
);
