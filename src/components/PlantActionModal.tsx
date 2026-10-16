import { useEffect, useRef, type ReactNode } from "react";
import { X } from "lucide-react";

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
  const dialogRef = useRef<HTMLElement>(null);
  const backdropRef = useRef<HTMLDivElement>(null);
  const latest = useRef({ onClose, busy });
  latest.current = { onClose, busy };
  useEffect(() => {
    const dialog = dialogRef.current;
    const backdrop = backdropRef.current;
    if (!dialog || !backdrop) return;
    const owner = dialog.ownerDocument;
    const view = owner.defaultView;
    const previousFocus = owner.activeElement as HTMLElement | null;
    const previousOverflow = owner.body.style.overflow;
    owner.body.style.overflow = "hidden";
    dialog.focus({ preventScroll: true });
    const isTopmost = () => {
      const dialogs = owner.querySelectorAll('[role="dialog"][aria-modal="true"]');
      return dialogs[dialogs.length - 1] === dialog;
    };
    const keydown = (event: KeyboardEvent) => {
      if (!isTopmost()) return;
      if (event.key === "Escape") {
        event.preventDefault();
        if (!latest.current.busy) latest.current.onClose();
      } else if (event.key === "Tab") {
        const fields = Array.from(dialog.querySelectorAll<HTMLElement>('button, [href], input, select, textarea, [tabindex]'))
          .filter(field => field.tabIndex >= 0 && !field.matches(":disabled") && field.getClientRects().length > 0);
        const first = fields[0], last = fields[fields.length - 1];
        if (!first || !last) { event.preventDefault(); dialog.focus(); }
        else if (event.shiftKey && (owner.activeElement === first || !dialog.contains(owner.activeElement))) {
          event.preventDefault(); last.focus();
        } else if (!event.shiftKey && (owner.activeElement === last || !dialog.contains(owner.activeElement))) {
          event.preventDefault(); first.focus();
        }
      }
    };
    const resize = () => {
      const viewport = view?.visualViewport;
      backdrop.style.height = `${viewport?.height ?? view?.innerHeight ?? 0}px`;
      backdrop.style.top = `${viewport?.offsetTop ?? 0}px`;
    };
    resize();
    owner.addEventListener("keydown", keydown);
    view?.addEventListener("resize", resize);
    view?.visualViewport?.addEventListener("resize", resize);
    view?.visualViewport?.addEventListener("scroll", resize);
    return () => {
      owner.body.style.overflow = previousOverflow;
      owner.removeEventListener("keydown", keydown);
      view?.removeEventListener("resize", resize);
      view?.visualViewport?.removeEventListener("resize", resize);
      view?.visualViewport?.removeEventListener("scroll", resize);
      if (previousFocus?.isConnected) previousFocus.focus({ preventScroll: true });
    };
  }, []);
  return <div ref={backdropRef} className="modal-backdrop plant-action-backdrop" role="presentation">
    <section ref={dialogRef} className="diagnosis-modal plant-action-modal" role="dialog" aria-modal="true"
      aria-labelledby={`${id}-title`} aria-describedby={`${id}-description`} tabIndex={-1}>
      <button className="modal-close" type="button" disabled={busy} onClick={onClose} aria-label={closeLabel}>
        <X size={20} aria-hidden="true" />
      </button>
      <div className="section-title">{icon}<h2 id={`${id}-title`}>{title}</h2></div>
      <p id={`${id}-description`} className="plant-action-description">{description}</p>
      {children}
    </section>
  </div>;
};

export const PlantImagePreview = ({ src, alt }: { src: string; alt: string }) =>
  <img className="diagnosis-preview plant-image-preview" src={src} alt={alt} />;

export const PlantFormStatus = ({ children }: { children: ReactNode }) =>
  children ? <p className="care-preview-status plant-form-status" role="status" aria-live="polite">{children}</p> : null;
