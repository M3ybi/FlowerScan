import {
  ArrowLeft,
  BadgeCheck,
  CalendarDays,
  Check,
  Droplets,
  FileDown,
  Home,
  Leaf,
  Mail,
  Pencil,
  Plus,
  Printer,
  QrCodeIcon,
  Search,
  Send,
  Sprout,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import type { FormEvent } from "react";
import { QrCode } from "./components/QrCode";
import { flowers as builtInFlowers } from "./data/flowers";
import type { Flower } from "./data/flowers";
import { wateringIntervalsDays } from "./data/wateringIntervals";
import { useCustomFlowers } from "./hooks/useCustomFlowers";
import { useFlowerRecords } from "./hooks/useFlowerRecords";
import type { FlowerRecords } from "./hooks/useFlowerRecords";
import { createCustomFlowerId, createFallbackCare, fetchGeneratedCare, resizeImageFileToDataUrl } from "./utils/customFlower";
import { daysSince, formatDate, formatElapsedDays } from "./utils/dates";
import { flowerPath } from "./utils/links";
import { exportQrLabelsPdf, validateQrLabelLayout, createQrLabelLayout, qrLabelSpec } from "./utils/qrPdf";
import { createMailtoReportUrl, getWateringReportRows, reportThresholdPercent } from "./utils/report";
import { getWateringProgress } from "./utils/watering";

const todayIsoDate = () => {
  const today = new Date();
  const month = String(today.getMonth() + 1).padStart(2, "0");
  const day = String(today.getDate()).padStart(2, "0");

  return `${today.getFullYear()}-${month}-${day}`;
};

const normalizeBaseUrl = (value: string) => {
  const trimmed = value.trim();
  if (!trimmed) {
    return "";
  }

  return trimmed.endsWith("/") ? trimmed.slice(0, -1) : trimmed;
};

const currentBaseUrl = () => {
  const { origin, pathname } = window.location;
  return `${origin}${pathname}`;
};

const publicFlowerUrl = (baseUrl: string, flowerId: string) =>
  `${normalizeBaseUrl(baseUrl)}${flowerPath(flowerId, true)}`;

const identificationLabel = {
  confident: "ID overené z fotky",
  likely: "Pravdepodobné ID",
  "needs-confirmation": "ID treba potvrdiť",
};

const getWaterIconLevel = (flowerId: string) => {
  const interval = wateringIntervalsDays[flowerId] ?? 7;

  if (interval >= 25) {
    return "low";
  }

  if (interval <= 5) {
    return "high";
  }

  return "medium";
};

const getCarePillVisual = (label: string, value: string, flowerId: string) => {
  const normalizedLabel = label.toLowerCase();
  const normalizedValue = value.toLowerCase();

  if (normalizedLabel.includes("svetlo")) {
    const strength = normalizedValue.includes("slnko") || normalizedValue.includes("veľa") ? "full" : "half";

    return (
      <span className={`pill-visual pill-sun pill-sun-${strength}`} aria-hidden="true">
        <span />
      </span>
    );
  }

  if (normalizedLabel.includes("zálievka")) {
    const level = getWaterIconLevel(flowerId);

    return (
      <span className={`pill-visual pill-water pill-water-${level}`} aria-hidden="true">
        <span />
        <span />
        <span />
      </span>
    );
  }

  if (normalizedLabel.includes("vlhkosť")) {
    const level =
      normalizedValue.includes("vyšš") || normalizedValue.includes("vlhk")
        ? "high"
        : normalizedValue.includes("nízka")
          ? "low"
          : "medium";

    return (
      <span className={`pill-visual pill-humidity pill-humidity-${level}`} aria-hidden="true">
        <span />
        <span />
        <span />
      </span>
    );
  }

  if (normalizedLabel.includes("náročnosť")) {
    const level = normalizedValue.includes("veľmi") || normalizedValue.includes("ľahk")
      ? "easy"
      : normalizedValue.includes("nároč")
        ? "hard"
        : "medium";

    return (
      <span className={`pill-visual pill-difficulty pill-difficulty-${level}`} aria-hidden="true">
        <span />
        <span />
        <span />
      </span>
    );
  }

  return (
    <span className="pill-visual pill-pot" aria-hidden="true">
      <span />
    </span>
  );
};

const useHashRoute = () => {
  const [hash, setHash] = useState(() => window.location.hash || "#/");

  useEffect(() => {
    const handleHashChange = () => setHash(window.location.hash || "#/");
    window.addEventListener("hashchange", handleHashChange);
    return () => window.removeEventListener("hashchange", handleHashChange);
  }, []);

  const match = hash.match(/^#\/flower\/([^/?]+)(?:\?(.+))?$/);
  if (match) {
    const params = new URLSearchParams(match[2] ?? "");
    return { page: "detail" as const, flowerId: decodeURIComponent(match[1]), scan: params.get("scan") === "1" };
  }

  if (hash === "#/qr") {
    return { page: "qr" as const };
  }

  if (hash === "#/report") {
    return { page: "report" as const };
  }

  return { page: "dashboard" as const };
};

export const App = () => {
  const route = useHashRoute();
  const { addCustomFlower, customFlowers } = useCustomFlowers();
  const allFlowers = useMemo(() => [...customFlowers, ...builtInFlowers], [customFlowers]);
  const flowerById = useMemo(() => new Map(allFlowers.map((flower) => [flower.id, flower])), [allFlowers]);
  const { records, replaceRecords, updateRecord } = useFlowerRecords(allFlowers);
  const [query, setQuery] = useState("");
  const [baseUrl, setBaseUrl] = useState(() => currentBaseUrl());
  const [reportRecipient, setReportRecipient] = useState(() => window.localStorage.getItem("flowscan-report-recipient-v1") ?? "");
  const [reportStatus, setReportStatus] = useState("Denný report sa odosiela o 19:00, keď je aplikácia nasadená cez Netlify.");
  const [cloudSyncEnabled, setCloudSyncEnabled] = useState(false);
  const [cloudSyncReady, setCloudSyncReady] = useState(false);
  const [qrExportStatus, setQrExportStatus] = useState("");
  const [newPlantName, setNewPlantName] = useState("");
  const [newPlantImageFile, setNewPlantImageFile] = useState<File | null>(null);
  const [newPlantStatus, setNewPlantStatus] = useState("");
  const [isAddingPlant, setIsAddingPlant] = useState(false);

  useEffect(() => {
    window.scrollTo({ top: 0, left: 0 });
  }, [route.page, "flowerId" in route ? route.flowerId : ""]);

  useEffect(() => {
    let cancelled = false;

    const loadCloudState = async () => {
      try {
        const [settingsResponse, recordsResponse] = await Promise.all([
          fetch("/.netlify/functions/report-settings"),
          fetch("/.netlify/functions/plant-records"),
        ]);

        if (!settingsResponse.ok || !recordsResponse.ok) {
          throw new Error("Cloud sync is not available on this host.");
        }

        const settings = (await settingsResponse.json()) as { recipient?: string };
        const cloudRecords = (await recordsResponse.json()) as { records?: FlowerRecords };

        if (cancelled) {
          return;
        }

        setReportRecipient(typeof settings.recipient === "string" ? settings.recipient : "");
        if (cloudRecords.records) {
          replaceRecords(cloudRecords.records);
        }
        setCloudSyncEnabled(true);
        setReportStatus("Cloud sync je aktívny. Denný email sa odošle o 19:00.");
      } catch {
        if (!cancelled) {
          setCloudSyncEnabled(false);
          setReportStatus("Na tomto hostingu nie je aktívny backend. Report si vieš pozrieť a otvoriť ako email ručne.");
        }
      } finally {
        if (!cancelled) {
          setCloudSyncReady(true);
        }
      }
    };

    void loadCloudState();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!cloudSyncReady || !cloudSyncEnabled) {
      return;
    }

    const timeoutId = window.setTimeout(() => {
      void fetch("/.netlify/functions/plant-records", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ records }),
      }).catch(() => {
        setReportStatus("Cloud sync sa nepodaril. Lokálne zmeny sú uložené v tomto zariadení.");
      });
    }, 500);

    return () => window.clearTimeout(timeoutId);
  }, [cloudSyncEnabled, cloudSyncReady, records]);

  const reportRows = useMemo(() => getWateringReportRows(records, allFlowers), [allFlowers, records]);
  const qrLabelValidation = useMemo(
    () => validateQrLabelLayout(createQrLabelLayout(allFlowers, baseUrl)),
    [allFlowers, baseUrl],
  );

  const saveReportRecipient = async () => {
    const recipient = reportRecipient.trim();
    if (!recipient) {
      setReportStatus("Najprv zadaj email príjemcu reportu.");
      return;
    }

    try {
      const response = await fetch("/.netlify/functions/report-settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ recipient }),
      });

      if (!response.ok) {
        throw new Error("Recipient could not be saved.");
      }

      setCloudSyncEnabled(true);
      setReportStatus("Príjemca je uložený. Denný report sa odošle každý deň o 19:00.");
    } catch {
      window.localStorage.setItem("flowscan-report-recipient-v1", recipient);
      setReportStatus("Príjemca je uložený lokálne. Automatické odosielanie potrebuje Netlify backend.");
    }
  };

  const handleQrPdfExport = async () => {
    if (allFlowers.length === 0) {
      setQrExportStatus("Nie sú dostupné žiadne rastliny na export.");
      return;
    }

    try {
      setQrExportStatus("Generujem PDF hárok...");
      await exportQrLabelsPdf(allFlowers, baseUrl);
      setQrExportStatus("PDF je pripravené. Pri tlači zvoľ 100 % veľkosť / Actual size.");
    } catch (error) {
      setQrExportStatus(error instanceof Error ? error.message : "PDF export zlyhal.");
    }
  };


  const filteredFlowers = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    if (!normalizedQuery) {
      return allFlowers;
    }

    return allFlowers.filter((flower) =>
      [flower.displayName, flower.likelyName, flower.shortCare].some((value) =>
        value.toLowerCase().includes(normalizedQuery),
      ),
    );
  }, [allFlowers, query]);

  const handleAddCustomFlower = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const plantName = newPlantName.trim();

    if (!plantName || !newPlantImageFile) {
      setNewPlantStatus("Zadaj názov rastliny a pridaj obrázok.");
      return;
    }

    setIsAddingPlant(true);
    setNewPlantStatus("Spracúvam obrázok a generujem starostlivosť cez AI...");

    try {
      const imageDataUrl = await resizeImageFileToDataUrl(newPlantImageFile);
      let care = createFallbackCare(plantName);

      try {
        care = await fetchGeneratedCare(plantName, imageDataUrl);
        setNewPlantStatus("AI starostlivosť bola vygenerovaná. Rastlina je pridaná.");
      } catch {
        setNewPlantStatus("AI backend nie je dostupný. Rastlina je pridaná so všeobecným profilom.");
      }

      const customFlower: Flower = {
        ...care,
        displayName: plantName,
        id: createCustomFlowerId(),
        identification: "likely",
        image: imageDataUrl,
        source: "custom",
      };

      addCustomFlower(customFlower);
      setNewPlantName("");
      setNewPlantImageFile(null);
    } catch (error) {
      setNewPlantStatus(error instanceof Error ? error.message : "Rastlinu sa nepodarilo pridať.");
    } finally {
      setIsAddingPlant(false);
    }
  };

  if (route.page === "detail") {
    const flower = flowerById.get(route.flowerId);
    if (!flower) {
      return (
        <main className="app-shell compact">
          <a className="nav-link" href="#/">
            <ArrowLeft size={18} aria-hidden="true" />
            Prehľad
          </a>
          <section className="empty-state">
            <Leaf size={34} aria-hidden="true" />
            <h1>Rastlina sa nenašla</h1>
            <p>Tento QR kód smeruje na rastlinu, ktorá nie je v katalógu.</p>
          </section>
        </main>
      );
    }

    const record = records[flower.id] ?? { note: "", lastWatered: "", lastTransplanted: "" };
    const elapsedDays = daysSince(record.lastWatered);
    const detailUrl = publicFlowerUrl(baseUrl, flower.id);
    const intervalDays = flower.wateringIntervalDays ?? wateringIntervalsDays[flower.id] ?? 7;
    const wateringProgress = getWateringProgress(record.lastWatered, intervalDays);
    const quickActionLabel = route.scan ? "Naskenovaná rastlina" : "Rýchly záznam";

    return (
      <main className="app-shell detail-shell">
        <header className="detail-header">
          <a className="icon-link" href="#/" aria-label="Späť na prehľad">
            <ArrowLeft size={22} aria-hidden="true" />
          </a>
          <div>
            <p className="eyebrow">{flower.likelyName}</p>
            <h1>{flower.displayName}</h1>
          </div>
        </header>

        <img className="detail-photo" src={flower.image} alt={flower.displayName} />

        <section className="scan-action-panel" aria-labelledby="quick-action-title">
          <div>
            <span>{quickActionLabel}</span>
            <h2 id="quick-action-title">Čo sa dnes udialo?</h2>
            <p>Ulož dnešný dátum zálievky alebo presadenia jedným klepnutím.</p>
          </div>
          <div className="scan-action-buttons">
            <button
              className="primary-action"
              type="button"
              onClick={() => updateRecord(flower.id, { lastWatered: todayIsoDate() })}
            >
              <Check size={18} aria-hidden="true" />
              Zaliata dnes
            </button>
            <button
              className="ghost-action"
              type="button"
              onClick={() => updateRecord(flower.id, { lastTransplanted: todayIsoDate() })}
            >
              <Sprout size={18} aria-hidden="true" />
              Presadená dnes
            </button>
          </div>
        </section>

        {flower.identification === "confident" ? null : (
          <section className={`identity-note identity-note-${flower.identification}`}>
            <BadgeCheck size={18} aria-hidden="true" />
            <div>
              <strong>{identificationLabel[flower.identification]}</strong>
              <span>{flower.identificationNote}</span>
            </div>
          </section>
        )}

        <section className="status-band">
          <div>
            <span>Posledná zálievka</span>
            <strong>{formatDate(record.lastWatered)}</strong>
          </div>
          <div>
            <span>Čas od zálievky</span>
            <strong>{formatElapsedDays(elapsedDays)}</strong>
          </div>
          <div>
            <span>Presadené</span>
            <strong>{formatDate(record.lastTransplanted)}</strong>
          </div>
        </section>

        <section className={`watering-panel watering-panel-${wateringProgress.state}`}>
          <div className="watering-panel-header">
            <div>
              <span>Stav zálievky</span>
              <strong>{Math.round(wateringProgress.percent)} %</strong>
            </div>
            <div>
              <span>Ďalšia zálievka</span>
              <strong>{formatDate(wateringProgress.nextWatering)}</strong>
            </div>
          </div>
          <div className="watering-progress-track" aria-label={`Stav zálievky ${Math.round(wateringProgress.percent)} percent`}>
            <div
              className="watering-progress-fill"
              style={{ width: `${wateringProgress.percent}%` }}
            />
          </div>
          <div className="watering-panel-footer">
            <span>Interval: každých {intervalDays} dní</span>
            <strong>{wateringProgress.statusText}</strong>
          </div>
        </section>

        <section className="care-panel" aria-labelledby="care-title">
          <div className="section-title">
            <Leaf size={18} aria-hidden="true" />
            <h2 id="care-title">Základná starostlivosť</h2>
          </div>
          <p>{flower.shortCare}</p>
          <div className="care-pill-grid" aria-label="Rýchly profil starostlivosti">
            {flower.carePills.map((pill) => (
              <div className={`care-pill care-pill-${pill.tone}`} key={`${pill.label}-${pill.value}`}>
                {getCarePillVisual(pill.label, pill.value, flower.id)}
                <div>
                  <span>{pill.label}</span>
                  <strong>{pill.value}</strong>
                </div>
              </div>
            ))}
          </div>
          <dl className="care-list">
            <div>
              <dt>Svetlo</dt>
              <dd>{flower.light}</dd>
            </div>
            <div>
              <dt>Zálievka</dt>
              <dd>{flower.watering}</dd>
            </div>
            <div>
              <dt>Substrát</dt>
              <dd>{flower.soil}</dd>
            </div>
          </dl>
          <ul className="tip-list">
            {flower.careTips.map((tip) => (
              <li key={tip}>{tip}</li>
            ))}
          </ul>
        </section>

        <section className="editor-panel" aria-labelledby="care-log-title">
          <div className="section-title">
            <Pencil size={18} aria-hidden="true" />
            <h2 id="care-log-title">Záznam starostlivosti</h2>
          </div>
          <label className="field">
            <span>Dátum poslednej zálievky</span>
            <div className="date-row">
              <input
                type="date"
                value={record.lastWatered}
                max="9999-12-31"
                onChange={(event) => updateRecord(flower.id, { lastWatered: event.target.value })}
              />
              <button type="button" onClick={() => updateRecord(flower.id, { lastWatered: todayIsoDate() })}>
                Dnes
              </button>
            </div>
          </label>
          <label className="field">
            <span>Dátum presadenia</span>
            <div className="date-row">
              <input
                type="date"
                value={record.lastTransplanted}
                max="9999-12-31"
                onChange={(event) => updateRecord(flower.id, { lastTransplanted: event.target.value })}
              />
              <button type="button" onClick={() => updateRecord(flower.id, { lastTransplanted: todayIsoDate() })}>
                Dnes
              </button>
            </div>
          </label>
          <label className="field">
            <span>Poznámka</span>
            <textarea
              rows={5}
              placeholder="Pozorovania, hnojenie, plán presadenia alebo čokoľvek užitočné."
              value={record.note}
              onChange={(event) => updateRecord(flower.id, { note: event.target.value })}
            />
          </label>
        </section>

        <section className="qr-panel" aria-labelledby="single-qr-title">
          <div>
            <div className="section-title">
              <QrCodeIcon size={18} aria-hidden="true" />
              <h2 id="single-qr-title">QR kód rastliny</h2>
            </div>
            <p>Po naskenovaní sa otvorí presne táto stránka rastliny.</p>
          </div>
          <QrCode value={detailUrl} label={flower.displayName} />
        </section>
      </main>
    );
  }

  if (route.page === "qr") {
    return (
      <main className="app-shell qr-shell">
        <header className="topbar">
          <a className="icon-link" href="#/" aria-label="Späť na prehľad">
            <ArrowLeft size={22} aria-hidden="true" />
          </a>
          <div>
            <p className="eyebrow">Tlačiteľné štítky</p>
            <h1>QR kódy</h1>
          </div>
          <div className="topbar-actions">
            <button className="icon-button" type="button" onClick={handleQrPdfExport} aria-label="Exportovať PDF QR štítky">
              <FileDown size={21} aria-hidden="true" />
            </button>
            <button className="icon-button" type="button" onClick={() => window.print()} aria-label="Vytlačiť QR kódy">
              <Printer size={21} aria-hidden="true" />
            </button>
          </div>
        </header>

        <section className="base-url-panel">
          <label className="field">
            <span>Verejná URL aplikácie</span>
            <input
              type="url"
              value={baseUrl}
              onChange={(event) => setBaseUrl(event.target.value)}
              placeholder="https://tvoja-cloud-aplikacia.example"
            />
          </label>
          <p>Pred tlačou zadaj finálnu cloud URL aplikácie. Každý QR kód otvorí správnu rastlinu.</p>
        </section>

        <section className="pdf-export-panel" aria-labelledby="pdf-export-title">
          <div className="section-title">
            <FileDown size={18} aria-hidden="true" />
            <h2 id="pdf-export-title">Print QR labels</h2>
          </div>
          {allFlowers.length > 0 ? (
            <>
              <p>
                PDF hárok A4 vytvorí čisté QR štítky {qrLabelSpec.labelSizeMm} × {qrLabelSpec.labelSizeMm} mm.
                Samotný QR kód má {qrLabelSpec.qrSizeMm} × {qrLabelSpec.qrSizeMm} mm a biely okraj aspoň {qrLabelSpec.quietZoneMm} mm.
              </p>
              <p className="print-note">Tlačte na 100 % veľkosť, bez prispôsobenia strane.</p>
              <div className="pdf-export-actions">
                <button type="button" onClick={handleQrPdfExport}>
                  <FileDown size={18} aria-hidden="true" />
                  Exportovať PDF
                </button>
                <span>{qrLabelValidation.message}</span>
              </div>
              {qrExportStatus ? <div className="report-status">{qrExportStatus}</div> : null}
            </>
          ) : (
            <p>Nie sú dostupné žiadne rastliny na export.</p>
          )}
        </section>

        <section className="qr-grid" aria-label="QR kódy pre všetky rastliny">
          {allFlowers.map((flower) => (
            <article className="qr-label" key={flower.id}>
              <QrCode value={publicFlowerUrl(baseUrl, flower.id)} label={flower.displayName} size={148} />
              <div>
                <strong>{flower.displayName}</strong>
                <span>{flower.id.replace("flower-", "#")}</span>
              </div>
            </article>
          ))}
        </section>
      </main>
    );
  }

  if (route.page === "report") {
    return (
      <main className="app-shell report-shell">
        <header className="topbar">
          <a className="icon-link" href="#/" aria-label="Späť na prehľad">
            <ArrowLeft size={22} aria-hidden="true" />
          </a>
          <div>
            <p className="eyebrow">Automatický email</p>
            <h1>Denný report</h1>
          </div>
        </header>

        <section className="report-panel" aria-labelledby="report-title">
          <div className="report-panel-header">
            <div className="section-title">
              <Mail size={18} aria-hidden="true" />
              <h2 id="report-title">Denný email report</h2>
            </div>
            <span className={cloudSyncEnabled ? "sync-pill sync-pill-ok" : "sync-pill"}>
              {cloudSyncEnabled ? "cloud aktívny" : "lokálny režim"}
            </span>
          </div>
          <p>
            Každý deň o 19:00 sa majú poslať iba rastliny pod {reportThresholdPercent} % zálievky.
            Rastliny nad {reportThresholdPercent} % sa do reportu nezahrnú.
          </p>
          <div className="report-settings">
            <label className="field">
              <span>Príjemca emailu</span>
              <input
                type="email"
                value={reportRecipient}
                placeholder="napr. meno@example.com"
                onChange={(event) => setReportRecipient(event.target.value)}
              />
            </label>
            <button type="button" onClick={saveReportRecipient}>
              Uložiť príjemcu
            </button>
            <a
              className={`report-mailto ${reportRecipient.trim() ? "" : "report-mailto-disabled"}`}
              href={reportRecipient.trim() ? createMailtoReportUrl(reportRecipient.trim(), records, allFlowers) : undefined}
              aria-disabled={!reportRecipient.trim()}
            >
              <Send size={17} aria-hidden="true" />
              Otvoriť email
            </a>
          </div>
          <div className="report-status">{reportStatus}</div>
          <div className="report-preview" aria-label="Náhľad reportu">
            <div className="report-preview-head">
              <strong>Rastliny v reporte</strong>
              <span>{reportRows.length}</span>
            </div>
            {reportRows.length > 0 ? (
              <div className="report-table" role="table" aria-label="Rastliny pod 20 percent zálievky">
                <div className="report-table-row report-table-row-head" role="row">
                  <span>Rastlina</span>
                  <span>Zálievka</span>
                  <span>Posledná zálievka</span>
                  <span>Stav</span>
                </div>
                {reportRows.map((row) => (
                  <div className="report-table-row" role="row" key={row.flower.id}>
                    <span>
                      <strong>{row.flower.displayName}</strong>
                      <small>{row.flower.likelyName}</small>
                    </span>
                    <span>{Math.round(row.progress.percent)} %</span>
                    <span>{row.lastWateredLabel}</span>
                    <span>{row.progress.statusText}</span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="report-empty">Žiadna rastlina nie je pod {reportThresholdPercent} % zálievky.</p>
            )}
          </div>
        </section>
      </main>
    );
  }

  return (
    <main className="app-shell">
      <header className="hero">
        <div>
          <p className="eyebrow">{allFlowers.length} sledovaných rastlín</p>
          <h1>Prehľad starostlivosti o rastliny</h1>
          <p className="hero-copy">Otvor rastlinu, aktualizuj zálievku alebo presadenie, pridaj poznámku a vytlač QR štítky na kvetináče.</p>
        </div>
        <div className="hero-actions">
          <a className="qr-action secondary-action-link" href="#/report">
            <Mail size={20} aria-hidden="true" />
            Report
          </a>
          <a className="qr-action" href="#/qr">
            <QrCodeIcon size={20} aria-hidden="true" />
            QR štítky
          </a>
        </div>
      </header>

      <section className="toolbar" aria-label="Nástroje prehľadu">
        <label className="search-field">
          <Search size={18} aria-hidden="true" />
          <span className="sr-only">Hľadať rastliny</span>
          <input
            type="search"
            placeholder="Hľadať rastliny"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
        </label>
      </section>

      <section className="add-plant-panel" aria-labelledby="add-plant-title">
        <div>
          <div className="section-title">
            <Plus size={18} aria-hidden="true" />
            <h2 id="add-plant-title">Pridať novú rastlinu</h2>
          </div>
          <p>
            Zadaj názov a pridaj fotku. AI starostlivosť sa vygeneruje iba pre túto novú rastlinu;
            existujúce rastliny sa tým nemenia.
          </p>
        </div>
        <form className="add-plant-form" onSubmit={handleAddCustomFlower}>
          <label className="field">
            <span>Názov rastliny</span>
            <input
              type="text"
              value={newPlantName}
              maxLength={80}
              placeholder="napr. Monstera"
              onChange={(event) => setNewPlantName(event.target.value)}
            />
          </label>
          <label className="field">
            <span>Obrázok rastliny</span>
            <input
              type="file"
              accept="image/*"
              onChange={(event) => setNewPlantImageFile(event.target.files?.[0] ?? null)}
            />
          </label>
          <button type="submit" disabled={isAddingPlant}>
            <Plus size={18} aria-hidden="true" />
            {isAddingPlant ? "Pridávam..." : "Pridať rastlinu"}
          </button>
        </form>
        {newPlantStatus ? <div className="report-status">{newPlantStatus}</div> : null}
      </section>

      <section className="flower-grid" aria-label="Prehľad rastlín">
        {filteredFlowers.map((flower) => {
          const record = records[flower.id] ?? { note: "", lastWatered: "", lastTransplanted: "" };
          const elapsedDays = daysSince(record.lastWatered);
          const intervalDays = flower.wateringIntervalDays ?? wateringIntervalsDays[flower.id] ?? 7;
          const wateringProgress = getWateringProgress(record.lastWatered, intervalDays);

          return (
            <a className="flower-card" href={flowerPath(flower.id)} key={flower.id}>
              <img src={flower.image} alt={flower.displayName} loading="lazy" />
              <div className="flower-card-body">
                <div className="card-topline">
                  <span className="flower-index">{flower.id.replace("flower-", "#")}</span>
                  <span>{flower.identification === "confident" ? "overené ID" : flower.identification === "likely" ? "pravdepodobné ID" : "overiť ID"}</span>
                </div>
                <h2>{flower.displayName}</h2>
                <p>{flower.likelyName}</p>
                <div className={`image-watering image-watering-${wateringProgress.state}`}>
                  <div className="image-watering-label">
                    <span>Zálievka</span>
                    <strong>{Math.round(wateringProgress.percent)} %</strong>
                  </div>
                  <div className="image-progress-track">
                    <div className="image-progress-fill" style={{ width: `${wateringProgress.percent}%` }} />
                  </div>
                  <small>{wateringProgress.statusText}</small>
                </div>
                <div className="flower-meta">
                  <span>
                    <Droplets size={15} aria-hidden="true" />
                    {formatElapsedDays(elapsedDays)}
                  </span>
                  <span>
                    <CalendarDays size={15} aria-hidden="true" />
                    {formatDate(record.lastWatered)}
                  </span>
                  <span>
                    <Sprout size={15} aria-hidden="true" />
                    {formatDate(record.lastTransplanted)}
                  </span>
                </div>
              </div>
            </a>
          );
        })}
      </section>

      {filteredFlowers.length === 0 ? (
        <section className="empty-state">
          <Home size={34} aria-hidden="true" />
          <h2>Žiadna rastlina sa nenašla</h2>
          <p>Vymaž vyhľadávanie a zobrazí sa celý dashboard.</p>
        </section>
      ) : null}
    </main>
  );
};
