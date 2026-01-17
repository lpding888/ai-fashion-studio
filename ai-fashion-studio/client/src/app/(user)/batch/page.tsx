'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import api, { createDirectTaskFromUrls, directRegenerateTask } from '@/lib/api';
import { useAuth } from '@/hooks/use-auth';
import { useCredits, calculateRequiredCredits } from '@/hooks/use-credits';
import { useFormHistory, type FormHistoryItem } from '@/hooks/useFormHistory';
import { uploadFileToCos } from '@/lib/cos';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { useToast } from '@/components/ui/use-toast';
import { ImageLightbox, type LightboxItem } from '@/components/image-lightbox';
import { setTaskWatermark } from '@/lib/watermark';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { FacePresetSelector } from '@/components/face-preset-selector';
import { useStylePresetStore } from '@/store/style-preset-store';
import { usePosePresetStore } from '@/store/pose-preset-store';
import { useFacePresetStore } from '@/store/face-preset-store';
import {
  Plus,
  Trash2,
  UploadCloud,
  X,
  Play,
  Loader2,
  Layers,
  Images,
  CheckCircle2,
  AlertTriangle,
  ExternalLink,
} from 'lucide-react';

const MAX_GARMENT_IMAGES = 14;
const MAX_TOTAL_REF_IMAGES = 14;
const MAX_POSE_SELECT = 4;
const DIRECT_STYLE_NONE = '__none__';
const POLL_INTERVAL_MS = 2000;
const BATCH_STORAGE_KEY = 'afs:batch:last-session:v1';

type GroupRunStatus =
  | 'DRAFT'
  | 'CREATING'
  | 'QUEUED'
  | 'PLANNING'
  | 'RENDERING'
  | 'RETRYING'
  | 'COMPLETED'
  | 'FAILED';

type TaskStatus =
  | 'DRAFT'
  | 'PENDING'
  | 'QUEUED'
  | 'PLANNING'
  | 'AWAITING_APPROVAL'
  | 'RENDERING'
  | 'COMPLETED'
  | 'FAILED'
  | 'HERO_RENDERING'
  | 'AWAITING_HERO_APPROVAL'
  | 'STORYBOARD_PLANNING'
  | 'STORYBOARD_READY'
  | 'SHOTS_RENDERING';

type TaskApi = {
  id: string;
  status: TaskStatus;
  workflow?: 'legacy' | 'hero_storyboard';
  layout_mode?: 'Individual' | 'Grid';
  shotCount?: number;
  resultImages?: string[];
  shots?: Array<{
    id?: string;
    shotCode?: string;
    shot_id?: string;
    status: 'PENDING' | 'RENDERED' | 'FAILED';
    imageUrl?: string;
    imagePath?: string;
    error?: string;
  }>;
  brainPlan?: unknown;
  error?: string;
};

type BatchImageItem = {
  url: string;
  shotCode?: string;
};

type BatchGroup = {
  id: string;
  name: string;
  garmentFiles: File[];
  overrideRequirements: string;
  watermarkText: string;
  status: GroupRunStatus;
  taskId?: string;
  images: string[];
  imageItems: BatchImageItem[];
  error?: string;
  autoRetryUsed: boolean;
};

type BatchTaskItem = {
  groupId: string;
  groupName: string;
  taskId: string;
  createdAt: number;
  status: GroupRunStatus;
  images: string[];
  imageItems: BatchImageItem[];
  expectedImages: number;
  watermarkText: string;
  error?: string;
  autoRetryUsed: boolean;
};

type BatchMode = 'legacy' | 'direct';

function toImgSrc(pathOrUrl: string): string {
  if (!pathOrUrl) return '';
  const normalized = String(pathOrUrl).replace(/\\/g, '/');
  if (normalized.startsWith('http')) return normalized;
  const base = api.defaults.baseURL || '';
  return `${base}/${normalized}`.replace(/([^:]\/)\/+/g, '$1');
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

function GarmentUploadStrip(props: {
  files: File[];
  onChange: (files: File[]) => void;
  maxFiles?: number;
  disabled?: boolean;
}) {
  const { files, onChange, maxFiles = MAX_GARMENT_IMAGES, disabled } = props;
  const inputRef = React.useRef<HTMLInputElement>(null);
  const [isDragOver, setIsDragOver] = React.useState(false);
  const urls = useObjectUrls(files);

  const remaining = Math.max(0, maxFiles - files.length);

  const addFiles = (incoming: File[]) => {
    const images = incoming.filter((f) => f.type.startsWith('image/'));
    if (!images.length) return;
    onChange([...files, ...images.slice(0, remaining)]);
  };

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    if (disabled) return;
    setIsDragOver(false);
    if (!e.dataTransfer.files?.length) return;
    addFiles(Array.from(e.dataTransfer.files));
  };

  const removeAt = (idx: number) => {
    const next = [...files];
    next.splice(idx, 1);
    onChange(next);
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div className="text-xs font-bold text-white/80">衣服图</div>
        <span className="text-xs font-mono px-2 py-0.5 rounded bg-black/30 text-white/80">
          {files.length}/{maxFiles}
        </span>
      </div>

      <div
        onClick={() => !disabled && inputRef.current?.click()}
        onDragOver={(e) => {
          e.preventDefault();
          if (!disabled) setIsDragOver(true);
        }}
        onDragLeave={() => setIsDragOver(false)}
        onDrop={onDrop}
        className={[
          'rounded-2xl border-2 border-dashed transition-colors cursor-pointer bg-white/5',
          'px-4 py-4',
          disabled ? 'opacity-60 cursor-not-allowed' : '',
          isDragOver ? 'border-pink-400/60 bg-pink-500/10' : 'border-white/15 hover:border-white/30 hover:bg-white/8',
        ].join(' ')}
      >
        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          multiple
          disabled={disabled}
          className="hidden"
          onChange={(e) => {
            if (disabled) return;
            if (e.target.files?.length) addFiles(Array.from(e.target.files));
            e.target.value = '';
          }}
        />

        {files.length === 0 ? (
          <div className="flex items-center gap-3 text-white/70">
            <div className="w-10 h-10 rounded-xl bg-white/10 flex items-center justify-center border border-white/10">
              <UploadCloud className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <div className="text-sm font-bold">点击上传 或 拖拽图片至此</div>
              <div className="text-xs text-white/45 mt-0.5">支持 PNG/JPG（单组最多 {maxFiles} 张）</div>
            </div>
          </div>
        ) : (
          <div className="flex items-center gap-3 overflow-x-auto pb-1">
            {urls.map((url, idx) => (
              <div
                key={`${url}-${idx}`}
                className="relative w-20 h-20 rounded-xl overflow-hidden border border-white/10 bg-black/20 flex-shrink-0"
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={url} alt="preview" className="w-full h-full object-cover" />
                {!disabled && (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      removeAt(idx);
                    }}
                    className="absolute top-1 right-1 w-7 h-7 rounded-full bg-black/60 border border-white/10 text-white flex items-center justify-center hover:bg-red-500/80 transition-colors"
                    title="移除"
                  >
                    <X className="w-4 h-4" />
                  </button>
                )}
              </div>
            ))}

            {!disabled && remaining > 0 && (
              <div className="w-20 h-20 rounded-xl border-2 border-dashed border-white/15 bg-white/5 flex items-center justify-center flex-shrink-0 hover:border-white/30">
                <Plus className="w-6 h-6 text-white/60" />
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function statusBadge(status: GroupRunStatus) {
  switch (status) {
    case 'DRAFT':
      return <Badge className="bg-white/10 text-white/80 border border-white/10">待开始</Badge>;
    case 'CREATING':
      return <Badge className="bg-blue-500/20 text-blue-200 border border-blue-500/30">创建中</Badge>;
    case 'QUEUED':
      return <Badge className="bg-amber-500/20 text-amber-200 border border-amber-500/30">排队中</Badge>;
    case 'PLANNING':
      return <Badge className="bg-indigo-500/20 text-indigo-200 border border-indigo-500/30">规划中</Badge>;
    case 'RENDERING':
      return <Badge className="bg-purple-500/20 text-purple-200 border border-purple-500/30">生成中</Badge>;
    case 'RETRYING':
      return <Badge className="bg-orange-500/20 text-orange-200 border border-orange-500/30">重试中</Badge>;
    case 'COMPLETED':
      return (
        <Badge className="bg-emerald-500/20 text-emerald-200 border border-emerald-500/30">
          <CheckCircle2 className="w-3 h-3 mr-1" /> 已完成
        </Badge>
      );
    case 'FAILED':
      return (
        <Badge className="bg-rose-500/20 text-rose-200 border border-rose-500/30">
          <AlertTriangle className="w-3 h-3 mr-1" /> 失败
        </Badge>
      );
  }
}

function createGroup(index: number): BatchGroup {
  return {
    id: cryptoId(),
    name: `款式 ${index}`,
    garmentFiles: [],
    overrideRequirements: '',
    watermarkText: '',
    status: 'DRAFT',
    images: [],
    imageItems: [],
    autoRetryUsed: false,
  };
}

function cryptoId() {
  return `g-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function loadBatchSession(): BatchTaskItem[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(BATCH_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as { tasks?: unknown };
    return Array.isArray(parsed?.tasks) ? (parsed.tasks as BatchTaskItem[]) : [];
  } catch {
    return [];
  }
}

function saveBatchSession(tasks: BatchTaskItem[]) {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(BATCH_STORAGE_KEY, JSON.stringify({ tasks }));
  } catch {
    // ignore
  }
}

export default function BatchCreatePage() {
  const router = useRouter();
  const { toast } = useToast();
  const { user, isAuthenticated } = useAuth();
  const { balance, calculateRequired } = useCredits();
  const { historyItems } = useFormHistory();

  const [mode, setMode] = React.useState<BatchMode>('legacy');

  const [presetId, setPresetId] = React.useState<string>('');
  const preset = React.useMemo<FormHistoryItem | undefined>(
    () => historyItems.find((h) => h.id === presetId),
    [historyItems, presetId],
  );

  // Direct（直出图批量）配置
  const [directPrompt, setDirectPrompt] = React.useState<string>('');
  const [directResolution, setDirectResolution] = React.useState<'1K' | '2K' | '4K'>('2K');
  const [directAspectRatio, setDirectAspectRatio] = React.useState<'1:1' | '4:3' | '3:4' | '16:9' | '9:16' | '21:9'>('3:4');
  const [directIncludeThoughts, setDirectIncludeThoughts] = React.useState(false);
  const [directSeedRaw, setDirectSeedRaw] = React.useState<string>('');
  const [directTemperatureRaw, setDirectTemperatureRaw] = React.useState<string>('');

  const stylePresetsAll = useStylePresetStore((s) => s.presets);
  const fetchStylePresets = useStylePresetStore((s) => s.fetchPresets);
  const posePresetsAll = usePosePresetStore((s) => s.presets);
  const fetchPosePresets = usePosePresetStore((s) => s.fetchPresets);
  const fetchFacePresets = useFacePresetStore((s) => s.fetchPresets);

  const [selectedStyleId, setSelectedStyleId] = React.useState<string>(DIRECT_STYLE_NONE);
  const [selectedPoseIds, setSelectedPoseIds] = React.useState<string[]>([]);
  const [selectedFaceIds, setSelectedFaceIds] = React.useState<string[]>([]);
  const [faceDialogOpen, setFaceDialogOpen] = React.useState(false);

  const [groups, setGroups] = React.useState<BatchGroup[]>([createGroup(1)]);
  const [parallel, setParallel] = React.useState<number>(3);
  const [autoApprove, setAutoApprove] = React.useState<boolean>(true);
  const [isRunning, setIsRunning] = React.useState(false);
  const [isCreatingTasks, setIsCreatingTasks] = React.useState(false);
  const [directPaused, setDirectPaused] = React.useState(false);
  const [directPauseReason, setDirectPauseReason] = React.useState<string | null>(null);
  const [directResumeIndex, setDirectResumeIndex] = React.useState<number>(0);
  const [createdCount, setCreatedCount] = React.useState(0);
  const [batchTasks, setBatchTasks] = React.useState<BatchTaskItem[]>([]);
  const [retryingKeys, setRetryingKeys] = React.useState<Record<string, boolean>>({});
  const [lightboxOpen, setLightboxOpen] = React.useState(false);
  const [lightboxImages, setLightboxImages] = React.useState<LightboxItem[]>([]);
  const [lightboxInitialIndex, setLightboxInitialIndex] = React.useState(0);
  const [lightboxTaskId, setLightboxTaskId] = React.useState<string>('');
  const [lightboxIsGrid, setLightboxIsGrid] = React.useState(false);

  const groupsRef = React.useRef<BatchGroup[]>(groups);
  React.useEffect(() => {
    groupsRef.current = groups;
  }, [groups]);

  React.useEffect(() => {
    const restored = loadBatchSession();
    if (restored.length > 0) {
      setBatchTasks(restored);
    }
  }, []);

  React.useEffect(() => {
    saveBatchSession(batchTasks);
  }, [batchTasks]);

  const batchTasksRef = React.useRef<BatchTaskItem[]>(batchTasks);
  React.useEffect(() => {
    batchTasksRef.current = batchTasks;
  }, [batchTasks]);

  const retryingKeysRef = React.useRef<Record<string, boolean>>(retryingKeys);
  React.useEffect(() => {
    retryingKeysRef.current = retryingKeys;
  }, [retryingKeys]);

  const balanceRef = React.useRef<number>(balance);
  React.useEffect(() => {
    balanceRef.current = balance;
  }, [balance]);

  const directRunTokenRef = React.useRef(0);

  React.useEffect(() => {
    if (!isAuthenticated) return;
    if (!user) return;
    void fetchStylePresets();
    void fetchPosePresets();
    void fetchFacePresets();
  }, [isAuthenticated, user, fetchStylePresets, fetchPosePresets, fetchFacePresets]);

  const legacyPerTaskCost = React.useMemo(() => {
    if (!preset) return 0;
    return calculateRequired({
      shotCount: preset.shotCount,
      layoutMode: preset.layoutMode,
      resolution: preset.resolution,
    });
  }, [preset, calculateRequired]);

  const directPerTaskCost = React.useMemo(() => (directResolution === '4K' ? 4 : 1), [directResolution]);

  const perTaskCost = mode === 'direct' ? directPerTaskCost : legacyPerTaskCost;
  const totalCost =
    mode === 'direct'
      ? directPerTaskCost * groups.filter((g) => g.garmentFiles.length > 0).length
      : legacyPerTaskCost * groups.length;

  const expectedImagesPerGroup = React.useMemo(() => {
    if (mode === 'direct') return 1;
    if (!preset) return 0;
    return preset.layoutMode === 'Grid' ? 1 : preset.shotCount;
  }, [mode, preset]);

  const canStart =
    mode === 'direct'
      ? !!directPrompt.trim() && groups.some((g) => g.garmentFiles.length > 0) && !isRunning && !isCreatingTasks
      : !!preset && groups.every((g) => g.garmentFiles.length > 0) && !isRunning && !isCreatingTasks;

  const maxGarmentsPerGroup = mode === 'direct'
    ? Math.max(1, MAX_TOTAL_REF_IMAGES - selectedFaceIds.length)
    : MAX_GARMENT_IMAGES;

  const updateGroup = (id: string, patch: Partial<BatchGroup>) => {
    setGroups((prev) => prev.map((g) => (g.id === id ? { ...g, ...patch } : g)));
  };

  const updateGroupByTaskId = (taskId: string, patch: Partial<BatchGroup>) => {
    const safeTaskId = String(taskId || '').trim();
    if (!safeTaskId) return;
    setGroups((prev) => prev.map((g) => (g.taskId === safeTaskId ? { ...g, ...patch } : g)));
  };

  const togglePoseSelect = (id: string) => {
    const safeId = String(id || '').trim();
    if (!safeId) return;
    setSelectedPoseIds((prev) => {
      const exists = prev.includes(safeId);
      if (exists) return prev.filter((x) => x !== safeId);
      if (prev.length >= MAX_POSE_SELECT) {
        toast({ title: '姿势选择已达上限', description: `最多选择 ${MAX_POSE_SELECT} 个姿势` });
        return prev;
      }
      return [...prev, safeId];
    });
  };

  const addGroup = () => {
    setGroups((prev) => [...prev, createGroup(prev.length + 1)]);
  };

  const removeGroup = (id: string) => {
    setGroups((prev) => prev.filter((g) => g.id !== id));
  };

  const buildTaskFormData = (group: BatchGroup, preset: FormHistoryItem) => {
    const formData = new FormData();
    for (const f of group.garmentFiles) formData.append('files', f);

    const requirements = group.overrideRequirements.trim()
      ? group.overrideRequirements.trim()
      : (preset.requirements || '').trim();

    formData.append('requirements', requirements);
    formData.append('workflow', 'legacy');
    formData.append('autoApprove', String(!!autoApprove));
    formData.append('shot_count', String(preset.shotCount));
    formData.append('layout_mode', preset.layoutMode);
    formData.append('resolution', preset.resolution);
    formData.append('aspect_ratio', preset.aspectRatio);

    if (preset.location) formData.append('location', preset.location);
    if (preset.styleDirection) formData.append('style_direction', preset.styleDirection);
    if (preset.garmentFocus) formData.append('garment_focus', preset.garmentFocus);

    if (preset.facePresetIds?.length) formData.append('face_preset_ids', preset.facePresetIds.join(','));
    if (preset.stylePresetIds?.length) formData.append('style_preset_ids', preset.stylePresetIds.join(','));

    return formData;
  };

  const createTaskForGroup = async (group: BatchGroup, preset: FormHistoryItem) => {
    const formData = buildTaskFormData(group, preset);
    const res = await api.post('/tasks', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
    return res.data as TaskApi;
  };

  const fetchTask = async (taskId: string) => {
    const res = await api.get(`/tasks/${taskId}`);
    return res.data as TaskApi;
  };

  const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

  const waitForTaskTerminal = async (taskId: string, token: number): Promise<TaskApi> => {
    // 直出图：返回后后台异步出图，前端轮询直到 COMPLETED / FAILED
    // token：用于在用户中途停止/切换模式时终止等待
    // eslint-disable-next-line no-constant-condition
    while (true) {
      if (directRunTokenRef.current !== token) throw new Error('任务已中止');
      const latest = await fetchTask(taskId);
      if (latest.status === 'COMPLETED' || latest.status === 'FAILED') return latest;
      await sleep(POLL_INTERVAL_MS);
    }
  };

  const createDirectTaskForGroup = async (group: BatchGroup, token: number) => {
    if (group.garmentFiles.length > maxGarmentsPerGroup) {
      throw new Error(`当前已选人脸 ${selectedFaceIds.length} 张，总参考图上限 ${MAX_TOTAL_REF_IMAGES}；单组衣服最多 ${maxGarmentsPerGroup} 张`);
    }

    // 先直传 COS（按文件 hash 去重）
    const urls: string[] = [];
    for (const f of group.garmentFiles) {
      if (directRunTokenRef.current !== token) throw new Error('任务已中止');
      const url = await uploadFileToCos(f);
      urls.push(url);
    }

    const seed = directSeedRaw.trim() ? Number(directSeedRaw.trim()) : undefined;
    const temperature = directTemperatureRaw.trim() ? Number(directTemperatureRaw.trim()) : undefined;

    const payload = {
      garmentUrls: urls,
      prompt: directPrompt.trim(),
      resolution: directResolution,
      aspectRatio: directAspectRatio,
      includeThoughts: directIncludeThoughts,
      ...(Number.isFinite(seed) ? { seed: seed as number } : {}),
      ...(Number.isFinite(temperature) ? { temperature: temperature as number } : {}),
      ...(selectedStyleId !== DIRECT_STYLE_NONE ? { stylePresetIds: [selectedStyleId] } : {}),
      ...(selectedPoseIds.length ? { posePresetIds: selectedPoseIds } : {}),
      ...(selectedFaceIds.length ? { facePresetIds: selectedFaceIds } : {}),
    };

    const created = (await createDirectTaskFromUrls(payload as any)) as TaskApi;
    return created;
  };

  const statusFromTask = (task: TaskApi): GroupRunStatus => {
    if (task.status === 'QUEUED') return 'QUEUED';
    if (task.status === 'PLANNING' || task.status === 'AWAITING_APPROVAL') return 'PLANNING';
    if (task.status === 'RENDERING') return 'RENDERING';
    if (task.status === 'COMPLETED') return 'COMPLETED';
    if (task.status === 'FAILED') return 'FAILED';
    return 'PLANNING';
  };

  const upsertBatchTask = (next: BatchTaskItem) => {
    setBatchTasks((prev) => {
      const idx = prev.findIndex((t) => t.taskId === next.taskId);
      if (idx === -1) return [...prev, next];
      const copy = [...prev];
      copy[idx] = { ...copy[idx], ...next };
      return copy;
    });
  };

  const isRetryingKey = (key: string) => !!retryingKeys[key];
  const setRetryingKey = (key: string, v: boolean) => {
    setRetryingKeys((prev) => ({ ...prev, [key]: v }));
  };

  const isTaskInFlight = (taskId: string) => {
    const safeTaskId = String(taskId || '').trim();
    if (!safeTaskId) return false;
    return Object.entries(retryingKeysRef.current).some(([k, v]) => !!v && k.startsWith(`${safeTaskId}:`));
  };

  const syncOneTaskFromServer = async (taskId: string) => {
    const safeTaskId = String(taskId || '').trim();
    if (!safeTaskId) return;
    const local = batchTasksRef.current.find((t) => t.taskId === safeTaskId);
    if (!local) return;

    const latest = await fetchTask(safeTaskId);
    const images = Array.isArray(latest.resultImages) ? latest.resultImages : [];
    const normalizedImages = images.filter(Boolean);

    const shotList = Array.isArray(latest.shots) ? latest.shots : [];
    const imageItems: BatchImageItem[] = shotList
      .filter((s) => s.status === 'RENDERED' && !!(s.imageUrl || s.imagePath))
      .map((s) => ({
        url: (s.imageUrl || s.imagePath) as string,
        shotCode: (s.shotCode || s.shot_id || s.id) as string | undefined,
      }))
      .filter((s) => !!s.url);

    const nextStatus = statusFromTask(latest);
    upsertBatchTask({
      ...local,
      status: nextStatus,
      images: normalizedImages,
      imageItems,
      error: latest.error,
    });
    updateGroup(local.groupId, {
      taskId: local.taskId,
      status: nextStatus,
      images: normalizedImages,
      imageItems,
      error: latest.error,
    });
  };

  const buildLightboxImagesFromTask = (task: TaskApi): { isGrid: boolean; items: LightboxItem[] } => {
    const layoutMode = (task.layout_mode || 'Individual') as 'Individual' | 'Grid';
    const isGrid = layoutMode === 'Grid';

    if (isGrid) {
      const url = (Array.isArray(task.resultImages) ? task.resultImages[0] : undefined) || '';
      const normalized = url ? toImgSrc(url) : '';
      return { isGrid: true, items: normalized ? [{ id: 'grid', url: normalized }] : [] };
    }

    const shots = Array.isArray(task.shots) ? task.shots : [];
    const items = shots
      .filter((s) => s.status === 'RENDERED' && !!(s.imageUrl || s.imagePath))
      .map((s, idx) => {
        const id = String((s.shotCode || s.shot_id || s.id || `${idx + 1}`) ?? '').trim() || `${idx + 1}`;
        const url = toImgSrc(String((s.imageUrl || s.imagePath) ?? '').trim());
        return { id, url };
      })
      .filter((x) => !!x.url);

    return { isGrid: false, items };
  };

  const openLightboxForTask = async (taskId: string, opts?: { initialIndex?: number }) => {
    const safeTaskId = String(taskId || '').trim();
    if (!safeTaskId) return;

    try {
      const latest = await fetchTask(safeTaskId);
      const { isGrid, items } = buildLightboxImagesFromTask(latest);
      if (items.length === 0) return; // 无图时不提示

      setLightboxTaskId(safeTaskId);
      setLightboxIsGrid(isGrid);
      setLightboxImages(items);
      setLightboxInitialIndex(Math.max(0, Math.min(items.length - 1, opts?.initialIndex ?? 0)));
      setLightboxOpen(true);
    } catch {
      // 静默失败
    }
  };

  const retryOneShot = async (taskId: string, shotCode: string) => {
    const safeTaskId = String(taskId || '').trim();
    const safeShot = String(shotCode || '').trim();
    if (!safeTaskId || !safeShot) return;

    const key = `${safeTaskId}:shot:${safeShot}`;
    if (isRetryingKey(key)) return;
    setRetryingKey(key, true);

    // 乐观更新：让列表/分组立刻进入“生成中”（保留旧图，直到新图回填）
    setBatchTasks((prev) =>
      prev.map((t) => (t.taskId === safeTaskId ? { ...t, status: 'RENDERING', error: undefined } : t)),
    );
    updateGroupByTaskId(safeTaskId, { status: 'RENDERING', error: undefined });
    try {
      await api.post(`/tasks/${safeTaskId}/retry?shotId=${encodeURIComponent(safeShot)}`);
      toast({ title: '已提交重绘', description: `正在重绘镜头 ${safeShot}…` });
      await syncOneTaskFromServer(safeTaskId);
    } catch (err: unknown) {
      const maybe = err as { response?: { data?: { message?: unknown } }; message?: unknown };
      const messageFromApi = typeof maybe?.response?.data?.message === 'string' ? maybe.response.data.message : undefined;
      const messageFromError = typeof maybe?.message === 'string' ? maybe.message : undefined;
      toast({ variant: 'destructive', title: '重绘失败', description: messageFromApi || messageFromError || '操作遇到错误，请稍后再试' });
    } finally {
      setRetryingKey(key, false);
    }
  };

  const retryGrid = async (taskId: string) => {
    const safeTaskId = String(taskId || '').trim();
    if (!safeTaskId) return;
    const key = `${safeTaskId}:grid`;
    if (isRetryingKey(key)) return;
    setRetryingKey(key, true);

    // 乐观更新：让列表/分组立刻进入“生成中”（保留旧图，直到新图回填）
    setBatchTasks((prev) =>
      prev.map((t) => (t.taskId === safeTaskId ? { ...t, status: 'RENDERING', error: undefined } : t)),
    );
    updateGroupByTaskId(safeTaskId, { status: 'RENDERING', error: undefined });
    try {
      await api.post(`/tasks/${safeTaskId}/retry-render`);
      toast({ title: '已提交重绘拼图', description: '正在重新生成整张拼图…' });
      await syncOneTaskFromServer(safeTaskId);
    } catch (err: unknown) {
      const maybe = err as { response?: { data?: { message?: unknown } }; message?: unknown };
      const messageFromApi = typeof maybe?.response?.data?.message === 'string' ? maybe.response.data.message : undefined;
      const messageFromError = typeof maybe?.message === 'string' ? maybe.message : undefined;
      toast({ variant: 'destructive', title: '重绘拼图失败', description: messageFromApi || messageFromError || '操作遇到错误，请稍后再试' });
    } finally {
      setRetryingKey(key, false);
    }
  };

  const retryDirectTask = async (taskId: string) => {
    const safeTaskId = String(taskId || '').trim();
    if (!safeTaskId) return;

    const key = `${safeTaskId}:direct-regenerate`;
    if (isRetryingKey(key)) return;
    setRetryingKey(key, true);

    setBatchTasks((prev) =>
      prev.map((t) => (t.taskId === safeTaskId ? { ...t, status: 'RENDERING', error: undefined } : t)),
    );
    updateGroupByTaskId(safeTaskId, { status: 'RENDERING', error: undefined });

    try {
      await directRegenerateTask(safeTaskId);
      toast({ title: '已提交重新生成', description: '直出图正在重新生成…' });
      await refreshTasksOnce();
    } catch (err: unknown) {
      const maybe = err as { response?: { data?: { message?: unknown } }; message?: unknown };
      const messageFromApi = typeof maybe?.response?.data?.message === 'string' ? maybe.response.data.message : undefined;
      const messageFromError = typeof maybe?.message === 'string' ? maybe.message : undefined;
      toast({ variant: 'destructive', title: '重新生成失败', description: messageFromApi || messageFromError || '操作遇到错误，请稍后再试' });
      updateGroupByTaskId(safeTaskId, { status: 'FAILED', error: messageFromApi || messageFromError || '重新生成失败' });
    } finally {
      setRetryingKey(key, false);
    }
  };

  const retryWholeTask = async (taskId: string) => {
    const safeTaskId = String(taskId || '').trim();
    if (!safeTaskId) return;

    const key = `${safeTaskId}:task`;
    if (isRetryingKey(key)) return;
    setRetryingKey(key, true);

    // 乐观更新：立即把状态切到“重试中”，避免用户感知“点了没反应”
    setBatchTasks((prev) =>
      prev.map((t) => (t.taskId === safeTaskId ? { ...t, status: 'RETRYING', error: undefined } : t)),
    );
    updateGroupByTaskId(safeTaskId, { status: 'RETRYING', error: undefined });

    try {
      const latest = await fetchTask(safeTaskId);
      if (!latest?.brainPlan) {
        await api.post(`/tasks/${safeTaskId}/retry-brain`);
        toast({ title: '已提交重试', description: '正在重新规划（Brain）…' });
      } else {
        await api.post(`/tasks/${safeTaskId}/retry-render`);
        toast({ title: '已提交重试', description: '正在重新生成（Painter）…' });
      }

      // 立即刷新一次，让 UI 尽快同步到 QUEUED/PLANNING/RENDERING
      await refreshTasksOnce();
    } catch (err: unknown) {
      const maybe = err as { response?: { data?: { message?: unknown } }; message?: unknown };
      const messageFromApi = typeof maybe?.response?.data?.message === 'string' ? maybe.response.data.message : undefined;
      const messageFromError = typeof maybe?.message === 'string' ? maybe.message : undefined;

      // 回滚到失败态并展示错误
      setBatchTasks((prev) =>
        prev.map((t) =>
          t.taskId === safeTaskId ? { ...t, status: 'FAILED', error: messageFromApi || messageFromError || '重试失败' } : t,
        ),
      );
      updateGroupByTaskId(safeTaskId, { status: 'FAILED', error: messageFromApi || messageFromError || '重试失败' });

      toast({ variant: 'destructive', title: '重试失败', description: messageFromApi || messageFromError || '操作遇到错误，请稍后再试' });
    } finally {
      setRetryingKey(key, false);
    }
  };

  const retryOnceByTask = async (task: TaskApi) => {
    if (!task?.id) return;

    // 兼容直出图任务：失败后走 direct-regenerate（不会触发 Brain 重规划）
    const isDirect = !!(task as any).directPrompt || String((task as any).scene || '').toLowerCase() === 'direct';
    if (isDirect) {
      await directRegenerateTask(task.id);
      return;
    }

    if (!task.brainPlan) {
      await api.post(`/tasks/${task.id}/retry-brain`);
      return;
    }
    await api.post(`/tasks/${task.id}/retry-render`);
  };

  const refreshTasksOnce = async () => {
    const targets = batchTasksRef.current.filter(
      (t) =>
        // 正常轮询：只刷新未完成任务
        (t.status !== 'COMPLETED' && (t.status !== 'FAILED' || !t.autoRetryUsed))
        // 重绘期间：即使本地/服务端暂时仍是 COMPLETED，也继续轮询，避免“点了没反应/不回填”
        || isTaskInFlight(t.taskId),
    );
    if (targets.length === 0) return;

    const concurrency = Math.max(1, Math.min(3, parallel));
    type InFlight = { promise: Promise<void>; done: boolean };
    let inFlight: InFlight[] = [];

    for (const t of targets) {
      while (inFlight.filter((x) => !x.done).length >= concurrency) {
        await Promise.race(inFlight.map((x) => x.promise));
        inFlight = inFlight.filter((x) => !x.done);
      }

      const entry: InFlight = { done: false, promise: Promise.resolve() };
      entry.promise = (async () => {
        const latest = await fetchTask(t.taskId);
        const images = Array.isArray(latest.resultImages) ? latest.resultImages : [];
        const normalizedImages = images.filter(Boolean);

        const shotList = Array.isArray(latest.shots) ? latest.shots : [];
        const imageItems: BatchImageItem[] = shotList
          .filter((s) => s.status === 'RENDERED' && !!(s.imageUrl || s.imagePath))
          .map((s) => ({
            url: (s.imageUrl || s.imagePath) as string,
            shotCode: (s.shotCode || s.shot_id || s.id) as string | undefined,
          }))
          .filter((s) => !!s.url);

        const nextStatus = statusFromTask(latest);
        const effectiveStatus = (isTaskInFlight(t.taskId) && nextStatus === 'COMPLETED') ? 'RENDERING' : nextStatus;

        upsertBatchTask({
          ...t,
          status: effectiveStatus,
          images: normalizedImages,
          imageItems,
          error: latest.error,
        });

        updateGroup(t.groupId, {
          taskId: t.taskId,
          status: effectiveStatus,
          images: normalizedImages,
          imageItems,
          error: latest.error,
        });

        if (mode !== 'direct' && latest.status === 'FAILED' && !t.autoRetryUsed) {
          upsertBatchTask({ ...t, status: 'RETRYING', autoRetryUsed: true });
          updateGroup(t.groupId, { status: 'RETRYING', autoRetryUsed: true });
          await retryOnceByTask(latest);
        }
      })()
        .catch(() => undefined)
        .finally(() => {
          entry.done = true;
        });

      inFlight.push(entry);
    }

    await Promise.all(inFlight.map((x) => x.promise));
  };

  const pollerActiveRef = React.useRef(false);
  React.useEffect(() => {
    if (batchTasks.length === 0) return;
    if (pollerActiveRef.current) return;
    pollerActiveRef.current = true;

    let timer: ReturnType<typeof setTimeout> | undefined;
    const tick = async () => {
      if (!pollerActiveRef.current) return;
      await refreshTasksOnce();
      timer = setTimeout(tick, POLL_INTERVAL_MS);
    };

    timer = setTimeout(tick, 200);
    return () => {
      pollerActiveRef.current = false;
      if (timer) clearTimeout(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [batchTasks.length]);

  const createTasksForAllGroups = async () => {
    if (!preset) return;

    const orderedGroups = groupsRef.current.filter((g) => g.garmentFiles.length > 0);
    setCreatedCount(0);
    setIsCreatingTasks(true);

    try {
      const concurrency = Math.max(1, Math.min(3, parallel));
      type InFlight = { promise: Promise<void>; done: boolean };
      let inFlight: InFlight[] = [];

      for (const group of orderedGroups) {
        updateGroup(group.id, {
          status: 'CREATING',
          error: undefined,
          images: [],
          imageItems: [],
          taskId: undefined,
          autoRetryUsed: false,
        });

        while (inFlight.filter((x) => !x.done).length >= concurrency) {
          await Promise.race(inFlight.map((x) => x.promise));
          inFlight = inFlight.filter((x) => !x.done);
        }

        const entry: InFlight = { done: false, promise: Promise.resolve() };
        entry.promise = (async () => {
          const created = await createTaskForGroup(group, preset);
          const nextStatus = statusFromTask(created);

          updateGroup(group.id, { taskId: created.id, status: nextStatus, imageItems: [] });
          upsertBatchTask({
            groupId: group.id,
            groupName: group.name,
            taskId: created.id,
            createdAt: Date.now(),
            status: nextStatus,
            images: [],
            imageItems: [],
            expectedImages: expectedImagesPerGroup,
            watermarkText: group.watermarkText,
            autoRetryUsed: false,
          });

          setTaskWatermark(created.id, {
            text: group.watermarkText,
            style: {
              position: preset.watermarkPosition,
              opacity: preset.watermarkOpacity,
              size: preset.watermarkSize,
              color: preset.watermarkColor,
              stroke: preset.watermarkStroke,
              shadow: preset.watermarkShadow,
            },
          });
          setCreatedCount((n) => n + 1);
        })()
          .catch((err: unknown) => {
            const maybe = err as { response?: { data?: { message?: unknown } }; message?: unknown };
            const messageFromApi = typeof maybe?.response?.data?.message === 'string' ? maybe.response.data.message : undefined;
            const messageFromError = typeof maybe?.message === 'string' ? maybe.message : undefined;
            updateGroup(group.id, { status: 'FAILED', error: messageFromApi || messageFromError || '创建任务失败' });
          })
          .finally(() => {
            entry.done = true;
          });

        inFlight.push(entry);
      }

      await Promise.all(inFlight.map((x) => x.promise));
    } finally {
      setIsCreatingTasks(false);
    }
  };

  const runDirectBatchSerial = async (startIndex: number) => {
    const token = ++directRunTokenRef.current;
    setCreatedCount(0);

    const orderedGroups = groupsRef.current.filter((g) => g.garmentFiles.length > 0);
    const safeStart = Math.max(0, Math.min(orderedGroups.length, startIndex));

    for (let i = safeStart; i < orderedGroups.length; i += 1) {
      const group = orderedGroups[i];

      // 积分不足：暂停（等待用户充值后继续）
      if (balanceRef.current < directPerTaskCost) {
        setDirectPaused(true);
        setDirectPauseReason(`积分不足：每组需要 ${directPerTaskCost} 积分，当前余额 ${balanceRef.current}`);
        setDirectResumeIndex(i);
        toast({ title: '已暂停', description: '积分不足，请充值后点击“继续”。' });
        return;
      }

      updateGroup(group.id, {
        status: 'CREATING',
        error: undefined,
        images: [],
        imageItems: [],
        taskId: undefined,
        autoRetryUsed: false,
      });

      try {
        const created = await createDirectTaskForGroup(group, token);
        const nextStatus = statusFromTask(created);

        updateGroup(group.id, { taskId: created.id, status: nextStatus, imageItems: [] });
        upsertBatchTask({
          groupId: group.id,
          groupName: group.name,
          taskId: created.id,
          createdAt: Date.now(),
          status: nextStatus,
          images: [],
          imageItems: [],
          expectedImages: 1,
          watermarkText: group.watermarkText,
          autoRetryUsed: false,
        });

        if (group.watermarkText.trim()) {
          setTaskWatermark(created.id, { text: group.watermarkText.trim() });
        }

        setCreatedCount((n) => n + 1);

        // 等待终态：COMPLETED / FAILED
        let latest = await waitForTaskTerminal(created.id, token);
        await syncOneTaskFromServer(created.id).catch(() => undefined);

        const shouldPauseForCredits = (t: TaskApi) => String(t?.error || '').includes('积分不足');

        if (latest.status === 'FAILED') {
          if (shouldPauseForCredits(latest)) {
            setDirectPaused(true);
            setDirectPauseReason(String(latest.error || '积分不足'));
            setDirectResumeIndex(i);
            toast({ title: '已暂停', description: '积分不足，请充值后点击“继续”。' });
            return;
          }

          // 自动重试一次：对同一个任务走 direct-regenerate（不重复上传）
          updateGroup(group.id, { status: 'RETRYING', autoRetryUsed: true });
          upsertBatchTask({
            groupId: group.id,
            groupName: group.name,
            taskId: created.id,
            createdAt: Date.now(),
            status: 'RETRYING',
            images: [],
            imageItems: [],
            expectedImages: 1,
            watermarkText: group.watermarkText,
            autoRetryUsed: true,
          });

          await directRegenerateTask(created.id);
          latest = await waitForTaskTerminal(created.id, token);
          await syncOneTaskFromServer(created.id).catch(() => undefined);
        }

        // 二次仍失败：继续下一组（不抛错）
        if (latest.status === 'FAILED') {
          updateGroup(group.id, { status: 'FAILED', error: String(latest.error || '生成失败') });
        }
      } catch (err: unknown) {
        const maybe = err as { response?: { data?: { message?: unknown } }; message?: unknown };
        const messageFromApi = typeof maybe?.response?.data?.message === 'string' ? maybe.response.data.message : undefined;
        const messageFromError = typeof maybe?.message === 'string' ? maybe.message : undefined;
        const msg = messageFromApi || messageFromError || '创建任务失败';

        if (String(msg).includes('积分不足')) {
          setDirectPaused(true);
          setDirectPauseReason(String(msg));
          setDirectResumeIndex(i);
          toast({ title: '已暂停', description: '积分不足，请充值后点击“继续”。' });
          return;
        }

        updateGroup(group.id, { status: 'FAILED', error: msg });
      }
    }
  };

  const handleStart = async () => {
    if (mode === 'direct') {
      const p = directPrompt.trim();
      if (!p) {
        toast({ title: '请填写提示词', description: '直出图批量需要先设置提示词' });
        return;
      }

      const ordered = groupsRef.current.filter((g) => g.garmentFiles.length > 0);
      if (ordered.length === 0) {
        toast({ title: '请完善分组', description: '至少上传 1 组衣服图' });
        return;
      }

      const overLimit = ordered.find((g) => g.garmentFiles.length > maxGarmentsPerGroup);
      if (overLimit) {
        toast({
          title: '参考图数量超限',
          description: `当前已选人脸 ${selectedFaceIds.length} 张，总参考图上限 ${MAX_TOTAL_REF_IMAGES}；单组衣服最多 ${maxGarmentsPerGroup} 张`,
        });
        return;
      }

      const startIndex = directPaused ? directResumeIndex : 0;
      setIsRunning(true);
      try {
        setDirectPaused(false);
        setDirectPauseReason(null);
        toast({
          title: directPaused ? '继续执行直出图批量…' : '开始执行直出图批量…',
          description: '串行执行：成功→下一组；失败自动重试一次；积分不足会暂停。',
        });
        await runDirectBatchSerial(startIndex);
      } finally {
        setIsRunning(false);
      }
      return;
    }

    // Legacy batch
    if (!preset) {
      toast({ title: '请选择配置预设', description: 'Batch 需要先选择一条“保存配置”。' });
      return;
    }
    if (groups.some((g) => g.garmentFiles.length === 0)) {
      toast({ title: '请完善分组', description: '每组至少上传 1 张衣服图。' });
      return;
    }

    const required = calculateRequiredCredits({
      shotCount: preset.shotCount,
      layoutMode: preset.layoutMode,
      resolution: preset.resolution,
    }) * groups.length;

    if (balance < required) {
      toast({
        title: '积分不足',
        description: `需要 ${required} 积分，当前余额 ${balance}。请先充值或减少分组数量。`,
      });
      return;
    }

    setIsRunning(true);
    try {
      toast({
        title: '正在创建批量任务…',
        description: '请保持页面开启直到任务全部创建完成（创建完成后可退后台）。',
      });
      await createTasksForAllGroups();
    } finally {
      setIsRunning(false);
    }
  };

  if (!isAuthenticated) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center">
        <Card className="bg-white/5 border-white/10">
          <CardContent className="p-8 text-center text-white/80">
            <div className="text-lg font-bold">请先登录</div>
            <div className="text-sm text-white/50 mt-2">批量企划室需要登录后使用</div>
            <Button className="mt-6" onClick={() => router.push('/login')}>
              去登录
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <>
      <main className="min-h-screen bg-gradient-to-br from-slate-900 via-indigo-950 to-slate-950 w-full px-4 py-10 relative overflow-hidden">
      <div className="fixed inset-0 z-0">
        <div className="absolute top-[-20%] right-[-10%] w-[70%] h-[70%] rounded-full bg-orange-400/50 blur-[140px] animate-pulse-slow" />
        <div className="absolute bottom-[-10%] left-[-10%] w-[60%] h-[60%] rounded-full bg-pink-400/50 blur-[140px] animate-pulse-slow delay-1000" />
        <div className="absolute top-[40%] left-[30%] w-[50%] h-[50%] rounded-full bg-rose-500/30 blur-[120px] animate-pulse-slow delay-2000" />
        <div className="absolute top-[50%] right-[30%] w-[40%] h-[40%] rounded-full bg-violet-500/25 blur-[100px] animate-pulse-slow delay-500" />
        <div className="absolute inset-0 bg-[url('/grid.svg')] bg-center opacity-20 [mask-image:linear-gradient(180deg,white,rgba(255,255,255,0))]" />
      </div>

      <div className="w-full max-w-6xl mx-auto space-y-6 relative z-10">
        <div className="flex flex-col md:flex-row md:items-end gap-4 justify-between">
          <div>
            <div className="text-3xl font-black text-white tracking-tight">批量企划室</div>
            <div className="text-sm text-white/50 mt-1">
              {mode === 'direct'
                ? '直出图参数 → 多组上传（直传 COS）→ 串行直出图（失败自动重试 1 次）'
                : '选择预设 → 多组上传 → 并发≤3 自动跑完先规划后出图'}
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-2 bg-white/5 border border-white/10 rounded-2xl px-3 py-2">
              <span className="text-xs text-white/70 font-bold">模式</span>
              <Select
                value={mode}
                onValueChange={(v) => {
                  setMode(v as BatchMode);
                  setDirectPaused(false);
                  setDirectPauseReason(null);
                  setDirectResumeIndex(0);
                }}
              >
                <SelectTrigger className="h-8 w-[140px] bg-black/20 border-white/10 text-white">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="legacy">Legacy（规划+出图）</SelectItem>
                  <SelectItem value="direct">直出图批量</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {mode !== 'direct' ? (
              <>
                <div className="flex items-center gap-2 bg-white/5 border border-white/10 rounded-2xl px-3 py-2">
                  <Layers className="w-4 h-4 text-white/60" />
                  <span className="text-xs text-white/70 font-bold">并行</span>
                  <Select value={String(parallel)} onValueChange={(v) => setParallel(Math.max(1, Math.min(3, parseInt(v))))}>
                    <SelectTrigger className="h-8 w-[90px] bg-black/20 border-white/10 text-white">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="1">1</SelectItem>
                      <SelectItem value="2">2</SelectItem>
                      <SelectItem value="3">3</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="flex items-center gap-2 bg-white/5 border border-white/10 rounded-2xl px-3 py-2">
                  <span className="text-xs text-white/70 font-bold">无需审核</span>
                  <Switch checked={autoApprove} onCheckedChange={setAutoApprove} />
                </div>
              </>
            ) : (
              <div className="flex items-center gap-2 bg-white/5 border border-white/10 rounded-2xl px-3 py-2">
                <Layers className="w-4 h-4 text-white/60" />
                <span className="text-xs text-white/70 font-bold">串行</span>
                <span className="text-xs text-white/50">1</span>
              </div>
            )}

            <Button
              className="rounded-2xl px-5 gap-2"
              disabled={!canStart}
              onClick={handleStart}
            >
              {isRunning ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
              {isRunning ? '执行中…' : (mode === 'direct' && directPaused ? '继续' : '开始执行')}
            </Button>
          </div>
        </div>

        {mode === 'direct' && directPaused && (
          <Card className="border-0 shadow-lg bg-amber-500/10 backdrop-blur-xl overflow-hidden ring-1 ring-amber-500/30">
            <CardContent className="p-4 text-amber-100 text-sm">
              已暂停：{directPauseReason || '积分不足'}（充值后点右上角“继续”）
            </CardContent>
          </Card>
        )}

        {mode !== 'direct' && (
        <Card className="border-0 shadow-lg bg-gradient-to-b from-white/12 to-white/8 backdrop-blur-xl overflow-hidden ring-1 ring-white/25">
          <div className="h-1 bg-gradient-to-r from-orange-500 via-pink-500 to-purple-500" />
          <CardContent className="p-5 space-y-4">
            <div className="flex flex-col md:flex-row gap-4 md:items-center justify-between">
              <div className="space-y-1">
                <div className="text-sm font-bold text-white/90">配置预设</div>
                <div className="text-xs text-white/45">从“保存配置”选择一条作为本次批量的默认参数（全场共用）</div>
              </div>
              <div className="flex items-center gap-3">
                <Select value={presetId} onValueChange={setPresetId}>
                  <SelectTrigger className="h-10 w-[360px] bg-black/20 border-white/10 text-white">
                    <SelectValue placeholder={historyItems.length ? '选择配置预设…' : '暂无预设（请先在首页保存配置）'} />
                  </SelectTrigger>
                  <SelectContent>
                    {historyItems.map((h) => (
                      <SelectItem key={h.id} value={h.id}>
                        {(h.name || h.requirements || '未命名').slice(0, 40)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                <div className="flex items-center gap-2 text-xs text-white/70 bg-black/20 border border-white/10 rounded-xl px-3 py-2">
                  <Images className="w-4 h-4 text-white/50" />
                  <span>预计 {totalCost} 积分</span>
                  <span className="text-white/40">/</span>
                  <span>余额 {balance}</span>
                </div>
              </div>
            </div>

            {isCreatingTasks && (
              <div className="flex items-center justify-between gap-3 text-xs text-white/70 bg-black/20 border border-white/10 rounded-xl px-3 py-2">
                <div className="flex items-center gap-2">
                  <Loader2 className="w-4 h-4 animate-spin text-orange-300" />
                  <span className="font-bold">创建任务中</span>
                  <span className="text-white/40">（请不要切后台/刷新）</span>
                </div>
                <span className="font-mono">{createdCount}/{groups.length}</span>
              </div>
            )}

            {preset && (
              <div className="flex flex-wrap gap-2 pt-1">
                <Badge className="bg-black/30 text-white/80 border border-white/10">先规划后出图</Badge>
                <Badge className="bg-black/30 text-white/80 border border-white/10">
                  {preset.layoutMode === 'Grid' ? '拼图' : '单图'}
                </Badge>
                <Badge className="bg-black/30 text-white/80 border border-white/10">{preset.resolution}</Badge>
                <Badge className="bg-black/30 text-white/80 border border-white/10">{preset.aspectRatio}</Badge>
                <Badge className="bg-black/30 text-white/80 border border-white/10">
                  {preset.layoutMode === 'Grid' ? '固定2' : `${preset.shotCount}张`}
                </Badge>
                {!!preset.facePresetIds?.length && (
                  <Badge className="bg-black/30 text-white/80 border border-white/10">
                    模特预设×{preset.facePresetIds.length}
                  </Badge>
                )}
                {!!preset.stylePresetIds?.length && (
                  <Badge className="bg-black/30 text-white/80 border border-white/10">
                    风格预设×{preset.stylePresetIds.length}
                  </Badge>
                )}
              </div>
            )}
          </CardContent>
        </Card>
        )}

        {mode === 'direct' && (
          <Card className="border-0 shadow-lg bg-gradient-to-b from-white/12 to-white/8 backdrop-blur-xl overflow-hidden ring-1 ring-white/25">
            <div className="h-1 bg-gradient-to-r from-orange-500 via-pink-500 to-purple-500" />
            <CardContent className="p-5 space-y-4">
              <div className="flex flex-col md:flex-row gap-4 md:items-start justify-between">
                <div className="space-y-1">
                  <div className="text-sm font-bold text-white/90">直出图配置</div>
                  <div className="text-xs text-white/45">全场共用（风格/姿势/人脸一次选择；每组=1张图；串行执行）</div>
                </div>
                <div className="flex items-center gap-2 text-xs text-white/70 bg-black/20 border border-white/10 rounded-xl px-3 py-2">
                  <Images className="w-4 h-4 text-white/50" />
                  <span>每组 {perTaskCost} 积分</span>
                  <span className="text-white/40">/</span>
                  <span>余额 {balance}</span>
                </div>
              </div>

              <div className="text-xs text-white/55">
                总参考图上限 {MAX_TOTAL_REF_IMAGES}：已选人脸 {selectedFaceIds.length} 张 → 单组衣服最多 {maxGarmentsPerGroup} 张
              </div>

              <div className="space-y-2">
                <div className="text-xs font-bold text-white/80">提示词（必填）</div>
                <Textarea
                  value={directPrompt}
                  onChange={(e) => setDirectPrompt(e.target.value)}
                  className="bg-black/20 border-white/10 text-white min-h-[120px]"
                  placeholder="例如：Commercial fashion photography...（会与已选风格/姿势 JSON 组合）"
                />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                <div className="space-y-1">
                  <div className="text-xs font-bold text-white/80">输出尺寸</div>
                  <Select value={directResolution} onValueChange={(v) => setDirectResolution(v as any)}>
                    <SelectTrigger className="h-10 bg-black/20 border-white/10 text-white">
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
                  <div className="text-xs font-bold text-white/80">画面比例</div>
                  <Select value={directAspectRatio} onValueChange={(v) => setDirectAspectRatio(v as any)}>
                    <SelectTrigger className="h-10 bg-black/20 border-white/10 text-white">
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

                <div className="flex items-center justify-between gap-3 rounded-xl border border-white/10 bg-black/20 px-3 py-2">
                  <div className="space-y-0.5">
                    <div className="text-xs font-bold text-white/80">includeThoughts（实验）</div>
                    <div className="text-[11px] text-white/45">仅生图阶段启用（服务端仍强制输出 IMAGE）</div>
                  </div>
                  <Switch checked={directIncludeThoughts} onCheckedChange={setDirectIncludeThoughts} />
                </div>

                <div className="space-y-1">
                  <div className="text-xs font-bold text-white/80">Seed（可选）</div>
                  <Input
                    value={directSeedRaw}
                    onChange={(e) => setDirectSeedRaw(e.target.value)}
                    className="bg-black/20 border-white/10 text-white"
                    placeholder="整数，例如 123"
                  />
                </div>

                <div className="space-y-1">
                  <div className="text-xs font-bold text-white/80">Temperature（可选）</div>
                  <Input
                    value={directTemperatureRaw}
                    onChange={(e) => setDirectTemperatureRaw(e.target.value)}
                    className="bg-black/20 border-white/10 text-white"
                    placeholder="0~2，例如 0.8"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <div className="space-y-1">
                  <div className="text-xs font-bold text-white/80">风格（最多 1）</div>
                  <Select value={selectedStyleId} onValueChange={(v) => setSelectedStyleId(v)}>
                    <SelectTrigger className="h-10 bg-black/20 border-white/10 text-white">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={DIRECT_STYLE_NONE}>不选（中性风格）</SelectItem>
                      {stylePresetsAll
                        .filter((s) => s.kind !== 'POSE')
                        .slice()
                        .sort((a, b) => b.createdAt - a.createdAt)
                        .map((s) => (
                          <SelectItem key={s.id} value={s.id}>
                            {s.name}
                          </SelectItem>
                        ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-1">
                  <div className="text-xs font-bold text-white/80">姿势（最多 {MAX_POSE_SELECT}）</div>
                  <div className="h-10 flex items-center gap-2 text-xs text-white/60 bg-black/20 border border-white/10 rounded-xl px-3">
                    已选 {selectedPoseIds.length}/{MAX_POSE_SELECT}
                  </div>
                  <div className="max-h-[160px] overflow-y-auto rounded-xl border border-white/10 bg-black/10 p-2 space-y-1">
                    {posePresetsAll
                      .slice()
                      .sort((a, b) => b.createdAt - a.createdAt)
                      .map((p) => {
                        const active = selectedPoseIds.includes(p.id);
                        return (
                          <button
                            key={p.id}
                            type="button"
                            className={`w-full text-left px-3 py-2 rounded-lg border transition-colors ${active ? 'border-purple-400/60 bg-purple-500/20 text-white' : 'border-white/10 bg-black/10 text-white/80 hover:bg-white/5'}`}
                            onClick={() => togglePoseSelect(p.id)}
                          >
                            <div className="text-xs font-bold">{p.name}</div>
                            {!!p.description && <div className="text-[11px] text-white/45 line-clamp-1">{p.description}</div>}
                          </button>
                        );
                      })}
                    {posePresetsAll.length === 0 && <div className="text-xs text-white/45 px-2 py-2">暂无姿势预设</div>}
                  </div>
                </div>

                <div className="space-y-1">
                  <div className="text-xs font-bold text-white/80">人脸/模特（最多 3）</div>
                  <div className="flex items-center justify-between gap-2 h-10 bg-black/20 border border-white/10 rounded-xl px-3">
                    <div className="text-xs text-white/70">已选 {selectedFaceIds.length}/3</div>
                    <Button type="button" size="sm" variant="outline" className="h-7 border-white/15 bg-black/20 hover:bg-white/10 text-white/90" onClick={() => setFaceDialogOpen(true)}>
                      选择/管理
                    </Button>
                  </div>
                  <div className="text-[11px] text-white/45">
                    人脸占总参考图名额（总上限 {MAX_TOTAL_REF_IMAGES}）。
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {batchTasks.length > 0 && (
          <Card className="border-0 shadow-lg bg-white/5 backdrop-blur-xl overflow-hidden ring-1 ring-white/15">
            <div className="h-1 bg-gradient-to-r from-indigo-500 via-purple-500 to-pink-500" />
            <CardContent className="p-5 space-y-4">
              <div className="flex items-center justify-between">
                <div className="space-y-1">
                  <div className="text-sm font-bold text-white/90">本次批量任务</div>
                  <div className="text-xs text-white/45">页面刷新后会保留任务列表（只展示任务，不恢复上传缩略图）</div>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-white/60 hover:text-white hover:bg-white/10"
                  onClick={() => setBatchTasks([])}
                >
                  清空列表
                </Button>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {batchTasks
                  .slice()
                  .sort((a, b) => a.createdAt - b.createdAt)
                  .map((t) => (
                    <div
                      key={t.taskId}
                      className="p-4 rounded-2xl border border-white/10 bg-black/20 hover:bg-white/5 transition-colors"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="text-sm font-bold text-white truncate">{t.groupName}</div>
                          <div className="mt-2 flex items-center gap-2 flex-wrap">
                            {statusBadge(t.status)}
                            <Badge className="bg-black/30 text-white/70 border border-white/10">
                              输出 {t.images.length}/{t.expectedImages || '-'}
                            </Badge>
                          </div>
                        </div>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-8 px-3 text-xs text-white/70 hover:text-white hover:bg-white/10"
                          onClick={() => router.push(`/tasks/${t.taskId}`)}
                          title="打开任务详情"
                        >
                          <ExternalLink className="w-3.5 h-3.5 mr-1" />
                          详情
                        </Button>
                      </div>

                      {!!t.images.length && (
                        <div className="mt-3 flex gap-2 overflow-x-auto pb-1">
                          {t.images.slice(0, 6).map((img, idx) => (
                            <button
                              type="button"
                              key={`${t.taskId}-${idx}`}
                              className="relative w-16 h-16 rounded-xl overflow-hidden border border-white/10 bg-black/20 flex-shrink-0 hover:border-white/20"
                              title="点击查看大图（弹窗内可下载/重绘）"
                              onClick={() => void openLightboxForTask(t.taskId, { initialIndex: idx })}
                            >
                              {/* eslint-disable-next-line @next/next/no-img-element */}
                              <img src={toImgSrc(img)} alt="output" className="w-full h-full object-cover" />
                            </button>
                          ))}
                        </div>
                      )}

                      {!!t.watermarkText && (
                        <div className="mt-2 text-[11px] text-white/55">
                          水印：<span className="font-mono text-white/75">{t.watermarkText}</span>
                        </div>
                      )}

                      {!!t.error && <div className="mt-3 text-xs text-rose-200/90 line-clamp-2">{t.error}</div>}

                      {t.status === 'FAILED' && (
                        <div className="mt-3 flex items-center gap-2">
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            className="border-white/15 bg-black/20 hover:bg-white/10 text-white/90"
                            onClick={() => (mode === 'direct' ? void retryDirectTask(t.taskId) : void retryWholeTask(t.taskId))}
                            disabled={isRetryingKey(`${t.taskId}:${mode === 'direct' ? 'direct-regenerate' : 'task'}`)}
                          >
                            {isRetryingKey(`${t.taskId}:${mode === 'direct' ? 'direct-regenerate' : 'task'}`) ? '重试中...' : '重新生成'}
                          </Button>
                          <span className="text-[11px] text-white/50">{mode === 'direct' ? '失败后可手动重试（直出图重绘）' : '失败后可手动重试（自动切 Brain/Render）'}</span>
                        </div>
                      )}
                    </div>
                  ))}
              </div>
            </CardContent>
          </Card>
        )}

        <div className="flex items-center justify-between">
          <div className="text-sm font-bold text-white/90">分组（{groups.length}）</div>
          <Button variant="outline" className="rounded-2xl border-white/15 bg-black/20 hover:bg-white/10" onClick={addGroup} disabled={isRunning}>
            <Plus className="w-4 h-4 mr-2" />
            添加一组
          </Button>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
          {groups.map((g) => {
            const disabled =
              mode === 'direct'
                ? (isRunning || isCreatingTasks || directPaused)
                : (isRunning || isCreatingTasks) && ['CREATING', 'PLANNING', 'RENDERING', 'QUEUED', 'RETRYING'].includes(g.status);
            return (
              <Card key={g.id} className="bg-white/5 border-white/10 overflow-hidden hover:bg-white/8 hover:border-white/20 transition-colors">
                <CardContent className="p-5 space-y-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 space-y-1">
                      <Input
                        value={g.name}
                        disabled={disabled}
                        onChange={(e) => updateGroup(g.id, { name: e.target.value })}
                        className="bg-black/20 border-white/10 text-white font-bold"
                        placeholder="组名"
                      />
                      <Input
                        value={g.watermarkText}
                        disabled={disabled}
                        onChange={(e) => updateGroup(g.id, { watermarkText: e.target.value.slice(0, 50) })}
                        className="bg-black/20 border-white/10 text-white"
                        placeholder="款号水印（下载时叠加，最多 50 字）"
                      />
                      <div className="flex items-center gap-2">
                        {statusBadge(g.status)}
                        {!!g.taskId && (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 px-2 text-xs text-white/70 hover:text-white hover:bg-white/10"
                            onClick={() => router.push(`/tasks/${g.taskId}`)}
                            title="打开任务详情"
                          >
                            <ExternalLink className="w-3.5 h-3.5 mr-1" />
                            查看
                          </Button>
                        )}
                        {!!g.taskId && g.status === 'FAILED' && (
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            className="h-7 px-3 text-xs border-white/15 bg-black/20 hover:bg-white/10 text-white/90"
                            onClick={() => (mode === 'direct' ? void retryDirectTask(g.taskId as string) : void retryWholeTask(g.taskId as string))}
                            disabled={isRetryingKey(`${g.taskId}:${mode === 'direct' ? 'direct-regenerate' : 'task'}`)}
                            title={mode === 'direct' ? '失败后重新生成（直出图重绘）' : '失败后重新生成（自动切 Brain/Render）'}
                          >
                            {isRetryingKey(`${g.taskId}:${mode === 'direct' ? 'direct-regenerate' : 'task'}`) ? '重试中...' : '重新生成'}
                          </Button>
                        )}
                      </div>
                    </div>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-10 w-10 text-white/50 hover:text-red-200 hover:bg-red-500/10"
                      onClick={() => removeGroup(g.id)}
                      disabled={isRunning}
                      title="删除分组"
                    >
                      <Trash2 className="w-5 h-5" />
                    </Button>
                  </div>

                  <GarmentUploadStrip
                    files={g.garmentFiles}
                    onChange={(files) => updateGroup(g.id, { garmentFiles: files })}
                    disabled={disabled}
                    maxFiles={maxGarmentsPerGroup}
                  />

                  {mode !== 'direct' && (
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <div className="text-xs font-bold text-white/80">特定需求（覆盖预设 requirements）</div>
                        <span className="text-[11px] text-white/45">
                          {g.overrideRequirements.trim() ? '已覆盖' : '空=使用预设'}
                        </span>
                      </div>
                      <Textarea
                        value={g.overrideRequirements}
                        disabled={disabled}
                        onChange={(e) => updateGroup(g.id, { overrideRequirements: e.target.value })}
                        className="bg-black/20 border-white/10 text-white min-h-[90px]"
                        placeholder="例如：更强硬光、更夸张姿态、镜头更近…"
                      />
                    </div>
                  )}

                  {!!g.images.length && (
                    <div className="space-y-2">
                      <div className="text-xs font-bold text-white/80">
                        输出（{g.images.length}/{expectedImagesPerGroup || '-'}）
                      </div>
                      <div className="flex gap-3 overflow-x-auto pb-1">
                        {(() => {
                          const isGrid = expectedImagesPerGroup === 1;
                          const displayItems: BatchImageItem[] = isGrid
                            ? (g.images[0] ? [{ url: g.images[0] }] : [])
                            : ((g.imageItems.length ? g.imageItems : g.images.map((u) => ({ url: u } as BatchImageItem))) as BatchImageItem[]);

                          return displayItems.map((it, idx) => {
                            const url = it.url;
                            return (
                              <button
                                type="button"
                                key={`${url}-${idx}`}
                                className="relative w-24 h-24 rounded-xl overflow-hidden border border-white/10 bg-black/20 flex-shrink-0 hover:border-white/20"
                                title="点击查看大图（弹窗内可下载/重绘）"
                                onClick={() => !!g.taskId && void openLightboxForTask(g.taskId, { initialIndex: idx })}
                                disabled={!g.taskId}
                              >
                                {/* eslint-disable-next-line @next/next/no-img-element */}
                                <img src={toImgSrc(url)} alt="output" className="w-full h-full object-cover" />
                              </button>
                            );
                          });
                        })()}
                      </div>
                    </div>
                  )}

                  {!!g.error && (
                    <div className="flex items-start gap-2 p-3 rounded-xl border border-rose-500/30 bg-rose-500/10 text-rose-100 text-xs">
                      <AlertTriangle className="w-4 h-4 mt-0.5 flex-shrink-0" />
                      <div className="min-w-0 break-words">{g.error}</div>
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      </div>
      </main>

      <ImageLightbox
        images={lightboxImages}
        initialIndex={lightboxInitialIndex}
        open={lightboxOpen}
        onOpenChange={setLightboxOpen}
        watermarkTaskId={lightboxTaskId}
        onRegenerate={(id) => {
          if (!lightboxTaskId) return;
          if (mode === 'direct') {
            void retryDirectTask(lightboxTaskId);
            return;
          }
          if (lightboxIsGrid) void retryGrid(lightboxTaskId);
          else void retryOneShot(lightboxTaskId, id);
        }}
        regenerateLabel="重新生成"
        isRegenerating={
          !!lightboxTaskId && Object.entries(retryingKeys).some(([k, v]) => v && k.startsWith(`${lightboxTaskId}:`))
        }
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
    </>
  );
}
