import {
  ArrowLeft,
  BadgeCheck,
  Bell,
  BellOff,
  CalendarDays,
  Camera,
  Check,
  Copy,
  Droplets,
  FileDown,
  ImagePlus,
  Home,
  Leaf,
  Mail,
  Pencil,
  Plus,
  Printer,
  QrCodeIcon,
  Search,
  Send,
  Sparkles,
  Sprout,
  Trash2,
  X,
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
import {
  createCustomFlowerId,
  fetchGeneratedCare,
  imageSourceToDataUrl,
  resizeImageFileToDataUrl,
} from "./utils/customFlower";
import type { GeneratedCare } from "./utils/customFlower";
import { daysSince, formatDate, formatElapsedDays } from "./utils/dates";
import {
  clearHouseholdSession,
  createHouseholdApiUrl,
  createHouseholdUrl,
  getHouseholdTokenFromUrl,
  getStoredHouseholdSession,
  isValidHouseholdToken,
  removeHouseholdFromCurrentUrl,
  storeHouseholdSession,
} from "./utils/household";
import type { HouseholdSession } from "./utils/household";
import { flowerPath } from "./utils/links";
import { exportQrLabelsPdf, validateQrLabelLayout, createQrLabelLayout, qrLabelSpec } from "./utils/qrPdf";
import { createMailtoReportUrl, getWateringReportRows, reportThresholdPercent } from "./utils/report";
import { getWateringProgress } from "./utils/watering";
import {
  isPushNotificationSupported,
  subscribeToPushNotifications,
  unsubscribeFromPushNotifications,
} from "./utils/pushNotifications";
import {
  createDiagnosticId,
  fetchPlantDiagnosis,
  resizeDiagnosticImageFileToDataUrl,
  sanitizeDiagnosticEntries,
} from "./utils/diagnostics";
import type { DiagnosisConfirmation, PlantDiagnosisDraft, PlantDiagnosticEntry } from "./utils/diagnostics";

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

const currentHouseholdBaseUrl = (householdToken: string) =>
  isValidHouseholdToken(householdToken) ? createHouseholdUrl(householdToken, "").replace(/#\/?$/, "") : currentBaseUrl();

const publicFlowerUrl = (baseUrl: string, flowerId: string) =>
  `${normalizeBaseUrl(baseUrl)}${flowerPath(flowerId, true)}`;

const identificationLabel = {
  confident: "ID overené z fotky",
  likely: "Pravdepodobné ID",
  "needs-confirmation": "ID treba potvrdiť",
};

const normalizeCareText = (value: string) =>
  value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();

const includesAny = (value: string, keywords: string[]) => keywords.some((keyword) => value.includes(keyword));

const getWaterIconLevel = (value: string, intervalDays: number) => {
  const normalizedValue = normalizeCareText(value);

  if (
    includesAny(normalizedValue, [
      "nechat uplne vyschnut",
      "po uplnom vyschnuti",
      "po vyschnuti",
      "az po preschnuti",
      "az po vyschnuti",
      "mierne",
      "striedmo",
      "such",
      "sukulent",
      "kaktus",
    ]) ||
    intervalDays >= 14
  ) {
    return "low";
  }

  if (
    includesAny(normalizedValue, ["udrziavat vlhku", "stale mierne vlhku", "rovnomerne vlhku", "vela vody", "castejsie"]) ||
    intervalDays <= 5
  ) {
    return "high";
  }

  return "medium";
};

const getSunIconLevel = (value: string) => {
  const normalizedValue = normalizeCareText(value);

  if (includesAny(normalizedValue, ["plne slnko", "priame slnko", "vela svetla", "velmi jasne", "slnecne", "6 hodin"])) {
    return "full";
  }

  if (includesAny(normalizedValue, ["polotien", "tien", "menej svetla", "slabsie svetlo", "nizke svetlo"])) {
    return "low";
  }

  return "half";
};

const getHumidityIconLevel = (value: string) => {
  const normalizedValue = normalizeCareText(value);

  if (includesAny(normalizedValue, ["nizs", "nizka", "suchy vzduch", "bez rosenia", "nie je narocna", "bezna izbova"])) {
    return "low";
  }

  if (includesAny(normalizedValue, ["vysok", "vyss", "rosit", "vlhkomil", "terarium"])) {
    return "high";
  }

  return "medium";
};

const getDifficultyIconLevel = (value: string) => {
  const normalizedValue = normalizeCareText(value);

  if (includesAny(normalizedValue, ["nenaroc", "lahk", "jednoduch", "zaciatocnik", "odolna"])) {
    return "easy";
  }

  if (includesAny(normalizedValue, ["stredn", "mierna"])) {
    return "medium";
  }

  if (includesAny(normalizedValue, ["naroc", "citliv", "skusen"])) {
    return "hard";
  }

  return "medium";
};

const getCarePillVisual = (label: string, value: string, intervalDays: number) => {
  const normalizedLabel = normalizeCareText(label);

  if (normalizedLabel.includes("svetlo")) {
    const strength = getSunIconLevel(value);

    return (
      <span className={`pill-visual pill-sun pill-sun-${strength}`} aria-hidden="true">
        <span />
      </span>
    );
  }

  if (normalizedLabel.includes("zalievka")) {
    const level = getWaterIconLevel(value, intervalDays);

    return (
      <span className={`pill-visual pill-water pill-water-${level}`} aria-hidden="true">
        <span />
        <span />
        <span />
      </span>
    );
  }

  if (normalizedLabel.includes("vlhkost")) {
    const level = getHumidityIconLevel(value);

    return (
      <span className={`pill-visual pill-humidity pill-humidity-${level}`} aria-hidden="true">
        <span />
        <span />
        <span />
      </span>
    );
  }

  if (normalizedLabel.includes("narocnost")) {
    const level = getDifficultyIconLevel(value);

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

type CarePreview = {
  flowerId: string;
  nextCare: GeneratedCare;
};

type CareDiffRow = {
  label: string;
  currentValue: string;
  nextValue: string;
};

const formatCarePills = (carePills: Flower["carePills"]) =>
  carePills.map((pill) => `${pill.label}: ${pill.value}`).join("\n");

const formatCareTips = (careTips: string[]) => careTips.map((tip) => `• ${tip}`).join("\n");

const getCareDiffRows = (flower: Flower, nextCare: GeneratedCare, currentIntervalDays: number): CareDiffRow[] => {
  const candidates: CareDiffRow[] = [
    { label: "Názov", currentValue: flower.displayName, nextValue: nextCare.displayName },
    { label: "Botanické ID", currentValue: flower.likelyName, nextValue: nextCare.likelyName },
    { label: "Krátky popis", currentValue: flower.shortCare, nextValue: nextCare.shortCare },
    { label: "Rýchle info pily", currentValue: formatCarePills(flower.carePills), nextValue: formatCarePills(nextCare.carePills) },
    { label: "Svetlo", currentValue: flower.light, nextValue: nextCare.light },
    { label: "Zálievka", currentValue: flower.watering, nextValue: nextCare.watering },
    {
      label: "Interval zálievky",
      currentValue: `${currentIntervalDays} dní`,
      nextValue: `${nextCare.wateringIntervalDays} dní`,
    },
    { label: "Substrát", currentValue: flower.soil, nextValue: nextCare.soil },
    { label: "Tipy", currentValue: formatCareTips(flower.careTips), nextValue: formatCareTips(nextCare.careTips) },
    { label: "Poznámka k identifikácii", currentValue: flower.identificationNote, nextValue: nextCare.identificationNote },
  ];

  return candidates.filter((row) => row.currentValue.trim() !== row.nextValue.trim());
};

const applyGeneratedCareToFlower = (flower: Flower, nextCare: GeneratedCare): Flower => {
  const { displayName, identificationConfidence, ...careProfile } = nextCare;

  return {
    ...flower,
    ...careProfile,
    displayName: displayName.trim() || flower.displayName,
    identification: identificationConfidence,
    source: "custom",
  };
};

const recordHasValue = (record: FlowerRecords[string] | undefined) =>
  Boolean(record?.note || record?.lastFertilized || record?.lastWatered || record?.lastTransplanted);

const mergeCloudRecords = (localRecords: FlowerRecords, cloudRecords: FlowerRecords) => {
  const flowerIds = new Set([...Object.keys(localRecords), ...Object.keys(cloudRecords)]);

  return Object.fromEntries(
    [...flowerIds].map((flowerId) => [
      flowerId,
      recordHasValue(cloudRecords[flowerId]) ? cloudRecords[flowerId] : localRecords[flowerId],
    ]),
  ) as FlowerRecords;
};

const diagnosticsStorageKey = "flowscan-plant-diagnostics-v1";

const readStoredDiagnostics = () => {
  if (typeof window === "undefined") {
    return [];
  }

  try {
    return sanitizeDiagnosticEntries(JSON.parse(window.localStorage.getItem(diagnosticsStorageKey) ?? "[]"));
  } catch {
    return [];
  }
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
  const {
    addCustomFlower,
    customFlowers,
    removeFlower,
    removedFlowerIds,
    replaceCustomFlowers,
    replaceRemovedFlowerIds,
    updateFlower,
  } = useCustomFlowers();
  const allFlowers = useMemo(
    () => [
      ...customFlowers,
      ...builtInFlowers.filter((flower) => !customFlowers.some((customFlower) => customFlower.id === flower.id)),
    ].filter((flower) => !removedFlowerIds.includes(flower.id)),
    [customFlowers, removedFlowerIds],
  );
  const allFlowersIncludingRemoved = useMemo(
    () => [...customFlowers, ...builtInFlowers.filter((flower) => !customFlowers.some((customFlower) => customFlower.id === flower.id))],
    [customFlowers],
  );
  const flowerById = useMemo(
    () => new Map(allFlowersIncludingRemoved.map((flower) => [flower.id, flower])),
    [allFlowersIncludingRemoved],
  );
  const { records, replaceRecords, updateRecord } = useFlowerRecords(allFlowers);
  const [query, setQuery] = useState("");
  const [baseUrl, setBaseUrl] = useState(() => currentBaseUrl());
  const [activeHousehold, setActiveHousehold] = useState<HouseholdSession | null>(() => getStoredHouseholdSession());
  const [accessStatus, setAccessStatus] = useState("");
  const [householdNameDraft, setHouseholdNameDraft] = useState("Moja domácnosť");
  const [householdLinkStatus, setHouseholdLinkStatus] = useState("");
  const [isAccessChecking, setIsAccessChecking] = useState(true);
  const [isCreatingHousehold, setIsCreatingHousehold] = useState(false);
  const [reportRecipient, setReportRecipient] = useState(() => window.localStorage.getItem("flowscan-report-recipient-v1") ?? "");
  const [reportStatus, setReportStatus] = useState("Denný report sa odosiela o 19:00, keď je aplikácia nasadená cez Netlify.");
  const [cloudSyncEnabled, setCloudSyncEnabled] = useState(false);
  const [cloudSyncReady, setCloudSyncReady] = useState(false);
  const [qrExportStatus, setQrExportStatus] = useState("");
  const [newPlantName, setNewPlantName] = useState("");
  const [newPlantImageFile, setNewPlantImageFile] = useState<File | null>(null);
  const [newPlantStatus, setNewPlantStatus] = useState("");
  const [isAddingPlant, setIsAddingPlant] = useState(false);
  const [isAddPlantModalOpen, setIsAddPlantModalOpen] = useState(false);
  const [deleteFlowerId, setDeleteFlowerId] = useState("");
  const [carePreview, setCarePreview] = useState<CarePreview | null>(null);
  const [carePreviewStatus, setCarePreviewStatus] = useState("");
  const [isGeneratingCarePreview, setIsGeneratingCarePreview] = useState(false);
  const [editingNameFlowerId, setEditingNameFlowerId] = useState("");
  const [draftFlowerName, setDraftFlowerName] = useState("");
  const [pushStatus, setPushStatus] = useState("");
  const [pushEnabled, setPushEnabled] = useState(false);
  const [diagnostics, setDiagnostics] = useState<PlantDiagnosticEntry[]>(() => readStoredDiagnostics());
  const [isDiagnosisModalOpen, setIsDiagnosisModalOpen] = useState(false);
  const [diagnosisImageDataUrl, setDiagnosisImageDataUrl] = useState("");
  const [diagnosisDraft, setDiagnosisDraft] = useState<PlantDiagnosisDraft | null>(null);
  const [diagnosisUserNote, setDiagnosisUserNote] = useState("");
  const [diagnosisStatus, setDiagnosisStatus] = useState("");
  const [isDiagnosing, setIsDiagnosing] = useState(false);

  useEffect(() => {
    window.scrollTo({ top: 0, left: 0 });
  }, [route.page, "flowerId" in route ? route.flowerId : ""]);

  useEffect(() => {
    window.localStorage.setItem(diagnosticsStorageKey, JSON.stringify(diagnostics));
  }, [diagnostics]);

  useEffect(() => {
    let cancelled = false;

    const resolveHousehold = async () => {
      const urlToken = getHouseholdTokenFromUrl();
      const storedHousehold = getStoredHouseholdSession();
      const token = urlToken || storedHousehold?.publicToken || "";

      if (!token) {
        setActiveHousehold(null);
        setAccessStatus("");
        setIsAccessChecking(false);
        return;
      }

      try {
        setIsAccessChecking(true);
        const response = await fetch(createHouseholdApiUrl("/.netlify/functions/household-access", token));
        if (!response.ok) {
          throw new Error("Household access failed.");
        }

        const data = (await response.json()) as { household?: HouseholdSession };
        if (!data.household || !isValidHouseholdToken(data.household.publicToken)) {
          throw new Error("Invalid household response.");
        }

        if (cancelled) {
          return;
        }

        storeHouseholdSession(data.household);
        setActiveHousehold(data.household);
        setBaseUrl(currentHouseholdBaseUrl(data.household.publicToken));
        setAccessStatus("");
      } catch {
        if (!cancelled) {
          clearHouseholdSession();
          setActiveHousehold(null);
          setCloudSyncEnabled(false);
          setAccessStatus("Link domácnosti nie je platný alebo už nie je dostupný.");
        }
      } finally {
        if (!cancelled) {
          setIsAccessChecking(false);
        }
      }
    };

    void resolveHousehold();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!activeHousehold) {
      setCloudSyncReady(false);
      return;
    }

    let cancelled = false;

    const loadCloudState = async () => {
      try {
        setCloudSyncReady(false);
        const [settingsResponse, recordsResponse] = await Promise.all([
          fetch(createHouseholdApiUrl("/.netlify/functions/report-settings", activeHousehold.publicToken)),
          fetch(createHouseholdApiUrl("/.netlify/functions/plant-state", activeHousehold.publicToken)),
        ]);

        if (!settingsResponse.ok || !recordsResponse.ok) {
          throw new Error("Cloud sync is not available on this host.");
        }

        const settings = (await settingsResponse.json()) as { recipient?: string };
        const cloudState = (await recordsResponse.json()) as {
          customFlowers?: Flower[];
          diagnostics?: PlantDiagnosticEntry[];
          records?: FlowerRecords;
          removedFlowerIds?: string[];
        };

        if (cancelled) {
          return;
        }

        setReportRecipient(typeof settings.recipient === "string" ? settings.recipient : "");
        const cloudCustomFlowers = Array.isArray(cloudState.customFlowers) ? cloudState.customFlowers : [];
        const cloudRemovedFlowerIds = Array.isArray(cloudState.removedFlowerIds) ? cloudState.removedFlowerIds : [];
        replaceCustomFlowers(cloudCustomFlowers.length > 0 ? cloudCustomFlowers : customFlowers);
        replaceRemovedFlowerIds(cloudRemovedFlowerIds.length > 0 ? cloudRemovedFlowerIds : removedFlowerIds);
        if (Array.isArray(cloudState.diagnostics) && cloudState.diagnostics.length > 0) {
          setDiagnostics(sanitizeDiagnosticEntries(cloudState.diagnostics));
        }
        if (cloudState.records) {
          replaceRecords(mergeCloudRecords(records, cloudState.records));
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
  }, [activeHousehold]);

  useEffect(() => {
    if (!isPushNotificationSupported()) {
      setPushStatus("Tento prehliadač nepodporuje push notifikácie.");
      return;
    }

    void navigator.serviceWorker
      .getRegistration()
      .then((registration) => registration?.pushManager.getSubscription() ?? null)
      .then((subscription) => {
        setPushEnabled(Boolean(subscription));
      })
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    if (!activeHousehold || !cloudSyncReady || !cloudSyncEnabled) {
      return;
    }

    const timeoutId = window.setTimeout(() => {
      void fetch(createHouseholdApiUrl("/.netlify/functions/plant-state", activeHousehold.publicToken), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ customFlowers, diagnostics, householdId: activeHousehold.publicToken, records, removedFlowerIds }),
      }).catch(() => {
        setReportStatus("Cloud sync sa nepodaril. Lokálne zmeny sú uložené v tomto zariadení.");
      });
    }, 500);

    return () => window.clearTimeout(timeoutId);
  }, [activeHousehold, cloudSyncEnabled, cloudSyncReady, customFlowers, diagnostics, records, removedFlowerIds]);

  const reportRows = useMemo(() => getWateringReportRows(records, allFlowers), [allFlowers, records]);
  const qrLabelValidation = useMemo(
    () => validateQrLabelLayout(createQrLabelLayout(allFlowers, baseUrl)),
    [allFlowers, baseUrl],
  );

  const saveReportRecipient = async () => {
    if (!activeHousehold) {
      setReportStatus("Najprv otvor alebo vytvor domácnosť.");
      return;
    }

    const recipient = reportRecipient.trim();
    if (!recipient) {
      setReportStatus("Najprv zadaj email príjemcu reportu.");
      return;
    }

    try {
      const response = await fetch(createHouseholdApiUrl("/.netlify/functions/report-settings", activeHousehold.publicToken), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ householdId: activeHousehold.publicToken, recipient }),
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

  const enablePushNotifications = async () => {
    if (!activeHousehold) {
      setPushStatus("Najprv otvor alebo vytvor domácnosť.");
      return;
    }

    try {
      setPushStatus("Zapínam push notifikácie...");
      await subscribeToPushNotifications(activeHousehold.publicToken);
      setPushEnabled(true);
      setPushStatus("Push notifikácie sú zapnuté pre toto zariadenie.");
    } catch (error) {
      setPushStatus(error instanceof Error ? error.message : "Push notifikácie sa nepodarilo zapnúť.");
    }
  };

  const disablePushNotifications = async () => {
    if (!activeHousehold) {
      setPushStatus("Najprv otvor alebo vytvor domácnosť.");
      return;
    }

    try {
      setPushStatus("Vypínam push notifikácie...");
      await unsubscribeFromPushNotifications(activeHousehold.publicToken);
      setPushEnabled(false);
      setPushStatus("Push notifikácie sú vypnuté pre toto zariadenie.");
    } catch (error) {
      setPushStatus(error instanceof Error ? error.message : "Push notifikácie sa nepodarilo vypnúť.");
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

  const handleCreateHousehold = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (isCreatingHousehold) {
      return;
    }

    try {
      setIsCreatingHousehold(true);
      setAccessStatus("Vytváram súkromnú domácnosť...");
      const response = await fetch("/.netlify/functions/household-access", {
        body: JSON.stringify({ name: householdNameDraft }),
        headers: { "Content-Type": "application/json" },
        method: "POST",
      });

      if (!response.ok) {
        throw new Error("Household could not be created.");
      }

      const data = (await response.json()) as { household?: HouseholdSession };
      if (!data.household || !isValidHouseholdToken(data.household.publicToken)) {
        throw new Error("Invalid household response.");
      }

      storeHouseholdSession(data.household);
      window.history.replaceState(null, "", createHouseholdUrl(data.household.publicToken));
      setActiveHousehold(data.household);
      setBaseUrl(currentHouseholdBaseUrl(data.household.publicToken));
      setAccessStatus("");
    } catch {
      setAccessStatus("Domácnosť sa nepodarilo vytvoriť. Skontroluj Netlify backend a skús znova.");
    } finally {
      setIsCreatingHousehold(false);
      setIsAccessChecking(false);
    }
  };

  const copyHouseholdLink = async () => {
    if (!activeHousehold) {
      return;
    }

    const link = createHouseholdUrl(activeHousehold.publicToken);
    try {
      await navigator.clipboard.writeText(link);
      setHouseholdLinkStatus("Link domácnosti je skopírovaný.");
    } catch {
      setHouseholdLinkStatus(link);
    }
  };

  const changeHousehold = () => {
    clearHouseholdSession();
    removeHouseholdFromCurrentUrl();
    setActiveHousehold(null);
    setCloudSyncEnabled(false);
    setCloudSyncReady(false);
    setAccessStatus("");
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
      const care = await fetchGeneratedCare(plantName, imageDataUrl);
      const { displayName: aiCareDisplayName, identificationConfidence, ...careProfile } = care;
      const aiDisplayName = aiCareDisplayName.trim();

      const customFlower: Flower = {
        ...careProfile,
        displayName: aiDisplayName || plantName,
        id: createCustomFlowerId(),
        identification: identificationConfidence,
        image: imageDataUrl,
        source: "custom",
      };

      addCustomFlower(customFlower);
      setNewPlantStatus(`AI identifikovala rastlinu ako ${customFlower.displayName}. Rastlina je pridaná.`);
      setNewPlantName("");
      setNewPlantImageFile(null);
      setIsAddPlantModalOpen(false);
    } catch (error) {
      const reason = error instanceof Error ? error.message : "Rastlinu sa nepodarilo pridať.";
      setNewPlantStatus(`AI identifikácia zlyhala. Rastlina nebola pridaná. ${reason}`);
    } finally {
      setIsAddingPlant(false);
    }
  };

  const handleGenerateCarePreview = async (flower: Flower) => {
    setIsGeneratingCarePreview(true);
    setCarePreviewStatus("AI pripravuje nový návrh starostlivosti...");

    try {
      const imageDataUrl = await imageSourceToDataUrl(flower.image);
      const nextCare = await fetchGeneratedCare(flower.displayName, imageDataUrl);
      setCarePreview({ flowerId: flower.id, nextCare });
      setCarePreviewStatus("");
    } catch (error) {
      const reason = error instanceof Error ? error.message : "AI návrh sa nepodarilo vygenerovať.";
      setCarePreviewStatus(`AI generovanie zlyhalo. ${reason}`);
    } finally {
      setIsGeneratingCarePreview(false);
    }
  };

  const confirmCareUpdate = () => {
    if (!carePreview) {
      return;
    }

    const currentFlower = flowerById.get(carePreview.flowerId);
    if (!currentFlower) {
      setCarePreview(null);
      setCarePreviewStatus("Rastlina už nie je dostupná.");
      return;
    }

    updateFlower(applyGeneratedCareToFlower(currentFlower, carePreview.nextCare));
    setCarePreview(null);
    setCarePreviewStatus("Starostlivosť bola aktualizovaná podľa AI návrhu.");
  };

  const startNameEdit = (flower: Flower) => {
    setEditingNameFlowerId(flower.id);
    setDraftFlowerName(flower.displayName);
  };

  const cancelNameEdit = () => {
    setEditingNameFlowerId("");
    setDraftFlowerName("");
  };

  const confirmNameEdit = (flower: Flower) => {
    const nextName = draftFlowerName.trim();
    if (!nextName) {
      return;
    }

    updateFlower({ ...flower, displayName: nextName, source: "custom" });
    cancelNameEdit();
  };

  const openDiagnosisModal = () => {
    setDiagnosisImageDataUrl("");
    setDiagnosisDraft(null);
    setDiagnosisUserNote("");
    setDiagnosisStatus("");
    setIsDiagnosisModalOpen(true);
  };

  const closeDiagnosisModal = () => {
    if (isDiagnosing) {
      return;
    }

    setIsDiagnosisModalOpen(false);
  };

  const handleDiagnosisImageChange = async (file: File | undefined) => {
    if (!file) {
      return;
    }

    try {
      setDiagnosisStatus("Spracúvam fotku...");
      setDiagnosisDraft(null);
      const imageDataUrl = await resizeDiagnosticImageFileToDataUrl(file);
      setDiagnosisImageDataUrl(imageDataUrl);
      setDiagnosisStatus("Fotka je pripravená na AI diagnostiku.");
    } catch (error) {
      setDiagnosisImageDataUrl("");
      setDiagnosisStatus(error instanceof Error ? error.message : "Fotku sa nepodarilo spracovať.");
    }
  };

  const runPlantDiagnosis = async (flower: Flower) => {
    if (!diagnosisImageDataUrl || isDiagnosing) {
      return;
    }

    setIsDiagnosing(true);
    setDiagnosisStatus("AI analyzuje fotku rastliny...");

    try {
      const diagnosis = await fetchPlantDiagnosis(flower.displayName, diagnosisImageDataUrl);
      setDiagnosisDraft(diagnosis);
      setDiagnosisStatus(diagnosis.confidence < 45 ? "Výsledok má nízku istotu. Skontroluj ho opatrne." : "");
    } catch (error) {
      setDiagnosisDraft(null);
      setDiagnosisStatus(error instanceof Error ? error.message : "AI diagnostika zlyhala. Skús inú fotku.");
    } finally {
      setIsDiagnosing(false);
    }
  };

  const savePlantDiagnosis = (flower: Flower, userConfirmation: DiagnosisConfirmation) => {
    if (!diagnosisDraft || !diagnosisImageDataUrl || !flowerById.has(flower.id)) {
      setDiagnosisStatus("Diagnostiku sa nepodarilo uložiť, rastlina už nie je dostupná.");
      return;
    }

    const now = new Date().toISOString();
    const entry: PlantDiagnosticEntry = {
      ...diagnosisDraft,
      createdAt: now,
      id: createDiagnosticId(),
      imageDataUrl: diagnosisImageDataUrl,
      plantId: flower.id,
      updatedAt: now,
      userConfirmation,
      userNote: diagnosisUserNote.trim(),
    };

    setDiagnostics((current) => [entry, ...current]);
    setIsDiagnosisModalOpen(false);
  };

  const confirmRemoveCustomFlower = () => {
    if (!deleteFlowerId) {
      return;
    }

    removeFlower(deleteFlowerId);
    setDeleteFlowerId("");
    window.location.hash = "#/";
  };

  if (isAccessChecking) {
    return (
      <main className="app-shell access-shell">
        <section className="access-card" aria-live="polite">
          <div className="section-title">
            <Home size={20} aria-hidden="true" />
            <h1>Načítavam domácnosť</h1>
          </div>
          <p>Overujem súkromný link pred načítaním rastlín.</p>
        </section>
      </main>
    );
  }

  if (!activeHousehold) {
    return (
      <main className="app-shell access-shell">
        <section className="access-card" aria-labelledby="access-title">
          <div className="section-title">
            <Home size={20} aria-hidden="true" />
            <h1 id="access-title">Súkromná domácnosť</h1>
          </div>
          <p>
            Rastliny sa už nezdieľajú globálne pre celý web. Otvor zdieľaný link domácnosti alebo vytvor nový súkromný
            link pre svoju domácnosť.
          </p>
          <form className="access-form" onSubmit={handleCreateHousehold}>
            <label className="field">
              <span>Názov domácnosti</span>
              <input
                type="text"
                value={householdNameDraft}
                maxLength={80}
                onChange={(event) => setHouseholdNameDraft(event.target.value)}
              />
            </label>
            <button type="submit" disabled={isCreatingHousehold}>
              <Plus size={18} aria-hidden="true" />
              {isCreatingHousehold ? "Vytváram..." : "Vytvoriť domácnosť"}
            </button>
          </form>
          {accessStatus ? <p className="access-status">{accessStatus}</p> : null}
          <p className="access-note">
            Link bude obsahovať náhodný tajný token. Pošli ho iba ľuďom, ktorí majú mať prístup k týmto rastlinám.
          </p>
        </section>
      </main>
    );
  }

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

    const record = records[flower.id] ?? { lastFertilized: "", note: "", lastWatered: "", lastTransplanted: "" };
    const elapsedDays = daysSince(record.lastWatered);
    const detailUrl = publicFlowerUrl(baseUrl, flower.id);
    const intervalDays = flower.wateringIntervalDays ?? wateringIntervalsDays[flower.id] ?? 7;
    const wateringProgress = getWateringProgress(record.lastWatered, intervalDays);
    const quickActionLabel = route.scan ? "Naskenovaná rastlina" : "Rýchly záznam";
    const activeCarePreview = carePreview?.flowerId === flower.id ? carePreview : null;
    const careDiffRows = activeCarePreview ? getCareDiffRows(flower, activeCarePreview.nextCare, intervalDays) : [];
    const isEditingName = editingNameFlowerId === flower.id;
    const flowerDiagnostics = diagnostics.filter((diagnosis) => diagnosis.plantId === flower.id);

    return (
      <main className="app-shell detail-shell">
        <header className="detail-header">
          <a className="icon-link" href="#/" aria-label="Späť na prehľad">
            <ArrowLeft size={22} aria-hidden="true" />
          </a>
          <div>
            <p className="eyebrow">{flower.likelyName}</p>
            {isEditingName ? (
              <div className="plant-name-editor">
                <input
                  type="text"
                  value={draftFlowerName}
                  maxLength={70}
                  aria-label="Názov rastliny"
                  onChange={(event) => setDraftFlowerName(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") {
                      confirmNameEdit(flower);
                    }
                    if (event.key === "Escape") {
                      cancelNameEdit();
                    }
                  }}
                />
                <button
                  className="name-edit-action name-edit-save"
                  type="button"
                  onClick={() => confirmNameEdit(flower)}
                  disabled={!draftFlowerName.trim()}
                  aria-label="Uložiť názov rastliny"
                >
                  <Check size={18} aria-hidden="true" />
                </button>
                <button className="name-edit-action" type="button" onClick={cancelNameEdit} aria-label="Zrušiť úpravu názvu">
                  <X size={18} aria-hidden="true" />
                </button>
              </div>
            ) : (
              <div className="plant-title-row">
                <h1>{flower.displayName}</h1>
                <button className="name-edit-button" type="button" onClick={() => startNameEdit(flower)} aria-label="Upraviť názov rastliny">
                  <Pencil size={18} aria-hidden="true" />
                </button>
              </div>
            )}
          </div>
        </header>

        <img className="detail-photo" src={flower.image} alt={flower.displayName} />

        <section className="scan-action-panel" aria-labelledby="quick-action-title">
          <div>
            <span>{quickActionLabel}</span>
            <h2 id="quick-action-title">Čo sa dnes udialo?</h2>
            <p>Ulož dnešný dátum zálievky, presadenia alebo hnojenia jedným klepnutím.</p>
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
            <button
              className="ghost-action"
              type="button"
              onClick={() => updateRecord(flower.id, { lastFertilized: todayIsoDate() })}
            >
              <Leaf size={18} aria-hidden="true" />
              Pohnojená dnes
            </button>
          </div>
        </section>

        <section className="diagnosis-panel" aria-labelledby="diagnosis-title">
          <div>
            <div className="section-title">
              <Camera size={18} aria-hidden="true" />
              <h2 id="diagnosis-title">AI diagnostika problému</h2>
            </div>
            <p>Ak listy žltnú, hnednú alebo rastlina vädne, odfoť postihnutú časť a ulož výsledok do histórie.</p>
          </div>
          <button type="button" onClick={openDiagnosisModal}>
            <Camera size={18} aria-hidden="true" />
            Rastlina vyzerá zle
          </button>
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
          <div>
            <span>Pohnojené</span>
            <strong>{formatDate(record.lastFertilized)}</strong>
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
            <button
              className="ai-care-button"
              type="button"
              disabled={isGeneratingCarePreview}
              onClick={() => handleGenerateCarePreview(flower)}
            >
              <Sparkles size={16} aria-hidden="true" />
              {isGeneratingCarePreview ? "Generujem..." : "Generovať AI"}
            </button>
          </div>
          {carePreviewStatus ? <p className="care-preview-status">{carePreviewStatus}</p> : null}
          <p className="care-summary">{flower.shortCare}</p>
          <div className="care-pill-grid" aria-label="Rýchly profil starostlivosti">
            {flower.carePills.map((pill) => (
              <div className={`care-pill care-pill-${pill.tone}`} key={`${pill.label}-${pill.value}`}>
                {getCarePillVisual(pill.label, pill.value, intervalDays)}
                <div>
                  <span>{pill.label}</span>
                  <strong>{pill.value}</strong>
                </div>
              </div>
            ))}
          </div>
          <dl className="care-list">
            <div>
              <dt>
                {getCarePillVisual("Svetlo", flower.light, intervalDays)}
                <span>Svetlo</span>
              </dt>
              <dd>{flower.light}</dd>
            </div>
            <div>
              <dt>
                {getCarePillVisual("Zálievka", flower.watering, intervalDays)}
                <span>Zálievka</span>
              </dt>
              <dd>{flower.watering}</dd>
            </div>
            <div>
              <dt>
                {getCarePillVisual("Presádzanie", flower.soil, intervalDays)}
                <span>Substrát</span>
              </dt>
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
          <label className="toggle-field">
            <span>
              <Bell size={18} aria-hidden="true" />
              Notifikácie pre túto rastlinu
            </span>
            <input
              type="checkbox"
              checked={flower.notificationsEnabled !== false}
              onChange={(event) => updateFlower({ ...flower, notificationsEnabled: event.target.checked, source: "custom" })}
            />
          </label>
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
            <span>Dátum pohnojenia</span>
            <div className="date-row">
              <input
                type="date"
                value={record.lastFertilized}
                max="9999-12-31"
                onChange={(event) => updateRecord(flower.id, { lastFertilized: event.target.value })}
              />
              <button type="button" onClick={() => updateRecord(flower.id, { lastFertilized: todayIsoDate() })}>
                Dnes
              </button>
            </div>
          </label>
          <label className="field">
            <span>Poznámka</span>
            <textarea
              rows={5}
              placeholder="Pozorovania, plán presadenia alebo čokoľvek užitočné."
              value={record.note}
              onChange={(event) => updateRecord(flower.id, { note: event.target.value })}
            />
          </label>
        </section>

        <section className="diagnostic-history-panel" aria-labelledby="diagnostic-history-title">
          <div className="section-title">
            <Camera size={18} aria-hidden="true" />
            <h2 id="diagnostic-history-title">História diagnostiky</h2>
          </div>
          {flowerDiagnostics.length === 0 ? (
            <p>Zatiaľ tu nie je uložená žiadna diagnostika.</p>
          ) : (
            <div className="diagnostic-history-list">
              {flowerDiagnostics.map((diagnosis) => (
                <article className={`diagnostic-history-card diagnostic-risk-${diagnosis.riskLevel}`} key={diagnosis.id}>
                  <img src={diagnosis.imageDataUrl} alt={`Diagnostika ${diagnosis.diagnosisTitle}`} />
                  <div>
                    <span>{formatDate(diagnosis.createdAt.slice(0, 10))}</span>
                    <h3>{diagnosis.diagnosisTitle}</h3>
                    <p>
                      {diagnosis.confidence}% – {diagnosis.confidenceLabel} istota ·{" "}
                      {diagnosis.userConfirmation === "confirmed" ? "uložené ako správne" : "označené ako nesprávne"}
                    </p>
                    <ol>
                      {diagnosis.recommendedSteps.slice(0, 4).map((step) => (
                        <li key={step}>{step}</li>
                      ))}
                    </ol>
                    {diagnosis.userNote ? <small>Poznámka: {diagnosis.userNote}</small> : null}
                  </div>
                </article>
              ))}
            </div>
          )}
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

        <section className="danger-panel" aria-labelledby="delete-plant-title">
          <div>
            <div className="section-title danger-title">
              <Trash2 size={18} aria-hidden="true" />
              <h2 id="delete-plant-title">Odstrániť rastlinu</h2>
            </div>
            <p>Táto akcia odstráni rastlinu z tvojho zoznamu, dashboardu, QR exportu aj reportu.</p>
          </div>
          <button type="button" onClick={() => setDeleteFlowerId(flower.id)}>
            <Trash2 size={18} aria-hidden="true" />
            Odstrániť rastlinu
          </button>
        </section>

        {activeCarePreview ? (
          <div className="modal-backdrop" role="presentation">
            <section className="care-preview-modal" role="dialog" aria-modal="true" aria-labelledby="care-preview-title">
              <button className="modal-close" type="button" onClick={() => setCarePreview(null)} aria-label="Zavrieť">
                <X size={20} aria-hidden="true" />
              </button>
              <div className="section-title">
                <Sparkles size={20} aria-hidden="true" />
                <h2 id="care-preview-title">AI návrh starostlivosti</h2>
              </div>
              <p>
                Skontroluj zmeny pre rastlinu „{flower.displayName}”. Aktualizácia sa uloží až po potvrdení.
              </p>

              {careDiffRows.length > 0 ? (
                <div className="care-diff-list" aria-label="Zmeny v starostlivosti">
                  {careDiffRows.map((row) => (
                    <article className="care-diff-row" key={row.label}>
                      <h3>{row.label}</h3>
                      <div>
                        <span>Pôvodne</span>
                        <p>{row.currentValue}</p>
                      </div>
                      <div>
                        <span>Nahradiť za</span>
                        <p>{row.nextValue}</p>
                      </div>
                    </article>
                  ))}
                </div>
              ) : (
                <div className="care-diff-empty">
                  <BadgeCheck size={18} aria-hidden="true" />
                  AI nevrátila žiadne rozdiely oproti aktuálnej starostlivosti.
                </div>
              )}

              <div className="care-update-question">
                <strong>Chceš updatnúť info podľa tohto AI návrhu?</strong>
              </div>
              <div className="modal-actions">
                <button className="primary-action" type="button" onClick={confirmCareUpdate} disabled={careDiffRows.length === 0}>
                  Áno, updatnúť
                </button>
                <button className="neutral-action" type="button" onClick={() => setCarePreview(null)}>
                  Nie
                </button>
              </div>
            </section>
          </div>
        ) : null}

        {isDiagnosisModalOpen ? (
          <div className="modal-backdrop" role="presentation">
            <section className="diagnosis-modal" role="dialog" aria-modal="true" aria-labelledby="diagnosis-modal-title">
              <button className="modal-close" type="button" onClick={closeDiagnosisModal} aria-label="Zavrieť">
                <X size={20} aria-hidden="true" />
              </button>
              <div className="section-title">
                <Camera size={20} aria-hidden="true" />
                <h2 id="diagnosis-modal-title">Rastlina vyzerá zle</h2>
              </div>
              <p>Pridaj ostrú fotku postihnutého listu alebo časti rastliny. AI výsledok je iba odhad.</p>

              <label className="diagnosis-upload">
                <span className="image-upload-icon">
                  <ImagePlus size={19} aria-hidden="true" />
                </span>
                <span className="image-upload-copy">
                  <strong>Vybrať alebo odfotiť problém</strong>
                  <small>JPG, PNG, WEBP · max 8 MB</small>
                </span>
                <input
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  capture="environment"
                  onChange={(event) => {
                    void handleDiagnosisImageChange(event.target.files?.[0]);
                    event.target.value = "";
                  }}
                />
              </label>

              {diagnosisImageDataUrl ? <img className="diagnosis-preview" src={diagnosisImageDataUrl} alt="Náhľad diagnostickej fotky" /> : null}
              {diagnosisStatus ? <p className="care-preview-status">{diagnosisStatus}</p> : null}

              <button
                className="primary-action diagnosis-run-button"
                type="button"
                disabled={!diagnosisImageDataUrl || isDiagnosing}
                onClick={() => runPlantDiagnosis(flower)}
              >
                {isDiagnosing ? "Analyzujem..." : "Spustiť AI diagnostiku"}
              </button>

              {diagnosisDraft ? (
                <div className={`diagnosis-result diagnosis-risk-${diagnosisDraft.riskLevel}`}>
                  <div className="diagnosis-result-head">
                    <div>
                      <span>Diagnóza</span>
                      <h3>{diagnosisDraft.diagnosisTitle}</h3>
                    </div>
                    <strong>
                      {diagnosisDraft.confidence}% – {diagnosisDraft.confidenceLabel} istota
                    </strong>
                  </div>
                  <div className="diagnosis-result-grid">
                    <section>
                      <h4>AI si všimla</h4>
                      <ul>
                        {diagnosisDraft.observedSymptoms.map((symptom) => (
                          <li key={symptom}>{symptom}</li>
                        ))}
                      </ul>
                    </section>
                    <section>
                      <h4>Odporúčané kroky</h4>
                      <ol>
                        {diagnosisDraft.recommendedSteps.map((step) => (
                          <li key={step}>{step}</li>
                        ))}
                      </ol>
                    </section>
                  </div>
                  <section>
                    <h4>Prečo táto diagnóza</h4>
                    <p>{diagnosisDraft.reasoningSummary}</p>
                  </section>
                  <small>{diagnosisDraft.disclaimer}</small>
                  <label className="field">
                    <span>Upraviť poznámku pred uložením</span>
                    <textarea
                      rows={3}
                      value={diagnosisUserNote}
                      placeholder="Voliteľná vlastná poznámka k diagnostike."
                      onChange={(event) => setDiagnosisUserNote(event.target.value)}
                    />
                  </label>
                  <div className="modal-actions">
                    <button className="primary-action" type="button" onClick={() => savePlantDiagnosis(flower, "confirmed")}>
                      Uložiť diagnostiku
                    </button>
                    <button className="neutral-action" type="button" onClick={() => savePlantDiagnosis(flower, "rejected")}>
                      Nie je to správne
                    </button>
                  </div>
                </div>
              ) : null}
            </section>
          </div>
        ) : null}

        {deleteFlowerId === flower.id ? (
          <div className="modal-backdrop" role="presentation">
            <section className="confirm-modal" role="dialog" aria-modal="true" aria-labelledby="delete-confirm-title">
              <div className="section-title danger-title">
                <Trash2 size={20} aria-hidden="true" />
                <h2 id="delete-confirm-title">Naozaj si želáš danú rastlinu odstrániť?</h2>
              </div>
              <p>Rastlina „{flower.displayName}” sa odstráni z tvojho zoznamu. Táto akcia sa nedá vrátiť späť.</p>
              <div className="modal-actions">
                <button className="danger-action" type="button" onClick={confirmRemoveCustomFlower}>
                  Áno, odstrániť
                </button>
                <button className="neutral-action" type="button" onClick={() => setDeleteFlowerId("")}>
                  Nie
                </button>
              </div>
            </section>
          </div>
        ) : null}
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
          <div className="household-panel household-panel-compact" aria-label="Aktívna domácnosť">
            <div>
              <span>Domácnosť</span>
              <strong>{activeHousehold.name}</strong>
              {householdLinkStatus ? <small>{householdLinkStatus}</small> : null}
            </div>
            <div className="household-actions">
              <button type="button" onClick={copyHouseholdLink}>
                <Copy size={17} aria-hidden="true" />
                Kopírovať link
              </button>
              <button type="button" onClick={changeHousehold}>
                Zmeniť domácnosť
              </button>
            </div>
          </div>
          <div className="push-settings">
            <div>
              <div className="section-title">
                {pushEnabled ? <Bell size={18} aria-hidden="true" /> : <BellOff size={18} aria-hidden="true" />}
                <h2>Mobilné push notifikácie</h2>
              </div>
              <p>
                Push notifikácia sa pošle ráno iba vtedy, keď sú rastliny na zálievku dnes. Prázdna notifikácia sa neposiela.
              </p>
              {pushStatus ? <small>{pushStatus}</small> : null}
            </div>
            <button type="button" onClick={pushEnabled ? disablePushNotifications : enablePushNotifications}>
              {pushEnabled ? "Vypnúť push" : "Zapnúť push"}
            </button>
          </div>
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
          <button className="qr-action add-plant-trigger" type="button" onClick={() => setIsAddPlantModalOpen(true)}>
            <Plus size={20} aria-hidden="true" />
            Pridať rastlinu
          </button>
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

      <section className="household-panel" aria-label="Aktívna domácnosť">
        <div>
          <span>Domácnosť</span>
          <strong>{activeHousehold.name}</strong>
          {householdLinkStatus ? <small>{householdLinkStatus}</small> : null}
        </div>
        <div className="household-actions">
          <button type="button" onClick={copyHouseholdLink}>
            <Copy size={17} aria-hidden="true" />
            Kopírovať link
          </button>
          <button type="button" onClick={changeHousehold}>
            Zmeniť domácnosť
          </button>
        </div>
      </section>

      {isAddPlantModalOpen ? (
        <div className="modal-backdrop" role="presentation">
          <section className="plant-modal" role="dialog" aria-modal="true" aria-labelledby="add-plant-title">
            <button className="modal-close" type="button" onClick={() => setIsAddPlantModalOpen(false)} aria-label="Zavrieť">
              <X size={20} aria-hidden="true" />
            </button>
            <div className="section-title">
              <Plus size={18} aria-hidden="true" />
              <h2 id="add-plant-title">Pridať novú rastlinu</h2>
            </div>
            <p>
              Zadaj názov a pridaj fotku. AI starostlivosť sa vygeneruje iba pre túto novú rastlinu;
              existujúce rastliny sa tým nemenia.
            </p>
            <form className="add-plant-form modal-form" onSubmit={handleAddCustomFlower}>
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
                <label className="image-upload">
                  <input
                    type="file"
                    accept="image/*"
                    onChange={(event) => setNewPlantImageFile(event.target.files?.[0] ?? null)}
                  />
                  <span className="image-upload-icon">
                    <ImagePlus size={22} aria-hidden="true" />
                  </span>
                  <span className="image-upload-copy">
                    <strong>{newPlantImageFile ? newPlantImageFile.name : "Vybrať fotku"}</strong>
                    <small>{newPlantImageFile ? "Fotka je pripravená" : "JPG, PNG alebo fotka z mobilu"}</small>
                  </span>
                </label>
              </label>
              <button type="submit" disabled={isAddingPlant}>
                <Plus size={18} aria-hidden="true" />
                {isAddingPlant ? "Pridávam..." : "Pridať rastlinu"}
              </button>
            </form>
            {newPlantStatus ? <div className="report-status">{newPlantStatus}</div> : null}
          </section>
        </div>
      ) : null}

      <section className="flower-grid" aria-label="Prehľad rastlín">
        {filteredFlowers.map((flower) => {
          const record = records[flower.id] ?? { lastFertilized: "", note: "", lastWatered: "", lastTransplanted: "" };
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
                  <span>
                    <Leaf size={15} aria-hidden="true" />
                    {formatDate(record.lastFertilized)}
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
