"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { UploadCloud, Loader2, UserRound } from "lucide-react";

import api from "@/lib/api";
import {
  createDirectTask,
  createPromptSnippet,
  deletePromptSnippet,
  directMessageTask,
  directRegenerateTask,
  learnPose,
  learnStyle,
  listPromptSnippets,
} from "@/lib/api";
import { useAuth } from "@/hooks/use-auth";
import { requestCreditsRefresh, useCredits } from "@/hooks/use-credits";

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
import type { PromptSnippet, QueueItem, TaskApi } from "@/components/learn/types";
import { cn } from "@/lib/utils";

const MAX_GARMENT_IMAGES = 6;
const MAX_STYLE_LEARN_IMAGES = 5;
const MAX_POSE_SELECT = 4;
const MAX_FACE_SELECT = 3;
const POLL_INTERVAL_MS = 1500;

const STORAGE_QUEUE_KEY = "afs:learn:queue:v1";

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

function buildAutoStylePrompt(stylePresets: StylePreset[], styleId?: string | null) {
  if (!styleId) return "";
  const preset = stylePresets.find((x) => x.id === styleId);
  if (preset?.learnStatus === "FAILED") return "";
  const name = preset?.name ? String(preset.name).trim() : "";
  return [
    "Commercial fashion photography.",
    "Model wears the uploaded garment(s). Preserve garment cut, seams, logos, patterns, fabric texture, and natural wrinkles.",
    "Face must match selected face reference (if provided).",
    "Photorealistic, high detail, clean commercial composition.",
    "If multiple poses are selected, output ONE contact sheet with one panel per pose (max 4 panels). Same model + same garment across panels.",
    name ? `Apply the learned style: ${name}.` : "Apply the learned style JSON strictly.",
  ].join("\n");
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
  const [includeThoughts, setIncludeThoughts] = React.useState(false);
  const [seedRaw, setSeedRaw] = React.useState<string>("");
  const [temperatureRaw, setTemperatureRaw] = React.useState<string>("");

  const [creating, setCreating] = React.useState(false);

  const [queue, setQueue] = React.useState<QueueItem[]>([]);
  const [tasksById, setTasksById] = React.useState<Record<string, TaskApi>>({});
  const [workbenchNotice, setWorkbenchNotice] = React.useState<string>("");

  const [lightboxOpen, setLightboxOpen] = React.useState(false);
  const [lightboxImages, setLightboxImages] = React.useState<LightboxItem[]>([]);
  const [lightboxInitialIndex, setLightboxInitialIndex] = React.useState(0);
  const [lightboxTaskId, setLightboxTaskId] = React.useState<string | undefined>(undefined);
  const [lightboxRegenerating, setLightboxRegenerating] = React.useState(false);
  const [activeTaskId, setActiveTaskId] = React.useState<string | undefined>(undefined);
  const [chatMessage, setChatMessage] = React.useState<string>("");

  // New Interactive States for Redesign
  const [isFocused, setIsFocused] = React.useState(false);
  const [backgroundVariant, setBackgroundVariant] = React.useState<"default" | "warm" | "cool" | "cyber">("default");

  // 口径对齐后端：Individual 1 张图=1；4K=4x
  const estimatedCreditsCost = resolution === "4K" ? 4 : 1;
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
    const base = buildAutoStylePrompt(stylePresetsAll || [], id);
    setAutoStylePrompt(base);
    lastAutoStyleSignatureRef.current = signature;
  }, [selectedStyleIds, stylePresetsAll]);

  React.useEffect(() => {
    if (selectedStyleIds.length > 0) {
      const id = selectedStyleIds[0];
      const variants = ["default", "warm", "cool", "cyber"] as const;
      const index = id.charCodeAt(0) % variants.length;
      setBackgroundVariant(variants[index]);
      return;
    }
    setBackgroundVariant("default");
  }, [selectedStyleIds]);

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

  const applyTaskToWorkbench = React.useCallback(
    (task: TaskApi) => {
      const nextPromptRaw = String(task?.directPrompt || task?.requirements || "").trim();

      const nextResolution = (task?.resolution || "2K") as "1K" | "2K" | "4K";
      const nextAspect = (task?.aspectRatio || "3:4") as "1:1" | "4:3" | "3:4" | "16:9" | "9:16" | "21:9";
      setResolution(nextResolution);
      setAspectRatio(nextAspect);

      setIncludeThoughts(!!task?.directIncludeThoughts);
      setSeedRaw(typeof task?.directSeed === "number" ? String(task.directSeed) : "");
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

      const autoPromptForTask = buildAutoStylePrompt(stylePresetsAll || [], styleIds[0]);
      const resolvedUserPrompt =
        autoPromptForTask && nextPromptRaw.startsWith(autoPromptForTask)
          ? nextPromptRaw.slice(autoPromptForTask.length).trimStart()
          : nextPromptRaw;
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
    } catch (e: any) {
      console.error(e);
      flashNotice(e?.response?.data?.message || e?.message || "风格学习失败，请稍后重试");
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
    } catch (e: any) {
      console.error(e);
      flashNotice(e?.response?.data?.message || e?.message || "姿势学习失败，请稍后重试");
    } finally {
      await fetchPosePresets();
      setPoseLearning(false);
    }
  };

  const addGarmentFiles = (incoming: File[]) => {
    const images = incoming.filter((f) => f.type.startsWith("image/"));
    if (!images.length) return;
    setGarmentFiles((prev) => {
      const remaining = Math.max(0, MAX_GARMENT_IMAGES - prev.length);
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
    } catch (e: any) {
      console.error(e);
      alert(e?.response?.data?.message || e?.message || "保存失败");
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
    } catch (e: any) {
      console.error(e);
      alert(e?.response?.data?.message || e?.message || "删除失败");
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
    if (!garmentFiles.length) {
      alert("请先上传至少 1 张衣服图片");
      return;
    }
    if (creditsLoaded && balance < estimatedCreditsCost) {
      alert(`积分不足：需要 ${estimatedCreditsCost} 积分，当前余额 ${balance} 积分。`);
      return;
    }

    setCreating(true);
    try {
      const seed = seedRaw.trim() ? Number(seedRaw) : undefined;
      const temperature = temperatureRaw.trim() ? Number(temperatureRaw) : undefined;
      const res = await createDirectTask({
        garmentImages: garmentFiles,
        prompt: combinedPrompt,
        resolution,
        aspectRatio,
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
        setActiveTaskId(taskId);
      }
    } catch (e: any) {
      console.error(e);
      alert(e?.response?.data?.message || e?.message || "生成失败");
    } finally {
      setCreating(false);
    }
  };

  const openTaskLightbox = (taskId: string) => {
    const task = tasksById[taskId];
    if (!task) return;

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
    setActiveTaskId(taskId);
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
    } catch (e: any) {
      console.error(e);
      alert(e?.response?.data?.message || e?.message || "重绘失败");
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
      temperature: temperatureRaw,
      includeThoughts,
      selectedStyleIds,
      selectedPoseIds,
      // 注意：用户补充不自动保存，仅手动模板可回填
    };
    localStorage.setItem(STORAGE_PREFS_KEY, JSON.stringify(prefs));
  }, [resolution, aspectRatio, temperatureRaw, includeThoughts, selectedStyleIds, selectedPoseIds]);


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

  return (
    <div className="relative h-[calc(100vh-3.5rem)] w-full overflow-hidden bg-slate-50">
      {/* 0. Ambient Background */}
      <FluidBackground variant={backgroundVariant} />

      {/* 1. Center Stage (Z-Index 10) */}
      <div className="absolute inset-0 flex items-center justify-center p-4 md:p-8 z-10 pointer-events-none">
        <div
          className="pointer-events-auto w-full max-w-5xl h-full transition-transform duration-500 ease-out"
          onMouseEnter={() => setIsFocused(true)}
          onMouseLeave={() => setIsFocused(false)}
        >
          {/* CreationStage Wrapper to ensure pointer events are correct */}
          <CreationStage
            garmentFiles={garmentFiles}
            garmentUrls={garmentUrls}
            addGarmentFiles={addGarmentFiles}
            removeGarmentAt={removeGarmentAt} // Fix: Ensure this prop name matches
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
          />
        </div>
      </div>

      {/* 2. Left Sidebar: Asset Library (Z-Index 20) */}
      <div
        className={cn(
          "absolute top-4 left-4 bottom-4 w-[300px] z-20 flex flex-col pointer-events-none transition-all duration-500 ease-in-out",
          isFocused ? "opacity-30 blur-[2px] scale-95 grayscale-[0.5]" : "opacity-100 hover:opacity-100"
        )}
      >
        <GlassPanel className="flex-1 flex flex-col pointer-events-auto h-full overflow-hidden shadow-2xl" intensity="medium">
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
            onRelearnStyle={(id: string) => (relearnStylePreset as any)(id)}
            onRelearnPose={(id: string) => (relearnPosePreset as any)(id)}
          />
          {/* Upload Actions */}
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
        </GlassPanel>

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
      </div>

      {/* 3. Right Sidebar: Queue & Settings (Z-Index 20) */}
      <div
        className={cn(
          "absolute top-4 right-4 bottom-4 w-[320px] z-20 pointer-events-none flex flex-col gap-4 transition-all duration-500 ease-in-out",
          isFocused ? "opacity-30 blur-[2px] scale-95 grayscale-[0.5]" : "opacity-100 hover:opacity-100"
        )}
      >
        {/* Queue Panel */}
        <GlassPanel className="flex-1 pointer-events-auto overflow-hidden flex flex-col shadow-2xl" intensity="medium">
          <QueueSidebar
            queue={queue}
            tasksById={tasksById}
            onOpenTask={openTaskLightbox}
            onReuseTask={(taskId) => void reuseFromTaskId(taskId)}
            onClear={() => {
              setQueue([]);
              setTasksById({});
            }}
          />
        </GlassPanel>

        {/* Advanced Settings (Floating Panel) */}
        <div className="pointer-events-auto">
          <AdvancedSettings
            resolution={resolution}
            setResolution={setResolution as any}
            aspectRatio={aspectRatio}
            setAspectRatio={setAspectRatio as any}
            seed={seedRaw}
            setSeed={setSeedRaw}
            temperature={temperatureRaw}
            setTemperature={setTemperatureRaw}
            includeThoughts={includeThoughts}
            setIncludeThoughts={setIncludeThoughts}
          />
        </div>
      </div>

      {/* Lightbox & Dialogs */}
      <ImageLightbox
        images={lightboxImages}
        initialIndex={lightboxInitialIndex}
        open={lightboxOpen}
        onOpenChange={setLightboxOpen}
        watermarkTaskId={lightboxTaskId}
        onRegenerate={(_id) => void onRegenerateInLightbox()}
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
    </div>
  );
}
