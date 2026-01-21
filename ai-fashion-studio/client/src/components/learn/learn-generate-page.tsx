"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { UploadCloud, Loader2, UserRound } from "lucide-react";

import api from "@/lib/api";
import {
  createDirectTaskFromUrls,
  createPromptSnippet,
  deletePromptSnippet,
  directMessageTask,
  directRegenerateTask,
  learnPose,
  learnStyle,
  listPromptSnippets,
} from "@/lib/api";
import { useAuth } from "@/hooks/use-auth";
import { calculateRequiredCredits, requestCreditsRefresh, useCredits } from "@/hooks/use-credits";
import { uploadFileToCosWithMeta, type CosUploadResult } from "@/lib/cos";
import { registerUserAssets } from "@/lib/user-assets";

import { useStylePresetStore, type StylePreset } from "@/store/style-preset-store";
import { usePosePresetStore } from "@/store/pose-preset-store";
import { FacePresetSelector } from "@/components/face-preset-selector";
import { useFacePresetStore } from "@/store/face-preset-store";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ImageLightbox, type LightboxItem } from "@/components/image-lightbox";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

import { QueueSidebar } from "@/components/learn/queue-sidebar";
import { AssetLibrary } from "@/components/learn/asset-library";
import { AdvancedSettings } from "@/components/learn/advanced-settings";
import { toImgSrc } from "@/components/learn/learn-utils";
import { GlassPanel } from "@/components/learn/glass-panel";
import { FluidBackground } from "@/components/learn/layout/fluid-background";
import { CreationStage } from "@/components/learn/creation-stage";
import { UserAssetLibraryDialog } from "@/components/user-asset-library-dialog";
import type { PromptSnippet, QueueItem, TaskApi } from "@/components/learn/types";
import { cn } from "@/lib/utils";

const MAX_GARMENT_IMAGES = 6;
const MAX_STYLE_LEARN_IMAGES = 5;
const MAX_POSE_SELECT = 4;
const MAX_FACE_SELECT = 3;
const POLL_INTERVAL_MS = 1500;
const GRID_PROMPT_LINE = "If multiple poses are selected, output ONE contact sheet with one panel per pose (max 4 panels). Same model + same garment across panels.";
const SINGLE_PROMPT_LINE = "只能有一个人、一个姿势。不要拼图/拼接/多宫格/多分屏。";

const STORAGE_QUEUE_KEY = "afs:learn:queue:v1";
type BackgroundVariant = "default" | "warm" | "cool" | "cyber" | "mint" | "sunset";

function useObjectUrls(files: File[]) {
  const [urls, setUrls] = React.useState<string[]>([]);

  React.useEffect(() => {
    const next = files.map((f) => URL.createObjectURL(f));
    setUrls(next);
    return () => {
      for (const u of next) URL.revokeObjectURL(u);
    };
  }, [files]);

  return urls;
}

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
  const router = useRouter();
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
  const [faceDialogOpen, setFaceDialogOpen] = React.useState(false);

  const [styleLearning, setStyleLearning] = React.useState(false);
  const [poseLearning, setPoseLearning] = React.useState(false);

  const [garmentFiles, setGarmentFiles] = React.useState<File[]>([]);
  const garmentUrls = useObjectUrls(garmentFiles);
  const [garmentAssetUrls, setGarmentAssetUrls] = React.useState<string[]>([]);
  const [assetDialogOpen, setAssetDialogOpen] = React.useState(false);
  // Dual prompt system: auto-filled style prompt + user custom prompt
  const [autoStylePrompt, setAutoStylePrompt] = React.useState<string>(""); // Auto-filled from style selection
  const [userPrompt, setUserPrompt] = React.useState<string>(""); // User's custom additions
  const lastAutoStyleSignatureRef = React.useRef<string | null>(null);
  const [promptSnippets, setPromptSnippets] = React.useState<PromptSnippet[]>([]);
  const [promptSnippetsLoading, setPromptSnippetsLoading] = React.useState(false);
  const [promptSnippetsBusy, setPromptSnippetsBusy] = React.useState<"create" | "delete" | null>(null);
  const [selectedSnippetId, setSelectedSnippetId] = React.useState<string | null>(null);
  const [snippetRemark, setSnippetRemark] = React.useState<string>("");

  const [resolution, setResolution] = React.useState<"1K" | "2K" | "4K">("2K");
  const [aspectRatio, setAspectRatio] = React.useState<"1:1" | "4:3" | "3:4" | "16:9" | "9:16" | "21:9">("3:4");
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
  const [showLeftPanel, setShowLeftPanel] = React.useState(false);
  const [showRightPanel, setShowRightPanel] = React.useState(false);
  const [workbenchNotice, setWorkbenchNotice] = React.useState<string>("");

  const [lightboxOpen, setLightboxOpen] = React.useState(false);
  const [lightboxImages, setLightboxImages] = React.useState<LightboxItem[]>([]);
  const [lightboxInitialIndex, setLightboxInitialIndex] = React.useState(0);
  const [lightboxTaskId, setLightboxTaskId] = React.useState<string | undefined>(undefined);
  const [lightboxRegenerating, setLightboxRegenerating] = React.useState(false);
  const [chatMessage, setChatMessage] = React.useState<string>("");

  // New Interactive States for Redesign
  const [isFocused, setIsFocused] = React.useState(false);
  const [backgroundVariant, setBackgroundVariant] = React.useState<BackgroundVariant>("default");
  const isOverlayOpen = showLeftPanel || showRightPanel;

  // 口径对齐后端：1K=1，2K=2，4K=4
  const estimatedCreditsCost = calculateRequiredCredits({
    shotCount,
    layoutMode,
    resolution,
  });
  const canClearWorkbench = !!(
    garmentFiles.length ||
    garmentAssetUrls.length ||
    selectedStyleIds.length ||
    selectedPoseIds.length ||
    selectedFaceIds.length ||
    userPrompt.trim() ||
    selectedSnippetId ||
    snippetRemark.trim()
  );
  const activeStyleName =
    selectedStyleIds.length > 0
      ? String((stylePresetsAll || []).find((p) => p.id === selectedStyleIds[0])?.name || "").trim()
      : "";

  const styleInputRef = React.useRef<HTMLInputElement>(null);
  const poseInputRef = React.useRef<HTMLInputElement>(null);

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
  }, [isAuthenticated, loadPromptSnippets]);

  React.useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const raw = localStorage.getItem(STORAGE_QUEUE_KEY);
      const parsed = raw ? (JSON.parse(raw) as QueueItem[]) : [];
      setQueue(Array.isArray(parsed) ? parsed.slice(0, 30) : []);
    } catch {
      setQueue([]);
    }
  }, []);

  React.useEffect(() => {
    if (typeof window === "undefined") return;
    localStorage.setItem(STORAGE_QUEUE_KEY, JSON.stringify(queue.slice(0, 30)));
  }, [queue]);

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
      const variants: BackgroundVariant[] = ["default", "warm", "cool", "cyber", "mint", "sunset"];
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
        }
        return next;
      });
    } catch {
      // ignore (auth / transient)
    }
  }, []);

  const flashNotice = React.useCallback((msg: string) => {
    const text = String(msg || "").trim();
    if (!text) return;
    setWorkbenchNotice(text);
    // 简单的“气泡提示”：不引入额外 toast 依赖，避免复杂度上升
    setTimeout(() => setWorkbenchNotice(""), 2800);
  }, []);

  const clearWorkbench = React.useCallback(() => {
    setGarmentFiles([]);
    setGarmentAssetUrls([]);
    setSelectedStyleIds([]);
    setSelectedPoseIds([]);
    setSelectedFaceIds([]);
    setUserPrompt("");
    setSelectedSnippetId(null);
    setSnippetRemark("");
    flashNotice("已清空工作台");
  }, [flashNotice]);

  const applyTaskToWorkbench = React.useCallback(
    (task: TaskApi) => {
      const nextPromptRaw = String(task?.directPrompt || task?.requirements || "").trim();

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

      if (missingStyle.length || missingPose.length || missingFace.length) {
        flashNotice(
          `已回填设置；但有预设已不存在：` +
          `${missingStyle.length ? `风格×${missingStyle.length} ` : ""}` +
          `${missingPose.length ? `姿势×${missingPose.length} ` : ""}` +
          `${missingFace.length ? `人脸×${missingFace.length}` : ""}`,
        );
      } else {
        flashNotice("已把该任务的参数回填到工作台（衣服图片仍以当前上传为准）");
      }
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

  React.useEffect(() => {
    if (!isAuthenticated) return;
    if (!queue.length) return;

    let alive = true;
    const tick = async () => {
      if (!alive) return;
      await Promise.all(queue.map((q) => pollOne(q.taskId)));
    };

    void tick();
    const t = setInterval(() => void tick(), POLL_INTERVAL_MS);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, [isAuthenticated, queue, pollOne]);

  const addToQueue = (taskId: string, createdAt: number) => {
    setQueue((prev) => {
      const next = [{ taskId, createdAt }, ...prev.filter((x) => x.taskId !== taskId)];
      return next.slice(0, 30);
    });
  };

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
    setStyleLearning(true);
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
      setStyleLearning(false);
    }
  };

  const onLearnPose = async (file: File) => {
    if (!file) return;
    setPoseLearning(true);
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
      setPoseLearning(false);
    }
  };

  const addGarmentFiles = (incoming: File[]) => {
    const images = incoming.filter((f) => f.type.startsWith("image/"));
    if (!images.length) return;
    setGarmentFiles((prev) => {
      const remaining = Math.max(0, MAX_GARMENT_IMAGES - garmentAssetUrls.length - prev.length);
      if (remaining <= 0) return prev;
      return [...prev, ...images.slice(0, remaining)];
    });
  };

  const removeGarmentAt = (idx: number) => {
    setGarmentFiles((prev) => {
      const next = [...prev];
      next.splice(idx, 1);
      return next;
    });
  };

  const removeGarmentAssetUrl = (url: string) => {
    setGarmentAssetUrls((prev) => prev.filter((item) => item !== url));
  };

  const clearGarmentImages = () => {
    setGarmentFiles([]);
    setGarmentAssetUrls([]);
  };

  const openAssetDialog = () => {
    setAssetDialogOpen(true);
  };

  const savePromptSnippet = async (nameOverride?: string) => {
    const text = userPrompt.trim();
    if (!text) {
      alert("请先填写用户补充内容");
      return;
    }
    setPromptSnippetsBusy("create");
    try {
      const trimmedName = String(nameOverride || "").trim();
      const name = trimmedName || text.slice(0, 24).replace(/\s+/g, " ");
      const created = await createPromptSnippet({
        text,
        ...(name ? { name } : {}),
      });
      if (created?.id) {
        setPromptSnippets((prev) => [created, ...prev.filter((p) => p.id !== created.id)].slice(0, 50));
        setSelectedSnippetId(created.id);
      } else {
        await loadPromptSnippets();
      }
      setSnippetRemark("");
      flashNotice("已保存到云端模板");
    } catch (e: unknown) {
      console.error(e);
      alert(getErrorMessage(e, "保存失败"));
    } finally {
      setPromptSnippetsBusy(null);
    }
  };

  const removePromptSnippet = async (id: string) => {
    if (!id) return;
    setPromptSnippetsBusy("delete");
    try {
      await deletePromptSnippet(id);
      setPromptSnippets((prev) => prev.filter((p) => p.id !== id));
      if (selectedSnippetId === id) setSelectedSnippetId(null);
      setSnippetRemark("");
      flashNotice("已删除模板");
    } catch (e: unknown) {
      console.error(e);
      alert(getErrorMessage(e, "删除失败"));
    } finally {
      setPromptSnippetsBusy(null);
    }
  };

  const onGenerate = async () => {
    const combinedPrompt = [autoStylePrompt, userPrompt].map((text) => text.trim()).filter(Boolean).join("\n");
    if (!combinedPrompt) {
      alert("请先输入提示词");
      return;
    }
    const finalPrompt = appendModeHint(combinedPrompt, layoutMode);
    if (!garmentFiles.length && !garmentAssetUrls.length) {
      alert("请先上传至少 1 张衣服图片");
      return;
    }
    if (creditsLoaded && balance < estimatedCreditsCost) {
      alert(`积分不足：需要 ${estimatedCreditsCost} 积分，当前余额 ${balance} 积分。`);
      return;
    }

    setCreating(true);
    try {
      let seed: number | undefined;
      if (seedAuto) {
        const generated = Math.floor(Math.random() * 1_000_000_000);
        seed = generated;
        setSeedRaw(String(generated));
        setSeedAuto(true);
      } else {
        const parsed = Number(seedRaw.trim());
        seed = Number.isFinite(parsed) ? Math.abs(Math.floor(parsed)) : undefined;
      }
      const effectiveShotCount = layoutMode === "Grid" ? 1 : shotCount;
      const temperature = temperatureRaw.trim() ? Number(temperatureRaw) : undefined;
      const uploadedUrls = await uploadGarmentFiles(garmentFiles);
      const mergedGarmentUrls = Array.from(
        new Set(
          [...garmentAssetUrls, ...uploadedUrls]
            .map((v) => String(v || "").trim())
            .filter(Boolean)
        )
      );
      const res = await createDirectTaskFromUrls({
        garmentUrls: mergedGarmentUrls,
        prompt: finalPrompt,
        shotCount: effectiveShotCount,
        resolution,
        aspectRatio,
        layoutMode,
        stylePresetIds: selectedStyleIds,
        posePresetIds: selectedPoseIds,
        facePresetIds: selectedFaceIds,
        includeThoughts,
        ...(Number.isFinite(seed) ? { seed: seed as number } : {}),
        ...(Number.isFinite(temperature) ? { temperature: temperature as number } : {}),
      });

      const taskId = String(res?.id || res?.task?.id || "").trim();
      const createdAt = Number(res?.createdAt || Date.now());
      if (taskId) {
        addToQueue(taskId, createdAt);
        await pollOne(taskId);
      }
    } catch (e: unknown) {
      console.error(e);
      alert(getErrorMessage(e, "生成失败"));
    } finally {
      setCreating(false);
    }
  };

  const openTaskLightbox = (taskId: string) => {
    const task = tasksById[taskId];
    if (!task) return;

    const directImages = task.directPrompt
      ? (Array.isArray(task.resultImages) ? task.resultImages : [])
        .map((src) => String(src || "").trim())
        .filter(Boolean)
      : [];

    if (task.directPrompt && directImages.length > 1) {
      const images: LightboxItem[] = directImages.map((src, idx) => ({
        id: `${taskId}:${idx + 1}`,
        url: toImgSrc(src),
        prompt: task.directPrompt,
      }));

      setLightboxTaskId(taskId);
      setLightboxImages(images);
      setLightboxInitialIndex(0);
      setLightboxOpen(true);
      return;
    }

    const s0 = task?.shots?.[0];
    const versions = Array.isArray(s0?.versions) ? s0!.versions! : [];

    const images: LightboxItem[] = [];
    if (versions.length) {
      for (const v of versions.slice().sort((a, b) => a.versionId - b.versionId)) {
        images.push({
          id: `${taskId}:${v.versionId}`,
          url: toImgSrc(v.imagePath),
          prompt: v.prompt,
        });
      }
    } else {
      const single = String(s0?.imageUrl || s0?.imagePath || task.resultImages?.[0] || "").trim();
      if (single) images.push({ id: taskId, url: toImgSrc(single), prompt: s0?.prompt || s0?.promptEn || task.directPrompt });
    }

    if (!images.length) return;
    const current = Math.max(1, Number(s0?.currentVersion || versions[versions.length - 1]?.versionId || 1));
    const initialIndex = Math.max(0, images.findIndex((it) => it.id === `${taskId}:${current}`));

    setLightboxTaskId(taskId);
    setLightboxImages(images);
    setLightboxInitialIndex(initialIndex);
    setLightboxOpen(true);
  };

  const onRegenerateInLightbox = async () => {
    if (!lightboxTaskId) return;
    setLightboxRegenerating(true);
    try {
      const msg = chatMessage.trim();
      if (msg) {
        await directMessageTask(lightboxTaskId, msg);
        setChatMessage("");
      } else {
        await directRegenerateTask(lightboxTaskId);
      }
      await pollOne(lightboxTaskId);
      openTaskLightbox(lightboxTaskId);
    } catch (e: unknown) {
      console.error(e);
      alert(getErrorMessage(e, "重绘失败"));
    } finally {
      setLightboxRegenerating(false);
    }
  };

  // Persistence logic
  const STORAGE_PREFS_KEY = "afs:learn:prefs:v1";

  // Load prefs on mount
  React.useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const raw = localStorage.getItem(STORAGE_PREFS_KEY);
      if (raw) {
        const prefs = JSON.parse(raw);
        if (prefs.resolution) setResolution(prefs.resolution);
        if (prefs.aspectRatio) setAspectRatio(prefs.aspectRatio);
        if (Number.isFinite(prefs.shotCount)) setShotCount(Math.max(1, Math.floor(prefs.shotCount)));
        if (prefs.temperature) setTemperatureRaw(prefs.temperature);
        if (prefs.includeThoughts !== undefined) setIncludeThoughts(prefs.includeThoughts);
        // 注意：用户补充不自动恢复，仅手动模板可回填
        // Load selected presets if they still exist in the list (checked inside the render or just trust the ID)
        if (Array.isArray(prefs.selectedStyleIds)) setSelectedStyleIds(prefs.selectedStyleIds);
        if (Array.isArray(prefs.selectedPoseIds)) setSelectedPoseIds(prefs.selectedPoseIds);
      }
    } catch (e) {
      console.error("Failed to load prefs", e);
    }
  }, []); // Run once on mount

  // Save prefs on change
  React.useEffect(() => {
    if (typeof window === "undefined") return;
    const prefs = {
      resolution,
      aspectRatio,
      shotCount,
      temperature: temperatureRaw,
      includeThoughts,
      selectedStyleIds,
      selectedPoseIds,
      // 注意：用户补充不自动保存，仅手动模板可回填
    };
    localStorage.setItem(STORAGE_PREFS_KEY, JSON.stringify(prefs));
  }, [resolution, aspectRatio, shotCount, temperatureRaw, includeThoughts, selectedStyleIds, selectedPoseIds]);


  if (!isAuthenticated) {
    return (
      <div className="container max-w-4xl py-12">
        <Card>
          <CardHeader>
            <CardTitle>学习与生成</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="text-sm text-muted-foreground">该页面需要登录后使用（学习卡片/生成任务需要写入你的账号资源）。</div>
            <Button onClick={() => router.push("/login")}>去登录</Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  const activeFace = selectedFaceIds.length > 0
    ? (facePresetsAll || []).find(p => p.id === selectedFaceIds[0])
    : null;
  const assetDialogMaxSelection = Math.max(0, MAX_GARMENT_IMAGES - garmentFiles.length);
  const assetPanelContent = (
    <>
      <AssetLibrary
        stylePresets={stylePresetsAll || []}
        posePresets={posePresetsAll || []}
        facePresets={facePresetsAll || []}
        selectedStyleIds={selectedStyleIds}
        setSelectedStyleIds={setSelectedStyleIds}
        selectedPoseIds={selectedPoseIds}
        togglePoseSelect={togglePoseSelect}
        selectedFaceIds={selectedFaceIds}
        toggleFaceSelect={toggleFaceSelect}
        onDeleteStyle={deleteStylePreset}
        onDeletePose={deletePosePreset}
        onDeleteFace={deleteFacePreset}
        onUpdateStyle={updateStylePreset}
        onUpdatePose={updatePosePreset}
        onUpdateFace={updateFacePreset}
        onRelearnStyle={relearnStylePreset}
        onRelearnPose={relearnPosePreset}
      />
      <div className="p-3 border-t border-white/20 bg-white/30 space-y-2 backdrop-blur-sm">
        <Button variant="ghost" className="w-full justify-start gap-2 hover:bg-white/40" onClick={() => styleInputRef.current?.click()} disabled={styleLearning}>
          {styleLearning ? <Loader2 className="w-4 h-4 animate-spin" /> : <UploadCloud className="w-4 h-4" />}
          上传风格图学习
        </Button>
        <Button variant="ghost" className="w-full justify-start gap-2 hover:bg-white/40" onClick={() => poseInputRef.current?.click()} disabled={poseLearning}>
          {poseLearning ? <Loader2 className="w-4 h-4 animate-spin" /> : <UploadCloud className="w-4 h-4" />}
          上传姿势图学习
        </Button>
        <Button variant="ghost" className="w-full justify-start gap-2 hover:bg-white/40" onClick={() => setFaceDialogOpen(true)}>
          <UserRound className="w-4 h-4" />
          管理人脸模特
        </Button>
      </div>
    </>
  );
  const queuePanel = (
    <GlassPanel className="flex-1 pointer-events-auto overflow-hidden flex flex-col shadow-2xl" intensity="medium">
      <QueueSidebar
        queue={queue}
        tasksById={tasksById}
        onOpenTask={openTaskLightbox}
        onReuseTask={(taskId) => void reuseFromTaskId(taskId)}
        onRetryTask={(taskId) => void retryQueueTask(taskId)}
        retryingTaskId={queueRetryingTaskId}
        onClear={() => {
          setQueue([]);
          setTasksById({});
        }}
      />
    </GlassPanel>
  );
  const settingsPanel = (
    <div className="pointer-events-auto">
      <AdvancedSettings
        resolution={resolution}
        setResolution={setResolution}
        aspectRatio={aspectRatio}
        setAspectRatio={setAspectRatio}
        layoutMode={layoutMode}
        setLayoutMode={setLayoutMode}
        shotCount={shotCount}
        setShotCount={setShotCount}
        seed={seedRaw}
        setSeed={(value) => {
          const next = String(value ?? "");
          setSeedRaw(next);
          setSeedAuto(next.trim() === "");
        }}
        temperature={temperatureRaw}
        setTemperature={setTemperatureRaw}
        includeThoughts={includeThoughts}
        setIncludeThoughts={setIncludeThoughts}
      />
    </div>
  );

  return (
    <div
      className={cn(
        "relative min-h-[calc(100vh-3.5rem)] w-full bg-slate-50 overflow-x-hidden",
        isOverlayOpen ? "overflow-hidden" : "overflow-y-auto",
        "lg:h-[calc(100vh-3.5rem)] lg:overflow-hidden",
      )}
    >
      {/* 0. Ambient Background */}
      <FluidBackground variant={backgroundVariant} />

      {/* Mobile Toolbar */}
      <div className="sticky top-0 z-30 flex items-center justify-between gap-2 px-3 py-2 bg-white/70 backdrop-blur border-b border-white/40 lg:hidden">
        <div className="text-sm font-semibold text-slate-700">学习与生成</div>
        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-8 px-2 text-xs"
            onClick={() => {
              setShowRightPanel(false);
              setShowLeftPanel(true);
            }}
          >
            素材库
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-8 px-2 text-xs"
            onClick={() => {
              setShowLeftPanel(false);
              setShowRightPanel(true);
            }}
          >
            队列/设置
          </Button>
        </div>
      </div>

      {/* 1. Center Stage (Z-Index 10) */}
      <div className="relative lg:absolute lg:inset-0 flex items-center justify-center p-4 md:p-8 z-10 pointer-events-none">
        <div
          className="pointer-events-auto w-full max-w-5xl lg:h-full transition-transform duration-500 ease-out"
          onMouseEnter={() => setIsFocused(true)}
          onMouseLeave={() => setIsFocused(false)}
        >
          {/* CreationStage Wrapper to ensure pointer events are correct */}
            <CreationStage
              garmentFiles={garmentFiles}
              garmentUrls={garmentUrls}
              garmentAssetUrls={garmentAssetUrls}
              addGarmentFiles={addGarmentFiles}
              removeGarmentAt={removeGarmentAt} // Fix: Ensure this prop name matches
              removeGarmentAssetUrl={removeGarmentAssetUrl}
              onClearGarments={clearGarmentImages}
              onOpenAssetLibrary={openAssetDialog}
              maxGarmentImages={MAX_GARMENT_IMAGES}
              prompt={userPrompt}
            setPrompt={(v) => {
              setUserPrompt(v);
              if (selectedSnippetId) setSelectedSnippetId(null);
            }}
            autoStylePrompt={autoStylePrompt}
            styleLabel={activeStyleName}
            onGenerate={onGenerate}
            creating={creating}
            estimatedCreditsCost={estimatedCreditsCost}
            balance={balance}
            creditsLoaded={creditsLoaded}
            notice={workbenchNotice}
            promptSnippets={promptSnippets}
            promptSnippetsLoading={promptSnippetsLoading}
            promptSnippetsBusy={promptSnippetsBusy}
            selectedSnippetId={selectedSnippetId}
            onSelectSnippet={(id) => {
              const snippet = promptSnippets.find((x) => x.id === id);
              setSelectedSnippetId(id);
              if (snippet) setUserPrompt(snippet.text);
              setSnippetRemark("");
            }}
            onSaveSnippet={() => void savePromptSnippet(snippetRemark)}
            onDeleteSnippet={() => {
              if (!selectedSnippetId) return;
              void removePromptSnippet(selectedSnippetId);
            }}
            snippetRemark={snippetRemark}
            setSnippetRemark={setSnippetRemark}
            // New Props for Interactivity
            isFocused={isFocused}
            onInteraction={() => {
              // Keep random interaction for fun, or remove if user only wants style-driven
              // setBackgroundVariant((prev) => prev); 
            }}
            poseCount={selectedPoseIds.length}
            faceRemark={activeFace?.description || activeFace?.name}
            onClear={clearWorkbench}
            clearDisabled={!canClearWorkbench}
          />
        </div>
      </div>

      {/* Mid Desktop Toggle (Queue/Settings) */}
      <div className="hidden lg:flex xl:hidden absolute top-6 right-6 z-30">
        <Button
          type="button"
          variant="secondary"
          size="sm"
          className="h-8 px-3 text-xs"
          onClick={() => {
            setShowLeftPanel(false);
            setShowRightPanel(true);
          }}
        >
          队列/设置
        </Button>
      </div>

      {/* 2. Left Sidebar: Asset Library (Z-Index 20) */}
      <div
        className={cn(
          "hidden lg:flex absolute top-4 left-4 bottom-4 w-[300px] z-20 flex-col pointer-events-none transition-all duration-500 ease-in-out",
          "opacity-100"
        )}
      >
        <GlassPanel className="flex-1 flex flex-col pointer-events-auto h-full overflow-hidden shadow-2xl" intensity="medium">
          {assetPanelContent}
        </GlassPanel>
      </div>

      {/* 3. Right Sidebar: Queue & Settings (Z-Index 20) */}
      <div
        className={cn(
          "hidden xl:flex absolute top-4 right-4 bottom-4 w-[320px] z-20 pointer-events-none flex-col gap-4 transition-all duration-500 ease-in-out",
          "opacity-100"
        )}
      >
        {/* Queue Panel */}
        {queuePanel}

        {/* Advanced Settings (Floating Panel) */}
        {settingsPanel}
      </div>

      {/* Mobile/Tablet Overlay: Asset Library */}
      {showLeftPanel && (
        <div className="fixed inset-0 z-50 flex lg:hidden">
          <div
            className="absolute inset-0 bg-black/40 backdrop-blur-sm"
            onClick={() => setShowLeftPanel(false)}
          />
          <div className="relative m-4 w-[320px] max-w-[85vw] h-[calc(100%-2rem)]">
            <GlassPanel className="flex flex-col pointer-events-auto h-full overflow-hidden shadow-2xl" intensity="medium">
              <div className="flex items-center justify-between px-3 py-2 border-b border-white/20 bg-white/70">
                <span className="text-sm font-semibold text-slate-700">素材库</span>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-8 px-2 text-xs"
                  onClick={() => setShowLeftPanel(false)}
                >
                  关闭
                </Button>
              </div>
              {assetPanelContent}
            </GlassPanel>
          </div>
        </div>
      )}

      {/* Overlay: Queue & Settings */}
      {showRightPanel && (
        <div className="fixed inset-0 z-50 flex xl:hidden">
          <div
            className="absolute inset-0 bg-black/40 backdrop-blur-sm"
            onClick={() => setShowRightPanel(false)}
          />
          <div className="relative ml-auto m-4 w-[360px] max-w-[90vw] h-[calc(100%-2rem)] flex flex-col gap-3">
            <div className="flex items-center justify-between px-3 py-2 rounded-xl bg-white/70 border border-white/20 shadow-sm backdrop-blur">
              <span className="text-sm font-semibold text-slate-700">队列/设置</span>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-8 px-2 text-xs"
                onClick={() => setShowRightPanel(false)}
              >
                关闭
              </Button>
            </div>
            <div className="flex-1 min-h-0 flex flex-col gap-4">
              {queuePanel}
              {settingsPanel}
            </div>
          </div>
        </div>
      )}

      {/* Hidden Inputs */}
      <input ref={styleInputRef} type="file" accept="image/*" multiple className="hidden"
        onChange={(e) => {
          const files = Array.from(e.target.files || []).slice(0, MAX_STYLE_LEARN_IMAGES);
          e.currentTarget.value = "";
          void onLearnStyle(files);
        }}
      />
      <input ref={poseInputRef} type="file" accept="image/*" className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          e.currentTarget.value = "";
          if (file) void onLearnPose(file);
        }}
      />

      {/* Lightbox & Dialogs */}
      <ImageLightbox
        images={lightboxImages}
        initialIndex={lightboxInitialIndex}
        open={lightboxOpen}
        onOpenChange={setLightboxOpen}
        watermarkTaskId={lightboxTaskId}
        onRegenerate={() => void onRegenerateInLightbox()}
        isRegenerating={lightboxRegenerating}
        regenerateLabel="重新生成"
      />

      <Dialog open={faceDialogOpen} onOpenChange={setFaceDialogOpen}>
        <DialogContent className="max-w-6xl">
          <DialogHeader>
            <DialogTitle>选择/管理人脸模特（最多 3 张）</DialogTitle>
          </DialogHeader>
          <div className="max-h-[70vh] overflow-y-auto pr-2">
            <FacePresetSelector selectedIds={selectedFaceIds} onSelect={setSelectedFaceIds} maxSelection={3} />
          </div>
        </DialogContent>
      </Dialog>
      <UserAssetLibraryDialog
        open={assetDialogOpen}
        onOpenChange={setAssetDialogOpen}
        selectedUrls={garmentAssetUrls}
        onConfirm={setGarmentAssetUrls}
        maxSelection={assetDialogMaxSelection}
        title="服装素材库"
      />
    </div>
  );
}
