"use client";

import type { InputHTMLAttributes } from "react";

type Props = Omit<
  InputHTMLAttributes<HTMLInputElement>,
  "type" | "value" | "onChange"
> & {
  value: number;
  onChange: (value: number) => void;
  min?: number;
  max?: number;
  step?: number;
  className?: string;
};

/** Thin glass-style range — single source of truth for all app sliders. */
export default function Slider({
  value,
  onChange,
  min = 0,
  max = 1,
  step = 0.01,
  className = "",
  ...rest
}: Props) {
  return (
    <input
      type="range"
      min={min}
      max={max}
      step={step}
      value={value}
      onChange={(e) => onChange(Number(e.target.value))}
      className={`ui-slider ${className}`}
      {...rest}
    />
  );
}
