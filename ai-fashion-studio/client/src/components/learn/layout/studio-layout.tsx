"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

type PanelDensity = "sm" | "md" | "lg";

interface PanelSizing {
    leftWidth: number;
    rightWidth: number;
    leftDensity: PanelDensity;
    rightDensity: PanelDensity;
}

const PanelSizingContext = React.createContext<PanelSizing | null>(null);

export function usePanelSizing() {
    return React.useContext(PanelSizingContext);
}

const STORAGE_LAYOUT_KEY = "afs:learn:panel-layout:v1";
const DEFAULT_LEFT_WIDTH = 360;
const DEFAULT_RIGHT_WIDTH = 320;
const MIN_LEFT_WIDTH = 280;
const MAX_LEFT_WIDTH = 520;
const MIN_RIGHT_WIDTH = 260;
const MAX_RIGHT_WIDTH = 420;
const MIN_CENTER_WIDTH = 520;
const RESIZER_WIDTH = 10;

function clamp(value: number, min: number, max: number) {
    return Math.min(Math.max(value, min), max);
}

function densityForWidth(width: number, small: number, large: number): PanelDensity {
    if (width < small) return "sm";
    if (width < large) return "md";
    return "lg";
}

interface StudioLayoutProps {
    children?: React.ReactNode;
    header?: React.ReactNode; // Optional custom header content
    resourcePanel: React.ReactNode;
    canvas: React.ReactNode;
    controlHub: React.ReactNode;
    className?: string;
}

export function StudioLayout({
    header,
    resourcePanel,
    canvas,
    controlHub,
    className,
}: StudioLayoutProps) {
    const containerRef = React.useRef<HTMLDivElement>(null);
    const dragStateRef = React.useRef<{
        type: "left" | "right";
        startX: number;
        startLeft: number;
        startRight: number;
    } | null>(null);
    const [containerWidth, setContainerWidth] = React.useState<number | null>(null);
    const [leftWidth, setLeftWidth] = React.useState(DEFAULT_LEFT_WIDTH);
    const [rightWidth, setRightWidth] = React.useState(DEFAULT_RIGHT_WIDTH);
    const [dragging, setDragging] = React.useState<"left" | "right" | null>(null);
    const [todayLabel, setTodayLabel] = React.useState<string>("—");

    React.useEffect(() => {
        setTodayLabel(new Date().toLocaleDateString("zh-CN"));
    }, []);

    React.useEffect(() => {
        if (typeof window === "undefined") return;
        try {
            const raw = localStorage.getItem(STORAGE_LAYOUT_KEY);
            if (!raw) return;
            const parsed = JSON.parse(raw) as { leftWidth?: number; rightWidth?: number };
            if (typeof parsed.leftWidth === "number") setLeftWidth(parsed.leftWidth);
            if (typeof parsed.rightWidth === "number") setRightWidth(parsed.rightWidth);
        } catch (err) {
            console.warn("Failed to load panel layout", err);
        }
    }, []);

    React.useEffect(() => {
        if (typeof window === "undefined") return;
        const payload = { leftWidth, rightWidth };
        localStorage.setItem(STORAGE_LAYOUT_KEY, JSON.stringify(payload));
    }, [leftWidth, rightWidth]);

    React.useEffect(() => {
        const el = containerRef.current;
        if (!el) return;
        const observer = new ResizeObserver((entries) => {
            const next = entries[0]?.contentRect?.width;
            if (typeof next === "number" && Number.isFinite(next)) {
                setContainerWidth(next);
            }
        });
        observer.observe(el);
        return () => observer.disconnect();
    }, []);

    const getMaxLeft = React.useCallback(
        (currentRight: number) => {
            if (!containerWidth) return MAX_LEFT_WIDTH;
            return Math.min(
                MAX_LEFT_WIDTH,
                containerWidth - MIN_CENTER_WIDTH - currentRight - RESIZER_WIDTH * 2
            );
        },
        [containerWidth]
    );

    const getMaxRight = React.useCallback(
        (currentLeft: number) => {
            if (!containerWidth) return MAX_RIGHT_WIDTH;
            return Math.min(
                MAX_RIGHT_WIDTH,
                containerWidth - MIN_CENTER_WIDTH - currentLeft - RESIZER_WIDTH * 2
            );
        },
        [containerWidth]
    );

    const effectiveLeft = React.useMemo(() => {
        const maxLeft = getMaxLeft(rightWidth);
        const safeMax = Math.max(MIN_LEFT_WIDTH, maxLeft);
        return clamp(leftWidth, MIN_LEFT_WIDTH, safeMax);
    }, [getMaxLeft, leftWidth, rightWidth]);

    const effectiveRight = React.useMemo(() => {
        const maxRight = getMaxRight(effectiveLeft);
        const safeMax = Math.max(MIN_RIGHT_WIDTH, maxRight);
        return clamp(rightWidth, MIN_RIGHT_WIDTH, safeMax);
    }, [getMaxRight, rightWidth, effectiveLeft]);

    React.useEffect(() => {
        if (effectiveLeft !== leftWidth) setLeftWidth(effectiveLeft);
        if (effectiveRight !== rightWidth) setRightWidth(effectiveRight);
    }, [effectiveLeft, effectiveRight, leftWidth, rightWidth]);

    const leftDensity = densityForWidth(effectiveLeft, 320, 420);
    const rightDensity = densityForWidth(effectiveRight, 300, 380);

    React.useEffect(() => {
        if (!dragging) return;
        const handlePointerMove = (event: PointerEvent) => {
            if (!dragStateRef.current) return;
            const { type, startX, startLeft, startRight } = dragStateRef.current;
            const delta = event.clientX - startX;
            if (type === "left") {
                const maxLeft = getMaxLeft(startRight);
                const safeMax = Math.max(MIN_LEFT_WIDTH, maxLeft);
                setLeftWidth(clamp(startLeft + delta, MIN_LEFT_WIDTH, safeMax));
            } else {
                const maxRight = getMaxRight(startLeft);
                const safeMax = Math.max(MIN_RIGHT_WIDTH, maxRight);
                setRightWidth(clamp(startRight - delta, MIN_RIGHT_WIDTH, safeMax));
            }
        };
        const handlePointerUp = () => {
            dragStateRef.current = null;
            setDragging(null);
            document.body.style.cursor = "";
            document.body.style.userSelect = "";
        };
        window.addEventListener("pointermove", handlePointerMove);
        window.addEventListener("pointerup", handlePointerUp);
        return () => {
            window.removeEventListener("pointermove", handlePointerMove);
            window.removeEventListener("pointerup", handlePointerUp);
        };
    }, [dragging, getMaxLeft, getMaxRight]);

    const startDrag = (type: "left" | "right") => (event: React.PointerEvent<HTMLDivElement>) => {
        event.preventDefault();
        dragStateRef.current = {
            type,
            startX: event.clientX,
            startLeft: leftWidth,
            startRight: rightWidth,
        };
        setDragging(type);
        document.body.style.cursor = "col-resize";
        document.body.style.userSelect = "none";
        event.currentTarget.setPointerCapture(event.pointerId);
    };

    return (
        <PanelSizingContext.Provider
            value={{
                leftWidth: effectiveLeft,
                rightWidth: effectiveRight,
                leftDensity,
                rightDensity,
            }}
        >
            <div
                className={cn(
                    "relative w-full h-screen bg-transparent overflow-hidden flex flex-col",
                    className
                )}
            >
                {/* Pro Header - Sticky Top */}
                <header className="h-12 shrink-0 bg-white/60 backdrop-blur-xl border-b border-white/30 flex items-center justify-between px-4 z-50">
                    <div className="flex items-center gap-3">
                        <div className="flex gap-1.5 px-2">
                            <div className="w-3 h-3 rounded-full bg-red-400/80 shadow-sm" />
                            <div className="w-3 h-3 rounded-full bg-amber-400/80 shadow-sm" />
                            <div className="w-3 h-3 rounded-full bg-emerald-400/80 shadow-sm" />
                        </div>
                        <div className="h-4 w-[1px] bg-slate-200 mx-1" />
                        <div className="flex items-center gap-2">
                            <div className="w-6 h-6 rounded-lg bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center shadow-indigo-200 shadow-lg">
                                <span className="text-[10px] font-bold text-white tracking-tighter">AI</span>
                            </div>
                            <span className="text-sm font-bold bg-clip-text text-transparent bg-gradient-to-r from-slate-800 to-slate-500 tracking-tight">
                                AI 时尚工坊 <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-amber-100 text-amber-700 ml-1 uppercase">专业版</span>
                            </span>
                        </div>
                    </div>

                    <div className="flex-1 flex justify-center max-md:hidden">
                        <div className="px-4 py-1 rounded-full bg-slate-100/50 border border-slate-200/50 text-[10px] font-medium text-slate-500">
                            正在工作：{header ? "当前项目" : "未命名项目"} _ {todayLabel}
                        </div>
                    </div>

                    <div className="flex items-center gap-4">
                        {header}
                    </div>
                </header>

                <div
                    ref={containerRef}
                    className={cn(
                        "flex-1 overflow-hidden",
                        // Desktop (>= 1024px): Resizable 3-column grid + resizers
                        "xl:grid xl:gap-0 xl:p-4",
                        "lg:max-xl:grid lg:max-xl:gap-0 lg:max-xl:p-3",
                        // Tablet & Mobile (< 1024px): Stacked
                        "max-lg:flex max-lg:flex-col"
                    )}
                    style={{
                        gridTemplateColumns: `minmax(${MIN_LEFT_WIDTH}px, ${effectiveLeft}px) ${RESIZER_WIDTH}px minmax(0, 1fr) ${RESIZER_WIDTH}px minmax(${MIN_RIGHT_WIDTH}px, ${effectiveRight}px)`,
                    }}
                >
                    <div className="min-w-0 h-full">
                        {resourcePanel}
                    </div>
                    <div
                        role="separator"
                        aria-label="调整资源中心宽度"
                        className={cn(
                            "hidden lg:flex items-center justify-center cursor-col-resize",
                            dragging === "left" ? "bg-[#FFF5F0]" : "bg-transparent hover:bg-slate-100/60"
                        )}
                        onPointerDown={startDrag("left")}
                    >
                        <div className="h-[60%] w-0.5 rounded-full bg-slate-300/70" />
                    </div>
                    <div className="min-w-0 h-full">
                        {canvas}
                    </div>
                    <div
                        role="separator"
                        aria-label="调整控制中心宽度"
                        className={cn(
                            "hidden lg:flex items-center justify-center cursor-col-resize",
                            dragging === "right" ? "bg-[#FFF5F0]" : "bg-transparent hover:bg-slate-100/60"
                        )}
                        onPointerDown={startDrag("right")}
                    >
                        <div className="h-[60%] w-0.5 rounded-full bg-slate-300/70" />
                    </div>
                    <div className="min-w-0 h-full">
                        {controlHub}
                    </div>
                </div>
            </div>
        </PanelSizingContext.Provider>
    );
}
