"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

export function Switch(props: {
  checked: boolean;
  onCheckedChange: (next: boolean) => void;
  disabled?: boolean;
  className?: string;
}) {
  const { checked, onCheckedChange, disabled, className } = props;
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => !disabled && onCheckedChange(!checked)}
      className={cn(
        "relative inline-flex h-6 w-11 items-center rounded-full border transition-colors",
        disabled ? "opacity-60 cursor-not-allowed" : "cursor-pointer",
        checked ? "bg-emerald-500/70 border-emerald-400/50" : "bg-white/10 border-white/20 hover:bg-white/15",
        className,
      )}
    >
      <span
        className={cn(
          "inline-block h-5 w-5 transform rounded-full bg-white shadow transition-transform",
          checked ? "translate-x-5" : "translate-x-0.5",
        )}
      />
    </button>
  );
}

