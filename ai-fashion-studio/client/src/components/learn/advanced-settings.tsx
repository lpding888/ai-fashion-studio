"use client";

import * as React from "react";
import { ChevronDown, ChevronUp, Settings2 } from "lucide-react";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";

const LAYOUT_OPTIONS = ["Individual", "Grid"] as const;
const RESOLUTION_OPTIONS = ["1K", "2K", "4K"] as const;
const ASPECT_RATIO_OPTIONS = ["1:1", "3:4", "4:3", "9:16", "16:9", "21:9"] as const;

const isLayoutMode = (value: string): value is (typeof LAYOUT_OPTIONS)[number] =>
  LAYOUT_OPTIONS.includes(value as (typeof LAYOUT_OPTIONS)[number]);

const isResolution = (value: string): value is (typeof RESOLUTION_OPTIONS)[number] =>
  RESOLUTION_OPTIONS.includes(value as (typeof RESOLUTION_OPTIONS)[number]);

const isAspectRatio = (value: string): value is (typeof ASPECT_RATIO_OPTIONS)[number] =>
  ASPECT_RATIO_OPTIONS.includes(value as (typeof ASPECT_RATIO_OPTIONS)[number]);

interface AdvancedSettingsProps {
  resolution: "1K" | "2K" | "4K";
  setResolution: (v: "1K" | "2K" | "4K") => void;
  aspectRatio: "1:1" | "4:3" | "3:4" | "16:9" | "9:16" | "21:9";
  setAspectRatio: (v: "1:1" | "4:3" | "3:4" | "16:9" | "9:16" | "21:9") => void;
  layoutMode: "Individual" | "Grid";
  setLayoutMode: (v: "Individual" | "Grid") => void;
  shotCount: number;
  setShotCount: (v: number) => void;
  seed: string;
  setSeed: (v: string) => void;
  temperature: string;
  setTemperature: (v: string) => void;
  includeThoughts: boolean;
  setIncludeThoughts: (v: boolean) => void;
}

export function AdvancedSettings({
  resolution,
  setResolution,
  aspectRatio,
  setAspectRatio,
  layoutMode,
  setLayoutMode,
  shotCount,
  setShotCount,
  seed,
  setSeed,
  temperature,
  setTemperature,
  includeThoughts,
  setIncludeThoughts,
}: AdvancedSettingsProps) {
  const [isOpen, setIsOpen] = React.useState(false); // Default closed to save space

  // 简单摘要，显示关键参数
  const summary = React.useMemo(() => {
    const modeLabel = layoutMode === "Grid" ? "拼图" : "单张";
    const parts: string[] = [modeLabel, `${shotCount}张`, resolution, aspectRatio];
    if (seed) parts.push(`Seed:${seed}`);
    if (includeThoughts) parts.push("Thoughts");
    return parts.join(" | ");
  }, [layoutMode, resolution, aspectRatio, seed, includeThoughts, shotCount]);

  return (
    <Collapsible open={isOpen} onOpenChange={setIsOpen} className="w-full space-y-2 border rounded-xl bg-white/50">
      <div className="flex items-center justify-between px-4 py-3">
        <h4 className="text-sm font-semibold flex items-center gap-2 text-slate-700">
          <Settings2 className="w-4 h-4 text-purple-500" />
          高级设置
          {!isOpen && <span className="text-xs font-normal text-muted-foreground ml-2">({summary})</span>}
        </h4>
        <CollapsibleTrigger asChild>
          <Button variant="ghost" size="sm" className="w-9 h-9 p-0 rounded-full hover:bg-slate-100">
            {isOpen ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
            <span className="sr-only">Toggle</span>
          </Button>
        </CollapsibleTrigger>
      </div>

      <CollapsibleContent className="space-y-4 px-4 pb-4 animate-slide-down">
        <Separator />

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2">
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-slate-600">输出模式</label>
            <Select
              value={layoutMode}
              onValueChange={(v) => {
                if (isLayoutMode(v)) setLayoutMode(v);
              }}
            >
              <SelectTrigger className="h-9">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="Individual">单张模式（每张独立）</SelectItem>
                <SelectItem value="Grid">拼图模式（多姿势合成）</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-medium text-slate-600">分辨率</label>
            <Select
              value={resolution}
              onValueChange={(v) => {
                if (isResolution(v)) setResolution(v);
              }}
            >
              <SelectTrigger className="h-9">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="1K">1K (标准)</SelectItem>
                <SelectItem value="2K">2K (高清 - 2倍消耗)</SelectItem>
                <SelectItem value="4K">4K (超清 - 4倍消耗)</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-medium text-slate-600">画面比例</label>
            <Select
              value={aspectRatio}
              onValueChange={(v) => {
                if (isAspectRatio(v)) setAspectRatio(v);
              }}
            >
              <SelectTrigger className="h-9">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="1:1">1:1 (方图)</SelectItem>
                <SelectItem value="3:4">3:4 (人像竖图)</SelectItem>
                <SelectItem value="4:3">4:3 (常规横图)</SelectItem>
                <SelectItem value="9:16">9:16 (手机全屏)</SelectItem>
                <SelectItem value="16:9">16:9 (宽屏)</SelectItem>
                <SelectItem value="21:9">21:9 (电影感)</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-medium text-slate-600">生成张数</label>
            <Select value={String(shotCount)} onValueChange={(v) => setShotCount(Number(v))}>
              <SelectTrigger className="h-9" disabled={layoutMode === "Grid"}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="1">1 张</SelectItem>
                <SelectItem value="2">2 张</SelectItem>
                <SelectItem value="4">4 张</SelectItem>
                <SelectItem value="6">6 张</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-medium text-slate-600">随机种子 (Seed)</label>
            <Input
              value={seed}
              onChange={(e) => setSeed(e.target.value)}
              placeholder="随机"
              className="h-9"
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-medium text-slate-600">创意度 (Temperature)</label>
            <Input
              value={temperature}
              onChange={(e) => setTemperature(e.target.value)}
              placeholder="默认"
              className="h-9"
            />
          </div>
        </div>

        <div className="flex items-center justify-between gap-3 bg-purple-50/50 p-3 rounded-lg border border-purple-100">
          <div className="space-y-0.5">
            <div className="text-sm font-medium text-purple-900">Include Thoughts (CoT)</div>
            <div className="text-xs text-purple-700/80">
              仅生图阶段启用；显示 AI 的思考推理过程。
            </div>
          </div>
          <Switch checked={includeThoughts} onCheckedChange={setIncludeThoughts} />
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}
