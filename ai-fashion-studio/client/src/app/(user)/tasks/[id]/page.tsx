"use client";
/* eslint-disable @next/next/no-img-element */

import * as React from 'react';
import { useParams, useRouter } from 'next/navigation';
import api, { BACKEND_ORIGIN } from '@/lib/api';
import { withTencentCi } from '@/lib/image-ci';
import { downloadImageWithOptionalTaskWatermark } from '@/lib/watermark';
import { Loader2, ArrowLeft, Check, Sparkles, Brain, Camera, AlertCircle, ChevronDown, ChevronUp, Clock, Palette, Layers, Image as ImageIcon, RefreshCcw, Download, Save, Edit, ZoomIn, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import Link from 'next/link';
import { motion, AnimatePresence } from 'framer-motion';
import { Badge } from '@/components/ui/badge';
import { ImageEditor } from '@/components/image-editor';
import { ImageLightbox } from '@/components/image-lightbox';
import { useToast } from '@/components/ui/use-toast';
import { requestCreditsRefresh } from '@/hooks/use-credits';

const BUSY_STATUSES = new Set([
    'PLANNING',
    'RENDERING',
    'HERO_RENDERING',
    'STORYBOARD_PLANNING',
    'SHOTS_RENDERING',
]);

const CANCEL_LABEL_STATUSES = new Set([
    ...BUSY_STATUSES,
    'QUEUED',
    'PENDING',
    'AWAITING_APPROVAL',
    'AWAITING_HERO_APPROVAL',
]);

// --- Types ---
interface Shot {
    id: string;
    shot_id?: string;
    type: string;
    prompt: string;
    prompt_en?: string;
    camera_angle?: string;
    lighting?: string;
    imagePath?: string;
    imageUrl?: string;
    status: 'PENDING' | 'RENDERED' | 'FAILED';
}

type BrainMeta = {
    garment_summary?: string;
    must_keep_details?: string[];
    text_transcription_maybe?: string[];
    scene_text?: string;
    indoor_or_outdoor_final?: string;
    scene_from_user_input?: string;
    model_consistency_notes?: string;
    zeiss_camera_language?: string;
    risk_notes?: string[];
};

type BrainFrame = {
    id?: string;
    goal?: string;
    prompt_gen_zh?: string;
    prompt_gen_en?: string;
    camera?: { focal_length_hint?: string };
    composition?: { framing?: string };
    lighting_setup?: { scene_light?: string };
};

type BrainUiParams = {
    location?: string;
    style_tuning?: string;
    user_requirements?: string;
};

type CollageModeNote = {
    enabled?: boolean;
    layout?: string;
    note?: string;
};

type StoryboardCameraChoice = {
    system?: string;
    model?: string;
    f_stop?: string;
    fStop?: string;
    [key: string]: unknown;
};

type StoryboardProductLight = {
    key?: string;
    rim?: string;
    fill?: string;
    [key: string]: unknown;
};

type StoryboardLightingPlan = {
    scene_light?: string;
    sceneLight?: string;
    product_light?: StoryboardProductLight;
    productLight?: StoryboardProductLight;
    [key: string]: unknown;
};

type StoryboardPlanShot = {
    scene_subarea?: string;
    sceneSubarea?: string;
    action_pose?: string;
    actionPose?: string;
    shot_type?: string;
    shotType?: string;
    goal?: string;
    physical_logic?: string;
    physicalLogic?: string;
    composition_notes?: string;
    compositionNotes?: string;
    exec_instruction_text?: string;
    execInstructionText?: string;
    occlusion_guard?: string[];
    occlusionGuard?: string[];
    ref_requirements?: string[];
    refRequirements?: string[];
    universal_requirements?: string[];
    universalRequirements?: string[];
    lighting_plan?: StoryboardLightingPlan;
    lightingPlan?: StoryboardLightingPlan;
    camera_choice?: StoryboardCameraChoice;
    cameraChoice?: StoryboardCameraChoice;
    [key: string]: unknown;
};

interface BrainPlan {
    visual_analysis?: {
        vibe?: string;
        lighting?: string;
        composition?: string;
    };
    styling_plan?: {
        upper?: string;
        lower?: string;
        shoes?: string;
        accessories?: string;
    };
    shots?: Shot[];
    thinkingProcess?: string;
    // v3.0+ fields
    meta?: BrainMeta;
    frames?: BrainFrame[];
    ui_params?: BrainUiParams;
    collage_mode_note?: CollageModeNote;
    [key: string]: unknown; // 允许任意额外字段
}

type HeroAttempt = {
    createdAt: number;
    outputImageUrl?: string;
    outputShootLog?: string;
    error?: string;
};

type HeroHistoryItem = {
    createdAt: number;
    outputImageUrl?: string;
    outputShootLog?: string;
    promptText?: string;
    error?: string;
};

type ShotVariant = HeroAttempt & {
    __synthetic?: boolean;
};

interface TaskData {
    id: string;
    status:
        | 'DRAFT'
        | 'PENDING'
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
    workflow?: 'legacy' | 'hero_storyboard';
    requirements: string;
    layout_mode?: 'Individual' | 'Grid';
    brainPlan?: BrainPlan;
    shots?: Shot[];
    heroImageUrl?: string;
    heroShootLog?: string;
    heroApprovedAt?: number;
    heroSelectedAttemptCreatedAt?: number;
    heroHistory?: HeroHistoryItem[];
    storyboardCards?: Array<{
        index: number;
        action: string;
        blocking: string;
        camera: string;
        framing: string;
        lighting: string;
        occlusionNoGo: string;
        continuity: string;
    }>;
    storyboardPlan?: {
        shots?: StoryboardPlanShot[];
        [key: string]: unknown;
    };
    storyboardPlannedAt?: number;
    heroShots?: Array<{
        index: number;
        status: 'PENDING' | 'RENDERED' | 'FAILED';
        imageUrl?: string;
        shootLog?: string;
        error?: string;
        createdAt: number;
        selectedAttemptCreatedAt?: number;
        attempts?: HeroAttempt[];
    }>;
    gridImageUrl?: string;
    gridShootLog?: string;
    gridStatus?: 'PENDING' | 'RENDERED' | 'FAILED';
    error?: string;
    createdAt: number;
}

type StoryboardShotEditDraft = {
    sceneSubarea: string;
    actionPose: string;
    shotType: string;
    goal: string;
    physicalLogic: string;
    compositionNotes: string;
    execInstructionText: string;
    occlusionGuardText: string; // one item per line
    refRequirementsText: string; // one item per line
    universalRequirementsText: string; // one item per line
    lightingSceneLight: string;
    lightingKey: string;
    lightingRim: string;
    lightingFill: string;
    cameraSystem: string;
    cameraModel: string;
    cameraFStop: string;
};

function toLineText(value: unknown): string {
    if (!Array.isArray(value)) return '';
    return value
        .map((v) => (typeof v === 'string' ? v.trim() : ''))
        .filter(Boolean)
        .join('\n');
}

function toLineArray(text: string): string[] {
    return (text || '')
        .split('\n')
        .map((v) => v.trim())
        .filter(Boolean);
}

function isProbablyBase64Blob(value: string): boolean {
    const s = (value || '').trim();
    if (s.length < 200) return false;
    if (/[\s]/.test(s)) return false;
    if (!/^[A-Za-z0-9+/=]+$/.test(s)) return false;
    return true;
}

type ApiErrorShape = {
    response?: {
        status?: number;
        data?: {
            message?: string;
        };
    };
};

function getApiErrorMessage(error: unknown, fallback: string) {
    const maybe = error as ApiErrorShape;
    return maybe?.response?.data?.message || (error instanceof Error ? error.message : fallback);
}

function getApiErrorStatus(error: unknown) {
    const maybe = error as ApiErrorShape;
    return maybe?.response?.status;
}

/**
 * 智能适配器：自动识别 Brain Plan 版本并规范化为统一格式
 * 支持 v2.0 (visual_analysis/styling_plan) 和 v3.0 (meta/frames) 等多种版本
 */
function normalizeBrainPlan(plan: unknown): {
    version: 'v2' | 'v3' | 'unknown';
    summary: string;
    details: Array<{ label: string; value: string; important?: boolean }>;
    shots: Shot[];
    thinkingProcess?: string;
    rawMeta?: BrainMeta; // 保留原始 meta 供调试
} {
    const rawPlan = (plan || {}) as BrainPlan;
    if (!plan) {
        return {
            version: 'unknown',
            summary: '',
            details: [],
            shots: [],
        };
    }

    // 检测版本
    const hasV2Fields = rawPlan.visual_analysis || rawPlan.styling_plan;
    const hasV3Fields = rawPlan.meta || rawPlan.frames;

    if (hasV3Fields) {
        // ===== v3.0 格式：完整提取 =====
        const meta: BrainMeta = rawPlan.meta || {};
        const frames: BrainFrame[] = rawPlan.frames || [];
        const uiParams: BrainUiParams = rawPlan.ui_params || {};

        const details: Array<{ label: string; value: string; important?: boolean }> = [];

        // 1. 核心服装信息（最重要）
        if (meta.garment_summary) {
            details.push({
                label: '🎯 服装总结',
                value: meta.garment_summary,
                important: true
            });
        }

        // 2. 必须保留细节（关键）
        if (meta.must_keep_details && Array.isArray(meta.must_keep_details) && meta.must_keep_details.length > 0) {
            details.push({
                label: '⚠️ 必须保留细节',
                value: meta.must_keep_details.map((d: string, idx: number) => `${idx + 1}. ${d}`).join('\n'),
                important: true
            });
        }

        // 3. 文字转写（如果有）
        if (meta.text_transcription_maybe && Array.isArray(meta.text_transcription_maybe) && meta.text_transcription_maybe.length > 0) {
            details.push({
                label: '📝 文字内容',
                value: meta.text_transcription_maybe.join(', ')
            });
        }

        // 4. 场景信息
        if (meta.scene_text) {
            const sceneLabel = meta.indoor_or_outdoor_final === 'outdoor' ? '🌍 外景' : '🏠 室内';
            details.push({
                label: `${sceneLabel} 拍摄场景`,
                value: meta.scene_text
            });
        } else if (meta.indoor_or_outdoor_final) {
            details.push({
                label: '📍 场景类型',
                value: meta.indoor_or_outdoor_final === 'outdoor' ? '外景拍摄' : '室内拍摄'
            });
        }

        // 5. 场景来源验证
        if (meta.scene_from_user_input && uiParams.location) {
            const status = meta.scene_from_user_input === 'pass' ? '✅ 用户指定' : '⚠️ 默认场景';
            details.push({
                label: status,
                value: `原始输入: "${uiParams.location}"`
            });
        }

        // 6. 模特要求
        if (meta.model_consistency_notes) {
            details.push({
                label: '👤 模特要求',
                value: meta.model_consistency_notes
            });
        }

        // 7. 相机语言
        if (meta.zeiss_camera_language) {
            details.push({
                label: '📷 镜头语言',
                value: meta.zeiss_camera_language
            });
        }

        // 8. 风险提示（如果有）
        if (meta.risk_notes && Array.isArray(meta.risk_notes) && meta.risk_notes.length > 0) {
            details.push({
                label: '⚠️ 风险提示',
                value: meta.risk_notes.join('; '),
                important: true
            });
        }

        // 9. UI 参数回显
        if (uiParams.style_tuning || uiParams.user_requirements) {
            const userInputs = [];
            if (uiParams.style_tuning) userInputs.push(`风格: ${uiParams.style_tuning}`);
            if (uiParams.user_requirements) userInputs.push(`要求: ${uiParams.user_requirements}`);
            if (userInputs.length > 0) {
                details.push({
                    label: '💬 用户输入',
                    value: userInputs.join(' | ')
                });
            }
        }

        // 10. 拼图模式提示
        if (rawPlan.collage_mode_note?.enabled) {
            details.push({
                label: '🎨 拼图模式',
                value: `${rawPlan.collage_mode_note.layout} - ${rawPlan.collage_mode_note.note || '多帧合并'}`
            });
        }

        // 转换 frames 为 shots 格式
        const shots: Shot[] = frames.map((frame, idx) => ({
            id: frame.id || `frame_${idx + 1}`,
            shot_id: frame.id,
            type: frame.goal || `Frame ${idx + 1}`,
            prompt: frame.prompt_gen_zh || frame.prompt_gen_en || '',
            prompt_en: frame.prompt_gen_en || '',
            camera_angle: frame.camera?.focal_length_hint || frame.composition?.framing,
            lighting: frame.lighting_setup?.scene_light || '',
            status: 'PENDING' as const,
        }));

        return {
            version: 'v3',
            summary: meta.garment_summary || 'AI 智能分析中...',
            details,
            shots: shots.length > 0 ? shots : (rawPlan.shots || []),
            thinkingProcess: rawPlan.thinkingProcess,
            rawMeta: meta, // 保留原始数据供调试
        };
    }

    if (hasV2Fields) {
        // ===== v2.0 格式：保持兼容 =====
        const details: Array<{ label: string; value: string; important?: boolean }> = [];

        if (rawPlan.visual_analysis?.vibe) {
            details.push({ label: '🎨 视觉风格', value: rawPlan.visual_analysis.vibe });
        }

        if (rawPlan.styling_plan) {
            const styling = [];
            if (rawPlan.styling_plan.upper) styling.push(`上装: ${rawPlan.styling_plan.upper}`);
            if (rawPlan.styling_plan.lower) styling.push(`下装: ${rawPlan.styling_plan.lower}`);
            if (rawPlan.styling_plan.shoes) styling.push(`鞋履: ${rawPlan.styling_plan.shoes}`);
            if (rawPlan.styling_plan.accessories) styling.push(`配饰: ${rawPlan.styling_plan.accessories}`);
            if (styling.length > 0) {
                details.push({ label: '👔 穿搭方案', value: styling.join('\n') });
            }
        }

        return {
            version: 'v2',
            summary: rawPlan.visual_analysis?.vibe || 'AI 正在分析风格...',
            details,
            shots: rawPlan.shots || [],
            thinkingProcess: rawPlan.thinkingProcess,
        };
    }

    // ===== 未知版本：降级处理 =====
    return {
        version: 'unknown',
        summary: 'AI 分析结果',
        details: [],
        shots: rawPlan.shots || [],
        thinkingProcess: rawPlan.thinkingProcess,
    };
}

// --- Components ---

// 1. Status Header
function StatusHeader({
    status,
    onRetry,
    onDelete,
    isRetrying = false,
    isDeleting = false
  }: {
      status: TaskData['status'],
      onRetry?: () => void,
      onDelete?: () => void,
      isRetrying?: boolean,
      isDeleting?: boolean
  }) {
      const isBusy = BUSY_STATUSES.has(status);
      const canRetry = status === 'FAILED' || status === 'COMPLETED';
      const deleteLabel = CANCEL_LABEL_STATUSES.has(status) ? '取消任务' : '删除任务';
      const config = {
          DRAFT: { color: "bg-slate-100 text-slate-600", icon: Clock, text: "草稿待开始" },
          PENDING: { color: "bg-slate-100 text-slate-600", icon: Clock, text: "等待处理..." },
          PLANNING: { color: "bg-blue-100 text-blue-700", icon: Brain, text: "镜头规划中..." },
        AWAITING_APPROVAL: { color: "bg-amber-100 text-amber-700", icon: AlertCircle, text: "待确认镜头计划" },
        RENDERING: { color: "bg-purple-100 text-purple-700", icon: Sparkles, text: "出图中..." },
        COMPLETED: { color: "bg-green-100 text-green-700", icon: Check, text: "创作完成" },
        FAILED: { color: "bg-red-100 text-red-700", icon: AlertCircle, text: "任务执行失败" },
        HERO_RENDERING: { color: "bg-purple-100 text-purple-700", icon: Camera, text: "母版生成中..." },
        AWAITING_HERO_APPROVAL: { color: "bg-amber-100 text-amber-700", icon: AlertCircle, text: "待确认母版" },
        STORYBOARD_PLANNING: { color: "bg-blue-100 text-blue-700", icon: Brain, text: "分镜规划中..." },
        STORYBOARD_READY: { color: "bg-green-100 text-green-700", icon: Check, text: "分镜已就绪" },
        SHOTS_RENDERING: { color: "bg-purple-100 text-purple-700", icon: Sparkles, text: "镜头出图中..." },
    }[status] || { color: "bg-slate-100", icon: Clock, text: status };

    const Icon = config.icon;

    return (
        <div className="flex items-center justify-between py-6">
            <Link href="/">
                <Button variant="ghost" className="hover:bg-slate-100 -ml-4 text-slate-600">
                    <ArrowLeft className="mr-2 h-4 w-4" /> 返回创作中心
                </Button>
            </Link>

            <div className="flex items-center gap-3">
                <div className={`px-4 py-2 rounded-full flex items-center gap-2 font-medium ${config.color} shadow-sm`}>
                    <Icon className={`w-4 h-4 ${isBusy ? 'animate-pulse' : ''}`} />
                    {config.text}
                </div>

                  {onDelete && (
                      <div className="flex gap-2">
                          {canRetry && (
                              <Button
                                  onClick={onRetry}
                                  disabled={isRetrying || isDeleting}
                                  variant="outline"
                                  size="sm"
                                  className="bg-white border-slate-200 hover:bg-slate-50 text-slate-700 h-9"
                              >
                                  {isRetrying ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <RefreshCcw className="w-4 h-4 mr-2" />}
                                  {status === 'FAILED' ? '重新执行' : '不满意?重新生成'}
                              </Button>
                          )}
                          <Button
                              onClick={onDelete}
                              disabled={isRetrying || isDeleting}
                              variant="ghost"
                              size="sm"
                              className="text-red-500 hover:bg-red-50 hover:text-red-600 h-9"
                          >
                              {isDeleting ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Trash2 className="w-4 h-4 mr-2" />}
                              {deleteLabel}
                          </Button>
                      </div>
                  )}
              </div>
          </div>
      );
  }

// 1.5 Workflow Guide Bar（统一节奏/阶段/下一步）
type WorkflowStep = {
    key: string;
    title: string;
};

function getWorkflowRhythmCopy(workflow: TaskData['workflow'] | undefined): { label: string; description: string } {
    if (workflow === 'hero_storyboard') {
        return {
            label: '先出母版后分镜',
            description: '先生成母版 → 确认 → 生成分镜动作卡 → 逐镜头裂变出图',
        };
    }
    return {
        label: '先规划后出图',
        description: '先生成镜头计划 → 确认 → 开始出图',
    };
}

function getWorkflowSteps(workflow: TaskData['workflow'] | undefined): WorkflowStep[] {
    if (workflow === 'hero_storyboard') {
        return [
            { key: 'hero', title: '母版' },
            { key: 'approve_hero', title: '确认' },
            { key: 'storyboard', title: '分镜' },
            { key: 'shots', title: '镜头' },
            { key: 'done', title: '完成' },
        ];
    }
    return [
        { key: 'plan', title: '规划' },
        { key: 'approve', title: '确认' },
        { key: 'render', title: '出图' },
        { key: 'done', title: '完成' },
    ];
}

function isHeroAllShotsRendered(task: TaskData): boolean {
    const storyboardCount = task.storyboardCards?.length || 0;
    if (storyboardCount <= 0) return false;

    const shots = task.heroShots || [];
    const byIndex = new Map<number, { status: 'PENDING' | 'RENDERED' | 'FAILED' }>();
    for (const s of shots) byIndex.set(s.index, { status: s.status });

    for (let i = 1; i <= storyboardCount; i += 1) {
        if (byIndex.get(i)?.status !== 'RENDERED') return false;
    }

    return task.gridStatus !== 'PENDING';
}

function getWorkflowActiveStepIndex(task: TaskData): number {
    const workflow = task.workflow || 'legacy';
    if (workflow === 'hero_storyboard') {
        if (isHeroAllShotsRendered(task)) return 4;
        if (task.status === 'HERO_RENDERING') return 0;
        if (task.status === 'AWAITING_HERO_APPROVAL') return 1;
        if (task.status === 'STORYBOARD_PLANNING') return 2;
        if (task.status === 'STORYBOARD_READY' || task.status === 'SHOTS_RENDERING') return 3;
        return 0;
    }

    if (task.status === 'COMPLETED') return 3;
    if (task.status === 'RENDERING') return 2;
    if (task.status === 'AWAITING_APPROVAL') return 1;
    return 0;
}

function pickNextHeroShotIndex(task: TaskData): number | null {
    const storyboardCount = task.storyboardCards?.length || 0;
    if (storyboardCount <= 0) return null;

    const shots = task.heroShots || [];
    const byIndex = new Map<number, { status: 'PENDING' | 'RENDERED' | 'FAILED' }>();
    for (const s of shots) byIndex.set(s.index, { status: s.status });

    for (let i = 1; i <= storyboardCount; i += 1) {
        if (byIndex.get(i)?.status === 'FAILED') return i;
    }

    for (let i = 1; i <= storyboardCount; i += 1) {
        if (byIndex.get(i)?.status !== 'RENDERED') return i;
    }

    return null;
}

function WorkflowStepper({ steps, activeIndex }: { steps: WorkflowStep[]; activeIndex: number }) {
    return (
        <div className="flex items-center gap-2 overflow-x-auto">
            {steps.map((step, idx) => {
                const isDone = idx < activeIndex;
                const isActive = idx === activeIndex;
                return (
                    <div key={step.key} className="flex items-center gap-2 flex-shrink-0">
                        <div className={`h-6 w-6 rounded-full flex items-center justify-center text-[11px] font-bold ${isActive
                            ? 'bg-slate-900 text-white'
                            : isDone
                                ? 'bg-green-600 text-white'
                                : 'bg-slate-200 text-slate-600'
                            }`}>
                            {isDone ? <Check className="w-3.5 h-3.5" /> : idx + 1}
                        </div>
                        <div className={`text-xs font-medium ${isActive ? 'text-slate-900' : isDone ? 'text-slate-700' : 'text-slate-500'}`}>
                            {step.title}
                        </div>
                        {idx < steps.length - 1 && (
                            <div className="w-6 h-px bg-slate-200" />
                        )}
                    </div>
                );
            })}
        </div>
    );
}

type PrimaryAction = {
    label: string;
    onClick?: () => void;
    disabled?: boolean;
    loading?: boolean;
};

function WorkflowGuideBar(props: {
    workflowLabel: string;
    workflowDescription: string;
    steps: WorkflowStep[];
    activeStepIndex: number;
    primaryAction: PrimaryAction;
}) {
    return (
        <div className="sticky top-0 z-30 -mx-4 sm:-mx-6 lg:-mx-8 px-4 sm:px-6 lg:px-8 py-3 bg-slate-50/90 backdrop-blur border-b border-slate-200">
            <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                <div className="min-w-0">
                    <div className="flex items-center gap-2 min-w-0">
                        <Badge variant="secondary" className="bg-slate-200 text-slate-700 flex-shrink-0">
                            {props.workflowLabel}
                        </Badge>
                        <div className="text-xs text-slate-500 truncate">
                            {props.workflowDescription}
                        </div>
                    </div>
                    <div className="mt-2">
                        <WorkflowStepper steps={props.steps} activeIndex={props.activeStepIndex} />
                    </div>
                </div>

                <div className="flex items-center justify-end gap-2">
                    <Button
                        onClick={props.primaryAction.onClick}
                        disabled={props.primaryAction.disabled || !props.primaryAction.onClick}
                        className="bg-slate-900 hover:bg-slate-800 text-white"
                    >
                        {props.primaryAction.loading ? (
                            <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                        ) : (
                            <Sparkles className="w-4 h-4 mr-2" />
                        )}
                        {props.primaryAction.label}
                    </Button>
                </div>
            </div>
        </div>
    );
}

// 2. Visual Analysis Card (通用版本 - 自动适配 v2.0/v3.0)
function VisualAnalysisCard({ plan }: { plan: BrainPlan }) {
    const normalized = normalizeBrainPlan(plan);

    if (normalized.details.length === 0 && !normalized.summary) return null;

    return (
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}>
            <Card className="border-0 shadow-lg bg-white overflow-hidden">
                <div className="h-1 bg-gradient-to-r from-blue-500 via-indigo-500 to-purple-500" />
                <CardContent className="p-6">
                    <div className="flex items-center gap-2 mb-6">
                        <div className="p-2 bg-blue-50 rounded-lg">
                            <Palette className="w-5 h-5 text-blue-600" />
                        </div>
                        <h3 className="text-lg font-semibold text-slate-800">AI 分析方案</h3>
                        <Badge variant="outline" className="ml-auto text-xs">
                            {normalized.version === 'v3' ? 'v3.0 专业版' : normalized.version === 'v2' ? 'v2.0' : '自定义'}
                        </Badge>
                    </div>

                    {/* Summary */}
                    {normalized.summary && (
                        <div className="mb-6 p-4 bg-gradient-to-br from-blue-50 to-indigo-50 rounded-xl border border-blue-100">
                            <div className="flex items-center gap-2 text-sm font-medium text-blue-600 uppercase tracking-wider mb-2">
                                <Sparkles className="w-4 h-4" />
                                核心总结
                            </div>
                            <div className="text-slate-700 leading-relaxed">
                                {normalized.summary}
                            </div>
                        </div>
                    )}

                    {/* Details Grid */}
                    {normalized.details.length > 0 && (
                        <div className="space-y-3">
                            <div className="flex items-center gap-2 text-sm font-medium text-slate-500 uppercase tracking-wider mb-3">
                                <Layers className="w-4 h-4" />
                                关键细节
                            </div>
                            <div className="grid gap-4 md:grid-cols-2">
                                {normalized.details.map((item, idx) => (
                                    <div
                                        key={idx}
                                        className={`p-3 rounded-lg border ${item.important
                                            ? 'bg-amber-50 border-amber-200 shadow-sm'
                                            : 'bg-slate-50 border-slate-100'
                                            }`}
                                    >
                                        <div className={`text-xs font-medium mb-1 ${item.important ? 'text-amber-600' : 'text-slate-400'
                                            }`}>
                                            {item.label}
                                        </div>
                                        <div className="text-sm text-slate-700 leading-relaxed whitespace-pre-line">
                                            {item.value}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}
                </CardContent>
            </Card>
        </motion.div>
    );
}

// 3. Thinking Process Accordion
function ThinkingProcessCard({ content }: { content: string }) {
    const [isOpen, setIsOpen] = React.useState(false);

    if (!content) return null;

    return (
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}>
            <div className="mt-6">
                <button
                    onClick={() => setIsOpen(!isOpen)}
                    className="w-full flex items-center justify-between p-4 bg-gradient-to-r from-violet-50 to-indigo-50 rounded-xl border border-violet-100 hover:border-violet-200 transition-all group"
                >
                    <div className="flex items-center gap-3">
                        <div className="p-1.5 bg-white rounded-md shadow-sm">
                            <Brain className="w-4 h-4 text-violet-600" />
                        </div>
                        <span className="font-semibold text-violet-900 group-hover:text-violet-700">AI 深度思考过程</span>
                        <Badge variant="secondary" className="bg-white/50 text-violet-700 hover:bg-white text-xs">
                            {content.length} chars
                        </Badge>
                    </div>
                    {isOpen ? <ChevronUp className="w-5 h-5 text-violet-400" /> : <ChevronDown className="w-5 h-5 text-violet-400" />}
                </button>

                <AnimatePresence>
                    {isOpen && (
                        <motion.div
                            initial={{ height: 0, opacity: 0 }}
                            animate={{ height: "auto", opacity: 1 }}
                            exit={{ height: 0, opacity: 0 }}
                            className="overflow-hidden"
                        >
                            <div className="p-6 bg-slate-900 text-slate-300 rounded-b-xl font-mono text-sm leading-relaxed whitespace-pre-wrap shadow-inner border-x border-b border-slate-800">
                                {content}
                            </div>
                        </motion.div>
                    )}
                </AnimatePresence>
            </div>
        </motion.div>
    );
}

// 4. Approval Interface
type ApprovalInterfaceHandle = {
    approve: () => Promise<void>;
};

const ApprovalInterface = React.forwardRef<ApprovalInterfaceHandle, {
    taskId: string,
    shots: Shot[],
    onApproved: () => void
}>(function ApprovalInterface({
    taskId,
    shots,
    onApproved
}, ref) {
    const [editedPrompts, setEditedPrompts] = React.useState<Record<string, string>>({});
    const [isSubmitting, setIsSubmitting] = React.useState(false);
    const [savingId, setSavingId] = React.useState<string | null>(null);
    const [regeneratingId, setRegeneratingId] = React.useState<string | null>(null);

    // Initialize edited prompts
    React.useEffect(() => {
        const initial: Record<string, string> = {};
        shots.forEach(s => {
            if (s.id || s.shot_id) initial[s.id || s.shot_id || ''] = s.prompt_en || s.prompt;
        });
        setEditedPrompts(initial);
    }, [shots]);

    const handlePromptChange = (id: string, val: string) => {
        setEditedPrompts(prev => ({ ...prev, [id]: val }));
    };

    const handleSavePrompt = async (shotId: string) => {
        setSavingId(shotId);
        try {
            await api.patch(`/tasks/${taskId}/shots/${shotId}/prompt`, {
                prompt: editedPrompts[shotId]
            });
            alert('提示词已保存');
        } catch (e) {
            console.error(e);
            alert('保存失败');
        } finally {
            setSavingId(null);
        }
    };

    const handleRegenerateSingle = async (shotId: string) => {
        setRegeneratingId(shotId);
        try {
            // Save the prompt first, then regenerate
            await api.patch(`/tasks/${taskId}/shots/${shotId}/prompt`, {
                prompt: editedPrompts[shotId]
            });
            await api.post(`/tasks/${taskId}/retry?shotId=${shotId}`);
            requestCreditsRefresh();
            alert(`Shot ${shotId} 已开始重新生成`);
            onApproved(); // Refresh the page
        } catch (e) {
            console.error(e);
            alert('重新生成失败');
        } finally {
            setRegeneratingId(null);
        }
    };

    const handleApprove = React.useCallback(async () => {
        if (isSubmitting) return;
        setIsSubmitting(true);
        try {
            await api.post(`/tasks/${taskId}/approve`, { editedPrompts });
            onApproved();
        } catch (e) {
            console.error(e);
            alert("提交失败，请重试");
        } finally {
            setIsSubmitting(false);
        }
    }, [editedPrompts, isSubmitting, onApproved, taskId]);

    React.useImperativeHandle(ref, () => ({
        approve: handleApprove,
    }), [handleApprove]);

    return (
        <motion.div initial={{ opacity: 0, scale: 0.98 }} animate={{ opacity: 1, scale: 1 }} className="mt-8">
            <div className="bg-gradient-to-b from-green-50 to-white border border-green-100 rounded-2xl shadow-xl overflow-hidden">
                <div className="p-6 border-b border-green-100 bg-white/50 backdrop-blur-sm">
                    <div className="flex items-center gap-3 mb-2">
                        <div className="p-2 bg-green-100 rounded-full">
                            <Check className="w-5 h-5 text-green-700" />
                        </div>
                        <h2 className="text-xl font-bold text-green-900">确认镜头计划</h2>
                    </div>
                    <p className="text-green-700/80 pl-12">
                        请检查 AI 生成的镜头提示词（可编辑/保存/单镜头重生成）。确认后开始出图。
                    </p>
                </div>

                <div className="p-6 grid gap-6 md:grid-cols-2 lg:grid-cols-2">
                    {shots.map((shot, idx) => {
                        const id = shot.id || shot.shot_id || `shot_${idx}`;
                        return (
                            <Card key={id} className="border-slate-200 hover:border-green-300 transition-colors">
                                <CardContent className="p-4 space-y-3">
                                    <div className="flex justify-between items-center mb-2">
                                        <Badge variant="outline" className="font-bold flex items-center gap-1">
                                            <Camera className="w-3 h-3" /> Shot {idx + 1}
                                        </Badge>
                                        <div className="flex gap-2">
                                            {shot.camera_angle && <span className="text-xs bg-slate-100 px-2 py-1 rounded text-slate-600">{shot.camera_angle}</span>}
                                            {shot.lighting && <span className="text-xs bg-amber-50 px-2 py-1 rounded text-amber-700">{shot.lighting}</span>}
                                        </div>
                                    </div>
                                    <div className="text-xs font-semibold text-slate-700 mb-1">{shot.type}</div>
                                    <Textarea
                                        value={editedPrompts[id] || ""}
                                        onChange={(e) => handlePromptChange(id, e.target.value)}
                                        className="min-h-[120px] text-sm font-mono bg-slate-50 border-slate-200 focus:border-green-500 focus:ring-green-500/20"
                                        placeholder="Enter prompt..."
                                    />
                                    <div className="flex gap-2 pt-2">
                                        <Button
                                            onClick={() => handleSavePrompt(id)}
                                            disabled={savingId === id || regeneratingId === id}
                                            size="sm"
                                            variant="outline"
                                            className="flex-1 text-blue-600 border-blue-200 hover:bg-blue-50"
                                        >
                                            {savingId === id ? (
                                                <>
                                                    <Loader2 className="w-3 h-3 mr-2 animate-spin" />
                                                    保存中...
                                                </>
                                            ) : (
                                                <>
                                                    <Save className="w-3 h-3 mr-2" />
                                                    保存提示词
                                                </>
                                            )}
                                        </Button>
                                        <Button
                                            onClick={() => handleRegenerateSingle(id)}
                                            disabled={savingId === id || regeneratingId === id}
                                            size="sm"
                                            variant="outline"
                                            className="flex-1 text-purple-600 border-purple-200 hover:bg-purple-50"
                                        >
                                            {regeneratingId === id ? (
                                                <>
                                                    <Loader2 className="w-3 h-3 mr-2 animate-spin" />
                                                    生成中...
                                                </>
                                            ) : (
                                                <>
                                                    <Sparkles className="w-3 h-3 mr-2" />
                                                    重新生成
                                                </>
                                            )}
                                        </Button>
                                    </div>
                                </CardContent>
                            </Card>
                        );
                    })}
                </div>

                <div className="p-6 bg-slate-50 border-t border-slate-100">
                    <div className="text-sm text-slate-600">
                        修改完成后，点击页面顶部的「确认镜头计划并开始出图」继续。
                    </div>
                </div>
            </div>
        </motion.div>
    );
});

// 5. Results Grid with Retry functionality
function ResultsGrid({
    shots,
    taskId,
    onRetry,
    layoutMode,
    onUseForBatch,
}: {
    shots: Shot[];
    taskId: string;
    onRetry: () => void;
    layoutMode?: string;
    onUseForBatch?: () => void;
}) {
    const [retrying, setRetrying] = React.useState(false);
    const [retryingShotId, setRetryingShotId] = React.useState<string | null>(null);
    const [editorOpen, setEditorOpen] = React.useState(false);
    const [editingShotId, setEditingShotId] = React.useState<string | null>(null);
    const [editingImageUrl, setEditingImageUrl] = React.useState<string>('');

    // Lightbox states
    const [lightboxOpen, setLightboxOpen] = React.useState(false);
    const [lightboxImages, setLightboxImages] = React.useState<{ id: string; url: string; prompt?: string }[]>([]);
    const [lightboxInitialIndex, setLightboxInitialIndex] = React.useState(0);

    const failedCount = shots?.filter(s => s.status === 'FAILED').length || 0;

    const toImgSrc = (pathOrUrl: string) => {
        if (!pathOrUrl) return '';
        if (pathOrUrl.startsWith('http')) return pathOrUrl;
        return `${BACKEND_ORIGIN}/${pathOrUrl}`;
    };

    const pickShotImage = (shot: Shot) => (shot.imageUrl || shot.imagePath || '').trim();

    const handleImageClick = (index: number) => {
        let images;

        if (layoutMode === 'Grid') {
            // In Grid mode, we want to show ALL shots in the lightbox, even if they share the same 'contact sheet' image
            // This allows users to navigate to "Shot 2" and click "Regenerate" for that specific shot ID.
            const gridShot = shots.find(s => s.status === 'RENDERED' && !!pickShotImage(s));
            const gridImageUrl = gridShot ? toImgSrc(pickShotImage(gridShot)) : '';

            images = shots
                .filter(s => s.status === 'RENDERED') // Only rendered shots are interactive
                .map(s => ({
                    id: s.id || s.shot_id || '',
                    // Use individual image if exists (e.g. after a single-shot retry), otherwise fallback to the shared grid image
                    url: (pickShotImage(s) ? toImgSrc(pickShotImage(s)) : gridImageUrl),
                    prompt: s.prompt_en || s.prompt
                }))
                .filter(img => img.url); // Ensure we have a valid URL
        } else {
            // Individual mode: strictly show shots that have their own images
            images = shots
                .filter(s => s.status === 'RENDERED' && !!pickShotImage(s))
                .map(s => ({
                    id: s.id || s.shot_id || '',
                    url: toImgSrc(pickShotImage(s)),
                    prompt: s.prompt_en || s.prompt
                }));
        }

        setLightboxImages(images);

        // If in Grid mode, we might need to adjust the initial index if the filtered list size differs (though with logic above it should match rendered count)
        // But if user clicks the Main Grid Image (index 0 passed), and we have 4 shots, we start at 0 (Shot 1). 
        // If they click a specific "download" button for shot 2 later, we might pass specific index.
        setLightboxInitialIndex(index);
        setLightboxOpen(true);
    };


    const handleRetryAll = async () => {
        setRetrying(true);
        try {
            if (layoutMode === 'Grid') {
                await api.post(`/tasks/${taskId}/retry-render`);
            } else {
                await api.post(`/tasks/${taskId}/retry`);
            }
            requestCreditsRefresh();
            onRetry();
        } catch (e) {
            console.error('Retry all failed:', e);
            alert('批量重试失败，请稍后再试');
        } finally {
            setRetrying(false);
        }
    };

    const handleRetryShot = async (shotId: string) => {
        if (retryingShotId) return;
        setRetryingShotId(shotId);
        try {
            await api.post(`/tasks/${taskId}/retry?shotId=${shotId}`);
            requestCreditsRefresh();
            onRetry();
        } catch (e) {
            console.error('Retry shot failed:', e);
            alert(`重试 Shot ${shotId} 失败`);
        } finally {
            setRetryingShotId(null);
        }
    };

    const handleEdit = (shotId: string, imageUrl: string) => {
        setEditingShotId(shotId);
        setEditingImageUrl(imageUrl);
        setEditorOpen(true);
    };

    const handleEditComplete = () => {
        setEditorOpen(false);
        setEditingShotId(null);
        setEditingImageUrl('');
        onRetry(); // Refresh to show edited image
    };

    const handleDownload = async (pathOrUrl: string, shotNum: number) => {
        try {
            await downloadImageWithOptionalTaskWatermark({
                taskId,
                url: toImgSrc(pathOrUrl),
                filename: `shot_${shotNum}_${Date.now()}.jpg`,
            });
        } catch (e) {
            console.error('Download failed:', e);
            alert('下载失败：图片跨域限制或网络错误。若需水印下载，请确保 COS 已开启 CORS。');
        }
    };

    // Grid Mode Special Rendering
    if (layoutMode === 'Grid' && shots.length > 0) {
        // In Grid mode, all shots share the same image (the contact sheet)
        // We find the first successful image to display
        const gridShot = shots.find(s => s.status === 'RENDERED' && !!pickShotImage(s));

        if (gridShot) {
            const gridSrc = toImgSrc(pickShotImage(gridShot));
            return (
                <div className="mt-8 space-y-6">
                    <div className="flex items-center gap-2 mb-4">
                        <ImageIcon className="w-6 h-6 text-purple-600" />
                        <h2 className="text-2xl font-bold text-slate-800">最终成片 (Contact Sheet)</h2>
                    </div>

                    <div className="bg-white rounded-2xl overflow-hidden shadow-md border border-slate-100">
                        {/* ✅ Fix: Add onClick to open lightbox */}
                        <div
                            className="aspect-[4/3] relative bg-slate-100 cursor-pointer group"
                            onClick={() => handleImageClick(0)}
                        >
                            <img
                                src={gridSrc}
                                alt="Contact Sheet"
                                className="w-full h-full object-contain transition-transform duration-700 group-hover:scale-105"
                            />
                            {/* Zoom Hint Overlay */}
                            <div className="absolute inset-0 bg-black/0 group-hover:bg-black/10 transition-all duration-300 flex items-center justify-center">
                                <div className="opacity-0 group-hover:opacity-100 transition-opacity duration-300 bg-white/90 backdrop-blur-sm rounded-full p-3 shadow-lg">
                                    <ZoomIn className="w-6 h-6 text-slate-700" />
                                </div>
                            </div>
                        </div>
                        <div className="p-6">
                            <div className="flex items-center justify-between mb-4">
                                <h3 className="font-bold text-slate-800">包含镜头 (Shots Included):</h3>
                                <div className="flex gap-2">
                                    <Button
                                        onClick={() => handleImageClick(0)}
                                        size="sm"
                                        variant="outline"
                                        className="bg-white hover:bg-slate-50 border-slate-200 text-slate-700"
                                    >
                                        <ZoomIn className="w-4 h-4 mr-2" />
                                        查看大图
                                    </Button>
                                    <Button
                                        onClick={handleRetryAll}
                                        size="sm"
                                        variant="outline"
                                        disabled={retrying || !!retryingShotId}
                                        className="bg-white hover:bg-purple-50 text-purple-600 border-purple-200"
                                    >
                                        {retrying ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <RefreshCcw className="w-4 h-4 mr-2" />}
                                        不满意? 重绘拼图
                                    </Button>
                                    <Button
                                        onClick={() => handleDownload(pickShotImage(gridShot), 0)}
                                        size="sm"
                                        className="bg-purple-600 hover:bg-purple-700 text-white"
                                    >
                                        <Download className="w-4 h-4 mr-2" />
                                        下载
                                    </Button>
                                </div>
                            </div>
                            <div className="grid md:grid-cols-2 gap-4">
                                {shots.map((shot, idx) => {
                                    return (
                                        <div key={idx} className="p-3 bg-slate-50 rounded-lg border border-slate-100 text-sm flex justify-between items-start gap-3">
                                            <div className="flex-1">
                                                <div className="font-semibold text-slate-700 mb-1">Frame {idx + 1}: {shot.type}</div>
                                                <div className="text-slate-500 text-xs line-clamp-2">{shot.prompt_en || shot.prompt}</div>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    </div>
                </div>
            );
        }
    }

    // Default Individual Mode Rendering (Existing)
    return (
        <div className="mt-8 space-y-6">
            <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                    <ImageIcon className="w-6 h-6 text-purple-600" />
                    <h2 className="text-2xl font-bold text-slate-800">最终成片</h2>
                </div>

                {failedCount > 0 && (
                    <Button
                        onClick={handleRetryAll}
                        disabled={retrying || !!retryingShotId}
                        variant="outline"
                        className="bg-red-50 border-red-200 hover:bg-red-100 text-red-700 font-medium"
                    >
                        {retrying ? (
                            <>
                                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                正在重试...
                            </>
                        ) : (
                            <>
                                <RefreshCcw className="mr-2 h-4 w-4" />
                                重新生成失败项 ({failedCount})
                            </>
                        )}
                    </Button>
                )}
            </div>

            <div className="grid md:grid-cols-3 gap-6">
                {shots.map((shot, idx) => {
                    const shotId = shot.shot_id || shot.id || `${idx + 1}`;
                    const isThisShotRetrying = retryingShotId === shotId;

                    return (
                        <motion.div
                            key={idx}
                            initial={{ opacity: 0, y: 20 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ delay: idx * 0.1 }}
                            className="group relative bg-white rounded-2xl overflow-hidden shadow-md border border-slate-100 hover:shadow-xl transition-all duration-300"
                        >
                            {/* Image Container */}
                            <div className="aspect-[3/4] relative bg-slate-100 overflow-hidden cursor-pointer" onClick={() => pickShotImage(shot) && handleImageClick(idx)}>
                                {shot.imagePath ? (
                                    <>
                                        <img
                                            src={`${BACKEND_ORIGIN}/${shot.imagePath}`}
                                            alt={`Shot ${idx + 1}`}
                                            className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-105"
                                        />
                                        {/* Zoom Hint */}
                                        <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-all duration-300 flex items-center justify-center">
                                            <div className="opacity-0 group-hover:opacity-100 transition-opacity duration-300 bg-white/90 backdrop-blur-sm rounded-full p-3 shadow-lg">
                                                <ZoomIn className="w-6 h-6 text-slate-700" />
                                            </div>
                                        </div>
                                    </>
                                ) : (
                                    <div className="absolute inset-0 flex flex-col items-center justify-center text-slate-400 gap-3">
                                        {shot.status === 'FAILED' ? (
                                            <>
                                                <AlertCircle className="w-8 h-8 text-red-300" />
                                                <span className="text-sm text-red-400 font-medium">生成失败</span>
                                                <Button
                                                    size="sm"
                                                    variant="ghost"
                                                    className="mt-1 text-red-500 hover:bg-red-50 hover:text-red-600 border border-red-200"
                                                    onClick={() => handleRetryShot(shotId)}
                                                    disabled={isThisShotRetrying || retrying}
                                                >
                                                    {isThisShotRetrying ? (
                                                        <>
                                                            <Loader2 className="w-3 h-3 animate-spin mr-1" />
                                                            重试中...
                                                        </>
                                                    ) : (
                                                        <>
                                                            <RefreshCcw className="w-3 h-3 mr-1" />
                                                            单独重试
                                                        </>
                                                    )}
                                                </Button>
                                            </>
                                        ) : (
                                            <>
                                                <Loader2 className="w-8 h-8 animate-spin text-purple-300" />
                                                <span className="text-sm">正在渲染...</span>
                                            </>
                                        )}
                                    </div>
                                )}

                                {/* Overlay info */}
                                <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300 flex flex-col justify-end p-4 pointer-events-none">
                                    <p className="text-white text-xs line-clamp-3 font-mono opacity-90">
                                        {shot.prompt_en || shot.prompt}
                                    </p>
                                </div>
                            </div>

                            {/* Card Footer */}
                            <div className="p-4 bg-white">
                                <div className="flex justify-between items-center mb-2">
                                    <span className="font-bold text-slate-800">Shot {idx + 1}</span>
                                    <Badge variant="outline" className="text-xs">{shot.status}</Badge>
                                </div>
                                <div className="flex justify-between items-center">
                                    <div className="text-xs text-slate-500 truncate flex-1 mr-2">{shot.type}</div>
                                {pickShotImage(shot) && shot.status === 'RENDERED' && (
                                        <div className="flex gap-1">
                                            <Button
                                                onClick={() => handleDownload(pickShotImage(shot), idx + 1)}
                                                size="sm"
                                                variant="ghost"
                                                className="h-7 w-7 p-0 hover:bg-purple-50 hover:text-purple-600"
                                                title="下载图片"
                                            >
                                                <Download className="w-3.5 h-3.5" />
                                            </Button>
                                            <Button
                                                onClick={() => handleRetryShot(shotId)}
                                                size="sm"
                                                variant="ghost"
                                                className="h-7 w-7 p-0 hover:bg-blue-50 hover:text-blue-600"
                                                title="重新生成"
                                                disabled={isThisShotRetrying || retrying}
                                            >
                                                {isThisShotRetrying ? (
                                                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                                ) : (
                                                    <RefreshCcw className="w-3.5 h-3.5" />
                                                )}
                                            </Button>
                                            <Button
                                                onClick={() => handleEdit(shotId, pickShotImage(shot))}
                                                size="sm"
                                                variant="ghost"
                                                className="h-7 w-7 p-0 hover:bg-purple-50 hover:text-purple-600"
                                                title="编辑图片"
                                            >
                                                <Edit className="w-3.5 h-3.5" />
                                            </Button>
                                        </div>
                                    )}
                                </div>
                            </div>
                        </motion.div>
                    );
                })}
            </div>

            {/* Image Editor Dialog */}
            {editingShotId && editingImageUrl && (
                <ImageEditor
                    open={editorOpen}
                    onClose={() => setEditorOpen(false)}
                    taskId={taskId}
                    shotId={editingShotId}
                    imageUrl={editingImageUrl}
                    onEditComplete={handleEditComplete}
                />
            )}

            {/* Image Lightbox */}
            <ImageLightbox
                images={lightboxImages}
                initialIndex={lightboxInitialIndex}
                open={lightboxOpen}
                onOpenChange={setLightboxOpen}
                onRegenerate={handleRetryShot}
                isRegenerating={!!retryingShotId} // Global regenerating state or check specific id inside logic if needed, but passing generic here is simpler for now or we check inside
                watermarkTaskId={taskId}
                onUseForBatch={onUseForBatch}
                useForBatchLabel="用此数据批量生成"
            />
        </div>
    );
}


// --- Main Page Component ---

export default function TaskResultPage() {
    const params = useParams();
    const router = useRouter();
    const [task, setTask] = React.useState<TaskData | null>(null);
    const [loading, setLoading] = React.useState(true);
    const [error, setError] = React.useState('');
    const [isRetrying, setIsRetrying] = React.useState(false);
    const [isDeleting, setIsDeleting] = React.useState(false);
    const [isStarting, setIsStarting] = React.useState(false);
    const [isReplanningStoryboard, setIsReplanningStoryboard] = React.useState(false);
    const [isRegeneratingHero, setIsRegeneratingHero] = React.useState(false);
    const [isConfirmingHero, setIsConfirmingHero] = React.useState(false);
    const [isRenderingGrid, setIsRenderingGrid] = React.useState(false);
    const [renderingShotIndices, setRenderingShotIndices] = React.useState<Set<number>>(new Set());
    const [selectingShotAttemptKey, setSelectingShotAttemptKey] = React.useState<string | null>(null);
    const [editingStoryboardIndex, setEditingStoryboardIndex] = React.useState<number | null>(null);
    const [storyboardDraft, setStoryboardDraft] = React.useState<StoryboardShotEditDraft | null>(null);
    const [savingStoryboardIndex, setSavingStoryboardIndex] = React.useState<number | null>(null);
    const [cyclingCameraIndex, setCyclingCameraIndex] = React.useState<number | null>(null);

    const [isEditingHeroShootLog, setIsEditingHeroShootLog] = React.useState(false);
    const [heroShootLogDraft, setHeroShootLogDraft] = React.useState('');
    const [savingHeroShootLog, setSavingHeroShootLog] = React.useState(false);

    const [isEditingGridShootLog, setIsEditingGridShootLog] = React.useState(false);
    const [gridShootLogDraft, setGridShootLogDraft] = React.useState('');
    const [savingGridShootLog, setSavingGridShootLog] = React.useState(false);

    const [heroEditorOpen, setHeroEditorOpen] = React.useState(false);
    const [selectingHeroAttemptCreatedAt, setSelectingHeroAttemptCreatedAt] = React.useState<number | null>(null);

    const [editingShotLogIndex, setEditingShotLogIndex] = React.useState<number | null>(null);
    const [shotShootLogDraft, setShotShootLogDraft] = React.useState('');
    const [savingShotShootLog, setSavingShotShootLog] = React.useState(false);
    const approvalRef = React.useRef<ApprovalInterfaceHandle | null>(null);
    const [isApprovingLegacy, setIsApprovingLegacy] = React.useState(false);
    const { toast } = useToast();
    const creditsFingerprintRef = React.useRef<string>('');

    React.useEffect(() => {
        if (!task) return;
        if (!isEditingHeroShootLog) setHeroShootLogDraft(task.heroShootLog || '');
        if (!isEditingGridShootLog) setGridShootLogDraft(task.gridShootLog || '');
        if (editingShotLogIndex === null) setShotShootLogDraft('');
    }, [task, isEditingHeroShootLog, isEditingGridShootLog, editingShotLogIndex]);

    // Define fetchTask outside useEffect to share with retry handle
    const fetchTask = React.useCallback(async () => {
        try {
            const res = await api.get(`/tasks/${params.id}`);
            const data = res.data as TaskData & { billingEvents?: unknown[]; billingError?: string };
            setTask(data);

            // 积分可能在后台预扣/结算（B 策略），这里用轻量指纹触发全局刷新
            const billingEventsLen = Array.isArray(data.billingEvents) ? data.billingEvents.length : 0;
            const billingError = String(data.billingError || '');
            const fingerprint = `${data?.status || ''}|${billingEventsLen}|${billingError}`;
            if (fingerprint !== creditsFingerprintRef.current) {
                creditsFingerprintRef.current = fingerprint;
                requestCreditsRefresh();
            }

            if (['COMPLETED', 'FAILED'].includes(data.status)) {
                // Done
            }
            setLoading(false);
        } catch (err) {
            console.error(err);
            const status = getApiErrorStatus(err);
            if (status === 401 || status === 403) {
                router.push(`/login?next=/tasks/${params.id}`);
                return;
            }
            setError('无法加载任务详情');
            setLoading(false);
        }
    }, [params.id, router]);

    const handleStartTask = async () => {
        setIsStarting(true);
        try {
            await api.post(`/tasks/${params.id}/start`);
            toast({
                title: '任务已开始生成',
                description: 'AI 正在规划与生图，请稍候…',
            });
            await fetchTask();
        } catch (error) {
            console.error(error);
            toast({
                variant: "destructive",
                title: "开始失败",
                description: getApiErrorMessage(error, '操作遇到错误，请稍后再试'),
            });
        } finally {
            setIsStarting(false);
        }
    };

    const handleRetryTask = async () => {
        if (!task) return;

        const workflow = task.workflow || 'legacy';
        const isHeroStoryboard = workflow === 'hero_storyboard';

        let endpoint = `/tasks/${params.id}/retry`;
        let confirmText = '确定要重新执行此任务吗？';
        let toastTitle = '任务已重新提交';
        let toastDesc = 'AI 正在重新生成...';

        if (isHeroStoryboard) {
            const failedShot = (task.heroShots || []).find((s) => s.status === 'FAILED');

            if (!task.heroImageUrl) {
                endpoint = `/tasks/${params.id}/hero/regenerate`;
                confirmText = 'Hero 生成失败。要重新生成 Hero 母版吗？';
                toastTitle = '已提交重新生成 Hero';
                toastDesc = '正在生成母版...';
            } else if (task.status === 'AWAITING_HERO_APPROVAL' && !!task.error && (!task.storyboardCards || task.storyboardCards.length === 0)) {
                endpoint = `/tasks/${params.id}/hero/confirm`;
                confirmText = '分镜规划失败。要重试生成分镜动作卡吗？（不重做 Hero）';
                toastTitle = '已提交分镜重试';
                toastDesc = '正在重新生成分镜动作卡...';
            } else if (task.gridStatus === 'FAILED') {
                endpoint = `/tasks/${params.id}/storyboard/render-grid`;
                confirmText = '拼图生成失败。要重试生成四宫格拼图吗？';
                toastTitle = '已提交拼图重试';
                toastDesc = '正在重新生成四宫格拼图...';
            } else if (failedShot) {
                endpoint = `/tasks/${params.id}/storyboard/shots/${failedShot.index}/render`;
                confirmText = `镜头 ${failedShot.index} 生成失败。要重试生成该镜头吗？`;
                toastTitle = `已提交镜头 ${failedShot.index} 重试`;
                toastDesc = '正在重新生成该镜头...';
            } else {
                endpoint = `/tasks/${params.id}/hero/regenerate`;
                confirmText = '确定要重新生成 Hero 母版吗？这会清空已生成的分镜/镜头/拼图结果。';
                toastTitle = '已提交重新生成 Hero';
                toastDesc = '正在生成母版...';
            }
        }

        if (!confirm(confirmText)) return;
        setIsRetrying(true);
        try {
            await api.post(endpoint, {});
            requestCreditsRefresh();
            toast({
                title: toastTitle,
                description: toastDesc,
            });
            await fetchTask();
        } catch (error) {
            console.error(error);
            toast({
                variant: "destructive",
                title: "重试失败",
                description: getApiErrorMessage(error, '操作遇到错误，请稍后再试'),
            });
        } finally {
            setIsRetrying(false);
        }
    };

      const handleDeleteTask = async () => {
          const status = task?.status;
          const label = status && CANCEL_LABEL_STATUSES.has(status) ? '取消并删除' : '删除';
          if (!confirm(`确定要${label}此任务吗？此操作不可撤销！`)) return;
          setIsDeleting(true);
          try {
              await api.delete(`/tasks/${params.id}`);
            toast({
                title: "任务已删除",
                description: "您将被重定向到创作中心",
            });
            router.push('/');
        } catch (error) {
            console.error(error);
            toast({
                variant: "destructive",
                title: "删除失败",
                description: "无法删除该任务，请检查网络连接",
            });
            setIsDeleting(false);
        }
    };

    const handleConfirmHero = async () => {
        setIsConfirmingHero(true);
        // 乐观更新：马上显示“分镜生成中”
        setTask(prev => prev ? { ...prev, status: 'STORYBOARD_PLANNING' } : prev);
        try {
            await api.post(`/tasks/${params.id}/hero/confirm`, {});
            toast({
                title: '已确认 Hero',
                description: '正在生成分镜动作卡...',
            });
            await fetchTask();
        } catch (error) {
            console.error(error);
            toast({
                variant: 'destructive',
                title: '确认Hero失败',
                description: getApiErrorMessage(error, '操作遇到错误，请稍后再试'),
            });
            await fetchTask();
        } finally {
            setIsConfirmingHero(false);
        }
    };

    const handleRegenerateHero = async () => {
        const ok = confirm('确定要重新生成 Hero 母版吗？这会清空已生成的分镜/镜头/拼图结果。');
        if (!ok) return;

        setIsRegeneratingHero(true);
        // 乐观更新：马上进入 HERO_RENDERING
        setTask(prev => prev ? {
            ...prev,
            status: 'HERO_RENDERING',
            heroImageUrl: undefined,
            heroShootLog: undefined,
            heroApprovedAt: undefined,
            storyboardCards: undefined,
            storyboardPlannedAt: undefined,
            heroShots: [],
            gridImageUrl: undefined,
            gridShootLog: undefined,
            error: undefined,
        } : prev);

        try {
            await api.post(`/tasks/${params.id}/hero/regenerate`, {});
            toast({ title: '已提交重新生成 Hero', description: '正在生成母版...' });
            await fetchTask();
        } catch (error) {
            console.error(error);
            toast({
                variant: 'destructive',
                title: '重新生成Hero失败',
                description: getApiErrorMessage(error, '操作遇到错误，请稍后再试'),
            });
            await fetchTask();
        } finally {
            setIsRegeneratingHero(false);
        }
    };

    const handleOpenHeroEditor = () => {
        if (!task?.heroImageUrl) return;
        if (task.status !== 'AWAITING_HERO_APPROVAL') {
            const ok = confirm('编辑母版会创建一个新版本（B），并回到“待确认母版”。旧版本（A）的分镜/镜头/拼图仍会保留，可在版本库随时切回。是否继续？');
            if (!ok) return;
        }
        setHeroEditorOpen(true);
    };

    const handleHeroEditComplete = async () => {
        setHeroEditorOpen(false);
        await fetchTask();
    };

    const handleSelectHeroVariant = async (attemptCreatedAt: number) => {
        if (selectingHeroAttemptCreatedAt) return;
        setSelectingHeroAttemptCreatedAt(attemptCreatedAt);
        try {
            await api.post(`/tasks/${params.id}/hero/select`, { attemptCreatedAt });
            toast({ title: '已切换母版版本', description: '已切换到该版本对应的完整工作区（母版/分镜/镜头/拼图/会话）。' });
            await fetchTask();
        } catch (error) {
            console.error(error);
            toast({
                variant: 'destructive',
                title: '切换版本失败',
                description: getApiErrorMessage(error, '操作遇到错误，请稍后再试'),
            });
        } finally {
            setSelectingHeroAttemptCreatedAt(null);
        }
    };

    const handleSaveHeroShootLog = async () => {
        if (!task) return;
        setSavingHeroShootLog(true);
        try {
            const res = await api.patch(`/tasks/${params.id}/hero/shoot-log`, { shootLogText: heroShootLogDraft });
            setTask(res.data);
            setIsEditingHeroShootLog(false);
            toast({ title: '手账已保存', description: 'Hero 手账已更新' });
        } catch (error) {
            console.error(error);
            toast({
                variant: 'destructive',
                title: '保存失败',
                description: getApiErrorMessage(error, '无法保存手账，请稍后重试'),
            });
        } finally {
            setSavingHeroShootLog(false);
        }
    };

    const handleSaveGridShootLog = async () => {
        if (!task) return;
        setSavingGridShootLog(true);
        try {
            const res = await api.patch(`/tasks/${params.id}/storyboard/grid/shoot-log`, { shootLogText: gridShootLogDraft });
            setTask(res.data);
            setIsEditingGridShootLog(false);
            toast({ title: '手账已保存', description: '拼图手账已更新' });
        } catch (error) {
            console.error(error);
            toast({
                variant: 'destructive',
                title: '保存失败',
                description: getApiErrorMessage(error, '无法保存手账，请稍后重试'),
            });
        } finally {
            setSavingGridShootLog(false);
        }
    };

    const startEditShotShootLog = (index: number, currentValue?: string) => {
        setEditingShotLogIndex(index);
        setShotShootLogDraft(currentValue || '');
    };

    const handleSaveShotShootLog = async () => {
        if (!task || editingShotLogIndex === null) return;
        setSavingShotShootLog(true);
        try {
            const res = await api.patch(
                `/tasks/${params.id}/storyboard/shots/${editingShotLogIndex}/shoot-log`,
                { shootLogText: shotShootLogDraft },
            );
            setTask(res.data);
            setEditingShotLogIndex(null);
            toast({ title: '手账已保存', description: `镜头 #${editingShotLogIndex} 手账已更新` });
        } catch (error) {
            console.error(error);
            toast({
                variant: 'destructive',
                title: '保存失败',
                description: getApiErrorMessage(error, '无法保存手账，请稍后重试'),
            });
        } finally {
            setSavingShotShootLog(false);
        }
    };

    const handleRenderShot = async (index: number) => {
        // 乐观：马上显示“生成中…”，并禁用当前镜头按钮
        setRenderingShotIndices(prev => {
            const next = new Set(prev);
            next.add(index);
            return next;
        });
        setTask(prev => {
            if (!prev) return prev;
            const existing = prev.heroShots?.find((s) => s.index === index);
            const nextShots = [
                ...((prev.heroShots || []).filter((s) => s.index !== index)),
                {
                    index,
                    status: 'PENDING' as const,
                    createdAt: Date.now(),
                    ...(existing?.imageUrl ? { imageUrl: existing.imageUrl } : {}),
                },
            ].sort((a, b) => a.index - b.index);
            return { ...prev, status: 'SHOTS_RENDERING', heroShots: nextShots };
        });
        try {
            await api.post(`/tasks/${params.id}/storyboard/shots/${index}/render`, {});
            requestCreditsRefresh();
            toast({
                title: `已提交生成 #${index}`,
                description: '正在生成镜头...',
            });
            await fetchTask();
        } catch (error) {
            console.error(error);
            toast({
                variant: 'destructive',
                title: '生成镜头失败',
                description: getApiErrorMessage(error, '操作遇到错误，请稍后再试'),
            });
            await fetchTask();
        } finally {
            setRenderingShotIndices(prev => {
                const next = new Set(prev);
                next.delete(index);
                return next;
            });
        }
    };

    const handleSelectShotVariant = async (index: number, attemptCreatedAt: number) => {
        const key = `${index}:${attemptCreatedAt}`;
        setSelectingShotAttemptKey(key);
        try {
            await api.post(`/tasks/${params.id}/storyboard/shots/${index}/select`, { attemptCreatedAt });
            toast({
                title: `已选择镜头 #${index} 版本`,
                description: '下一镜头将以该版本作为上一帧进行裂变。',
            });
            await fetchTask();
        } catch (error) {
            console.error(error);
            toast({
                variant: 'destructive',
                title: '选择版本失败',
                description: getApiErrorMessage(error, '操作遇到错误，请稍后再试'),
            });
        } finally {
            setSelectingShotAttemptKey(null);
        }
    };

    const handleRenderGrid = async () => {
        setIsRenderingGrid(true);
        setTask(prev => prev ? { ...prev, status: 'SHOTS_RENDERING' } : prev);
        try {
            await api.post(`/tasks/${params.id}/storyboard/render-grid`, {});
            requestCreditsRefresh();
            toast({
                title: '已提交四镜头拼图生成',
                description: '正在生成拼图...',
            });
            await fetchTask();
        } catch (error) {
            console.error(error);
            toast({
                variant: 'destructive',
                title: '生成拼图失败',
                description: getApiErrorMessage(error, '操作遇到错误，请稍后再试'),
            });
            await fetchTask();
        } finally {
            setIsRenderingGrid(false);
        }
    };

    const handleReplanStoryboard = async () => {
        const ok = confirm('确定要重新生成分镜动作卡吗？这会清空已生成的镜头/拼图结果，需要重新生成。');
        if (!ok) return;

        setIsReplanningStoryboard(true);
        setTask(prev => prev ? {
            ...prev,
            status: 'STORYBOARD_PLANNING',
            heroShots: [],
            gridImageUrl: undefined,
            gridShootLog: undefined,
            error: undefined,
        } : prev);
        try {
            await api.post(`/tasks/${params.id}/storyboard/replan`, {});
            toast({
                title: '已重新生成分镜',
                description: '正在重新抽卡...',
            });
            await fetchTask();
        } catch (error) {
            console.error(error);
            toast({
                variant: 'destructive',
                title: '重新生成分镜失败',
                description: getApiErrorMessage(error, '操作遇到错误，请稍后再试'),
            });
        } finally {
            setIsReplanningStoryboard(false);
            await fetchTask();
        }
    };

    const downloadFromUrl = React.useCallback(async (url: string, filename: string) => {
        try {
            await downloadImageWithOptionalTaskWatermark({
                taskId: String(params.id || ''),
                url,
                filename,
            });
        } catch (e) {
            console.error('Download failed:', e);
            toast({
                variant: 'destructive',
                title: '下载失败',
                description: '图片跨域限制或网络错误。若需水印下载，请确保 COS 已开启 CORS。',
            });
        }
    }, [params.id, toast]);

    const handleUseForBatch = React.useCallback(() => {
        const taskId = String(params.id || '').trim();
        if (!taskId) return;
        router.push(`/batch?fromTaskId=${encodeURIComponent(taskId)}`);
    }, [params.id, router]);

    const openStoryboardEditor = (index: number) => {
        const shot = (task?.storyboardPlan?.shots || [])?.[index - 1] || {};
        const camera = shot?.camera_choice || shot?.cameraChoice || {};
        const lighting = shot?.lighting_plan || shot?.lightingPlan || {};
        const product = lighting?.product_light || lighting?.productLight || {};

        setEditingStoryboardIndex(index);
        setStoryboardDraft({
            sceneSubarea: String(shot?.scene_subarea ?? shot?.sceneSubarea ?? ''),
            actionPose: String(shot?.action_pose ?? shot?.actionPose ?? ''),
            shotType: String(shot?.shot_type ?? shot?.shotType ?? ''),
            goal: String(shot?.goal ?? ''),
            physicalLogic: String(shot?.physical_logic ?? shot?.physicalLogic ?? ''),
            compositionNotes: String(shot?.composition_notes ?? shot?.compositionNotes ?? ''),
            execInstructionText: String(shot?.exec_instruction_text ?? shot?.execInstructionText ?? ''),
            occlusionGuardText: toLineText(shot?.occlusion_guard ?? shot?.occlusionGuard),
            refRequirementsText: toLineText(shot?.ref_requirements ?? shot?.refRequirements),
            universalRequirementsText: toLineText(shot?.universal_requirements ?? shot?.universalRequirements),
            lightingSceneLight: String(lighting?.scene_light ?? lighting?.sceneLight ?? ''),
            lightingKey: String(product?.key ?? ''),
            lightingRim: String(product?.rim ?? ''),
            lightingFill: String(product?.fill ?? ''),
            cameraSystem: String(camera?.system ?? ''),
            cameraModel: String(camera?.model ?? ''),
            cameraFStop: String(camera?.f_stop ?? camera?.fStop ?? ''),
        });
    };

    const closeStoryboardEditor = () => {
        setEditingStoryboardIndex(null);
        setStoryboardDraft(null);
    };

    const saveStoryboardEditor = async () => {
        if (!editingStoryboardIndex || !storyboardDraft) return;
        setSavingStoryboardIndex(editingStoryboardIndex);
        try {
            await api.patch(`/tasks/${params.id}/storyboard/shots/${editingStoryboardIndex}`, {
                patch: {
                    scene_subarea: storyboardDraft.sceneSubarea,
                    action_pose: storyboardDraft.actionPose,
                    shot_type: storyboardDraft.shotType,
                    goal: storyboardDraft.goal,
                    physical_logic: storyboardDraft.physicalLogic,
                    composition_notes: storyboardDraft.compositionNotes,
                    exec_instruction_text: storyboardDraft.execInstructionText,
                    occlusion_guard: toLineArray(storyboardDraft.occlusionGuardText),
                    ref_requirements: toLineArray(storyboardDraft.refRequirementsText),
                    universal_requirements: toLineArray(storyboardDraft.universalRequirementsText),
                    lighting_plan: {
                        scene_light: storyboardDraft.lightingSceneLight,
                        product_light: {
                            key: storyboardDraft.lightingKey,
                            rim: storyboardDraft.lightingRim,
                            fill: storyboardDraft.lightingFill,
                        },
                    },
                    camera_choice: {
                        system: storyboardDraft.cameraSystem,
                        model: storyboardDraft.cameraModel,
                        f_stop: storyboardDraft.cameraFStop,
                    },
                },
            });

            toast({
                title: `镜头 #${editingStoryboardIndex} 已保存`,
                description: '下次点“重新生成该镜头”会按新文字执行。',
            });
            await fetchTask();
            closeStoryboardEditor();
        } catch (error) {
            console.error(error);
            toast({
                variant: 'destructive',
                title: '保存镜头文字失败',
                description: getApiErrorMessage(error, '操作遇到错误，请稍后再试'),
            });
        } finally {
            setSavingStoryboardIndex(null);
        }
    };

    const cycleCameraText = async (index: number) => {
        const shot = (task?.storyboardPlan?.shots || [])?.[index - 1] || {};
        const camera = shot?.camera_choice || shot?.cameraChoice || {};
        const currentSystem = String(camera?.system ?? '').trim();
        const currentModel = String(camera?.model ?? '').trim();
        const currentFStop = String(camera?.f_stop ?? camera?.fStop ?? '').trim();

        const zeissModels = ['Otus 28mm', 'ZX1 35mm', 'Otus 55mm', 'Otus 85mm', 'Otus 100mm'];
        const iphoneModels = ['13mm', '24mm', '48mm', '100mm', '200mm'];

        const isIphone = /iphone/i.test(currentSystem);
        const options = isIphone ? iphoneModels : zeissModels;

        const findIndex = options.findIndex((m) => (currentModel || '').includes(m));
        const nextModel = options[(findIndex >= 0 ? findIndex + 1 : 0) % options.length];

        setCyclingCameraIndex(index);
        try {
            await api.patch(`/tasks/${params.id}/storyboard/shots/${index}`, {
                patch: {
                    camera_choice: {
                        system: currentSystem || (isIphone ? 'iPhone' : 'ZEISS'),
                        model: nextModel,
                        f_stop: currentFStop || (!isIphone ? 'f/2.8' : ''),
                    },
                },
            });
            toast({
                title: `镜头 #${index} 已换镜头`,
                description: '如果满意，再点“重新生成该镜头”出图。',
            });
            await fetchTask();
        } catch (error) {
            console.error(error);
            toast({
                variant: 'destructive',
                title: '换镜头失败',
                description: getApiErrorMessage(error, '操作遇到错误，请稍后再试'),
            });
        } finally {
            setCyclingCameraIndex(null);
        }
    };

    // Poll for updates
    React.useEffect(() => {
        fetchTask();
        const timer = setInterval(fetchTask, 2000);
        return () => clearInterval(timer);
    }, [fetchTask]);


    if (loading && !task) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-slate-50">
                <div className="text-center space-y-4">
                    <Loader2 className="w-10 h-10 animate-spin text-blue-500 mx-auto" />
                    <p className="text-slate-500">正在加载任务数据...</p>
                </div>
            </div>
        );
    }

    if (error || !task) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-slate-50">
                <Card className="max-w-md w-full p-6 text-center">
                    <AlertCircle className="w-12 h-12 text-red-500 mx-auto mb-4" />
                    <h2 className="text-xl font-bold text-slate-800 mb-2">出错了</h2>
                    <p className="text-slate-600 mb-6">{error || '任务不存在'}</p>
                    <Link href="/">
                        <Button>返回首页</Button>
                    </Link>
                </Card>
            </div>
        );
    }

    if (task.status === 'DRAFT') {
        return (
            <div className="min-h-screen flex items-center justify-center bg-slate-50 px-4">
                <Card className="max-w-md w-full p-6 text-center">
                    <h2 className="text-xl font-bold text-slate-800 mb-2">任务草稿已保存</h2>
                    <p className="text-slate-600 mb-6">
                        该任务尚未开始生成。点击“开始生成”将触发 AI 规划与生图，并消耗积分。
                    </p>
                    <div className="flex flex-col gap-3">
                        <Button onClick={handleStartTask} disabled={isStarting}>
                            {isStarting ? (
                                <span className="flex items-center gap-2">
                                    <Loader2 className="w-4 h-4 animate-spin" />
                                    启动中...
                                </span>
                            ) : (
                                '开始生成'
                            )}
                        </Button>
                        <Link href="/">
                            <Button variant="outline" className="w-full">返回首页</Button>
                        </Link>
                    </div>
                </Card>
            </div>
        );
    }

    // Determine what to show based on status
    const isHeroStoryboard = task.workflow === 'hero_storyboard';

    const showThinking = !isHeroStoryboard && task.brainPlan?.thinkingProcess;
    const showVisualAnalysis = !isHeroStoryboard && task.brainPlan;
    // 兼容 v2.0 (shots) 和 v3.0 (frames)
    const showApproval = !isHeroStoryboard && task.status === 'AWAITING_APPROVAL' && (task.brainPlan?.shots || task.brainPlan?.frames);
    const showResults = !isHeroStoryboard && ['RENDERING', 'COMPLETED', 'FAILED'].includes(task.status);

    // For results, we use task.shots (from DB) or shots from brainPlan if rendering hasn't populated DB yet
    const displayShots = task.shots && task.shots.length > 0 ? task.shots : (task.brainPlan?.shots || []);

    const workflowRhythm = getWorkflowRhythmCopy(task.workflow);
    const workflowSteps = getWorkflowSteps(task.workflow);
    const activeStepIndex = getWorkflowActiveStepIndex(task);

    const handleApproveLegacy = async () => {
        if (isApprovingLegacy) return;
        const approval = approvalRef.current;
        if (!approval) {
            toast({
                variant: 'destructive',
                title: '无法提交镜头计划',
                description: '确认组件尚未就绪，请稍后重试或刷新页面。',
            });
            return;
        }

        setIsApprovingLegacy(true);
        try {
            await approval.approve();
        } finally {
            setIsApprovingLegacy(false);
        }
    };

    const primaryAction: PrimaryAction = (() => {
        const status = task.status;
        const workflow = task.workflow || 'legacy';
        const isBusy = ['PENDING', 'QUEUED', 'PLANNING', 'RENDERING', 'HERO_RENDERING', 'STORYBOARD_PLANNING', 'SHOTS_RENDERING'].includes(status);
        if (isBusy) return { label: '处理中…', disabled: true, loading: true };

        if (status === 'FAILED') return { label: '重新执行', onClick: handleRetryTask, disabled: isRetrying || isDeleting, loading: isRetrying };
        if (status === 'COMPLETED') return { label: '不满意？重新生成', onClick: handleRetryTask, disabled: isRetrying || isDeleting, loading: isRetrying };

        if (workflow === 'hero_storyboard') {
            if (status === 'AWAITING_HERO_APPROVAL') {
                return {
                    label: '确认母版并生成分镜',
                    onClick: handleConfirmHero,
                    disabled: isConfirmingHero || isRegeneratingHero,
                    loading: isConfirmingHero,
                };
            }

            if (status === 'STORYBOARD_READY') {
                const nextIndex = pickNextHeroShotIndex(task);
                if (nextIndex) {
                    const isRenderingThis = renderingShotIndices.has(nextIndex);
                    return {
                        label: `生成镜头 #${nextIndex}`,
                        onClick: () => void handleRenderShot(nextIndex),
                        disabled: isRenderingThis || isRenderingGrid || isReplanningStoryboard,
                        loading: isRenderingThis,
                    };
                }

                if ((task.storyboardCards?.length === 4) && !task.gridImageUrl) {
                    return {
                        label: '生成四镜头拼图',
                        onClick: handleRenderGrid,
                        disabled: isRenderingGrid || isReplanningStoryboard,
                        loading: isRenderingGrid,
                    };
                }

                if (isHeroAllShotsRendered(task)) {
                    return { label: '已完成（可按需重生成）', disabled: true };
                }
            }
        } else {
            if (status === 'AWAITING_APPROVAL') {
                return {
                    label: '确认镜头计划并开始出图',
                    onClick: () => void handleApproveLegacy(),
                    disabled: isApprovingLegacy,
                    loading: isApprovingLegacy,
                };
            }
        }

        return { label: '暂无需要操作', disabled: true };
    })();

    return (
        <div className="min-h-screen bg-slate-50 pb-20">
            <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">

                {/* 1. Status Bar */}
                <StatusHeader
                    status={task.status}
                    onRetry={handleRetryTask}
                    onDelete={handleDeleteTask}
                    isRetrying={isRetrying}
                    isDeleting={isDeleting}
                />

                <WorkflowGuideBar
                    workflowLabel={workflowRhythm.label}
                    workflowDescription={workflowRhythm.description}
                    steps={workflowSteps}
                    activeStepIndex={activeStepIndex}
                    primaryAction={primaryAction}
                />

                {/* Hero Storyboard Workflow */}
                {isHeroStoryboard && (
                    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}>
                        <Card className="border-0 shadow-lg bg-white overflow-hidden">
                            <div className="h-1 bg-gradient-to-r from-cyan-500 via-blue-500 to-indigo-500" />
                            <CardContent className="p-6 space-y-6">
                                <div className="flex items-center gap-2">
                                    <div className="p-2 bg-cyan-50 rounded-lg">
                                        <Camera className="w-5 h-5 text-cyan-700" />
                                    </div>
                                    <h3 className="text-lg font-semibold text-slate-800">母版</h3>
                                    <Badge variant="outline" className="ml-auto text-xs">先出母版后分镜</Badge>
                                </div>

                                {!task.heroImageUrl && (
                                    <div className="py-10 text-center text-slate-500">
                                        <Loader2 className="w-6 h-6 animate-spin mx-auto mb-3" />
                                        正在生成母版...
                                    </div>
                                )}

                                {task.heroImageUrl && (
                                    <div className="space-y-3">
                                        <img
                                            src={withTencentCi(task.heroImageUrl, { maxWidth: 1200, maxHeight: 1200, quality: 80 })}
                                            alt="母版"
                                            className="w-full max-w-md rounded-xl border border-slate-200 shadow-sm"
                                            loading="lazy"
                                            decoding="async"
                                        />

                                        {(() => {
                                            const raw = Array.isArray(task.heroHistory) ? task.heroHistory : [];
                                            const versions = raw
                                                .filter((h) => !!h?.outputImageUrl)
                                                .sort((a, b) => (Number(b.createdAt) || 0) - (Number(a.createdAt) || 0));

                                            if (versions.length <= 1) return null;

                                            const locked = task.status === 'HERO_RENDERING'
                                                || task.status === 'STORYBOARD_PLANNING'
                                                || task.status === 'SHOTS_RENDERING';

                                            return (
                                                <div className="space-y-2">
                                                    <div className="text-xs font-medium text-slate-500 uppercase tracking-wider">
                                                        版本库（{versions.length}）
                                                    </div>
                                                    {locked && (
                                                        <div className="text-xs text-slate-500">
                                                            生成中暂不可切换版本（避免并发写导致工作区混乱）。请等待当前步骤完成。
                                                        </div>
                                                    )}
                                                    <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                                                        {versions.slice(0, 6).map((v) => {
                                                            const createdAt = Number(v.createdAt) || 0;
                                                            const url = String(v.outputImageUrl || '').trim();
                                                            if (!createdAt || !url) return null;

                                                            const isSelected = (task.heroSelectedAttemptCreatedAt
                                                                ? task.heroSelectedAttemptCreatedAt === createdAt
                                                                : task.heroImageUrl === url);
                                                            const isSelecting = selectingHeroAttemptCreatedAt === createdAt;
                                                            const canSelect = !locked && !isSelected && !selectingHeroAttemptCreatedAt;

                                                            return (
                                                                <div
                                                                    key={createdAt}
                                                                    className={`rounded-lg border p-2 bg-white ${isSelected ? 'border-cyan-400' : 'border-slate-200'}`}
                                                                >
                                                                    <img
                                                                        src={withTencentCi(url, { maxWidth: 600, maxHeight: 600, quality: 75 })}
                                                                        alt={`母版版本_${createdAt}`}
                                                                        className="w-full rounded-md border border-slate-100"
                                                                        loading="lazy"
                                                                        decoding="async"
                                                                    />
                                                                    <div className="mt-2 flex items-center justify-between gap-2">
                                                                        <div className="text-[11px] text-slate-500 truncate">
                                                                            #{createdAt}
                                                                        </div>
                                                                        <Button
                                                                            size="sm"
                                                                            variant={isSelected ? 'default' : 'outline'}
                                                                            disabled={!canSelect}
                                                                            onClick={() => handleSelectHeroVariant(createdAt)}
                                                                        >
                                                                            {isSelecting ? '切换中...' : (isSelected ? '当前' : '设为当前')}
                                                                        </Button>
                                                                    </div>
                                                                </div>
                                                            );
                                                        })}
                                                    </div>
                                                    {versions.length > 6 && (
                                                        <div className="text-xs text-slate-500">当前仅展示最近 6 个版本</div>
                                                    )}
                                                </div>
                                            );
                                        })()}

                                        {(task.heroShootLog !== undefined || isEditingHeroShootLog) && (
                                            <div className="space-y-2">
                                                <div className="flex items-center justify-between gap-2">
                                                    <div className="text-xs font-medium text-slate-500 uppercase tracking-wider">
                                                        Shoot Log（手账）
                                                    </div>
                                                    {!isEditingHeroShootLog ? (
                                                        <Button
                                                            size="sm"
                                                            variant="outline"
                                                            onClick={() => {
                                                                const v = task.heroShootLog || '';
                                                                setHeroShootLogDraft(isProbablyBase64Blob(v) ? '' : v);
                                                                setIsEditingHeroShootLog(true);
                                                            }}
                                                        >
                                                            <Edit className="w-3.5 h-3.5 mr-2" />
                                                            编辑手账
                                                        </Button>
                                                    ) : (
                                                        <div className="flex gap-2">
                                                            <Button
                                                                size="sm"
                                                                onClick={handleSaveHeroShootLog}
                                                                disabled={savingHeroShootLog}
                                                            >
                                                                {savingHeroShootLog ? '保存中...' : '保存'}
                                                            </Button>
                                                            <Button
                                                                size="sm"
                                                                variant="outline"
                                                                onClick={() => {
                                                                    setIsEditingHeroShootLog(false);
                                                                    setHeroShootLogDraft(task.heroShootLog || '');
                                                                }}
                                                                disabled={savingHeroShootLog}
                                                            >
                                                                取消
                                                            </Button>
                                                        </div>
                                                    )}
                                                </div>

                                                {(() => {
                                                    const raw = task.heroShootLog || '';
                                                    const hidden = !isEditingHeroShootLog && isProbablyBase64Blob(raw);
                                                    if (!hidden) return null;
                                                    return (
                                                        <div className="text-xs text-amber-600">
                                                            检测到疑似签名/乱码内容（旧版本数据），已隐藏；点击“编辑手账”可覆盖为可读文本。
                                                        </div>
                                                    );
                                                })()}

                                                <Textarea
                                                    value={isEditingHeroShootLog ? heroShootLogDraft : (isProbablyBase64Blob(task.heroShootLog || '') ? '' : (task.heroShootLog || ''))}
                                                    onChange={(e) => setHeroShootLogDraft(e.target.value)}
                                                    readOnly={!isEditingHeroShootLog}
                                                    className="min-h-[140px]"
                                                />
                                            </div>
                                        )}

                                        {task.heroImageUrl && (
                                            <Button
                                                onClick={handleOpenHeroEditor}
                                                disabled={
                                                    isRegeneratingHero
                                                    || task.status === 'HERO_RENDERING'
                                                    || task.status === 'STORYBOARD_PLANNING'
                                                    || task.status === 'SHOTS_RENDERING'
                                                }
                                                variant="outline"
                                            >
                                                <Edit className="w-4 h-4 mr-2" />
                                                局部修改母版
                                            </Button>
                                        )}
                                        {task.heroImageUrl && (
                                            <Button
                                                onClick={handleRegenerateHero}
                                                disabled={isRegeneratingHero || task.status === 'HERO_RENDERING'}
                                                variant="outline"
                                            >
                                                {isRegeneratingHero || task.status === 'HERO_RENDERING' ? '重新生成中...' : '重新生成母版'}
                                            </Button>
                                        )}
                                        {task.heroImageUrl && (
                                            <Button
                                                onClick={() => downloadFromUrl(task.heroImageUrl!, `hero_${task.id}_${Date.now()}.jpg`)}
                                                variant="outline"
                                            >
                                                <Download className="w-4 h-4 mr-2" />
                                                下载母版
                                            </Button>
                                        )}
                                        {task.status === 'STORYBOARD_PLANNING' && (
                                            <div className="flex items-center gap-2 text-slate-500">
                                                <Loader2 className="w-4 h-4 animate-spin" />
                                                分镜动作卡生成中...
                                            </div>
                                        )}
                                    </div>
                                )}

                                {task.storyboardCards && task.storyboardCards.length > 0 && (
                                    <div className="space-y-3">
                                        <div className="flex items-center gap-2 text-sm font-medium text-slate-500 uppercase tracking-wider">
                                            <Layers className="w-4 h-4" />
                                            分镜动作卡（{task.storyboardCards.length}）
                                        </div>

                                        <div className="flex flex-wrap gap-2">
                                            <Button
                                                onClick={handleRenderGrid}
                                                disabled={isRenderingGrid || task.storyboardCards.length !== 4}
                                                variant="outline"
                                            >
                                                {isRenderingGrid ? (
                                                    <span className="flex items-center gap-2">
                                                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                                        拼图生成中...
                                                    </span>
                                                ) : (
                                                    task.gridImageUrl ? '重新生成四镜头拼图' : '四镜头拼图生成'
                                                )}
                                            </Button>
                                            <Button
                                                onClick={handleReplanStoryboard}
                                                disabled={isReplanningStoryboard}
                                                variant="outline"
                                            >
                                                {isReplanningStoryboard ? '重新抽卡中...' : '重新生成分镜（抽卡）'}
                                            </Button>
                                            {isRenderingGrid && (
                                                <span className="text-xs text-slate-500 flex items-center gap-2 self-center">
                                                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                                    拼图生成中...
                                                </span>
                                            )}
                                            {task.storyboardCards.length !== 4 && (
                                                <span className="text-xs text-slate-400 self-center">
                                                    仅当镜头数=4 时支持拼图
                                                </span>
                                            )}
                                        </div>

                                        {task.gridImageUrl && (
                                            <div className="space-y-2">
                                                <div className="flex items-center justify-between gap-2">
                                                    <div className="text-xs font-medium text-slate-500 uppercase tracking-wider">四镜头拼图</div>
                                                    <Button
                                                        size="sm"
                                                        variant="outline"
                                                        onClick={() => downloadFromUrl(task.gridImageUrl!, `grid_${task.id}_${Date.now()}.jpg`)}
                                                    >
                                                        <Download className="w-4 h-4 mr-2" />
                                                        下载
                                                    </Button>
                                                </div>
                                                <img
                                                    src={task.gridImageUrl}
                                                    alt="Grid"
                                                    className="w-full max-w-2xl rounded-xl border border-slate-200 shadow-sm"
                                                />
                                                {(task.gridShootLog !== undefined || isEditingGridShootLog) && (
                                                    <div className="space-y-2">
                                                        <div className="flex items-center justify-between gap-2">
                                                            <div className="text-xs font-medium text-slate-500 uppercase tracking-wider">
                                                                Shoot Log（手账）
                                                            </div>
                                                            {!isEditingGridShootLog ? (
                                                                <Button
                                                                    size="sm"
                                                                    variant="outline"
                                                                    onClick={() => {
                                                                        const v = task.gridShootLog || '';
                                                                        setGridShootLogDraft(isProbablyBase64Blob(v) ? '' : v);
                                                                        setIsEditingGridShootLog(true);
                                                                    }}
                                                                >
                                                                    <Edit className="w-3.5 h-3.5 mr-2" />
                                                                    编辑手账
                                                                </Button>
                                                            ) : (
                                                                <div className="flex gap-2">
                                                                    <Button
                                                                        size="sm"
                                                                        onClick={handleSaveGridShootLog}
                                                                        disabled={savingGridShootLog}
                                                                    >
                                                                        {savingGridShootLog ? '保存中...' : '保存'}
                                                                    </Button>
                                                                    <Button
                                                                        size="sm"
                                                                        variant="outline"
                                                                        onClick={() => {
                                                                            setIsEditingGridShootLog(false);
                                                                            setGridShootLogDraft(task.gridShootLog || '');
                                                                        }}
                                                                        disabled={savingGridShootLog}
                                                                    >
                                                                        取消
                                                                    </Button>
                                                                </div>
                                                            )}
                                                        </div>

                                                        {(() => {
                                                            const raw = task.gridShootLog || '';
                                                            const hidden = !isEditingGridShootLog && isProbablyBase64Blob(raw);
                                                            if (!hidden) return null;
                                                            return (
                                                                <div className="text-xs text-amber-600">
                                                                    检测到疑似签名/乱码内容（旧版本数据），已隐藏；点击“编辑手账”可覆盖为可读文本。
                                                                </div>
                                                            );
                                                        })()}

                                                        <Textarea
                                                            value={isEditingGridShootLog ? gridShootLogDraft : (isProbablyBase64Blob(task.gridShootLog || '') ? '' : (task.gridShootLog || ''))}
                                                            onChange={(e) => setGridShootLogDraft(e.target.value)}
                                                            readOnly={!isEditingGridShootLog}
                                                            className="min-h-[120px]"
                                                        />
                                                    </div>
                                                )}
                                            </div>
                                        )}

                                        <div className="grid gap-3">
                                            {task.storyboardCards.map((c) => (
                                                <div key={c.index} className="p-4 rounded-xl border border-slate-200 bg-slate-50">
                                                    <div className="text-sm font-semibold text-slate-800 mb-2">#{c.index} {c.action}</div>
                                                    <div className="grid gap-2 text-sm text-slate-700">
                                                        <div><span className="font-medium">站位：</span>{c.blocking}</div>
                                                        <div><span className="font-medium">机位：</span>{c.camera}</div>
                                                        <div><span className="font-medium">景别：</span>{c.framing}</div>
                                                        <div><span className="font-medium">灯光：</span>{c.lighting}</div>
                                                        <div><span className="font-medium">遮挡禁区：</span>{c.occlusionNoGo}</div>
                                                        <div><span className="font-medium">承接：</span>{c.continuity}</div>
                                                    </div>

                                                    <div className="mt-3 flex flex-wrap gap-2 items-center">
                                                        <Button
                                                            size="sm"
                                                            onClick={() => handleRenderShot(c.index)}
                                                            disabled={
                                                                renderingShotIndices.has(c.index)
                                                                || task.heroShots?.find((s) => s.index === c.index)?.status === 'PENDING'
                                                            }
                                                            variant="outline"
                                                        >
                                                            {(renderingShotIndices.has(c.index) || task.heroShots?.find((s) => s.index === c.index)?.status === 'PENDING') ? (
                                                                <span className="flex items-center gap-2">
                                                                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                                                    生成中...
                                                                </span>
                                                            ) : (
                                                                task.heroShots?.find((s) => s.index === c.index)?.imageUrl ? '重新生成该镜头' : '生成该镜头'
                                                            )}
                                                        </Button>

                                                        <Button
                                                            size="sm"
                                                            variant="outline"
                                                            onClick={() => {
                                                                if (editingStoryboardIndex === c.index) return closeStoryboardEditor();
                                                                openStoryboardEditor(c.index);
                                                            }}
                                                            disabled={savingStoryboardIndex === c.index}
                                                        >
                                                            <Edit className="w-3.5 h-3.5 mr-2" />
                                                            {editingStoryboardIndex === c.index ? '收起文字编辑' : '编辑镜头文字'}
                                                        </Button>

                                                        <Button
                                                            size="sm"
                                                            variant="outline"
                                                            onClick={() => cycleCameraText(c.index)}
                                                            disabled={cyclingCameraIndex === c.index || savingStoryboardIndex === c.index}
                                                        >
                                                            {cyclingCameraIndex === c.index ? (
                                                                <Loader2 className="w-3.5 h-3.5 animate-spin mr-2" />
                                                            ) : (
                                                                <RefreshCcw className="w-3.5 h-3.5 mr-2" />
                                                            )}
                                                            换镜头
                                                        </Button>

                                                        {(() => {
                                                            const shot = task.heroShots?.find((s) => s.index === c.index);
                                                            if (!shot?.imageUrl) return null;
                                                            return (
                                                                <Button
                                                                    size="sm"
                                                                    variant="outline"
                                                                    onClick={() => downloadFromUrl(shot.imageUrl!, `shot_${task.id}_${c.index}_${Date.now()}.jpg`)}
                                                                >
                                                                    <Download className="w-3.5 h-3.5 mr-2" />
                                                                    下载当前镜头
                                                                </Button>
                                                            );
                                                        })()}
                                                    </div>

                                                    {editingStoryboardIndex === c.index && storyboardDraft && (
                                                        <div className="mt-3 p-4 rounded-xl border border-slate-200 bg-white space-y-4">
                                                            <div className="flex items-center justify-between gap-2">
                                                                <div className="text-sm font-semibold text-slate-800">镜头 #{c.index} 文字编辑</div>
                                                                <div className="flex items-center gap-2">
                                                                    <Button
                                                                        size="sm"
                                                                        variant="outline"
                                                                        onClick={closeStoryboardEditor}
                                                                        disabled={savingStoryboardIndex === c.index}
                                                                    >
                                                                        取消
                                                                    </Button>
                                                                    <Button
                                                                        size="sm"
                                                                        onClick={saveStoryboardEditor}
                                                                        disabled={savingStoryboardIndex === c.index}
                                                                        className="bg-slate-900 hover:bg-slate-800 text-white"
                                                                    >
                                                                        {savingStoryboardIndex === c.index ? (
                                                                            <span className="flex items-center gap-2">
                                                                                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                                                                保存中...
                                                                            </span>
                                                                        ) : (
                                                                            <span className="flex items-center gap-2">
                                                                                <Save className="w-3.5 h-3.5" />
                                                                                保存
                                                                            </span>
                                                                        )}
                                                                    </Button>
                                                                </div>
                                                            </div>

                                                            <div className="grid gap-3 md:grid-cols-2">
                                                                <div className="space-y-1">
                                                                    <div className="text-xs text-slate-500">大场景子区域（scene_subarea）</div>
                                                                    <Input
                                                                        value={storyboardDraft.sceneSubarea}
                                                                        onChange={(e) => setStoryboardDraft(prev => prev ? { ...prev, sceneSubarea: e.target.value } : prev)}
                                                                    />
                                                                </div>
                                                                <div className="space-y-1">
                                                                    <div className="text-xs text-slate-500">景别/角度（shot_type）</div>
                                                                    <Input
                                                                        value={storyboardDraft.shotType}
                                                                        onChange={(e) => setStoryboardDraft(prev => prev ? { ...prev, shotType: e.target.value } : prev)}
                                                                    />
                                                                </div>
                                                                <div className="space-y-1 md:col-span-2">
                                                                    <div className="text-xs text-slate-500">动作（action_pose）</div>
                                                                    <Textarea
                                                                        value={storyboardDraft.actionPose}
                                                                        onChange={(e) => setStoryboardDraft(prev => prev ? { ...prev, actionPose: e.target.value } : prev)}
                                                                        className="min-h-[90px]"
                                                                    />
                                                                </div>
                                                                <div className="space-y-1 md:col-span-2">
                                                                    <div className="text-xs text-slate-500">本帧目标（goal）</div>
                                                                    <Textarea
                                                                        value={storyboardDraft.goal}
                                                                        onChange={(e) => setStoryboardDraft(prev => prev ? { ...prev, goal: e.target.value } : prev)}
                                                                        className="min-h-[70px]"
                                                                    />
                                                                </div>
                                                            </div>

                                                            <div className="grid gap-3 md:grid-cols-3">
                                                                <div className="space-y-1">
                                                                    <div className="text-xs text-slate-500">相机系统（camera_choice.system）</div>
                                                                    <Input
                                                                        value={storyboardDraft.cameraSystem}
                                                                        onChange={(e) => setStoryboardDraft(prev => prev ? { ...prev, cameraSystem: e.target.value } : prev)}
                                                                    />
                                                                </div>
                                                                <div className="space-y-1">
                                                                    <div className="text-xs text-slate-500">镜头/焦段（camera_choice.model）</div>
                                                                    <Input
                                                                        value={storyboardDraft.cameraModel}
                                                                        onChange={(e) => setStoryboardDraft(prev => prev ? { ...prev, cameraModel: e.target.value } : prev)}
                                                                    />
                                                                </div>
                                                                <div className="space-y-1">
                                                                    <div className="text-xs text-slate-500">光圈（camera_choice.f_stop）</div>
                                                                    <Input
                                                                        value={storyboardDraft.cameraFStop}
                                                                        onChange={(e) => setStoryboardDraft(prev => prev ? { ...prev, cameraFStop: e.target.value } : prev)}
                                                                    />
                                                                </div>
                                                            </div>

                                                            <div className="grid gap-3 md:grid-cols-2">
                                                                <div className="space-y-1 md:col-span-2">
                                                                    <div className="text-xs text-slate-500">场景光（lighting_plan.scene_light）</div>
                                                                    <Input
                                                                        value={storyboardDraft.lightingSceneLight}
                                                                        onChange={(e) => setStoryboardDraft(prev => prev ? { ...prev, lightingSceneLight: e.target.value } : prev)}
                                                                    />
                                                                </div>
                                                                <div className="space-y-1">
                                                                    <div className="text-xs text-slate-500">主光（product_light.key）</div>
                                                                    <Input
                                                                        value={storyboardDraft.lightingKey}
                                                                        onChange={(e) => setStoryboardDraft(prev => prev ? { ...prev, lightingKey: e.target.value } : prev)}
                                                                    />
                                                                </div>
                                                                <div className="space-y-1">
                                                                    <div className="text-xs text-slate-500">轮廓光（product_light.rim）</div>
                                                                    <Input
                                                                        value={storyboardDraft.lightingRim}
                                                                        onChange={(e) => setStoryboardDraft(prev => prev ? { ...prev, lightingRim: e.target.value } : prev)}
                                                                    />
                                                                </div>
                                                                <div className="space-y-1">
                                                                    <div className="text-xs text-slate-500">补光（product_light.fill）</div>
                                                                    <Input
                                                                        value={storyboardDraft.lightingFill}
                                                                        onChange={(e) => setStoryboardDraft(prev => prev ? { ...prev, lightingFill: e.target.value } : prev)}
                                                                    />
                                                                </div>
                                                            </div>

                                                            <div className="grid gap-3 md:grid-cols-2">
                                                                <div className="space-y-1">
                                                                    <div className="text-xs text-slate-500">遮挡禁区（occlusion_guard，一行一条）</div>
                                                                    <Textarea
                                                                        value={storyboardDraft.occlusionGuardText}
                                                                        onChange={(e) => setStoryboardDraft(prev => prev ? { ...prev, occlusionGuardText: e.target.value } : prev)}
                                                                        className="min-h-[120px]"
                                                                    />
                                                                </div>
                                                                <div className="space-y-1">
                                                                    <div className="text-xs text-slate-500">构图说明（composition_notes）</div>
                                                                    <Textarea
                                                                        value={storyboardDraft.compositionNotes}
                                                                        onChange={(e) => setStoryboardDraft(prev => prev ? { ...prev, compositionNotes: e.target.value } : prev)}
                                                                        className="min-h-[120px]"
                                                                    />
                                                                </div>
                                                            </div>

                                                            <div className="grid gap-3 md:grid-cols-2">
                                                                <div className="space-y-1">
                                                                    <div className="text-xs text-slate-500">参考图强制要求（ref_requirements，一行一条）</div>
                                                                    <Textarea
                                                                        value={storyboardDraft.refRequirementsText}
                                                                        onChange={(e) => setStoryboardDraft(prev => prev ? { ...prev, refRequirementsText: e.target.value } : prev)}
                                                                        className="min-h-[120px]"
                                                                    />
                                                                </div>
                                                                <div className="space-y-1">
                                                                    <div className="text-xs text-slate-500">通用统一要求（universal_requirements，一行一条）</div>
                                                                    <Textarea
                                                                        value={storyboardDraft.universalRequirementsText}
                                                                        onChange={(e) => setStoryboardDraft(prev => prev ? { ...prev, universalRequirementsText: e.target.value } : prev)}
                                                                        className="min-h-[120px]"
                                                                    />
                                                                </div>
                                                                <div className="space-y-1 md:col-span-2">
                                                                    <div className="text-xs text-slate-500">物理逻辑（physical_logic）</div>
                                                                    <Textarea
                                                                        value={storyboardDraft.physicalLogic}
                                                                        onChange={(e) => setStoryboardDraft(prev => prev ? { ...prev, physicalLogic: e.target.value } : prev)}
                                                                        className="min-h-[90px]"
                                                                    />
                                                                </div>
                                                                <div className="space-y-1 md:col-span-2">
                                                                    <div className="text-xs text-slate-500">最高权重执行指令（exec_instruction_text）</div>
                                                                    <Textarea
                                                                        value={storyboardDraft.execInstructionText}
                                                                        onChange={(e) => setStoryboardDraft(prev => prev ? { ...prev, execInstructionText: e.target.value } : prev)}
                                                                        className="min-h-[120px]"
                                                                    />
                                                                </div>
                                                            </div>

                                                            <div className="text-xs text-slate-500">
                                                                提示：这里只改“文字/规划”，不会自动出图；保存后需要点击“重新生成该镜头”才会按新内容生效。
                                                            </div>
                                                        </div>
                                                    )}

                                                    {(() => {
                                                        const shot = task.heroShots?.find((s) => s.index === c.index);
                                                        if (!shot?.imageUrl) return null;
                                                        const primaryVariant: ShotVariant = {
                                                            createdAt: shot.selectedAttemptCreatedAt || shot.createdAt || Date.now(),
                                                            outputImageUrl: shot.imageUrl,
                                                            outputShootLog: shot.shootLog,
                                                            __synthetic: true,
                                                        };
                                                        const variantsRaw: ShotVariant[] = [
                                                            primaryVariant,
                                                            ...(shot.attempts || []).filter((a) => !!a.outputImageUrl),
                                                        ];
                                                        const seen = new Set<string>();
                                                        const variants = variantsRaw
                                                            .filter((v) => {
                                                                const url = v.outputImageUrl;
                                                                if (!url || typeof url !== 'string') return false;
                                                                if (seen.has(url)) return false;
                                                                seen.add(url);
                                                                return true;
                                                            })
                                                            .sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
                                                        return (
                                                            <div className="mt-3 space-y-2">
                                                                <img
                                                                    src={withTencentCi(shot.imageUrl, { maxWidth: 1200, maxHeight: 1200, quality: 80 })}
                                                                    alt={`Shot ${c.index}`}
                                                                    className="w-full max-w-md rounded-xl border border-slate-200 shadow-sm"
                                                                    loading="lazy"
                                                                    decoding="async"
                                                                />
                                                                {(shot.shootLog !== undefined || editingShotLogIndex === c.index) && (
                                                                    <div className="space-y-2">
                                                                        <div className="flex items-center justify-between gap-2">
                                                                            <div className="text-xs font-medium text-slate-500 uppercase tracking-wider">
                                                                                Shoot Log（手账）
                                                                            </div>
                                                                            {editingShotLogIndex !== c.index ? (
                                                                                <Button
                                                                                    size="sm"
                                                                                    variant="outline"
                                                                                    onClick={() => startEditShotShootLog(c.index, isProbablyBase64Blob(shot.shootLog || '') ? '' : (shot.shootLog || ''))}
                                                                                >
                                                                                    <Edit className="w-3.5 h-3.5 mr-2" />
                                                                                    编辑手账
                                                                                </Button>
                                                                            ) : (
                                                                                <div className="flex gap-2">
                                                                                    <Button
                                                                                        size="sm"
                                                                                        onClick={handleSaveShotShootLog}
                                                                                        disabled={savingShotShootLog}
                                                                                    >
                                                                                        {savingShotShootLog ? '保存中...' : '保存'}
                                                                                    </Button>
                                                                                    <Button
                                                                                        size="sm"
                                                                                        variant="outline"
                                                                                        onClick={() => {
                                                                                            setEditingShotLogIndex(null);
                                                                                            setShotShootLogDraft('');
                                                                                        }}
                                                                                        disabled={savingShotShootLog}
                                                                                    >
                                                                                        取消
                                                                                    </Button>
                                                                                </div>
                                                                            )}
                                                                        </div>

                                                                        {(() => {
                                                                            const raw = shot.shootLog || '';
                                                                            const hidden = editingShotLogIndex !== c.index && isProbablyBase64Blob(raw);
                                                                            if (!hidden) return null;
                                                                            return (
                                                                                <div className="text-xs text-amber-600">
                                                                                    检测到疑似签名/乱码内容（旧版本数据），已隐藏；点击“编辑手账”可覆盖为可读文本。
                                                                                </div>
                                                                            );
                                                                        })()}

                                                                        <Textarea
                                                                            value={editingShotLogIndex === c.index
                                                                                ? shotShootLogDraft
                                                                                : (isProbablyBase64Blob(shot.shootLog || '') ? '' : (shot.shootLog || ''))}
                                                                            onChange={(e) => setShotShootLogDraft(e.target.value)}
                                                                            readOnly={editingShotLogIndex !== c.index}
                                                                            className="min-h-[120px]"
                                                                        />
                                                                    </div>
                                                                )}

                                                                {variants.length > 1 && (
                                                                    <div className="space-y-2">
                                                                        <div className="text-xs font-medium text-slate-500 uppercase tracking-wider">
                                                                            版本对照（不会覆盖，选中后用于“姿势裂变”）
                                                                        </div>
                                                                        <div className="flex gap-2 overflow-x-auto pb-1">
                                                                            {variants.map((v) => {
                                                                                const isSelected = shot.selectedAttemptCreatedAt === v.createdAt;
                                                                                const isSynthetic = !!v.__synthetic;
                                                                                const attemptKey = `${c.index}:${v.createdAt}`;
                                                                                return (
                                                                                    <div key={v.createdAt} className={`shrink-0 rounded-lg border ${isSelected ? 'border-green-400 bg-green-50' : 'border-slate-200 bg-white'} p-2 w-[140px]`}>
                                                                                        <a href={v.outputImageUrl!} target="_blank" rel="noreferrer">
                                                                                            <img
                                                                                                src={withTencentCi(v.outputImageUrl!, { maxWidth: 320, maxHeight: 320 })}
                                                                                                alt={`Shot ${c.index} variant`}
                                                                                                className="w-full h-[140px] object-cover rounded-md border border-slate-100"
                                                                                                loading="lazy"
                                                                                                decoding="async"
                                                                                            />
                                                                                        </a>
                                                                                        <div className="mt-2 flex items-center justify-between gap-2">
                                                                                            <span className="text-[10px] text-slate-500">
                                                                                                {new Date(v.createdAt).toLocaleTimeString('zh-CN')}
                                                                                            </span>
                                                                                            <div className="flex items-center gap-2">
                                                                                                <Button
                                                                                                    size="icon"
                                                                                                    variant="outline"
                                                                                                    className="h-6 w-6"
                                                                                                    onClick={() => downloadFromUrl(v.outputImageUrl!, `shot_${task.id}_${c.index}_${v.createdAt}.jpg`)}
                                                                                                >
                                                                                                    <Download className="w-3 h-3" />
                                                                                                </Button>
                                                                                                <Badge variant="outline" className="text-[10px] px-1.5 py-0">
                                                                                                    {isSelected ? '已选' : '备选'}
                                                                                                </Badge>
                                                                                            </div>
                                                                                        </div>
                                                                                        <Button
                                                                                            size="sm"
                                                                                            variant={isSelected ? 'secondary' : 'outline'}
                                                                                            className="mt-2 w-full h-8 text-xs"
                                                                                            disabled={isSynthetic || selectingShotAttemptKey === attemptKey}
                                                                                            onClick={() => handleSelectShotVariant(c.index, v.createdAt)}
                                                                                        >
                                                                                            {selectingShotAttemptKey === attemptKey ? (
                                                                                                <span className="flex items-center gap-2">
                                                                                                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                                                                                    选择中...
                                                                                                </span>
                                                                                            ) : (
                                                                                                isSelected ? '当前裂变版本' : (isSynthetic ? '当前显示版本' : '选择为裂变版本')
                                                                                            )}
                                                                                        </Button>
                                                                                    </div>
                                                                                );
                                                                            })}
                                                                        </div>
                                                                    </div>
                                                                )}
                                                            </div>
                                                        );
                                                    })()}
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                )}
                            </CardContent>
                        </Card>
                    </motion.div>
                )}

                {isHeroStoryboard && task.heroImageUrl && (
                    <ImageEditor
                        open={heroEditorOpen}
                        onClose={() => setHeroEditorOpen(false)}
                        taskId={task.id}
                        mode="hero"
                        imageUrl={task.heroImageUrl}
                        onEditComplete={() => void handleHeroEditComplete()}
                    />
                )}

                {/* 2. Visual Analysis (Brain Output) */}
                {showVisualAnalysis && (
                    <VisualAnalysisCard plan={task.brainPlan!} />
                )}

                {/* 3. Thinking Process (Hidden gem) */}
                {showThinking && (
                    <ThinkingProcessCard content={task.brainPlan!.thinkingProcess!} />
                )}

                {/* 4. Approval Workflow */}
                {showApproval && (
                    <ApprovalInterface
                        ref={approvalRef}
                        taskId={task.id}
                        shots={normalizeBrainPlan(task.brainPlan).shots}
                        onApproved={() => setTask(prev => prev ? { ...prev, status: 'RENDERING' } : null)}
                    />
                )}

                {/* 5. Rendering / Results */}
                {showResults && (
                    <ResultsGrid
                        shots={displayShots as Shot[]}
                        taskId={task.id}
                        onRetry={fetchTask}
                        layoutMode={task.layout_mode}
                        onUseForBatch={handleUseForBatch}
                    />
                )}

                {/* 6. Empty/Loading State for initial processing */}
                {!showVisualAnalysis && task.status === 'PLANNING' && (
                    <div className="py-20 text-center">
                        <div className="relative w-24 h-24 mx-auto mb-8">
                            <div className="absolute inset-0 border-4 border-blue-100 rounded-full animate-ping" />
                            <div className="absolute inset-0 border-4 border-blue-500 border-t-transparent rounded-full animate-spin" />
                            <Brain className="absolute inset-0 m-auto text-blue-500 w-8 h-8" />
                        </div>
                        <h3 className="text-xl font-bold text-slate-800 mb-2">Brain 正在分析需求</h3>
                        <p className="text-slate-500 max-w-md mx-auto">
                            AI 正在阅读您的参考图，分析风格与光影，并规划分镜拍摄方案...
                        </p>
                    </div>
                )}
            </div>
        </div>
    );
}
