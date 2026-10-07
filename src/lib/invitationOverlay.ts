type Rectangle = { left: number; right: number; top: number; bottom: number };

export const invitationPopoverPosition = (anchor: Rectangle, panel: { width: number; height: number }, viewport: { width: number; height: number }) => {
  const margin = 16;
  const gap = 12;
  const maxHeight = Math.max(0, viewport.height - margin * 2);
  const height = Math.min(panel.height, maxHeight);
  const below = anchor.bottom + gap;
  const above = anchor.top - gap - height;
  const preferredTop = below + height <= viewport.height - margin || above < margin ? below : above;
  return {
    left: Math.max(margin, Math.min(anchor.right - panel.width, viewport.width - panel.width - margin)),
    top: Math.max(margin, Math.min(preferredTop, viewport.height - height - margin)),
    maxHeight,
  };
};

const focusableElements = (dialog: HTMLElement) => Array.from(dialog.querySelectorAll<HTMLElement>(
  'button, [href], input, select, textarea, [tabindex]',
)).filter((element) => element.tabIndex >= 0 && !element.matches(":disabled") && !element.closest("[hidden], [inert]") && element.getClientRects().length > 0);

// Document listeners also catch focus moved outside by another component or keyboard shortcut.
export const installInvitationOverlayInteractions = ({ dialog, anchor, onClose, isBusy }: {
  dialog: HTMLElement; anchor: HTMLElement | null; onClose: () => void; isBusy: () => boolean;
}) => {
  const ownerDocument = dialog.ownerDocument;
  const previousFocus = ownerDocument.activeElement as HTMLElement | null;
  const handlePointerDown = (event: Event) => {
    const target = event.target as Node | null;
    if (!target || dialog.contains(target) || anchor?.contains(target) || isBusy()) return;
    onClose();
  };
  const handleKeyDown = (event: KeyboardEvent) => {
    if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      if (!isBusy()) onClose();
      return;
    }
    if (event.key !== "Tab") return;
    const elements = focusableElements(dialog);
    const first = elements[0];
    const last = elements[elements.length - 1];
    const active = ownerDocument.activeElement;
    if (!first || !last) {
      event.preventDefault();
      dialog.focus({ preventScroll: true });
    } else if (event.shiftKey && (active === first || !elements.includes(active as HTMLElement))) {
      event.preventDefault();
      last.focus({ preventScroll: true });
    } else if (!event.shiftKey && (active === last || !elements.includes(active as HTMLElement))) {
      event.preventDefault();
      first.focus({ preventScroll: true });
    }
  };
  const handleFocusIn = (event: FocusEvent) => {
    if (event.target && !dialog.contains(event.target as Node)) dialog.focus({ preventScroll: true });
  };
  const capture = { capture: true };
  ownerDocument.addEventListener("pointerdown", handlePointerDown, capture);
  ownerDocument.addEventListener("keydown", handleKeyDown, capture);
  ownerDocument.addEventListener("focusin", handleFocusIn, capture);
  dialog.focus({ preventScroll: true });
  return () => {
    ownerDocument.removeEventListener("pointerdown", handlePointerDown, capture);
    ownerDocument.removeEventListener("keydown", handleKeyDown, capture);
    ownerDocument.removeEventListener("focusin", handleFocusIn, capture);
    const returnFocus = anchor?.isConnected ? anchor : previousFocus;
    if (returnFocus?.isConnected) returnFocus.focus({ preventScroll: true });
  };
};
