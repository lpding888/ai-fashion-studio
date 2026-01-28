"use client";

import * as React from "react";
import { cn } from "@/lib/utils";
import { Search, SlidersHorizontal, Upload, FolderCog, UserCog, Trash2, Archive } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useAssetLibraryState, SORT_OPTIONS, type AssetTab, type SortRule } from "@/hooks/use-asset-library";
import { PresetCard } from "@/components/learn/preset-card";
import { FacePresetManagerDialog } from "@/components/learn/face-preset-manager-dialog";
import { CollectionManagerDialog } from "@/components/learn/collection-manager-dialog";
import { StaggerContainer, ScaleIn } from "@/components/ui/motion-wrappers";

// Types from store/api
import type { StylePreset } from "@/store/style-preset-store";
import type { PosePreset } from "@/store/pose-preset-store";
import type { FacePreset } from "@/store/face-preset-store";
import { useStudioSound } from "@/hooks/use-studio-sound";
import { usePanelSizing } from "@/components/learn/layout/studio-layout";
import type { PresetCollection } from "@/lib/preset-collections";
import type { BatchMetaAction, PresetKind } from "@/lib/preset-meta";

type PresetItem = StylePreset | PosePreset | FacePreset;

function isAssetTab(value: string): value is AssetTab {
    return value === "styles" || value === "poses" || value === "faces";
}

function isSortRule(value: string): value is SortRule {
    return SORT_OPTIONS.some((option) => option.value === value);
}

function normalizePath(value: unknown) {
    if (typeof value !== "string") return undefined;
    const trimmed = value.trim();
    return trimmed ? trimmed : undefined;
}

function getThumbnailPath(item: PresetItem) {
    const rawThumbnail =
        (item as { thumbnailPath?: string; thumbnail_path?: string }).thumbnailPath
        ?? (item as { thumbnail_path?: string }).thumbnail_path;
    const thumbnail = normalizePath(rawThumbnail);
    if (thumbnail) return thumbnail;
    const rawImagePath =
        "imagePath" in item
            ? (item as { imagePath?: string }).imagePath
            : (item as { image_path?: string }).image_path;
    if (rawImagePath) {
        const imagePath = normalizePath(rawImagePath);
        if (imagePath) return imagePath;
    }
    const rawImagePaths =
        "imagePaths" in item
            ? (item as { imagePaths?: string[] | string }).imagePaths
            : (item as { image_paths?: string[] | string }).image_paths;
    if (rawImagePaths) {
        if (Array.isArray(rawImagePaths)) {
            const first = rawImagePaths.map(normalizePath).find(Boolean);
            if (first) return first;
        } else {
            const fallback = normalizePath(rawImagePaths);
            if (fallback) return fallback;
        }
    }
    return undefined;
}

function isFailedPreset(item: PresetItem) {
    return "learnStatus" in item && item.learnStatus === "FAILED";
}

export interface ResourcePanelProps extends React.HTMLAttributes<HTMLDivElement> {
    // Layout Props
    isOpen?: boolean;
    onClose?: () => void;

    // Data Props
    stylePresets: StylePreset[];
    posePresets: PosePreset[];
    facePresets: FacePreset[];
    collections: PresetCollection[];

    // Selection Props
    selectedStyleIds: string[];
    setSelectedStyleIds: React.Dispatch<React.SetStateAction<string[]>>;
    selectedPoseIds: string[];
    togglePoseSelect: (id: string) => void;
    selectedFaceIds: string[];
    toggleFaceSelect: (id: string) => void;

    // Action Props
    onDeleteStyle: (id: string) => Promise<void>;
    onDeletePose: (id: string) => Promise<void>;
    onDeleteFace: (id: string) => Promise<void>;
    onUpdateStyle: (id: string, updates: { name?: string; description?: string }) => Promise<void>;
    onUpdatePose: (id: string, updates: { name?: string; description?: string }) => Promise<void>;
    onUpdateFace: (id: string, updates: { name?: string; description?: string }) => Promise<void>;
    onRelearnStyle: (id: string) => Promise<StylePreset>;
    onRelearnPose: (id: string) => Promise<PosePreset>;
    onBatchUpdateMeta: (input: { kind: PresetKind; ids: string[]; action: BatchMetaAction; tags?: string[]; collectionIds?: string[] }) => Promise<void>;
    onRefreshKind: (kind: PresetKind) => Promise<void>;

    // Collection Actions
    onCreateCollection: (name: string) => Promise<void>;
    onRenameCollection: (id: string, name: string) => Promise<void>;
    onDeleteCollection: (id: string) => Promise<void>;

    // Upload Actions (New)
    onUploadStyle: (files: File[]) => Promise<void>;
    onUploadPose: (file: File) => Promise<void>;

    // Custom Slots
    headerActions?: React.ReactNode;
}

export function ResourcePanel({
    className,
    isOpen,
    onClose,
    // Data
    stylePresets,
    posePresets,
    facePresets,
    collections,
    // Selection
    selectedStyleIds,
    setSelectedStyleIds,
    selectedPoseIds,
    togglePoseSelect,
    selectedFaceIds,
    toggleFaceSelect,
    // Actions
    onDeleteStyle,
    onDeletePose,
    onDeleteFace,
    onUpdateStyle,
    onUpdatePose,
    onUpdateFace,
    onRelearnStyle,
    onRelearnPose,
    onBatchUpdateMeta,
    onRefreshKind,
    onCreateCollection,
    onRenameCollection,
    onDeleteCollection,
    onUploadStyle,
    onUploadPose,
    headerActions,
    ...props
}: ResourcePanelProps) {
    // Use the extracted hook
    const {
        activeTab,
        setActiveTab,
        searchQuery,
        setSearchQuery,
        batchMode,
        setBatchMode,
        batchSelectedIds,
        setBatchSelectedIds,
        sortRule,
        setSortRule,
        favoriteOnly,
        setFavoriteOnly,
        filterCollectionId,
        setFilterCollectionId,
        filterTag,
        setFilterTag,
        activeItems,
        orderBySelection,
        activeKind,
        applyBatchAction,
    } = useAssetLibraryState({
        stylePresets,
        posePresets,
        facePresets,
        collections,
        onBatchUpdateMeta,
        onRefreshKind,
    });

    const { play } = useStudioSound();
    const panelSizing = usePanelSizing();
    const density = panelSizing?.leftDensity ?? "md";
    const isCompact = density === "sm";

    const [filtersOpen, setFiltersOpen] = React.useState(false);
    const [collectionDialogOpen, setCollectionDialogOpen] = React.useState(false);
    const totalCount =
        activeTab === "styles"
            ? stylePresets.length
            : activeTab === "poses"
                ? posePresets.length
                : facePresets.length;
    const filteredCount = activeItems.length;
    const hasFilters =
        !!searchQuery.trim()
        || favoriteOnly
        || filterCollectionId !== "all"
        || !!filterTag.trim();

    // Upload Refs
    const styleInputRef = React.useRef<HTMLInputElement>(null);
    const poseInputRef = React.useRef<HTMLInputElement>(null);

    // Esc Key to close drawer
    React.useEffect(() => {
        if (!isOpen) return;
        const handleEscape = (e: KeyboardEvent) => {
            if (e.key === "Escape") onClose?.();
        };
        window.addEventListener("keydown", handleEscape);
        return () => window.removeEventListener("keydown", handleEscape);
    }, [isOpen, onClose]);

    const activeFilterCount = (favoriteOnly ? 1 : 0) + (filterCollectionId !== "all" ? 1 : 0) + (filterTag ? 1 : 0);
    const clearFilters = () => {
        setSearchQuery("");
        setFavoriteOnly(false);
        setFilterCollectionId("all");
        setFilterTag("");
    };

    // Selection Logic Helper
    const handleToggle = (id: string) => {
        if (activeTab === "styles") {
            setSelectedStyleIds((prev) => (prev.includes(id) ? [] : [id]));
        } else if (activeTab === "poses") {
            togglePoseSelect(id);
        } else {
            toggleFaceSelect(id);
        }
    };

    const isSelected = (id: string) => {
        if (activeTab === "styles") return selectedStyleIds.includes(id);
        if (activeTab === "poses") return selectedPoseIds.includes(id);
        return selectedFaceIds.includes(id);
    };

    const handleDelete = async (id: string) => {
        if (activeTab === "styles") await onDeleteStyle(id);
        else if (activeTab === "poses") await onDeletePose(id);
        else await onDeleteFace(id);
        await onRefreshKind(activeKind);
    };

    const handleRename = async (id: string, nextName: string) => {
        const updates = { name: nextName };
        if (activeTab === "styles") await onUpdateStyle(id, updates);
        else if (activeTab === "poses") await onUpdatePose(id, updates);
        else await onUpdateFace(id, updates);
        await onRefreshKind(activeKind);
    };

    return (
        <>
            {/* Backdrop for Mobile */}
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

                    // Desktop/Laptop (Grid Slot 1): Full height
                    "lg:h-full lg:opacity-100 lg:translate-x-0 lg:static lg:z-0",

                    // Tablet/Mobile (Drawer): Fixed overlay
                    "max-lg:fixed max-lg:inset-y-0 max-lg:left-0 max-lg:z-50 max-lg:w-[320px] max-lg:shadow-2xl",

                    // Drawer toggle state
                    isOpen ? "max-lg:translate-x-0" : "max-lg:-translate-x-full",

                    className
                )}
                {...props}
            >
                {/* Header Section */}
                <div className="flex flex-col border-b border-white/20 bg-white/40 shrink-0">
                    {/* Top Bar: Title + Mobile Close */}
                    <div className={cn("flex items-center justify-between", isCompact ? "h-12 px-3" : "h-14 px-4")}>
                        <div className="flex items-center gap-2 min-w-0">
                            <span className={cn("font-semibold text-slate-800 whitespace-nowrap truncate max-w-[140px]", isCompact && "text-sm")}>
                                资源浏览器
                            </span>
                            <Button
                                variant="ghost"
                                size="icon"
                                className="h-6 w-6 lg:hidden"
                                onClick={onClose}
                                aria-label="关闭面板"
                            >
                                &times;
                            </Button>
                        </div>

                        {/* Batch/Manage Actions */}
                        <div className="flex gap-1">
                            <Button
                                variant={batchMode ? "secondary" : "ghost"}
                                size="icon"
                                className={cn(isCompact ? "h-7 w-7" : "h-8 w-8")}
                                title="批量管理"
                                onClick={() => setBatchMode(!batchMode)}
                            >
                                <SlidersHorizontal className="h-4 w-4" />
                            </Button>
                            <Button
                                variant="ghost"
                                size="icon"
                                className={cn(isCompact ? "h-7 w-7" : "h-8 w-8")}
                                title="管理收藏"
                                onClick={() => setCollectionDialogOpen(true)}
                            >
                                <FolderCog className="h-4 w-4" />
                            </Button>
                            <Button
                                variant="ghost"
                                size="sm"
                                className={cn(
                                    "gap-2 text-slate-600 border border-slate-200/50 bg-white/50 hover:bg-white",
                                    isCompact ? "h-7 px-2 text-[9px]" : "h-8 px-3 text-xs"
                                )}
                                onClick={() => {/* TODO: Connect Snapshots */ }}
                                title="历史快照"
                            >
                                <Archive className="h-3.5 w-3.5" />
                                历史快照
                            </Button>
                            {headerActions && (
                                <div className={cn("flex items-center", isCompact && "scale-90 origin-right")}>
                                    {headerActions}
                                </div>
                            )}
                        </div>
                    </div>

                    {/* Search & Filter Bar */}
                    <div className={cn("pb-3 space-y-2", isCompact ? "px-3" : "px-4")}>
                        <div className="relative">
                            <Search className={cn("absolute left-2.5 h-4 w-4 text-slate-400", isCompact ? "top-2" : "top-2.5")} />
                            <Input
                                placeholder="搜索资源..."
                                className={cn("pl-9 bg-white/60", isCompact ? "h-8 text-[11px]" : "h-9")}
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                            />
                            <Button
                                variant={filtersOpen || activeFilterCount > 0 ? "secondary" : "ghost"}
                                size="icon"
                                className={cn("absolute right-0 top-0 rounded-l-none", isCompact ? "h-8 w-8" : "h-9 w-9")}
                                onClick={() => setFiltersOpen(!filtersOpen)}
                            >
                                <span className="text-[10px] font-bold">{activeFilterCount || ""}</span>
                                {!activeFilterCount && <SlidersHorizontal className="h-3 w-3" />}
                            </Button>
                        </div>

                        {/* Expanded Filters */}
                        {filtersOpen && (
                            <div className={cn("p-2 bg-white/50 rounded-lg space-y-2 animate-in slide-in-from-top-2", isCompact ? "text-[10px]" : "text-xs")}>
                                <div className="flex justify-between items-center">
                                    <label className="font-medium text-slate-500">仅显示收藏</label>
                                    <input
                                        type="checkbox"
                                        checked={favoriteOnly}
                                        onChange={(e) => setFavoriteOnly(e.target.checked)}
                                    />
                                </div>
                                <Select
                                    value={sortRule}
                                    onValueChange={(value) => {
                                        if (isSortRule(value)) {
                                            setSortRule(value);
                                        }
                                    }}
                                >
                                    <SelectTrigger className={cn(isCompact ? "h-6 text-[10px]" : "h-7 text-xs")}><SelectValue /></SelectTrigger>
                                    <SelectContent>
                                        {SORT_OPTIONS.map(opt => <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>)}
                                    </SelectContent>
                                </Select>
                                <Select value={filterCollectionId} onValueChange={setFilterCollectionId}>
                                    <SelectTrigger className={cn(isCompact ? "h-6 text-[10px]" : "h-7 text-xs")}><SelectValue placeholder="收藏夹" /></SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="all">全部收藏夹</SelectItem>
                                        {collections.map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                                    </SelectContent>
                                </Select>
                            </div>
                        )}

                        <div className={cn("flex items-center justify-between text-slate-500 px-1", isCompact ? "text-[10px]" : "text-[11px]")}>
                            <span>当前 {filteredCount} / 总 {totalCount}</span>
                            <Button
                                variant="ghost"
                                size="sm"
                                className={cn("h-6 px-2", isCompact ? "text-[9px]" : "text-[10px]")}
                                onClick={clearFilters}
                                disabled={!hasFilters}
                            >
                                清空筛选
                            </Button>
                        </div>

                        {/* Mode Tabs */}
                        <Tabs
                            value={activeTab}
                            onValueChange={(value) => {
                                play('click');
                                if (isAssetTab(value)) {
                                    setActiveTab(value);
                                }
                            }}
                            className="w-full"
                        >
                        <TabsList className={cn("grid w-full grid-cols-3 bg-slate-100/50 p-0.5 rounded-lg border border-slate-200/50", isCompact ? "h-7" : "h-8")}>
                            <TabsTrigger
                                value="styles"
                                className={cn(
                                    "font-bold rounded-md transition-all data-[state=active]:bg-white data-[state=active]:text-[#FF7F50] data-[state=active]:shadow-sm data-[state=active]:ring-1 data-[state=active]:ring-black/5 text-slate-500 hover:text-slate-700",
                                    isCompact ? "text-[9px]" : "text-[10px]"
                                )}
                            >
                                风格
                            </TabsTrigger>
                            <TabsTrigger
                                value="poses"
                                className={cn(
                                    "font-bold rounded-md transition-all data-[state=active]:bg-white data-[state=active]:text-[#FF7F50] data-[state=active]:shadow-sm data-[state=active]:ring-1 data-[state=active]:ring-black/5 text-slate-500 hover:text-slate-700",
                                    isCompact ? "text-[9px]" : "text-[10px]"
                                )}
                            >
                                姿势
                            </TabsTrigger>
                            <TabsTrigger
                                value="faces"
                                className={cn(
                                    "font-bold rounded-md transition-all data-[state=active]:bg-white data-[state=active]:text-[#FF7F50] data-[state=active]:shadow-sm data-[state=active]:ring-1 data-[state=active]:ring-black/5 text-slate-500 hover:text-slate-700",
                                    isCompact ? "text-[9px]" : "text-[10px]"
                                )}
                            >
                                人脸
                            </TabsTrigger>
                        </TabsList>
                    </Tabs>
                    </div>
                </div>

                {/* Content Grid */}
                <div className="flex-1 overflow-y-auto min-h-0 p-2 scroll-smooth">
                    {batchMode && batchSelectedIds.length > 0 && (
                        <div className={cn("mb-2 p-2 bg-[#FFF5F0] border border-[#FFD5C2] rounded-lg flex items-center justify-between text-[#FF7F50] mx-1", isCompact ? "text-[10px]" : "text-xs")}>
                            <span>已选择: {batchSelectedIds.length}</span>
                            <div className="flex gap-1">
                                <Button size="sm" variant="ghost" className={cn(isCompact ? "h-5 px-2 text-[10px]" : "h-6 px-2 text-xs")} onClick={async () => {
                                    if (!confirm(`确定要删除选中的 ${batchSelectedIds.length} 项吗？此操作无法撤销。`)) return;
                                    await applyBatchAction("delete");
                                }}>删除</Button>
                                <Button size="sm" variant="ghost" className={cn(isCompact ? "h-5 px-2 text-[10px]" : "h-6 px-2 text-xs")} onClick={() => applyBatchAction("favorite")}>收藏</Button>
                            </div>
                        </div>
                    )}

                    <StaggerContainer key={activeTab} className={cn("grid gap-2 pb-12", isCompact ? "grid-cols-1" : "grid-cols-3")}>
                        {/* @ts-expect-error - activeItems is a union type, handled correctly at runtime */}
                        {orderBySelection(activeItems,
                            activeTab === "styles" ? selectedStyleIds :
                                activeTab === "poses" ? selectedPoseIds :
                                    selectedFaceIds
                        ).map((item) => (
                            <ScaleIn key={item.id}>
                                <PresetCard
                                    id={item.id}
                                    name={item.name || "未命名"}
                                    description={item.description}
                                    thumbnailPath={getThumbnailPath(item)}
                                    kindLabel={activeKind}
                                    selected={isSelected(item.id)}
                                    isFailed={isFailedPreset(item)}
                                    onToggle={() => handleToggle(item.id)}
                                    onRename={(n) => handleRename(item.id, n)}
                                    onDelete={() => handleDelete(item.id)}
                                    onRetry={
                                        activeTab === "styles"
                                            ? async () => {
                                                await onRelearnStyle(item.id);
                                            }
                                            : activeTab === "poses"
                                                ? async () => {
                                                    await onRelearnPose(item.id);
                                                }
                                                : undefined
                                    }
                                    onToggleFavorite={async () => {
                                        await onBatchUpdateMeta({
                                            kind: activeKind,
                                            ids: [item.id],
                                            action: item.favoriteAt ? "unfavorite" : "favorite",
                                        });
                                        await onRefreshKind(activeKind);
                                    }}
                                    isFavorite={!!item.favoriteAt}
                                    batchMode={batchMode}
                                    batchSelected={batchSelectedIds.includes(item.id)}
                                    onBatchToggle={() => setBatchSelectedIds(prev => prev.includes(item.id) ? prev.filter(i => i !== item.id) : [...prev, item.id])}
                                    compact={isCompact}
                                />
                            </ScaleIn>
                        ))}

                        {activeItems.length === 0 && (
                            <div className={cn(isCompact ? "col-span-1" : "col-span-2", "py-8 text-center text-slate-400 text-sm")}>
                                未找到资源。
                            </div>
                        )}
                    </StaggerContainer>
                </div>

                {/* Footer Actions */}
                <div className="p-3 border-t border-white/20 bg-white/40 shrink-0 space-y-2 min-h-[100px]">
                    {!batchMode ? (
                        <div className={cn("grid gap-2 animate-in fade-in slide-in-from-bottom-2 duration-300", isCompact ? "grid-cols-1" : "grid-cols-3")}>
                            <Button
                                variant="outline"
                                className={cn("w-full justify-start gap-2 bg-white/50 hover:bg-white/80 transition-colors", isCompact && "h-8 text-[10px]")}
                                onClick={() => styleInputRef.current?.click()}
                            >
                                <Upload className="w-4 h-4 text-[#FF7F50]" /> 上传风格
                            </Button>
                            <Button
                                variant="outline"
                                className={cn("w-full justify-start gap-2 bg-white/50 hover:bg-white/80 transition-colors", isCompact && "h-8 text-[10px]")}
                                onClick={() => poseInputRef.current?.click()}
                            >
                                <UserCog className="w-4 h-4 text-[#FF7F50]" /> 上传姿势
                            </Button>
                        </div>
                    ) : (
                        <div className="flex flex-col gap-2 animate-in fade-in slide-in-from-bottom-2 duration-300">
                            <div className="flex items-center justify-between px-1">
                                <span className={cn("font-bold text-slate-500 uppercase tracking-wider", isCompact ? "text-[10px]" : "text-xs")}>
                                    已选择 {batchSelectedIds.length} 项
                                </span>
                                <div className="flex gap-2">
                                    <Button
                                        variant="ghost"
                                        size="sm"
                                        className={cn(isCompact ? "h-6 text-[9px] px-2" : "h-7 text-[10px] px-2")}
                                        onClick={() => setBatchSelectedIds(activeItems.map(i => i.id))}
                                    >
                                        全选
                                    </Button>
                                    <Button
                                        variant="ghost"
                                        size="sm"
                                        className={cn(isCompact ? "h-6 text-[9px] px-2" : "h-7 text-[10px] px-2")}
                                        onClick={() => setBatchSelectedIds([])}
                                    >
                                        取消全选
                                    </Button>
                                </div>
                            </div>
                            <div className="grid grid-cols-2 gap-2">
                                <Button
                                    variant="destructive"
                                    className="w-full gap-2 shadow-sm"
                                    disabled={batchSelectedIds.length === 0}
                                    onClick={async () => {
                                        if (!confirm(`确定要批量删除这 ${batchSelectedIds.length} 个资源吗？`)) return;
                                        await applyBatchAction("delete");
                                        play('click');
                                    }}
                                >
                                    <Trash2 className="w-4 h-4" /> 批量删除
                                </Button>
                                <Button
                                    variant="secondary"
                                    className="w-full gap-2 shadow-sm border border-slate-200"
                                    disabled={batchSelectedIds.length === 0}
                                    onClick={() => {
                                        // TODO: Implement move to collection dialog if needed
                                        alert("更多批量操作正在开发中...");
                                    }}
                                >
                                    <Archive className="w-4 h-4" /> 更多操作
                                </Button>
                            </div>
                        </div>
                    )}

                    <FacePresetManagerDialog
                        activeFaceIds={selectedFaceIds}
                        onSelectFaces={(ids) => {
                            // FacePresetSelector uses Zustand store internally,
                            // but we need to sync with parent component selection
                            ids.forEach(id => {
                                if (!selectedFaceIds.includes(id)) {
                                    toggleFaceSelect(id);
                                }
                            });
                            // Remove deselected
                            selectedFaceIds.forEach(id => {
                                if (!ids.includes(id)) {
                                    toggleFaceSelect(id);
                                }
                            });
                        }}
                    />
                    {/* Hidden Inputs */}
                    <input
                        type="file"
                        multiple
                        accept="image/*"
                        className="hidden"
                        ref={styleInputRef}
                        onChange={(e) => {
                            if (e.target.files?.length) {
                                onUploadStyle(Array.from(e.target.files));
                                e.target.value = "";
                            }
                        }}
                    />
                    <input
                        type="file"
                        accept="image/*"
                        className="hidden"
                        ref={poseInputRef}
                        onChange={(e) => {
                            const file = e.target.files?.[0];
                            if (file) {
                                onUploadPose(file);
                                e.target.value = "";
                            }
                        }}
                    />
                </div>

                {/* Collection Manager Dialog */}
                <CollectionManagerDialog
                    open={collectionDialogOpen}
                    onOpenChange={setCollectionDialogOpen}
                    items={collections}
                    onCreate={onCreateCollection}
                    onRename={onRenameCollection}
                    onDelete={onDeleteCollection}
                />
            </aside>
        </>
    );
}
