"use client";

import * as React from "react";
import { Search, Star } from "lucide-react";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { PresetCard } from "@/components/learn/preset-card";
import { toImgSrc } from "@/components/learn/learn-utils";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { TagInput } from "@/components/learn/tag-input";
import { CollectionMultiSelect } from "@/components/learn/collection-multi-select";
import { CollectionManagerDialog } from "@/components/learn/collection-manager-dialog";

// Types need to be imported or redefined if not shared properly. 
// Assuming shared types or simple interfaces for now.
import type { StylePreset } from "@/store/style-preset-store";
import type { PosePreset } from "@/store/pose-preset-store";
import type { FacePreset } from "@/store/face-preset-store";
import type { PresetCollection } from "@/lib/preset-collections";
import type { BatchMetaAction, PresetKind } from "@/lib/preset-meta";

interface AssetLibraryProps {
    stylePresets: StylePreset[];
    posePresets: PosePreset[];
    facePresets: FacePreset[];
    collections: PresetCollection[];
    selectedStyleIds: string[];
    setSelectedStyleIds: React.Dispatch<React.SetStateAction<string[]>>;
    selectedPoseIds: string[];
    togglePoseSelect: (id: string) => void;
    selectedFaceIds: string[];
    toggleFaceSelect: (id: string) => void;

    // Actions
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
    onCreateCollection: (name: string) => Promise<void>;
    onRenameCollection: (id: string, name: string) => Promise<void>;
    onDeleteCollection: (id: string) => Promise<void>;
}

type DetailItem = StylePreset | PosePreset | FacePreset;

type AssetTab = "styles" | "poses" | "faces";

const TAB_KIND_MAP: Record<AssetTab, PresetKind> = {
    styles: "STYLE",
    poses: "POSE",
    faces: "FACE",
};

const SORT_OPTIONS = [
    { value: "favorite", label: "收藏优先" },
    { value: "recent", label: "最近使用" },
    { value: "created", label: "创建时间" },
    { value: "name", label: "名称" },
] as const;

export function AssetLibrary({
    stylePresets,
    posePresets,
    facePresets,
    collections,
    selectedStyleIds,
    setSelectedStyleIds,
    selectedPoseIds,
    togglePoseSelect,
    selectedFaceIds,
    toggleFaceSelect,
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
}: AssetLibraryProps) {
    const [activeTab, setActiveTab] = React.useState("styles");
    const [searchQuery, setSearchQuery] = React.useState("");
    const [batchMode, setBatchMode] = React.useState(false);
    const [batchSelectedIds, setBatchSelectedIds] = React.useState<string[]>([]);
    const [batchTags, setBatchTags] = React.useState<string[]>([]);
    const [batchCollectionIds, setBatchCollectionIds] = React.useState<string[]>([]);
    const [sortRule, setSortRule] = React.useState<(typeof SORT_OPTIONS)[number]["value"]>("favorite");
    const [favoriteOnly, setFavoriteOnly] = React.useState(false);
    const [filterCollectionId, setFilterCollectionId] = React.useState<string>("all");
    const [filterTag, setFilterTag] = React.useState<string>("");
    const [filtersOpen, setFiltersOpen] = React.useState(false);
    const [collectionDialogOpen, setCollectionDialogOpen] = React.useState(false);

    // Details Dialog State
    const [detailOpen, setDetailOpen] = React.useState(false);
    const [detailKind, setDetailKind] = React.useState<"STYLE" | "POSE" | "FACE" | null>(null);
    const [detailItem, setDetailItem] = React.useState<DetailItem | null>(null);
    const [detailName, setDetailName] = React.useState("");
    const [detailDesc, setDetailDesc] = React.useState("");
    const [detailTags, setDetailTags] = React.useState<string[]>([]);
    const [detailCollectionIds, setDetailCollectionIds] = React.useState<string[]>([]);
    const [detailBusy, setDetailBusy] = React.useState<string | null>(null);

    const orderBySelection = <T extends { id: string }>(items: T[], selectedIds: string[]) => {
        if (!selectedIds.length) return items;
        const itemMap = new Map(items.map((item) => [item.id, item]));
        const selected = selectedIds.map((id) => itemMap.get(id)).filter(Boolean) as T[];
        const selectedSet = new Set(selectedIds);
        const unselected = items.filter((item) => !selectedSet.has(item.id));
        return [...selected, ...unselected];
    };

    const openDetails = (kind: "STYLE" | "POSE" | "FACE", item: DetailItem) => {
        setDetailKind(kind);
        setDetailItem(item);
        setDetailName(item.name || "");
        setDetailDesc(item.description || "");
        setDetailTags(Array.isArray(item.tags) ? item.tags : []);
        setDetailCollectionIds(Array.isArray(item.collectionIds) ? item.collectionIds : []);
        setDetailOpen(true);
    };

    const closeDetails = () => {
        setDetailOpen(false);
        setDetailBusy(null);
    };

    const isStyleOrPose = detailKind === "STYLE" || detailKind === "POSE";
    const detailLearnStatus = isStyleOrPose && detailItem && "learnStatus" in detailItem ? detailItem.learnStatus : undefined;
    const detailLearnError = isStyleOrPose && detailItem && "learnError" in detailItem ? detailItem.learnError : undefined;

    const activeKind = TAB_KIND_MAP[activeTab as AssetTab];

    const resetBatchSelection = React.useCallback(() => {
        setBatchSelectedIds([]);
        setBatchTags([]);
        setBatchCollectionIds([]);
    }, []);

    React.useEffect(() => {
        resetBatchSelection();
        setBatchMode(false);
    }, [activeTab, resetBatchSelection]);

    React.useEffect(() => {
        if (filterCollectionId === "all") return;
        if (!collections.some((c) => c.id === filterCollectionId)) {
            setFilterCollectionId("all");
        }
    }, [collections, filterCollectionId]);

    const applyBatchAction = async (action: BatchMetaAction, payload?: { tags?: string[]; collectionIds?: string[] }) => {
        if (!batchSelectedIds.length) return;
        await onBatchUpdateMeta({
            kind: activeKind,
            ids: batchSelectedIds,
            action,
            tags: payload?.tags,
            collectionIds: payload?.collectionIds,
        });
        await onRefreshKind(activeKind);
        resetBatchSelection();
    };

    const getCollectionName = (id: string) => collections.find((c) => c.id === id)?.name || id;

    const normalizeItems = <T extends { id: string; name?: string; description?: string; tags?: string[]; favoriteAt?: number; lastUsedAt?: number; createdAt: number; collectionIds?: string[] }>(items: T[]) => {
        const search = searchQuery.trim().toLowerCase();
        const tagFilter = filterTag.trim().toLowerCase();
        const filtered = items.filter((item) => {
            if (search && !item.name?.toLowerCase().includes(search)) return false;
            if (favoriteOnly && !item.favoriteAt) return false;
            if (filterCollectionId !== "all") {
                if (!item.collectionIds?.includes(filterCollectionId)) return false;
            }
            if (tagFilter) {
                const tags = item.tags || [];
                if (!tags.some((tag) => tag.toLowerCase().includes(tagFilter))) return false;
            }
            return true;
        });
        const compare = (a: typeof filtered[number], b: typeof filtered[number]) => {
            if (sortRule === "favorite") {
                const fa = a.favoriteAt || 0;
                const fb = b.favoriteAt || 0;
                if (fb !== fa) return fb - fa;
            } else if (sortRule === "recent") {
                const la = a.lastUsedAt || 0;
                const lb = b.lastUsedAt || 0;
                if (lb !== la) return lb - la;
            } else if (sortRule === "created") {
                if (b.createdAt !== a.createdAt) return b.createdAt - a.createdAt;
            } else if (sortRule === "name") {
                const na = (a.name || "").toLowerCase();
                const nb = (b.name || "").toLowerCase();
                if (na !== nb) return na.localeCompare(nb, "zh-Hans-CN");
            }
            return (b.createdAt || 0) - (a.createdAt || 0);
        };
        return filtered.sort(compare);
    };

    const styleItems = normalizeItems(stylePresets);
    const poseItems = normalizeItems(posePresets);
    const faceItems = normalizeItems(facePresets);
    const activeFilterCount = (favoriteOnly ? 1 : 0)
        + (filterCollectionId !== "all" ? 1 : 0)
        + (filterTag.trim() ? 1 : 0);

    return (
        <div className="flex flex-col h-full min-h-0 bg-transparent">
            {/* Header / Search */}
            <div className="p-4 space-y-3 flex-shrink-0">
                <div className="flex items-center justify-between gap-2">
                    <h2 className="text-lg font-bold text-slate-800">资源库</h2>
                    <div className="flex items-center gap-2">
                        <Button
                            variant={batchMode ? "default" : "outline"}
                            size="sm"
                            onClick={() => setBatchMode((prev) => !prev)}
                        >
                            {batchMode ? "退出批量" : "批量管理"}
                        </Button>
                        <Button variant="outline" size="sm" onClick={() => setCollectionDialogOpen(true)}>
                            管理收藏夹
                        </Button>
                    </div>
                </div>
                <div className="flex items-center gap-2">
                    <div className="relative flex-1">
                        <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-slate-400" />
                        <Input
                            placeholder="搜索风格/姿势..."
                            className="pl-9 bg-white/80 h-9"
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                        />
                    </div>
                    <Button
                        variant={filtersOpen ? "default" : "outline"}
                        size="sm"
                        className="h-9 px-3"
                        onClick={() => setFiltersOpen((prev) => !prev)}
                    >
                        筛选
                        {activeFilterCount > 0 && (
                            <span className="ml-1 rounded-full bg-slate-800 px-1.5 text-[10px] text-white">
                                {activeFilterCount}
                            </span>
                        )}
                    </Button>
                </div>
                {filtersOpen && (
                    <div className="space-y-3 rounded-xl border border-white/40 bg-white/50 p-3">
                        <div className="flex flex-wrap gap-2">
                            <Button
                                variant={favoriteOnly ? "default" : "outline"}
                                size="sm"
                                onClick={() => setFavoriteOnly((prev) => !prev)}
                            >
                                仅看收藏
                            </Button>
                        </div>
                        <div className="grid grid-cols-2 gap-2">
                            <Select value={sortRule} onValueChange={(v) => setSortRule(v as typeof sortRule)}>
                                <SelectTrigger className="h-9">
                                    <SelectValue placeholder="排序规则" />
                                </SelectTrigger>
                                <SelectContent>
                                    {SORT_OPTIONS.map((opt) => (
                                        <SelectItem key={opt.value} value={opt.value}>
                                            {opt.label}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                            <Select value={filterCollectionId} onValueChange={setFilterCollectionId}>
                                <SelectTrigger className="h-9">
                                    <SelectValue placeholder="收藏夹筛选" />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="all">全部收藏夹</SelectItem>
                                    {collections.map((item) => (
                                        <SelectItem key={item.id} value={item.id}>
                                            {item.name}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                        <Input
                            placeholder="按标签筛选（模糊匹配）"
                            value={filterTag}
                            onChange={(e) => setFilterTag(e.target.value)}
                            className="h-9"
                        />
                    </div>
                )}
                <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
                    <TabsList className="grid w-full grid-cols-3">
                        <TabsTrigger value="styles">风格</TabsTrigger>
                        <TabsTrigger value="poses">姿势</TabsTrigger>
                        <TabsTrigger value="faces">人脸</TabsTrigger>
                    </TabsList>
                </Tabs>
            </div>

            {batchMode && (
                <div className="px-4 pb-4 space-y-3 border-b border-white/30">
                    <div className="text-xs text-muted-foreground">
                        已选 {batchSelectedIds.length} 项（当前仅对 {activeKind} 生效）
                    </div>
                    <div className="flex flex-wrap gap-2">
                        <Button
                            size="sm"
                            variant="secondary"
                            onClick={() => void applyBatchAction("favorite")}
                            disabled={!batchSelectedIds.length}
                        >
                            批量收藏
                        </Button>
                        <Button
                            size="sm"
                            variant="outline"
                            onClick={() => void applyBatchAction("unfavorite")}
                            disabled={!batchSelectedIds.length}
                        >
                            取消收藏
                        </Button>
                        <Button
                            size="sm"
                            variant="outline"
                            onClick={() => void applyBatchAction("add-tags", { tags: batchTags })}
                            disabled={!batchSelectedIds.length || batchTags.length === 0}
                        >
                            添加标签
                        </Button>
                        <Button
                            size="sm"
                            variant="outline"
                            onClick={() => void applyBatchAction("remove-tags", { tags: batchTags })}
                            disabled={!batchSelectedIds.length || batchTags.length === 0}
                        >
                            移除标签
                        </Button>
                        <Button
                            size="sm"
                            variant="outline"
                            onClick={() => void applyBatchAction("add-collections", { collectionIds: batchCollectionIds })}
                            disabled={!batchSelectedIds.length || batchCollectionIds.length === 0}
                        >
                            加入收藏夹
                        </Button>
                        <Button
                            size="sm"
                            variant="outline"
                            onClick={() => void applyBatchAction("remove-collections", { collectionIds: batchCollectionIds })}
                            disabled={!batchSelectedIds.length || batchCollectionIds.length === 0}
                        >
                            移出收藏夹
                        </Button>
                    </div>
                    <div className="space-y-2">
                        <div className="text-xs font-semibold text-muted-foreground">批量标签</div>
                        <TagInput value={batchTags} onChange={setBatchTags} />
                    </div>
                    <div className="space-y-2">
                        <div className="text-xs font-semibold text-muted-foreground">批量收藏夹</div>
                        <CollectionMultiSelect
                            items={collections}
                            selectedIds={batchCollectionIds}
                            onChange={setBatchCollectionIds}
                        />
                    </div>
                    <Button
                        size="sm"
                        variant="destructive"
                        onClick={async () => {
                            if (!batchSelectedIds.length) return;
                            if (!confirm("确定批量删除所选资源吗？")) return;
                            for (const id of batchSelectedIds) {
                                if (activeKind === "STYLE") await onDeleteStyle(id);
                                else if (activeKind === "POSE") await onDeletePose(id);
                                else await onDeleteFace(id);
                            }
                            await onRefreshKind(activeKind);
                            resetBatchSelection();
                        }}
                        disabled={!batchSelectedIds.length}
                    >
                        批量删除
                    </Button>
                </div>
            )}

            {/* Scrollable List */}
            <ScrollArea className="flex-1 min-h-0 px-4 pb-4">
                <div className="space-y-4">
                    {activeTab === "styles" && (
                        <div className="grid grid-cols-2 gap-3 pb-8">
                            {orderBySelection(styleItems, selectedStyleIds).map((p) => (
                                <PresetCard
                                    key={p.id}
                                    id={p.id}
                                    name={p.name}
                                    thumbnailPath={p.thumbnailPath || p.imagePaths?.[0]}
                                    kindLabel="STYLE"
                                    selected={selectedStyleIds.includes(p.id)}
                                    isFailed={p.learnStatus === "FAILED"}
                                    onToggle={() => setSelectedStyleIds((prev) => (prev.includes(p.id) ? [] : [p.id]))}
                                    batchMode={batchMode}
                                    batchSelected={batchSelectedIds.includes(p.id)}
                                    onBatchToggle={() => {
                                        setBatchSelectedIds((prev) => prev.includes(p.id) ? prev.filter((id) => id !== p.id) : [...prev, p.id]);
                                    }}
                                    isFavorite={!!p.favoriteAt}
                                    onToggleFavorite={async () => {
                                        await onBatchUpdateMeta({
                                            kind: "STYLE",
                                            ids: [p.id],
                                            action: p.favoriteAt ? "unfavorite" : "favorite",
                                        });
                                        await onRefreshKind("STYLE");
                                    }}
                                    onOpenDetails={() => openDetails("STYLE", p)}
                                    description={p.description}
                                    compact
                                />
                            ))}
                            {styleItems.length === 0 && (
                                <div className="col-span-2 text-center text-sm text-muted-foreground py-8">
                                    无风格资源
                                </div>
                            )}
                        </div>
                    )}

                    {activeTab === "poses" && (
                        <div className="grid grid-cols-2 gap-3 pb-8">
                            {orderBySelection(poseItems, selectedPoseIds).map((p) => (
                                <PresetCard
                                    key={p.id}
                                    id={p.id}
                                    name={p.name}
                                    thumbnailPath={p.thumbnailPath || p.imagePaths?.[0]}
                                    kindLabel="POSE"
                                    selected={selectedPoseIds.includes(p.id)}
                                    isFailed={p.learnStatus === "FAILED"}
                                    onToggle={() => togglePoseSelect(p.id)}
                                    batchMode={batchMode}
                                    batchSelected={batchSelectedIds.includes(p.id)}
                                    onBatchToggle={() => {
                                        setBatchSelectedIds((prev) => prev.includes(p.id) ? prev.filter((id) => id !== p.id) : [...prev, p.id]);
                                    }}
                                    isFavorite={!!p.favoriteAt}
                                    onToggleFavorite={async () => {
                                        await onBatchUpdateMeta({
                                            kind: "POSE",
                                            ids: [p.id],
                                            action: p.favoriteAt ? "unfavorite" : "favorite",
                                        });
                                        await onRefreshKind("POSE");
                                    }}
                                    onOpenDetails={() => openDetails("POSE", p)}
                                    description={p.description}
                                    compact
                                />
                            ))}
                            {poseItems.length === 0 && (
                                <div className="col-span-2 text-center text-sm text-muted-foreground py-8">
                                    无姿势资源
                                </div>
                            )}
                        </div>
                    )}

                    {activeTab === "faces" && (
                        <div className="grid grid-cols-2 gap-3 pb-8">
                            {orderBySelection(faceItems, selectedFaceIds).map((p) => (
                                <PresetCard
                                    key={p.id}
                                    id={p.id}
                                    name={p.name}
                                    thumbnailPath={p.thumbnailPath || p.imagePath}
                                    kindLabel="FACE"
                                    selected={selectedFaceIds.includes(p.id)}
                                    onToggle={() => toggleFaceSelect(p.id)}
                                    batchMode={batchMode}
                                    batchSelected={batchSelectedIds.includes(p.id)}
                                    onBatchToggle={() => {
                                        setBatchSelectedIds((prev) => prev.includes(p.id) ? prev.filter((id) => id !== p.id) : [...prev, p.id]);
                                    }}
                                    isFavorite={!!p.favoriteAt}
                                    onToggleFavorite={async () => {
                                        await onBatchUpdateMeta({
                                            kind: "FACE",
                                            ids: [p.id],
                                            action: p.favoriteAt ? "unfavorite" : "favorite",
                                        });
                                        await onRefreshKind("FACE");
                                    }}
                                    onOpenDetails={() => openDetails("FACE", p)}
                                    description={p.description}
                                    compact
                                />
                            ))}
                            {faceItems.length === 0 && (
                                <div className="col-span-2 text-center text-sm text-muted-foreground py-8">
                                    无人脸资源
                                </div>
                            )}
                        </div>
                    )}
                </div>
            </ScrollArea>

            {/* Details/Edit Dialog */}
            <Dialog open={detailOpen} onOpenChange={setDetailOpen}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>编辑资源</DialogTitle>
                    </DialogHeader>
                    <div className="space-y-4">
                        {isStyleOrPose && detailLearnStatus === "FAILED" && (
                            <div className="flex items-center gap-2 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-600">
                                <span className="h-2 w-2 rounded-full bg-rose-500" />
                                {detailLearnError ? `${detailLearnError}，请点击“重新学习”` : "学习失败，请点击“重新学习”"}
                            </div>
                        )}
                        {detailItem && (() => {
                            const images =
                                detailKind === "FACE" && "imagePath" in detailItem
                                    ? [detailItem.imagePath].filter(Boolean)
                                    : "imagePaths" in detailItem && Array.isArray(detailItem.imagePaths)
                                        ? detailItem.imagePaths
                                        : [];
                            if (!images.length) return null;
                            return (
                                <div className="grid grid-cols-3 gap-2">
                                    {images.map((src: string, idx: number) => (
                                        // eslint-disable-next-line @next/next/no-img-element
                                        <img
                                            key={`${detailItem.id}-${idx}`}
                                            src={toImgSrc(src)}
                                            alt={detailItem.name || "preset"}
                                            className="aspect-square w-full rounded-lg border border-slate-200 object-cover"
                                            loading="lazy"
                                            decoding="async"
                                        />
                                    ))}
                                </div>
                            );
                        })()}
                        <div className="space-y-1">
                            <label className="text-xs font-semibold text-muted-foreground">名称</label>
                            <Input value={detailName} onChange={(e) => setDetailName(e.target.value)} />
                        </div>
                        <div className="space-y-1">
                            <label className="text-xs font-semibold text-muted-foreground">备注</label>
                            <Textarea value={detailDesc} onChange={(e) => setDetailDesc(e.target.value)} />
                        </div>
                        <div className="space-y-2">
                            <label className="text-xs font-semibold text-muted-foreground">标签</label>
                            <TagInput value={detailTags} onChange={setDetailTags} />
                        </div>
                        <div className="space-y-2">
                            <label className="text-xs font-semibold text-muted-foreground">收藏夹</label>
                            <CollectionMultiSelect
                                items={collections}
                                selectedIds={detailCollectionIds}
                                onChange={setDetailCollectionIds}
                            />
                            {detailCollectionIds.length > 0 && (
                                <div className="text-xs text-muted-foreground">
                                    已选：{detailCollectionIds.map(getCollectionName).join("、")}
                                </div>
                            )}
                        </div>
                        <div className="flex gap-2 justify-end">
                            {detailKind && (
                                <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={async () => {
                                        if (!detailItem || !detailKind) return;
                                        setDetailBusy("favorite");
                                        try {
                                            await onBatchUpdateMeta({
                                                kind: detailKind,
                                                ids: [detailItem.id],
                                                action: detailItem.favoriteAt ? "unfavorite" : "favorite",
                                            });
                                            await onRefreshKind(detailKind);
                                            const updated = detailKind === "FACE"
                                                ? facePresets.find((p) => p.id === detailItem.id)
                                                : detailKind === "POSE"
                                                    ? posePresets.find((p) => p.id === detailItem.id)
                                                    : stylePresets.find((p) => p.id === detailItem.id);
                                            if (updated) {
                                                setDetailItem(updated);
                                                setDetailTags(Array.isArray(updated.tags) ? updated.tags : []);
                                                setDetailCollectionIds(Array.isArray(updated.collectionIds) ? updated.collectionIds : []);
                                            }
                                        } finally {
                                            setDetailBusy(null);
                                        }
                                    }}
                                    disabled={!!detailBusy}
                                >
                                    <Star className={`w-4 h-4 mr-1 ${detailItem?.favoriteAt ? "fill-amber-400 text-amber-400" : ""}`} />
                                    {detailItem?.favoriteAt ? "取消收藏" : "收藏"}
                                </Button>
                            )}
                            <Button variant="destructive" size="sm" onClick={async () => {
                                if (!confirm("确定删除?")) return;
                                if (!detailItem || !detailKind) return;
                                setDetailBusy("delete");
                                try {
                                    const { id } = detailItem;
                                    if (detailKind === "STYLE") await onDeleteStyle(id);
                                    else if (detailKind === "POSE") await onDeletePose(id);
                                    else if (detailKind === "FACE") await onDeleteFace(id);
                                    closeDetails();
                                } finally { setDetailBusy(null); }
                            }} disabled={!!detailBusy}>
                                {detailBusy === "delete" ? "删除中..." : "删除"}
                            </Button>

                            {detailKind !== "FACE" && (
                                <Button variant="secondary" size="sm" onClick={async () => {
                                    if (!confirm("重新学习?")) return;
                                    if (!detailItem || !detailKind) return;
                                    setDetailBusy("relearn");
                                    try {
                                        const { id } = detailItem;
                                        if (detailKind === "STYLE") await onRelearnStyle(id);
                                        else if (detailKind === "POSE") await onRelearnPose(id);
                                        closeDetails();
                                    } finally { setDetailBusy(null); }
                                }} disabled={!!detailBusy}>
                                    {detailBusy === "relearn" ? "学习中..." : "重新学习"}
                                </Button>
                            )}

                            <Button onClick={async () => {
                                if (!detailItem || !detailKind) return;
                                setDetailBusy("save");
                                try {
                                    const updates = { name: detailName, description: detailDesc };
                                    const { id } = detailItem;
                                    if (detailKind === "STYLE") await onUpdateStyle(id, updates);
                                    else if (detailKind === "POSE") await onUpdatePose(id, updates);
                                    else if (detailKind === "FACE") await onUpdateFace(id, updates);
                                    await onBatchUpdateMeta({
                                        kind: detailKind,
                                        ids: [id],
                                        action: "set-tags",
                                        tags: detailTags,
                                    });
                                    await onBatchUpdateMeta({
                                        kind: detailKind,
                                        ids: [id],
                                        action: "set-collections",
                                        collectionIds: detailCollectionIds,
                                    });
                                    await onRefreshKind(detailKind);
                                    closeDetails();
                                } finally { setDetailBusy(null); }
                            }} disabled={!!detailBusy}>
                                {detailBusy === "save" ? "保存中..." : "保存"}
                            </Button>
                        </div>
                    </div>
                </DialogContent>
            </Dialog>

            <CollectionManagerDialog
                open={collectionDialogOpen}
                onOpenChange={setCollectionDialogOpen}
                items={collections}
                onCreate={onCreateCollection}
                onRename={onRenameCollection}
                onDelete={onDeleteCollection}
            />
        </div>
    );
}
