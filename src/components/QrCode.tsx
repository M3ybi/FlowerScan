import { useEffect, useState } from "react";
import QRCode from "qrcode";

type QrCodeProps = {
  value: string;
  label: string;
  size?: number;
};

export const QrCode = ({ value, label, size = 132 }: QrCodeProps) => {
  const [src, setSrc] = useState("");

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
    return <div className="qr-placeholder" aria-label={`Generuje sa QR kód pre ${label}`} />;
  }

  return <img className="qr-image" src={src} width={size} height={size} alt={`QR kód pre ${label}`} />;
};
