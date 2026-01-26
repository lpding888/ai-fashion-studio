"use client";

import * as React from "react";
import { Sparkles } from "lucide-react";

import api from "@/lib/api";
import {
  createDirectTaskFromUrls,
  createPromptSnippet,
  deletePromptSnippet,
  directRegenerateTask,
  learnPose,
  learnStyle,
  listPromptSnippets,
  toggleTaskFavorite,
} from "@/lib/api";
import { useAuth } from "@/hooks/use-auth";
import { calculateRequiredCredits, requestCreditsRefresh, useCredits } from "@/hooks/use-credits";
import { uploadFileToCosWithMeta, type CosUploadResult } from "@/lib/cos";
import { registerUserAssets, listUserAssets, type UserAsset } from "@/lib/user-assets";
import { batchUpdatePresetMeta, type BatchMetaAction, type PresetKind } from "@/lib/preset-meta";
import { createPresetCollection, deletePresetCollection, listPresetCollections, renamePresetCollection, type PresetCollection } from "@/lib/preset-collections";
import { optimizePrompt } from "@/lib/prompt-optimizer";

import { useStylePresetStore, type StylePreset } from "@/store/style-preset-store";
import { usePosePresetStore } from "@/store/pose-preset-store";

import { useFacePresetStore } from "@/store/face-preset-store";
import { Button } from "@/components/ui/button";
import { ImageLightbox, type LightboxItem } from "@/components/image-lightbox";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

import { FluidBackground } from "@/components/learn/layout/fluid-background";

// New Layout Components
import { StudioLayout } from "@/components/learn/layout/studio-layout";
import { ResourcePanel } from "@/components/learn/layout/resource-panel";
import { StudioCanvas } from "@/components/learn/layout/studio-canvas";
import { ControlHub } from "@/components/learn/layout/control-hub";
import { ParameterSection } from "@/components/learn/controls/parameter-section";
import { QueueSection } from "@/components/learn/controls/queue-section";
import { WorkspaceSnapshotManager } from "@/components/learn/workspace-snapshot-manager";

import { useStudioSound } from "@/hooks/use-studio-sound";
import { useStudioShortcuts } from "@/hooks/use-studio-shortcuts";

import type { GarmentItem, PromptSnippet, QueueItem, Task, TaskApi } from "@/components/learn/types";
import { toImgSrc } from "@/components/learn/learn-utils";
import { cn } from "@/lib/utils";

const MAX_GARMENT_IMAGES = 6;
const MAX_POSE_SELECT = 4;
const MAX_FACE_SELECT = 3;
const POLL_INTERVAL_MS = 1500;
const DIRECT_QUEUE_PAGE_SIZE = 30;
const DIRECT_QUEUE_MAX_LIMIT = 200;
const GRID_PROMPT_LINE = "If multiple poses are selected, output ONE contact sheet with one panel per pose (max 4 panels). Same model + same garment across panels.";
const SINGLE_PROMPT_LINE = "只能有一个人、一个姿势。不要拼图/拼接/多宫格/多分屏。";

const STORAGE_QUEUE_KEY = "afs:learn:queue:v1";
const STORAGE_QUEUE_FAVORITES_KEY = "afs:learn:queue:favorites:v1";
const STORAGE_PREFS_KEY = "afs:learn:prefs:v1";
type BackgroundVariant = "default" | "warm" | "cool" | "cyber" | "mint" | "sunset";
type AspectRatio = "1:1" | "4:3" | "3:4" | "16:9" | "9:16" | "21:9";
type Resolution = "1K" | "2K" | "4K";
type WorkspaceSnapshotPayload = {
  selectedStyleIds?: string[];
  selectedPoseIds?: string[];
  selectedFaceIds?: string[];
  userPrompt?: string;
  garmentItems?: GarmentItem[];
  garmentAssetUrls?: string[];
  shotCount?: number;
  layoutMode?: "Individual" | "Grid";
  resolution?: Resolution;
  aspectRatio?: AspectRatio;
  seedRaw?: string;
  seedAuto?: boolean;
  includeThoughts?: boolean;
  temperatureRaw?: string;
};

function buildAutoStylePrompt(stylePresets: StylePreset[], styleId?: string | null, layoutMode: "Individual" | "Grid" = "Individual") {
  if (!styleId) return "";
  const preset = stylePresets.find((x) => x.id === styleId);
  if (preset?.learnStatus === "FAILED") return "";
  const name = preset?.name ? String(preset.name).trim() : "";
  return [
    "Commercial fashion photography.",
    "Model wears the uploaded garment(s). Preserve garment cut, seams, logos, patterns, fabric texture, and natural wrinkles.",
    "Face must match selected face reference (if provided).",
    "Photorealistic, high detail, clean commercial composition.",
    layoutMode === "Grid" ? GRID_PROMPT_LINE : null,
    name ? `Apply the learned style: ${name}.` : "Apply the learned style JSON strictly.",
  ].filter(Boolean).join("\n");
}

const AUTO_STYLE_PROMPT_LINES = [
  "Commercial fashion photography.",
  "Model wears the uploaded garment(s). Preserve garment cut, seams, logos, patterns, fabric texture, and natural wrinkles.",
  "Face must match selected face reference (if provided).",
  "Photorealistic, high detail, clean commercial composition.",
  GRID_PROMPT_LINE,
  SINGLE_PROMPT_LINE,
];
const AUTO_STYLE_PROMPT_PREFIX = "Apply the learned style:";
const AUTO_STYLE_PROMPT_JSON_LINE = "Apply the learned style JSON strictly.";

function appendModeHint(text: string, layoutMode: "Individual" | "Grid") {
  const trimmed = text.trim();
  if (!trimmed) return trimmed;
  const hint = layoutMode === "Grid" ? GRID_PROMPT_LINE : SINGLE_PROMPT_LINE;
  if (trimmed.includes(hint)) return trimmed;
  return `${trimmed}\n${hint}`;
}

function normalizePromptLine(value: string) {
  return value.trim().replace(/\s+/g, " ").toLowerCase();
}

function isAspectRatio(value: string): value is AspectRatio {
  return value === "1:1"
    || value === "4:3"
    || value === "3:4"
    || value === "16:9"
    || value === "9:16"
    || value === "21:9";
}

function stripAutoStylePrompt(raw: string) {
  const lines = String(raw || "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  if (!lines.length) return "";

  const autoLineSet = new Set(AUTO_STYLE_PROMPT_LINES.map(normalizePromptLine));
  const stylePrefix = normalizePromptLine(AUTO_STYLE_PROMPT_PREFIX);
  const jsonLine = normalizePromptLine(AUTO_STYLE_PROMPT_JSON_LINE);

  const userLines = lines.filter((line) => {
    const normalized = normalizePromptLine(line);
    if (!normalized) return false;
    if (autoLineSet.has(normalized)) return false;
    if (normalized === jsonLine) return false;
    if (normalized.startsWith(stylePrefix)) return false;
    return true;
  });

  return userLines.join("\n").trim();
}

function isCosImageUrl(value: string) {
  const trimmed = String(value || "").trim();
  if (!trimmed) return false;
  if (!/^https?:\/\//i.test(trimmed)) return false;
  return trimmed.includes(".cos.") && trimmed.includes(".myqcloud.com/");
}

function isDirectTask(task: TaskApi) {
  const shots = Array.isArray(task?.shots) ? task.shots : [];
  return (
    !!task?.directPrompt ||
    task?.scene === "Direct" ||
    shots.some((shot) => String(shot?.type || "").toLowerCase() === "directprompt")
  );
}

function hashString(input: string) {
  let hash = 0;
  for (let i = 0; i < input.length; i += 1) {
    hash = (hash * 31 + input.charCodeAt(i)) | 0;
  }
  return Math.abs(hash);
}

function getErrorMessage(error: unknown, fallback: string) {
  const maybe = error as { response?: { data?: { message?: string } }; message?: string };
  return maybe?.response?.data?.message || (error instanceof Error ? error.message : fallback);
}

export function LearnGeneratePage() {
  const { play } = useStudioSound();
  const { isAuthenticated } = useAuth();
  const { balance, isLoaded: creditsLoaded } = useCredits();

  // Zustand: 避免直接订阅整个 store 对象（会导致 useEffect 依赖变化→无限循环）
  const stylePresetsAll = useStylePresetStore((s) => s.presets);
  const fetchStylePresets = useStylePresetStore((s) => s.fetchPresets);
  const updateStylePreset = useStylePresetStore((s) => s.updatePreset);
  const deleteStylePreset = useStylePresetStore((s) => s.deletePreset);
  const relearnStylePreset = useStylePresetStore((s) => s.relearnPreset);

  const posePresetsAll = usePosePresetStore((s) => s.presets);
  const fetchPosePresets = usePosePresetStore((s) => s.fetchPresets);
  const updatePosePreset = usePosePresetStore((s) => s.updatePreset);
  const deletePosePreset = usePosePresetStore((s) => s.deletePreset);
  const relearnPosePreset = usePosePresetStore((s) => s.relearnPreset);

  const [selectedStyleIds, setSelectedStyleIds] = React.useState<string[]>([]);
  const [selectedPoseIds, setSelectedPoseIds] = React.useState<string[]>([]);
  const [selectedFaceIds, setSelectedFaceIds] = React.useState<string[]>([]);


  // Garment State (Unified for Drag & Drop)
  const [garmentItems, setGarmentItems] = React.useState<GarmentItem[]>([]);
  // Use a derived ref to keep track of current items for imperative code if needed, 
  // but state is usually enough.

  const addGarmentFiles = (incoming: File[]) => {
    const images = incoming.filter((f) => f.type.startsWith("image/"));
    if (!images.length) return;
    setGarmentItems((prev) => {
      const remaining = Math.max(0, MAX_GARMENT_IMAGES - prev.length);
      if (remaining <= 0) return prev;
      const newItems: GarmentItem[] = images.slice(0, remaining).map(f => ({
        id: crypto.randomUUID(),
        type: "file",
        file: f
      }));
      return [...prev, ...newItems];
    });
  };

  const removeGarmentItem = (id: string) => {
    setGarmentItems((prev) => prev.filter((item) => item.id !== id));
  };

  const clearGarmentImages = () => {
    setGarmentItems([]);
  };

  const reorderGarmentItems = (newItems: GarmentItem[]) => {
    setGarmentItems(newItems);
  };

  // User Assets (Bind to API)
  const [userAssets, setUserAssets] = React.useState<UserAsset[]>([]);
  const [userAssetsLoading, setUserAssetsLoading] = React.useState(false);
  const [userAssetsPage, setUserAssetsPage] = React.useState(1);
  const [userAssetsHasMore, setUserAssetsHasMore] = React.useState(true);

  const loadUserAssets = React.useCallback(async (page: number) => {
    if (!isAuthenticated) return;
    setUserAssetsLoading(true);
    try {
      const res = await listUserAssets(page, 20); // Limit 20 per page
      const newItems = res.items || [];
      setUserAssets((prev) => page === 1 ? newItems : [...prev, ...newItems]);
      setUserAssetsHasMore(page < res.totalPages);
      setUserAssetsPage(page);
    } catch (err) {
      console.error("Load user assets failed:", err);
    } finally {
      setUserAssetsLoading(false);
    }
  }, [isAuthenticated]);

  const handleLoadMoreUserAssets = React.useCallback(() => {
    if (!userAssetsLoading && userAssetsHasMore) {
      loadUserAssets(userAssetsPage + 1);
    }
  }, [userAssetsLoading, userAssetsHasMore, userAssetsPage, loadUserAssets]);

  // Initial load of user assets
  React.useEffect(() => {
    if (isAuthenticated) {
      loadUserAssets(1);
    }
  }, [isAuthenticated, loadUserAssets]);

  // Dual prompt system: auto-filled style prompt + user custom prompt
  const [autoStylePrompt, setAutoStylePrompt] = React.useState<string>(""); // Auto-filled from style selection
  const [userPrompt, setUserPrompt] = React.useState<string>(""); // User's custom additions
  const lastAutoStyleSignatureRef = React.useRef<string | null>(null);
  const [promptSnippets, setPromptSnippets] = React.useState<PromptSnippet[]>([]);
  const [promptSnippetsLoading, setPromptSnippetsLoading] = React.useState(false);
  const [promptSnippetsBusy, setPromptSnippetsBusy] = React.useState<"create" | "delete" | null>(null);
  const [selectedSnippetId, setSelectedSnippetId] = React.useState<string | null>(null);
  const [snippetRemark, setSnippetRemark] = React.useState<string>("");
  const [promptOptimizeOpen, setPromptOptimizeOpen] = React.useState(false);
  const [promptOptimizeBusy, setPromptOptimizeBusy] = React.useState(false);
  const [promptOptimizeResult, setPromptOptimizeResult] = React.useState("");
  const [promptUndoSnapshot, setPromptUndoSnapshot] = React.useState<string | null>(null);
  const [collections, setCollections] = React.useState<PresetCollection[]>([]);

  const [resolution, setResolution] = React.useState<"1K" | "2K" | "4K">("2K");
  const [aspectRatio, setAspectRatio] = React.useState<AspectRatio>("3:4");
  const [layoutMode, setLayoutMode] = React.useState<"Individual" | "Grid">("Individual");
  const [shotCount, setShotCount] = React.useState<number>(1);
  const [includeThoughts, setIncludeThoughts] = React.useState(false);
  const [seedRaw, setSeedRaw] = React.useState<string>("");
  const [seedAuto, setSeedAuto] = React.useState(true);
  const [temperatureRaw, setTemperatureRaw] = React.useState<string>("");

  const [creating, setCreating] = React.useState(false);

  const [queue, setQueue] = React.useState<QueueItem[]>([]);
  const [tasksById, setTasksById] = React.useState<Record<string, TaskApi>>({});
  const [queueRetryingTaskId, setQueueRetryingTaskId] = React.useState<string | null>(null);
  const [queueTotal, setQueueTotal] = React.useState(0);
  const [queueViewAll, setQueueViewAll] = React.useState(false);
  const [favoriteTaskIds, setFavoriteTaskIds] = React.useState<string[]>([]);
  const [favoriteTasks, setFavoriteTasks] = React.useState<TaskApi[]>([]);
  const [queueTab, setQueueTab] = React.useState<"queue" | "favorites">("queue");
  const [parameterCollapsed, setParameterCollapsed] = React.useState(true);
  const [showLeftPanel, setShowLeftPanel] = React.useState(false);
  const [showRightPanel, setShowRightPanel] = React.useState(false);
  const [workbenchNotice, setWorkbenchNotice] = React.useState<string>("");

  const [lightboxOpen, setLightboxOpen] = React.useState(false);
  const [lightboxImages, setLightboxImages] = React.useState<LightboxItem[]>([]);
  const [lightboxInitialIndex, setLightboxInitialIndex] = React.useState(0);
  const [lightboxTaskId, setLightboxTaskId] = React.useState<string | undefined>(undefined);
  const lightboxRequestRef = React.useRef<string | null>(null);
  const [taskDetailOpen, setTaskDetailOpen] = React.useState(false);
  const [taskDetailLoading, setTaskDetailLoading] = React.useState(false);
  const [taskDetailError, setTaskDetailError] = React.useState<string | null>(null);
  const [taskDetail, setTaskDetail] = React.useState<TaskApi | null>(null);

  // New Interactive States for Redesign
  const [backgroundVariant, setBackgroundVariant] = React.useState<BackgroundVariant>("default");

  // 口径对齐后端：1K=1，2K=2，4K=4
  const estimatedCreditsCost = calculateRequiredCredits({
    shotCount,
    layoutMode,
    resolution,
  });

  const activeStyle = (stylePresetsAll || []).find((p) => p.id === selectedStyleIds[0]);
  const activeStyleName = activeStyle?.name ? String(activeStyle.name).trim() : "";
  const activeStylePrompt = activeStyle?.promptBlock || "";
  const hasWorkbenchState =
    garmentItems.length > 0 ||
    userPrompt.trim().length > 0 ||
    selectedSnippetId !== null ||
    snippetRemark.trim().length > 0 ||
    selectedStyleIds.length > 0 ||
    selectedPoseIds.length > 0 ||
    selectedFaceIds.length > 0 ||
    shotCount !== 1 ||
    layoutMode !== "Individual" ||
    resolution !== "2K" ||
    aspectRatio !== "3:4" ||
    includeThoughts ||
    !seedAuto ||
    seedRaw.trim().length > 0 ||
    temperatureRaw.trim().length > 0;

  const facePresetsAll = useFacePresetStore((s) => s.presets);
  const fetchFacePresets = useFacePresetStore((s) => s.fetchPresets);
  const updateFacePreset = useFacePresetStore((s) => s.updatePreset);
  const deleteFacePreset = useFacePresetStore((s) => s.deletePreset);

  React.useEffect(() => {
    if (!isAuthenticated) return;
    void fetchStylePresets();
    void fetchPosePresets();
    void fetchFacePresets();
  }, [isAuthenticated, fetchStylePresets, fetchPosePresets, fetchFacePresets]);

  const loadPromptSnippets = React.useCallback(async () => {
    if (!isAuthenticated) return;
    setPromptSnippetsLoading(true);
    try {
      const res = await listPromptSnippets();
      const items = Array.isArray(res) ? res : (res?.items ?? []);
      setPromptSnippets(Array.isArray(items) ? items : []);
    } catch {
      setPromptSnippets([]);
    } finally {
      setPromptSnippetsLoading(false);
    }
  }, [isAuthenticated]);

  const loadCollections = React.useCallback(async () => {
    if (!isAuthenticated) return;
    try {
      const items = await listPresetCollections();
      setCollections(items);
    } catch (err) {
      console.error("加载收藏夹失败:", err);
      setCollections([]);
    }
  }, [isAuthenticated]);

  const fetchDirectQueuePage = React.useCallback(async (page: number, limit: number) => {
    const res = await api.get("/tasks", {
      params: {
        page,
        limit,
        scope: "mine",
        directOnly: true,
      },
    });
    const tasks = Array.isArray(res.data?.tasks) ? (res.data.tasks as TaskApi[]) : [];
    return {
      tasks,
      total: Number(res.data?.total || 0),
      totalPages: Number(res.data?.totalPages || 1),
    };
  }, []);

  const fetchFavoriteTasksPage = React.useCallback(async (page: number, limit: number) => {
    const res = await api.get("/tasks", {
      params: {
        page,
        limit,
        scope: "mine",
        directOnly: true,
        favoriteOnly: true,
      },
    });
    const tasks = Array.isArray(res.data?.tasks) ? (res.data.tasks as TaskApi[]) : [];
    return {
      tasks,
      total: Number(res.data?.total || 0),
      totalPages: Number(res.data?.totalPages || 1),
    };
  }, []);

  const syncDirectQueue = React.useCallback(async (options?: { all?: boolean }) => {
    if (!isAuthenticated) return;
    try {
      const wantAll = !!options?.all;
      const pageLimit = wantAll ? DIRECT_QUEUE_MAX_LIMIT : DIRECT_QUEUE_PAGE_SIZE;
      const first = await fetchDirectQueuePage(1, pageLimit);
      let allTasks = first.tasks;

      if (wantAll && first.totalPages > 1) {
        for (let page = 2; page <= first.totalPages; page += 1) {
          const next = await fetchDirectQueuePage(page, pageLimit);
          allTasks = [...allTasks, ...next.tasks];
        }
      }

      const directTasks = allTasks.filter(isDirectTask);
      const maxItems = wantAll ? DIRECT_QUEUE_MAX_LIMIT : DIRECT_QUEUE_PAGE_SIZE;
      const queueTasks = directTasks.slice(0, maxItems);
      setQueueTotal(first.total || directTasks.length);
      setQueue(queueTasks.map((task) => ({ taskId: task.id, createdAt: task.createdAt })));
      setTasksById((prev) => {
        const next = { ...prev };
        queueTasks.forEach((task) => {
          next[task.id] = task;
        });
        return next;
      });
      setFavoriteTaskIds((prev) => {
        const next = new Set(prev);
        queueTasks.forEach((task) => {
          if (task.favoriteAt) next.add(task.id);
          else next.delete(task.id);
        });
        return Array.from(next);
      });
    } catch (err) {
      console.error("Sync direct queue failed:", err);
    }
  }, [isAuthenticated, fetchDirectQueuePage]);

  const syncFavoriteTasks = React.useCallback(async () => {
    if (!isAuthenticated) return;
    try {
      const pageLimit = DIRECT_QUEUE_MAX_LIMIT;
      const first = await fetchFavoriteTasksPage(1, pageLimit);
      let allTasks = first.tasks;

      if (first.totalPages > 1) {
        for (let page = 2; page <= first.totalPages; page += 1) {
          const next = await fetchFavoriteTasksPage(page, pageLimit);
          allTasks = [...allTasks, ...next.tasks];
          if (allTasks.length >= DIRECT_QUEUE_MAX_LIMIT) break;
        }
      }

      const directTasks = allTasks.filter(isDirectTask).slice(0, DIRECT_QUEUE_MAX_LIMIT);
      setFavoriteTasks(directTasks);
      setTasksById((prev) => {
        const next = { ...prev };
        directTasks.forEach((task) => {
          next[task.id] = task;
        });
        return next;
      });
      setFavoriteTaskIds(directTasks.map((task) => task.id));
    } catch (err) {
      console.error("Sync favorite tasks failed:", err);
    }
  }, [isAuthenticated, fetchFavoriteTasksPage]);

  const refreshPresetKind = React.useCallback(async (kind: PresetKind) => {
    if (kind === "STYLE") {
      await fetchStylePresets();
      return;
    }
    if (kind === "POSE") {
      await fetchPosePresets();
      return;
    }
    await fetchFacePresets();
  }, [fetchStylePresets, fetchPosePresets, fetchFacePresets]);

  const handleBatchUpdateMeta = React.useCallback(async (input: {
    kind: PresetKind;
    ids: string[];
    action: BatchMetaAction;
    tags?: string[];
    collectionIds?: string[];
  }) => {
    if (input.action === "delete") {
      const deleteFn =
        input.kind === "STYLE"
          ? deleteStylePreset
          : input.kind === "POSE"
            ? deletePosePreset
            : deleteFacePreset;

      // Parallel delete
      await Promise.all(input.ids.map(id => deleteFn(id).catch(err => console.error(`Batch delete failed for ${id}:`, err))));
      return;
    }

    await batchUpdatePresetMeta({
      kind: input.kind,
      ids: input.ids,
      action: input.action,
      payload: {
        tags: input.tags,
        collectionIds: input.collectionIds,
      },
    });
  }, [deleteStylePreset, deletePosePreset, deleteFacePreset]);

  const handleCreateCollection = React.useCallback(async (name: string) => {
    await createPresetCollection(name);
    await loadCollections();
  }, [loadCollections]);

  const handleRenameCollection = React.useCallback(async (id: string, name: string) => {
    await renamePresetCollection(id, name);
    await loadCollections();
  }, [loadCollections]);

  const handleDeleteCollection = React.useCallback(async (id: string) => {
    await deletePresetCollection(id);
    await loadCollections();
    await fetchStylePresets();
    await fetchPosePresets();
    await fetchFacePresets();
  }, [loadCollections, fetchStylePresets, fetchPosePresets, fetchFacePresets]);

  const handlePromptChange = React.useCallback((value: string) => {
    setUserPrompt(value);
    if (promptUndoSnapshot !== null) {
      setPromptUndoSnapshot(null);
    }
  }, [promptUndoSnapshot]);

  const handleOptimizePrompt = React.useCallback(async () => {
    const basePrompt = userPrompt.trim();
    if (!basePrompt) {
      alert("请先输入提示词");
      return;
    }

    setPromptOptimizeBusy(true);
    try {
      const styles = selectedStyleIds
        .map((id) => stylePresetsAll.find((p) => p.id === id))
        .filter(Boolean)
        .map((p) => ({
          id: p!.id,
          name: p!.name,
          description: p!.description,
          tags: p!.tags,
          styleHint: p!.styleHint,
        }));
      const poses = selectedPoseIds
        .map((id) => posePresetsAll.find((p) => p.id === id))
        .filter(Boolean)
        .map((p) => ({
          id: p!.id,
          name: p!.name,
          description: p!.description,
          tags: p!.tags,
        }));
      const faces = selectedFaceIds
        .map((id) => facePresetsAll.find((p) => p.id === id))
        .filter(Boolean)
        .map((p) => ({
          id: p!.id,
          name: p!.name,
          description: p!.description,
          tags: p!.tags,
        }));

      const res = await optimizePrompt({
        prompt: basePrompt,
        settings: {
          layoutMode,
          shotCount,
          resolution,
          aspectRatio,
        },
        presets: {
          styles: styles.length ? styles : undefined,
          poses: poses.length ? poses : undefined,
          faces: faces.length ? faces : undefined,
        },
      });

      const optimized = String(res?.optimizedPrompt || "").trim();
      if (!optimized) {
        throw new Error("优化结果为空");
      }

      setPromptOptimizeResult(optimized);
      setPromptOptimizeOpen(true);
    } catch (e: unknown) {
      console.error(e);
      alert(getErrorMessage(e, "优化失败"));
    } finally {
      setPromptOptimizeBusy(false);
    }
  }, [
    userPrompt,
    selectedStyleIds,
    selectedPoseIds,
    selectedFaceIds,
    stylePresetsAll,
    posePresetsAll,
    facePresetsAll,
    layoutMode,
    shotCount,
    resolution,
    aspectRatio,
  ]);

  const applyOptimizedPrompt = React.useCallback((mode: "replace" | "append") => {
    const optimized = String(promptOptimizeResult || "").trim();
    if (!optimized) return;
    setPromptUndoSnapshot(userPrompt);
    if (mode === "append") {
      setUserPrompt((prev) => (prev.trim() ? `${prev.trim()}\n${optimized}` : optimized));
    } else {
      setUserPrompt(optimized);
    }
    setPromptOptimizeOpen(false);
  }, [promptOptimizeResult, userPrompt]);

  const handleUndoOptimize = React.useCallback(() => {
    if (promptUndoSnapshot === null) return;
    setUserPrompt(promptUndoSnapshot);
    setPromptUndoSnapshot(null);
  }, [promptUndoSnapshot]);

  const uploadGarmentFiles = async (files: File[]) => {
    if (!files.length) return [];
    const results: CosUploadResult[] = await Promise.all(files.map((f) => uploadFileToCosWithMeta(f)));
    try {
      await registerUserAssets(results.map((res) => ({
        url: res.url,
        sha256: res.sha256,
        cosKey: res.key,
        fileName: res.fileName,
        size: res.size,
        mimeType: res.mimeType,
      })));
    } catch (err) {
      console.warn("Register user assets failed:", err);
    }
    return results.map((res) => String(res.url || "").trim()).filter(Boolean);
  };

  React.useEffect(() => {
    if (!isAuthenticated) return;
    void loadPromptSnippets();
    void loadCollections();
  }, [isAuthenticated, loadPromptSnippets, loadCollections]);

  React.useEffect(() => {
    if (!isAuthenticated) return;
    void syncDirectQueue({ all: queueViewAll });
  }, [isAuthenticated, queueViewAll, syncDirectQueue]);

  React.useEffect(() => {
    if (!isAuthenticated) return;
    if (queueTab !== "favorites") return;
    void syncFavoriteTasks();
  }, [isAuthenticated, queueTab, syncFavoriteTasks]);

  React.useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const raw = localStorage.getItem(STORAGE_QUEUE_KEY);
      const parsed = raw ? (JSON.parse(raw) as QueueItem[]) : [];
      setQueue(Array.isArray(parsed) ? parsed.slice(0, DIRECT_QUEUE_MAX_LIMIT) : []);
    } catch {
      setQueue([]);
    }
    try {
      const rawFavorites = localStorage.getItem(STORAGE_QUEUE_FAVORITES_KEY);
      const parsedFavorites = rawFavorites ? (JSON.parse(rawFavorites) as string[]) : [];
      setFavoriteTaskIds(Array.isArray(parsedFavorites) ? parsedFavorites : []);
    } catch {
      setFavoriteTaskIds([]);
    }
  }, []);

  React.useEffect(() => {
    if (typeof window === "undefined") return;
    localStorage.setItem(STORAGE_QUEUE_KEY, JSON.stringify(queue.slice(0, DIRECT_QUEUE_MAX_LIMIT)));
  }, [queue]);

  React.useEffect(() => {
    if (typeof window === "undefined") return;
    localStorage.setItem(STORAGE_QUEUE_FAVORITES_KEY, JSON.stringify(favoriteTaskIds.slice(0, DIRECT_QUEUE_MAX_LIMIT)));
  }, [favoriteTaskIds]);

  // 偏好设置：恢复上次选择与参数（不包含用户补充提示词与本地文件）
  React.useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const raw = localStorage.getItem(STORAGE_PREFS_KEY);
      if (!raw) return;
      const prefs = JSON.parse(raw);
      if (prefs.resolution) setResolution(prefs.resolution);
      if (prefs.aspectRatio) setAspectRatio(prefs.aspectRatio);
      if (prefs.layoutMode) setLayoutMode(prefs.layoutMode);
      if (Number.isFinite(prefs.shotCount)) setShotCount(Math.max(1, Math.floor(prefs.shotCount)));
      if (typeof prefs.temperature === "string") setTemperatureRaw(prefs.temperature);
      if (typeof prefs.includeThoughts === "boolean") setIncludeThoughts(prefs.includeThoughts);
      if (typeof prefs.seedRaw === "string") setSeedRaw(prefs.seedRaw);
      if (typeof prefs.seedAuto === "boolean") setSeedAuto(prefs.seedAuto);
      if (Array.isArray(prefs.selectedStyleIds)) setSelectedStyleIds(prefs.selectedStyleIds);
      if (Array.isArray(prefs.selectedPoseIds)) setSelectedPoseIds(prefs.selectedPoseIds);
      if (Array.isArray(prefs.selectedFaceIds)) setSelectedFaceIds(prefs.selectedFaceIds);
      if (typeof prefs.parameterCollapsed === "boolean") setParameterCollapsed(prefs.parameterCollapsed);
    } catch (e) {
      console.error("Failed to load prefs", e);
    }
  }, []);

  React.useEffect(() => {
    if (typeof window === "undefined") return;
    const prefs = {
      resolution,
      aspectRatio,
      layoutMode,
      shotCount,
      temperature: temperatureRaw,
      includeThoughts,
      seedRaw,
      seedAuto,
      selectedStyleIds,
      selectedPoseIds,
      selectedFaceIds,
      parameterCollapsed,
    };
    localStorage.setItem(STORAGE_PREFS_KEY, JSON.stringify(prefs));
  }, [
    resolution,
    aspectRatio,
    layoutMode,
    shotCount,
    temperatureRaw,
    includeThoughts,
    seedRaw,
    seedAuto,
    selectedStyleIds,
    selectedPoseIds,
    selectedFaceIds,
    parameterCollapsed,
  ]);

  React.useEffect(() => {
    if (selectedStyleIds.length === 0) {
      setAutoStylePrompt("");
      lastAutoStyleSignatureRef.current = null;
      return;
    }
    const id = selectedStyleIds[0];
    const preset = (stylePresetsAll || []).find((p) => p.id === id);
    const signature = `${id}|${preset?.name ?? ""}|${preset?.learnStatus ?? ""}`;
    if (lastAutoStyleSignatureRef.current === signature) return;
    const base = buildAutoStylePrompt(stylePresetsAll || [], id, layoutMode);
    setAutoStylePrompt(base);
    lastAutoStyleSignatureRef.current = signature;
  }, [selectedStyleIds, stylePresetsAll, layoutMode]);

  React.useEffect(() => {
    if (selectedStyleIds.length > 0) {
      const id = selectedStyleIds[0];
      const variants: BackgroundVariant[] = ["warm", "cool", "cyber", "mint", "sunset"];
      const index = hashString(id) % variants.length;
      setBackgroundVariant(variants[index]);
      return;
    }
    setBackgroundVariant("default");
  }, [selectedStyleIds]);

  React.useEffect(() => {
    if (layoutMode !== "Grid") return;
    if (shotCount !== 1) setShotCount(1);
  }, [layoutMode, shotCount]);

  const pollOne = React.useCallback(async (taskId: string) => {
    try {
      const res = await api.get(`/tasks/${taskId}`);
      const task = res.data as TaskApi;
      setTasksById((prev) => {
        const prevStatus = prev[taskId]?.status;
        const next = { ...prev, [taskId]: task };
        // 任务进入终态后刷新余额：失败退款/成功扣费都能及时反映在 UI 上
        if (prevStatus !== task.status && (task.status === "COMPLETED" || task.status === "FAILED")) {
          requestCreditsRefresh();
          if (task.status === "COMPLETED") play('success');
          else play('error');
        }
        return next;
      });
    } catch {
      // ignore (auth / transient)
    }
  }, [play]);

  const flashNotice = React.useCallback((msg: string) => {
    const text = String(msg || "").trim();
    if (!text) return;
    setWorkbenchNotice(text);
    // 简单的“气泡提示”：不引入额外 toast 依赖，避免复杂度上升
    setTimeout(() => setWorkbenchNotice(""), 2800);
  }, []);

  const clearWorkbench = React.useCallback(() => {
    setGarmentItems([]);
    setSelectedStyleIds([]);
    setSelectedPoseIds([]);
    setSelectedFaceIds([]);
    setUserPrompt("");
    setSelectedSnippetId(null);
    setSnippetRemark("");
    setPromptUndoSnapshot(null);
    setPromptOptimizeOpen(false);
    setPromptOptimizeBusy(false);
    setPromptOptimizeResult("");
    setAutoStylePrompt("");
    setResolution("2K");
    setAspectRatio("3:4");
    setLayoutMode("Individual");
    setShotCount(1);
    setIncludeThoughts(false);
    setSeedRaw("");
    setSeedAuto(true);
    setTemperatureRaw("");
    flashNotice("已清空工作台");
  }, [flashNotice]);

  const onClearStyle = React.useCallback(() => setSelectedStyleIds([]), []);
  const onClearPoses = React.useCallback(() => setSelectedPoseIds([]), []);
  const onClearFace = React.useCallback(() => setSelectedFaceIds([]), []);

  const applyTaskToWorkbench = React.useCallback(
    (task: TaskApi) => {
      const nextPromptRaw = String(task?.directPrompt || task?.requirements || "").trim();
      const garmentPaths = Array.isArray(task?.garmentImagePaths) ? task.garmentImagePaths : [];
      const cosGarments = Array.from(
        new Set(
          garmentPaths
            .map((v) => String(v || "").trim())
            .filter(Boolean)
            .filter(isCosImageUrl),
        ),
      );

      const nextResolution = (task?.resolution || "2K") as "1K" | "2K" | "4K";
      const nextAspect = (task?.aspectRatio || "3:4") as "1:1" | "4:3" | "3:4" | "16:9" | "9:16" | "21:9";
      const nextLayoutMode = (task?.layout_mode || task?.layoutMode || "Individual") as "Individual" | "Grid";
      setResolution(nextResolution);
      setAspectRatio(nextAspect);
      setLayoutMode(nextLayoutMode);

      setIncludeThoughts(!!task?.directIncludeThoughts);
      if (typeof task?.directSeed === "number" && Number.isFinite(task.directSeed)) {
        setSeedRaw(String(Math.floor(task.directSeed)));
        setSeedAuto(false);
      } else {
        setSeedRaw("");
        setSeedAuto(true);
      }
      setTemperatureRaw(typeof task?.directTemperature === "number" ? String(task.directTemperature) : "");

      // 回填 presetIds：按“当时选中的预设ID”策略；若预设被删则忽略并提示
      const styleSet = new Set((stylePresetsAll || []).map((p) => p.id));
      const poseSet = new Set((posePresetsAll || []).map((p) => p.id));
      const faceSet = new Set((facePresetsAll || []).map((p) => p.id));

      const styleIdsRaw = Array.isArray(task?.directStylePresetIds) ? task.directStylePresetIds : [];
      const poseIdsRaw = Array.isArray(task?.directPosePresetIds) ? task.directPosePresetIds : [];
      const faceIdsRaw = Array.isArray(task?.directFacePresetIds) ? task.directFacePresetIds : [];

      const styleIds = styleIdsRaw.filter((id) => styleSet.has(id)).slice(0, 1);
      const poseIds = poseIdsRaw.filter((id) => poseSet.has(id)).slice(0, MAX_POSE_SELECT);
      const faceIds = faceIdsRaw.filter((id) => faceSet.has(id)).slice(0, MAX_FACE_SELECT);

      const missingStyle = styleIdsRaw.filter((id) => !styleSet.has(id));
      const missingPose = poseIdsRaw.filter((id) => !poseSet.has(id));
      const missingFace = faceIdsRaw.filter((id) => !faceSet.has(id));

      setSelectedStyleIds(styleIds);
      setSelectedPoseIds(poseIds);
      setSelectedFaceIds(faceIds);

      const rawShotCount = typeof task?.shotCount === "number" ? task.shotCount : 1;
      const nextShotCount = Math.max(1, Math.floor(rawShotCount));
      setShotCount(nextShotCount);

      const resolvedUserPrompt = stripAutoStylePrompt(nextPromptRaw);
      setUserPrompt(resolvedUserPrompt);
      setSelectedSnippetId(null);

      setGarmentItems(cosGarments.map(url => ({ id: url, type: 'url', url })));

      const garmentNotice = cosGarments.length
        ? `衣服图已回填（已接入 ${cosGarments.length} 张云端素材）`
        : garmentPaths.length
          ? "衣服图非 COS，需手动重传"
          : "任务未记录衣服图，请手动重传";

      const missingNotice = missingStyle.length || missingPose.length || missingFace.length
        ? `；但部分预设（${[
          missingStyle.length && "风格",
          missingPose.length && "姿势",
          missingFace.length && "人脸"
        ].filter(Boolean).join("/")}）已从库中删除，无法回填。`
        : "";

      flashNotice(`设置已推送到工作区；${garmentNotice}${missingNotice}`);
    },
    [facePresetsAll, posePresetsAll, stylePresetsAll, flashNotice],
  );

  const reuseFromTaskId = React.useCallback(
    async (taskId: string) => {
      const cached = tasksById[taskId];
      if (cached) {
        applyTaskToWorkbench(cached);
        return;
      }
      try {
        const res = await api.get(`/tasks/${taskId}`);
        const task = res.data as TaskApi;
        setTasksById((prev) => ({ ...prev, [taskId]: task }));
        applyTaskToWorkbench(task);
      } catch {
        flashNotice("拉入失败：任务信息未加载（可能需要重新登录或稍后重试）");
      }
    },
    [tasksById, applyTaskToWorkbench, flashNotice],
  );

  const loadTaskDetail = React.useCallback(async (taskId: string) => {
    const cached = tasksById[taskId];
    if (cached) return cached;
    const res = await api.get(`/tasks/${taskId}`);
    const task = res.data as TaskApi;
    setTasksById((prev) => ({ ...prev, [taskId]: task }));
    return task;
  }, [tasksById]);

  const handleViewDetail = React.useCallback(async (task: Task) => {
    setTaskDetailOpen(true);
    setTaskDetailLoading(true);
    setTaskDetailError(null);
    try {
      const detail = await loadTaskDetail(task.id);
      setTaskDetail(detail);
    } catch (e: unknown) {
      setTaskDetail(null);
      setTaskDetailError(getErrorMessage(e, "任务详情加载失败"));
    } finally {
      setTaskDetailLoading(false);
    }
  }, [loadTaskDetail]);

  const retryQueueTask = React.useCallback(
    async (taskId: string) => {
      if (!taskId) return;
      if (queueRetryingTaskId) return;
      setQueueRetryingTaskId(taskId);
      try {
        const res = await directRegenerateTask(taskId);
        const task = res as TaskApi;
        if (task?.id) {
          setTasksById((prev) => ({ ...prev, [task.id]: task }));
        }
        await pollOne(taskId);
        flashNotice("已提交重新生成");
      } catch (e: unknown) {
        console.error(e);
        alert(getErrorMessage(e, "重新生成失败"));
      } finally {
        setQueueRetryingTaskId((prev) => (prev === taskId ? null : prev));
      }
    },
    [queueRetryingTaskId, pollOne, flashNotice],
  );

  const toggleQueueFavorite = React.useCallback(async (taskId: string) => {
    if (!taskId) return;
    const current = tasksById[taskId];
    const nextFavorite = current ? !current.favoriteAt : !favoriteTaskIds.includes(taskId);
    try {
      const updated = await toggleTaskFavorite(taskId, nextFavorite);
      const updatedTask = updated as TaskApi;
      setTasksById((prev) => ({ ...prev, [taskId]: updatedTask }));
      setFavoriteTaskIds((prev) => {
        const next = new Set(prev);
        if (updatedTask?.favoriteAt) next.add(taskId);
        else next.delete(taskId);
        return Array.from(next);
      });
      setFavoriteTasks((prev) => {
        if (!updatedTask) return prev;
        if (updatedTask.favoriteAt) {
          const exists = prev.some((task) => task.id === taskId);
          if (exists) {
            return prev.map((task) => (task.id === taskId ? updatedTask : task));
          }
          return [updatedTask, ...prev];
        }
        return prev.filter((task) => task.id !== taskId);
      });
      flashNotice(nextFavorite ? "已收藏" : "已取消收藏");
    } catch (e: unknown) {
      console.error(e);
      flashNotice(getErrorMessage(e, "收藏操作失败"));
    }
  }, [tasksById, favoriteTaskIds, flashNotice]);

  React.useEffect(() => {
    if (!isAuthenticated) return;
    if (!queue.length) return;

    const activeQueue = queue.filter((q) => {
      const task = tasksById[q.taskId];
      if (!task) return true;
      return task.status !== "COMPLETED" && task.status !== "FAILED";
    });
    if (!activeQueue.length) return;

    let alive = true;
    const tick = async () => {
      if (!alive) return;
      await Promise.all(activeQueue.map((q) => pollOne(q.taskId)));
    };

    void tick();
    const t = setInterval(() => void tick(), POLL_INTERVAL_MS);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, [isAuthenticated, queue, tasksById, pollOne]);

  const addToQueue = (taskId: string, createdAt: number) => {
    setQueue((prev) => {
      const exists = prev.some((item) => item.taskId === taskId);
      const next = [{ taskId, createdAt }, ...prev.filter((x) => x.taskId !== taskId)];
      const limit = queueViewAll ? DIRECT_QUEUE_MAX_LIMIT : DIRECT_QUEUE_PAGE_SIZE;
      if (!exists) {
        setQueueTotal((total) => total + 1);
      }
      return next.slice(0, limit);
    });
  };

  const pickTaskResultUrl = React.useCallback((task?: TaskApi) => {
    const direct = String(task?.resultImages?.[0] || "").trim();
    if (direct) return toImgSrc(direct);
    const shots = Array.isArray(task?.shots) ? task.shots : [];
    const firstShot = shots.find((shot) => {
      const raw = String(shot?.imageUrl || shot?.imagePath || "").trim();
      return !!raw;
    });
    const raw = String(firstShot?.imageUrl || firstShot?.imagePath || "").trim();
    return raw ? toImgSrc(raw) : undefined;
  }, []);

  const buildTaskCard = React.useCallback(
    (task: TaskApi | undefined, fallback: { id: string; createdAt: number }) => ({
      id: task?.id ?? fallback.id,
      status: task?.status || "PENDING",
      createdAt: task?.createdAt || fallback.createdAt,
      progress: task?.progress,
      resultUrl: pickTaskResultUrl(task),
      prompt: task?.directPrompt || task?.requirements || "正在生成任务...",
    }),
    [pickTaskResultUrl],
  );

  const buildLightboxImages = React.useCallback((task: TaskApi | undefined): LightboxItem[] => {
    if (!task) return [];
    const shots = Array.isArray(task.shots) ? task.shots : [];
    const shotImages = shots
      .map((shot, idx) => {
        const raw = String(shot?.imageUrl || shot?.imagePath || "").trim();
        if (!raw) return null;
        const id = String(shot?.id || shot?.shotCode || `${task.id}-${idx + 1}`);
        return {
          id,
          url: toImgSrc(raw),
          prompt: shot?.promptEn || shot?.prompt,
        };
      })
      .filter(Boolean) as LightboxItem[];
    if (shotImages.length) return shotImages;

    const resultImages = Array.isArray(task.resultImages) ? task.resultImages : [];
    return resultImages
      .map((raw, idx) => {
        const url = toImgSrc(String(raw || "").trim());
        if (!url) return null;
        return { id: `${task.id}-${idx + 1}`, url };
      })
      .filter(Boolean) as LightboxItem[];
  }, []);

  const queueTaskCards = React.useMemo(
    () => queue.map((item) => buildTaskCard(tasksById[item.taskId], { id: item.taskId, createdAt: item.createdAt })),
    [queue, tasksById, buildTaskCard],
  );

  const favoriteTaskCards = React.useMemo(() => {
    const source = favoriteTasks.length
      ? favoriteTasks
      : favoriteTaskIds
          .map((id) => tasksById[id])
          .filter(Boolean) as TaskApi[];
    return source.map((task) => buildTaskCard(task, { id: task.id, createdAt: task.createdAt }));
  }, [favoriteTasks, favoriteTaskIds, tasksById, buildTaskCard]);

  const togglePoseSelect = (id: string) => {
    setSelectedPoseIds((prev) => {
      const exists = prev.includes(id);
      if (exists) return prev.filter((x) => x !== id);
      if (prev.length >= MAX_POSE_SELECT) {
        alert(`姿势最多选择 ${MAX_POSE_SELECT} 个`);
        return prev;
      }
      return [...prev, id];
    });
  };

  const toggleFaceSelect = (id: string) => {
    setSelectedFaceIds((prev) => {
      const exists = prev.includes(id);
      if (exists) return prev.filter((x) => x !== id);
      if (prev.length >= MAX_FACE_SELECT) {
        alert(`人脸/模特最多选择 ${MAX_FACE_SELECT} 个`);
        return prev;
      }
      return [...prev, id];
    });
  };

  const onLearnStyle = async (files: File[]) => {
    if (!files.length) return;
    try {
      const res = await learnStyle(files);
      const failed = res?.success === false || res?.preset?.learnStatus === "FAILED";
      if (failed) {
        flashNotice("风格学习失败：模型返回为空，请打开卡片重新学习");
      }
    } catch (e: unknown) {
      console.error(e);
      flashNotice(getErrorMessage(e, "风格学习失败，请稍后重试"));
    } finally {
      await fetchStylePresets();
    }
  };

  const onLearnPose = async (file: File) => {
    if (!file) return;
    try {
      const res = await learnPose(file);
      const failed = res?.success === false || res?.preset?.learnStatus === "FAILED";
      if (failed) {
        flashNotice("姿势学习失败：模型返回为空，请打开卡片重新学习");
      }
    } catch (e: unknown) {
      console.error(e);
      flashNotice(getErrorMessage(e, "姿势学习失败，请稍后重试"));
    } finally {
      await fetchPosePresets();
    }
  };



  const savePromptSnippet = async (nameOverride?: string) => {
    const text = userPrompt.trim();
    if (!text) {
      alert("请先填写用户补充内容");
      return;
    }

    setPromptSnippetsBusy("create");
    try {
      // 1. 生成并保存
      const res = await createPromptSnippet({ text: text, name: nameOverride });
      const created = res?.status === 201 || res?.data ? (res.data as PromptSnippet) : null;
      if (created) {
        setPromptSnippets((prev) => [created, ...prev]);
        setSelectedSnippetId(created.id);
        setSnippetRemark(""); // 清空输入框
        flashNotice("已保存为常用词条");
      } else {
        throw new Error("保存失败：未返回数据");
      }
    } catch (e: unknown) {
      console.error(e);
      flashNotice(getErrorMessage(e, "保存失败"));
    } finally {
      setPromptSnippetsBusy(null);
    }
  };

  const handleDeleteSnippet = async () => {
    if (!selectedSnippetId) return;
    setPromptSnippetsBusy("delete");
    try {
      await deletePromptSnippet(selectedSnippetId);
      setPromptSnippets((prev) => prev.filter((x) => x.id !== selectedSnippetId));
      setSelectedSnippetId(null);
      flashNotice("已删除该词条");
    } catch (e: unknown) {
      console.error(e);
      flashNotice(getErrorMessage(e, "删除失败"));
    } finally {
      setPromptSnippetsBusy(null);
    }
  };

  const handleGenerateTask = async () => {
    if (!userPrompt.trim()) {
      alert("请填写提示词");
      return;
    }

    setCreating(true);
    try {
      if (garmentItems.length === 0) {
        const confirmNoGarment = window.confirm("当前未上传衣服图。是否继续生成？（通常需要衣服图）");
        if (!confirmNoGarment) {
          setCreating(false);
          return;
        }
      }
      play('start');

      // 1. Separate items for upload
      const fileItems = garmentItems.filter(i => i.type === 'file' && i.file).map(i => i.file!);

      // 2. Upload files
      const uploadedUrls = await uploadGarmentFiles(fileItems);

      // 3. Reconstruct ordered list
      let uploadPtr = 0;
      const allGarments = garmentItems.map(item => {
        if (item.type === 'url') return item.url!;
        if (item.type === 'file') return uploadedUrls[uploadPtr++] || "";
        return "";
      }).filter(Boolean).slice(0, MAX_GARMENT_IMAGES);

      const finalPrompt = appendModeHint(
        `${autoStylePrompt ? `${autoStylePrompt}\n` : ""}${userPrompt.trim()}`,
        layoutMode,
      );

      const res = await createDirectTaskFromUrls({ garmentUrls: allGarments, prompt: finalPrompt, shotCount, layoutMode, resolution, aspectRatio, stylePresetIds: selectedStyleIds.slice(0, 1), posePresetIds: selectedPoseIds.slice(0, MAX_POSE_SELECT), facePresetIds: selectedFaceIds.slice(0, MAX_FACE_SELECT), includeThoughts, seed: seedAuto ? undefined : parseInt(seedRaw || "0", 10), temperature: temperatureRaw ? parseFloat(temperatureRaw) : undefined });
      const taskId = res?.task_id ?? res?.taskId ?? res?.id ?? res?.task?.id;
      if (taskId) {
        addToQueue(taskId, Date.now());
        pollOne(taskId); // 立即查一次
        flashNotice("任务已提交，请在右侧排队列表查看");
        // Don't auto-clear for better UX, user can clear manually
      } else {
        throw new Error("API 未返回 Task ID");
      }
    } catch (e: unknown) {
      console.error(e);
      alert(getErrorMessage(e, "任务提交失败"));
    } finally {
      setCreating(false);
    }
  };

  // Keyboard Shortcuts
  useStudioShortcuts({
    onGenerate: handleGenerateTask,
    onToggleLeftPanel: () => setShowLeftPanel((prev) => !prev),
    onToggleRightPanel: () => setShowRightPanel((prev) => !prev),
    onClosePanels: () => {
      setShowLeftPanel(false);
      setShowRightPanel(false);
      setPromptOptimizeOpen(false);
    },
    onUndoOptimize: handleUndoOptimize,
    canUndoOptimize: promptUndoSnapshot !== null,
  });

  // Snapshot Logic
  const getCurrentState = React.useCallback((): WorkspaceSnapshotPayload => {
    return {
      selectedStyleIds,
      selectedPoseIds,
      selectedFaceIds,
      userPrompt,
      garmentItems, // Use unifying items
      shotCount,
      layoutMode,
      resolution,
      aspectRatio,
      seedRaw,
      seedAuto,
      includeThoughts,
      temperatureRaw,
    };
  }, [
    selectedStyleIds,
    selectedPoseIds,
    selectedFaceIds,
    userPrompt,
    garmentItems,
    shotCount,
    layoutMode,
    resolution,
    aspectRatio,
    seedRaw,
    seedAuto,
    includeThoughts,
    temperatureRaw,
  ]);

  const handleRestoreState = React.useCallback((data: WorkspaceSnapshotPayload) => {
    if (!data) return;
    if (data.selectedStyleIds) setSelectedStyleIds(data.selectedStyleIds);
    if (data.selectedPoseIds) setSelectedPoseIds(data.selectedPoseIds);
    if (data.selectedFaceIds) setSelectedFaceIds(data.selectedFaceIds);
    if (typeof data.userPrompt === 'string') setUserPrompt(data.userPrompt);

    // Restore garments
    if (data.garmentItems) {
      // Need to ensure types are correct? Snapshot usually stores POJOs.
      // Files can't be stored in localStorage comfortably.
      // WorkspaceSnapshot hook uses JSON.stringify.
      // Files are lost on persist. Only URLs persist.
      // We should warn or handle files -> maybe we can't persist files.
      // For now, restore what we can. Ideally we only snapshot URLs.
      // If snapshot has 'file', it will likely be broken on restore unless we ignore it or it was converted to base64 (too heavy).
      // Best practice: Only persist URLs. Filter out files or warn.
      // For this refactor, let's assume we filter.
      const validItems = data.garmentItems.filter((item) => item.type === "url");
      setGarmentItems(validItems);
    } else if (data.garmentAssetUrls) {
      // Legacy snapshot support
      const legacyUrls = data.garmentAssetUrls as string[];
      setGarmentItems(legacyUrls.map(url => ({ id: url, type: 'url', url })));
    }

    if (data.shotCount) setShotCount(data.shotCount);
    if (data.layoutMode) setLayoutMode(data.layoutMode);
    if (data.resolution) setResolution(data.resolution);
    if (data.aspectRatio && isAspectRatio(data.aspectRatio)) setAspectRatio(data.aspectRatio);
    if (data.seedRaw) setSeedRaw(data.seedRaw);
    if (typeof data.seedAuto === 'boolean') setSeedAuto(data.seedAuto);
    if (typeof data.includeThoughts === "boolean") setIncludeThoughts(data.includeThoughts);
    if (typeof data.temperatureRaw === "string") setTemperatureRaw(data.temperatureRaw);
    flashNotice("已恢复工作区状态");
  }, [flashNotice]);

  const LayoutModeToggle = (
    <div className="flex bg-slate-100/80 p-0.5 rounded-lg border border-slate-200/50 shadow-inner">
      <button
        onClick={() => setLayoutMode("Individual")}
        className={cn(
          "px-3 py-1 text-[11px] font-bold rounded-md transition-all duration-200",
          layoutMode === "Individual"
            ? "bg-white text-indigo-600 shadow-sm ring-1 ring-slate-200"
            : "text-slate-500 hover:text-slate-700"
        )}
      >
        单图模式
      </button>
      <button
        onClick={() => setLayoutMode("Grid")}
        className={cn(
          "px-3 py-1 text-[11px] font-bold rounded-md transition-all duration-200",
          layoutMode === "Grid"
            ? "bg-white text-indigo-600 shadow-sm ring-1 ring-slate-200"
            : "text-slate-500 hover:text-slate-700"
        )}
      >
        拼图模式
      </button>
    </div>
  );

  const detailLayoutMode = taskDetail?.layout_mode || taskDetail?.layoutMode;
  const detailPrompt = String(taskDetail?.directPrompt || taskDetail?.requirements || "").trim();
  const detailSeed = typeof taskDetail?.directSeed === "number" && Number.isFinite(taskDetail.directSeed)
    ? String(Math.floor(taskDetail.directSeed))
    : "随机";
  const detailTemperature = typeof taskDetail?.directTemperature === "number" && Number.isFinite(taskDetail.directTemperature)
    ? taskDetail.directTemperature.toFixed(2)
    : "默认";
  const detailRows = [
    { label: "状态", value: taskDetail?.status || "-" },
    { label: "创建时间", value: taskDetail?.createdAt ? new Date(taskDetail.createdAt).toLocaleString() : "-" },
    { label: "提示词", value: detailPrompt || "-" },
    { label: "模式", value: detailLayoutMode === "Grid" ? "拼图模式" : detailLayoutMode === "Individual" ? "单图模式" : "-" },
    { label: "生成数量", value: typeof taskDetail?.shotCount === "number" ? String(taskDetail.shotCount) : "-" },
    { label: "分辨率", value: taskDetail?.resolution || "-" },
    { label: "画面比例", value: taskDetail?.aspectRatio || "-" },
    { label: "Seed", value: detailSeed },
    { label: "创造性", value: detailTemperature },
    { label: "思维链", value: taskDetail?.directIncludeThoughts === undefined ? "-" : (taskDetail.directIncludeThoughts ? "是" : "否") },
    { label: "风格数量", value: String(taskDetail?.directStylePresetIds?.length ?? 0) },
    { label: "姿势数量", value: String(taskDetail?.directPosePresetIds?.length ?? 0) },
    { label: "人脸数量", value: String(taskDetail?.directFacePresetIds?.length ?? 0) },
    { label: "衣服图数量", value: String(taskDetail?.garmentImagePaths?.length ?? 0) },
  ];

  return (
    <>
      <FluidBackground key={backgroundVariant} variant={backgroundVariant} />

      <StudioLayout
        header={
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2 mr-4 border-r border-slate-200 pr-4 max-sm:hidden">
              <div className="text-[10px] text-slate-400 font-medium">当前余额:</div>
              <div className="flex items-center gap-1 bg-amber-50 px-2 py-0.5 rounded-full border border-amber-100">
                <div className="w-1.5 h-1.5 rounded-full bg-amber-400" />
                <span className="text-[11px] font-bold text-amber-700">{balance}</span>
              </div>
            </div>
          </div>
        }
        // Left Panel: Resource Explorer
        resourcePanel={
          <ResourcePanel
            isOpen={showLeftPanel}
            onClose={() => setShowLeftPanel(false)}
            // Snapshot Manager
            headerActions={
              <WorkspaceSnapshotManager
                getCurrentState={getCurrentState}
                onRestoreState={handleRestoreState}
              />
            }
            // Data
            stylePresets={stylePresetsAll}
            posePresets={posePresetsAll}
            facePresets={facePresetsAll}
            collections={collections}
            // Selection
            selectedStyleIds={selectedStyleIds}
            setSelectedStyleIds={setSelectedStyleIds}
            selectedPoseIds={selectedPoseIds}
            togglePoseSelect={togglePoseSelect}
            selectedFaceIds={selectedFaceIds}
            toggleFaceSelect={toggleFaceSelect}
            // Actions
            onDeleteStyle={deleteStylePreset}
            onDeletePose={deletePosePreset}
            onDeleteFace={deleteFacePreset}
            onUpdateStyle={updateStylePreset}
            onUpdatePose={updatePosePreset}
            onUpdateFace={updateFacePreset}
            onRelearnStyle={relearnStylePreset}
            onRelearnPose={relearnPosePreset}
            onBatchUpdateMeta={handleBatchUpdateMeta}
            onRefreshKind={refreshPresetKind}
            onCreateCollection={handleCreateCollection}
            onRenameCollection={handleRenameCollection}
            onDeleteCollection={handleDeleteCollection}
            onUploadStyle={onLearnStyle}
            onUploadPose={onLearnPose}
          />
        }

        // Center Panel: Canvas
        canvas={
          <StudioCanvas
            // Layout Control
            leftPanelOpen={showLeftPanel}
            rightPanelOpen={showRightPanel}
            onToggleLeftPanel={() => setShowLeftPanel(!showLeftPanel)}
            onToggleRightPanel={() => setShowRightPanel(!showRightPanel)}

            // Garment Data
            garmentItems={garmentItems}
            addGarmentFiles={addGarmentFiles}
            removeGarmentItem={removeGarmentItem}
            onReorderGarments={reorderGarmentItems}
            onClearGarments={clearGarmentImages}

            // User Assets
            userAssets={userAssets}
            userAssetsLoading={userAssetsLoading}
            hasMoreUserAssets={userAssetsHasMore}
            onLoadMoreUserAssets={handleLoadMoreUserAssets}
            onSelectUserAsset={(url) => {
              if (garmentItems.length >= MAX_GARMENT_IMAGES) {
                alert(`最多只能上传 ${MAX_GARMENT_IMAGES} 张衣服图`);
                return;
              }
              setGarmentItems(prev => [...prev, { id: url, type: 'url', url }]);
              flashNotice("已添加到衣服图列表");
            }}

            // Recipe Bar
            styleLabel={activeStyleName}
            poseCount={selectedPoseIds.length}
            faceRemark={selectedFaceIds.length > 0 ? `${selectedFaceIds.length} faces selected` : undefined}
            onClearStyle={onClearStyle}
            onClearPoses={onClearPoses}
            onClearFace={onClearFace}
            onOptimizePrompt={handleOptimizePrompt}
            onUndoOptimize={handleUndoOptimize}
            canUndoOptimize={promptUndoSnapshot !== null}
            optimizeBusy={promptOptimizeBusy}
            // Prompt Engine
            prompt={userPrompt}
            setPrompt={handlePromptChange}
            baseStyle={activeStyleName}
            basePrompt={activeStylePrompt}
            snippets={promptSnippets}
            snippetsLoading={promptSnippetsLoading}
            selectedSnippetId={selectedSnippetId}
            onSelectSnippet={setSelectedSnippetId}
            onSaveSnippet={savePromptSnippet}
            onDeleteSnippet={handleDeleteSnippet}
            snippetRemark={snippetRemark}
            setSnippetRemark={setSnippetRemark}
            promptBusy={promptSnippetsBusy}

            onClearWorkbench={clearWorkbench}
            hasWorkbenchState={hasWorkbenchState}

            // Generate
            onGenerate={handleGenerateTask}
            generating={creating}
            creditCost={estimatedCreditsCost}
            balance={balance}
            creditsLoaded={creditsLoaded}
          />
        }

        // Right Panel: Control Hub
        controlHub={
          <ControlHub
            isOpen={showRightPanel}
            onClose={() => setShowRightPanel(false)}
            headerAction={LayoutModeToggle}
            queueContent={
              <QueueSection
                queueTasks={queueTaskCards}
                favoriteTasks={favoriteTaskCards}
                onReuseTask={reuseFromTaskId}
                onViewDetail={handleViewDetail}
                onClearCompleted={() => {
                  setQueue(prev => prev.filter(q => {
                    const t = tasksById[q.taskId];
                    return !t || (t.status !== "COMPLETED" && t.status !== "FAILED");
                  }));
                }}
                onDeleteTask={(id) => {
                  setQueue(prev => prev.filter(q => q.taskId !== id));
                }}
                onRetryTask={retryQueueTask}
                favoriteIds={favoriteTaskIds}
                onToggleFavorite={toggleQueueFavorite}
                queueTotal={queueTotal}
                queueBaseLimit={DIRECT_QUEUE_PAGE_SIZE}
                showAll={queueViewAll}
                onToggleShowAll={() => setQueueViewAll((prev) => !prev)}
                tab={queueTab}
                onTabChange={setQueueTab}
                currentTaskId={null}
                onImageClick={async (taskId) => {
                  if (!taskId) return;
                  lightboxRequestRef.current = taskId;
                  setLightboxTaskId(taskId);
                  setLightboxInitialIndex(0);
                  try {
                    const detail = await loadTaskDetail(taskId);
                    if (lightboxRequestRef.current !== taskId) return;
                    const images = buildLightboxImages(detail);
                    if (images.length) {
                      setLightboxImages(images);
                      setLightboxOpen(true);
                      return;
                    }
                  } catch (error) {
                    if (lightboxRequestRef.current !== taskId) return;
                    console.error(error);
                  }
                  if (lightboxRequestRef.current !== taskId) return;
                  const fallback = buildLightboxImages(tasksById[taskId]);
                  if (fallback.length) {
                    setLightboxImages(fallback);
                    setLightboxOpen(true);
                    return;
                  }
                  flashNotice("暂无可预览图片");
                }}
              />
            }
          >
            <ParameterSection
              seed={seedAuto ? 0 : Number(seedRaw)}
              setSeed={(s) => { setSeedRaw(String(s)); setSeedAuto(false); }}
              randomSeed={seedAuto}
              setRandomSeed={setSeedAuto}
              aspectRatio={aspectRatio}
              setAspectRatio={(value) => {
                if (isAspectRatio(value)) {
                  setAspectRatio(value);
                }
              }}
              outputCount={shotCount}
              setOutputCount={setShotCount}
              resolution={resolution}
              setResolution={setResolution}
              includeThoughts={includeThoughts}
              setIncludeThoughts={setIncludeThoughts}
              temperature={temperatureRaw}
              setTemperature={setTemperatureRaw}
              collapsed={parameterCollapsed}
              onCollapsedChange={setParameterCollapsed}
            />
          </ControlHub >
        }
      />

      {/* Overlays / Dialogs */}
      <Dialog
        open={taskDetailOpen}
        onOpenChange={(open) => {
          setTaskDetailOpen(open);
          if (!open) {
            setTaskDetail(null);
            setTaskDetailError(null);
            setTaskDetailLoading(false);
          }
        }}
      >
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>任务详情</DialogTitle>
          </DialogHeader>
          {taskDetailLoading && (
            <div className="py-6 text-sm text-slate-500 animate-pulse">加载中...</div>
          )}
          {!taskDetailLoading && taskDetailError && (
            <div className="py-6 text-sm text-rose-500">{taskDetailError}</div>
          )}
          {!taskDetailLoading && !taskDetailError && taskDetail && (
            <div className="space-y-3">
              {detailRows.map((row) => (
                <div key={row.label} className="flex gap-3 text-sm">
                  <div className="w-24 shrink-0 text-slate-500">{row.label}</div>
                  <div className={cn("text-slate-800", row.label === "提示词" && "whitespace-pre-wrap")}>
                    {row.value}
                  </div>
                </div>
              ))}
            </div>
          )}
          {!taskDetailLoading && !taskDetailError && !taskDetail && (
            <div className="py-6 text-sm text-slate-500">暂无任务详情</div>
          )}
        </DialogContent>
      </Dialog>

      <ImageLightbox
        open={lightboxOpen}
        onOpenChange={setLightboxOpen}
        images={lightboxImages}
        initialIndex={lightboxInitialIndex}
        onRegenerate={() => {
          if (lightboxTaskId) retryQueueTask(lightboxTaskId);
        }}
        isRegenerating={!!queueRetryingTaskId}
        watermarkTaskId={lightboxTaskId}
      />

      <Dialog open={promptOptimizeOpen} onOpenChange={setPromptOptimizeOpen}>
        <DialogContent className="max-w-2xl bg-white/90 backdrop-blur-xl border-white/20 p-6 rounded-2xl shadow-2xl">
          <DialogHeader>
            <DialogTitle>
              <span className="flex items-center gap-2">
                <Sparkles className="w-5 h-5 text-indigo-500" />
                AI 提示词优化结果
              </span>
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="p-4 bg-indigo-50/50 rounded-xl border border-indigo-100/50 text-sm text-slate-700 leading-relaxed overflow-y-auto max-h-[300px]">
              {promptOptimizeResult}
            </div>
            <div className="flex gap-2 justify-end">
              <Button variant="ghost" className="text-slate-500" onClick={() => setPromptOptimizeOpen(false)}>取消</Button>
              <Button variant="outline" className="border-indigo-200 text-indigo-600 hover:bg-indigo-50" onClick={() => applyOptimizedPrompt("append")}>追加到末尾</Button>
              <Button className="bg-gradient-to-r from-indigo-600 to-violet-600 text-white shadow-lg shadow-indigo-200" onClick={() => applyOptimizedPrompt("replace")}>直接替换</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Notice Toast */}
      {
        workbenchNotice && (
          <div className="fixed top-20 left-1/2 -translate-x-1/2 z-[100] bg-black/80 text-white px-4 py-2 rounded-full text-sm animate-in fade-in zoom-in slide-in-from-top-4">
            {workbenchNotice}
          </div>
        )
      }
    </>
  );
}
