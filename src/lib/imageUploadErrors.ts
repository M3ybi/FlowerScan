export type ImageErrorCode = "ORIGINAL_IMAGE_TOO_LARGE" | "IMAGE_TOO_LARGE" | "UNSUPPORTED_IMAGE_FORMAT" |
  "INVALID_IMAGE" | "IMAGE_COMPRESSION_FAILED" | "IMAGE_VALIDATION_FAILED" | "IMAGE_UPLOAD_FAILED" |
  "AUTHENTICATION_REQUIRED" | "HOUSEHOLD_ACCESS_DENIED" | "IMAGE_NETWORK_TIMEOUT" | "IMAGE_NETWORK_FAILED" | "IMAGE_SERVICE_UNAVAILABLE" |
  "IMAGE_SELECTION_FAILED" | "IMAGE_READ_FAILED" | "IMAGE_DECODE_FAILED" | "IMAGE_DECODE_LIMIT" | "CAMERA_PERMISSION_DENIED";

const english: Record<ImageErrorCode, string> = {
  IMAGE_DECODE_LIMIT: "This HEIC photo needs too much decoding memory. Choose a resized JPEG or PNG export.",
  IMAGE_SELECTION_FAILED: "The photo picker could not open. Close it and try choosing a photo again.",
  IMAGE_READ_FAILED: "The selected photo could not be read. Download it to your device or choose another photo.",
  IMAGE_DECODE_FAILED: "The photo could not be decoded. Choose another photo.",
  CAMERA_PERMISSION_DENIED: "Allow camera or photo access in your device settings, then try again.",
  ORIGINAL_IMAGE_TOO_LARGE: "The original photo exceeds 15 MB. Choose a smaller photo.",
  IMAGE_TOO_LARGE: "The processed photo exceeds 2 MB. Choose another photo.",
  UNSUPPORTED_IMAGE_FORMAT: "Choose a JPEG, PNG or WebP photo. Renaming a file does not convert it.",
  INVALID_IMAGE: "This photo is empty, corrupted or unreadable. Choose another photo.",
  IMAGE_COMPRESSION_FAILED: "The photo could not be processed. Choose another photo.",
  IMAGE_VALIDATION_FAILED: "Use a clear plant photo without people, private documents or sensitive background content.",
  IMAGE_UPLOAD_FAILED: "The photo could not be stored. Your form is preserved; please try again.",
  AUTHENTICATION_REQUIRED: "Sign in again before uploading the photo.",
  HOUSEHOLD_ACCESS_DENIED: "You need active plant-management access to this household to upload a photo.",
  IMAGE_NETWORK_TIMEOUT: "The image request timed out. Check your connection and try again.",
  IMAGE_NETWORK_FAILED: "The image service could not be reached. Check your connection and try again.",
  IMAGE_SERVICE_UNAVAILABLE: "Image processing is temporarily unavailable. Please try again.",
};
const slovak: Record<ImageErrorCode, string> = {
  IMAGE_DECODE_LIMIT: "Táto HEIC fotka potrebuje priveľa pamäte na spracovanie. Vyber zmenšenú verziu vo formáte JPEG alebo PNG.",
  IMAGE_SELECTION_FAILED: "Výber fotografií sa nepodarilo otvoriť. Zavri ho a skús vybrať fotku znova.",
  IMAGE_READ_FAILED: "Vybranú fotografiu sa nepodarilo načítať. Stiahni ju do zariadenia alebo vyber inú fotografiu.",
  IMAGE_DECODE_FAILED: "Fotografiu sa nepodarilo načítať. Skús inú fotografiu.",
  CAMERA_PERMISSION_DENIED: "V nastaveniach zariadenia povoľ prístup ku kamere alebo fotografiám a skús to znova.",
  ORIGINAL_IMAGE_TOO_LARGE: "Pôvodná fotka presahuje 15 MB. Vyber menšiu fotku.",
  IMAGE_TOO_LARGE: "Spracovaná fotka presahuje 2 MB. Vyber inú fotku.",
  UNSUPPORTED_IMAGE_FORMAT: "Vyber fotku JPEG, PNG alebo WebP. Premenovanie súboru nezmení jeho formát.",
  INVALID_IMAGE: "Fotka je prázdna, poškodená alebo sa nedá načítať. Vyber inú fotku.",
  IMAGE_COMPRESSION_FAILED: "Fotografiu sa nepodarilo spracovať. Skús inú fotografiu.",
  IMAGE_VALIDATION_FAILED: "Použi jasnú fotku rastliny bez ľudí, súkromných dokumentov a citlivého pozadia.",
  IMAGE_UPLOAD_FAILED: "Fotku sa nepodarilo uložiť. Formulár zostal vyplnený; skús to znova.",
  AUTHENTICATION_REQUIRED: "Pred nahraním fotky sa znova prihlás.",
  HOUSEHOLD_ACCESS_DENIED: "Na nahranie fotky potrebuješ aktívny prístup k rastlinám v tejto domácnosti.",
  IMAGE_NETWORK_TIMEOUT: "Čas na spracovanie fotky vypršal. Skontroluj pripojenie a skús to znova.",
  IMAGE_NETWORK_FAILED: "Služba na spracovanie fotiek je nedostupná. Skontroluj pripojenie a skús to znova.",
  IMAGE_SERVICE_UNAVAILABLE: "Spracovanie fotiek je dočasne nedostupné. Skús to znova.",
};

export class ImageUploadError extends Error {
  stage?: string;
  detectedMime?: string;
  constructor(public readonly code: ImageErrorCode, public readonly status = 400, public readonly cause?: unknown) {
    super(english[code]);
    this.name = "ImageUploadError";
  }
}
export const isImageSelectionCancelled = (error: unknown) => {
  const name = (error as { name?: unknown } | null)?.name;
  const code = (error as { code?: unknown } | null)?.code;
  const message = error instanceof Error ? error.message : "";
  return name === "AbortError" || code === "USER_CANCELLED" || /^(user cancelled|user canceled|no image picked)/i.test(message);
};

export const isImageDiagnosticEnabled = () => Boolean((import.meta as ImportMeta & { env?: { DEV?: boolean } }).env?.DEV)
  || (typeof location !== "undefined" && new URLSearchParams(location.search).get("imageDebug") === "1");

const imageBrowserCategory = () => {
  const ua = typeof navigator === "undefined" ? "" : navigator.userAgent;
  if (/iPad|iPhone|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1)) {
    return /CriOS/.test(ua) ? "ios-chrome" : /Version\/.+Safari\//.test(ua) ? "ios-safari" : "ios-browser";
  }
  if (/Android/.test(ua)) return /Chrome\//.test(ua) ? "android-chromium" : "android-browser";
  return /Chrome\//.test(ua) ? "desktop-chromium" : /AppleWebKit/.test(ua) ? "desktop-webkit" : "other";
};
export const imageDiagnosticReference = (error: ImageUploadError) =>
  isImageDiagnosticEnabled() ? ` [${error.stage ?? "selection"}/${error.code}]` : "";

export const logImageProcessingFailure = (stage: string, error: unknown, context?: { runtime: "web" | "android" | "ios"; inputMime?: string; detectedMime?: string; originalBytes?: number }) => {
  if (!isImageDiagnosticEnabled()) return;
  // Never log files, URLs, names, provider messages, credentials or image bytes.
  const technicalError = error instanceof ImageUploadError ? error.cause : error;
  const name = technicalError instanceof Error && ["NotReadableError", "InvalidStateError", "SecurityError", "EncodingError", "AbortError", "TypeError", "RangeError", "NotSupportedError", "TimeoutError"].includes(technicalError.name)
    ? technicalError.name : "Error";
  const mime = context?.inputMime;
  const inputMime = mime && ["image/jpeg", "image/jpg", "image/png", "image/webp", "image/heic", "image/heif", "image/heic-sequence", "image/heif-sequence", "application/octet-stream"].includes(mime) ? mime : "unknown";
  const size = context?.originalBytes;
  const detected = context?.detectedMime ?? (error instanceof ImageUploadError ? error.detectedMime : undefined);
  const detectedMime = detected && ["image/jpeg", "image/png", "image/webp", "image/heic", "image/heif", "image/avif"].includes(detected) ? detected : "unknown";
  console.debug("[plantie:image]", { stage, name, runtime: context?.runtime, browser: imageBrowserCategory(), inputMime, detectedMime,
    originalBytes: typeof size === "number" && Number.isSafeInteger(size) && size >= 0 ? size : undefined,
    code: error instanceof ImageUploadError ? error.code : undefined });
};
const localized: Record<string, Record<ImageErrorCode, string>> = {
  en: english, sk: slovak,
  de: {
    IMAGE_DECODE_LIMIT: "Dieses HEIC-Foto benötigt zu viel Speicher. Wähle einen verkleinerten JPEG- oder PNG-Export.",
    IMAGE_SELECTION_FAILED: "Die Fotoauswahl konnte nicht geöffnet werden. Schließe sie und versuche es erneut.",
    ORIGINAL_IMAGE_TOO_LARGE: "Das Originalfoto ist größer als 15 MB. Wähle ein kleineres Foto.",
    IMAGE_TOO_LARGE: "Das bearbeitete Foto ist größer als 2 MB. Wähle ein anderes Foto.",
    UNSUPPORTED_IMAGE_FORMAT: "Dieses Fotoformat wird nicht unterstützt. Wähle JPEG, PNG oder WebP.",
    INVALID_IMAGE: "Das Foto ist leer, beschädigt oder ungültig. Wähle ein anderes Foto.",
    IMAGE_READ_FAILED: "Das ausgewählte Foto konnte nicht gelesen werden. Lade es auf dein Gerät herunter oder wähle ein anderes Foto.",
    IMAGE_DECODE_FAILED: "Das Foto konnte nicht geladen werden. Wähle ein anderes Foto.",
    IMAGE_COMPRESSION_FAILED: "Das Foto konnte nicht verarbeitet werden. Wähle ein anderes Foto.",
    IMAGE_VALIDATION_FAILED: "Verwende ein klares Pflanzenfoto ohne Personen, private Dokumente oder sensible Inhalte.",
    IMAGE_UPLOAD_FAILED: "Das Foto konnte nicht hochgeladen werden. Dein Formular bleibt erhalten. Versuche es erneut.",
    AUTHENTICATION_REQUIRED: "Melde dich vor dem Hochladen erneut an.",
    HOUSEHOLD_ACCESS_DENIED: "Du hast keine Berechtigung, Fotos in diesen Haushalt hochzuladen.",
    CAMERA_PERMISSION_DENIED: "Erlaube den Kamera- oder Fotozugriff in den Geräteeinstellungen und versuche es erneut.",
    IMAGE_NETWORK_TIMEOUT: "Die Fotoanfrage hat zu lange gedauert. Prüfe deine Verbindung und versuche es erneut.",
    IMAGE_NETWORK_FAILED: "Der Fotodienst ist nicht erreichbar. Prüfe deine Verbindung und versuche es erneut.",
    IMAGE_SERVICE_UNAVAILABLE: "Die Fotoverarbeitung ist vorübergehend nicht verfügbar. Versuche es erneut.",
  },
  fr: {
    IMAGE_DECODE_LIMIT: "Cette photo HEIC nécessite trop de mémoire. Choisissez un export JPEG ou PNG réduit.",
    IMAGE_SELECTION_FAILED: "Impossible d’ouvrir le sélecteur de photos. Fermez-le et réessayez.",
    ORIGINAL_IMAGE_TOO_LARGE: "La photo originale dépasse 15 Mo. Choisissez une photo plus petite.",
    IMAGE_TOO_LARGE: "La photo traitée dépasse 2 Mo. Choisissez une autre photo.",
    UNSUPPORTED_IMAGE_FORMAT: "Ce format de photo n’est pas pris en charge. Choisissez JPEG, PNG ou WebP.",
    INVALID_IMAGE: "La photo est vide, endommagée ou invalide. Choisissez une autre photo.",
    IMAGE_READ_FAILED: "Impossible de lire la photo sélectionnée. Téléchargez-la sur votre appareil ou choisissez-en une autre.",
    IMAGE_DECODE_FAILED: "Impossible de charger la photo. Choisissez une autre photo.",
    IMAGE_COMPRESSION_FAILED: "Impossible de traiter la photo. Choisissez une autre photo.",
    IMAGE_VALIDATION_FAILED: "Utilisez une photo nette de plante sans personnes, documents privés ni contenu sensible.",
    IMAGE_UPLOAD_FAILED: "Impossible de téléverser la photo. Votre formulaire est conservé. Réessayez.",
    AUTHENTICATION_REQUIRED: "Reconnectez-vous avant de téléverser la photo.",
    HOUSEHOLD_ACCESS_DENIED: "Vous n’avez pas l’autorisation de téléverser une photo dans ce foyer.",
    CAMERA_PERMISSION_DENIED: "Autorisez l’accès à la caméra ou aux photos dans les réglages de l’appareil, puis réessayez.",
    IMAGE_NETWORK_TIMEOUT: "La demande a expiré. Vérifiez votre connexion et réessayez.",
    IMAGE_NETWORK_FAILED: "Le service photo est inaccessible. Vérifiez votre connexion et réessayez.",
    IMAGE_SERVICE_UNAVAILABLE: "Le traitement des photos est temporairement indisponible. Réessayez.",
  },
  es: {
    IMAGE_DECODE_LIMIT: "Esta foto HEIC necesita demasiada memoria. Elige una versión JPEG o PNG de menor resolución.",
    IMAGE_SELECTION_FAILED: "No se pudo abrir el selector de fotos. Ciérralo e inténtalo de nuevo.",
    ORIGINAL_IMAGE_TOO_LARGE: "La foto original supera los 15 MB. Elige una foto más pequeña.",
    IMAGE_TOO_LARGE: "La foto procesada supera los 2 MB. Elige otra foto.",
    UNSUPPORTED_IMAGE_FORMAT: "Este formato de foto no es compatible. Elige JPEG, PNG o WebP.",
    INVALID_IMAGE: "La foto está vacía, dañada o no es válida. Elige otra foto.",
    IMAGE_READ_FAILED: "No se pudo leer la foto seleccionada. Descárgala en tu dispositivo o elige otra foto.",
    IMAGE_DECODE_FAILED: "No se pudo cargar la foto. Elige otra foto.",
    IMAGE_COMPRESSION_FAILED: "No se pudo procesar la foto. Elige otra foto.",
    IMAGE_VALIDATION_FAILED: "Usa una foto clara de una planta sin personas, documentos privados ni contenido sensible.",
    IMAGE_UPLOAD_FAILED: "No se pudo subir la foto. Se conserva el formulario. Inténtalo de nuevo.",
    AUTHENTICATION_REQUIRED: "Inicia sesión de nuevo antes de subir la foto.",
    HOUSEHOLD_ACCESS_DENIED: "No tienes permiso para subir fotos a este hogar.",
    CAMERA_PERMISSION_DENIED: "Permite el acceso a la cámara o las fotos en los ajustes del dispositivo e inténtalo de nuevo.",
    IMAGE_NETWORK_TIMEOUT: "La solicitud de foto agotó el tiempo. Revisa tu conexión e inténtalo de nuevo.",
    IMAGE_NETWORK_FAILED: "No se puede acceder al servicio de fotos. Revisa tu conexión e inténtalo de nuevo.",
    IMAGE_SERVICE_UNAVAILABLE: "El procesamiento de fotos no está disponible temporalmente. Inténtalo de nuevo.",
  },
};
export const imageErrorMessage = (error: unknown, language: unknown): string | null => {
  const copy = typeof language === "string" && Object.prototype.hasOwnProperty.call(localized, language) ? localized[language] : english;
  return error instanceof ImageUploadError ? copy[error.code] : null;
};

export const imageErrorFromResponse = async (error: unknown): Promise<ImageUploadError | null> => {
  if (error instanceof ImageUploadError) return error;
  const context = (error as { context?: unknown } | null)?.context;
  if (context instanceof Response) {
    try {
      const payload = await context.clone().json() as { code?: unknown };
      if (typeof payload.code === "string" && Object.prototype.hasOwnProperty.call(english, payload.code)) {
        return new ImageUploadError(payload.code as ImageErrorCode, context.status);
      }
    } catch { /* Use only public error codes, never provider diagnostics. */ }
    if (context.status === 401) return new ImageUploadError("AUTHENTICATION_REQUIRED", 401);
  }
  if (error instanceof Error && ["AbortError", "TimeoutError"].includes(error.name)) {
    return new ImageUploadError("IMAGE_NETWORK_TIMEOUT", 504);
  }
  if (error instanceof Error && ["TypeError", "FunctionsFetchError"].includes(error.name)) return new ImageUploadError("IMAGE_NETWORK_FAILED", 502);
  return null;
};
