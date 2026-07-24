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

export type ColorPaletteId =
  | "standard"
  | "softPastel"
  | "warmPastel"
  | "dark";

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

/** Dark night palette — deep blues / amber / ember. */
const DARK_HEIZLAST: ColorStop[] = [
  { value: Number.NEGATIVE_INFINITY, color: "#1A2740" },
  { value: 0, color: "#2E4A7A" },
  { value: 10, color: "#3A5F9E" },
  { value: 20, color: "#6B7A4A" },
  { value: 25, color: "#B8922E" },
  { value: 30, color: "#D4A017" },
  { value: 40, color: "#C45C1A" },
  { value: 50, color: "#A82828" },
  { value: Number.POSITIVE_INFINITY, color: "#5C1818" },
];

const DARK_TEMP: ColorStop[] = [
  { value: 6, color: "#1E3A5F" },
  { value: 15, color: "#1F5C4A" },
  { value: 18, color: "#2E6B3A" },
  { value: 20, color: "#8A6B14" },
  { value: 24, color: "#A84818" },
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
  dark: {
    id: "dark",
    name: "Dark",
    heizlastStops: DARK_HEIZLAST,
    temperatureStops: DARK_TEMP,
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

export const DEFAULT_HEIZLAST_RANGE = [0, 10, 20, 30, 40, 50];
export const DEFAULT_TEMPERATURE_RANGE = [0, 6, 15, 18, 20, 24];
export const MIN_LEGEND_STOPS = 6;
export const MAX_LEGEND_STOPS = 8;

/** Built-in Heizlast range presets for the legend dropdown. */
export const HEIZLAST_RANGE_PRESETS: { id: string; label: string; values: number[] }[] = [
  { id: "fine", label: "0, 5, 15, 20, 25, 30", values: [0, 5, 15, 20, 25, 30] },
  { id: "std", label: "0, 10, 20, 30, 40, 50", values: [0, 10, 20, 30, 40, 50] },
  { id: "wide", label: "0, 15, 25, 35, 45, 55", values: [0, 15, 25, 35, 45, 55] },
];

/**
 * Pick the tightest Heizlast preset that covers the model's heat-load values.
 * Uses ~95th percentile so a few outliers don't force the widest scale.
 */
export function pickHeizlastRangeFromLoads(heatLoads: number[]): number[] {
  const vals = heatLoads.filter((v) => Number.isFinite(v) && v >= 0);
  if (!vals.length) return [...DEFAULT_HEIZLAST_RANGE];

  const sorted = [...vals].sort((a, b) => a - b);
  const max = sorted[sorted.length - 1];
  const p95 = sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * 0.95))];
  // Cover typical rooms; still respect absolute max with a little headroom
  const target = Math.max(p95, max * 0.9);

  const covering = HEIZLAST_RANGE_PRESETS.map((p) => ({
    p,
    max: p.values[p.values.length - 1]!,
  }))
    .filter((x) => x.max >= target)
    .sort((a, b) => a.max - b.max);

  if (covering.length) return [...covering[0]!.p.values];

  const widest = HEIZLAST_RANGE_PRESETS.reduce((best, p) =>
    p.values[p.values.length - 1]! > best.values[best.values.length - 1]!
      ? p
      : best,
  );
  return [...widest.values];
}

/** Parse "0, 10, 20, 30, 40, 50" → sorted unique numbers (6–8). */
export function parseLegendRange(input: string): number[] | null {
  const parts = input
    .split(/[,;\s]+/)
    .map((s) => s.trim())
    .filter(Boolean);
  if (parts.length < MIN_LEGEND_STOPS || parts.length > MAX_LEGEND_STOPS) {
    return null;
  }
  const nums = parts.map(Number);
  if (nums.some((n) => !Number.isFinite(n))) return null;
  const sorted = [...new Set(nums)].sort((a, b) => a - b);
  if (
    sorted.length < MIN_LEGEND_STOPS ||
    sorted.length > MAX_LEGEND_STOPS
  ) {
    return null;
  }
  return sorted;
}

export function formatLegendRange(values: number[]): string {
  return values.join(", ");
}

function sampleColors(colors: string[], t: number): string {
  if (!colors.length) return "#888888";
  if (colors.length === 1) return colors[0];
  const clamped = Math.max(0, Math.min(1, t));
  const scaled = clamped * (colors.length - 1);
  const i = Math.floor(scaled);
  const f = scaled - i;
  if (i >= colors.length - 1) return colors[colors.length - 1];
  return rgbToHex(lerpRgb(hexToRgb(colors[i]), hexToRgb(colors[i + 1]), f));
}

/** Map a custom value range onto palette colors (6–8 stops). */
export function resolveStopsForRange(
  paletteStops: ColorStop[],
  range: number[],
): ColorStop[] {
  const values =
    range.length >= MIN_LEGEND_STOPS
      ? range
      : DEFAULT_HEIZLAST_RANGE;
  const colors = paletteStops
    .filter((s) => Number.isFinite(s.value))
    .map((s) => s.color);
  const unique: string[] = [];
  for (const c of colors) {
    if (unique[unique.length - 1] !== c) unique.push(c);
  }
  const src = unique.length ? unique : ["#0050FF", "#FFFFB4", "#DC0000"];
  return values.map((value, i) => ({
    value,
    color: sampleColors(src, i / Math.max(1, values.length - 1)),
  }));
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
  range: number[] = DEFAULT_HEIZLAST_RANGE,
): string {
  const stops = resolveStopsForRange(heizlastStopsFor(paletteId), range);
  if (!Number.isFinite(value) || value < stops[0].value) {
    return stops[0].color;
  }
  if (value >= stops[stops.length - 1].value) {
    return stops[stops.length - 1].color;
  }

  for (let i = 0; i < stops.length - 1; i++) {
    const a = stops[i];
    const b = stops[i + 1];
    if (value >= a.value && value <= b.value) {
      const span = b.value - a.value;
      const t = span === 0 ? 0 : (value - a.value) / span;
      return rgbToHex(lerpRgb(hexToRgb(a.color), hexToRgb(b.color), t));
    }
  }

  return stops[stops.length - 1].color;
}

/** CSS linear-gradient matching heizlast anchors for the active palette/range. */
export function heizlastGradientCss(
  direction = "to right",
  paletteId?: ColorPaletteId | string,
  range: number[] = DEFAULT_HEIZLAST_RANGE,
): string {
  const stops = resolveStopsForRange(heizlastStopsFor(paletteId), range);
  return `linear-gradient(${direction}, ${stops.map((s) => s.color).join(", ")})`;
}

/**
 * Discrete nearest-match color for required room temperature (°C).
 */
export function temperatureToColor(
  value: number,
  paletteId?: ColorPaletteId | string,
  range: number[] = DEFAULT_TEMPERATURE_RANGE,
): string {
  const stops = resolveStopsForRange(temperatureStopsFor(paletteId), range);
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

/** Temperature chip stops for the legend (custom range + palette colors). */
export function temperatureLegendStops(
  paletteId?: ColorPaletteId | string,
  range: number[] = DEFAULT_TEMPERATURE_RANGE,
): ColorStop[] {
  return resolveStopsForRange(temperatureStopsFor(paletteId), range);
}
