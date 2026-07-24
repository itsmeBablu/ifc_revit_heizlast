import { jsPDF } from "jspdf";
import { autoTable } from "jspdf-autotable";
import {
  heizlastStopsFor,
  resolveStopsForRange,
  temperatureLegendStops,
  type ColorPaletteId,
} from "@/lib/colorMapping";
import type { ColorMode, Room } from "@/lib/types";

export type PdfViewPage = {
  title: string;
  viewportDataUrl: string | null;
};

export type PdfExportInput = {
  /** One or more 3D snapshots (current and/or saved views). */
  views: PdfViewPage[];
  modelName: string;
  rooms: Room[];
  colorMode: ColorMode;
  palette: ColorPaletteId;
  heizlastRange: number[];
  temperatureRange: number[];
};

function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace("#", "");
  const n = parseInt(
    h.length === 3 ? h.split("").map((c) => c + c).join("") : h,
    16,
  );
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function sanitizeFilePart(s: string): string {
  return (
    s
      .trim()
      .replace(/[^\w\-]+/g, "-")
      .replace(/-+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 60) || "model"
  );
}

function drawLegend(
  doc: jsPDF,
  x: number,
  y: number,
  width: number,
  input: PdfExportInput,
): number {
  const isHeat = input.colorMode === "heizlast";
  doc.setFontSize(10);
  doc.setTextColor(40);
  doc.text(
    isHeat ? "Legend — Heizlast (W/m²)" : "Legend — Temperature (°C)",
    x,
    y,
  );
  let cy = y + 4;

  if (isHeat) {
    const stops = resolveStopsForRange(
      heizlastStopsFor(input.palette),
      input.heizlastRange,
    );
    const barH = 8;
    const segW = width / Math.max(1, stops.length);
    for (let i = 0; i < stops.length; i++) {
      const [r, g, b] = hexToRgb(stops[i].color);
      doc.setFillColor(r, g, b);
      doc.rect(
        x + i * segW,
        cy,
        segW + (i < stops.length - 1 ? 0.15 : 0),
        barH,
        "F",
      );
    }

    doc.setFontSize(7);
    doc.setTextColor(80);
    for (let i = 0; i < stops.length; i++) {
      const tx = x + (i + 0.5) * segW;
      doc.text(String(stops[i].value), tx, cy + barH + 4, { align: "center" });
    }
    return cy + barH + 10;
  }

  const chips = temperatureLegendStops(input.palette, input.temperatureRange);
  const chipW = Math.min(22, width / Math.max(1, chips.length) - 2);
  chips.forEach((s, i) => {
    const cx = x + i * (chipW + 2);
    const [r, g, b] = hexToRgb(s.color);
    doc.setFillColor(r, g, b);
    doc.roundedRect(cx, cy, chipW, 8, 1, 1, "F");
    doc.setFontSize(7);
    doc.setTextColor(40);
    doc.text(`${s.value}°`, cx + chipW / 2, cy + 12, { align: "center" });
  });
  return cy + 18;
}

function addViewportImage(
  doc: jsPDF,
  dataUrl: string | null,
  x: number,
  y: number,
  w: number,
  h: number,
) {
  if (dataUrl) {
    try {
      doc.addImage(dataUrl, "PNG", x, y, w, h, undefined, "FAST");
      return;
    } catch {
      // fall through
    }
  }
  doc.setFontSize(10);
  doc.setTextColor(150);
  doc.text("3D viewport could not be captured", x, y + 20);
}

/** Build and download a Heizlast report PDF (multi-view capable). */
export function exportHeizlastPdf(input: PdfExportInput): void {
  const views =
    input.views.length > 0
      ? input.views
      : [{ title: "Current view", viewportDataUrl: null }];

  const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const margin = 12;
  const contentW = pageW - margin * 2;

  const today = new Date();
  const dateStr = today.toISOString().slice(0, 10);
  const title = input.modelName || "IFC Model";

  const first = views[0];
  doc.setFontSize(14);
  doc.setTextColor(20);
  doc.text(title, margin, margin + 2);
  doc.setFontSize(9);
  doc.setTextColor(100);
  doc.text(`Heizlast report · ${dateStr}`, margin, margin + 8);
  if (first.title) {
    doc.setFontSize(10);
    doc.setTextColor(50);
    doc.text(first.title, margin, margin + 14);
  }

  let y = margin + 18;
  const viewH = pageH * 0.5;
  const viewW = contentW * 0.72;

  addViewportImage(doc, first.viewportDataUrl, margin, y, viewW, viewH);
  drawLegend(doc, margin + viewW + 6, y + 4, contentW - viewW - 6, input);

  const tableStartY = y + viewH + 8;
  const body = input.rooms.map((r) => [
    r.name || "—",
    r.number || "—",
    Number.isFinite(r.heatLoad) ? r.heatLoad.toFixed(1) : "—",
    Number.isFinite(r.temperature) ? String(r.temperature) : "—",
  ]);

  autoTable(doc, {
    startY: tableStartY,
    head: [["Name", "Number", "Heizlast (W/m²)", "Temperature (°C)"]],
    body,
    margin: { left: margin, right: margin },
    styles: { fontSize: 8, cellPadding: 1.5 },
    headStyles: { fillColor: [40, 40, 48], textColor: 255 },
    alternateRowStyles: { fillColor: [245, 246, 248] },
  });

  // Extra pages for additional selected views
  for (let i = 1; i < views.length; i++) {
    const v = views[i];
    doc.addPage();
    doc.setFontSize(14);
    doc.setTextColor(20);
    doc.text(title, margin, margin + 2);
    doc.setFontSize(10);
    doc.setTextColor(50);
    doc.text(v.title, margin, margin + 10);
    const imgH = pageH - margin * 2 - 14;
    const imgW = contentW;
    addViewportImage(doc, v.viewportDataUrl, margin, margin + 14, imgW, imgH);
  }

  const file = `${sanitizeFilePart(title)}-heizlast-report-${dateStr}.pdf`;
  doc.save(file);
}
