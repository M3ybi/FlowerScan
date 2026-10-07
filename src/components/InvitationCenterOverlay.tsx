import { useEffect, useRef, useState, type CSSProperties, type ReactNode, type RefObject } from "react";
import { createPortal } from "react-dom";
import { ArrowLeft, X } from "lucide-react";
import { installInvitationOverlayInteractions, invitationPopoverPosition } from "../lib/invitationOverlay";

export type InvitationCenterOverlayProps = {
  anchorRef: RefObject<HTMLButtonElement>;
  mode: "inbox" | "details";
  title: string;
  onClose: () => void;
  children: ReactNode;
  busy?: boolean;
  onBack?: () => void;
  closeLabel?: string;
  backLabel?: string;
};

export const InvitationCenterOverlay = ({ anchorRef, mode, title, onClose, children, busy = false, onBack, closeLabel = "Close", backLabel = "Back to invitations" }: InvitationCenterOverlayProps) => {
  const dialogRef = useRef<HTMLDivElement>(null);
  const latest = useRef({ onClose, busy });
  latest.current = { onClose, busy };
  const [position, setPosition] = useState<ReturnType<typeof invitationPopoverPosition> | null>(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    const ownerDocument = dialog.ownerDocument;
    const previousOverflow = ownerDocument.body.style.overflow;
    ownerDocument.body.style.overflow = "hidden";
    const removeInteractions = installInvitationOverlayInteractions({
      dialog, anchor: anchorRef.current, onClose: () => latest.current.onClose(), isBusy: () => latest.current.busy,
    });
    return () => {
      ownerDocument.body.style.overflow = previousOverflow;
      removeInteractions();
    };
  }, [anchorRef]);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    dialog.focus({ preventScroll: true });
    if (mode !== "inbox") return;
    const view = dialog.ownerDocument.defaultView;
    if (!view) return;
    const updatePosition = () => {
      const anchor = anchorRef.current?.getBoundingClientRect();
      const bounds = dialog.getBoundingClientRect();
      const viewport = { width: view.innerWidth, height: view.innerHeight };
      const fallback = { left: viewport.width - 16, right: viewport.width - 16, top: 16, bottom: 16 };
      setPosition(invitationPopoverPosition(anchor ?? fallback, bounds, viewport));
    };
    updatePosition();
    view.addEventListener("resize", updatePosition);
    view.addEventListener("scroll", updatePosition, true);
    view.visualViewport?.addEventListener("resize", updatePosition);
    const observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(updatePosition);
    observer?.observe(dialog);
    return () => {
      view.removeEventListener("resize", updatePosition);
      view.removeEventListener("scroll", updatePosition, true);
      view.visualViewport?.removeEventListener("resize", updatePosition);
      observer?.disconnect();
    };
  }, [anchorRef, mode, title]);

  if (typeof document === "undefined") return null;
  const positionStyle = position ? {
    "--invitation-left": `${position.left}px`, "--invitation-top": `${position.top}px`, "--invitation-max-height": `${position.maxHeight}px`,
  } as CSSProperties : undefined;
  return createPortal(<div className="invitation-center-overlay" data-mode={mode}>
    <div ref={dialogRef} id="household-invitation-center" className="invitation-center-dialog" role="dialog" aria-modal="true" aria-label={title} aria-busy={busy} tabIndex={-1} style={positionStyle}>
      <div className="invitation-center-sheet-handle" aria-hidden="true" />
      {mode === "details" ? <div className="invitation-center-chrome">
        {onBack ? <button className="invitation-center-back" type="button" disabled={busy} onClick={onBack}><ArrowLeft size={18} aria-hidden="true" />{backLabel}</button> : <span />}
        <button className="invitation-inbox-close" type="button" disabled={busy} aria-label={closeLabel} onClick={onClose}><X size={20} aria-hidden="true" /></button>
      </div> : null}
      {children}
    </div>
  </div>, document.body);
};
