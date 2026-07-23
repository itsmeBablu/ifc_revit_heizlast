"use client";

import type {
  ButtonHTMLAttributes,
  InputHTMLAttributes,
  ReactNode,
  SelectHTMLAttributes,
} from "react";
import GlassPanel from "./GlassPanel";
import { glassInset, heading, motion, radius } from "@/lib/designTokens";

export function GlassInset({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return <div className={`${glassInset} ${className}`}>{children}</div>;
}

export function GlassButton({
  variant = "default",
  className = "",
  children,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "default" | "primary";
}) {
  const primary = variant === "primary";
  return (
    <GlassPanel variant="control" zIndex={2} wrapperClassName="inline-flex">
      <button
        type="button"
        className={`${motion.base} ${radius.control} px-3.5 py-2 text-sm font-medium active:scale-[0.98] disabled:pointer-events-none disabled:opacity-45 ${
          primary
            ? "bg-gradient-to-b from-zinc-800/90 to-zinc-950/90 text-white"
            : "bg-white/20 text-zinc-800 hover:bg-white/35"
        } ${className}`}
        {...props}
      >
        {children}
      </button>
    </GlassPanel>
  );
}

export function GlassChip({
  active = false,
  className = "",
  children,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { active?: boolean }) {
  return (
    <GlassPanel variant="chip" zIndex={2} wrapperClassName="inline-flex flex-1">
      <button
        type="button"
        className={`${motion.base} w-full px-3 py-1.5 text-xs ${
          active
            ? "font-semibold text-zinc-900"
            : "font-medium text-zinc-600 hover:text-zinc-800"
        } ${className}`}
        {...props}
      >
        {children}
      </button>
    </GlassPanel>
  );
}

export function GlassSelect({
  className = "",
  ...props
}: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <GlassPanel variant="control" zIndex={2} wrapperClassName="w-full">
      <select
        className={`${motion.base} w-full bg-transparent px-3 py-2.5 text-sm text-zinc-800 outline-none ${className}`}
        {...props}
      />
    </GlassPanel>
  );
}

export function GlassInput({
  className = "",
  ...props
}: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <GlassPanel variant="control" zIndex={2} wrapperClassName="w-full">
      <input
        className={`${motion.base} w-full bg-transparent px-3 py-2.5 text-sm text-zinc-800 outline-none placeholder:text-zinc-400 ${className}`}
        {...props}
      />
    </GlassPanel>
  );
}

export function PanelTitle({ children }: { children: ReactNode }) {
  return <h2 className={`mb-3 ${heading.panel}`}>{children}</h2>;
}

export function IconSidebar({ open }: { open: boolean }) {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      {open ? (
        <path d="m9 6 6 6-6 6" />
      ) : (
        <path d="m15 6-6 6 6 6" />
      )}
    </svg>
  );
}

export function IconAlert() {
  return (
    <svg
      width="28"
      height="28"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="text-amber-700/70"
      aria-hidden
    >
      <path d="M12 9v4" />
      <path d="M12 17h.01" />
      <path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z" />
    </svg>
  );
}

export function IconUpload() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M12 16V5" />
      <path d="m8 9 4-4 4 4" />
      <path d="M4 19h16" />
    </svg>
  );
}

export { heading, motion, radius };
