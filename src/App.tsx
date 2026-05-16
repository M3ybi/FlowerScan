import {
  ArrowLeft,
  BadgeCheck,
  CalendarDays,
  Check,
  Droplets,
  Home,
  Leaf,
  Pencil,
  Printer,
  QrCodeIcon,
  Search,
  Sprout,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { QrCode } from "./components/QrCode";
import { flowerById, flowers } from "./data/flowers";
import { useFlowerRecords } from "./hooks/useFlowerRecords";
import { addDays, daysSince, formatDate, formatElapsedDays, isIsoDate } from "./utils/dates";
import { flowerPath } from "./utils/links";

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

const wateringIntervalsDays: Record<string, number> = {
  "flower-01": 7,
  "flower-02": 3,
  "flower-03": 5,
  "flower-04": 21,
  "flower-05": 14,
  "flower-06": 30,
  "flower-07": 30,
  "flower-08": 7,
  "flower-09": 30,
  "flower-10": 5,
  "flower-11": 10,
  "flower-12": 7,
  "flower-13": 7,
  "flower-14": 10,
  "flower-15": 5,
  "flower-16": 7,
  "flower-17": 4,
  "flower-18": 5,
  "flower-19": 5,
};

const getWateringProgress = (lastWatered: string, intervalDays: number) => {
  if (!isIsoDate(lastWatered)) {
    return {
      daysLeft: null,
      nextWatering: "",
      percent: 0,
      state: "unknown" as const,
      statusText: "Zálievka nezadaná",
    };
  }

  const elapsed = daysSince(lastWatered) ?? 0;
  const rawPercent = 100 - (elapsed / intervalDays) * 100;
  const percent = Math.max(0, Math.min(100, rawPercent));
  const daysLeft = intervalDays - elapsed;
  const nextWatering = addDays(lastWatered, intervalDays);

  if (daysLeft < 0) {
    return {
      daysLeft,
      nextWatering,
      percent,
      state: "overdue" as const,
      statusText: `mešká ${Math.abs(daysLeft)} d.`,
    };
  }

  if (daysLeft === 0) {
    return {
      daysLeft,
      nextWatering,
      percent,
      state: "due" as const,
      statusText: "zaliať dnes",
    };
  }

  if (percent <= 35) {
    return {
      daysLeft,
      nextWatering,
      percent,
      state: "soon" as const,
      statusText: `zaliať o ${daysLeft} d.`,
    };
  }

  return {
    daysLeft,
    nextWatering,
    percent,
    state: "ok" as const,
    statusText: `zaliať o ${daysLeft} d.`,
  };
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

  return { page: "dashboard" as const };
};

export const App = () => {
  const route = useHashRoute();
  const { records, updateRecord } = useFlowerRecords();
  const [query, setQuery] = useState("");
  const [baseUrl, setBaseUrl] = useState(() => currentBaseUrl());

  useEffect(() => {
    window.scrollTo({ top: 0, left: 0 });
  }, [route.page, "flowerId" in route ? route.flowerId : ""]);

  const filteredFlowers = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    if (!normalizedQuery) {
      return flowers;
    }

    return flowers.filter((flower) =>
      [flower.displayName, flower.likelyName, flower.shortCare].some((value) =>
        value.toLowerCase().includes(normalizedQuery),
      ),
    );
  }, [query]);

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
    const intervalDays = wateringIntervalsDays[flower.id] ?? 7;
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
          <button className="icon-button" type="button" onClick={() => window.print()} aria-label="Vytlačiť QR kódy">
            <Printer size={21} aria-hidden="true" />
          </button>
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

        <section className="qr-grid" aria-label="QR kódy pre všetky rastliny">
          {flowers.map((flower) => (
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

  return (
    <main className="app-shell">
      <header className="hero">
        <div>
          <p className="eyebrow">19 sledovaných rastlín</p>
          <h1>Prehľad starostlivosti o rastliny</h1>
          <p className="hero-copy">Otvor rastlinu, aktualizuj zálievku alebo presadenie, pridaj poznámku a vytlač QR štítky na kvetináče.</p>
        </div>
        <a className="qr-action" href="#/qr">
          <QrCodeIcon size={20} aria-hidden="true" />
          QR štítky
        </a>
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

      <section className="flower-grid" aria-label="Prehľad rastlín">
        {filteredFlowers.map((flower) => {
          const record = records[flower.id] ?? { note: "", lastWatered: "", lastTransplanted: "" };
          const elapsedDays = daysSince(record.lastWatered);
          const intervalDays = wateringIntervalsDays[flower.id] ?? 7;
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
