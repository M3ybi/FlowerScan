import { useEffect, useState } from "react";
import QRCode from "qrcode";
import { createTranslator } from "../lib/i18n";
import type { PlantieLanguage } from "../lib/onboarding";

type QrCodeProps = {
  value: string;
  label: string;
  language?: PlantieLanguage | null;
  size?: number;
};

export const QrCode = ({ value, label, language = null, size = 132 }: QrCodeProps) => {
  const [src, setSrc] = useState("");
  const t = createTranslator(language);

  useEffect(() => {
    let active = true;

    QRCode.toDataURL(value, {
      errorCorrectionLevel: "M",
      margin: 2,
      width: size,
      color: {
        dark: "#16352a",
        light: "#ffffff",
      },
    })
      .then((dataUrl) => {
        if (active) {
          setSrc(dataUrl);
        }
      })
      .catch(() => {
        if (active) {
          setSrc("");
        }
      });

    return () => {
      active = false;
    };
  }, [size, value]);

  if (!src) {
    return <div className="qr-placeholder" aria-label={t("qr.generatingFor", { label })} />;
  }

  return <img className="qr-image" src={src} width={size} height={size} alt={t("qr.codeFor", { label })} />;
};
