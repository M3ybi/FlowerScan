import { useSyncExternalStore } from "react";
import { browserPersistence, browserStorage } from "../lib/browserStorage";
import { readStoredLanguage } from "../lib/onboarding";

const messages = {
  en: "Browser storage is unavailable or full. Local changes are kept for this session only. Keep this page open until you can save them.",
  sk: "Úložisko prehliadača je nedostupné alebo plné. Lokálne zmeny zostávajú iba v tejto relácii. Nezatváraj stránku, kým ich nebude možné uložiť.",
  de: "Der Browserspeicher ist nicht verfügbar oder voll. Lokale Änderungen bleiben nur für diese Sitzung erhalten. Lass diese Seite geöffnet, bis du sie speichern kannst.",
  fr: "Le stockage du navigateur est indisponible ou plein. Les modifications locales restent uniquement dans cette session. Garde cette page ouverte jusqu’à leur enregistrement.",
  es: "El almacenamiento del navegador no está disponible o está lleno. Los cambios locales se conservan solo en esta sesión. Mantén esta página abierta hasta poder guardarlos.",
};

export const StorageNotice = () => {
  const failed = useSyncExternalStore(browserPersistence.subscribe, browserPersistence.hasFailure, () => false);
  return failed ? <p className="report-status" role="alert">{messages[readStoredLanguage(browserStorage) ?? "en"]}</p> : null;
};
