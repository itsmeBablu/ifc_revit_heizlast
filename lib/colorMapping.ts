type RGB = [number, number, number];

function hexToRgb(hex: string): RGB {
  const h = hex.replace("#", "");
  return [
    parseInt(h.slice(0, 2), 16),
    parseInt(h.slice(2, 4), 16),
    parseInt(h.slice(4, 6), 16),
  ];
}

function rgbToHex([r, g, b]: RGB): string {
  const toHex = (n: number) =>
    Math.round(Math.max(0, Math.min(255, n)))
      .toString(16)
      .padStart(2, "0");
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

function lerpRgb(a: RGB, b: RGB, t: number): RGB {
  return [
    a[0] + (b[0] - a[0]) * t,
    a[1] + (b[1] - a[1]) * t,
    a[2] + (b[2] - a[2]) * t,
  ];
}

export type ColorStop = { value: number; color: string };

export type ColorPaletteId = "standard" | "softPastel" | "warmPastel";

export type ColorPalette = {
  id: ColorPaletteId;
  name: string;
  heizlastStops: ColorStop[];
  temperatureStops: ColorStop[];
};

/** Original vivid Heizlast / temperature anchors. */
const STANDARD_HEIZLAST: ColorStop[] = [
  { value: Number.NEGATIVE_INFINITY, color: "#87CEEB" },
  { value: 0, color: "#0050FF" },
  { value: 10, color: "#0050FF" },
  { value: 20, color: "#FFFFB4" },
  { value: 25, color: "#FFDC00" },
  { value: 30, color: "#FFDC00" },
  { value: 40, color: "#FF8C00" },
  { value: 50, color: "#DC0000" },
  { value: Number.POSITIVE_INFINITY, color: "#7A3300" },
];

const STANDARD_TEMP: ColorStop[] = [
  { value: 6, color: "#1B3A6B" },
  { value: 15, color: "#1F8A70" },
  { value: 18, color: "#4CAF50" },
  { value: 20, color: "#D9A400" },
  { value: 24, color: "#E8590C" },
];

/** Soft cool pastels — muted blues / mint / butter / peach / rose. */
const SOFT_HEIZLAST: ColorStop[] = [
  { value: Number.NEGATIVE_INFINITY, color: "#C5E8F5" },
  { value: 0, color: "#8BB8E8" },
  { value: 10, color: "#8BB8E8" },
  { value: 20, color: "#F5F0C8" },
  { value: 25, color: "#E8D98A" },
  { value: 30, color: "#E8D98A" },
  { value: 40, color: "#E8B089" },
  { value: 50, color: "#D98989" },
  { value: Number.POSITIVE_INFINITY, color: "#B07A6A" },
];

const SOFT_TEMP: ColorStop[] = [
  { value: 6, color: "#8FA8C8" },
  { value: 15, color: "#8FC4B0" },
  { value: 18, color: "#A8D4A0" },
  { value: 20, color: "#E8D090" },
  { value: 24, color: "#E8A888" },
];

/** Warm pastels — dusty lilac / apricot / coral / terracotta. */
const WARM_HEIZLAST: ColorStop[] = [
  { value: Number.NEGATIVE_INFINITY, color: "#D4C8E8" },
  { value: 0, color: "#A89AD4" },
  { value: 10, color: "#A89AD4" },
  { value: 20, color: "#F5E4C8" },
  { value: 25, color: "#F0C898" },
  { value: 30, color: "#F0C898" },
  { value: 40, color: "#E8A070" },
  { value: 50, color: "#D87868" },
  { value: Number.POSITIVE_INFINITY, color: "#A86858" },
];

const WARM_TEMP: ColorStop[] = [
  { value: 6, color: "#9A8AB8" },
  { value: 15, color: "#A8B890" },
  { value: 18, color: "#C8C080" },
  { value: 20, color: "#E8B878" },
  { value: 24, color: "#E89078" },
];

export const COLOR_PALETTES: Record<ColorPaletteId, ColorPalette> = {
  standard: {
    id: "standard",
    name: "Standard",
    heizlastStops: STANDARD_HEIZLAST,
    temperatureStops: STANDARD_TEMP,
  },
  softPastel: {
    id: "softPastel",
    name: "Soft Pastel",
    heizlastStops: SOFT_HEIZLAST,
    temperatureStops: SOFT_TEMP,
  },
  warmPastel: {
    id: "warmPastel",
    name: "Warm Pastel",
    heizlastStops: WARM_HEIZLAST,
    temperatureStops: WARM_TEMP,
  },
};

export const COLOR_PALETTE_IDS = Object.keys(
  COLOR_PALETTES,
) as ColorPaletteId[];

export function getPalette(id: ColorPaletteId | string | null | undefined): ColorPalette {
  if (id && id in COLOR_PALETTES) return COLOR_PALETTES[id as ColorPaletteId];
  return COLOR_PALETTES.standard;
}

/** @deprecated use getPalette(id).heizlastStops — kept for callers expecting HEIZLAST_STOPS */
export const HEIZLAST_STOPS = STANDARD_HEIZLAST;
export const TEMPERATURE_STOPS = STANDARD_TEMP;

export function heizlastStopsFor(paletteId?: ColorPaletteId | string): ColorStop[] {
  return getPalette(paletteId).heizlastStops;
}

export function temperatureStopsFor(paletteId?: ColorPaletteId | string): ColorStop[] {
  return getPalette(paletteId).temperatureStops;
}

export const HEIZLAST_GRADIENT_STOPS = STANDARD_HEIZLAST.filter((s) =>
  Number.isFinite(s.value),
);

/**
 * Multi-stop linear RGB gradient for Heizlast (W/m²).
 */
export function heizlastToColor(
  value: number,
  paletteId?: ColorPaletteId | string,
): string {
  const stops = heizlastStopsFor(paletteId);
  if (!Number.isFinite(value) || value < 0) {
    return stops[0].color;
  }
  if (value >= 50) {
    return stops[stops.length - 1].color;
  }

  const finite = stops.filter((s) => Number.isFinite(s.value));
  for (let i = 0; i < finite.length - 1; i++) {
    const a = finite[i];
    const b = finite[i + 1];
    if (value >= a.value && value <= b.value) {
      const span = b.value - a.value;
      const t = span === 0 ? 0 : (value - a.value) / span;
      return rgbToHex(lerpRgb(hexToRgb(a.color), hexToRgb(b.color), t));
    }
  }

  return finite[finite.length - 1].color;
}

/** CSS linear-gradient matching heizlast anchors for the active palette. */
export function heizlastGradientCss(
  direction = "to right",
  paletteId?: ColorPaletteId | string,
): string {
  const stops = heizlastStopsFor(paletteId);
  const finite = stops.filter((s) => Number.isFinite(s.value));
  const colors = [
    stops[0].color,
    ...finite.map((s) => s.color),
    stops[stops.length - 1].color,
  ];
  const unique: string[] = [];
  for (const c of colors) {
    if (unique[unique.length - 1] !== c) unique.push(c);
  }
  return `linear-gradient(${direction}, ${unique.join(", ")})`;
}

/**
 * Discrete nearest-match color for required room temperature (°C).
 */
export function temperatureToColor(
  value: number,
  paletteId?: ColorPaletteId | string,
): string {
  const stops = temperatureStopsFor(paletteId);
  if (!Number.isFinite(value)) {
    return stops[2]?.color ?? stops[0].color;
  }

  let best = stops[0];
  let bestDist = Math.abs(value - best.value);

  for (let i = 1; i < stops.length; i++) {
    const stop = stops[i];
    const dist = Math.abs(value - stop.value);
    if (dist < bestDist) {
      best = stop;
      bestDist = dist;
    }
  }

  return best.color;
}
