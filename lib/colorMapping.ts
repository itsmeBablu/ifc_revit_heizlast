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

/** Anchor stops used by heizlastToColor (and the Legend gradient). */
export const HEIZLAST_STOPS: { value: number; color: string }[] = [
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

/**
 * Multi-stop linear RGB gradient for Heizlast (W/m²).
 * Values outside the finite range clamp to the first/last finite stop color;
 * the -Infinity / +Infinity stops define the clamp colors.
 */
export function heizlastToColor(value: number): string {
  if (!Number.isFinite(value) || value < 0) {
    return HEIZLAST_STOPS[0].color;
  }
  if (value >= 50) {
    return HEIZLAST_STOPS[HEIZLAST_STOPS.length - 1].color;
  }

  const finite = HEIZLAST_STOPS.filter((s) => Number.isFinite(s.value));
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

/** Finite Heizlast stops for CSS gradients (Legend bar + header title). */
export const HEIZLAST_GRADIENT_STOPS = HEIZLAST_STOPS.filter((s) =>
  Number.isFinite(s.value),
);

/** CSS linear-gradient matching heizlastToColor anchors (incl. clamp colors). */
export function heizlastGradientCss(direction = "to right"): string {
  const colors = [
    HEIZLAST_STOPS[0].color,
    ...HEIZLAST_GRADIENT_STOPS.map((s) => s.color),
    HEIZLAST_STOPS[HEIZLAST_STOPS.length - 1].color,
  ];
  // Dedupe consecutive identical stops (0 and 10 share #0050FF, etc.)
  const unique: string[] = [];
  for (const c of colors) {
    if (unique[unique.length - 1] !== c) unique.push(c);
  }
  return `linear-gradient(${direction}, ${unique.join(", ")})`;
}

export const TEMPERATURE_STOPS: { value: number; color: string }[] = [
  { value: 6, color: "#1B3A6B" },
  { value: 15, color: "#1F8A70" },
  { value: 18, color: "#4CAF50" },
  { value: 20, color: "#D9A400" },
  { value: 24, color: "#E8590C" },
];

/**
 * Discrete nearest-match color for required room temperature (°C).
 * Does not round the displayed temperature value — only the swatch color.
 */
export function temperatureToColor(value: number): string {
  if (!Number.isFinite(value)) {
    return TEMPERATURE_STOPS[2].color;
  }

  let best = TEMPERATURE_STOPS[0];
  let bestDist = Math.abs(value - best.value);

  for (let i = 1; i < TEMPERATURE_STOPS.length; i++) {
    const stop = TEMPERATURE_STOPS[i];
    const dist = Math.abs(value - stop.value);
    if (dist < bestDist) {
      best = stop;
      bestDist = dist;
    }
  }

  return best.color;
}
