'use client';

import * as React from 'react';
import { Layers, Loader2, Play, Images, Settings2, Info } from 'lucide-react';
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
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
    Popover,
    PopoverContent,
    PopoverTrigger,
} from '@/components/ui/popover';
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
} from '@/components/ui/dialog';

import { useStylePresetStore } from '@/store/style-preset-store';
import { usePosePresetStore } from '@/store/pose-preset-store';
import { useFacePresetStore } from '@/store/face-preset-store';
import { FacePresetSelector } from '@/components/face-preset-selector';
import { type FormHistoryItem, useFormHistory } from '@/hooks/useFormHistory';

import {
    BatchMode,
    DirectResolution,
    DirectAspectRatio,
    DIRECT_STYLE_NONE,
    DIRECT_RESOLUTION_OPTIONS,
    DIRECT_ASPECT_RATIO_OPTIONS,
    MAX_POSE_SELECT,
    MAX_DIRECT_SHOTS,
    MAX_TOTAL_REF_IMAGES,
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
    presetId: string;
    setPresetId: (id: string) => void;
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
        mode, setMode, parallel, setParallel, autoApprove, setAutoApprove,
        presetId, setPresetId,
        legacyFaceRefFiles, setLegacyFaceRefFiles, legacyFaceRefUrls, setLegacyFaceRefUrls,
        legacyStyleRefFiles, setLegacyStyleRefFiles, legacyStyleRefUrls, setLegacyStyleRefUrls,
        legacyMaxGarmentsPerGroup, legacyReservedRefs,
        directPrompt, setDirectPrompt, directResolution, setDirectResolution,
        directAspectRatio, setDirectAspectRatio, directLayoutMode, setDirectLayoutMode,
        directShotCount, setDirectShotCount, directShotCountEffective,
        directIncludeThoughts, setDirectIncludeThoughts, directSeedRaw, setDirectSeedRaw,
        directTemperatureRaw, setDirectTemperatureRaw,
        selectedStyleId, setSelectedStyleId, selectedPoseIds, setSelectedPoseIds, selectedFaceIds, setSelectedFaceIds,
        totalCost, balance, canStart, isRunning, isCreatingTasks, directPaused, onStart
    } = props;

    const { historyItems } = useFormHistory();
    const stylePresetsAll = useStylePresetStore((s) => s.presets);
    const posePresetsAll = usePosePresetStore((s) => s.presets);
    // facePresets are fetched in parent or hook, referenced here for selection logic

    const [faceDialogOpen, setFaceDialogOpen] = React.useState(false);

    const preset = React.useMemo(
        () => historyItems.find((h) => h.id === presetId),
        [historyItems, presetId],
    );

    const togglePoseSelect = (id: string) => {
        const safeId = String(id || '').trim();
        if (!safeId) return;
        setSelectedPoseIds((prev) => {
            const exists = prev.includes(safeId);
            if (exists) return prev.filter((x) => x !== safeId);
            // We don't show toast here to avoid UI clutter, just limit
            if (prev.length >= MAX_POSE_SELECT) return prev;
            return [...prev, safeId];
        });
    };

    return (
        <aside className="lg:sticky lg:top-4 h-fit max-h-[calc(100vh-2rem)] overflow-y-auto rounded-3xl border border-white/10 bg-black/40 backdrop-blur-xl shadow-2xl flex flex-col scrollbar-thin scrollbar-thumb-white/10 scrollbar-track-transparent">
            {/* Header Area */}
            <div className="p-5 border-b border-white/10 bg-white/5 backdrop-blur-md sticky top-0 z-10">
                <div className="flex items-center justify-between mb-4">
                    <h2 className="text-xl font-black text-white tracking-tight flex items-center gap-2">
                        <Settings2 className="w-5 h-5 text-pink-400" />
                        配置面板
                    </h2>
                    <Badge variant="outline" className="border-white/20 text-white/60 font-mono text-xs">v2.0</Badge>
                </div>

                <div className="space-y-3">
                    <div className="space-y-1">
                        <label className="text-xs font-bold text-white/50 uppercase tracking-wider">当前模式</label>
                        <Select
                            value={mode}
                            onValueChange={(v) => setMode(v as BatchMode)}
                        >
                            <SelectTrigger className="h-11 bg-white/5 border-white/10 text-white font-bold hover:bg-white/10 transition-colors">
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="legacy">Legacy (规划+出图)</SelectItem>
                                <SelectItem value="direct">Direct (直出图批量)</SelectItem>
                            </SelectContent>
                        </Select>
                    </div>
                </div>
            </div>

            {/* Scrollable Content */}
            <div className="p-5 space-y-8 flex-1">

                {/* Cost Estimate Card */}
                <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-violet-500/20 to-fuchsia-500/20 border border-white/10 p-4 group">
                    <div className="absolute inset-0 bg-white/5 opacity-0 group-hover:opacity-100 transition-opacity" />
                    <div className="relative z-10 flex items-center justify-between">
                        <div>
                            <div className="text-xs text-white/60 mb-1 flex items-center gap-1">
                                <Images className="w-3 h-3" /> 预计消耗
                            </div>
                            <div className="text-2xl font-black text-white tracking-tighter tabular-nums text-transparent bg-clip-text bg-gradient-to-r from-white to-white/70">
                                {totalCost} <span className="text-sm font-bold text-white/40">积分</span>
                            </div>
                        </div>
                        <div className="text-right">
                            <div className="text-xs text-white/60 mb-1">当前余额</div>
                            <div className={`text-sm font-bold font-mono ${balance < totalCost ? 'text-rose-400' : 'text-emerald-400'}`}>
                                {balance}
                            </div>
                        </div>
                    </div>
                </div>

                {/* Mode Specific Config */}
                {mode === 'legacy' ? (
                    <div className="space-y-6 animate-in fade-in slide-in-from-left-4 duration-500">
                        <div className="space-y-2">
                            <div className="flex items-center justify-between">
                                <label className="text-xs font-bold text-white/80">配置预设 (必选)</label>
                                {preset && (
                                    <Popover>
                                        <PopoverTrigger>
                                            <Info className="w-3.5 h-3.5 text-white/40 hover:text-white/80 transition-colors" />
                                        </PopoverTrigger>
                                        <PopoverContent className="w-64 text-xs bg-black/90 border-white/10 text-white/80 backdrop-blur-xl">
                                            <div className="space-y-1">
                                                <div className="font-bold text-white">{preset.name}</div>
                                                <div>尺寸: {preset.resolution} ({preset.aspectRatio})</div>
                                                <div>模式: {preset.layoutMode}</div>
                                                <div>张数: {preset.shotCount}</div>
                                                {!!preset.requirements && <div className="text-white/50 border-t border-white/10 pt-1 mt-1">{preset.requirements}</div>}
                                            </div>
                                        </PopoverContent>
                                    </Popover>
                                )}
                            </div>
                            <Select value={presetId} onValueChange={setPresetId}>
                                <SelectTrigger className="w-full bg-black/20 border-white/10 text-white">
                                    <SelectValue placeholder={historyItems.length ? '选择预设...' : '无可用预设'} />
                                </SelectTrigger>
                                <SelectContent>
                                    {historyItems.map((h) => (
                                        <SelectItem key={h.id} value={h.id}>
                                            {(h.name || h.requirements || '未命名').slice(0, 30)}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>

                        <div className="space-y-3">
                            <div className="flex items-center justify-between">
                                <label className="text-xs font-bold text-white/80">并发数量</label>
                                <div className="flex bg-black/20 rounded-lg p-0.5 border border-white/10">
                                    {[1, 2, 3].map(n => (
                                        <button
                                            key={n}
                                            onClick={() => setParallel(n)}
                                            className={`px-3 py-1 rounded-md text-xs font-bold transition-all ${parallel === n ? 'bg-white/20 text-white shadow-sm' : 'text-white/40 hover:text-white/70'}`}
                                        >
                                            {n}
                                        </button>
                                    ))}
                                </div>
                            </div>

                            <div className="flex items-center justify-between px-3 py-2 bg-black/20 rounded-xl border border-white/10">
                                <span className="text-xs text-white/70">无需审核直接出图</span>
                                <Switch checked={autoApprove} onCheckedChange={setAutoApprove} className="data-[state=checked]:bg-emerald-500" />
                            </div>
                        </div>

                        <div className="border-t border-white/10 pt-4 space-y-4">
                            <div className="flex items-center justify-between">
                                <h3 className="text-sm font-bold text-white/90">全局参考图</h3>
                                <span className="text-[10px] text-white/40">全场共用</span>
                            </div>
                            <ReferenceUploadStrip
                                label="人脸参考 (Face)"
                                files={legacyFaceRefFiles}
                                urls={legacyFaceRefUrls}
                                onChangeFiles={setLegacyFaceRefFiles}
                                onRemoveUrl={(url) => setLegacyFaceRefUrls((prev) => prev.filter((v) => v !== url))}
                                disabled={isRunning || isCreatingTasks}
                                hint="人物特征参考"
                            />
                            <ReferenceUploadStrip
                                label="风格参考 (Style)"
                                files={legacyStyleRefFiles}
                                urls={legacyStyleRefUrls}
                                onChangeFiles={setLegacyStyleRefFiles}
                                onRemoveUrl={(url) => setLegacyStyleRefUrls((prev) => prev.filter((v) => v !== url))}
                                maxFiles={MAX_STYLE_REF_IMAGES}
                                disabled={isRunning || isCreatingTasks}
                            />
                        </div>
                    </div>
                ) : (
                    <div className="space-y-6 animate-in fade-in slide-in-from-right-4 duration-500">
                        <div className="space-y-2">
                            <label className="text-xs font-bold text-white/80">提示词 (Prompt)</label>
                            <Textarea
                                value={directPrompt}
                                onChange={(e) => setDirectPrompt(e.target.value)}
                                className="bg-black/20 border-white/10 text-white min-h-[100px] text-xs resize-none focus:bg-black/40 transition-colors"
                                placeholder="描述画面内容、灯光、氛围..."
                            />
                        </div>

                        <div className="grid grid-cols-2 gap-3">
                            <div className="space-y-1">
                                <label className="text-[10px] font-bold text-white/60 uppercase">尺寸</label>
                                <Select value={directResolution} onValueChange={(v) => isDirectResolution(v) && setDirectResolution(v)}>
                                    <SelectTrigger className="h-9 bg-black/20 border-white/10 text-white text-xs"><SelectValue /></SelectTrigger>
                                    <SelectContent>{DIRECT_RESOLUTION_OPTIONS.map(v => <SelectItem key={v} value={v}>{v}</SelectItem>)}</SelectContent>
                                </Select>
                            </div>
                            <div className="space-y-1">
                                <label className="text-[10px] font-bold text-white/60 uppercase">比例</label>
                                <Select value={directAspectRatio} onValueChange={(v) => isDirectAspectRatio(v) && setDirectAspectRatio(v)}>
                                    <SelectTrigger className="h-9 bg-black/20 border-white/10 text-white text-xs"><SelectValue /></SelectTrigger>
                                    <SelectContent>{DIRECT_ASPECT_RATIO_OPTIONS.map(v => <SelectItem key={v} value={v}>{v}</SelectItem>)}</SelectContent>
                                </Select>
                            </div>
                        </div>

                        <div className="space-y-2">
                            <label className="text-[10px] font-bold text-white/60 uppercase">出图数量 ({directLayoutMode === 'Grid' ? '拼图固定1张' : directShotCountEffective})</label>
                            <div className="flex items-center gap-2">
                                <Select value={directLayoutMode} onValueChange={(v) => setDirectLayoutMode(v as 'Individual' | 'Grid')}>
                                    <SelectTrigger className="h-9 w-24 bg-black/20 border-white/10 text-white text-xs"><SelectValue /></SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="Individual">单图</SelectItem>
                                        <SelectItem value="Grid">拼图</SelectItem>
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
                                    className="h-9 bg-black/20 border-white/10 text-white text-xs"
                                />
                            </div>
                        </div>

                        <div className="space-y-1 pt-2 border-t border-white/10">
                            <label className="text-xs font-bold text-white/80">风格预设</label>
                            <Select value={selectedStyleId} onValueChange={setSelectedStyleId}>
                                <SelectTrigger className="h-9 bg-black/20 border-white/10 text-white text-xs"><SelectValue /></SelectTrigger>
                                <SelectContent>
                                    <SelectItem value={DIRECT_STYLE_NONE}>不选 (默认)</SelectItem>
                                    {stylePresetsAll.filter(s => s.kind !== 'POSE').map(s => (
                                        <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>

                        <div className="space-y-1">
                            <div className="flex items-center justify-between">
                                <label className="text-xs font-bold text-white/80">模特 ({selectedFaceIds.length}/3)</label>
                                <Button variant="ghost" size="sm" className="h-6 text-[10px] text-pink-300 hover:text-pink-200" onClick={() => setFaceDialogOpen(true)}>
                                    选择
                                </Button>
                            </div>
                            <div className="flex gap-1 flex-wrap">
                                {selectedFaceIds.length === 0 ? <div className="text-[10px] text-white/30 italic">未选择</div> : selectedFaceIds.map(id => (
                                    <Badge key={id} variant="secondary" className="px-1.5 py-0 text-[10px] bg-white/10 hover:bg-white/20 text-white/80 border-0">
                                        {id.slice(0, 6)}
                                    </Badge>
                                ))}
                            </div>
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
            </div>

            {/* Start Button Area - Always Sticky at Bottom of Config Panel */}
            <div className="p-4 bg-black/60 backdrop-blur-xl border-t border-white/10 sticky bottom-0 z-20">
                <Button
                    size="lg"
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
        </aside>
    );
}
