"use client";

import * as React from "react";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Layers, Dices, Image as ImageIcon, LayoutGrid, Zap, Thermometer, BrainCircuit } from "lucide-react";
import { cn } from "@/lib/utils";
import { usePanelSizing } from "@/components/learn/layout/studio-layout";

interface ParameterSectionProps {
    seed: number;
    setSeed: (seed: number) => void;
    randomSeed: boolean;
    setRandomSeed: (random: boolean) => void;
    aspectRatio: string;
    setAspectRatio: (ratio: string) => void;
    outputCount: number;
    setOutputCount: (count: number) => void;
    resolution: "1K" | "2K" | "4K";
    setResolution: (res: "1K" | "2K" | "4K") => void;
    // New Props
    includeThoughts?: boolean;
    setIncludeThoughts?: (v: boolean) => void;
    temperature?: number | string;
    setTemperature?: (v: string) => void;
    collapsed?: boolean;
    onCollapsedChange?: (collapsed: boolean) => void;
}

const ASPECT_RATIOS = [
    { label: "1:1 方正", value: "1:1", icon: "Square" },
    { label: "3:4 经典", value: "3:4", icon: "Portrait" },
    { label: "4:3 宽幅", value: "4:3", icon: "Landscape" },
    { label: "9:16 全屏", value: "9:16", icon: "Mobile" },
    { label: "16:9 影院", value: "16:9", icon: "Landscape" },
    { label: "21:9 超宽", value: "21:9", icon: "Landscape" },
];

export function ParameterSection({
    seed,
    setSeed,
    randomSeed,
    setRandomSeed,
    aspectRatio,
    setAspectRatio,
    outputCount,
    setOutputCount,
    resolution,
    setResolution,
    includeThoughts,
    setIncludeThoughts,
    temperature,
    setTemperature,
    collapsed,
    onCollapsedChange,
}: ParameterSectionProps) {
    const panelSizing = usePanelSizing();
    const density = panelSizing?.rightDensity ?? "md";
    const isCompact = density === "sm";
    const labelClass = isCompact ? "text-[10px]" : "text-xs";
    const sectionGap = isCompact ? "space-y-4" : "space-y-6";
    // Parse temp
    const tempValue = typeof temperature === 'number' ? temperature : parseFloat(temperature as string || "1.0");
    const displayTemp = isNaN(tempValue) ? 1.0 : tempValue;
    const [internalCollapsed, setInternalCollapsed] = React.useState(false);
    const isCollapsed = typeof collapsed === "boolean" ? collapsed : internalCollapsed;

    return (
        <Accordion
            type="single"
            collapsible
            value={isCollapsed ? "" : "params"}
            onValueChange={(value) => {
                const nextCollapsed = value !== "params";
                if (typeof collapsed === "boolean") {
                    onCollapsedChange?.(nextCollapsed);
                } else {
                    setInternalCollapsed(nextCollapsed);
                    onCollapsedChange?.(nextCollapsed);
                }
            }}
            className="w-full"
        >
            <AccordionItem value="params" className="border-none">
                <AccordionTrigger className={cn("hover:no-underline", isCompact ? "py-1.5" : "py-2")}>
                    <div className="flex items-center gap-2">
                        <Layers className={cn("text-purple-500", isCompact ? "w-3.5 h-3.5" : "w-4 h-4")} />
                        <span className={cn("font-semibold text-slate-700", isCompact ? "text-xs" : "text-sm")}>
                            生成参数
                        </span>
                    </div>
                </AccordionTrigger>
                <AccordionContent className={cn("pt-2 px-1", sectionGap)}>

                    {/* Resolution */}
                    <div className="space-y-3">
                        <Label className={cn("font-medium text-slate-500 flex items-center gap-1", labelClass)}>
                            <Zap className="w-3.5 h-3.5" />
                            输出分辨率
                        </Label>
                        <div className="flex items-center gap-2">
                            {(["1K", "2K", "4K"] as const).map((r) => (
                                <button
                                    key={r}
                                    onClick={() => setResolution(r)}
                                    className={cn(
                                        "flex-1 flex items-center justify-center rounded-lg border transition-all font-bold",
                                        isCompact ? "py-1.5 px-2 text-[10px]" : "py-2 px-3 text-xs",
                                        resolution === r
                                            ? "border-[#FF7F50] bg-[#FF7F50] text-white shadow-md"
                                            : "border-slate-200 hover:border-slate-300 text-slate-600 bg-slate-50"
                                    )}
                                >
                                    {r}
                                </button>
                            ))}
                        </div>
                    </div>

                    {/* Aspect Ratio */}
                    <div className="space-y-3">
                        <Label className={cn("font-medium text-slate-500 flex items-center gap-1", labelClass)}>
                            <ImageIcon className="w-3.5 h-3.5" />
                            图片比例
                        </Label>
                        <div className={cn("grid grid-cols-3", isCompact ? "gap-1.5" : "gap-2")}>
                            {ASPECT_RATIOS.map((ratio) => (
                                <button
                                    key={ratio.value}
                                    onClick={() => setAspectRatio(ratio.value)}
                                    className={cn(
                                        "flex flex-col items-center justify-center rounded-lg border transition-all gap-1",
                                        isCompact ? "p-1.5 text-[10px]" : "p-2 text-xs",
                                        aspectRatio === ratio.value
                                            ? "border-[#FF7F50] bg-[#FF7F50] text-white font-medium shadow-md"
                                            : "border-slate-200 hover:border-slate-300 text-slate-600 bg-slate-50"
                                    )}
                                >
                                    <span className={cn(
                                        "block border border-current opacity-50 mb-1",
                                        ratio.value === "1:1" && "w-3 h-3 rounded-sm",
                                        ratio.value === "3:4" && "w-2.5 h-3.5 rounded-sm",
                                        ratio.value === "4:3" && "w-3.5 h-2.5 rounded-sm",
                                        ratio.value === "9:16" && "w-2 h-4 rounded-sm",
                                        ratio.value === "16:9" && "w-4 h-2 rounded-sm",
                                        ratio.value === "21:9" && "w-5 h-2 rounded-sm",
                                    )} />
                                    {ratio.label}
                                </button>
                            ))}
                        </div>
                    </div>

                    {/* Output Count */}
                    <div className="space-y-3">
                        <div className="flex items-center justify-between">
                            <Label className={cn("font-medium text-slate-500 flex items-center gap-1", labelClass)}>
                                <LayoutGrid className="w-3.5 h-3.5" />
                                生成数量
                            </Label>
                            <Badge variant="secondary" className={cn("h-5 font-mono", isCompact ? "text-[9px]" : "text-[10px]")}>
                                {outputCount}
                            </Badge>
                        </div>
                        <Slider
                            value={[outputCount]}
                            onValueChange={(vals: number[]) => setOutputCount(vals[0])}
                            min={1}
                            max={6}
                            step={1}
                            className="py-2"
                        />
                        <div className="flex justify-between px-1">
                            <span className="text-[10px] text-slate-400">1</span>
                            <span className="text-[10px] text-slate-400">6</span>
                        </div>
                    </div>

                    {/* Seed Control */}
                    <div className="space-y-3">
                        <div className="flex items-center justify-between">
                            <Label className={cn("font-medium text-slate-500 flex items-center gap-1", labelClass)}>
                                <Dices className="w-3.5 h-3.5" />
                                随机种子
                            </Label>
                            <div className="flex items-center gap-2">
                                <span className={cn("text-[10px] font-mono", randomSeed ? "text-slate-400" : "text-purple-600")}>
                                    {randomSeed ? "随机" : seed}
                                </span>
                                <Button
                                    variant="ghost"
                                    size="icon"
                                    className={cn("h-6 w-6 rounded-full", randomSeed && "bg-purple-100 text-purple-600")}
                                    onClick={() => setRandomSeed(!randomSeed)}
                                    title="切换随机种子"
                                >
                                    <Dices className="w-3.5 h-3.5" />
                                </Button>
                            </div>
                        </div>
                        {!randomSeed && (
                            <Input
                                type="number"
                                value={seed}
                                onChange={(e) => setSeed(Number(e.target.value))}
                                className={cn("font-mono", isCompact ? "h-7 text-[10px]" : "h-8 text-xs")}
                                placeholder="输入种子..."
                            />
                        )}
                    </div>

                    {/* Advanced: Temperature & Thoughts */}
                    <div className="pt-2 border-t border-slate-100 space-y-4">
                        {/* Temperature */}
                        <div className="space-y-3">
                            <div className="flex items-center justify-between">
                                <Label className={cn("font-medium text-slate-500 flex items-center gap-1", labelClass)}>
                                    <Thermometer className="w-3.5 h-3.5" />
                                    创造性 (Temperature)
                                </Label>
                                <span className="text-[10px] font-mono text-slate-600">{displayTemp.toFixed(1)}</span>
                            </div>
                            <Slider
                                value={[displayTemp]}
                                onValueChange={(vals) => setTemperature?.(String(vals[0]))}
                                min={0}
                                max={2.0}
                                step={0.1}
                                className="py-2"
                            />
                        </div>

                        {/* CoT / Thoughts */}
                        {setIncludeThoughts && (
                            <div className="flex items-center justify-between">
                                <Label className={cn("font-medium text-slate-500 flex items-center gap-1", labelClass)}>
                                    <BrainCircuit className="w-3.5 h-3.5" />
                                    包含思考过程
                                </Label>
                                <Switch
                                    checked={!!includeThoughts}
                                    onCheckedChange={setIncludeThoughts}
                                    className="scale-75 origin-right"
                                />
                            </div>
                        )}
                    </div>

                </AccordionContent>
            </AccordionItem>
        </Accordion>
    );
}
