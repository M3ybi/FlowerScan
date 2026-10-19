import { lazy, type ComponentProps } from "react";
import { DashboardPage } from "../features/dashboard/components/DashboardPage";
import { FeatureBoundary } from "./FeatureBoundary";
import type { AppRoute } from "./routes";
const PlantDetailsPage = lazy(() => import("../features/plants/components/PlantDetailsPage").then(module => ({ default: module.PlantDetailsPage })));
const SettingsPage = lazy(() => import("../features/settings/components/SettingsPage").then(module => ({ default: module.SettingsPage })));
const DiagnosisPage = lazy(() => import("../features/diagnosis/components/DiagnosisPage").then(module => ({ default: module.DiagnosisPage })));
const QrPage = lazy(() => import("../features/qr/components/QrPage").then(module => ({ default: module.QrPage })));

type Shared = Pick<ComponentProps<typeof DashboardPage>, "t" | "renderHeroActions" | "renderHouseholdSheet" | "openAddPlantFromMobileNav">;
type Props = {
  route: AppRoute; shared: Shared;
  detail: Omit<ComponentProps<typeof PlantDetailsPage>, keyof Shared | "route">;
  menu: Omit<ComponentProps<typeof SettingsPage>, keyof Shared | "route">;
  diagnose: Omit<ComponentProps<typeof DiagnosisPage>, keyof Shared | "route">;
  qr: Omit<ComponentProps<typeof QrPage>, keyof Shared | "route">;
  dashboard: Omit<ComponentProps<typeof DashboardPage>, keyof Shared | "route">;
};

export const AppRouter = (props: Props) => {
  if (props.route.page === "detail") return <FeatureBoundary resetKey="detail" t={props.shared.t} label={props.shared.t("auth.loading")}><PlantDetailsPage {...props.shared} {...props.detail} route={props.route} /></FeatureBoundary>;
  if (props.route.page === "menu") return <FeatureBoundary resetKey="menu" t={props.shared.t} label={props.shared.t("auth.loading")}><SettingsPage {...props.shared} {...props.menu} route={props.route} /></FeatureBoundary>;
  if (props.route.page === "diagnose") return <FeatureBoundary resetKey="diagnose" t={props.shared.t} label={props.shared.t("auth.loading")}><DiagnosisPage {...props.shared} {...props.diagnose} route={props.route} /></FeatureBoundary>;
  if (props.route.page === "qr") return <FeatureBoundary resetKey="qr" t={props.shared.t} label={props.shared.t("auth.loading")}><QrPage {...props.shared} {...props.qr} route={props.route} /></FeatureBoundary>;
  return <DashboardPage {...props.shared} {...props.dashboard} />;
};
