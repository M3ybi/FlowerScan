import { Suspense, type ReactNode } from "react";
import type { createTranslator } from "../lib/i18n";
import { AppErrorBoundary } from "./AppErrorBoundary";

export const FeatureBoundary = ({ children, label, resetKey, t }: { children: ReactNode; label: string; resetKey: string; t: ReturnType<typeof createTranslator> }) => (
  <AppErrorBoundary resetKey={resetKey} t={t} canReturnToPlants><Suspense fallback={<main className="app-shell"><section className="household-loading-panel" role="status" aria-busy="true">
    <span className="loading-wheel" aria-hidden="true" /><p>{label}</p>
  </section></main>}>
    {children}
  </Suspense></AppErrorBoundary>
);
