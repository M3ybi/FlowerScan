import { useEffect, useRef, type ReactNode } from "react";
import { lockDialogScroll } from "../lib/dialogScrollLock";

type Props = { children: ReactNode; className: string; labelledBy: string; describedBy?: string; busy?: boolean; onClose: () => void; backdropClassName?: string };

export const ModalDialog = ({ children, className, labelledBy, describedBy, busy = false, onClose, backdropClassName = "" }: Props) => {
  const dialogRef = useRef<HTMLElement>(null);
  const backdropRef = useRef<HTMLDivElement>(null);
  const latest = useRef({ onClose, busy });
  latest.current = { onClose, busy };
  useEffect(() => {
    const dialog = dialogRef.current, backdrop = backdropRef.current;
    if (!dialog || !backdrop) return;
    const owner = dialog.ownerDocument, view = owner.defaultView;
    const previousFocus = owner.activeElement as HTMLElement | null;
    const unlock = lockDialogScroll(owner);
    dialog.focus({ preventScroll: true });
    const topmost = () => {
      const dialogs = owner.querySelectorAll('[role="dialog"][aria-modal="true"]');
      return dialogs[dialogs.length - 1] === dialog;
    };
    const keydown = (event: KeyboardEvent) => {
      if (!topmost()) return;
      if (event.key === "Escape") {
        event.preventDefault();
        if (!latest.current.busy) latest.current.onClose();
      } else if (event.key === "Tab") {
        const fields = Array.from(dialog.querySelectorAll<HTMLElement>('button, [href], input, select, textarea, [tabindex]'))
          .filter(field => field.tabIndex >= 0 && !field.matches(":disabled") && field.getClientRects().length > 0);
        const first = fields[0], last = fields[fields.length - 1];
        if (!first || !last) { event.preventDefault(); dialog.focus(); }
        else if (event.shiftKey && (owner.activeElement === first || !fields.includes(owner.activeElement as HTMLElement))) { event.preventDefault(); last.focus(); }
        else if (!event.shiftKey && (owner.activeElement === last || !fields.includes(owner.activeElement as HTMLElement))) { event.preventDefault(); first.focus(); }
      }
    };
    const resize = () => {
      backdrop.style.height = `${view?.visualViewport?.height ?? view?.innerHeight ?? 0}px`;
      backdrop.style.top = `${view?.visualViewport?.offsetTop ?? 0}px`;
    };
    resize();
    owner.addEventListener("keydown", keydown);
    view?.addEventListener("resize", resize);
    view?.visualViewport?.addEventListener("resize", resize);
    view?.visualViewport?.addEventListener("scroll", resize);
    return () => {
      unlock();
      owner.removeEventListener("keydown", keydown);
      view?.removeEventListener("resize", resize);
      view?.visualViewport?.removeEventListener("resize", resize);
      view?.visualViewport?.removeEventListener("scroll", resize);
      const dialogs = Array.from(owner.querySelectorAll('[role="dialog"][aria-modal="true"]')).filter(node => node !== dialog);
      const remaining = dialogs[dialogs.length - 1];
      if (previousFocus?.isConnected && (!remaining || remaining.contains(previousFocus))) previousFocus.focus({ preventScroll: true });
    };
  }, []);
  return <div ref={backdropRef} className={`modal-backdrop ${backdropClassName}`.trim()} role="presentation">
    <section ref={dialogRef} className={className} role="dialog" aria-modal="true" aria-labelledby={labelledBy}
      aria-describedby={describedBy} aria-busy={busy || undefined} tabIndex={-1}>{children}</section>
  </div>;
};
