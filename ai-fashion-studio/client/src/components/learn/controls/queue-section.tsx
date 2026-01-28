"use client";

import * as React from "react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Loader2, CheckCircle2, AlertCircle, Clock, Trash2, Repeat, Info, Heart } from "lucide-react";
import { cn } from "@/lib/utils";
import { motion, AnimatePresence } from "framer-motion";
import { useStudioSound } from "@/hooks/use-studio-sound";
import type { Task } from "@/components/learn/types";
import { smartWithTencentCi } from "@/lib/image-ci";
import { usePanelSizing } from "@/components/learn/layout/studio-layout";

interface QueueSectionProps {
    queueTasks: Task[];
    favoriteTasks?: Task[];
    onClearCompleted?: () => void;
    onDeleteTask?: (taskId: string) => void;
    onRetryTask?: (taskId: string) => void;
    onReuseTask?: (taskId: string) => void;
    onViewDetail?: (task: Task) => void;
    onImageClick?: (taskId: string) => void;
    currentTaskId?: string | null;
    // Favorites
    favoriteIds?: string[];
    onToggleFavorite?: (taskId: string) => void;
    queueTotal?: number;
    queueBaseLimit?: number;
    showAll?: boolean;
    onToggleShowAll?: () => void;
    tab?: "queue" | "favorites";
    onTabChange?: (tab: "queue" | "favorites") => void;
}

const PREVIEW_OPTIONS = { maxWidth: 128, maxHeight: 128, quality: 60, format: "webp" } as const;

function toPreviewUrl(url?: string) {
    const raw = String(url || "").trim();
    if (!raw) return "";
    const lower = raw.toLowerCase();
    const isCos = lower.includes(".cos.") || lower.includes(".myqcloud.com/");
    return isCos ? smartWithTencentCi(raw, PREVIEW_OPTIONS) : raw;
}

export function QueueSection({
    queueTasks,
    favoriteTasks,
    onClearCompleted,
    onDeleteTask,
    onRetryTask,
    onReuseTask,
    onViewDetail,
    onImageClick,
    currentTaskId,
    favoriteIds = [],
    onToggleFavorite,
    queueTotal,
    queueBaseLimit,
    showAll,
    onToggleShowAll,
    tab,
    onTabChange,
}: QueueSectionProps) {
    const panelSizing = usePanelSizing();
    const density = panelSizing?.rightDensity ?? "md";
    const isCompact = density === "sm";
    const [internalTab, setInternalTab] = React.useState<"queue" | "favorites">("queue");
    const activeTab = tab ?? internalTab;
    const handleTabChange = onTabChange ?? setInternalTab;
    const queueItems = React.useMemo(() => queueTasks ?? [], [queueTasks]);
    const favoriteItems = React.useMemo(
        () => favoriteTasks ?? queueItems.filter((item) => favoriteIds.includes(item.id)),
        [favoriteTasks, queueItems, favoriteIds]
    );

    // Sort tasks: Active/Pending first, then by date desc
    const sortedTasks = React.useMemo(() => {
        const source = activeTab === "favorites" ? favoriteItems : queueItems;
        return [...source].sort((a, b) => {
            const aActive = ["RENDERING", "HERO_RENDERING", "SHOTS_RENDERING", "PENDING", "QUEUED"].includes(a.status);
            const bActive = ["RENDERING", "HERO_RENDERING", "SHOTS_RENDERING", "PENDING", "QUEUED"].includes(b.status);
            if (aActive && !bActive) return -1;
            if (!aActive && bActive) return 1;
            return b.createdAt - a.createdAt;
        });
    }, [activeTab, favoriteItems, queueItems]);

    const displayTasks = sortedTasks;
    const favoriteCount = favoriteItems.length;
    const queueViewMode = showAll ? "all" : "recent";
    const handleQueueViewModeChange = (value: string) => {
        if (!onToggleShowAll || activeTab !== "queue") return;
        if (value === "all" && !showAll) onToggleShowAll();
        if (value === "recent" && showAll) onToggleShowAll();
    };

    return (
        <div className="flex flex-col h-full overflow-hidden">
            {/* Header / Tabs */}
            <div className="flex items-center justify-between mb-2">
                <div className={cn("flex items-center gap-1 bg-slate-100/50 p-0.5 rounded-lg border border-slate-200/50", isCompact && "text-[9px]")}>
                    <button
                        onClick={() => handleTabChange("queue")}
                        className={cn(
                            "px-3 py-1 font-bold rounded-md transition-all flex items-center gap-1.5",
                            isCompact ? "text-[9px]" : "text-[10px]",
                            activeTab === "queue"
                                ? "bg-white text-[#FF7F50] shadow-sm ring-1 ring-black/5"
                                : "text-slate-500 hover:text-slate-700"
                        )}
                    >
                        <span>任务队列</span>
                        <span className={cn(
                            "px-1 rounded-full text-[9px]",
                            activeTab === "queue" ? "bg-[#FFF5F0] text-[#FF7F50]" : "bg-slate-200/50 text-slate-400"
                        )}>
                            {queueItems.length}
                        </span>
                    </button>
                    <button
                        onClick={() => handleTabChange("favorites")}
                        className={cn(
                            "px-3 py-1 font-bold rounded-md transition-all flex items-center gap-1.5",
                            isCompact ? "text-[9px]" : "text-[10px]",
                            activeTab === "favorites"
                                ? "bg-white text-[#FF7F50] shadow-sm ring-1 ring-black/5"
                                : "text-slate-500 hover:text-slate-700"
                        )}
                    >
                        <span>收藏夹</span>
                        <Heart className={cn("w-3 h-3", activeTab === "favorites" ? "fill-[#FF7F50]" : "")} />
                        {favoriteCount > 0 && (
                            <span className={cn(
                                "ml-0.5 px-1 rounded-full text-[9px]",
                                activeTab === "favorites" ? "bg-[#FFF5F0] text-[#FF7F50]" : "bg-slate-200/50 text-slate-400"
                            )}>
                                {favoriteCount}
                            </span>
                        )}
                    </button>
                </div>

                <div className="flex items-center gap-1">
                    {activeTab === "queue" && queueBaseLimit && onToggleShowAll && (
                        <div className={cn(
                            "flex items-center bg-white/70 border border-slate-200/50 rounded-md p-0.5",
                            isCompact ? "text-[9px]" : "text-[10px]"
                        )}>
                            <button
                                type="button"
                                onClick={() => handleQueueViewModeChange("recent")}
                                className={cn(
                                    "px-2 py-0.5 rounded transition-all font-semibold",
                                    isCompact ? "h-5" : "h-6",
                                    queueViewMode === "recent"
                                        ? "bg-white text-[#FF7F50] shadow-sm ring-1 ring-black/5"
                                        : "text-slate-500 hover:text-slate-700"
                                )}
                            >
                                最近 {queueBaseLimit} 条
                            </button>
                            <button
                                type="button"
                                onClick={() => handleQueueViewModeChange("all")}
                                className={cn(
                                    "px-2 py-0.5 rounded transition-all font-semibold",
                                    isCompact ? "h-5" : "h-6",
                                    queueViewMode === "all"
                                        ? "bg-white text-[#FF7F50] shadow-sm ring-1 ring-black/5"
                                        : "text-slate-500 hover:text-slate-700"
                                )}
                            >
                                显示全部{typeof queueTotal === "number" ? ` (${queueTotal})` : ""}
                            </button>
                        </div>
                    )}
                    {activeTab === "queue" && onClearCompleted && queueItems.some(t => t.status === "COMPLETED" || t.status === "FAILED") && (
                        <Button
                            variant="ghost"
                            size="sm"
                            className={cn("text-slate-400 hover:text-slate-600 px-2", isCompact ? "h-5 text-[9px]" : "h-6 text-[10px]")}
                            onClick={onClearCompleted}
                        >
                            清除已完成
                        </Button>
                    )}
                </div>
            </div>

            {/* Task List */}
            <ScrollArea className="flex-1 -mx-2 px-2">
                <div className={cn("pb-4", isCompact ? "space-y-2" : "space-y-3")}>
                    {displayTasks.length === 0 ? (
                        <div className={cn("text-center py-12 text-slate-400 flex flex-col items-center", isCompact ? "text-[10px]" : "text-xs")}>
                            {activeTab === "queue" ? (
                                <>
                                    <Clock className={cn("mb-2 opacity-30 text-[#9ACD32]", isCompact ? "w-7 h-7" : "w-8 h-8")} />
                                    <p>暂无任务</p>
                                </>
                            ) : (
                                <>
                                    <Heart className={cn("mb-2 opacity-20 text-slate-300", isCompact ? "w-7 h-7" : "w-8 h-8")} />
                                    <p>暂无收藏</p>
                                    <p className={cn("opacity-60 mt-1", isCompact ? "text-[9px]" : "text-[10px]")}>点击任务卡片上的爱心进行收藏</p>
                                </>
                            )}
                        </div>
                    ) : (
                        <AnimatePresence mode="popLayout">
                            {displayTasks.map((task) => (
                                <TaskItem
                                    key={task.id}
                                    task={task}
                                    onDelete={() => onDeleteTask?.(task.id)}
                                    onRetry={() => onRetryTask?.(task.id)}
                                    onReuse={() => onReuseTask?.(task.id)}
                                    onViewDetail={() => onViewDetail?.(task)}
                                    onImageClick={() => task.resultUrl && onImageClick?.(task.id)}
                                    isCurrent={task.id === currentTaskId}
                                    isFavorite={favoriteIds.includes(task.id)}
                                    onToggleFavorite={() => onToggleFavorite?.(task.id)}
                                    density={density}
                                />
                            ))}
                        </AnimatePresence>
                    )}
                </div>
            </ScrollArea>
        </div>
    );
}

function TaskItem({
    task,
    onDelete,
    onRetry,
    onReuse,
    onViewDetail,
    onImageClick,
    isCurrent,
    isFavorite,
    onToggleFavorite,
    density = "md",
}: {
    task: Task;
    onDelete?: () => void;
    onRetry?: () => void;
    onReuse?: () => void;
    onViewDetail?: () => void;
    onImageClick?: () => void;
    isCurrent?: boolean;
    isFavorite?: boolean;
    onToggleFavorite?: () => void;
    density?: "sm" | "md" | "lg";
}) {
    const isCompact = density === "sm";
    const isProcessing = ["RENDERING", "HERO_RENDERING", "SHOTS_RENDERING"].includes(task.status);
    const isPending = ["PENDING", "QUEUED"].includes(task.status);
    const isSuccess = task.status === "COMPLETED";
    const isFailed = task.status === "FAILED";
    const previewUrl = toPreviewUrl(task.resultUrl);

    const { play } = useStudioSound();

    return (
        <motion.div
            layout
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 20 }}
            transition={{ duration: 0.2 }}
            className={cn(
                "relative group flex gap-3 rounded-xl border transition-all duration-300",
                isCompact ? "p-2" : "p-3",
                isCurrent
                    ? "bg-white border-transparent ring-2 ring-[#FF7F50] shadow-[0_4px_20px_-8px_rgba(255,127,80,0.3)]"
                    : "bg-white/60 hover:bg-white border-slate-100 hover:border-[#D8B4FE] hover:shadow-md",
                isFailed && "border-red-100 bg-red-50/50"
            )}
            onMouseEnter={() => play('hover')}
        >
            {/* Thumbnail / Status Icon */}
            <div
                className={cn(
                    "relative shrink-0 bg-slate-100 rounded-lg overflow-hidden border border-slate-100",
                    isCompact ? "w-14 h-14" : "w-16 h-16",
                    task.resultUrl && "cursor-zoom-in hover:opacity-90 transition-opacity"
                )}
                onClick={(e) => {
                    if (task.resultUrl) {
                        e.stopPropagation();
                        onImageClick?.();
                    }
                }}
            >
                {
                    task.resultUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                            src={previewUrl || task.resultUrl}
                            alt="Result"
                            className="w-full h-full object-cover"
                            loading="lazy"
                            decoding="async"
                        />
                    ) : (
                        <div className="w-full h-full flex items-center justify-center text-slate-300">
                            {isProcessing ? (
                                <Loader2 className="w-6 h-6 animate-spin text-[#FF7F50]" />
                            ) : isPending ? (
                                <Clock className="w-6 h-6 text-[#9ACD32]" />
                            ) : isFailed ? (
                                <AlertCircle className="w-6 h-6 text-[#FF4500]" />
                            ) : (
                                <div className="w-full h-full bg-slate-200" />
                            )}
                        </div>
                    )
                }
            </div>

            {/* Info */}
            <div className="flex-1 min-w-0 flex flex-col justify-center">
                <div className="flex items-start justify-between">
                    <span className={cn("font-medium text-slate-700 truncate pr-1 flex-1", isCompact ? "text-[11px]" : "text-xs")}>
                        {task.prompt ? task.prompt.slice(0, 24) + "..." : "Untitled Task"}
                    </span>

                    {/* Actions Row */}
                    <div className="flex items-center gap-1">
                        {/* Favorite Button (Always visible if favorited, or on hover) */}
                        {(onToggleFavorite && (isFavorite || isSuccess)) && (
                            <button
                                onClick={(e) => {
                                    e.stopPropagation();
                                    play('click');
                                    onToggleFavorite();
                                }}
                                className={cn(
                                    "p-1 rounded transition-colors opacity-100 md:opacity-0 md:group-hover:opacity-100",
                                    isFavorite ? "text-[#FF4500]" : "text-slate-300 hover:text-[#FF4500]"
                                )}
                                title={isFavorite ? "取消收藏" : "收藏"}
                            >
                                <Heart className={cn("w-3.5 h-3.5", isFavorite && "fill-current")} />
                            </button>
                        )}

                        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                            {onReuse && (
                                <button
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        play('click');
                                        onReuse();
                                    }}
                                    className="text-slate-400 hover:text-indigo-600 p-1 rounded hover:bg-indigo-50"
                                    title="复用参数到工作台"
                                >
                                    <Repeat className="w-3.5 h-3.5" />
                                </button>
                            )}
                            {onViewDetail && (
                                <button
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        play('click');
                                        onViewDetail();
                                    }}
                                    className="text-slate-400 hover:text-indigo-600 p-1 rounded hover:bg-indigo-50"
                                    title="查看详情"
                                >
                                    <Info className="w-3.5 h-3.5" />
                                </button>
                            )}
                            {onDelete && (isSuccess || isFailed) && (
                                <button
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        play('delete');
                                        onDelete();
                                    }}
                                    className="text-slate-400 hover:text-[#FF4500] p-1 rounded hover:bg-red-50"
                                    title="删除任务"
                                >
                                    <Trash2 className="w-3.5 h-3.5" />
                                </button>
                            )}
                        </div>
                    </div>
                </div>

                <div className="mt-1.5">
                    {isProcessing ? (
                        <div className="space-y-1">
                            <div className={cn("flex justify-between text-[#FF7F50] font-medium", isCompact ? "text-[9px]" : "text-[10px]")}>
                                <span>生成中...</span>
                                <span>{task.progress || 0}%</span>
                            </div>
                            <Progress value={task.progress || 0} className="h-1.5 bg-[#FFF5F0] [&>div]:bg-[#9ACD32]" />
                        </div>
                    ) : isPending ? (
                        <div className={cn("flex items-center gap-1.5 text-slate-500", isCompact ? "text-[9px]" : "text-[10px]")}>
                            <span className="w-1.5 h-1.5 rounded-full bg-[#9ACD32] animate-pulse" />
                            排队中...
                        </div>
                    ) : isSuccess ? (
                        <div className={cn("flex items-center gap-1.5 text-[#9ACD32] font-medium", isCompact ? "text-[9px]" : "text-[10px]")}>
                            <CheckCircle2 className="w-3 h-3" />
                            生成完成
                        </div>
                    ) : isFailed ? (
                        <div className={cn("flex items-center gap-1.5 text-[#FF4500] font-medium", isCompact ? "text-[9px]" : "text-[10px]")}>
                            <AlertCircle className="w-3 h-3" />
                            生成失败
                            {onRetry && (
                                <span
                                    className="underline cursor-pointer ml-1 hover:text-red-700"
                                    onClick={(e) => { e.stopPropagation(); onRetry(); }}
                                >
                                    重试
                                </span>
                            )}
                        </div>
                    ) : null}
                </div>

                <div className={cn("mt-1 text-slate-400 tabular-nums", isCompact ? "text-[8px]" : "text-[9px]")}>
                    {new Date(task.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </div>
                {onReuse && (
                    <button
                        type="button"
                        className={cn("mt-1 text-slate-500 hover:text-indigo-600 underline-offset-2 hover:underline", isCompact ? "text-[9px]" : "text-[10px]")}
                        onClick={(e) => {
                            e.stopPropagation();
                            play('click');
                            onReuse();
                        }}
                        title="把该任务参数回填到工作台"
                    >
                        拉入工作台
                    </button>
                )}
            </div>
        </motion.div>
    );
}
