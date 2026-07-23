"use client";

import { useRef } from "react";
import GlassPanel from "./GlassPanel";
import { IconUpload } from "./ui";
import { motion, radius } from "@/lib/designTokens";

type Props = {
  onFile: (file: File) => void;
  disabled?: boolean;
  label?: string;
  variant?: "default" | "primary";
  className?: string;
};

export default function LoadIfcButton({
  onFile,
  disabled,
  label = "Load IFC",
  variant = "primary",
  className = "",
}: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const primary = variant === "primary";

  return (
    <>
      <input
        ref={inputRef}
        type="file"
        accept=".ifc,application/x-step,application/octet-stream,.IFC"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          e.target.value = "";
          if (file) onFile(file);
        }}
      />
      <GlassPanel variant="control" zIndex={2} wrapperClassName="inline-flex">
        <button
          type="button"
          disabled={disabled}
          onClick={() => inputRef.current?.click()}
          className={`${motion.base} ${radius.control} inline-flex min-w-[168px] items-center justify-center gap-2 px-6 py-2.5 text-sm font-medium active:scale-[0.98] disabled:pointer-events-none disabled:opacity-45 ${
            primary
              ? "bg-gradient-to-b from-zinc-800/90 to-zinc-950/90 text-white"
              : "bg-white/20 text-zinc-800 hover:bg-white/35"
          } ${className}`}
        >
          <IconUpload />
          {label}
        </button>
      </GlassPanel>
    </>
  );
}
