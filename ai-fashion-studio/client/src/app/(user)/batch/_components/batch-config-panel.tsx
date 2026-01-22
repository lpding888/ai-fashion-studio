'use client';

import * as React from 'react';
import { Loader2, Play, ChevronDown } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select';
 
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog';

import { useStylePresetStore } from '@/store/style-preset-store';
import { usePosePresetStore } from '@/store/pose-preset-store';
import { FacePresetSelector } from '@/components/face-preset-selector';
import { type FormHistoryItem } from '@/hooks/useFormHistory';

import {
    BatchMode,
    DirectResolution,
    DirectAspectRatio,
    DIRECT_STYLE_NONE,
    DIRECT_RESOLUTION_OPTIONS,
    DIRECT_ASPECT_RATIO_OPTIONS,
    MAX_POSE_SELECT,
    MAX_DIRECT_SHOTS,
    MAX_STYLE_REF_IMAGES,
    isDirectResolution,
    isDirectAspectRatio
} from './types';
import { ReferenceUploadStrip } from './upload-strips';

interface BatchConfigPanelProps {
    mode: BatchMode;
    setMode: (m: BatchMode) => void;
    parallel: number;
    setParallel: (n: number) => void;
    autoApprove: boolean;
    setAutoApprove: (b: boolean) => void;

    // Legacy Props
    historyItems: FormHistoryItem[];
    presetId: string;
    setPresetId: (id: string) => void;
    preset?: FormHistoryItem;
    legacyFaceRefFiles: File[];
    setLegacyFaceRefFiles: (f: File[]) => void;
    legacyFaceRefUrls: string[];
    setLegacyFaceRefUrls: (u: string[] | ((prev: string[]) => string[])) => void;
    legacyStyleRefFiles: File[];
    setLegacyStyleRefFiles: (f: File[]) => void;
    legacyStyleRefUrls: string[];
    setLegacyStyleRefUrls: (u: string[] | ((prev: string[]) => string[])) => void;
    legacyMaxGarmentsPerGroup: number;
    legacyReservedRefs: number;

    // Direct Props
    directPrompt: string;
    setDirectPrompt: (s: string) => void;
    directResolution: DirectResolution;
    setDirectResolution: (r: DirectResolution) => void;
    directAspectRatio: DirectAspectRatio;
    setDirectAspectRatio: (r: DirectAspectRatio) => void;
    directLayoutMode: 'Individual' | 'Grid';
    setDirectLayoutMode: (m: 'Individual' | 'Grid') => void;
    directShotCount: number;
    setDirectShotCount: (n: number) => void;
    directShotCountEffective: number;
    directIncludeThoughts: boolean;
    setDirectIncludeThoughts: (b: boolean) => void;
    directSeedRaw: string;
    setDirectSeedRaw: (s: string) => void;
    directTemperatureRaw: string;
    setDirectTemperatureRaw: (s: string) => void;
    selectedStyleId: string;
    setSelectedStyleId: (id: string) => void;
    selectedPoseIds: string[];
    setSelectedPoseIds: (ids: string[] | ((prev: string[]) => string[])) => void;
    selectedFaceIds: string[];
    setSelectedFaceIds: (ids: string[]) => void;

    // Status & Actions
    totalCost: number;
    balance: number;
    canStart: boolean;
    isRunning: boolean;
    isCreatingTasks: boolean;
    directPaused: boolean;
    onStart: () => void;
}

export function BatchConfigPanel(props: BatchConfigPanelProps) {
    const {
        mode, setMode,
        historyItems, presetId, setPresetId, preset,
        legacyFaceRefFiles, setLegacyFaceRefFiles, legacyFaceRefUrls, setLegacyFaceRefUrls,
        legacyStyleRefFiles, setLegacyStyleRefFiles, legacyStyleRefUrls, setLegacyStyleRefUrls,
        directPrompt, setDirectPrompt, directResolution, setDirectResolution,
        directAspectRatio, setDirectAspectRatio, directLayoutMode, setDirectLayoutMode,
        setDirectShotCount, directShotCountEffective,
        directIncludeThoughts, setDirectIncludeThoughts, directSeedRaw, setDirectSeedRaw,
        directTemperatureRaw, setDirectTemperatureRaw,
        selectedStyleId, setSelectedStyleId, selectedPoseIds, setSelectedPoseIds, selectedFaceIds, setSelectedFaceIds,
        totalCost, balance, canStart, isRunning, isCreatingTasks, directPaused, onStart
    } = props;

    const stylePresetsAll = useStylePresetStore((s) => s.presets);
    const posePresetsAll = usePosePresetStore((s) => s.presets);

    // UI States
    const [faceDialogOpen, setFaceDialogOpen] = React.useState(false);
    const [showAdvanced, setShowAdvanced] = React.useState(false);

    const togglePoseSelect = (id: string) => {
        const safeId = String(id || '').trim();
        if (!safeId) return;
        setSelectedPoseIds((prev) => {
            const exists = prev.includes(safeId);
            if (exists) return prev.filter((x) => x !== safeId);
            if (prev.length >= MAX_POSE_SELECT) {
                alert(`最多选择 ${MAX_POSE_SELECT} 个姿势`);
                return prev;
            }
            return [...prev, safeId];
        });
    };

    return (
        <div className="space-y-5 pb-20">
            {/* Mode Selection */}
            <div className="space-y-1">
                <label className="text-[10px] font-bold text-white/40 uppercase tracking-wider pl-1">工作模式 (Mode)</label>
                <div className="p-1 bg-black/20 rounded-xl border border-white/5 flex gap-1">
                    <button
                        onClick={() => setMode('legacy')}
                        className={`flex-1 py-2 rounded-lg text-xs font-bold transition-all ${mode === 'legacy' ? 'bg-white/10 text-white shadow-sm' : 'text-white/40 hover:text-white/60'}`}
                    >
                        经典模式 (Legacy)
                    </button>
                    <button
                        onClick={() => setMode('direct')}
                        className={`flex-1 py-2 rounded-lg text-xs font-bold transition-all ${mode === 'direct' ? 'bg-white/10 text-white shadow-sm' : 'text-white/40 hover:text-white/60'}`}
                    >
                        直接生成 (Direct)
                    </button>
                </div>
            </div>

            {/* Cost Estimate - Compact */}
            <div className="rounded-xl bg-gradient-to-r from-violet-500/10 to-fuchsia-500/10 border border-white/5 p-3 flex items-center justify-between">
                <div>
                    <div className="text-[10px] text-white/40 mb-0.5">预估消耗 (Est. Cost)</div>
                    <div className="text-lg font-black text-white">{totalCost}</div>
                </div>
                <div className="text-right">
                    <div className="text-[10px] text-white/40 mb-0.5">余额 (Balance)</div>
                    <div className={`text-sm font-bold font-mono ${balance < totalCost ? 'text-rose-400' : 'text-emerald-400'}`}>
                        {balance}
                    </div>
                </div>
            </div>

            {mode === 'legacy' ? (
                <div className="space-y-5 animate-in fade-in slide-in-from-left-2 duration-300">
                    <div className="space-y-2">
                        <label className="text-[10px] font-bold text-white/40 uppercase pl-1">预设模版 (Preset)</label>
                        <Select value={presetId} onValueChange={setPresetId}>
                            <SelectTrigger className="w-full h-10 bg-white/5 border-white/10 text-white text-xs hover:bg-white/10 transition-colors">
                                <SelectValue placeholder={historyItems.length ? '请选择一个预设...' : '暂无可用预设'} />
                            </SelectTrigger>
                            <SelectContent className="bg-slate-900 border-white/10 text-white max-h-[300px]">
                                {historyItems.map((h) => (
                                    <SelectItem key={h.id} value={h.id} className="text-xs">
                                        {(h.name || h.requirements || 'Untitled').slice(0, 30)}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                        {preset ? (
                            <div className="px-3 py-2 rounded-lg bg-white/5 border border-white/5 text-[10px] text-white/60 space-y-1">
                                <div className="flex justify-between"><span>尺寸: {preset.resolution}</span><span>{preset.aspectRatio}</span></div>
                                <div className="flex justify-between"><span>张数: {preset.shotCount}</span><span>{preset.layoutMode}</span></div>
                            </div>
                        ) : null}
                    </div>

                    <div className="space-y-4 pt-4 border-t border-white/5">
                        <ReferenceUploadStrip
                            label="人脸参考图 (Face Ref)"
                            files={legacyFaceRefFiles}
                            urls={legacyFaceRefUrls}
                            onChangeFiles={setLegacyFaceRefFiles}
                            onRemoveUrl={(url) => setLegacyFaceRefUrls((prev) => prev.filter((v) => v !== url))}
                            disabled={isRunning || isCreatingTasks}
                            hint="用于保持人物一致性"
                        />
                        <ReferenceUploadStrip
                            label="风格参考图 (Style Ref)"
                            files={legacyStyleRefFiles}
                            urls={legacyStyleRefUrls}
                            onChangeFiles={setLegacyStyleRefFiles}
                            onRemoveUrl={(url) => setLegacyStyleRefUrls((prev) => prev.filter((v) => v !== url))}
                            maxFiles={MAX_STYLE_REF_IMAGES}
                            disabled={isRunning || isCreatingTasks}
                            hint="仅提取风格，不影响人物"
                        />
                    </div>
                </div>
            ) : (
                <div className="space-y-5 animate-in fade-in slide-in-from-right-2 duration-300">
                    {/* Prompt */}
                    <div className="space-y-2">
                        <label className="text-[10px] font-bold text-white/40 uppercase pl-1">提示词 (Prompt)</label>
                        <Textarea
                            value={directPrompt}
                            onChange={(e) => setDirectPrompt(e.target.value)}
                            className="bg-white/5 border-white/10 text-white min-h-[100px] text-xs resize-none focus:bg-white/10 transition-colors rounded-xl"
                            placeholder="请描述你想要生成的画面内容..."
                        />
                    </div>

                    {/* Basic Settings Grid */}
                    <div className="grid grid-cols-2 gap-3">
                        <div className="space-y-1">
                            <label className="text-[10px] font-bold text-white/40 uppercase pl-1">分辨率 (Size)</label>
                            <Select value={directResolution} onValueChange={(v) => isDirectResolution(v) && setDirectResolution(v)}>
                                <SelectTrigger className="h-9 bg-white/5 border-white/10 text-white text-xs"><SelectValue /></SelectTrigger>
                                <SelectContent className="bg-slate-900 border-white/10 text-white">{DIRECT_RESOLUTION_OPTIONS.map(v => <SelectItem key={v} value={v}>{v}</SelectItem>)}</SelectContent>
                            </Select>
                        </div>
                        <div className="space-y-1">
                            <label className="text-[10px] font-bold text-white/40 uppercase pl-1">比例 (Ratio)</label>
                            <Select value={directAspectRatio} onValueChange={(v) => isDirectAspectRatio(v) && setDirectAspectRatio(v)}>
                                <SelectTrigger className="h-9 bg-white/5 border-white/10 text-white text-xs"><SelectValue /></SelectTrigger>
                                <SelectContent className="bg-slate-900 border-white/10 text-white">{DIRECT_ASPECT_RATIO_OPTIONS.map(v => <SelectItem key={v} value={v}>{v}</SelectItem>)}</SelectContent>
                            </Select>
                        </div>
                    </div>

                    {/* Style & Face Section - Cleaned up */}
                    <div className="space-y-2 pt-2 border-t border-white/5">
                        <label className="text-[10px] font-bold text-white/40 uppercase pl-1">风格预设 (Style Preset)</label>
                        <Select value={selectedStyleId} onValueChange={setSelectedStyleId}>
                            <SelectTrigger className="h-10 bg-white/5 border-white/10 text-white text-xs"><SelectValue /></SelectTrigger>
                            <SelectContent className="bg-slate-900 border-white/10 text-white">
                                <SelectItem value={DIRECT_STYLE_NONE}>不使用 (None)</SelectItem>
                                {stylePresetsAll.filter(s => s.kind !== 'POSE').map(s => (
                                    <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>

                    <div className="space-y-2">
                        <div className="flex items-center justify-between">
                            <label className="text-[10px] font-bold text-white/40 uppercase pl-1">模特选择 ({selectedFaceIds.length}/3)</label>
                            <button
                                className="h-5 text-[10px] text-pink-300 hover:text-pink-200 px-2 font-medium transition-colors"
                                onClick={() => setFaceDialogOpen(true)}
                            >
                                选择 (Select)
                            </button>
                        </div>
                        <div className="flex gap-2 flex-wrap min-h-[32px] p-1.5 rounded-lg bg-black/20 border border-white/5">
                            {selectedFaceIds.length === 0 ? <span className="text-[10px] text-white/20 pl-1">未选择模特</span> : selectedFaceIds.map(id => (
                                <Badge key={id} className="px-1.5 py-0 text-[9px] bg-white/10 hover:bg-white/20 text-white/70 border-0 font-normal">
                                    {id.slice(0, 8)}
                                </Badge>
                            ))}
                        </div>
                    </div>

                    {/* Collapsible Advanced Options */}
                    <div className="pt-2 border-t border-white/5">
                        <button
                            onClick={() => setShowAdvanced(!showAdvanced)}
                            className="w-full flex items-center justify-between text-[10px] font-bold text-white/40 uppercase hover:text-white/60 transition-colors py-2"
                        >
                            <span>高级设置 (Advanced)</span>
                            <ChevronDown className={`w-3 h-3 transition-transform ${showAdvanced ? 'rotate-180' : ''}`} />
                        </button>

                        {showAdvanced && (
                            <div className="space-y-4 pt-2 animate-in slide-in-from-top-2 fade-in duration-200">
                                <div className="space-y-1">
                                    <label className="text-[10px] font-bold text-white/40 uppercase pl-1">生成数量 (Count)</label>
                                    <div className="flex items-center gap-2">
                                        <Select value={directLayoutMode} onValueChange={(v) => setDirectLayoutMode(v as 'Individual' | 'Grid')}>
                                            <SelectTrigger className="h-8 flex-1 bg-white/5 border-white/10 text-white text-[10px]"><SelectValue /></SelectTrigger>
                                            <SelectContent className="bg-slate-900 border-white/10 text-white">
                                                <SelectItem value="Individual">单张独立生成 (Individual)</SelectItem>
                                                <SelectItem value="Grid">拼图模式 (Grid)</SelectItem>
                                            </SelectContent>
                                        </Select>
                                        <Input
                                            type="number" min={1} max={MAX_DIRECT_SHOTS}
                                            value={String(directShotCountEffective)}
                                            onChange={(e) => {
                                                const v = Number(e.target.value);
                                                if (Number.isFinite(v)) setDirectShotCount(Math.max(1, Math.min(MAX_DIRECT_SHOTS, Math.floor(v))));
                                            }}
                                            disabled={directLayoutMode === 'Grid'}
                                            className="h-8 w-16 bg-white/5 border-white/10 text-white text-xs text-center"
                                        />
                                    </div>
                                </div>

                                <div className="grid grid-cols-2 gap-3">
                                    <div className="space-y-1">
                                        <label className="text-[10px] font-bold text-white/40 uppercase pl-1">随机种子 (Seed)</label>
                                        <Input value={directSeedRaw} onChange={e => setDirectSeedRaw(e.target.value)} placeholder="随机 (Random)" className="h-8 bg-white/5 border-white/10 text-white text-[10px]" />
                                    </div>
                                    <div className="space-y-1">
                                        <label className="text-[10px] font-bold text-white/40 uppercase pl-1">多样性 (Temp)</label>
                                        <Input value={directTemperatureRaw} onChange={e => setDirectTemperatureRaw(e.target.value)} placeholder="默认 (Default)" className="h-8 bg-white/5 border-white/10 text-white text-[10px]" />
                                    </div>
                                </div>

                                <div className="flex items-center justify-between px-2 py-1.5 rounded-lg bg-white/5 border border-white/5">
                                    <span className="text-[10px] text-white/60">包含思考过程 (Thought Chain)</span>
                                    <Switch checked={directIncludeThoughts} onCheckedChange={setDirectIncludeThoughts} className="h-4 w-7" />
                                </div>
                            </div>
                        )}
                    </div>

                    <div className="space-y-1">
                        <label className="text-xs font-bold text-white/80">姿势 ({selectedPoseIds.length}/{MAX_POSE_SELECT})</label>
                        <div className="max-h-[120px] overflow-y-auto rounded-xl border border-white/10 bg-black/20 p-1 space-y-0.5 scrollbar-none">
                            {posePresetsAll.map(p => {
                                const active = selectedPoseIds.includes(p.id);
                                return (
                                    <button
                                        key={p.id}
                                        type="button"
                                        onClick={() => togglePoseSelect(p.id)}
                                        className={`w-full text-left px-2 py-1.5 rounded-lg text-[10px] transition-colors flex items-center justify-between ${active ? 'bg-purple-500/30 text-white' : 'text-white/60 hover:bg-white/5'}`}
                                    >
                                        <span className="truncate">{p.name}</span>
                                        {active && <div className="w-1.5 h-1.5 rounded-full bg-purple-400" />}
                                    </button>
                                )
                            })}
                        </div>
                    </div>

                    <Dialog open={faceDialogOpen} onOpenChange={setFaceDialogOpen}>
                        <DialogContent className="max-w-4xl bg-[#1a1a2e] border-white/10 text-white">
                            <DialogHeader>
                                <DialogTitle>选择模特</DialogTitle>
                            </DialogHeader>
                            <FacePresetSelector selectedIds={selectedFaceIds} onSelect={setSelectedFaceIds} maxSelection={3} />
                        </DialogContent>
                    </Dialog>
                </div>
            )}

            {/* Start Button Area - Always Sticky at Bottom of Config Panel */}
            <div className="p-4 bg-black/60 backdrop-blur-xl border-t border-white/10 sticky bottom-0 z-20 -mx-5 -mb-5 mt-auto">
                <Button
                    className={`w-full font-bold text-md rounded-xl shadow-lg shadow-purple-500/20 transition-all duration-300 ${!canStart
                        ? 'bg-white/5 text-white/30 cursor-not-allowed hover:bg-white/5'
                        : 'bg-gradient-to-r from-violet-600 to-fuchsia-600 hover:from-violet-500 hover:to-fuchsia-500 hover:shadow-purple-500/40 hover:scale-[1.02] active:scale-[0.98]'
                        }`}
                    onClick={onStart}
                    disabled={!canStart}
                >
                    {isRunning ? (
                        <>
                            <Loader2 className="w-5 h-5 mr-2 animate-spin" />
                            执行中...
                        </>
                    ) : (
                        <>
                            <Play className="w-5 h-5 mr-2 fill-current" />
                            {mode === 'direct' && directPaused ? '继续执行' : '开始执行'}
                        </>
                    )}
                </Button>
                {isCreatingTasks && (
                    <div className="mt-2 text-center text-[10px] text-orange-300 animate-pulse">
                        正在创建任务，请勿关闭...
                    </div>
                )}
            </div>
        </div>
    );
}
