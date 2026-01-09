"use client";

import * as React from 'react';
import { useParams, useRouter } from 'next/navigation';
import api, { BACKEND_ORIGIN } from '@/lib/api';
import { Loader2, ArrowLeft, Check, Sparkles, Brain, Camera, AlertCircle, ChevronDown, ChevronUp, Clock, Palette, Layers, Image as ImageIcon, RefreshCcw, Download, Save, Edit, ZoomIn, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import Link from 'next/link';
import { motion, AnimatePresence } from 'framer-motion';
import { Badge } from '@/components/ui/badge';
import { ImageEditor } from '@/components/image-editor';
import { ImageLightbox } from '@/components/image-lightbox';
import { useToast } from '@/components/ui/use-toast';


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
    status: 'PENDING' | 'RENDERED' | 'FAILED';
}

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
    shots: Shot[];
    thinkingProcess?: string;
    // v3.0+ fields
    meta?: any;
    frames?: any[];
    ui_params?: any;
    [key: string]: any; // 允许任意额外字段
}

interface TaskData {
    id: string;
    status: 'PENDING' | 'PLANNING' | 'AWAITING_APPROVAL' | 'RENDERING' | 'COMPLETED' | 'FAILED';
    requirements: string;
    brainPlan?: BrainPlan;
    shots?: Shot[];
    error?: string;
    createdAt: number;
}

/**
 * 智能适配器：自动识别 Brain Plan 版本并规范化为统一格式
 * 支持 v2.0 (visual_analysis/styling_plan) 和 v3.0 (meta/frames) 等多种版本
 */
function normalizeBrainPlan(plan: any): {
    version: 'v2' | 'v3' | 'unknown';
    summary: string;
    details: Array<{ label: string; value: string; important?: boolean }>;
    shots: Shot[];
    thinkingProcess?: string;
    rawMeta?: any; // 保留原始 meta 供调试
} {
    if (!plan) {
        return {
            version: 'unknown',
            summary: '',
            details: [],
            shots: [],
        };
    }

    // 检测版本
    const hasV2Fields = plan.visual_analysis || plan.styling_plan;
    const hasV3Fields = plan.meta || plan.frames;

    if (hasV3Fields) {
        // ===== v3.0 格式：完整提取 =====
        const meta = plan.meta || {};
        const frames = plan.frames || [];
        const uiParams = plan.ui_params || {};

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
        if (plan.collage_mode_note?.enabled) {
            details.push({
                label: '🎨 拼图模式',
                value: `${plan.collage_mode_note.layout} - ${plan.collage_mode_note.note || '多帧合并'}`
            });
        }

        // 转换 frames 为 shots 格式
        const shots: Shot[] = frames.map((frame: any, idx: number) => ({
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
            shots: shots.length > 0 ? shots : (plan.shots || []),
            thinkingProcess: plan.thinkingProcess,
            rawMeta: meta, // 保留原始数据供调试
        };
    }

    if (hasV2Fields) {
        // ===== v2.0 格式：保持兼容 =====
        const details: Array<{ label: string; value: string; important?: boolean }> = [];

        if (plan.visual_analysis?.vibe) {
            details.push({ label: '🎨 视觉风格', value: plan.visual_analysis.vibe });
        }

        if (plan.styling_plan) {
            const styling = [];
            if (plan.styling_plan.upper) styling.push(`上装: ${plan.styling_plan.upper}`);
            if (plan.styling_plan.lower) styling.push(`下装: ${plan.styling_plan.lower}`);
            if (plan.styling_plan.shoes) styling.push(`鞋履: ${plan.styling_plan.shoes}`);
            if (plan.styling_plan.accessories) styling.push(`配饰: ${plan.styling_plan.accessories}`);
            if (styling.length > 0) {
                details.push({ label: '👔 穿搭方案', value: styling.join('\n') });
            }
        }

        return {
            version: 'v2',
            summary: plan.visual_analysis?.vibe || 'AI 正在分析风格...',
            details,
            shots: plan.shots || [],
            thinkingProcess: plan.thinkingProcess,
        };
    }

    // ===== 未知版本：降级处理 =====
    return {
        version: 'unknown',
        summary: 'AI 分析结果',
        details: [],
        shots: plan.shots || plan.frames || [],
        thinkingProcess: plan.thinkingProcess,
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
    const config = {
        PENDING: { color: "bg-slate-100 text-slate-600", icon: Clock, text: "等待处理..." },
        PLANNING: { color: "bg-blue-100 text-blue-700", icon: Brain, text: "AI 正在深度思考与策划..." },
        AWAITING_APPROVAL: { color: "bg-amber-100 text-amber-700", icon: AlertCircle, text: "方案已生成，请审核" },
        RENDERING: { color: "bg-purple-100 text-purple-700", icon: Sparkles, text: "正在渲染高定大片..." },
        COMPLETED: { color: "bg-green-100 text-green-700", icon: Check, text: "创作完成" },
        FAILED: { color: "bg-red-100 text-red-700", icon: AlertCircle, text: "任务执行失败" },
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
                    <Icon className={`w-4 h-4 ${status === 'PLANNING' || status === 'RENDERING' ? 'animate-pulse' : ''}`} />
                    {config.text}
                </div>

                {(status === 'FAILED' || status === 'COMPLETED') && (
                    <div className="flex gap-2">
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
                        <Button
                            onClick={onDelete}
                            disabled={isRetrying || isDeleting}
                            variant="ghost"
                            size="sm"
                            className="text-red-500 hover:bg-red-50 hover:text-red-600 h-9"
                        >
                            {isDeleting ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Trash2 className="w-4 h-4 mr-2" />}
                            删除任务
                        </Button>
                    </div>
                )}
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
function ApprovalInterface({
    taskId,
    shots,
    onApproved
}: {
    taskId: string,
    shots: Shot[],
    onApproved: () => void
}) {
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
            alert(`Shot ${shotId} 已开始重新生成`);
            onApproved(); // Refresh the page
        } catch (e) {
            console.error(e);
            alert('重新生成失败');
        } finally {
            setRegeneratingId(null);
        }
    };

    const handleApprove = async () => {
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
    };

    return (
        <motion.div initial={{ opacity: 0, scale: 0.98 }} animate={{ opacity: 1, scale: 1 }} className="mt-8">
            <div className="bg-gradient-to-b from-green-50 to-white border border-green-100 rounded-2xl shadow-xl overflow-hidden">
                <div className="p-6 border-b border-green-100 bg-white/50 backdrop-blur-sm">
                    <div className="flex items-center gap-3 mb-2">
                        <div className="p-2 bg-green-100 rounded-full">
                            <Check className="w-5 h-5 text-green-700" />
                        </div>
                        <h2 className="text-xl font-bold text-green-900">方案确认</h2>
                    </div>
                    <p className="text-green-700/80 pl-12">请仔细检查 AI 生成的拍摄提示词。您可以直接修改，确认无误后点击下方按钮开始生成图片。</p>
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

                <div className="p-6 bg-slate-50 border-t border-slate-100 flex justify-end">
                    <Button
                        size="lg"
                        onClick={handleApprove}
                        disabled={isSubmitting}
                        className="bg-green-600 hover:bg-green-700 text-white shadow-lg shadow-green-600/20 text-lg px-8 py-6 h-auto"
                    >
                        {isSubmitting ? <Loader2 className="animate-spin mr-2" /> : <Sparkles className="mr-2" />}
                        确认方案并生成图片
                    </Button>
                </div>
            </div>
        </motion.div>
    );
}

interface TaskData {
    id: string;
    status: 'PENDING' | 'PLANNING' | 'AWAITING_APPROVAL' | 'RENDERING' | 'COMPLETED' | 'FAILED';
    requirements: string;
    layout_mode?: 'Individual' | 'Grid'; // Added
    brainPlan?: BrainPlan;
    shots?: Shot[];
    error?: string;
    createdAt: number;
}

// 5. Results Grid with Retry functionality
function ResultsGrid({ shots, taskId, onRetry, layoutMode }: { shots: Shot[]; taskId: string; onRetry: () => void; layoutMode?: string }) {
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

    const handleImageClick = (index: number) => {
        let images;

        if (layoutMode === 'Grid') {
            // In Grid mode, we want to show ALL shots in the lightbox, even if they share the same 'contact sheet' image
            // This allows users to navigate to "Shot 2" and click "Regenerate" for that specific shot ID.
            const gridShot = shots.find(s => s.status === 'RENDERED' && s.imagePath);
            const gridImageUrl = gridShot ? `${BACKEND_ORIGIN}/${gridShot.imagePath}` : '';

            images = shots
                .filter(s => s.status === 'RENDERED') // Only rendered shots are interactive
                .map(s => ({
                    id: s.id || s.shot_id || '',
                    // Use individual image if exists (e.g. after a single-shot retry), otherwise fallback to the shared grid image
                    url: (s.imagePath ? `${BACKEND_ORIGIN}/${s.imagePath}` : gridImageUrl),
                    prompt: s.prompt_en || s.prompt
                }))
                .filter(img => img.url); // Ensure we have a valid URL
        } else {
            // Individual mode: strictly show shots that have their own images
            images = shots
                .filter(s => s.status === 'RENDERED' && s.imagePath)
                .map(s => ({
                    id: s.id || s.shot_id || '',
                    url: `${BACKEND_ORIGIN}/${s.imagePath}`,
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
            await api.post(`/tasks/${taskId}/retry`);
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

    const handleDownload = (imagePath: string, shotNum: number) => {
        const link = document.createElement('a');
        link.href = `${BACKEND_ORIGIN}/${imagePath}`;
        link.download = `shot_${shotNum}_${Date.now()}.jpg`;
        link.target = '_blank';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    };

    // Grid Mode Special Rendering
    if (layoutMode === 'Grid' && shots.length > 0) {
        // In Grid mode, all shots share the same image (the contact sheet)
        // We find the first successful image to display
        const gridShot = shots.find(s => s.status === 'RENDERED' && s.imagePath);

        if (gridShot) {
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
                                src={`${BACKEND_ORIGIN}/${gridShot.imagePath}`}
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
                                        onClick={() => handleDownload(gridShot.imagePath!, 0)}
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
                            <div className="aspect-[3/4] relative bg-slate-100 overflow-hidden cursor-pointer" onClick={() => shot.imagePath && handleImageClick(idx)}>
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
                                    {shot.imagePath && shot.status === 'RENDERED' && (
                                        <div className="flex gap-1">
                                            <Button
                                                onClick={() => handleDownload(shot.imagePath!, idx + 1)}
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
                                                onClick={() => handleEdit(shotId, shot.imagePath!)}
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
    const { toast } = useToast();

    // Define fetchTask outside useEffect to share with retry handle
    const fetchTask = React.useCallback(async () => {
        try {
            const res = await api.get(`/tasks/${params.id}`);
            setTask(res.data);
            if (['COMPLETED', 'FAILED'].includes(res.data.status)) {
                // Done
            }
            setLoading(false);
        } catch (err) {
            console.error(err);
            setError('无法加载任务详情');
            setLoading(false);
        }
    }, [params.id]);

    const handleRetryTask = async () => {
        if (!confirm('确定要重新执行此任务吗？')) return;
        setIsRetrying(true);
        try {
            await api.post(`/tasks/${params.id}/retry`);
            toast({
                title: "任务已重新提交",
                description: "AI 正在重新生成拍摄方案",
            });
            await fetchTask();
        } catch (error) {
            console.error(error);
            toast({
                variant: "destructive",
                title: "重试失败",
                description: "操作遇到错误，请稍后再试",
            });
        } finally {
            setIsRetrying(false);
        }
    };

    const handleDeleteTask = async () => {
        if (!confirm('确定要删除此任务吗？此操作不可撤销！')) return;
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

    // Determine what to show based on status
    const showThinking = task.brainPlan?.thinkingProcess;
    const showVisualAnalysis = task.brainPlan;
    // 兼容 v2.0 (shots) 和 v3.0 (frames)
    const showApproval = task.status === 'AWAITING_APPROVAL' && (task.brainPlan?.shots || task.brainPlan?.frames);
    const showResults = ['RENDERING', 'COMPLETED', 'FAILED'].includes(task.status);

    // For results, we use task.shots (from DB) or shots from brainPlan if rendering hasn't populated DB yet
    const displayShots = task.shots && task.shots.length > 0 ? task.shots : (task.brainPlan?.shots || []);

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
