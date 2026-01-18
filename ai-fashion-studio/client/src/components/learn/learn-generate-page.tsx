"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { UploadCloud, Wand2, Loader2, X, UserRound } from "lucide-react";

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
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ImageLightbox, type LightboxItem } from "@/components/image-lightbox";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

import { QueueSidebar } from "@/components/learn/queue-sidebar";
import { AssetLibrary } from "@/components/learn/asset-library";
import { AdvancedSettings } from "@/components/learn/advanced-settings";
import { toImgSrc } from "@/components/learn/learn-utils";
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

const STYLE_HINT_ACCENTS = [
  {
    pill: "bg-violet-100/80 text-violet-700 border-violet-200/60",
    glow: "shadow-[0_0_18px_rgba(139,92,246,0.45)] ring-violet-300/60",
  },
  {
    pill: "bg-rose-100/80 text-rose-700 border-rose-200/60",
    glow: "shadow-[0_0_18px_rgba(244,63,94,0.45)] ring-rose-300/60",
  },
  {
    pill: "bg-emerald-100/80 text-emerald-700 border-emerald-200/60",
    glow: "shadow-[0_0_18px_rgba(16,185,129,0.45)] ring-emerald-300/60",
  },
  {
    pill: "bg-amber-100/80 text-amber-700 border-amber-200/60",
    glow: "shadow-[0_0_18px_rgba(245,158,11,0.45)] ring-amber-300/60",
  },
  {
    pill: "bg-sky-100/80 text-sky-700 border-sky-200/60",
    glow: "shadow-[0_0_18px_rgba(56,189,248,0.45)] ring-sky-300/60",
  },
] as const;

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
  const [garmentDragOver, setGarmentDragOver] = React.useState(false);
  const garmentDragCounterRef = React.useRef(0);

  // Dual prompt system: auto-filled style prompt + user custom prompt
  const [autoStylePrompt, setAutoStylePrompt] = React.useState<string>(""); // Auto-filled from style selection
  const [autoPromptExpanded, setAutoPromptExpanded] = React.useState(false);
  const [autoPromptGlow, setAutoPromptGlow] = React.useState(false);
  const [autoPromptAccentIndex, setAutoPromptAccentIndex] = React.useState(0);
  const [userPrompt, setUserPrompt] = React.useState<string>(""); // User's custom additions
  const lastAutoStyleSignatureRef = React.useRef<string | null>(null);
  const [promptSnippets, setPromptSnippets] = React.useState<PromptSnippet[]>([]);
  const [promptSnippetsLoading, setPromptSnippetsLoading] = React.useState(false);
  const [promptSnippetsBusy, setPromptSnippetsBusy] = React.useState<"create" | "delete" | null>(null);
  const [selectedSnippetId, setSelectedSnippetId] = React.useState<string | null>(null);

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
  // 口径对齐后端：Individual 1 张图=1；4K=4x
  const estimatedCreditsCost = resolution === "4K" ? 4 : 1;
  const styleAccent = STYLE_HINT_ACCENTS[autoPromptAccentIndex % STYLE_HINT_ACCENTS.length];
  const activeStyleName =
    selectedStyleIds.length > 0
      ? String((stylePresetsAll || []).find((p) => p.id === selectedStyleIds[0])?.name || "").trim()
      : "";

  const styleInputRef = React.useRef<HTMLInputElement>(null);
  const poseInputRef = React.useRef<HTMLInputElement>(null);
  const garmentInputRef = React.useRef<HTMLInputElement>(null);

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
    setAutoPromptAccentIndex((prev) => (prev + 1) % STYLE_HINT_ACCENTS.length);
    setAutoPromptGlow(true);
  }, [selectedStyleIds, stylePresetsAll]);

  React.useEffect(() => {
    if (!autoPromptGlow) return;
    const timer = setTimeout(() => setAutoPromptGlow(false), 1200);
    return () => clearTimeout(timer);
  }, [autoPromptGlow]);

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

  const onGarmentDragEnter = (e: React.DragEvent) => {
    e.preventDefault();
    garmentDragCounterRef.current += 1;
    setGarmentDragOver(true);
  };

  const onGarmentDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    garmentDragCounterRef.current = Math.max(0, garmentDragCounterRef.current - 1);
    if (garmentDragCounterRef.current === 0) setGarmentDragOver(false);
  };

  const onGarmentDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    if (e.dataTransfer) e.dataTransfer.dropEffect = "copy";
  };

  const onGarmentDrop = (e: React.DragEvent) => {
    e.preventDefault();
    garmentDragCounterRef.current = 0;
    setGarmentDragOver(false);
    const files = Array.from(e.dataTransfer?.files || []);
    addGarmentFiles(files);
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

  const savePromptSnippet = async () => {
    const text = userPrompt.trim();
    if (!text) {
      alert("请先填写用户补充内容");
      return;
    }
    setPromptSnippetsBusy("create");
    try {
      const name = text.slice(0, 24).replace(/\s+/g, " ");
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

  return (
    // Mobile Drawer logic can be added later, for now focused on the desktop structure as primary.
    // Using a fixed height container to allow internal scrolling.
    <div className="flex h-[calc(100vh-3.5rem)] overflow-hidden bg-[radial-gradient(circle_at_top,_rgba(216,180,254,0.35),_rgba(255,255,255,0)_60%),radial-gradient(circle_at_top_left,_rgba(125,211,252,0.35),_rgba(255,255,255,0)_60%),linear-gradient(135deg,_#f8fafc_0%,_#f3e8ff_50%,_#e0f2fe_100%)]">

      {/* Left Column: Asset Library */}
      <div className="w-[300px] flex-shrink-0 flex flex-col h-full border-r border-white/40 bg-white/60 backdrop-blur-xl shadow-sm z-10">
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

        {/* Style/Pose Upload Buttons moved to inside AssetLibrary or kept here? 
            AssetLibrary has logic for display, but upload logic was in parent. 
            Let's keep upload logic simple: AssetLibrary can have a "Add" button that triggers the hidden inputs here 
            OR we pass the refs to AssetLibrary. 
            For now, let's just put the upload buttons at the bottom of AssetLibrary or similar.
            Actually, AssetLibrary UI has tabs. Let's add a "Upload" button group at the bottom of the Left Column here.
        */}
        <div className="p-3 border-t border-white/40 bg-white/50 backdrop-blur space-y-2">
          <Button variant="outline" className="w-full justify-start gap-2" onClick={() => styleInputRef.current?.click()} disabled={styleLearning}>
            {styleLearning ? <Loader2 className="w-4 h-4 animate-spin" /> : <UploadCloud className="w-4 h-4" />}
            上传风格图学习
          </Button>
          <Button variant="outline" className="w-full justify-start gap-2" onClick={() => poseInputRef.current?.click()} disabled={poseLearning}>
            {poseLearning ? <Loader2 className="w-4 h-4 animate-spin" /> : <UploadCloud className="w-4 h-4" />}
            上传姿势图学习
          </Button>
          <Button variant="outline" className="w-full justify-start gap-2" onClick={() => setFaceDialogOpen(true)}>
            <UserRound className="w-4 h-4" />
            管理人脸模特
          </Button>
          {/* Hidden Inputs */}
          <input
            ref={styleInputRef}
            type="file"
            accept="image/*"
            multiple
            className="hidden"
            onChange={(e) => {
              const files = Array.from(e.target.files || []).slice(0, MAX_STYLE_LEARN_IMAGES);
              e.currentTarget.value = "";
              void onLearnStyle(files);
            }}
          />
          <input
            ref={poseInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              e.currentTarget.value = "";
              if (file) void onLearnPose(file);
            }}
          />
        </div>
      </div>

      {/* Middle Column: Workbench */}
      <div className="flex-1 flex flex-col min-w-0 h-full overflow-y-auto relative">
        <div className="flex-1 p-4">
          <div className="mx-auto w-full max-w-4xl space-y-4 rounded-3xl border border-white/50 bg-white/60 p-5 shadow-[0_20px_60px_rgba(15,23,42,0.12)] backdrop-blur-xl">

          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold tracking-tight text-slate-900">创作工作台</h1>
              <div className="text-sm text-muted-foreground mt-1">
                拖拽右侧任务复用参数，或直接开始创作。
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Button variant="ghost" size="sm" onClick={() => {
                setUserPrompt("");
                setAutoStylePrompt("");
                setAutoPromptExpanded(false);
                lastAutoStyleSignatureRef.current = null;
                setSelectedSnippetId(null);
                setGarmentFiles([]);
                setSelectedStyleIds([]);
                setSelectedPoseIds([]);
                setSelectedFaceIds([]);
              }}>清空当前</Button>
            </div>
          </div>
          {workbenchNotice && (
            <div className="inline-flex items-center gap-2 rounded-full border border-white/50 bg-white/70 px-3 py-1 text-xs text-slate-600 shadow-sm backdrop-blur">
              {workbenchNotice}
            </div>
          )}

          {/* Drag Drop Hint */}
          <div
            className={cn(
              "rounded-3xl border border-dashed p-4 transition-all duration-200 ease-in-out backdrop-blur",
              garmentFiles.length > 0
                ? "border-white/50 bg-white/70 shadow-sm"
                : "border-white/40 bg-white/50 hover:bg-white/70 hover:border-purple-300/70",
              garmentDragOver && "border-purple-400 bg-purple-50/80 ring-4 ring-purple-200/60 shadow-[0_0_30px_rgba(168,85,247,0.25)]"
            )}
            onDragEnter={onGarmentDragEnter}
            onDragLeave={onGarmentDragLeave}
            onDragOver={onGarmentDragOver}
            onDrop={onGarmentDrop}
          >
            <div className="flex flex-col items-center justify-center text-center space-y-4">

              {garmentFiles.length > 0 ? (
                <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 gap-4 w-full">
                  {garmentUrls.map((u, idx) => (
                    <div key={`${u}-${idx}`} className="relative aspect-[3/4] group rounded-xl overflow-hidden shadow-sm border bg-white">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={u} alt="garment" className="w-full h-full object-cover" />
                      <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                        <Button variant="destructive" size="icon" className="h-8 w-8 rounded-full" onClick={(e) => {
                          e.stopPropagation();
                          removeGarmentAt(idx);
                        }}>
                          <X className="w-4 h-4" />
                        </Button>
                      </div>
                    </div>
                  ))}
                  {garmentFiles.length < MAX_GARMENT_IMAGES && (
                    <button
                      onClick={() => garmentInputRef.current?.click()}
                      className="flex flex-col items-center justify-center aspect-[3/4] rounded-xl border-2 border-dashed border-slate-200 hover:border-purple-400 hover:bg-purple-50 text-muted-foreground hover:text-purple-600 transition-colors"
                    >
                      <UploadCloud className="w-6 h-6 mb-2" />
                      <span className="text-xs font-medium">添加图片</span>
                    </button>
                  )}
                </div>
              ) : (
                <div className="py-4" onClick={() => garmentInputRef.current?.click()}>
                  <div className="w-12 h-12 bg-purple-100/50 text-purple-600 rounded-2xl flex items-center justify-center mx-auto mb-2">
                    <UploadCloud className="w-6 h-6" />
                  </div>
                  <h3 className="text-base font-semibold text-slate-900">上传衣服参考图</h3>
                  <p className="text-xs text-slate-500 max-w-sm mx-auto mt-1">
                    拖拽图片到这里，或点击上传。支持 JPG/PNG。<br />
                    最多 {MAX_GARMENT_IMAGES} 张。
                  </p>
                </div>
              )}

              <input
                ref={garmentInputRef}
                type="file"
                accept="image/*"
                multiple
                className="hidden"
                onChange={(e) => {
                  const files = Array.from(e.target.files || []);
                  e.currentTarget.value = "";
                  addGarmentFiles(files);
                }}
              />
            </div>
          </div>

          {/* Prompt Section */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <label className="text-sm font-semibold text-slate-700">提示词组合</label>
              <div className="flex items-center gap-2">
                {promptSnippets.length > 0 && (
                  <Select
                    value={selectedSnippetId ?? undefined}
                    onValueChange={(id) => {
                      const snippet = promptSnippets.find((x) => x.id === id);
                      setSelectedSnippetId(id);
                      if (snippet) setUserPrompt(snippet.text);
                    }}
                  >
                    <SelectTrigger className="h-8 w-[160px] text-xs" disabled={promptSnippetsLoading}>
                      <SelectValue placeholder={promptSnippetsLoading ? "模板加载中..." : "加载补充模板..."} />
                    </SelectTrigger>
                    <SelectContent>
                      {promptSnippets.map((p) => (
                        <SelectItem key={p.id} value={p.id}>
                          {p.name || p.text.slice(0, 24)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
                {selectedSnippetId && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-8 text-xs text-muted-foreground"
                    onClick={() => void removePromptSnippet(selectedSnippetId)}
                    disabled={promptSnippetsBusy === "delete"}
                  >
                    {promptSnippetsBusy === "delete" ? "删除中..." : "删除模板"}
                  </Button>
                )}
              </div>
            </div>

            <div className="space-y-3">
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-slate-500">风格推荐词（自动）</span>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 text-xs"
                    onClick={() => setAutoPromptExpanded((prev) => !prev)}
                  >
                    {autoPromptExpanded ? "收起" : "展开"}
                  </Button>
                </div>
                {autoPromptExpanded ? (
                  <div
                    className={cn(
                      "rounded-2xl border bg-white/70 p-2 shadow-sm backdrop-blur transition",
                      autoStylePrompt ? "border-white/50" : "border-slate-200/60",
                      autoPromptGlow && autoStylePrompt && "ring-2",
                      autoPromptGlow && autoStylePrompt && styleAccent.glow,
                    )}
                  >
                    <div className="mb-2 flex items-center justify-between">
                      <span
                        className={cn(
                          "inline-flex items-center rounded-full border px-2 py-1 text-[11px]",
                          autoStylePrompt
                            ? styleAccent.pill
                            : "bg-slate-100/70 text-slate-500 border-slate-200/60",
                        )}
                      >
                        {activeStyleName ? `风格：${activeStyleName}` : "风格推荐词"}
                      </span>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 text-xs"
                        onClick={() => setAutoPromptExpanded(false)}
                      >
                        收起
                      </Button>
                    </div>
                    <Textarea
                      value={autoStylePrompt}
                      onChange={(e) => setAutoStylePrompt(e.target.value)}
                      placeholder="风格推荐词会在你选择风格后自动填充"
                      className="min-h-[120px] text-xs rounded-xl border-slate-200/60 bg-white/80 p-3 focus:border-purple-400 focus:ring-purple-400/20 resize-y"
                    />
                  </div>
                ) : (
                  <button
                    type="button"
                    className={cn(
                      "flex w-full items-center justify-between rounded-full border px-4 py-2 text-xs transition",
                      autoStylePrompt
                        ? styleAccent.pill
                        : "bg-slate-100/70 text-slate-500 border-slate-200/60",
                      autoPromptGlow && autoStylePrompt && "ring-2",
                      autoPromptGlow && autoStylePrompt && styleAccent.glow,
                    )}
                    onClick={() => setAutoPromptExpanded(true)}
                  >
                    <span className="font-semibold">
                      {activeStyleName ? `风格推荐词 · ${activeStyleName}` : "风格推荐词"}
                    </span>
                    <span className="text-[11px] opacity-70">
                      {autoStylePrompt ? "点击展开查看/编辑" : "选择风格后自动生成"}
                    </span>
                  </button>
                )}
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-slate-500">用户补充（手动，可保存）</span>
                  {!promptSnippets.length && promptSnippetsLoading && (
                    <span className="text-xs text-muted-foreground">模板加载中...</span>
                  )}
                </div>
                <div className="relative">
                  <Textarea
                    value={userPrompt}
                    onChange={(e) => {
                      setUserPrompt(e.target.value);
                      if (selectedSnippetId) setSelectedSnippetId(null);
                    }}
                    placeholder="补充你想要的细节：动作、场景、镜头语言、光影氛围..."
                    className="min-h-[140px] text-sm p-3 rounded-2xl border-white/50 bg-white/70 shadow-sm backdrop-blur focus:border-purple-400 focus:ring-purple-400/20 resize-y"
                  />
                  <div className="absolute bottom-3 right-3 flex gap-2">
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-7 text-xs text-muted-foreground"
                      onClick={() => void savePromptSnippet()}
                      disabled={promptSnippetsBusy === "create"}
                    >
                      {promptSnippetsBusy === "create" ? "保存中..." : "保存补充"}
                    </Button>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Advanced Settings */}
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

          {/* Generate Button Area - Sticky Bottom or just normal */}
          <div className="pt-2 sticky bottom-0 bg-gradient-to-t from-white/80 via-white/40 to-transparent pb-4 z-10">
            <div className="flex items-center justify-between mb-2 px-1">
              <div className="text-xs text-muted-foreground">
                预计消耗: <span className="font-medium text-slate-900">{estimatedCreditsCost}</span> 积分
                <span className="mx-2">|</span>
                余额: {creditsLoaded ? balance : "..."}
              </div>
              {creditsLoaded && balance < estimatedCreditsCost && (
                <span className="text-xs text-rose-500 font-medium">积分不足</span>
              )}
            </div>
            <Button
              size="lg"
              className="w-full h-11 text-base font-semibold shadow-lg shadow-purple-500/20 bg-gradient-to-r from-orange-500 via-pink-500 to-violet-600 hover:opacity-90 active:scale-[0.98] transition-all"
              onClick={onGenerate}
              disabled={creating || (creditsLoaded && balance < estimatedCreditsCost)}
            >
              {creating ? (
                <>
                  <Loader2 className="w-5 h-5 mr-2 animate-spin" />
                  正在生成任务...
                </>
              ) : (
                <>
                  <Wand2 className="w-5 h-5 mr-2" />
                  立即生成 (Generate)
                </>
              )}
            </Button>
          </div>
          </div>
        </div>
      </div>

      {/* Right Column: Queue */}
      <div
        className="w-[320px] flex-shrink-0 border-l border-white/40 bg-white/60 backdrop-blur-xl flex flex-col shadow-sm z-10"
        onDragOver={(e) => {
          const types = Array.from(e.dataTransfer.types || []);
          if (!types.includes("application/x-afs-task-ref")) return;
          e.preventDefault();
          e.dataTransfer.dropEffect = "copy";
        }}
        onDrop={(e) => {
          const raw = e.dataTransfer.getData("application/x-afs-task-ref");
          if (!raw) return;
          e.preventDefault();
          try {
            const parsed = JSON.parse(raw) as { taskId?: string };
            const taskId = String(parsed?.taskId || "").trim();
            if (taskId) void reuseFromTaskId(taskId);
          } catch { }
        }}
      >
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
      </div>

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
