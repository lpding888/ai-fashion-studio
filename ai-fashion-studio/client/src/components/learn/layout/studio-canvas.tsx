"use client";

import * as React from "react";
import { cn } from "@/lib/utils";
import { GarmentBoard } from "@/components/learn/canvas/garment-board";
import { RecipeBar } from "@/components/learn/canvas/recipe-bar";
import { PromptEngine } from "@/components/learn/canvas/prompt-engine";
import { UserAssetLibraryDialog } from "@/components/learn/canvas/user-asset-library-dialog";
import { Button } from "@/components/ui/button";
import { Loader2, Sparkles } from "lucide-react";
import type { GarmentItem, PromptSnippet } from "@/components/learn/types";
import type { UserAsset } from "@/lib/user-assets";
import { useStudioSound } from "@/hooks/use-studio-sound";

interface StudioCanvasProps extends React.HTMLAttributes<HTMLDivElement> {
    // --- Layout ---
    onToggleLeftPanel?: () => void;
    onToggleRightPanel?: () => void;
    leftPanelOpen?: boolean;
    rightPanelOpen?: boolean;

    // --- Garment Board Data ---
    garmentItems: GarmentItem[];
    addGarmentFiles: (files: File[]) => void;
    removeGarmentItem: (id: string) => void;
    onReorderGarments?: (items: GarmentItem[]) => void;
    onClearGarments?: () => void;

    // --- User Asset Library ---
    userAssets?: UserAsset[];
    userAssetsLoading?: boolean;
    onLoadMoreUserAssets?: () => void;
    hasMoreUserAssets?: boolean;
    onSelectUserAsset?: (url: string) => void;

    // --- Recipe Bar Data ---
    styleLabel?: string;
    poseCount: number;
    faceRemark?: string;
    onClearStyle?: () => void;
    onClearPoses?: () => void;
    onClearFace?: () => void;
    onClearWorkbench?: () => void;
    hasWorkbenchState?: boolean;
    onOptimizePrompt?: () => void;
    onUndoOptimize?: () => void;
    canUndoOptimize?: boolean;
    optimizeBusy?: boolean;
    optimizeDisabled?: boolean;
    baseStyle?: string;

    // --- Prompt Engine Data ---
    prompt: string;
    setPrompt: (v: string) => void;
    snippets?: PromptSnippet[];
    snippetsLoading?: boolean;
    selectedSnippetId?: string | null;
    onSelectSnippet?: (id: string) => void;
    onSaveSnippet?: (name?: string) => void;
    onDeleteSnippet?: () => void;
    snippetRemark?: string;
    setSnippetRemark?: (v: string) => void;
    promptBusy?: "create" | "delete" | null;
    basePrompt?: string;

    // --- Generation Control ---
    onGenerate: () => void;
    generating?: boolean;
    creditCost?: number;
    balance?: number;
    creditsLoaded?: boolean;
}

export function StudioCanvas({
    className,
    onToggleLeftPanel,
    onToggleRightPanel,
    leftPanelOpen,
    rightPanelOpen,
    children,
    // Garments
    garmentItems,
    addGarmentFiles,
    removeGarmentItem,
    onReorderGarments,
    onClearGarments,
    // Assets
    userAssets = [],
    userAssetsLoading = false,
    onLoadMoreUserAssets,
    hasMoreUserAssets,
    onSelectUserAsset,
    // Recipe
    styleLabel,
    poseCount,
    faceRemark,
    onClearStyle,
    onClearPoses,
    onClearFace,
    onClearWorkbench,
    hasWorkbenchState,
    onOptimizePrompt,
    onUndoOptimize,
    canUndoOptimize,
    optimizeBusy,
    optimizeDisabled,
    baseStyle,
    basePrompt,
    // Prompt
    prompt,
    setPrompt,
    snippets,
    snippetsLoading,
    selectedSnippetId,
    onSelectSnippet,
    onSaveSnippet,
    onDeleteSnippet,
    snippetRemark,
    setSnippetRemark,
    promptBusy,
    // Generate
    onGenerate,
    generating,
    creditCost = 0,
    balance = 0,
    creditsLoaded = false,
    ...props
}: StudioCanvasProps) {
    const { play } = useStudioSound();
    const [assetDialogOpen, setAssetDialogOpen] = React.useState(false);

    return (
        <main
            className={cn(
                "relative flex flex-col h-full overflow-hidden",
                "lg:rounded-2xl lg:border lg:border-white/40 lg:bg-white/30 lg:backdrop-blur-sm lg:shadow-sm",
                "max-lg:w-full max-lg:h-full",
                className
            )}
            {...props}
        >
            {/* Mobile Toolbar */}
            <div className="lg:hidden h-14 border-b border-white/20 bg-white/60 backdrop-blur flex items-center justify-between px-4 shrink-0 z-30">
                <button
                    onClick={() => {
                        play("click");
                        onToggleLeftPanel?.();
                    }}
                    className={cn(
                        "p-1 px-3 text-xs rounded transition-colors",
                        leftPanelOpen ? "bg-purple-500 text-white" : "bg-slate-100 text-slate-700"
                    )}
                >
                    资源
                </button>
                <span className="font-semibold text-slate-800">Pro Studio</span>
                <button
                    onClick={() => {
                        play("click");
                        onToggleRightPanel?.();
                    }}
                    className={cn(
                        "p-1 px-3 text-xs rounded transition-colors",
                        rightPanelOpen ? "bg-purple-500 text-white" : "bg-slate-100 text-slate-700"
                    )}
                >
                    控制
                </button>
            </div>

            {/* Content Area */}
            <div className="flex-1 overflow-y-auto p-4 sm:p-6 lg:p-8 flex flex-col gap-6">
                {/* 1. Garment Board */}
                <div className="flex-1 min-h-[300px]">
                    <GarmentBoard
                        items={garmentItems}
                        addGarmentFiles={addGarmentFiles}
                        removeItem={removeGarmentItem}
                        onClearGarments={onClearGarments}
                        onOpenUserAssets={() => setAssetDialogOpen(true)}
                        className="h-full"
                        onReorder={onReorderGarments}
                    />
                </div>

                {/* 2. Control Island (Recipe + Prompt + Generate) */}
                <div className="flex-shrink-0 bg-white/60 backdrop-blur-md border border-white/30 rounded-2xl shadow-xl p-6 animate-slide-up z-20 min-h-[200px]">
                    <div className="flex flex-col gap-6 items-stretch">
                        <div className="flex-1 min-w-0">
                            <RecipeBar
                                styleLabel={styleLabel}
                                poseCount={poseCount}
                                faceRemark={faceRemark}
                                onClearStyle={onClearStyle}
                                onClearPoses={onClearPoses}
                                onClearFace={onClearFace}
                                onClearWorkbench={onClearWorkbench}
                                hasWorkbenchState={hasWorkbenchState}
                                onOptimizePrompt={onOptimizePrompt}
                                onUndoOptimize={onUndoOptimize}
                                canUndoOptimize={canUndoOptimize}
                                optimizeBusy={optimizeBusy}
                                optimizeDisabled={optimizeDisabled}
                            />

                            <PromptEngine
                                prompt={prompt}
                                setPrompt={setPrompt}
                                snippets={snippets}
                                snippetsLoading={snippetsLoading}
                                selectedSnippetId={selectedSnippetId}
                                onSelectSnippet={onSelectSnippet}
                                onSaveSnippet={onSaveSnippet}
                                onDeleteSnippet={onDeleteSnippet}
                                snippetRemark={snippetRemark}
                                setSnippetRemark={setSnippetRemark}
                                isBusy={promptBusy}
                                baseStyle={baseStyle}
                                basePrompt={basePrompt}
                            />
                        </div>

                        {/* Generate Button Group */}
                        <div className="flex flex-col items-end justify-end gap-3 shrink-0">
                            <div className="text-[10px] text-slate-500 font-bold tracking-tight bg-slate-100/80 px-3 py-1 rounded-full border border-slate-200/50 shadow-sm">
                                消耗积分: <span className="text-rose-500">{creditCost}</span> 积分
                            </div>
                            <Button
                                size="lg"
                                className={cn(
                                    "h-14 px-8 rounded-2xl shadow-2xl transition-all duration-500 border-0 ring-offset-2 focus:ring-2 active:scale-95 group relative overflow-hidden",
                                    "bg-gradient-to-br from-orange-500 via-rose-500 to-indigo-600 shadow-rose-500/40 hover:shadow-rose-500/60",
                                    generating ? "opacity-90" : "hover:scale-[1.04]"
                                )}
                                onClick={onGenerate}
                                disabled={generating || (creditsLoaded && balance < creditCost)}
                            >
                                {/* Animated Glow Overlay */}
                                <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent -translate-x-full group-hover:animate-shimmer" />

                                {generating ? (
                                    <div className="flex items-center gap-2">
                                        <Loader2 className="w-5 h-5 animate-spin text-white" />
                                        <span className="font-bold text-lg text-white">生成中...</span>
                                    </div>
                                ) : (
                                    <div className="flex items-center gap-2">
                                        <Sparkles className="w-6 h-6 text-white animate-bounce-slow" />
                                        <span className="font-black text-xl text-white tracking-widest drop-shadow-md">
                                            生成
                                        </span>
                                    </div>
                                )}
                            </Button>
                        </div>
                    </div>
                </div>
            </div>

            {/* Dialogs */}
            <UserAssetLibraryDialog
                open={assetDialogOpen}
                onOpenChange={setAssetDialogOpen}
                assets={userAssets}
                loading={userAssetsLoading}
                onLoadMore={onLoadMoreUserAssets}
                hasMore={hasMoreUserAssets}
                onSelect={(url) => {
                    if (onSelectUserAsset) onSelectUserAsset(url);
                }}
            />

            {children}
        </main>
    );
}
