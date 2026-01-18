"use client";

import * as React from "react";
import { UploadCloud, X, Loader2, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { GlassPanel } from "@/components/learn/glass-panel";
import { cn } from "@/lib/utils";
import type { PromptSnippet } from "@/components/learn/types";

interface CreationStageProps {
    garmentFiles: File[];
    garmentUrls: string[];
    addGarmentFiles: (files: File[]) => void;
    removeGarmentAt: (index: number) => void;

    prompt: string;
    setPrompt: (v: string) => void;

    autoStylePrompt?: string;
    styleLabel?: string;

    onGenerate: () => void;
    creating: boolean;

    estimatedCreditsCost: number;
    balance: number;
    creditsLoaded: boolean;
    notice?: string;

    // New Props
    isFocused?: boolean;
    onInteraction?: () => void;
    poseCount?: number;
    faceRemark?: string;
    promptSnippets?: PromptSnippet[];
    promptSnippetsLoading?: boolean;
    promptSnippetsBusy?: "create" | "delete" | null;
    selectedSnippetId?: string | null;
    onSelectSnippet?: (id: string) => void;
    onSaveSnippet?: (name?: string) => void;
    onDeleteSnippet?: () => void;
    snippetRemark?: string;
    setSnippetRemark?: (v: string) => void;
}

export function CreationStage({
    garmentFiles,
    garmentUrls,
    addGarmentFiles,
    removeGarmentAt,
    prompt,
    setPrompt,
    autoStylePrompt,
    styleLabel,
    onGenerate,
    creating,
    estimatedCreditsCost,
    balance,
    creditsLoaded,
    notice,
    isFocused,
    onInteraction,
    poseCount = 0,
    faceRemark,
    promptSnippets = [],
    promptSnippetsLoading = false,
    promptSnippetsBusy = null,
    selectedSnippetId,
    onSelectSnippet,
    onSaveSnippet,
    onDeleteSnippet,
    snippetRemark = "",
    setSnippetRemark,
}: CreationStageProps) {
    const PROMPT_MIN_HEIGHT = 80;
    const PROMPT_MAX_HEIGHT = 240;
    const [dragOver, setDragOver] = React.useState(false);
    const promptRef = React.useRef<HTMLTextAreaElement>(null);
    const inputRef = React.useRef<HTMLInputElement>(null);
    const folderInputRef = React.useRef<HTMLInputElement>(null);
    const dragCounter = React.useRef(0);
    const [lastInteraction, setLastInteraction] = React.useState(0);
    const resolvedStyleLabel = String(styleLabel || "").trim();
    const hasPromptSnippets = promptSnippets.length > 0;
    const trimmedPrompt = prompt.trim();
    const canSaveSnippet = !!trimmedPrompt && promptSnippetsBusy !== "create";
    const canDeleteSnippet = !!selectedSnippetId && promptSnippetsBusy !== "delete";

    type FileSystemEntryLike = {
        isFile: boolean;
        isDirectory: boolean;
    };
    type FileSystemFileEntryLike = FileSystemEntryLike & {
        file: (success: (file: File) => void, error?: (err: any) => void) => void;
    };
    type FileSystemDirectoryEntryLike = FileSystemEntryLike & {
        createReader: () => {
            readEntries: (success: (entries: FileSystemEntryLike[]) => void, error?: (err: any) => void) => void;
        };
    };

    const readEntryFiles = React.useCallback(async (entry: FileSystemEntryLike): Promise<File[]> => {
        if (entry.isFile) {
            const fileEntry = entry as FileSystemFileEntryLike;
            return new Promise((resolve) => {
                fileEntry.file((file) => resolve([file]), () => resolve([]));
            });
        }
        if (entry.isDirectory) {
            const dirEntry = entry as FileSystemDirectoryEntryLike;
            const reader = dirEntry.createReader();
            const entries: FileSystemEntryLike[] = [];
            const readBatch = () =>
                new Promise<FileSystemEntryLike[]>((resolve) => {
                    reader.readEntries(resolve, () => resolve([]));
                });
            while (true) {
                const batch = await readBatch();
                if (!batch.length) break;
                entries.push(...batch);
            }
            const nested = await Promise.all(entries.map((e) => readEntryFiles(e)));
            return nested.flat();
        }
        return [];
    }, []);

    const collectDroppedFiles = React.useCallback(async (dataTransfer: DataTransfer): Promise<File[]> => {
        const items = Array.from(dataTransfer.items || []);
        const entries = items
            .map((item) => (item as any).webkitGetAsEntry?.())
            .filter(Boolean) as FileSystemEntryLike[];
        if (entries.length) {
            const nested = await Promise.all(entries.map((entry) => readEntryFiles(entry)));
            return nested.flat();
        }
        return Array.from(dataTransfer.files || []);
    }, [readEntryFiles]);

    const resizePrompt = React.useCallback(() => {
        const el = promptRef.current;
        if (!el) return;
        el.style.height = "auto";
        const next = Math.min(Math.max(el.scrollHeight, PROMPT_MIN_HEIGHT), PROMPT_MAX_HEIGHT);
        el.style.height = `${next}px`;
        el.style.overflowY = el.scrollHeight > PROMPT_MAX_HEIGHT ? "auto" : "hidden";
    }, [PROMPT_MIN_HEIGHT, PROMPT_MAX_HEIGHT]);

    React.useLayoutEffect(() => {
        resizePrompt();
    }, [prompt, resizePrompt]);

    React.useEffect(() => {
        const input = folderInputRef.current;
        if (!input) return;
        input.setAttribute("webkitdirectory", "");
        input.setAttribute("directory", "");
    }, []);

    const handleInteraction = React.useCallback(() => {
        const now = Date.now();
        if (now - lastInteraction > 1000) {
            onInteraction?.();
            setLastInteraction(now);
        }
    }, [lastInteraction, onInteraction]);

    const onDragEnter = (e: React.DragEvent) => {
        e.preventDefault();
        dragCounter.current += 1;
        setDragOver(true);
        handleInteraction();
    };

    const onDragLeave = (e: React.DragEvent) => {
        e.preventDefault();
        dragCounter.current = Math.max(0, dragCounter.current - 1);
        if (dragCounter.current === 0) setDragOver(false);
    };

    const onDrop = (e: React.DragEvent) => {
        e.preventDefault();
        dragCounter.current = 0;
        setDragOver(false);
        const dt = e.dataTransfer;
        void (async () => {
            const files = await collectDroppedFiles(dt);
            addGarmentFiles(files);
            handleInteraction();
        })();
    };

    return (
        <div className="w-full max-w-5xl mx-auto flex flex-col h-full gap-6 pointer-events-auto">
            {notice && (
                <div className="flex justify-center">
                    <div className="inline-flex items-center gap-2 rounded-full border border-white/40 bg-white/70 px-4 py-1 text-xs text-slate-600 shadow-sm backdrop-blur">
                        {notice}
                    </div>
                </div>
            )}

            {/* 1. Main Stage: Garment Upload Area */}
            <div className="flex-1 min-h-0 flex flex-col relative transition-transform duration-300">
                <GlassPanel
                    className={cn(
                        "flex-1 relative flex flex-col items-center justify-center p-8 transition-all duration-300 border-2 border-dashed",
                        dragOver ? "border-purple-400 bg-purple-50/20 scale-[1.01]" : "border-white/30 hover:border-white/60",
                        garmentFiles.length > 0 ? "border-solid border-white/20" : "",
                        isFocused && !dragOver ? "shadow-[0_0_40px_-10px_rgba(168,85,247,0.3)] border-white/50" : ""
                    )}
                    intensity="low"
                    onDragEnter={onDragEnter}
                    onDragOver={(e) => e.preventDefault()}
                    onDragLeave={onDragLeave}
                    onDrop={onDrop}
                >
                    {garmentFiles.length > 0 ? (
                        <div className="w-full h-full grid grid-cols-1 md:grid-cols-3 gap-6 animate-fade-in text-center">
                            {/* Gallery Grid */}
                            {garmentUrls.map((url, idx) => (
                                <div key={url} className="relative group aspect-[3/4] max-h-[60vh] mx-auto">
                                    <img src={url} alt="Garment" className="w-full h-full object-contain drop-shadow-2xl" />
                                    <Button
                                        variant="destructive" size="icon"
                                        className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity rounded-full h-8 w-8"
                                        onClick={() => removeGarmentAt(idx)}
                                    >
                                        <X className="w-4 h-4" />
                                    </Button>
                                </div>
                            ))}

                            {/* Add More Button (if not full) */}
                            {garmentFiles.length < 6 && (
                                <button
                                    onClick={() => inputRef.current?.click()}
                                    className="flex items-center justify-center aspect-[3/4] max-h-[60vh] rounded-xl border-2 border-dashed border-white/30 text-white/50 hover:bg-white/10 hover:text-white transition-colors"
                                >
                                    <UploadCloud className="w-8 h-8 opacity-50" />
                                </button>
                            )}
                        </div>
                    ) : (
                        /* Empty State */
                        <div className="text-center space-y-4 cursor-pointer" onClick={() => inputRef.current?.click()}>
                            <div className="w-20 h-20 bg-gradient-to-br from-purple-100/20 to-pink-100/20 rounded-3xl flex items-center justify-center mx-auto backdrop-blur-md shadow-inner border border-white/20 group-hover:scale-110 transition-transform duration-300">
                                <UploadCloud className="w-10 h-10 text-purple-600/80" />
                            </div>
                            <div>
                                <h3 className="text-2xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-purple-600 to-pink-500">
                                    拖拽衣服到这里
                                </h3>
                                <p className="text-slate-500 mt-2">支持 JPG/PNG，自动去除背景</p>
                            </div>
                        </div>
                    )}

                    {garmentFiles.length < 6 && (
                        <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
                            <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                className="h-8 text-xs bg-white/60"
                                onClick={() => inputRef.current?.click()}
                            >
                                选择文件
                            </Button>
                            <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                className="h-8 text-xs bg-white/60"
                                onClick={() => folderInputRef.current?.click()}
                            >
                                选择文件夹
                            </Button>
                        </div>
                    )}

                    <input
                        ref={inputRef} type="file" multiple accept="image/*" className="hidden"
                        onChange={(e) => {
                            addGarmentFiles(Array.from(e.target.files || []));
                            e.target.value = "";
                            handleInteraction();
                        }}
                    />
                    <input
                        ref={folderInputRef} type="file" multiple accept="image/*" className="hidden"
                        onChange={(e) => {
                            addGarmentFiles(Array.from(e.target.files || []));
                            e.target.value = "";
                            handleInteraction();
                        }}
                    />
                </GlassPanel>
            </div>

            {/* 2. Control Island: Prompt + Generate */}
            <GlassPanel intensity="high" className="flex-shrink-0 p-2 flex gap-2 items-end animate-slide-up shadow-2xl z-20">
                <div className="flex-1 relative flex flex-col justify-end">
                    {/* Capsules Row */}
                    <div className="flex items-center gap-2 mb-2 min-h-[24px]">
                        {/* Dynamic Style Capsule */}
                        {autoStylePrompt && (
                            <div
                                onClick={handleInteraction}
                                className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-100/80 border border-emerald-200/60 shadow-sm cursor-pointer hover:scale-105 transition-transform select-none"
                                title={resolvedStyleLabel || undefined}
                            >
                                <span className="text-[10px] font-bold text-emerald-600 uppercase tracking-wider">Style</span>
                                <div className="h-3 w-[1px] bg-emerald-300" />
                                <span className="text-xs font-medium text-emerald-800 truncate max-w-[150px] md:max-w-[300px]">
                                    {resolvedStyleLabel || "已应用风格"}
                                </span>
                            </div>
                        )}

                        {/* Pose Counter Capsule (moved from AssetLibrary) */}
                        {poseCount > 0 && (
                            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-rose-100/80 border border-rose-200/60 shadow-sm select-none animate-fade-in">
                                <span className="text-[10px] font-bold text-rose-600 uppercase tracking-wider">Pose</span>
                                <div className="h-3 w-[1px] bg-rose-300" />
                                <div className="flex -space-x-1.5">
                                    {[...Array(Math.min(3, poseCount))].map((_, i) => (
                                        <div key={i} className="w-3 h-3 rounded-full bg-rose-300 border border-white" />
                                    ))}
                                </div>
                                <span className="text-xs font-medium text-rose-800 ml-1">
                                    {poseCount} / 4
                                </span>
                            </div>
                        )}

                        {/* Face Remark Capsule (New) */}
                        {faceRemark && (
                            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-blue-100/80 border border-blue-200/60 shadow-sm select-none animate-fade-in">
                                <span className="text-[10px] font-bold text-blue-600 uppercase tracking-wider">Face</span>
                                <div className="h-3 w-[1px] bg-blue-300" />
                                <span className="text-xs font-medium text-blue-800 truncate max-w-[150px]">
                                    {faceRemark}
                                </span>
                            </div>
                        )}
                    </div>

                    <Textarea
                        ref={promptRef}
                        value={prompt}
                        onChange={(e) => {
                            setPrompt(e.target.value);
                            requestAnimationFrame(resizePrompt);
                        }}
                        placeholder="描述你想要的画面：穿在什么样的模特身上？动作？场景？光影？..."
                        className="min-h-[80px] bg-transparent border-0 focus-visible:ring-0 resize-none text-base pl-3 pt-3"
                    />
                    <div className="mt-2 space-y-2">
                        <div className="flex items-center justify-between">
                            <span className="text-xs font-semibold text-slate-600">提示词模板</span>
                            {promptSnippetsLoading && (
                                <span className="text-[11px] text-slate-400">加载中...</span>
                            )}
                        </div>
                        <div className="flex items-center gap-2">
                            <Select
                                value={selectedSnippetId ?? undefined}
                                onValueChange={(id) => onSelectSnippet?.(id)}
                            >
                                <SelectTrigger className="h-8 text-xs min-w-[180px]" disabled={promptSnippetsLoading || !hasPromptSnippets}>
                                    <SelectValue placeholder={promptSnippetsLoading ? "模板加载中..." : hasPromptSnippets ? "选择模板..." : "暂无模板"} />
                                </SelectTrigger>
                                <SelectContent>
                                    {promptSnippets.map((p) => (
                                        <SelectItem key={p.id} value={p.id}>
                                            {p.name || p.text.slice(0, 24)}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                            <Button
                                variant="ghost"
                                size="sm"
                                className="h-8 text-xs"
                                onClick={() => onSaveSnippet?.(snippetRemark)}
                                disabled={!canSaveSnippet}
                            >
                                {promptSnippetsBusy === "create" ? "保存中..." : "保存当前"}
                            </Button>
                            <Button
                                variant="ghost"
                                size="sm"
                                className="h-8 text-xs text-muted-foreground"
                                onClick={() => onDeleteSnippet?.()}
                                disabled={!canDeleteSnippet}
                            >
                                {promptSnippetsBusy === "delete" ? "删除中..." : "删除"}
                            </Button>
                        </div>
                        <Input
                            value={snippetRemark}
                            onChange={(e) => setSnippetRemark?.(e.target.value)}
                            placeholder="备注（可选，用于保存模板名称）"
                            className="h-8 text-xs bg-white/60"
                        />
                    </div>
                </div>

                <div className="flex flex-col items-end gap-1 pb-1 pr-1">
                    <div className="text-[10px] text-muted-foreground mr-1">
                        {estimatedCreditsCost} 积分
                    </div>
                    <Button
                        size="lg"
                        className="h-12 px-6 rounded-xl bg-gradient-to-r from-orange-500 via-pink-500 to-violet-600 shadow-lg shadow-purple-500/20 hover:scale-105 hover:shadow-purple-500/40 transition-all duration-300 animate-jelly"
                        onClick={onGenerate}
                        disabled={creating || (creditsLoaded && balance < estimatedCreditsCost)}
                    >
                        {creating ? <Loader2 className="w-5 h-5 animate-spin" /> : <Sparkles className="w-5 h-5 mr-1" />}
                        <span className="font-semibold">生成</span>
                    </Button>
                </div>
            </GlassPanel>

        </div>
    );
}
