"use client";

import { cn } from "@/lib/utils";

import * as React from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import type { PromptSnippet } from "@/components/learn/types";

import { Badge } from "@/components/ui/badge";
import { Sparkles, Loader2 } from "lucide-react";

interface PromptEngineProps {
    prompt: string;
    setPrompt: (v: string) => void;
    baseStyle?: string;
    basePrompt?: string;

    // Snippets
    snippets?: PromptSnippet[];
    snippetsLoading?: boolean;
    selectedSnippetId?: string | null;
    onSelectSnippet?: (id: string) => void;

    // Actions
    onSaveSnippet?: (name?: string) => void;
    onDeleteSnippet?: () => void;
    snippetRemark?: string;
    setSnippetRemark?: (v: string) => void;
    isBusy?: "create" | "delete" | null;
}

export function PromptEngine({
    prompt,
    setPrompt,
    baseStyle,
    basePrompt,
    snippets = [],
    snippetsLoading = false,
    selectedSnippetId,
    onSelectSnippet,
    onSaveSnippet,
    onDeleteSnippet,
    snippetRemark = "",
    setSnippetRemark,
    isBusy,
}: PromptEngineProps) {
    const PROMPT_MIN_HEIGHT = 80;
    const PROMPT_MAX_HEIGHT = 240;
    const promptRef = React.useRef<HTMLTextAreaElement>(null);
    const lastAutoHeightRef = React.useRef<number | null>(null);
    const [manualHeight, setManualHeight] = React.useState<number | null>(null);
    const [manualLocked, setManualLocked] = React.useState(false);

    const trimmed = prompt.trim();
    const canSave = !!trimmed && isBusy !== "create";

    const MASTER_TEMPLATES = [
        { label: "✨ 时尚大片", value: "High-end fashion editorial, professional lighting, vogue style, 8k resolution" },
        { label: "📸 街头头秀", value: "Street fashion photography, natural sunlight, urban background, candid style" },
        { label: "👗 杂志封面", value: "Magazine cover layout, clean sharp focus, high contrast, commercial aesthetic" },
        { label: "🎬 电影光影", value: "Cinematic lighting, dramatic shadows, moody atmosphere, anamorphic look" },
        { label: "⚪ 纯净白底", value: "Clean studio white background, soft shadows, uniform lighting, product shot" },
    ];

    // Auto-resize logic
    const resizePrompt = React.useCallback(() => {
        const el = promptRef.current;
        if (!el) return;
        if (manualLocked) {
            if (manualHeight) {
                el.style.height = `${manualHeight}px`;
            }
            el.style.overflowY = "auto";
            return;
        }
        el.style.height = "auto";
        const next = Math.min(Math.max(el.scrollHeight, PROMPT_MIN_HEIGHT), PROMPT_MAX_HEIGHT);
        el.style.height = `${next}px`;
        el.style.overflowY = el.scrollHeight > PROMPT_MAX_HEIGHT ? "auto" : "hidden";
        lastAutoHeightRef.current = next;
    }, [manualHeight, manualLocked]);

    React.useLayoutEffect(() => {
        resizePrompt();
    }, [prompt, resizePrompt]);

    const handleManualResize = React.useCallback(() => {
        const el = promptRef.current;
        if (!el) return;
        const current = Math.round(el.offsetHeight || 0);
        const lastAuto = lastAutoHeightRef.current;
        if (!lastAuto) return;
        if (Math.abs(current - lastAuto) < 4) return;
        setManualHeight(current);
        setManualLocked(true);
    }, []);

    return (
        <div className="flex flex-col gap-2 relative">
            {baseStyle && (
                <div className="absolute -top-3 left-3 z-10">
                    <Badge
                        variant="secondary"
                        className="bg-violet-100 text-violet-700 hover:bg-violet-200 border-violet-200 shadow-sm text-[10px] px-2 py-0.5 h-5 flex items-center gap-1 cursor-help"
                        title={basePrompt ? `基础提示词: ${basePrompt}` : `已应用 ${baseStyle} 风格`}
                    >
                        <Sparkles className="w-3 h-3" />
                        基于风格: {baseStyle}
                    </Badge>
                </div>
            )}
            <Textarea
                ref={promptRef}
                value={prompt}
                onChange={(e) => {
                    setPrompt(e.target.value);
                    requestAnimationFrame(resizePrompt); // Performance optimization
                }}
                onPointerUp={handleManualResize}
                style={manualLocked && manualHeight ? { height: `${manualHeight}px` } : undefined}
                placeholder="描述你想要的画面：穿在什么样的模特身上？动作？场景？光影？..."
                className={cn(
                    "min-h-[80px] w-full bg-white border border-[#D8B4FE] focus-visible:ring-1 focus-visible:ring-[#FF7F50] focus-visible:border-[#FF7F50] resize-y text-base pl-3 pt-3 shadow-sm transition-all placeholder:text-[#E9ECEF]",
                    baseStyle && "pt-4" // Add padding top if badge is present
                )}
            />

            {/* Master Templates */}
            <div className="flex flex-col gap-1.5 px-1 py-1 bg-[#F8F9FA] rounded-xl border border-slate-100">
                <div className="flex items-center justify-between px-1">
                    <span className="text-[10px] font-bold text-slate-400">大师模板 (点击追加)</span>
                </div>
                <div className="flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-none">
                    {MASTER_TEMPLATES.map((tmpl) => (
                        <Button
                            key={tmpl.label}
                            variant="outline"
                            size="sm"
                            className="h-6 px-2 text-[10px] rounded-full bg-white hover:bg-[#FFF5F0] hover:text-[#FF4500] hover:border-[#FF4500] transition-all border-slate-200/60 whitespace-nowrap"
                            onClick={() => {
                                const next = prompt.trim() ? `${prompt.trim()}, ${tmpl.value}` : tmpl.value;
                                setPrompt(next);
                            }}
                        >
                            {tmpl.label}
                        </Button>
                    ))}
                </div>
            </div>

            {/* User Templates Bar */}
            <div className="mt-1 space-y-1.5">
                <div className="flex items-center justify-between px-1">
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">我的模板</span>
                    {snippetsLoading && <Loader2 className="w-3 h-3 animate-spin text-slate-400" />}
                </div>

                <div className="flex items-center gap-2 overflow-x-auto pb-1 scrollbar-none mask-fade-right">
                    <div className="flex items-center gap-1.5 shrink-0 pr-4">
                        {snippets.length > 0 ? (
                            snippets.map((ps) => (
                                <Button
                                    key={ps.id}
                                    variant="ghost"
                                    size="sm"
                                    className={cn(
                                        "h-7 px-3 text-[11px] rounded-full border transition-all whitespace-nowrap",
                                        selectedSnippetId === ps.id
                                            ? "bg-violet-100 text-violet-700 border-violet-200 shadow-sm"
                                            : "bg-white/50 text-slate-600 border-slate-200/60 hover:border-violet-300 hover:bg-violet-50"
                                    )}
                                    onClick={() => {
                                        onSelectSnippet?.(ps.id);
                                        if (!prompt.includes(ps.text)) {
                                            const next = prompt.trim() ? `${prompt.trim()}, ${ps.text}` : ps.text;
                                            setPrompt(next);
                                        }
                                    }}
                                >
                                    {ps.name || "未命名模板"}
                                </Button>
                            ))
                        ) : !snippetsLoading && (
                            <span className="text-[10px] text-slate-400 italic px-1">暂无保存模板</span>
                        )}
                    </div>
                </div>

                {/* Template Actions */}
                <div className="flex items-center gap-2 px-1 pt-1">
                    <Input
                        value={snippetRemark}
                        onChange={(e) => setSnippetRemark?.(e.target.value)}
                        placeholder="保存为模板名称..."
                        className="h-7 text-[10px] bg-white/40 border-slate-200/50 flex-1"
                    />
                    <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 px-3 text-[10px] text-slate-500 hover:text-violet-600"
                        onClick={() => onSaveSnippet?.(snippetRemark)}
                        disabled={!canSave}
                    >
                        {isBusy === "create" ? <Loader2 className="w-3 h-3 animate-spin" /> : "保存"}
                    </Button>
                    {selectedSnippetId && (
                        <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 px-2 text-[10px] text-red-400 hover:text-red-500 hover:bg-red-50"
                            onClick={onDeleteSnippet}
                        >
                            {isBusy === "delete" ? <Loader2 className="w-3 h-3 animate-spin" /> : "删除"}
                        </Button>
                    )}
                </div>
            </div>
        </div>
    );
}
