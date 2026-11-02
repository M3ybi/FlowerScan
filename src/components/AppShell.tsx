import { useEffect, useRef, useState, type ReactNode } from "react";
import type { AppRoute } from "../app/routes";
import type { createTranslator } from "../lib/i18n";
import { MobileBottomNav, type AppNavigationPage } from "./AppNavigation";

export const navigationPageForRoute = (route: AppRoute): AppNavigationPage => {
  if (route.page === "detail" || route.page === "dashboard") return "plants";
  if (route.page === "diagnose" || route.page === "qr") return route.page;
  return "menu";
};

type Props = {
  enabled: boolean;
  route: AppRoute;
  t: ReturnType<typeof createTranslator>;
  onAddPlant: () => void;
  children: ReactNode;
  addPlantModal: ReactNode;
};

export const AppShell = ({ enabled, route, t, onAddPlant, children, addPlantModal }: Props) => {
  const shellRef = useRef<HTMLDivElement>(null);
  const [focusedField, setFocusedField] = useState<HTMLElement | null>(null);

  useEffect(() => {
    if (!enabled || !focusedField || focusedField.closest('[role="dialog"]') || !window.matchMedia("(max-width: 780px)").matches) return;
    let frame = 0;
    const keepFieldVisible = () => {
      window.cancelAnimationFrame(frame);
      frame = window.requestAnimationFrame(() => {
        const navigation = shellRef.current?.querySelector(".mobile-bottom-nav");
        if (!navigation || !focusedField.isConnected || document.activeElement !== focusedField) return;
        const field = focusedField.getBoundingClientRect();
        const viewport = window.visualViewport;
        const visibleTop = viewport?.offsetTop ?? 0;
        const visibleBottom = Math.min(navigation.getBoundingClientRect().top, visibleTop + (viewport?.height ?? window.innerHeight));
        if (field.bottom > visibleBottom - 12 || field.top < visibleTop + 12) {
          focusedField.scrollIntoView({ block: "center", behavior: "instant" });
        }
      });
    };
    // WebKit can focus a field behind fixed navigation. Listen only while an
    // editable field is focused, including the later on-screen keyboard resize.
    keepFieldVisible();
    window.addEventListener("resize", keepFieldVisible);
    window.visualViewport?.addEventListener("resize", keepFieldVisible);
    return () => {
      window.cancelAnimationFrame(frame);
      window.removeEventListener("resize", keepFieldVisible);
      window.visualViewport?.removeEventListener("resize", keepFieldVisible);
    };
  }, [enabled, focusedField]);

  return enabled ? (
    <div ref={shellRef} className="authenticated-app-shell" onBlurCapture={() => setFocusedField(null)}
      onFocusCapture={event => setFocusedField(event.target.matches('input:not([type="checkbox"]):not([type="radio"]):not([type="file"]):not([type="button"]):not([type="submit"]), textarea, select, [contenteditable="true"]') ? event.target : null)}>
      {children}
      <MobileBottomNav currentPage={navigationPageForRoute(route)} onAddPlant={onAddPlant} t={t} />
      {addPlantModal}
    </div>
  ) : <>{children}</>;
};
