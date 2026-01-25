import { useState, useMemo, useCallback, useEffect } from "react";
import type { StylePreset } from "@/store/style-preset-store";
import type { PosePreset } from "@/store/pose-preset-store";
import type { FacePreset } from "@/store/face-preset-store";
import type { PresetCollection } from "@/lib/preset-collections";
import type { BatchMetaAction, PresetKind } from "@/lib/preset-meta";

export type AssetTab = "styles" | "poses" | "faces";

export const TAB_KIND_MAP: Record<AssetTab, PresetKind> = {
    styles: "STYLE",
    poses: "POSE",
    faces: "FACE",
};

export const SORT_OPTIONS = [
    { value: "favorite", label: "收藏优先" },
    { value: "recent", label: "最近使用" },
    { value: "created", label: "创建时间" },
    { value: "name", label: "名称" },
] as const;

export type SortRule = (typeof SORT_OPTIONS)[number]["value"];

interface UseAssetLibraryProps {
    stylePresets: StylePreset[];
    posePresets: PosePreset[];
    facePresets: FacePreset[];
    collections: PresetCollection[];
    onBatchUpdateMeta: (input: {
        kind: PresetKind;
        ids: string[];
        action: BatchMetaAction;
        tags?: string[];
        collectionIds?: string[];
    }) => Promise<void>;
    onRefreshKind: (kind: PresetKind) => Promise<void>;
}

export function useAssetLibraryState({
    stylePresets,
    posePresets,
    facePresets,
    collections,
    onBatchUpdateMeta,
    onRefreshKind,
}: UseAssetLibraryProps) {
    // --- Basic State ---
    const [activeTab, setActiveTab] = useState<AssetTab>("styles");
    const [searchQuery, setSearchQuery] = useState("");
    const activeKind = TAB_KIND_MAP[activeTab];

    // --- Filtering & Sorting ---
    const [sortRule, setSortRule] = useState<SortRule>("favorite");
    const [favoriteOnly, setFavoriteOnly] = useState(false);
    const [filterCollectionId, setFilterCollectionId] = useState<string>("all");
    const [filterTag, setFilterTag] = useState("");

    // --- Batch Mode State ---
    const [batchMode, setBatchMode] = useState(false);
    const [batchSelectedIds, setBatchSelectedIds] = useState<string[]>([]);
    const [batchTags, setBatchTags] = useState<string[]>([]);
    const [batchCollectionIds, setBatchCollectionIds] = useState<string[]>([]);

    // --- Reset Batch on Tab Change ---
    useEffect(() => {
        setBatchSelectedIds([]);
        setBatchTags([]);
        setBatchCollectionIds([]);
        setBatchMode(false);
    }, [activeTab]);

    // --- Validate Collection Filter ---
    useEffect(() => {
        if (filterCollectionId === "all") return;
        if (!collections.some((c) => c.id === filterCollectionId)) {
            setFilterCollectionId("all");
        }
    }, [collections, filterCollectionId]);

    // --- Normalization & Sorting Logic ---
    const normalizeItems = useCallback(
        <
            T extends {
                id: string;
                name?: string;
                tags?: string[];
                favoriteAt?: number;
                lastUsedAt?: number;
                createdAt: number;
                collectionIds?: string[];
            }
        >(
            items: T[]
        ) => {
            const search = searchQuery.trim().toLowerCase();
            const tagFilter = filterTag.trim().toLowerCase();

            const filtered = items.filter((item) => {
                const name = String(item.name || "").toLowerCase();
                if (search && !name.includes(search)) return false;
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

            const compare = (a: T, b: T) => {
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
        },
        [searchQuery, filterTag, favoriteOnly, filterCollectionId, sortRule]
    );

    // --- Derived Lists ---
    const filteredStyles = useMemo(() => normalizeItems(stylePresets), [stylePresets, normalizeItems]);
    const filteredPoses = useMemo(() => normalizeItems(posePresets), [posePresets, normalizeItems]);
    const filteredFaces = useMemo(() => normalizeItems(facePresets), [facePresets, normalizeItems]);

    const activeItems =
        activeTab === "styles"
            ? filteredStyles
            : activeTab === "poses"
                ? filteredPoses
                : filteredFaces;

    // --- Order by Selection (Helper) ---
    const orderBySelection = useCallback(
        <T extends { id: string }>(items: T[], selectedIds: string[]) => {
            if (!selectedIds.length) return items;
            const itemMap = new Map(items.map((item) => [item.id, item]));
            const selected = selectedIds.map((id) => itemMap.get(id)).filter(Boolean) as T[];
            const selectedSet = new Set(selectedIds);
            const unselected = items.filter((item) => !selectedSet.has(item.id));
            return [...selected, ...unselected];
        },
        []
    );

    // --- Batch Actions ---
    const applyBatchAction = useCallback(
        async (
            action: BatchMetaAction,
            payload?: { tags?: string[]; collectionIds?: string[] }
        ) => {
            if (!batchSelectedIds.length) return;
            await onBatchUpdateMeta({
                kind: activeKind,
                ids: batchSelectedIds,
                action,
                tags: payload?.tags,
                collectionIds: payload?.collectionIds,
            });
            await onRefreshKind(activeKind);
            setBatchSelectedIds([]);
            setBatchTags([]);
            setBatchCollectionIds([]);
        },
        [batchSelectedIds, activeKind, onBatchUpdateMeta, onRefreshKind]
    );

    return {
        // State
        activeTab,
        setActiveTab,
        searchQuery,
        setSearchQuery,
        batchMode,
        setBatchMode,
        batchSelectedIds,
        setBatchSelectedIds,
        batchTags,
        setBatchTags,
        batchCollectionIds,
        setBatchCollectionIds,
        sortRule,
        setSortRule,
        favoriteOnly,
        setFavoriteOnly,
        filterCollectionId,
        setFilterCollectionId,
        filterTag,
        setFilterTag,

        // Derived
        activeKind,
        activeItems,
        orderBySelection,
        filteredStyles,
        filteredPoses,
        filteredFaces,

        // Actions
        applyBatchAction,
    };
}
