import QRCode from "qrcode";
import type { Flower } from "../data/flowers";
import { flowerPath } from "./links";

export const qrLabelSpec = {
  pageWidthMm: 210,
  pageHeightMm: 297,
  pageMarginMm: 10,
  labelSizeMm: 16,
  qrSizeMm: 14,
  quietZoneMm: 1,
  labelGapMm: 4,
};

export type QrLabelLayoutItem = {
  flowerId: string;
  payload: string;
  xMm: number;
  yMm: number;
  labelSizeMm: number;
  qrSizeMm: number;
};

const normalizeBaseUrl = (value: string) => {
  const trimmed = value.trim();
  if (!trimmed) {
    return "";
  }

  return trimmed.endsWith("/") ? trimmed.slice(0, -1) : trimmed;
};

const createQrPayload = (baseUrl: string, flowerId: string) =>
  `${normalizeBaseUrl(baseUrl)}${flowerPath(flowerId, true)}`;

export const createQrLabelLayout = (flowers: Flower[], baseUrl: string): QrLabelLayoutItem[] => {
  const { labelGapMm, labelSizeMm, pageHeightMm, pageMarginMm, pageWidthMm, qrSizeMm } = qrLabelSpec;
  const stepMm = labelSizeMm + labelGapMm;
  const columns = Math.floor((pageWidthMm - pageMarginMm * 2 + labelGapMm) / stepMm);
  const rows = Math.floor((pageHeightMm - pageMarginMm * 2 + labelGapMm) / stepMm);
  const labelsPerPage = columns * rows;

  return flowers.map((flower, index) => {
    const pageIndex = index % labelsPerPage;
    const column = pageIndex % columns;
    const row = Math.floor(pageIndex / columns);

    return {
      flowerId: flower.id,
      labelSizeMm,
      payload: createQrPayload(baseUrl, flower.id),
      qrSizeMm,
      xMm: pageMarginMm + column * stepMm,
      yMm: pageMarginMm + row * stepMm,
    };
  });
};

export const validateQrLabelLayout = (items: QrLabelLayoutItem[]) => {
  const invalidItem = items.find(
    (item) =>
      item.labelSizeMm !== qrLabelSpec.labelSizeMm ||
      item.qrSizeMm !== qrLabelSpec.qrSizeMm ||
      !item.payload.includes(encodeURIComponent(item.flowerId)),
  );

  return {
    isValid: !invalidItem,
    message: invalidItem
      ? `Neplatný QR štítok pre ${invalidItem.flowerId}. Očakávaný rozmer je 16 x 16 mm a payload musí obsahovať plantId.`
      : "QR štítky majú rozmer 16 x 16 mm a payload obsahuje plantId.",
  };
};

export const exportQrLabelsPdf = async (flowers: Flower[], baseUrl: string) => {
  if (flowers.length === 0) {
    throw new Error("Nie sú dostupné žiadne rastliny na export.");
  }

  const layout = createQrLabelLayout(flowers, baseUrl);
  const validation = validateQrLabelLayout(layout);

  if (!validation.isValid) {
    throw new Error(validation.message);
  }

  const { labelGapMm, labelSizeMm, pageMarginMm, pageWidthMm, qrSizeMm, quietZoneMm } = qrLabelSpec;
  const stepMm = labelSizeMm + labelGapMm;
  const columns = Math.floor((pageWidthMm - pageMarginMm * 2 + labelGapMm) / stepMm);
  const rowsPerPage = Math.floor((qrLabelSpec.pageHeightMm - pageMarginMm * 2 + labelGapMm) / stepMm);
  const labelsPerPage = columns * rowsPerPage;
  const { default: jsPDF } = await import("jspdf");
  const pdf = new jsPDF({ format: "a4", orientation: "portrait", unit: "mm" });

  pdf.setProperties({
    author: "FlowerScan",
    subject: "Tlačiteľné QR štítky pre rastliny",
    title: "FlowerScan QR labels",
  });

  for (const [index, item] of layout.entries()) {
    if (index > 0 && index % labelsPerPage === 0) {
      pdf.addPage();
    }

    pdf.setFillColor(255, 255, 255);
    pdf.rect(item.xMm, item.yMm, labelSizeMm, labelSizeMm, "F");
    pdf.setDrawColor(190, 190, 190);
    pdf.setLineWidth(0.12);
    pdf.rect(item.xMm, item.yMm, labelSizeMm, labelSizeMm, "S");

    const qrDataUrl = await QRCode.toDataURL(item.payload, {
      color: {
        dark: "#000000",
        light: "#ffffff",
      },
      errorCorrectionLevel: "M",
      margin: 2,
      width: 256,
    });

    pdf.addImage(
      qrDataUrl,
      "PNG",
      item.xMm + quietZoneMm,
      item.yMm + quietZoneMm,
      qrSizeMm,
      qrSizeMm,
    );
  }

  pdf.save("flowerscan-qr-labels-a4.pdf");
};
