"use client";

import { LiquidGlass } from "@liquidglass/react";
import type { CSSProperties, ReactNode } from "react";
import { liquidGlass, motion, type GlassVariant } from "@/lib/designTokens";

type Props = {
  children: ReactNode;
  className?: string;
  /** Outer wrapper classes (positioning / margins) — LiquidGlass fills this. */
  wrapperClassName?: string;
  wrapperStyle?: CSSProperties;
  variant?: GlassVariant;
  /** Override LiquidGlass z-index (library default is 9999 — too aggressive). */
  zIndex?: number;
  /** Stretch to parent height (sidebar sheets). Default: size to content. */
  fill?: boolean;
};

/**
 * Single shared glass surface for the whole app.
 * Do not import @liquidglass/react elsewhere — retune via lib/designTokens.ts.
 */
export default function GlassPanel({
  children,
  className = "",
  wrapperClassName = "",
  wrapperStyle,
  variant = "panel",
  zIndex = 1,
  fill = false,
}: Props) {
  const preset = liquidGlass[variant];

  return (
    <div
      className={`relative ${fill ? "h-full min-h-0" : ""} ${motion.base} ${wrapperClassName}`}
      style={wrapperStyle}
    >
      <LiquidGlass
        {...preset}
        zIndex={zIndex}
        className={`glass-surface ${fill ? "glass-surface--fill" : ""} ${className}`}
      >
        <div
          className={`glass-surface-content ${fill ? "min-h-0 flex-1 overflow-hidden" : ""}`}
        >
          {children}
        </div>
      </LiquidGlass>
    </div>
  );
}
