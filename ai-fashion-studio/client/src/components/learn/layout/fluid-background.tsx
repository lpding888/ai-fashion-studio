"use client";

import { cn } from "@/lib/utils";

interface FluidBackgroundProps {
    className?: string;
    variant?: "default" | "warm" | "cool" | "cyber" | "mint" | "sunset";
}

export function FluidBackground({ className, variant = "default" }: FluidBackgroundProps) {
    // Dynamic color maps based on variant
    const getColors = () => {
        switch (variant) {
            case "warm":
                return {
                    base: "from-[#FFF1E8] via-[#FFE4D1] to-[#FFF5E8]",
                    b1: "bg-orange-300/40",
                    b2: "bg-rose-300/40",
                    b3: "bg-amber-200/40"
                };
            case "cool":
                return {
                    base: "from-[#EEF6FF] via-[#E9F9FF] to-[#F2F1FF]",
                    b1: "bg-blue-300/40",
                    b2: "bg-cyan-300/40",
                    b3: "bg-indigo-300/40"
                };
            case "cyber":
                return {
                    base: "from-[#F5E9FF] via-[#F0E7FF] to-[#EAF0FF]",
                    b1: "bg-fuchsia-400/40",
                    b2: "bg-violet-500/40",
                    b3: "bg-blue-500/40"
                };
            case "mint":
                return {
                    base: "from-[#EFFFF5] via-[#EAFDF7] to-[#E9F7FF]",
                    b1: "bg-emerald-300/40",
                    b2: "bg-teal-300/40",
                    b3: "bg-sky-300/40"
                };
            case "sunset":
                return {
                    base: "from-[#FFF0EC] via-[#FFE9DD] to-[#FFF3D6]",
                    b1: "bg-rose-300/40",
                    b2: "bg-orange-300/40",
                    b3: "bg-amber-300/40"
                };
            default: // "default" - Coral Trend (Warm/Vibrant)
                return {
                    base: "from-[#F8F9FA] via-[#FFF5F0] to-[#F0FFF4]",
                    b1: "bg-[#FF7F50]/30", // Coral
                    b2: "bg-[#FF4500]/20", // Persimmon
                    b3: "bg-[#9ACD32]/20"  // Yellow Green
                };

        }
    };

    const colors = getColors();
    const noiseDataUrl =
        "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='120' height='120'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.8' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)' opacity='0.25'/%3E%3C/svg%3E";

    return (
        <div className={cn("absolute inset-0 z-0 pointer-events-none overflow-hidden transition-colors duration-1000", className)}>
            <div className={cn("absolute inset-0 bg-gradient-to-br opacity-80", colors.base)} />

            {/* Animated Blobs with dynamic colors */}
            <div className={cn("absolute top-[-20%] left-[-10%] w-[70vw] h-[70vw] rounded-full blur-[120px] mix-blend-multiply animate-blob transition-colors duration-1000", colors.b1)} />
            <div className={cn("absolute top-[-20%] right-[-10%] w-[70vw] h-[70vw] rounded-full blur-[120px] mix-blend-multiply animate-blob animation-delay-2000 transition-colors duration-1000", colors.b2)} />
            <div className={cn("absolute bottom-[-20%] left-[20%] w-[70vw] h-[70vw] rounded-full blur-[120px] mix-blend-multiply animate-blob animation-delay-4000 transition-colors duration-1000", colors.b3)} />

            <div
                className="absolute inset-0 opacity-20 brightness-100 contrast-150"
                style={{ backgroundImage: `url("${noiseDataUrl}")`, backgroundRepeat: "repeat" }}
            />
        </div>
    );
}
