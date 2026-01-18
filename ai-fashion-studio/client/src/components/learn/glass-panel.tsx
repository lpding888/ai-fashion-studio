"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

interface GlassPanelProps extends React.HTMLAttributes<HTMLDivElement> {
    intensity?: "low" | "medium" | "high";
    border?: boolean;
}

export function GlassPanel({
    className,
    intensity = "medium",
    border = true,
    children,
    ...props
}: GlassPanelProps) {
    return (
        <div
            className={cn(
                "rounded-2xl transition-all duration-300",
                // Base glass styles
                "backdrop-blur-xl",

                // Intensity variants
                intensity === "low" && "bg-white/40 shadow-sm",
                intensity === "medium" && "bg-white/60 shadow-lg shadow-purple-500/5",
                intensity === "high" && "bg-white/80 shadow-xl shadow-purple-500/10",

                // Border
                border && "border border-white/40",

                className
            )}
            {...props}
        >
            {children}
        </div>
    );
}
