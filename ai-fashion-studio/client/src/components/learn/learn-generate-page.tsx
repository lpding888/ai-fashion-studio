"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { UploadCloud, Wand2, Loader2, Images, Sparkles, X, UserRound } from "lucide-react";

import api from "@/lib/api";
import { createDirectTask, directMessageTask, directRegenerateTask, learnPose, learnStyle } from "@/lib/api";
import { useAuth } from "@/hooks/use-auth";
import { requestCreditsRefresh, useCredits } from "@/hooks/use-credits";

import { useStylePresetStore, type StylePreset } from "@/store/style-preset-store";
import { usePosePresetStore, type PosePreset } from "@/store/pose-preset-store";
import { FacePresetSelector } from "@/components/face-preset-selector";
import { useFacePresetStore } from "@/store/face-preset-store";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import { ImageLightbox, type LightboxItem } from "@/components/image-lightbox";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

import { PresetCard } from "@/components/learn/preset-card";
import { QueueSidebar } from "@/components/learn/queue-sidebar";
import { toImgSrc } from "@/components/learn/learn-utils";
import type { QueueItem, SavedPrompt, TaskApi } from "@/components/learn/types";
import { cn } from "@/lib/utils";

const MAX_GARMENT_IMAGES = 6;
const MAX_STYLE_LEARN_IMAGES = 5;
const MAX_POSE_SELECT = 4;
const MAX_FACE_SELECT = 3;
const POLL_INTERVAL_MS = 1500;

const STORAGE_QUEUE_KEY = "afs:learn:queue:v1";
const STORAGE_SAVED_PROMPTS_KEY = "afs:learn:saved-prompts:v1";

function cryptoRandomId(): string {
  try {
    return crypto.randomUUID();
  } catch {
    // eslint-disable-next-line no-bitwise
    return `${Date.now()}-${Math.random().toString(16).slice(2)}-${(Math.random() * 1e9) | 0}`;
  }
}

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

  const [prompt, setPrompt] = React.useState<string>("");
  const [promptTouched, setPromptTouched] = React.useState(false);
  const lastAutoStyleIdRef = React.useRef<string | null>(null);
  const [savedPrompts, setSavedPrompts] = React.useState<SavedPrompt[]>([]);
  const [promptName, setPromptName] = React.useState<string>("");

  const [resolution, setResolution] = React.useState<"1K" | "2K" | "4K">("2K");
  const [aspectRatio, setAspectRatio] = React.useState<"1:1" | "4:3" | "3:4" | "16:9" | "9:16" | "21:9">("3:4");
  const [includeThoughts, setIncludeThoughts] = React.useState(false);
  const [seedRaw, setSeedRaw] = React.useState<string>("");
  const [temperatureRaw, setTemperatureRaw] = React.useState<string>("");

  const [creating, setCreating] = React.useState(false);

  const [queue, setQueue] = React.useState<QueueItem[]>([]);
  const [tasksById, setTasksById] = React.useState<Record<string, TaskApi>>({});
  const [workbenchNotice, setWorkbenchNotice] = React.useState<string>("");
  const [importDragOver, setImportDragOver] = React.useState(false);

  const [lightboxOpen, setLightboxOpen] = React.useState(false);
  const [lightboxImages, setLightboxImages] = React.useState<LightboxItem[]>([]);
  const [lightboxInitialIndex, setLightboxInitialIndex] = React.useState(0);
  const [lightboxTaskId, setLightboxTaskId] = React.useState<string | undefined>(undefined);
  const [lightboxRegenerating, setLightboxRegenerating] = React.useState(false);
  const [activeTaskId, setActiveTaskId] = React.useState<string | undefined>(undefined);
  const [chatMessage, setChatMessage] = React.useState<string>("");
  const [presetDetailOpen, setPresetDetailOpen] = React.useState(false);
  const [presetDetailKind, setPresetDetailKind] = React.useState<"STYLE" | "POSE" | null>(null);
  const [presetDetailId, setPresetDetailId] = React.useState<string | null>(null);
  const [presetDetailName, setPresetDetailName] = React.useState<string>("");
  const [presetDetailDesc, setPresetDetailDesc] = React.useState<string>("");
  const [presetDetailBusy, setPresetDetailBusy] = React.useState<"save" | "delete" | "relearn" | null>(null);

  // 口径对齐后端：Individual 1 张图=1；4K=4x
  const estimatedCreditsCost = resolution === "4K" ? 4 : 1;

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

  React.useEffect(() => {
    if (typeof window === "undefined") return;

    try {
      const raw = localStorage.getItem(STORAGE_SAVED_PROMPTS_KEY);
      const parsed = raw ? (JSON.parse(raw) as SavedPrompt[]) : [];
      setSavedPrompts(Array.isArray(parsed) ? parsed : []);
    } catch {
      setSavedPrompts([]);
    }

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

  // 点风格卡后，如果用户还没手动编辑提示词，则自动填一个“可直接生成”的基础 prompt（用户可再补充）
  React.useEffect(() => {
    if (promptTouched) return;
    if (selectedStyleIds.length === 0) return;
    const id = selectedStyleIds[0];
    if (lastAutoStyleIdRef.current === id) return;
    const p = (stylePresetsAll || []).find((x) => x.id === id);
    const name = p?.name ? String(p.name).trim() : "";
    const base = [
      "Commercial fashion photography.",
      "Model wears the uploaded garment(s). Preserve garment cut, seams, logos, patterns, fabric texture, and natural wrinkles.",
      "Face must match selected face reference (if provided).",
      "Photorealistic, high detail, clean commercial composition.",
      "If multiple poses are selected, output ONE contact sheet with one panel per pose (max 4 panels). Same model + same garment across panels.",
      name ? `Apply the learned style: ${name}.` : "Apply the learned style JSON strictly.",
    ].join("\n");
    setPrompt(base);
    lastAutoStyleIdRef.current = id;
  }, [promptTouched, selectedStyleIds, stylePresetsAll]);

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
      const nextPrompt = String(task?.directPrompt || task?.requirements || "").trim();
      if (nextPrompt) {
        setPromptTouched(true);
        setPrompt(nextPrompt);
      }

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

  const toggleSelect = (arr: string[], id: string) => (arr.includes(id) ? arr.filter((x) => x !== id) : [...arr, id]);

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
      await learnStyle(files);
      await fetchStylePresets();
    } finally {
      setStyleLearning(false);
    }
  };

  const onLearnPose = async (file: File) => {
    if (!file) return;
    setPoseLearning(true);
    try {
      await learnPose(file);
      await fetchPosePresets();
    } finally {
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

  const savePrompt = () => {
    const text = prompt.trim();
    if (!text) return;
    const now = Date.now();
    const name = (promptName.trim() || text.slice(0, 24)).replace(/\s+/g, " ");
    const item: SavedPrompt = {
      id: cryptoRandomId(),
      name: name || `Prompt ${new Date(now).toLocaleDateString("zh-CN")}`,
      text,
      createdAt: now,
    };
    const next = [item, ...savedPrompts].slice(0, 50);
    setSavedPrompts(next);
    setPromptName("");
    localStorage.setItem(STORAGE_SAVED_PROMPTS_KEY, JSON.stringify(next));
  };

  const deleteSavedPrompt = (id: string) => {
    const next = savedPrompts.filter((p) => p.id !== id);
    setSavedPrompts(next);
    localStorage.setItem(STORAGE_SAVED_PROMPTS_KEY, JSON.stringify(next));
  };

  const onGenerate = async () => {
    if (!prompt.trim()) {
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
        prompt: prompt.trim(),
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

  const openPresetDetails = (kind: "STYLE" | "POSE", preset: StylePreset | PosePreset) => {
    setPresetDetailKind(kind);
    setPresetDetailId(preset.id);
    setPresetDetailName(String(preset.name || "").trim());
    setPresetDetailDesc(String(preset.description || "").trim());
    setPresetDetailOpen(true);
  };

  const closePresetDetails = () => {
    setPresetDetailOpen(false);
    setPresetDetailBusy(null);
  };

  const presetDetail =
    presetDetailKind === "STYLE"
      ? (stylePresetsAll || []).find((p) => p.id === presetDetailId)
      : presetDetailKind === "POSE"
        ? (posePresetsAll || []).find((p) => p.id === presetDetailId)
        : undefined;

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

  const stylePresets = (stylePresetsAll || []).filter((p) => p.kind !== "POSE");
  const posePresets = posePresetsAll || [];
  const selectedFacePresets = (facePresetsAll || []).filter((p) => selectedFaceIds.includes(p.id));

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
    <div className="container max-w-screen-2xl py-8">
      <div className="flex items-start justify-between gap-6">
        <div
          className="min-w-0 flex-1"
          onDragOver={(e) => {
            const types = Array.from(e.dataTransfer.types || []);
            if (!types.includes("application/x-afs-task-ref")) return;
            e.preventDefault();
            e.dataTransfer.dropEffect = "copy";
          }}
          onDragEnter={(e) => {
            const types = Array.from(e.dataTransfer.types || []);
            if (!types.includes("application/x-afs-task-ref")) return;
            e.preventDefault();
            setImportDragOver(true);
          }}
          onDragLeave={() => setImportDragOver(false)}
          onDrop={(e) => {
            const raw = e.dataTransfer.getData("application/x-afs-task-ref");
            if (!raw) return;
            e.preventDefault();
            setImportDragOver(false);
            try {
              const parsed = JSON.parse(raw) as { taskId?: string };
              const taskId = String(parsed?.taskId || "").trim();
              if (taskId) void reuseFromTaskId(taskId);
            } catch {
              // ignore
            }
          }}
        >
          <div className="flex items-center justify-between gap-4 mb-6">
            <div className="space-y-1">
              <h1 className="text-2xl font-bold">学习与生成</h1>
              <div className="text-sm text-muted-foreground">风格/姿势学习成卡片，多选后与衣服图 + 提示词一起直出图。</div>
            </div>
            <div className="flex items-center gap-2">
              <Badge className="bg-white border border-slate-200 text-slate-700">衣服图 ≤ {MAX_GARMENT_IMAGES}</Badge>
              <Badge className="bg-white border border-slate-200 text-slate-700">人脸 ≤ 3（不占衣服图名额）</Badge>
            </div>
          </div>

          <div
            className={cn(
              "mb-6 rounded-2xl border border-dashed p-3 text-xs text-muted-foreground transition-colors",
              importDragOver ? "border-purple-400 bg-purple-50" : "border-slate-200 bg-white",
            )}
          >
            <div className="font-semibold text-slate-700">拖拽复用</div>
            <div className="mt-1">
              把右侧队列里的任务卡片拖到这里，自动回填当时的：提示词 + 参数 + 预设选择（衣服图片仍以当前上传为准）。
            </div>
            {!!workbenchNotice && <div className="mt-2 text-purple-700">{workbenchNotice}</div>}
          </div>

          <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between">
                <CardTitle className="flex items-center gap-2 text-base">
                  <Images className="w-4 h-4" /> 风格学习卡片
                </CardTitle>
                <div className="flex items-center gap-2">
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
                  <Button variant="secondary" onClick={() => styleInputRef.current?.click()} disabled={styleLearning} className="gap-2">
                    {styleLearning ? <Loader2 className="w-4 h-4 animate-spin" /> : <UploadCloud className="w-4 h-4" />}
                    上传学习（≤{MAX_STYLE_LEARN_IMAGES}）
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                {stylePresets.length ? (
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                    {stylePresets.map((p: StylePreset) => (
                      <PresetCard
                        key={p.id}
                        id={p.id}
                        name={p.name}
                        thumbnailPath={p.thumbnailPath || p.imagePaths?.[0]}
                        kindLabel="STYLE"
                        selected={selectedStyleIds.includes(p.id)}
                        onToggle={() => setSelectedStyleIds((prev) => (prev.includes(p.id) ? [] : [p.id]))}
                        onOpenDetails={() => openPresetDetails("STYLE", p)}
                        onRetry={async () => {
                          // 复用已保存图片重新学习，并覆盖更新 promptBlock/analysis
                          await (relearnStylePreset as any)(p.id);
                          await fetchStylePresets();
                        }}
                        onRename={(next) => updateStylePreset(p.id, { name: next })}
                        description={p.description}
                        onDelete={async () => {
                          await deleteStylePreset(p.id);
                          setSelectedStyleIds((prev) => prev.filter((x) => x !== p.id));
                        }}
                      />
                    ))}
                  </div>
                ) : (
                  <div className="text-sm text-muted-foreground">暂无风格卡片，先上传风格图学习。</div>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between">
                <CardTitle className="flex items-center gap-2 text-base">
                  <Sparkles className="w-4 h-4" /> 姿势学习卡片（1图=1卡）
                </CardTitle>
                <div className="flex items-center gap-2">
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
                  <Button variant="secondary" onClick={() => poseInputRef.current?.click()} disabled={poseLearning} className="gap-2">
                    {poseLearning ? <Loader2 className="w-4 h-4 animate-spin" /> : <UploadCloud className="w-4 h-4" />}
                    上传学习
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                {posePresets.length ? (
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                    {posePresets.map((p: PosePreset) => (
                      <PresetCard
                        key={p.id}
                        id={p.id}
                        name={p.name}
                        thumbnailPath={p.thumbnailPath || p.imagePaths?.[0]}
                        kindLabel="POSE"
                        selected={selectedPoseIds.includes(p.id)}
                        onToggle={() => togglePoseSelect(p.id)}
                        onOpenDetails={() => openPresetDetails("POSE", p)}
                        onRename={(next) => updatePosePreset(p.id, { name: next })}
                        description={p.description}
                        onDelete={async () => {
                          await deletePosePreset(p.id);
                          setSelectedPoseIds((prev) => prev.filter((x) => x !== p.id));
                        }}
                      />
                    ))}
                  </div>
                ) : (
                  <div className="text-sm text-muted-foreground">暂无姿势卡片，先上传姿势图学习。</div>
                )}
              </CardContent>
            </Card>

            {/* Face: 放到上方卡片区，保持紧凑；“选择/管理”弹窗操作 */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center justify-between gap-2">
                  <span className="flex items-center gap-2">
                    <UserRound className="w-4 h-4" />
                    人脸/模特（最多 {MAX_FACE_SELECT} 张）
                  </span>
                  <Button variant="secondary" size="sm" className="gap-2" onClick={() => setFaceDialogOpen(true)}>
                    选择/管理
                  </Button>
                </CardTitle>
              </CardHeader>
              <CardContent className="pt-0 space-y-3">
                <div className="flex items-center justify-between gap-2">
                  <div className="text-xs text-muted-foreground">已选 {selectedFaceIds.length}/{MAX_FACE_SELECT}</div>
                  {!!selectedFaceIds.length && (
                    <Button type="button" variant="ghost" size="sm" onClick={() => setSelectedFaceIds([])}>
                      清空
                    </Button>
                  )}
                </div>

                {facePresetsAll.length ? (
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                    {facePresetsAll
                      .slice()
                      .sort((a, b) => b.createdAt - a.createdAt)
                      .map((p) => (
                        <PresetCard
                          key={p.id}
                          id={p.id}
                          name={p.name}
                          thumbnailPath={p.thumbnailPath || p.imagePath}
                          kindLabel="FACE"
                          selected={selectedFaceIds.includes(p.id)}
                        onToggle={() => toggleFaceSelect(p.id)}
                        onRename={(next) => updateFacePreset(p.id, { name: next })}
                        description={p.description}
                        onDelete={async () => {
                          await deleteFacePreset(p.id);
                          setSelectedFaceIds((prev) => prev.filter((x) => x !== p.id));
                        }}
                        />
                      ))}
                  </div>
                ) : (
                  <div className="text-sm text-muted-foreground">暂无人脸/模特卡片，点右上角“选择/管理”新建。</div>
                )}

                <div className="text-xs text-muted-foreground">提示：人脸不占衣服 6 张名额；用于保持面部身份一致性。</div>
              </CardContent>
            </Card>
          </div>

          {/* Generate: 下方全宽，作为页面主体 */}
          <div className="mt-6">
            <Card>
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <Wand2 className="w-4 h-4" /> 生成
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div
                  className={cn(
                    "space-y-2 rounded-xl border border-dashed p-3 transition-colors",
                    garmentDragOver ? "border-primary bg-primary/5" : "border-muted",
                  )}
                  onDragEnter={onGarmentDragEnter}
                  onDragLeave={onGarmentDragLeave}
                  onDragOver={onGarmentDragOver}
                  onDrop={onGarmentDrop}
                >
                  <div className="flex items-center justify-between">
                    <div className="text-sm font-semibold">上传衣服图片</div>
                    <div className="text-xs text-muted-foreground">
                      {garmentFiles.length}/{MAX_GARMENT_IMAGES}
                    </div>
                  </div>

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
                  <div className="flex items-center gap-2">
                    <Button variant="secondary" onClick={() => garmentInputRef.current?.click()} className="gap-2">
                      <UploadCloud className="w-4 h-4" /> 选择图片
                    </Button>
                    <Button variant="ghost" onClick={() => setGarmentFiles([])} disabled={!garmentFiles.length} className="text-muted-foreground">
                      清空
                    </Button>
                  </div>

                  {!garmentFiles.length && (
                    <div className="text-xs text-muted-foreground">
                      支持拖拽图片到此处上传（最多 {MAX_GARMENT_IMAGES} 张）
                    </div>
                  )}

                  {!!garmentFiles.length && (
                    <div className="flex gap-2 overflow-x-auto pb-1">
                      {garmentUrls.map((u, idx) => (
                        <div key={`${u}-${idx}`} className="relative w-20 h-20 flex-shrink-0 rounded-xl overflow-hidden border bg-muted">
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img src={u} alt={`garment-${idx}`} className="w-full h-full object-cover" />
                          <button
                            type="button"
                            className="absolute top-1 right-1 bg-black/60 text-white rounded-full w-6 h-6 flex items-center justify-center"
                            onClick={() => removeGarmentAt(idx)}
                            title="移除"
                          >
                            <X className="w-3 h-3" />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}

                  {!!garmentFiles.length && (
                    <div className="text-xs text-muted-foreground">
                      总大小：
                      {(garmentFiles.reduce((sum, f) => sum + (f.size || 0), 0) / (1024 * 1024)).toFixed(2)}MB
                    </div>
                  )}
                </div>

                <Separator />

                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <div className="text-sm font-semibold">提示词</div>
                    <div className="text-xs text-muted-foreground">可不选卡片，直接用提示词生成</div>
                  </div>

                  {savedPrompts.length > 0 && (
                    <Select
                      onValueChange={(id) => {
                        const p = savedPrompts.find((x) => x.id === id);
                        if (p) {
                          setPromptTouched(true);
                          setPrompt(p.text);
                        }
                      }}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="选择已保存提示词" />
                      </SelectTrigger>
                      <SelectContent>
                        {savedPrompts.map((p) => (
                          <SelectItem key={p.id} value={p.id}>
                            {p.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}

                  <Textarea
                    value={prompt}
                    onChange={(e) => {
                      setPromptTouched(true);
                      setPrompt(e.target.value);
                    }}
                    placeholder="例如：白色背景棚拍，模特穿着上传衣服，要求自然褶皱与真实光影，面部清晰..."
                    className="min-h-[140px]"
                  />

                  <div className="flex flex-col md:flex-row gap-2">
                    <Input value={promptName} onChange={(e) => setPromptName(e.target.value)} placeholder="保存名（可选）" />
                    <div className="flex gap-2">
                      <Button type="button" variant="secondary" onClick={savePrompt} className="gap-2">
                        保存提示词
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        onClick={() => {
                          if (!savedPrompts.length) return;
                          const last = savedPrompts[0];
                          if (confirm(`删除最近保存的提示词：${last.name} ?`)) deleteSavedPrompt(last.id);
                        }}
                        disabled={!savedPrompts.length}
                      >
                        删除最近
                      </Button>
                    </div>
                  </div>
                </div>

                <Separator />

                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <div className="text-xs font-semibold text-muted-foreground">输出尺寸（1K/2K/4K）</div>
                    <Select value={resolution} onValueChange={(v) => setResolution(v as any)}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="1K">1K</SelectItem>
                        <SelectItem value="2K">2K</SelectItem>
                        <SelectItem value="4K">4K</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-1">
                    <div className="text-xs font-semibold text-muted-foreground">画面比例</div>
                    <Select value={aspectRatio} onValueChange={(v) => setAspectRatio(v as any)}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="1:1">1:1</SelectItem>
                        <SelectItem value="4:3">4:3</SelectItem>
                        <SelectItem value="3:4">3:4</SelectItem>
                        <SelectItem value="16:9">16:9</SelectItem>
                        <SelectItem value="9:16">9:16</SelectItem>
                        <SelectItem value="21:9">21:9</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-1">
                    <div className="text-xs font-semibold text-muted-foreground">Seed（可选）</div>
                    <Input value={seedRaw} onChange={(e) => setSeedRaw(e.target.value)} placeholder="整数，例如 123" />
                  </div>

                  <div className="space-y-1">
                    <div className="text-xs font-semibold text-muted-foreground">Temperature（可选）</div>
                    <Input value={temperatureRaw} onChange={(e) => setTemperatureRaw(e.target.value)} placeholder="0~2，例如 0.8" />
                  </div>

                  <div className="flex items-center justify-between gap-3 rounded-xl border p-3 md:col-span-2">
                    <div className="space-y-0.5">
                      <div className="text-sm font-semibold">includeThoughts（实验）</div>
                      <div className="text-xs text-muted-foreground">仅生图阶段启用；服务端会强制输出 IMAGE，并在无图时自动关闭 thinking 重试。</div>
                    </div>
                    <Switch checked={includeThoughts} onCheckedChange={setIncludeThoughts} />
                  </div>
                </div>

                <Separator />

                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <div className="text-sm font-semibold">对话指令（可选）</div>
                    <div className="text-xs text-muted-foreground">
                      当前任务：{activeTaskId ? activeTaskId.slice(0, 8) : "未选择"}
                    </div>
                  </div>
                  <Textarea
                    value={chatMessage}
                    onChange={(e) => setChatMessage(e.target.value)}
                    placeholder="例如：把背景更暖一些、镜头更近、提高对比度、脸更清晰、保持衣服细节不变..."
                    className="min-h-[90px]"
                  />
                  <div className="flex items-center justify-between">
                    <div className="text-xs text-muted-foreground">
                      提示：打开右侧任务大图后点“重新生成”，若此处有内容会走对话流程；留空则按任务原始提示词重绘。
                    </div>
                    <Button variant="ghost" onClick={() => setChatMessage("")} disabled={!chatMessage.trim()}>
                      清空
                    </Button>
                  </div>
                </div>

                <div className="flex items-center justify-between text-xs text-muted-foreground">
                  <span>预计消耗：{estimatedCreditsCost} 积分</span>
                  <span>余额：{creditsLoaded ? balance : "..."}</span>
                </div>
                {creditsLoaded && balance < estimatedCreditsCost && (
                  <div className="text-xs text-rose-600">积分不足，无法生成；请先充值。</div>
                )}

                <Button
                  onClick={onGenerate}
                  disabled={creating || (creditsLoaded && balance < estimatedCreditsCost)}
                  className="w-full gap-2"
                >
                  {creating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Wand2 className="w-4 h-4" />}
                  生成（直出图）
                </Button>
              </CardContent>
            </Card>
          </div>
        </div>

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

      <Dialog open={presetDetailOpen} onOpenChange={setPresetDetailOpen}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>详情/编辑</DialogTitle>
          </DialogHeader>
          {presetDetail ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="rounded-xl border bg-muted overflow-hidden">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={toImgSrc(presetDetail.thumbnailPath || presetDetail.imagePaths?.[0])}
                  alt={presetDetail.name}
                  className="w-full h-full object-cover"
                  loading="lazy"
                  decoding="async"
                />
              </div>
              <div className="space-y-3">
                <div className="space-y-1">
                  <div className="text-xs font-semibold text-muted-foreground">名称</div>
                  <Input value={presetDetailName} onChange={(e) => setPresetDetailName(e.target.value)} />
                </div>
                <div className="space-y-1">
                  <div className="text-xs font-semibold text-muted-foreground">备注</div>
                  <Textarea
                    value={presetDetailDesc}
                    onChange={(e) => setPresetDetailDesc(e.target.value)}
                    placeholder="可记录拍摄要点、风格备注..."
                    className="min-h-[110px]"
                  />
                </div>
                <div className="flex flex-wrap gap-2 pt-2">
                  <Button
                    variant="secondary"
                    disabled={presetDetailBusy !== null}
                    onClick={async () => {
                      if (!presetDetailId || !presetDetailKind) return;
                      const nextName = presetDetailName.trim();
                      if (!nextName) {
                        alert("名称不能为空");
                        return;
                      }
                      setPresetDetailBusy("save");
                      try {
                        if (presetDetailKind === "STYLE") {
                          await updateStylePreset(presetDetailId, {
                            name: nextName,
                            description: presetDetailDesc.trim(),
                          });
                        } else {
                          await updatePosePreset(presetDetailId, {
                            name: nextName,
                            description: presetDetailDesc.trim(),
                          });
                        }
                        closePresetDetails();
                      } finally {
                        setPresetDetailBusy(null);
                      }
                    }}
                  >
                    保存
                  </Button>
                  <Button
                    variant="secondary"
                    disabled={presetDetailBusy !== null}
                    onClick={async () => {
                      if (!presetDetailId || !presetDetailKind) return;
                      if (!confirm("重新学习会覆盖该卡片的 AI 分析结果，是否继续？")) return;
                      setPresetDetailBusy("relearn");
                      try {
                        if (presetDetailKind === "STYLE") {
                          await (relearnStylePreset as any)(presetDetailId);
                          await fetchStylePresets();
                        } else {
                          await (relearnPosePreset as any)(presetDetailId);
                          await fetchPosePresets();
                        }
                      } finally {
                        setPresetDetailBusy(null);
                      }
                    }}
                  >
                    重新学习
                  </Button>
                  <Button
                    variant="destructive"
                    disabled={presetDetailBusy !== null}
                    onClick={async () => {
                      if (!presetDetailId || !presetDetailKind) return;
                      if (!confirm("确定删除该卡片吗？")) return;
                      setPresetDetailBusy("delete");
                      try {
                        if (presetDetailKind === "STYLE") {
                          await deleteStylePreset(presetDetailId);
                          setSelectedStyleIds((prev) => prev.filter((x) => x !== presetDetailId));
                        } else {
                          await deletePosePreset(presetDetailId);
                          setSelectedPoseIds((prev) => prev.filter((x) => x !== presetDetailId));
                        }
                        closePresetDetails();
                      } finally {
                        setPresetDetailBusy(null);
                      }
                    }}
                  >
                    删除
                  </Button>
                </div>
              </div>
            </div>
          ) : (
            <div className="text-sm text-muted-foreground">卡片不存在或已删除。</div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
