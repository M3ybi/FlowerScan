import { X } from "lucide-react";
import type { ReactNode } from "react";
import { ModalDialog } from "./ModalDialog";

type Props = {
  id: string;
  title: string;
  description: string;
  icon: ReactNode;
  closeLabel: string;
  busy?: boolean;
  onClose: () => void;
  children: ReactNode;
};

export const PlantActionModal = ({ id, title, description, icon, closeLabel, busy = false, onClose, children }: Props) => {
  return <ModalDialog className="diagnosis-modal plant-action-modal" backdropClassName="plant-action-backdrop"
    labelledBy={`${id}-title`} describedBy={`${id}-description`} busy={busy} onClose={onClose}>
    <button className="modal-close" type="button" disabled={busy} onClick={onClose} aria-label={closeLabel}>
      <X size={20} aria-hidden="true" />
    </button>
    <div className="section-title">{icon}<h2 id={`${id}-title`}>{title}</h2></div>
    <p id={`${id}-description`} className="plant-action-description">{description}</p>
    {children}
  </ModalDialog>;
};

export const PlantImagePreview = ({ src, alt }: { src: string; alt: string }) =>
  <img className="diagnosis-preview plant-image-preview" src={src} alt={alt} />;

export const PlantFormStatus = ({ children }: { children: ReactNode }) =>
  children ? <p className="care-preview-status plant-form-status" role="status" aria-live="polite">{children}</p> : null;
