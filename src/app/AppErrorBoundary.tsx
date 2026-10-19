import { Component, type ReactNode } from "react";
import { browserStorage } from "../lib/browserStorage.js";
import { createTranslator } from "../lib/i18n.js";
import { readStoredLanguage } from "../lib/onboarding.js";

type Props = { children: ReactNode; resetKey?: string; t?: ReturnType<typeof createTranslator>; canReturnToPlants?: boolean };

export class AppErrorBoundary extends Component<Props, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  componentDidCatch() { console.error("Application render failed", { code: "APP_RENDER_FAILED" }); }
  componentDidUpdate(previous: Props) {
    if (this.state.failed && previous.resetKey !== this.props.resetKey) this.setState({ failed: false });
  }
  render() {
    if (!this.state.failed) return this.props.children;
    const t = this.props.t ?? createTranslator(readStoredLanguage(browserStorage));
    return <main className="app-shell"><section className="access-card" role="alert">
      <h1>{t("app.unavailableTitle")}</h1><p>{t("app.unavailableBody")}</p>
      {this.props.canReturnToPlants ? <a className="primary-action" href="#/">{t("nav.plants")}</a> : null}
      <button type="button" className="neutral-action" onClick={() => window.location.reload()}>{t("app.reload")}</button>
    </section></main>;
  }
}
