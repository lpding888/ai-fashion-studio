"use client";

import * as React from "react";
import { cn } from "@/lib/utils";
import { usePanelSizing } from "@/components/learn/layout/studio-layout";

interface ControlHubProps extends React.HTMLAttributes<HTMLDivElement> {
    isOpen?: boolean;
    onClose?: () => void;
    queueContent?: React.ReactNode;
    headerAction?: React.ReactNode;
}

export function ControlHub({
    className,
    isOpen,
    onClose,
    children,
    queueContent,
    headerAction,
    ...props
}: ControlHubProps) {
    const panelSizing = usePanelSizing();
    const density = panelSizing?.rightDensity ?? "md";
    const isCompact = density === "sm";

    React.useEffect(() => {
        if (!isOpen) return;
        const handleEscape = (e: KeyboardEvent) => {
            if (e.key === "Escape") onClose?.();
        };
        window.addEventListener("keydown", handleEscape);
        return () => window.removeEventListener("keydown", handleEscape);
    }, [isOpen, onClose]);

    return (
        <>
            {/* Backdrop */}
            {isOpen && (
                <div
                    className="fixed inset-0 bg-black/40 backdrop-blur-sm z-40 lg:hidden"
                    onClick={onClose}
                />
            )}

            <aside
                className={cn(
                    // Common
                    "flex flex-col bg-white/50 backdrop-blur-xl border border-white/40 shadow-sm rounded-2xl overflow-hidden transition-[transform,opacity] duration-300 ease-out",

                    // Desktop/Laptop (Grid Slot 3): Full height
                    "lg:h-full lg:opacity-100 lg:translate-x-0 lg:static lg:z-0",

                    // Tablet/Mobile (Drawer): Fixed overlay from RIGHT
                    "max-lg:fixed max-lg:inset-y-0 max-lg:right-0 max-lg:z-50 max-lg:w-[320px] max-lg:shadow-2xl",

                    // Drawer toggle state
                    isOpen ? "max-lg:translate-x-0" : "max-lg:translate-x-full",

                    className
                )}
                {...props}
            >
                {/* Header */}
                <div className={cn("border-b border-white/20 flex items-center shrink-0 justify-between bg-white/40", isCompact ? "h-12 px-3" : "h-14 px-4")}>
                    <span className={cn("font-semibold text-slate-800 shrink-0", isCompact && "text-sm")}>控制中心</span>
                    <div className={cn("flex-1 flex justify-center px-2", isCompact && "scale-90 origin-center")}>
                        {headerAction}
                    </div>
                    <button
                        onClick={onClose}
                        aria-label="关闭面板"
                        className="lg:hidden p-2 text-slate-500 hover:text-slate-800"
                    >
                        ✕
                    </button>
                </div>

                {/* Content Area */}
                <div className="flex-1 overflow-hidden flex flex-col">
                    {/* Top: Parameters (Accordion) */}
                    <div className={cn("shrink-0 border-b border-white/20 bg-white/30 pb-2", isCompact ? "px-3" : "px-4")}>
                        {children}
                    </div>

                    {/* Bottom: Queue (List) - Takes remaining height */}
                    <div className={cn("flex-1 min-h-0 bg-slate-50/50", isCompact ? "p-3" : "p-4")}>
                        {queueContent}
                    </div>
                </div>
            </aside>
        </>
    );
}
