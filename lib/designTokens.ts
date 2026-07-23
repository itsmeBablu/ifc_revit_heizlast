/**
 * Design tokens — radius scale + LiquidGlass presets.
 * All floating UI goes through components/GlassPanel.tsx using these values.
 */
export const radius = {
  /** Panels / cards / header / sidebar (px for LiquidGlass) */
  panelPx: 24,
  /** Buttons, chips, inputs (px) */
  controlPx: 16,
  /** Tiny chips e.g. temperature swatches (px) */
  chipPx: 12,
  /** Tailwind mirrors */
  panel: "rounded-3xl",
  control: "rounded-2xl",
} as const;

export const motion = {
  base: "transition-all duration-300 ease-out",
  sidebar: "transition-transform duration-[350ms] ease-out",
} as const;

/** Shared @liquidglass/react props — soft, no harsh corner shadows. */
export const liquidGlass = {
  panel: {
    borderRadius: radius.panelPx,
    blur: 0.4,
    contrast: 1.08,
    brightness: 1.05,
    saturation: 1.12,
    shadowIntensity: 0.06,
    elasticity: 0.35,
    displacementScale: 0.4,
  },
  control: {
    borderRadius: radius.controlPx,
    blur: 0.3,
    contrast: 1.06,
    brightness: 1.04,
    saturation: 1.08,
    shadowIntensity: 0.04,
    elasticity: 0.3,
    displacementScale: 0.3,
  },
  chip: {
    borderRadius: radius.chipPx,
    blur: 0.25,
    contrast: 1.05,
    brightness: 1.03,
    saturation: 1.06,
    shadowIntensity: 0.03,
    elasticity: 0.25,
    displacementScale: 0.25,
  },
} as const;

export type GlassVariant = keyof typeof liquidGlass;

/** Soft inset surface inside a glass panel (not a separate LiquidGlass). */
export const glassInset = [
  radius.control,
  "border border-white/25",
  "bg-white/25",
].join(" ");

export const heading = {
  app: "text-base font-semibold tracking-wide text-zinc-900 md:text-lg",
  panel: "text-sm font-semibold tracking-wide text-zinc-800",
  muted: "text-xs font-medium tracking-wide text-zinc-500",
} as const;
